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
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 400], "exactly one booking should succeed");
  const [[u]] = await pool.query("SELECT balance FROM users WHERE id=?", [ids.customer]);
  assert.ok(Number(u.balance) >= 0, "balance must never go negative");
  assert.equal(Number(u.balance), 50, "exactly one 550 debit applied");
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
