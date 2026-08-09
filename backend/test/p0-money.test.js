/**
 * P0-3 — the client must not choose the booking price.
 * P0-4 — negative / NaN / Infinity money values must be rejected.
 * P0-5 — a completed booking must not be completable twice.
 * P0-11 — money paths must be transactional.
 *
 * Audit evidence: docs/audit/SECURITY-GAPS.md P0-3, P0-4, P0-5, P0-11
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { makePool, installFakeDb, resetModules, serve, call, asUser } = require("./helpers/harness");

const BOOKINGS_ROUTE = "../routes/bookings";
const CUSTOMER = { id: "cust-1", name: "Customer", role: "customer", phone: "01711111111" };

/** Provider priced at ৳400/hour by the server. */
const providerRow = {
  id: "prov-1", user_id: "provuser-1", hourly_rate: 400, category_id: 3,
  is_available: 1, is_approved: 1, is_active: 1, base_price: 300,
};

async function bootBookings(pool, user = CUSTOMER) {
  resetModules(BOOKINGS_ROUTE, "../utils/pricing", "../utils/money",
               "../utils/bookingState", "../utils/bookingAccess", "../middleware/auth");
  installFakeDb(pool);
  // Bypass JWT verification; we are testing the handler's own logic.
  const authMw = require.resolve("../middleware/auth");
  require.cache[authMw] = {
    id: authMw, filename: authMw, loaded: true,
    exports: {
      authMiddleware: (req, _res, next) => { req.user = user; next(); },
      requireRole: () => (_req, _res, next) => next(),
    },
  };
  const router = require(BOOKINGS_ROUTE);
  return serve(router, { middleware: [asUser(user)] });
}

