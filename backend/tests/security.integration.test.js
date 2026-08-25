// ─────────────────────────────────────────────────────────────
//  Security integration tests (require a reachable test database).
//
//  Run with a disposable DB:
//    set RUN_DB_TESTS=1 and DB_* env vars, then: npm test
//  Without RUN_DB_TESTS=1 (or if supertest/DB is unavailable) every
//  test self-skips so the unit suite still runs in any environment.
//
//  Proves:
//   1. fake/absent payment cannot mark a booking paid (production)
//   2. wallet cannot be credited directly (production top-up rejected)
//   3. concurrent bookings cannot double-spend (FOR UPDATE)
//   4. a client-modified amount is ignored (server price stored)
//   5. a normal user is blocked from AI analytics (403)
// ─────────────────────────────────────────────────────────────

// Force a production posture with NO gateway BEFORE requiring app modules.
process.env.NODE_ENV = "production";
delete process.env.SSL_STORE_ID;
delete process.env.SSL_STORE_PASSWORD;
delete process.env.SSLCOMMERZ_STORE_ID;
delete process.env.SSLCOMMERZ_STORE_PASSWORD;
process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt    = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");

let request, pool, app, dbReady = false;
const ids = { customer: null, richCustomer: null, providerUser: null, provider: null, admin: null };

function token(id, role) { return jwt.sign({ id, role }, process.env.JWT_SECRET); }

before(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  try { request = require("supertest"); } catch { return; }

  pool = require("../db");
  try { await pool.query("SELECT 1"); } catch { return; }

  // Minimal app with the routes under test
  const express = require("express");
  app = express();
  app.use(express.json());
  app.use("/api/ai",       require("../routes/ai"));
  app.use("/api/users",    require("../routes/users"));
  app.use("/api/bookings", require("../routes/bookings"));
  app.use("/api/payments", require("../routes/payments"));
  app.use("/api/auth",     require("../routes/auth"));

  // Seed disposable users + provider
  ids.customer     = randomUUID();
  ids.richCustomer = randomUUID();
  ids.providerUser = randomUUID();
  ids.provider     = randomUUID();
  ids.admin        = randomUUID();

  await pool.query(
    "INSERT INTO users (id,name,phone,role,is_active,balance) VALUES (?,?,?,?,1,?)",
    [ids.customer, "ITEST cust", "01900000001", "customer", 600]
  );
  await pool.query(
    "INSERT INTO users (id,name,phone,role,is_active,balance) VALUES (?,?,?,?,1,?)",
    [ids.richCustomer, "ITEST rich", "01900000002", "customer", 5000]
  );
  await pool.query(
    "INSERT INTO users (id,name,phone,role,is_active,balance) VALUES (?,?,?,?,1,?)",
    [ids.providerUser, "ITEST prov", "01900000003", "provider", 0]
  );
  await pool.query(
    "INSERT INTO users (id,name,phone,role,is_active,balance) VALUES (?,?,?,?,1,?)",
    [ids.admin, "ITEST admin", "01900000004", "admin", 0]
  );
  await pool.query(
    "INSERT INTO providers (id,user_id,hourly_rate,is_available) VALUES (?,?,?,1)",
    [ids.provider, ids.providerUser, 500]
  );
  dbReady = true;
});

after(async () => {
  if (!dbReady) return;
  await pool.query("DELETE FROM wallet_transactions WHERE user_id IN (?,?,?,?)",
    [ids.customer, ids.richCustomer, ids.providerUser, ids.admin]).catch(() => {});
  await pool.query("DELETE FROM bookings WHERE customer_id IN (?,?)",
    [ids.customer, ids.richCustomer]).catch(() => {});
  await pool.query("DELETE FROM payments WHERE user_id IN (?,?)",
    [ids.customer, ids.richCustomer]).catch(() => {});
  await pool.query("DELETE FROM providers WHERE id = ?", [ids.provider]).catch(() => {});
  await pool.query("DELETE FROM users WHERE id IN (?,?,?,?)",
    [ids.customer, ids.richCustomer, ids.providerUser, ids.admin]).catch(() => {});
  await pool.end().catch(() => {});
});

test("1. fake/absent gateway cannot mark a booking paid in production", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const id = randomUUID();
  await pool.query(
    "INSERT INTO bookings (id,customer_id,provider_id,amount,platform_fee,payment_status,status) VALUES (?,?,?,?,?,'pending','pending')",
    [id, ids.richCustomer, ids.provider, 500, 50]
  );
  const res = await request(app)
    .post("/api/payments/initiate")
    .set("Authorization", `Bearer ${token(ids.richCustomer, "customer")}`)
    .send({ booking_id: id });
  assert.equal(res.status, 503, "production without gateway must reject");
  const [[b]] = await pool.query("SELECT payment_status,status FROM bookings WHERE id=?", [id]);
  assert.equal(b.payment_status, "pending", "booking must NOT be marked paid");
  await pool.query("DELETE FROM bookings WHERE id=?", [id]);
});

