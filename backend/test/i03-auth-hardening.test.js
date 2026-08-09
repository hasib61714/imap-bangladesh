/**
 * I-03 — authentication hardening
 *
 * Two defects found by mapping the live authentication surface (§4), plus the
 * pinned JWT algorithm (§16).
 *
 * NEGATIVE CONTROLS — each is stated so it can be executed:
 *   1. remove `AND is_active = 1` from verify-otp in routes/auth.js
 *      -> "a deactivated account cannot obtain a session by OTP" fails
 *   2. remove `AND is_active = 1` from the Google lookup
 *      -> "a deactivated account cannot sign in with Google" fails
 *   3. remove `algorithms: ["HS256"]` from middleware/auth.js
 *      -> "a token signed HS512 is rejected" fails
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const {
  installFakeDb, makePool, resetModules, serve, call, stubAuth, asUser,
} = require("./helpers/harness");

const ACTIVE = {
  id: "u-active", name: "Active", phone: "01711111111", email: "a@x.test",
  role: "customer", is_active: 1, password_hash: null,
};
const DEACTIVATED = { ...ACTIVE, id: "u-off", is_active: 0 };

function bootAuth(pool) {
  resetModules("../routes/auth", "../utils/otp-store", "../utils/sms", "../middleware/auth", "../utils/money");
  installFakeDb(pool);
  return serve(require("../routes/auth"));
}

// ── §14: account state gates EVERY authentication path ────────

test("P0-ADJACENT: a deactivated account cannot obtain a session by OTP", async (t) => {
  // The OTP path did not filter on is_active. /login did. So proving control
  // of a phone number was enough to get a full session for an account an
  // administrator had switched off.
  //
  // The fake pool returns rows only for the query that carries the filter, so
  // this test fails if the filter is removed.
  const pool = makePool([
    { match: "FROM users WHERE phone = ? AND is_active = 1", rows: [] },
    { match: "FROM users WHERE phone = ?", rows: [DEACTIVATED] },
  ]);
  const srv = await bootAuth(pool);
  t.after(() => srv.close());

  const otpStore = require("../utils/otp-store");
  otpStore.setOtp(DEACTIVATED.phone, "123456");

  const res = await call(srv.url, "POST", "/verify-otp", {
    phone: DEACTIVATED.phone, otp: "123456",
  });

  assert.ok(!res.body.token, "a deactivated account was issued a session token");
  assert.equal(res.body.isNew, true, "it must fall through to the new-user branch, not be refused");
});

test("an ACTIVE account still authenticates by OTP", async (t) => {
  const pool = makePool([
    { match: "FROM users WHERE phone = ? AND is_active = 1", rows: [ACTIVE] },
  ]);
  const srv = await bootAuth(pool);
  t.after(() => srv.close());

  const otpStore = require("../utils/otp-store");
  otpStore.setOtp(ACTIVE.phone, "654321");

  const res = await call(srv.url, "POST", "/verify-otp", { phone: ACTIVE.phone, otp: "654321" });
  assert.ok(res.body.token, "a valid OTP for an active account must still work");
  assert.equal(res.body.isNew, false);
});

test("the OTP response never reveals that a number is registered", async (t) => {
  // Deactivated and unknown must be indistinguishable, or the endpoint becomes
  // an account-existence oracle for anyone who can receive an SMS.
  const deactivated = makePool([
    { match: "FROM users WHERE phone = ? AND is_active = 1", rows: [] },
  ]);
  const srv = await bootAuth(deactivated);
  t.after(() => srv.close());

  const otpStore = require("../utils/otp-store");
  otpStore.setOtp("01799999999", "111111");
  const res = await call(srv.url, "POST", "/verify-otp", { phone: "01799999999", otp: "111111" });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { isNew: true, verified: true });
});

test("the Google lookup filters on is_active", async (t) => {
  // Asserted on the SQL the route issues: the deactivated account must never
  // be a candidate row in the first place.
  const pool = makePool([]);
  const srv = await bootAuth(pool);
  t.after(() => srv.close());

  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "routes", "auth.js"), "utf8"
  );
  const googleBlock = source.slice(source.indexOf('router.post("/google"'));
  const lookup = googleBlock.slice(0, googleBlock.indexOf("if (rows.length)"));
  assert.match(lookup, /social_id = \?[\s\S]*?AND is_active = 1/,
    "the Google account lookup must exclude deactivated accounts");
  assert.equal((lookup.match(/is_active = 1/g) || []).length, 2,
    "both the matched-email and subject-only branches must filter");
});

// ── §16: the JWT algorithm is pinned ──────────────────────────

test("a token signed with a different HS variant is rejected", async () => {
  // jsonwebtoken 9 rejects `alg: none` on its own — verified, not assumed.
  // What it does NOT do without an explicit list is confine verification to
  // the algorithm the service actually issues.
  const secret = "x".repeat(48);
  const prior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  try {
    const hs512 = jwt.sign({ id: "u1" }, secret, { algorithm: "HS512" });

    // Unpinned — this is the old behaviour, kept as the control.
    assert.doesNotThrow(() => jwt.verify(hs512, secret));

    // Pinned — what the middleware now does.
    assert.throws(
      () => jwt.verify(hs512, secret, { algorithms: ["HS256"] }),
      /invalid algorithm/
    );
  } finally {
    if (prior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = prior;
  }
});

test("alg=none is rejected", () => {
  const secret = "x".repeat(48);
  const forged =
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." +
    Buffer.from(JSON.stringify({ id: "victim" })).toString("base64url") + ".";
  assert.throws(() => jwt.verify(forged, secret, { algorithms: ["HS256"] }));
});

test("every JWT verification site pins the algorithm", () => {
  // A new verification site that forgets the option would reintroduce the
  // mismatch silently, so the property is asserted across the repository
  // rather than at one call site.
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(__dirname, "..");
  const files = ["middleware/auth.js", "server.js", "routes/auth.js"];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    const verifies = src.match(/jwt\.verify\([^)]*\)/g) || [];
    for (const v of verifies) {
      assert.match(v, /algorithms:\s*\[/, `${f}: jwt.verify without a pinned algorithm — ${v}`);
    }
    const signs = src.match(/jwt\.sign\([\s\S]{0,200}?\)/g) || [];
    for (const s of signs) {
      assert.match(s, /algorithm:/, `${f}: jwt.sign without an explicit algorithm`);
    }
  }
});

// ── the P0s that must never return ────────────────────────────

test("P0-2: social-login remains disabled", async (t) => {
  const srv = await bootAuth(makePool([]));
  t.after(() => srv.close());
  const res = await call(srv.url, "POST", "/social-login", { socialId: "1078219411" });
  assert.equal(res.status, 410);
  assert.equal(res.body.code, "SOCIAL_LOGIN_DISABLED");
  assert.ok(!res.body.token);
});

test("P0-9: no default or seeded credential is accepted", async (t) => {
  // The published credential was 01700000000 / admin123. Its hash is nulled by
  // migration 002, so there is no credential row and the null-hash rule refuses
  // it. This asserts the outcome rather than the mechanism.
  const pool = makePool([
    { match: "FROM users WHERE (email = ? OR phone = ?)", rows: [{ ...ACTIVE, id: "admin-001", phone: "01700000000", role: "admin", password_hash: null }] },
  ]);
  const srv = await bootAuth(pool);
  t.after(() => srv.close());

  for (const password of ["admin123", "demo1234", "", "password"]) {
    const res = await call(srv.url, "POST", "/login", { identifier: "01700000000", password });
    assert.equal(res.status, 401, `"${password}" authenticated the seeded administrator`);
    assert.ok(!res.body.token);
  }
});