// ── P0-3 ────────────────────────────────────────────────────────────
test("P0-3: a client-supplied amount is ignored; the server price is stored", async (t) => {
  const pool = makePool([
    { match: "FROM providers p", rows: [providerRow] },
    { match: "UPDATE users SET balance = balance - ?", rows: { affectedRows: 1 } },
    { match: "INSERT INTO bookings", rows: { affectedRows: 1 } },
    { match: "INSERT INTO wallet_transactions", rows: { affectedRows: 1 } },
    { match: "UPDATE users SET points", rows: { affectedRows: 1 } },
    { match: "INSERT INTO loyalty_log", rows: { affectedRows: 1 } },
    { match: "INSERT INTO notifications", rows: { affectedRows: 1 } },
  ]);
  const srv = await bootBookings(pool);
  t.after(() => srv.close());

  const res = await call(srv.url, "POST", "/", {
    provider_id: "prov-1",
    amount: 1,             // the attack: book a ৳400 service for ৳1
    total_amount: 1,
    payment_method: "bKash",
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.amount, 400, "the server price wins");
  assert.equal(res.body.total, 400);

  const insert = pool.all("INSERT INTO bookings")[0];
  assert.ok(insert, "a booking row was written");
  assert.ok(insert.params.includes(400), "the stored amount is the server price");
  assert.ok(!insert.params.includes(1), "the client's number is never persisted");
});

test("P0-3: booking fails closed when the server cannot determine a price", async (t) => {
  const pool = makePool([
    // No hourly_rate and no category base_price.
    { match: "FROM providers p", rows: [{ ...providerRow, hourly_rate: null, base_price: null }] },
  ]);
  const srv = await bootBookings(pool);
  t.after(() => srv.close());

  const res = await call(srv.url, "POST", "/", { provider_id: "prov-1", amount: 5000 });

  assert.equal(res.status, 409, "refuse rather than accept the client's price");
  assert.ok(/price/i.test(res.body.error));
  assert.ok(!pool.ran("INSERT INTO bookings"), "no booking is created");
  assert.ok(!pool.ran("UPDATE users SET balance"), "no balance is touched");
});

test("P0-3: an unapproved or unavailable provider cannot be booked", async (t) => {
  for (const [field, label] of [["is_approved", "unapproved"], ["is_available", "unavailable"], ["is_active", "inactive"]]) {
    const pool = makePool([
      { match: "FROM providers p", rows: [{ ...providerRow, [field]: 0 }] },
    ]);
    const srv = await bootBookings(pool);
    const res = await call(srv.url, "POST", "/", { provider_id: "prov-1" });
    await srv.close();
    assert.equal(res.status, 409, `${label} provider must be refused`);
    assert.ok(!pool.ran("INSERT INTO bookings"));
  }
});

// ── P0-4 ────────────────────────────────────────────────────────────
test("P0-4: a negative platform_fee cannot inflate the wallet", async (t) => {
  const pool = makePool([
    { match: "FROM providers p", rows: [providerRow] },
    { match: "UPDATE users SET balance = balance - ?", rows: { affectedRows: 1 } },
    { match: "INSERT INTO bookings", rows: { affectedRows: 1 } },
    { match: "INSERT INTO wallet_transactions", rows: { affectedRows: 1 } },
    { match: "UPDATE users SET points", rows: { affectedRows: 1 } },
    { match: "INSERT INTO loyalty_log", rows: { affectedRows: 1 } },
    { match: "INSERT INTO notifications", rows: { affectedRows: 1 } },
  ]);
  const srv = await bootBookings(pool);
  t.after(() => srv.close());

  const res = await call(srv.url, "POST", "/", {
    provider_id: "prov-1",
    amount: 1,
    platform_fee: -100000,   // the original exploit
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.platform_fee, 0, "the client fee is ignored entirely");
  assert.equal(res.body.total, 400);

  const debit = pool.all("UPDATE users SET balance = balance - ?")[0];
  assert.ok(debit, "a debit was issued");
  assert.ok(debit.params[0] > 0, `debit must be positive, got ${debit.params[0]}`);
  assert.equal(debit.params[0], 400);
});

test("P0-4: the money validator rejects every unsafe numeric input", () => {
  const { parseAmount, MoneyError } = require("../utils/money");
  const bad = [-1, -0.01, NaN, Infinity, -Infinity, "abc", "", null, undefined,
               "1e999", {}, [], true, "-50", " -3 "];
  for (const v of bad) {
    assert.throws(() => parseAmount(v, "amount"), MoneyError,
      `parseAmount(${JSON.stringify(v)}) must throw`);
  }
  assert.equal(parseAmount(400, "amount"), 400);
  assert.equal(parseAmount("399.999", "amount"), 400);
  assert.equal(parseAmount(0, "amount"), 0);
  assert.throws(() => parseAmount(2_000_000, "amount"), MoneyError, "over the cap");
});

// ── P0-5 ────────────────────────────────────────────────────────────
test("P0-5: the state machine forbids re-completing a completed booking", () => {
  const { assertTransition, TransitionError } = require("../utils/bookingState");

  // Legal once.
  assert.deepEqual(assertTransition("active", "completed", "provider"), { financialEffect: "payout" });

  // Never twice.
  assert.throws(() => assertTransition("completed", "completed", "provider"), TransitionError);
  assert.throws(() => assertTransition("completed", "completed", "admin"), TransitionError);
  assert.throws(() => assertTransition("completed", "active", "admin"), TransitionError);
  assert.throws(() => assertTransition("cancelled", "completed", "admin"), TransitionError);

  // A customer cannot drive the provider's payout.
  assert.throws(() => assertTransition("active", "completed", "customer"), TransitionError);
});

test("P0-5: completing an already-completed booking pays out nothing", async (t) => {
  const pool = makePool([
    { match: "FROM bookings b LEFT JOIN providers p", rows: [{ customer_id: "cust-1", provider_user_id: "provuser-1" }] },
    { match: "SELECT id, customer_id, provider_id, amount, platform_fee, status, payment_status FROM bookings",
      rows: [{ id: "bk-1", customer_id: "cust-1", provider_id: "prov-1", amount: 400, platform_fee: 0, status: "completed", payment_status: "paid" }] },
  ]);
  const srv = await bootBookings(pool, { id: "provuser-1", name: "P", role: "provider" });
  t.after(() => srv.close());

  const res = await call(srv.url, "PATCH", "/bk-1/status", { status: "completed" });

  assert.equal(res.status, 409, "the second completion is refused");
  assert.ok(!pool.ran("UPDATE users SET balance = balance + ?"), "no earnings credited");
  assert.ok(!pool.ran("INSERT INTO wallet_transactions"), "no ledger row written");
  assert.ok(!pool.ran("UPDATE providers SET total_jobs"), "job count unchanged");
  assert.ok(pool.ran("ROLLBACK"), "the transaction rolled back");
});

test("P0-5: a lost race on the conditional UPDATE pays out nothing", async (t) => {
  const pool = makePool([
    { match: "FROM bookings b LEFT JOIN providers p", rows: [{ customer_id: "cust-1", provider_user_id: "provuser-1" }] },
    { match: "SELECT id, customer_id, provider_id, amount, platform_fee, status, payment_status FROM bookings",
      rows: [{ id: "bk-1", customer_id: "cust-1", provider_id: "prov-1", amount: 400, platform_fee: 0, status: "active", payment_status: "paid" }] },
    // Another request changed the row first.
    { match: "UPDATE bookings SET status = ? WHERE id = ? AND status = ?", rows: { affectedRows: 0 } },
  ]);
  const srv = await bootBookings(pool, { id: "provuser-1", name: "P", role: "provider" });
  t.after(() => srv.close());

  const res = await call(srv.url, "PATCH", "/bk-1/status", { status: "completed" });

  assert.equal(res.status, 409);
  assert.ok(!pool.ran("UPDATE users SET balance = balance + ?"), "no double payout on a lost race");
  assert.ok(pool.ran("ROLLBACK"));
});

test("P0-5: a legitimate first completion does pay out exactly once", async (t) => {
  const pool = makePool([
    { match: "FROM bookings b LEFT JOIN providers p", rows: [{ customer_id: "cust-1", provider_user_id: "provuser-1" }] },
    { match: "SELECT id, customer_id, provider_id, amount, platform_fee, status, payment_status FROM bookings",
      rows: [{ id: "bk-1", customer_id: "cust-1", provider_id: "prov-1", amount: 400, platform_fee: 40, status: "active", payment_status: "paid" }] },
    { match: "UPDATE bookings SET status = ? WHERE id = ? AND status = ?", rows: { affectedRows: 1 } },
    { match: "UPDATE providers SET total_jobs", rows: { affectedRows: 1 } },
    { match: "UPDATE users SET balance = balance + ?", rows: { affectedRows: 1 } },
    { match: "INSERT INTO wallet_transactions", rows: { affectedRows: 1 } },
    { match: "INSERT INTO notifications", rows: { affectedRows: 1 } },
  ]);
  const srv = await bootBookings(pool, { id: "provuser-1", name: "P", role: "provider" });
  t.after(() => srv.close());

  const res = await call(srv.url, "PATCH", "/bk-1/status", { status: "completed" });

  assert.equal(res.status, 200);
  assert.equal(res.body.earnings, 360, "amount minus platform fee");
  const credits = pool.all("UPDATE users SET balance = balance + ?");
  assert.equal(credits.length, 1, "exactly one credit");
  const ledger = pool.all("INSERT INTO wallet_transactions")[0];
  assert.ok(ledger.params.includes("booking:bk-1:payout"), "the ledger row carries a unique idempotency ref");
  assert.ok(pool.ran("COMMIT"));
});

// ── P0-11 ───────────────────────────────────────────────────────────
test("P0-11: booking creation runs inside a transaction and rolls back on failure", async (t) => {
  const pool = makePool([
    { match: "FROM providers p", rows: [providerRow] },
    { match: "UPDATE users SET balance = balance - ?", rows: { affectedRows: 1 } },
    // The booking insert fails after the balance has already been debited.
    { match: "INSERT INTO bookings", rows: { __throw: new Error("simulated insert failure") } },
  ]);
  const srv = await bootBookings(pool);
  t.after(() => srv.close());

  const res = await call(srv.url, "POST", "/", { provider_id: "prov-1" });

  assert.equal(res.status, 500);
  assert.ok(pool.ran("BEGIN"), "a transaction was opened");
  assert.ok(pool.ran("ROLLBACK"), "the debit was rolled back");
  assert.ok(!pool.ran("COMMIT"), "nothing was committed");
});

test("P0-11: insufficient balance blocks the booking before anything is written", async (t) => {
  const pool = makePool([
    { match: "FROM providers p", rows: [providerRow] },
    { match: "UPDATE users SET balance = balance - ?", rows: { affectedRows: 0 } },
  ]);
  const srv = await bootBookings(pool);
  t.after(() => srv.close());

  const res = await call(srv.url, "POST", "/", { provider_id: "prov-1" });

  assert.equal(res.status, 400);
  assert.ok(/balance/i.test(res.body.error));
  assert.ok(!pool.ran("INSERT INTO bookings"));
  assert.ok(pool.ran("ROLLBACK"));
});
