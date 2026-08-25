/**
 * `utils/socketSecurity` — after the duplicate implementations were removed
 *
 * WHY THIS FILE WAS REWRITTEN
 * ───────────────────────────
 * It used to test two functions that are gone, and the reason they are gone
 * is the reason this file is worth reading.
 *
 *   authenticateSocket   a second JWT verifier. `server.js` does the real one
 *                        and pins the algorithm (I-03 §16); this copy did not.
 *
 *   canAccessBooking     a second authorization decision, containing the exact
 *                        line I-04 removed from the live path:
 *
 *                            if (user.role === "admin") return true;
 *
 *                        — a role claim out of a JWT, trusted directly. The
 *                        tests here passed the whole time, because they tested
 *                        the copy the server never called.
 *
 * That is the failure mode worth naming: duplicated security logic where only
 * one copy is wired means the tests can be green and the property still false.
 * `canAccessBooking` now delegates to `utils/bookingAccess.getParticipation`,
 * so what these tests exercise is what the server runs.
 */
// `utils/bookingAccess` requires `../db` at load time, and db.js refuses to
// initialise a development process against the production host (V-01). Set a
// test environment BEFORE that require — dotenv does not override variables
// that are already present. No connection is opened: the pool is lazy and
// every call below passes its own fake.
process.env.APP_ENV      = process.env.APP_ENV      || "test";
process.env.DATABASE_ENV = process.env.DATABASE_ENV || "test";
process.env.JWT_SECRET   = process.env.JWT_SECRET   || "test-secret";
process.env.DB_HOST      = process.env.DB_HOST      || "127.0.0.1";
process.env.DB_NAME      = process.env.DB_NAME      || "imap_test";

const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { canAccessBooking, createRateLimiter, isValidBookingId } = require("../utils/socketSecurity");

/**
 * A pool that answers the participation query with one booking row.
 * `getParticipation` runs the kernel against it, so this exercises the real
 * policy rather than a stub of it.
 */
const BOOKING = { id: "b1", customer_id: "cust-1", provider_user_id: "prov-1", status: "confirmed" };
const fakePool = (row) => ({
  query: async (sql) => {
    if (/FROM\s+bookings/i.test(sql)) return [row ? [{ ...row }] : []];
    return [[]];
  },
});

test("the booking's customer may access it", async () => {
  assert.equal(
    await canAccessBooking(fakePool(BOOKING), { id: "cust-1", role: "customer", is_active: 1 }, "b1"),
    true);
});

test("the assigned provider may access it", async () => {
  assert.equal(
    await canAccessBooking(fakePool(BOOKING), { id: "prov-1", role: "provider", is_active: 1 }, "b1"),
    true);
});

test("an unrelated customer or provider may not access someone else's booking", async () => {
  for (const role of ["customer", "provider"]) {
    assert.equal(
      await canAccessBooking(fakePool(BOOKING), { id: "intruder", role, is_active: 1 }, "b1"),
      false, `role=${role} must not grant access to someone else's booking`);
  }
});

test("an administrator is admitted by the policy, not by a hardcoded check", async () => {
  // The answer is the same as the old module's — true — and that is the point
  // worth being precise about. What changed is WHERE it is decided.
  //
  // The old line was `if (user.role === "admin") return true;` inside this
  // file: unreviewable, unloggable, and impossible to narrow without editing
  // socket code. It is now `booking.observe` in the kernel, which is the same
  // question `GET /api/bookings/:id` asks. When administrator observation is
  // narrowed, this follows without being touched.
  //
  // The caller's separate obligation is to pass an identity the DATABASE
  // confirmed rather than one a token asserted — see `realtime.verifiedUser`
  // and the stale-claim tests in test/p0-realtime-sos.test.js.
  assert.equal(
    await canAccessBooking(fakePool(BOOKING), { id: "admin-1", role: "admin", is_active: 1 }, "b1"),
    true);
});

test("an inactive account is refused whatever its role says", async () => {
  assert.equal(
    await canAccessBooking(fakePool(BOOKING), { id: "cust-1", role: "customer", is_active: 0 }, "b1"),
    false);
  assert.equal(
    await canAccessBooking(fakePool(BOOKING), { id: "admin-1", role: "admin", is_active: 0 }, "b1"),
    false);
});

test("a missing user or booking id is refused without a query", async () => {
  const explodes = { query: async () => { throw new Error("should not query"); } };
  assert.equal(await canAccessBooking(explodes, null, "b1"), false);
  assert.equal(await canAccessBooking(explodes, { id: "cust-1" }, null), false);
});

test("a booking that does not exist is refused", async () => {
  assert.equal(
    await canAccessBooking(fakePool(null), { id: "cust-1", role: "customer", is_active: 1 }, "ghost"),
    false);
});

test("the rate limiter spends its budget and then refuses", () => {
  const limiter = createRateLimiter({ points: 3, windowMs: 10_000 });
  const socket = {};
  assert.equal(limiter(socket), true);
  assert.equal(limiter(socket), true);
  assert.equal(limiter(socket), true);
  assert.equal(limiter(socket), false, "the fourth call is over budget");
});

test("isValidBookingId bounds the payload", () => {
  assert.equal(isValidBookingId("b1"), true);
  assert.equal(isValidBookingId(""), false);
  assert.equal(isValidBookingId(null), false);
  assert.equal(isValidBookingId(42), false);
  assert.equal(isValidBookingId("x".repeat(65)), false);
});
