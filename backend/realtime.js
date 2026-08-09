/**
 * Socket.io event handlers — IMAP
 *
 * Extracted from server.js in Phase 0.5 so that the authorization rules
 * added for P0-7 (booking-room IDOR) and P0-8 (SOS PII broadcast) can be
 * tested directly. Behaviour is unchanged by the move.
 */
const logger = require("./utils/logger");
const { getParticipation } = require("./utils/bookingAccess");
const { isValidStatus } = require("./utils/bookingState");
const { authorize, ACTION } = require("./src/modules/platform/authorization");
const { legacyActorFromUser } = require("./src/modules/platform/authorization/legacy");

/** Room that receives emergency alerts. Membership is DB-verified. */
const ADMIN_ROOM = "role:admin";

/**
 * Confirm, against the database, that this socket may see the emergency
 * queue. A `role` claim inside the JWT is not sufficient: it can be stale
 * after a demotion, and it is the only thing an attacker with an old token
 * controls — so the role is re-read per connection and the decision is the
 * kernel's.
 *
 * I-04 replaced `rows[0].role === "admin"` here. The query is unchanged; what
 * changed is that admission to this room is now the same question as
 * `GET /api/sos`, answered in the same place. When the emergency queue moves
 * to a narrower role than the Gate-1 all-six grant, this follows without
 * being edited.
 *
 * The decision is NOT audited. This runs speculatively on every socket
 * connection, so recording each denial would write a row every time an
 * ordinary user opens the app — which is the access log §25 says not to
 * build. Nobody attempted anything here.
 */
async function joinAdminRoomIfPermitted(socket, pool) {
  if (!socket.user?.id) return false;
  try {
    const [rows] = await pool.query(
      "SELECT role FROM users WHERE id = ? AND is_active = 1 LIMIT 1",
      [socket.user.id]
    );
    if (!rows.length) return false;
    const actor = legacyActorFromUser({ id: socket.user.id, role: rows[0].role, is_active: 1 });
    const decision = await authorize(actor, ACTION.EMERGENCY_LIST, null, { db: pool });
    if (decision.allowed) {
      socket.join(ADMIN_ROOM);
      socket.isAdmin = true;
      return true;
    }
  } catch (e) {
    logger.warn("socket admin check failed", { err: e.message });
  }
  return false;
}

/**
 * Wire up one connected socket.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {{ pool?: object, participation?: Function }} [deps] injection point for tests
 */
function registerHandlers(io, socket, deps = {}) {
  const pool = deps.pool || require("./db");
  const participationOf = deps.participation || getParticipation;
  const uid = socket.user?.id || "guest";

  // The record of what we actually authorized. Socket.io room membership
  // alone is not trusted, because `join` can be reached from more than one
  // place; this set is written only after a participation check passes.
  socket.authorizedBookings = new Set();

  joinAdminRoomIfPermitted(socket, pool);

  // ── P0-7 ──────────────────────────────────────────────────────────
  // This previously checked only that the socket carried a valid JWT and
  // then joined the room. Any authenticated user could therefore read any
  // booking's private chat and the provider's live GPS position.
  socket.on("join_room", async (bookingId) => {
    if (!socket.user?.id) return;
    if (typeof bookingId !== "string" || !bookingId || bookingId.length > 36) return;
    try {
      const part = await participationOf(bookingId, socket.user);
      if (!part.allowed) {
        logger.warn("socket join_room denied", { userId: socket.user.id, bookingId });
        socket.emit("room_denied", { bookingId, error: "Access denied" });
        return;
      }
      socket.authorizedBookings.add(bookingId);
      socket.bookingRole = part.role;
      socket.join(`booking_${bookingId}`);
      socket.emit("room_joined", { bookingId });
      logger.debug(`${uid} joined room: booking_${bookingId} as ${part.role}`);
    } catch (e) {
      logger.warn("socket join_room failed", { err: e.message });
    }
  });

  socket.on("leave_room", (bookingId) => {
    if (typeof bookingId !== "string") return;
    socket.authorizedBookings.delete(bookingId);
    socket.leave(`booking_${bookingId}`);
  });

  /** Every data-carrying event requires a verified membership. */
  const authorized = (bookingId) =>
    !!socket.user?.id &&
    typeof bookingId === "string" &&
    socket.authorizedBookings.has(bookingId);

  socket.on("typing", ({ bookingId } = {}) => {
    if (!authorized(bookingId)) return;
    socket.to(`booking_${bookingId}`).emit("user_typing", { name: socket.user.name || "User" });
  });

  socket.on("stop_typing", ({ bookingId } = {}) => {
    if (!authorized(bookingId)) return;
    socket.to(`booking_${bookingId}`).emit("user_stop_typing");
  });

  // ── P0-7 / location privacy ───────────────────────────────────────
  // Only the assigned provider (or an admin) may publish a position, and
  // only into a room they were authorized for. Before, any authenticated
  // socket could inject coordinates into any booking's live tracking.
  socket.on("location_update", ({ bookingId, lat, lng } = {}) => {
    if (!authorized(bookingId)) return;
    if (socket.bookingRole !== "provider" && socket.bookingRole !== "admin") return;
    const safeLat = parseFloat(lat);
    const safeLng = parseFloat(lng);
    if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) return;
    if (safeLat < -90 || safeLat > 90 || safeLng < -180 || safeLng > 180) return;
    io.to(`booking_${bookingId}`).emit("provider_location", { lat: safeLat, lng: safeLng });
  });

  // Advisory only. The database is changed through
  // PATCH /api/bookings/:id/status, which enforces the state machine.
  socket.on("booking_status", ({ bookingId, status } = {}) => {
    if (!authorized(bookingId)) return;
    if (!isValidStatus(status)) return;
    io.to(`booking_${bookingId}`).emit("booking_updated", { bookingId, status });
  });

  socket.on("disconnect", () => {
    logger.debug(`Socket disconnected: ${uid}`);
  });
}

module.exports = { registerHandlers, joinAdminRoomIfPermitted, ADMIN_ROOM };
