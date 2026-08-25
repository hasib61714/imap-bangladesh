// Integration tests for push subscribe / unsubscribe (needs a test DB + supertest).
// Run: RUN_DB_TESTS=1 with DB_* env. Self-skips otherwise.
process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt    = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");

let request, pool, app, dbReady = false;
const userA = randomUUID(), userB = randomUUID();
const token = (id) => jwt.sign({ id, role: "customer" }, process.env.JWT_SECRET);
const sub = (ep) => ({ endpoint: ep, keys: { p256dh: "x", auth: "y" } });

before(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  try { request = require("supertest"); } catch { return; }
  pool = require("../db");
  try { await pool.query("SELECT 1"); } catch { return; }
  const express = require("express");
  app = express(); app.use(express.json());
  app.use("/api/users", require("../routes/users"));
  for (const id of [userA, userB]) {
    await pool.query("INSERT INTO users (id,name,phone,role,is_active) VALUES (?,?,?,?,1)",
      [id, "push test", "019" + Math.floor(10000000 + Math.random() * 89999999), "customer"]);
  }
  dbReady = true;
});

after(async () => {
  if (!dbReady) return;
  await pool.query("DELETE FROM push_subscriptions WHERE user_id IN (?,?)", [userA, userB]).catch(() => {});
  await pool.query("DELETE FROM users WHERE id IN (?,?)", [userA, userB]).catch(() => {});
  await pool.end().catch(() => {});
});

test("subscribe requires authentication", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const res = await request(app).post("/api/users/push-subscribe").send({ subscription: sub("https://e/1") });
  assert.equal(res.status, 401);
});

test("subscribe then unsubscribe works for the owner", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const ep = "https://example.push/endpoint-A";
  const sres = await request(app).post("/api/users/push-subscribe")
    .set("Authorization", `Bearer ${token(userA)}`).send({ subscription: sub(ep) });
  assert.equal(sres.status, 200);
  const [[{ c }]] = await pool.query("SELECT COUNT(*) c FROM push_subscriptions WHERE user_id=?", [userA]);
  assert.equal(Number(c), 1);

  const ures = await request(app).delete("/api/users/push-subscribe")
    .set("Authorization", `Bearer ${token(userA)}`).send({ endpoint: ep });
  assert.equal(ures.status, 200);
  const [[{ c2 }]] = await pool.query("SELECT COUNT(*) c2 FROM push_subscriptions WHERE user_id=?", [userA]);
  assert.equal(Number(c2), 0);
});

test("a user cannot unsubscribe another user's subscription", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const ep = "https://example.push/endpoint-B";
  await request(app).post("/api/users/push-subscribe")
    .set("Authorization", `Bearer ${token(userB)}`).send({ subscription: sub(ep) });
  // userA tries to delete userB's endpoint
  const ures = await request(app).delete("/api/users/push-subscribe")
    .set("Authorization", `Bearer ${token(userA)}`).send({ endpoint: ep });
  assert.equal(ures.body.removed, 0, "own-only scope prevents cross-user deletion");
  const [[{ c }]] = await pool.query("SELECT COUNT(*) c FROM push_subscriptions WHERE user_id=?", [userB]);
  assert.equal(Number(c), 1, "userB subscription is intact");
});
