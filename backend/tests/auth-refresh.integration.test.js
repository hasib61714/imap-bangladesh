// Integration tests for refresh-token rotation (needs a test DB).
// Run: RUN_DB_TESTS=1 with DB_* env. Self-skips otherwise.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

let pool, rt, dbReady = false, userId;

before(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  pool = require("../db");
  rt   = require("../utils/refreshTokens");
  try { await pool.query("SELECT 1"); } catch { return; }
  userId = randomUUID();
  await pool.query(
    "INSERT INTO users (id,name,phone,role,is_active) VALUES (?,?,?,?,1)",
    [userId, "RT test", "01955500001", "customer"]
  );
  dbReady = true;
});

after(async () => {
  if (!dbReady) return;
  await pool.query("DELETE FROM refresh_tokens WHERE user_id = ?", [userId]).catch(() => {});
  await pool.query("DELETE FROM users WHERE id = ?", [userId]).catch(() => {});
  await pool.end().catch(() => {});
});

test("refresh rotates the token", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const { token } = await rt.issue(pool, userId);
  const r = await rt.rotate(pool, token);
  assert.equal(r.ok, true);
  assert.notEqual(r.token, token, "a new token is issued");
});

test("an old (already-rotated) refresh token is rejected as reuse", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const { token } = await rt.issue(pool, userId);
  const first = await rt.rotate(pool, token);     // valid rotation
  assert.equal(first.ok, true);
  const reuse = await rt.rotate(pool, token);     // present the OLD token again
  assert.equal(reuse.ok, false);
  assert.equal(reuse.reuse, true, "reuse detected");
  // family is now revoked → the rotated token must also be dead
  const after = await rt.rotate(pool, first.token);
  assert.equal(after.ok, false, "whole family revoked after reuse");
});

test("logout (revoke) invalidates the token", async (t) => {
  if (!dbReady) return t.skip("no test DB");
  const { token } = await rt.issue(pool, userId);
  assert.equal(await rt.revoke(pool, token), true);
  const r = await rt.rotate(pool, token);
  assert.equal(r.ok, false, "revoked token cannot be rotated");
});