test("2. wallet cannot be credited directly (production top-up rejected)", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const [[before]] = await pool.query("SELECT balance FROM users WHERE id=?", [ids.richCustomer]);
  const res = await request(app)
    .post("/api/users/wallet/topup")
    .set("Authorization", `Bearer ${token(ids.richCustomer, "customer")}`)
    .send({ amount: 99999, method: "bKash" });
  assert.equal(res.status, 503, "production top-up without gateway must fail");
  const [[after]] = await pool.query("SELECT balance FROM users WHERE id=?", [ids.richCustomer]);
  assert.equal(Number(after.balance), Number(before.balance), "balance must be unchanged");
});

test("3. concurrent bookings cannot double-spend", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  // balance 600; each booking total = 550 → only one can succeed
  await pool.query("UPDATE users SET balance=600 WHERE id=?", [ids.customer]);
  const fire = () => request(app)
    .post("/api/bookings")
    .set("Authorization", `Bearer ${token(ids.customer, "customer")}`)
    .send({ provider_id: ids.provider, payment_method: "bKash" });
  const [a, b] = await Promise.all([fire(), fire()]);
  const statuses = [a.status, b.status];
  const ok = statuses.filter((s) => s === 201).length;
  // Exactly one must succeed; the loser is a clean client rejection — either
  // insufficient-funds (400) or a transient lock conflict (409), never a 500.
  assert.equal(ok, 1, "exactly one booking should succeed");
  assert.ok(statuses.some((s) => s === 400 || s === 409), "loser is a 400/409, not a 500");
  const [[u]] = await pool.query("SELECT balance FROM users WHERE id=?", [ids.customer]);
  assert.ok(Number(u.balance) >= 0, "balance must never go negative");
  assert.equal(Number(u.balance), 50, "exactly one 550 debit applied (no double-spend)");
});

test("4. client-modified amount is ignored (server price stored)", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const res = await request(app)
    .post("/api/bookings")
    .set("Authorization", `Bearer ${token(ids.richCustomer, "customer")}`)
    .send({ provider_id: ids.provider, amount: 1, total_amount: 1, platform_fee: 0, payment_method: "bKash" });
  assert.equal(res.status, 201);
  assert.equal(res.body.amount, 500, "server price (rate 500), not client 1");
  const [[b]] = await pool.query("SELECT amount FROM bookings WHERE id=?", [res.body.id]);
  assert.equal(Number(b.amount), 500, "stored amount is server-authoritative");
});

test("5. normal user is blocked from AI analytics", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const res = await request(app)
    .get("/api/ai/churn")
    .set("Authorization", `Bearer ${token(ids.customer, "customer")}`);
  assert.equal(res.status, 403, "customer must be denied analytics");

  const ok = await request(app)
    .get("/api/ai/churn")
    .set("Authorization", `Bearer ${token(ids.admin, "admin")}`);
  assert.equal(ok.status, 200, "admin allowed");
  const blob = JSON.stringify(ok.body);
  assert.ok(!/01900000/.test(blob), "churn response must not leak phone numbers");
});

// ── Booking status state-machine hardening (money-mint / refund fixes) ──

test("6. re-completing a booking credits the provider only ONCE (no wallet mint)", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const id = randomUUID();
  await pool.query(
    "INSERT INTO bookings (id,customer_id,provider_id,amount,platform_fee,payment_method,payment_status,status) VALUES (?,?,?,?,?,'bKash','paid','confirmed')",
    [id, ids.richCustomer, ids.provider, 500, 50]
  );
  await pool.query("UPDATE users SET balance=0 WHERE id=?", [ids.providerUser]);
  const provTok = token(ids.providerUser, "provider");
  const complete = () => request(app).patch(`/api/bookings/${id}/status`)
    .set("Authorization", `Bearer ${provTok}`).send({ status: "completed" });

  const first = await complete();
  assert.equal(first.status, 200);
  await complete(); // repeat — must NOT credit again
  await complete();

  const [[u]] = await pool.query("SELECT balance FROM users WHERE id=?", [ids.providerUser]);
  assert.equal(Number(u.balance), 450, "earnings (500-50) credited exactly once despite 3 calls");
  const [[{ c }]] = await pool.query(
    "SELECT COUNT(*) AS c FROM wallet_transactions WHERE user_id=? AND type='credit' AND method='wallet'",
    [ids.providerUser]
  );
  assert.equal(Number(c), 1, "exactly one earnings transaction written");
  await pool.query("DELETE FROM bookings WHERE id=?", [id]);
});

