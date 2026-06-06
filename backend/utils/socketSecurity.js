// ─────────────────────────────────────────────────────────────
//  IMAP – Socket.io enterprise security helpers
//
//  - authenticateSocket: strict JWT verification at connection time.
//    Rejects missing / invalid / expired tokens and inactive users.
//  - canAccessBooking: a user may only touch a booking room if they are
//    the booking's customer, its assigned provider, or an admin.
//  - createRateLimiter: simple fixed-window per-socket event limiter.
// ─────────────────────────────────────────────────────────────
const jwt = require("jsonwebtoken");

/**
 * Connection middleware. Verifies the JWT, loads the (active) user, and
 * attaches { id, role, name } to socket.user. Calls next(err) to reject.
 * @param {import('mysql2/promise').Pool} pool
 */
async function authenticateSocket(pool, socket, next) {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Authentication required"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.query(
      "SELECT id, name, role, is_active FROM users WHERE id = ?",
      [decoded.id]
    );
    if (!rows.length || !rows[0].is_active) {
      return next(new Error("User not found or inactive"));
    }
    socket.user = { id: rows[0].id, role: rows[0].role, name: rows[0].name };
    return next();
  } catch {
    return next(new Error("Invalid or expired token"));
  }
}

/**
 * True only if `user` may access booking `bookingId`
 * (customer, assigned provider, or admin).
 * @param {import('mysql2/promise').Pool} pool
 */
async function canAccessBooking(pool, user, bookingId) {
  if (!user || !bookingId) return false;
  if (user.role === "admin") return true;
  const [rows] = await pool.query(
    `SELECT b.customer_id, p.user_id AS provider_user_id
       FROM bookings b
       LEFT JOIN providers p ON p.id = b.provider_id
      WHERE b.id = ? LIMIT 1`,
    [bookingId]
  );
  if (!rows.length) return false;
  const { customer_id, provider_user_id } = rows[0];
  return String(user.id) === String(customer_id) ||
         String(user.id) === String(provider_user_id);
}

/**
 * Fixed-window per-socket rate limiter. Returns a function `(socket) => boolean`
 * that is true while under the limit and false once the window budget is spent.
 */
function createRateLimiter({ points = 40, windowMs = 10_000 } = {}) {
  return (socket) => {
    const now = Date.now();
    if (!socket._rl || now - socket._rl.start > windowMs) {
      socket._rl = { start: now, count: 0 };
    }
    socket._rl.count += 1;
    return socket._rl.count <= points;
  };
}

/** Validate a bookingId payload value (non-empty string, bounded length). */
function isValidBookingId(v) {
  return typeof v === "string" && v.length > 0 && v.length <= 64;
}

module.exports = { authenticateSocket, canAccessBooking, createRateLimiter, isValidBookingId };
