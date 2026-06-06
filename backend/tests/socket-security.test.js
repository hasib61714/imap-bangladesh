// Unit tests for Socket.io room authorization + rate limiting (no real DB).
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { canAccessBooking, createRateLimiter, isValidBookingId } = require("../utils/socketSecurity");

// Fake pool returning a fixed booking participant set
const fakePool = (row) => ({ query: async () => [row ? [row] : []] });
const BOOKING = { customer_id: "cust-1", provider_user_id: "prov-1" };

test("customer of the booking can access", async () => {
  assert.equal(await canAccessBooking(fakePool(BOOKING), { id: "cust-1", role: "customer" }, "b1"), true);
});

test("assigned provider can access", async () => {
  assert.equal(await canAccessBooking(fakePool(BOOKING), { id: "prov-1", role: "provider" }, "b1"), true);
});

test("admin can access any booking", async () => {
  // admin short-circuits before the query
  assert.equal(await canAccessBooking({ query: async () => { throw new Error("should not query"); } },
    { id: "x", role: "admin" }, "b1"), true);
});

test("unrelated user cannot access", async () => {
  assert.equal(await canAccessBooking(fakePool(BOOKING), { id: "intruder", role: "customer" }, "b1"), false);
});

test("missing user or booking id is denied", async () => {
  assert.equal(await canAccessBooking(fakePool(BOOKING), null, "b1"), false);
  assert.equal(await canAccessBooking(fakePool(BOOKING), { id: "cust-1" }, null), false);
});

test("nonexistent booking is denied", async () => {
  assert.equal(await canAccessBooking(fakePool(null), { id: "cust-1", role: "customer" }, "ghost"), false);
});

test("rate limiter blocks once the window budget is spent", () => {
  const limit = createRateLimiter({ points: 3, windowMs: 10_000 });
  const socket = {};
  assert.equal(limit(socket), true);
  assert.equal(limit(socket), true);
  assert.equal(limit(socket), true);
  assert.equal(limit(socket), false, "4th event in window is blocked");
});

test("booking id payload validation", () => {
  assert.equal(isValidBookingId("abc"), true);
  assert.equal(isValidBookingId(""), false);
  assert.equal(isValidBookingId(123), false);
  assert.equal(isValidBookingId("x".repeat(65)), false);
});
