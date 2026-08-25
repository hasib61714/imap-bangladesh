// Unit tests for the payment-gateway posture (no DB / network).
// Proves: a fake/absent gateway cannot yield a "paid" path in production,
// and mock success is development-only.
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { evaluateConfig } = require("../config/payment");

test("production without credentials: not configured AND mock disabled", () => {
  const c = evaluateConfig({ NODE_ENV: "production" });
  assert.equal(c.configured, false);
  assert.equal(c.allowMock, false, "production must never allow mock success");
  assert.ok(c.problems.length > 0, "should warn about missing prod credentials");
});

test("production with credentials: configured, live, no mock", () => {
  const c = evaluateConfig({
    NODE_ENV: "production",
    SSL_STORE_ID: "store123",
    SSL_STORE_PASSWORD: "secret",
    SSL_IS_SANDBOX: "false",
  });
  assert.equal(c.configured, true);
  assert.equal(c.isSandbox, false);
  assert.equal(c.allowMock, false);
});

test("development without credentials: mock allowed (sandbox)", () => {
  const c = evaluateConfig({ NODE_ENV: "development" });
  assert.equal(c.configured, false);
  assert.equal(c.allowMock, true);
  assert.equal(c.isSandbox, true);
});

test("legacy SSLCOMMERZ_* names still resolve", () => {
  const c = evaluateConfig({
    NODE_ENV: "production",
    SSLCOMMERZ_STORE_ID: "old",
    SSLCOMMERZ_STORE_PASSWORD: "oldpass",
    SSL_IS_SANDBOX: "false",
  });
  assert.equal(c.configured, true);
});

test("explicit SSL_IS_SANDBOX overrides environment default", () => {
  const c = evaluateConfig({
    NODE_ENV: "production",
    SSL_STORE_ID: "s", SSL_STORE_PASSWORD: "p",
    SSL_IS_SANDBOX: "true",
  });
  assert.equal(c.isSandbox, true);
  assert.ok(c.problems.some(p => /sandbox/i.test(p)), "should warn sandbox-in-prod");
});
