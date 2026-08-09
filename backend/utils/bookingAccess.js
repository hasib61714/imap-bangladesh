/**
 * Booking participation lookup — IMAP
 *
 * Phase 0.5 containment for P0-7.
 *
 * The audited failure: `socket.on("join_room")` checked only that the
 * socket carried *some* valid JWT, then joined `booking_<id>`. Any
 * authenticated user could read any booking's private chat and live GPS,
 * and could inject false coordinates into someone else's tracking.
 *
 * The REST layer already had the correct check (routes/chat.js); it was
 * simply never applied to the socket layer. This module is that check,
 * extracted once so both layers agree.
 */
const pool = require("../db");

/**
 * Resolve a user's relationship to a booking.
 * @param {string} bookingId
 * @param {{id: string, role?: string}} user
 * @returns {Promise<{allowed: boolean, role: "customer"|"provider"|"admin"|null,
 *                    customerId: string|null, providerUserId: string|null}>}
 */
async function getParticipation(bookingId, user) {
  const deny = { allowed: false, role: null, customerId: null, providerUserId: null };
  if (!user?.id || !bookingId || typeof bookingId !== "string") return deny;
  // Booking ids are UUIDs; reject anything that cannot be one before touching the DB.
  if (bookingId.length > 36) return deny;

  const [rows] = await pool.query(
    `SELECT b.customer_id, p.user_id AS provider_user_id
       FROM bookings b
       LEFT JOIN providers p ON p.id = b.provider_id
      WHERE b.id = ?
      LIMIT 1`,
    [bookingId]
  );
  if (!rows.length) return deny;

  const { customer_id, provider_user_id } = rows[0];
  const uid = String(user.id);

  let role = null;
  if (uid === String(customer_id))          role = "customer";
  else if (uid === String(provider_user_id)) role = "provider";
  else if (user.role === "admin")            role = "admin";

  return {
    allowed: role !== null,
    role,
    customerId: customer_id ?? null,
    providerUserId: provider_user_id ?? null,
  };
}

/** Express-friendly variant: resolves the actor role or throws a 403/404. */
async function requireParticipation(bookingId, user) {
  const p = await getParticipation(bookingId, user);
  if (!p.customerId) {
    const e = new Error("Booking not found");
    e.status = 404;
    throw e;
  }
  if (!p.allowed) {
    const e = new Error("Access denied");
    e.status = 403;
    throw e;
  }
  return p;
}

module.exports = { getParticipation, requireParticipation };
