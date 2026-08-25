/**
 * GET /api/admin/readiness — an operator can see what is configured, and
 * nobody can see a credential.
 *
 * The endpoint exists because several capabilities are configured only by
 * environment variables typed into a hosting dashboard, and `/api/health`
 * stays green through every misconfiguration of them. It reports what is set;
 * the risk it carries is reporting too much.
 */
"use strict";

process.env.APP_ENV      = process.env.APP_ENV      || "test";
process.env.DATABASE_ENV = process.env.DATABASE_ENV || "test";
process.env.JWT_SECRET   = process.env.JWT_SECRET   || "test-secret";
process.env.DB_HOST      = process.env.DB_HOST      || "127.0.0.1";
process.env.DB_NAME      = process.env.DB_NAME      || "imap_test";

const test = require("node:test");
const assert = require("node:assert/strict");

const STORE_ID   = "teststore123456";
const STORE_PASS = "super-secret-store-password";

test("the readiness report contains no credential", (t) => {
  const prev = { ...process.env };
  t.after(() => { process.env = prev; });

  process.env.SSL_STORE_ID       = STORE_ID;
  process.env.SSL_STORE_PASSWORD = STORE_PASS;
  process.env.SSL_IS_SANDBOX     = "true";
  delete require.cache[require.resolve("../utils/payment")];
  const payment = require("../utils/payment");

  const body = JSON.stringify(payment.describe());

  assert.ok(!body.includes(STORE_PASS), "the store password must never appear");
  assert.ok(!body.includes(STORE_ID),
    "the full store id must not appear either — it is half of the credential pair");
  // Six characters and an ellipsis: enough for an operator to recognise what
  // they pasted, not enough to be half of a credential pair.
  assert.ok(body.includes("testst…"),
    "a truncated id is shown, so an operator can check what they typed: " + body);
  assert.ok(!body.includes("teststore"), "six characters, not nine");
  assert.equal(payment.describe().mode, "sandbox");
});

test("a sandbox base in live mode is the pair worth warning about", (t) => {
  const prev = { ...process.env };
  t.after(() => { process.env = prev; });

  // The failure this catches: sandbox credentials deployed with
  // SSL_IS_SANDBOX unset or false. The gateway answers "Store Credential
  // Error" for every payment and the application cannot tell the customer
  // why, because nothing in the response says the mode is wrong.
  process.env.SSL_STORE_ID       = STORE_ID;
  process.env.SSL_STORE_PASSWORD = STORE_PASS;
  process.env.SSL_IS_SANDBOX     = "false";
  process.env.APP_ENV            = "production";
  delete require.cache[require.resolve("../utils/payment")];
  const payment = require("../utils/payment");

  const d = payment.describe();
  assert.equal(d.mode, "live", "the declared mode follows SSL_IS_SANDBOX");
  assert.ok(!/sandbox/i.test(d.base),
    "and the base follows it too — so `live` mode against a sandbox base is a state the route can detect");
});

test("an unconfigured gateway is reported as unconfigured, not as working", (t) => {
  const prev = { ...process.env };
  t.after(() => { process.env = prev; });

  delete process.env.SSL_STORE_ID;
  delete process.env.SSL_STORE_PASSWORD;
  delete process.env.SSLCOMMERZ_STORE_ID;
  delete process.env.SSLCOMMERZ_STORE_PASSWORD;
  delete require.cache[require.resolve("../utils/payment")];
  const payment = require("../utils/payment");

  assert.equal(payment.isConfigured(), false);
  assert.equal(payment.describe().configured, false);
  assert.equal(payment.describe().storeId, null);
});

test("the route is admin-gated and names an action the kernel knows", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../routes/admin.js"), "utf8");
  const route = src.match(/router\.get\("\/readiness"[^\n]*/);
  assert.ok(route, "the readiness route should exist");
  assert.match(route[0], /authMiddleware/, "authentication is required");
  assert.match(route[0], /requireAuthorization\(ACTION\./,
    "I-04: the decision is the kernel's, not a role comparison in the route");

  // Which capabilities a deployment is MISSING is a map of where it is
  // weakest. That is not public.
  assert.ok(!/router\.get\("\/readiness",\s*async/.test(src),
    "the readiness route must not be anonymous");
});