test("7. a customer cannot move a booking to 'completed' (role-scoped transitions)", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const id = randomUUID();
  await pool.query(
    "INSERT INTO bookings (id,customer_id,provider_id,amount,platform_fee,payment_method,status) VALUES (?,?,?,?,?,'bKash','confirmed')",
    [id, ids.richCustomer, ids.provider, 500, 50]
  );
  await pool.query("UPDATE users SET balance=0 WHERE id=?", [ids.providerUser]);
  const res = await request(app).patch(`/api/bookings/${id}/status`)
    .set("Authorization", `Bearer ${token(ids.richCustomer, "customer")}`)
    .send({ status: "completed" });
  assert.equal(res.status, 403, "customer may only cancel, not complete");
  const [[u]] = await pool.query("SELECT balance FROM users WHERE id=?", [ids.providerUser]);
  assert.equal(Number(u.balance), 0, "no earnings credited on a rejected transition");
  await pool.query("DELETE FROM bookings WHERE id=?", [id]);
});

test("8. cancelling a CASH booking refunds nothing; a wallet booking refunds once", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const custTok = token(ids.richCustomer, "customer");
  const cancel = (id) => request(app).patch(`/api/bookings/${id}/status`)
    .set("Authorization", `Bearer ${custTok}`).send({ status: "cancelled" });

  // Cash booking → never debited at creation → must NOT be refunded.
  const cashId = randomUUID();
  await pool.query(
    "INSERT INTO bookings (id,customer_id,provider_id,amount,platform_fee,payment_method,status) VALUES (?,?,?,?,?,'cash','pending')",
    [cashId, ids.richCustomer, ids.provider, 500, 50]
  );
  await pool.query("UPDATE users SET balance=1000 WHERE id=?", [ids.richCustomer]);
  const c1 = await cancel(cashId);
  assert.equal(c1.status, 200);
  let [[u]] = await pool.query("SELECT balance FROM users WHERE id=?", [ids.richCustomer]);
  assert.equal(Number(u.balance), 1000, "cash cancellation must not credit the wallet");

  // Wallet booking → refunded exactly once, even if cancel is retried.
  const walletId = randomUUID();
  await pool.query(
    "INSERT INTO bookings (id,customer_id,provider_id,amount,platform_fee,payment_method,status) VALUES (?,?,?,?,?,'bKash','pending')",
    [walletId, ids.richCustomer, ids.provider, 500, 50]
  );
  await pool.query("UPDATE users SET balance=1000 WHERE id=?", [ids.richCustomer]);
  await cancel(walletId);
  await cancel(walletId); // retry must be a no-op (already cancelled)
  [[u]] = await pool.query("SELECT balance FROM users WHERE id=?", [ids.richCustomer]);
  assert.equal(Number(u.balance), 1550, "refund of 550 applied exactly once");

  await pool.query("DELETE FROM bookings WHERE id IN (?,?)", [cashId, walletId]);
});

// ── Payment settlement binding (ledger tran_id + amount must match gateway) ──

test("9. finalizePayment refuses a validated response that does not match the payment", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const { finalizePayment } = require("../utils/ledger");
  const payId = randomUUID();
  await pool.query(
    "INSERT INTO payments (id,booking_id,user_id,amount,method,purpose,status,gateway_tran_id) VALUES (?,NULL,?,?,?,'wallet_topup','pending',?)",
    [payId, ids.richCustomer, 500, "sslcommerz", payId]
  );

  // Wrong tran_id → refused.
  let r = await finalizePayment(payId, "V1", { validated: { status: "VALID", tran_id: "someone-elses-tran", amount: "500.00" } });
  assert.equal(r.ok, false); assert.equal(r.reason, "validation_mismatch");
  // Amount tampered upward → refused.
  r = await finalizePayment(payId, "V1", { validated: { status: "VALID", tran_id: payId, amount: "5000.00" } });
  assert.equal(r.ok, false); assert.equal(r.reason, "validation_mismatch");
  let [[p]] = await pool.query("SELECT status FROM payments WHERE id=?", [payId]);
  assert.equal(p.status, "pending", "payment must remain unsettled after mismatches");

  // Correct binding → settles once, then idempotent.
  r = await finalizePayment(payId, "V1", { validated: { status: "VALID", tran_id: payId, amount: "500.00" } });
  assert.equal(r.ok, true);
  [[p]] = await pool.query("SELECT status FROM payments WHERE id=?", [payId]);
  assert.equal(p.status, "success", "matching gateway response settles the payment");

  await pool.query("DELETE FROM payments WHERE id=?", [payId]);
});

// ── Passwordless-login refusal on the LIVE /api/auth/login route ──
// The seeded users have no password_hash (phone-OTP accounts). Password login
// must be refused for them — otherwise anyone could log in by phone alone.
test("10. passwordless (OTP/social) account cannot log in via /api/auth/login", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const res = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "01900000001", password: "whatever" }); // ids.customer, no password_hash
  assert.equal(res.status, 401, "passwordless account must not authenticate by identifier alone");
  assert.ok(!res.body.token, "no token issued");
});
