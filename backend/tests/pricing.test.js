// Unit tests for server-side price authority (no DB).
// Proves: a client-supplied "amount" can never influence the computed price.
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { priceFromInputs } = require("../utils/pricing");

test("price is derived from the server rate, not any client amount", () => {
  // Simulate a malicious client that tries to inject a cheap amount.
  const malicious = { baseRate: 500, amount: 1, total_amount: 1, platform_fee: 0 };
  const p = priceFromInputs(malicious);
  assert.equal(p.amount, 500, "client amount must be ignored");
  assert.equal(p.platform_fee, 50, "10% platform fee on 500");
  assert.equal(p.total, 550);
});

test("two identical requests price identically regardless of client noise", () => {
  const a = priceFromInputs({ baseRate: 400 });
  const b = priceFromInputs({ baseRate: 400, amount: 999999 });
  assert.deepEqual(a, b);
});

test("urgent surcharge and hours are applied", () => {
  const p = priceFromInputs({ baseRate: 500, hours: 2, isUrgent: true });
  // 500 * 1.2 * 2 = 1200
  assert.equal(p.amount, 1200);
  assert.equal(p.total, 1320);
});

test("hours are clamped to 1..24", () => {
  assert.equal(priceFromInputs({ baseRate: 100, hours: 0 }).hours, 1);
  assert.equal(priceFromInputs({ baseRate: 100, hours: -5 }).hours, 1);
  assert.equal(priceFromInputs({ baseRate: 100, hours: 999 }).hours, 24);
});

test("discount cannot exceed subtotal and cannot create negative price", () => {
  const p = priceFromInputs({ baseRate: 500, discount: 999999 });
  assert.equal(p.discount, 500, "discount capped at subtotal");
  assert.equal(p.amount, 50, "floored at MIN_AMOUNT");
  assert.ok(p.amount >= 0);
});

test("missing/invalid baseRate falls back to a default, never to client value", () => {
  const p = priceFromInputs({ baseRate: 0, amount: 1 });
  assert.ok(p.amount >= 50, "uses default rate, not client amount");
  assert.notEqual(p.amount, 1);
});
