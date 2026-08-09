/**
 * P0-1 — password login must fail closed when no password hash is stored.
 * P0-2 — social login must not issue a session from a client-supplied id.
 *
 * Audit evidence: docs/audit/SECURITY-GAPS.md P0-1, P0-2
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { makePool, installFakeDb, resetModules, serve, call } = require("./helpers/harness");

const AUTH_ROUTE = "../routes/auth";

/** A user created through OTP or a social flow: no password credential. */
const passwordlessUser = {
  id: "u-otp-1", name: "OTP User", email: null, phone: "01710000000",
  password_hash: null, role: "customer", is_active: 1, balance: 0, points: 0,
};

async function bootAuth(pool) {
  resetModules(AUTH_ROUTE, "../middleware/auth", "../utils/money");
  installFakeDb(pool);
  const router = require(AUTH_ROUTE);
  return serve(router);
}

test("P0-1: login with a NULL password_hash is rejected", async (t) => {
  const pool = makePool([
    { match: "FROM users WHERE (email = ? OR phone = ?)", rows: [passwordlessUser] },
  ]);
  const srv = await bootAuth(pool);
  t.after(() => srv.close());

  for (const password of ["anything", "", "hunter2", "null"]) {
    const res = await call(srv.url, "POST", "/login", {
      identifier: "01710000000",
      password,
    });
    assert.equal(res.status, 401, `password "${password}" must not authenticate`);
    assert.ok(!res.body.token, "no token may be issued");
  }
});

test("P0-1: login with a NULL password_hash does not leak that the account exists", async (t) => {
  const withUser = makePool([
    { match: "FROM users WHERE (email = ? OR phone = ?)", rows: [passwordlessUser] },
  ]);
  const srvA = await bootAuth(withUser);
  const a = await call(srvA.url, "POST", "/login", { identifier: "01710000000", password: "x" });
  await srvA.close();

  const noUser = makePool([
    { match: "FROM users WHERE (email = ? OR phone = ?)", rows: [] },
  ]);
  const srvB = await bootAuth(noUser);
  const b = await call(srvB.url, "POST", "/login", { identifier: "01799999999", password: "x" });
  await srvB.close();

  assert.equal(a.status, b.status);
  assert.equal(a.body.error, b.body.error, "responses must be indistinguishable");
});

test("P0-1: a correct password still logs in when a hash IS stored", async (t) => {
  const hash = await bcrypt.hash("correct-horse-battery", 10);
  const pool = makePool([
    {
      match: "FROM users WHERE (email = ? OR phone = ?)",
      rows: [{ ...passwordlessUser, id: "u-pw-1", password_hash: hash }],
    },
  ]);
  const srv = await bootAuth(pool);
  t.after(() => srv.close());

  const ok = await call(srv.url, "POST", "/login", {
    identifier: "01710000000", password: "correct-horse-battery",
  });
  assert.equal(ok.status, 200, "a valid credential must still work");
  assert.ok(ok.body.token, "a token is issued for a valid credential");
  assert.equal(ok.body.user.password_hash, undefined, "the hash is never returned");

  const bad = await call(srv.url, "POST", "/login", {
    identifier: "01710000000", password: "wrong",
  });
  assert.equal(bad.status, 401);
});

test("P0-2: social-login cannot mint a session from a supplied socialId", async (t) => {
  // The old handler looked up social_id and returned a token if it existed.
  // If that path were still reachable this row would produce one.
  const pool = makePool([
    { match: "FROM users WHERE social_id = ?", rows: [{ ...passwordlessUser, social_id: "1078219411" }] },
  ]);
  const srv = await bootAuth(pool);
  t.after(() => srv.close());

  const res = await call(srv.url, "POST", "/social-login", {
    provider: "google",
    socialId: "1078219411",           // a Google `sub` is public, not secret
    email: "victim@example.com",
    name: "Victim",
  });

  assert.equal(res.status, 410, "the endpoint must be gone, not merely erroring");
  assert.ok(!res.body.token, "no token may be issued");
  assert.equal(res.body.code, "SOCIAL_LOGIN_DISABLED");
  assert.ok(!pool.ran("FROM users WHERE social_id"), "it must not even look the account up");
});

test("P0-2: register cannot bind a social identity chosen by the client", async (t) => {
  const pool = makePool([
    { match: "SELECT id FROM users WHERE email = ?", rows: [] },
    { match: "SELECT id FROM users WHERE phone = ?", rows: [] },
    { match: "INSERT INTO users", rows: { insertId: 1, affectedRows: 1 } },
    { match: "SELECT id, name, email, phone, role", rows: [{ id: "new-1", name: "A", role: "customer" }] },
  ]);
  const srv = await bootAuth(pool);
  t.after(() => srv.close());

  await call(srv.url, "POST", "/register", {
    name: "Attacker",
    email: "attacker@example.com",
    password: "sufficiently-long-password",
    socialId: "1078219411",           // the victim's Google subject id
    loginMethod: "google",
  });

  const inserts = pool.all("INSERT INTO users");
  assert.equal(inserts.length, 1, "one user row is written");
  assert.ok(
    !inserts[0].params.includes("1078219411"),
    "the client-supplied socialId must never reach the users row"
  );
});
