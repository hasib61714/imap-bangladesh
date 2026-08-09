/**
 * P0-6  — a loan must not be disbursable twice.
 * P0-12 — no wallet credit without a verified gateway settlement.
 *
 * Audit evidence: docs/audit/SECURITY-GAPS.md P0-6, P0-12
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { makePool, installFakeDb, resetModules, serve, call, asUser } = require("./helpers/harness");

const ADMIN = { id: "admin-x", name: "Admin", role: "admin" };
const USER  = { id: "user-1", name: "User", role: "customer", email: "u@e.com", phone: "01712345678" };

function stubAuth(user) {
  const authMw = require.resolve("../middleware/auth");
  require.cache[authMw] = {
    id: authMw, filename: authMw, loaded: true,
    exports: {
      authMiddleware: (req, _res, next) => { req.user = user; next(); },
      requireRole: () => (_req, _res, next) => next(),
    },
  };
}

// ── P0-6 ────────────────────────────────────────────────────────────
async function bootLoans(pool, user = ADMIN) {
  resetModules("../routes/loans", "../utils/money", "../middleware/auth");
  installFakeDb(pool);
  stubAuth(user);
  return serve(require("../routes/loans"), { middleware: [asUser(user)] });
}

const disbursedLoan = {
  id: "loan-1", user_id: "user-1", amount: 50000, status: "disbursed",
  reference_no: "LN-ABC123",
};

test("P0-6: disbursing an already-disbursed loan credits nothing", async (t) => {
  const pool = makePool([
    { match: "SELECT * FROM microloans WHERE id=? FOR UPDATE", rows: [disbursedLoan] },
  ]);
  const srv = await bootLoans(pool);
  t.after(() => srv.close());

  const res = await call(srv.url, "PATCH", "/loan-1", { status: "disbursed" });

  assert.equal(res.status, 200, "idempotent: reports the existing state");
  assert.equal(res.body.disbursed, false);
  assert.equal(res.body.changed, false);
  assert.ok(/already disbursed/i.test(res.body.message || ""));
  assert.ok(!pool.ran("UPDATE users SET balance = balance + ?"), "no second credit");
  assert.ok(!pool.ran("INSERT INTO wallet_transactions"), "no second ledger row");
});

test("P0-6: an illegal loan transition is refused", async (t) => {
  const pool = makePool([
    { match: "SELECT * FROM microloans WHERE id=? FOR UPDATE",
      rows: [{ ...disbursedLoan, status: "rejected" }] },
  ]);
  const srv = await bootLoans(pool);
  t.after(() => srv.close());

  const res = await call(srv.url, "PATCH", "/loan-1", { status: "disbursed" });

  assert.equal(res.status, 409, "rejected loans are terminal");
  assert.ok(!pool.ran("UPDATE users SET balance = balance + ?"));
  assert.ok(pool.ran("ROLLBACK"));
});

test("P0-6: a lost race on the status guard credits nothing", async (t) => {
  const pool = makePool([
    { match: "SELECT * FROM microloans WHERE id=? FOR UPDATE",
      rows: [{ ...disbursedLoan, status: "approved" }] },
    { match: "UPDATE microloans SET status=?", rows: { affectedRows: 0 } },
  ]);
  const srv = await bootLoans(pool);
  t.after(() => srv.close());

  const res = await call(srv.url, "PATCH", "/loan-1", { status: "disbursed" });

  assert.equal(res.status, 409);
  assert.ok(!pool.ran("UPDATE users SET balance = balance + ?"));
  assert.ok(pool.ran("ROLLBACK"));
});

test("P0-6: the first disbursement credits exactly once, with an idempotency ref", async (t) => {
  const pool = makePool([
    { match: "SELECT * FROM microloans WHERE id=? FOR UPDATE",
      rows: [{ ...disbursedLoan, status: "approved" }] },
    { match: "UPDATE microloans SET status=?", rows: { affectedRows: 1 } },
    { match: "UPDATE users SET balance = balance + ?", rows: { affectedRows: 1 } },
    { match: "INSERT INTO wallet_transactions", rows: { affectedRows: 1 } },
    { match: "INSERT INTO notifications", rows: { affectedRows: 1 } },
  ]);
  const srv = await bootLoans(pool);
  t.after(() => srv.close());

  const res = await call(srv.url, "PATCH", "/loan-1", { status: "disbursed" });

  assert.equal(res.status, 200);
  assert.equal(res.body.disbursed, true);
  assert.equal(pool.all("UPDATE users SET balance = balance + ?").length, 1);
  const ledger = pool.all("INSERT INTO wallet_transactions")[0];
  assert.ok(ledger.params.includes("loan:loan-1:disburse"), "unique ledger ref present");
  assert.ok(pool.ran("COMMIT"));
});

// ── P0-12 ───────────────────────────────────────────────────────────
async function bootPayments(pool, { production, configured }) {
  resetModules("../routes/payments", "../utils/payment", "../utils/money", "../middleware/auth");
  process.env.NODE_ENV = production ? "production" : "test";
  if (configured) {
    process.env.SSLCOMMERZ_STORE_ID = "test-store";
    process.env.SSLCOMMERZ_STORE_PASSWORD = "test-pass";
  } else {
    delete process.env.SSLCOMMERZ_STORE_ID;
    delete process.env.SSLCOMMERZ_STORE_PASSWORD;
    delete process.env.SSL_STORE_ID;
    delete process.env.SSL_STORE_PASSWORD;
  }
  installFakeDb(pool);
  stubAuth(USER);
  return serve(require("../routes/payments"), { middleware: [asUser(USER)] });
}

test("P0-12: production + unconfigured gateway refuses and credits nothing", async (t) => {
  const pool = makePool([]);
  const srv = await bootPayments(pool, { production: true, configured: false });
  t.after(async () => { await srv.close(); process.env.NODE_ENV = "test"; });

  const res = await call(srv.url, "POST", "/initiate", {
    type: "wallet_topup", topup_amount: 100000,
  });

  assert.equal(res.status, 503, "fail closed");
  assert.equal(res.body.code, "PAYMENT_GATEWAY_UNAVAILABLE");
  assert.ok(!pool.ran("UPDATE users SET balance"), "no balance movement");
  assert.ok(!pool.ran("INSERT INTO payments"), "no payment record is even opened");
});

test("P0-12: the IPN refuses to settle when the gateway is unconfigured", async (t) => {
  const pool = makePool([
    { match: "SELECT * FROM payments WHERE id = ? FOR UPDATE",
      rows: [{ id: "pay-1", user_id: "user-1", amount: 5000, status: "pending", booking_id: null, method: "sslcommerz" }] },
  ]);
  const srv = await bootPayments(pool, { production: false, configured: false });
  t.after(() => srv.close());

  const res = await call(srv.url, "POST", "/ipn", {
    tran_id: "pay-1", val_id: "forged", status: "VALID", amount: 5000,
  });

  assert.equal(res.status, 503);
  assert.ok(!pool.ran("UPDATE users SET balance"), "an unverifiable IPN credits nothing");
});

test("P0-12: the success redirect can no longer settle a payment", async (t) => {
  const pool = makePool([
    { match: "SELECT * FROM payments WHERE id = ? FOR UPDATE",
      rows: [{ id: "pay-1", user_id: "user-1", amount: 5000, status: "pending", booking_id: null }] },
  ]);
  const srv = await bootPayments(pool, { production: false, configured: true });
  t.after(() => srv.close());

  // Anyone can POST here — it is a browser redirect target, not an API.
  const res = await fetch(srv.url + "/success", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tran_id: "pay-1", val_id: "anything", status: "VALID" }),
    redirect: "manual",
  });

  assert.ok([301, 302, 303, 307].includes(res.status), "it only redirects");
  assert.ok(!pool.ran("UPDATE payments SET status='success'"), "no settlement");
  assert.ok(!pool.ran("UPDATE users SET balance"), "no credit");
});

test("P0-12: a booking already settled from the wallet cannot be charged again", async (t) => {
  const pool = makePool([
    { match: "FROM bookings b LEFT JOIN users u",
      rows: [{ id: "bk-1", customer_id: "user-1", amount: 400, platform_fee: 0,
               payment_status: "paid", status: "confirmed" }] },
  ]);
  const srv = await bootPayments(pool, { production: false, configured: true });
  t.after(() => srv.close());

  const res = await call(srv.url, "POST", "/initiate", { booking_id: "bk-1" });

  assert.equal(res.status, 409);
  assert.equal(res.body.code, "ALREADY_PAID");
  assert.ok(!pool.ran("INSERT INTO payments"), "no second payment session");
});
