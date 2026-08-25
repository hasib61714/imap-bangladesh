/**
 * Socket helpers — what is left after the duplicates were removed
 *
 * WHY THIS FILE SHRANK
 * ────────────────────
 * It used to carry its own `authenticateSocket` and its own
 * `canAccessBooking`, and neither was the one the server ran. `server.js`
 * authenticates in its own `io.use`, and `realtime.js` decides room access
 * through `utils/bookingAccess.getParticipation`. So there were two
 * implementations of each question, one of them live.
 *
 * The unused copy of `canAccessBooking` still contained the line I-04 was
 * written to remove:
 *
 *     if (user.role === "admin") return true;
 *
 * — an authorization decision taken from a JWT role claim, outside the
 * kernel, in a file whose tests passed because they tested the copy nobody
 * called. `realtime.js:24` records that the live path stopped doing this.
 * The architecture test in `test/i04-authorization-boundary.test.js` is what
 * caught it.
 *
 * `canAccessBooking` now delegates rather than deciding, so there is one
 * answer to "may this user touch this booking" and the kernel gives it.
 * `authenticateSocket` is gone entirely: `server.js` pins the algorithm
 * (I-03 §16) and this copy did not.
 */
const { getParticipation } = require("./bookingAccess");

/**
 * True only if `user` may access booking `bookingId`.
 *
 * The relationship — customer, assigned provider, or someone the kernel's
 * `booking.observe` policy admits — is resolved in exactly one place.
 *
 * @param {import('mysql2/promise').Pool} pool
 */
async function canAccessBooking(pool, user, bookingId) {
  if (!user || !bookingId) return false;
  const part = await getParticipation(bookingId, user, { db: pool });
  return part.allowed;
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

module.exports = { canAccessBooking, createRateLimiter, isValidBookingId };
