/**
 * Server-side price authority — `utils/pricing.quoteBooking`
 *
 * WHY THIS FILE WAS REWRITTEN
 * ───────────────────────────
 * It used to test `priceFromInputs({ baseRate, hours, isUrgent, discount })`,
 * a function this codebase no longer has. Two things changed with it, and one
 * of them matters:
 *
 *   hours / urgency / discount   a product difference. Bookings are priced at
 *                                the provider's hourly rate; there is no
 *                                surcharge or discount model to test.
 *
 *   the fallback                 a correctness difference. The old function
 *                                had a "missing baseRate falls back to a
 *                                default" test. Inventing a price when none is
 *                                configured is the same class of defect P0-3
 *                                is about — the number is not the client's,
 *                                but it is nobody's. `quoteBooking` FAILS
 *                                CLOSED with a 409 instead, and the test below
 *                                asserts the refusal.
 *
 * The property both versions exist to guard is unchanged: no client input
 * participates in the price. The live-path version of that is
 * `test/p0-money.test.js`; this file covers the pricing function directly.
 */
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { quoteBooking, feePercent, PricingError } = require("../utils/pricing");

/** A db whose single query returns one provider row (or none). */
const dbReturning = (row) => ({ query: async () => [row ? [row] : []] });

const PROVIDER = {
  id: "prov-1", user_id: "u-1", hourly_rate: 500, category_id: "cat-1",
  is_available: 1, is_approved: 1, is_active: 1, base_price: 300,
};

test("the price comes from the provider's rate, and no client field is read", async () => {
  // Every field a malicious client might send, present and ignored: the
  // function's only inputs are the db handle and two identifiers.
  const q = await quoteBooking(dbReturning(PROVIDER), {
    providerId: "prov-1",
    amount: 1, total_amount: 1, platform_fee: 0, price: 1,
  });
  assert.equal(q.amount, 500);
  assert.equal(q.source, "provider.hourly_rate");
  assert.equal(q.platform_fee, Number((500 * (feePercent() / 100)).toFixed(2)));
  assert.equal(q.total, Number((q.amount + q.platform_fee).toFixed(2)));
});

test("two identical requests price identically regardless of client noise", async () => {
  const a = await quoteBooking(dbReturning(PROVIDER), { providerId: "prov-1", amount: 1 });
  const b = await quoteBooking(dbReturning(PROVIDER), { providerId: "prov-1", amount: 999999 });
  assert.deepEqual(a, b);
});

test("the category's base price is used only when the provider has no rate", async () => {
  const q = await quoteBooking(
    dbReturning({ ...PROVIDER, hourly_rate: null }), { providerId: "prov-1" });
  assert.equal(q.amount, 300);
  assert.equal(q.source, "category.base_price");
});

test("no configured price is a refusal, never an invented default", async () => {
  // The replaced test asserted a fallback default here. A booking priced at a
  // number nobody configured is a booking nobody agreed to.
  await assert.rejects(
    () => quoteBooking(dbReturning({ ...PROVIDER, hourly_rate: 0, base_price: null }),
                       { providerId: "prov-1", amount: 5000 }),
    (e) => e instanceof PricingError && e.status === 409);
});

test("an unbookable provider is refused before any price is computed", async () => {
  for (const [field, status] of [["is_active", 409], ["is_available", 409], ["is_approved", 409]]) {
    await assert.rejects(
      () => quoteBooking(dbReturning({ ...PROVIDER, [field]: 0 }), { providerId: "prov-1" }),
      (e) => e instanceof PricingError && e.status === status,
      `${field}=0 should refuse`);
  }
  await assert.rejects(
    () => quoteBooking(dbReturning(null), { providerId: "ghost" }),
    (e) => e instanceof PricingError && e.status === 404);
});

test("a missing or non-string provider id is rejected without a query", async () => {
  const explodes = { query: async () => { throw new Error("should not query"); } };
  for (const bad of [null, undefined, "", 42, {}]) {
    await assert.rejects(() => quoteBooking(explodes, { providerId: bad }),
      (e) => e instanceof PricingError && e.status === 400);
  }
});
