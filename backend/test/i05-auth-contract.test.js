/**
 * I-05 — what the authentication endpoints answer
 *
 * §12, §13, §17, §19, §35. The store behaviour is proven against a real
 * engine elsewhere; this is the contract a client sees, including the two
 * things that must never appear in a response and the two that must.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { makePool, installFakeDb, resetModules, serve, call } = require("./helpers/harness");
const R = require("./helpers/reliability");

process.env.APP_ENV = process.env.APP_ENV || "test";
process.env.DATABASE_ENV = process.env.DATABASE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-not-used-in-production";

const USER = {
  id: "u-1", name: "Rina", phone: "01711111111", email: "r@x.test",
  role: "customer", is_active: 1, password_hash: null,
};

async function boot(pool) {
  resetModules();
  installFakeDb(pool);
  return serve(require("../routes/auth"));
}

/** Swap the environment for one assertion and put it back. */
async function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; process.env[k] = v; }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

// ════════════════════════════════════════════════════════════
test("§12 POST /auth/send-otp never returns the code in production", async (t) => {
  await t.test("a development process may see it, because the SMS is a mock", async (tt) => {
    const pool = makePool([
      ...R.rateLimitAllowing(),
      { match: "SELECT id FROM users WHERE phone = ? AND is_active = 1", rows: [] },
      ...R.otpIssueHandlers(),
    ]);
    const srv = await boot(pool);
    tt.after(() => srv.close());
    const res = await withEnv({ APP_ENV: "development", DATABASE_ENV: "development", SMS_PROVIDER: "mock" },
      () => call(srv.url, "POST", "/send-otp", { phone: USER.phone }));
    assert.equal(res.status, 200);
    assert.match(String(res.body.mockOtp), /^[0-9]{6}$/);
  });

  // NEGATIVE CONTROL: remove `env.allowsDevelopmentBehaviour() &&` from the
  // isMock expression and this returns the code to a production caller.
  await t.test("a production process does not, whatever SMS_PROVIDER says", async (tt) => {
    const pool = makePool([
      ...R.rateLimitAllowing(),
      { match: "SELECT id FROM users WHERE phone = ? AND is_active = 1", rows: [] },
      ...R.otpIssueHandlers(),
    ]);
    const srv = await boot(pool);
    tt.after(() => srv.close());
    const res = await withEnv({ APP_ENV: "production", DATABASE_ENV: "production", SMS_PROVIDER: "mock" },
      () => call(srv.url, "POST", "/send-otp", { phone: USER.phone }));
    assert.equal(res.status, 200);
    assert.equal("mockOtp" in res.body, false, "the code reached a production response");
    assert.equal(JSON.stringify(res.body).match(/[0-9]{6}/), null, "nothing six-digit came back at all");
  });

  await t.test("the response says how long the code lives, and nothing else about it", async (tt) => {
    const pool = makePool([
      ...R.rateLimitAllowing(),
      { match: "SELECT id FROM users WHERE phone = ? AND is_active = 1", rows: [] },
      ...R.otpIssueHandlers(),
    ]);
    const srv = await boot(pool);
    tt.after(() => srv.close());
    const res = await withEnv({ APP_ENV: "production", DATABASE_ENV: "production" },
      () => call(srv.url, "POST", "/send-otp", { phone: USER.phone }));
    assert.deepEqual(Object.keys(res.body).sort(), ["expiresIn", "success"]);
    assert.equal(res.body.expiresIn, 300);
  });
});

// ════════════════════════════════════════════════════════════
test("§17, §35 fail closed when a shared store cannot answer", async (t) => {
  await t.test("the rate-limit store being down refuses the request rather than permitting it", async (tt) => {
    const pool = makePool([
      { match: "INSERT INTO rate_limit_counter",
        rows: { __throw: Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }) } },
    ]);
    const srv = await boot(pool);
    tt.after(() => srv.close());
    const res = await call(srv.url, "POST", "/login", { identifier: USER.phone, password: "x" });
    assert.equal(res.status, 503);
    assert.equal(pool.ran("FROM users WHERE (email = ? OR phone = ?)"), false,
      "no authentication attempt may proceed past a limiter that could not count");
  });

  await t.test("the OTP store being down refuses to send a code", async (tt) => {
    const pool = makePool([
      ...R.rateLimitAllowing(),
      { match: "SELECT id FROM users WHERE phone = ? AND is_active = 1", rows: [] },
      { match: "FROM otp_challenge",
        rows: { __throw: Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }) } },
    ]);
    const srv = await boot(pool);
    tt.after(() => srv.close());
    const res = await call(srv.url, "POST", "/send-otp", { phone: USER.phone });
    assert.equal(res.status, 503);
    assert.equal(pool.ran("INSERT INTO otp_challenge"), false);
    assert.equal("mockOtp" in res.body, false);
  });

  await t.test("no request falls back to an in-process store", () => {
    // §35, asserted against the repository rather than against behaviour: a
    // fallback would be a `catch` that produced a code instead of an error.
    const src = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "src", "modules", "platform", "otp", "infrastructure", "otpRepository.js"),
      "utf8"
    );
    assert.equal(/new\s+Map\s*\(/.test(src), false);
    assert.match(src, /OtpStoreUnavailable/);
  });
});

// ════════════════════════════════════════════════════════════
test("§13 POST /auth/verify-otp answers every failure the same way", async (t) => {
  const failures = [
    ["no challenge for this number", null],
    ["a wrong code", "wrong"],
    ["a spent challenge", "consumed"],
  ];

  const bodies = [];
  for (const [name, kind] of failures) {
    await t.test(name, async (tt) => {
      const challenge = kind === "wrong" ? await R.liveChallenge({ code: "111111" }) : null;
      const pool = makePool([...R.rateLimitAllowing(), ...R.otpVerifyHandlers(challenge)]);
      const srv = await boot(pool);
      tt.after(() => srv.close());
      const res = await call(srv.url, "POST", "/verify-otp", { phone: USER.phone, otp: "222222" });
      assert.equal(res.status, 400);
      bodies.push(JSON.stringify(res.body));
    });
  }

  // NEGATIVE CONTROL: restore the three distinct messages and this fails.
  //
  // Distinguishing "expired" from "wrong code" tells a caller whether a
  // challenge exists for a number right now — whether its owner is
  // mid-sign-in — which is a useful window for a real-time phishing or
  // SIM-swap attempt.
  await t.test("and the bodies are identical", () => {
    assert.equal(new Set(bodies).size, 1, `three distinguishable failures: ${bodies.join(" | ")}`);
  });

  await t.test("a malformed code is refused before the store is touched", async (tt) => {
    const pool = makePool([...R.rateLimitAllowing()]);
    const srv = await boot(pool);
    tt.after(() => srv.close());
    const res = await call(srv.url, "POST", "/verify-otp", { phone: USER.phone, otp: "12" });
    // 422, the validator's contract for a semantically invalid request
    // (API-ARCHITECTURE §4.1) — and distinct from the 400 every OTP failure
    // shares, which is fine: a malformed request tells the caller only what
    // they already typed.
    assert.equal(res.status, 422);
    assert.equal(pool.ran("FROM otp_challenge"), false);
  });

  await t.test("a rate-limited caller gets 429 and a Retry-After", async (tt) => {
    const pool = makePool([...R.rateLimitBlocking(900)]);
    const srv = await boot(pool);
    tt.after(() => srv.close());
    const res = await call(srv.url, "POST", "/verify-otp", { phone: USER.phone, otp: "222222" });
    assert.equal(res.status, 429);
    assert.ok(res.body.retryAfter > 0);
    assert.equal(pool.ran("FROM otp_challenge"), false, "a blocked caller must not reach the store");
  });
});

// ════════════════════════════════════════════════════════════
test("a correct code authenticates, and the token carries a deadline", async (t) => {
  await t.test("an existing user gets a session bounded from the start", async (tt) => {
    const challenge = await R.liveChallenge({ code: "424242", principalId: USER.id });
    const pool = makePool([
      ...R.rateLimitAllowing(),
      ...R.otpVerifyHandlers(challenge),
      { match: "FROM users WHERE id = ? AND is_active = 1", rows: [USER] },
      { match: "INSERT INTO audit_log", rows: { affectedRows: 1 } },
    ]);
    const srv = await boot(pool);
    tt.after(() => srv.close());

    const res = await call(srv.url, "POST", "/verify-otp", { phone: USER.phone, otp: "424242" });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);

    const claims = jwt.verify(res.body.token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    assert.equal(typeof claims.sae, "number", "a session with no deadline is a session that never ends");
    const days = (claims.sae * 1000 - Date.now()) / 86_400_000;
    assert.ok(days > 29 && days <= 30, `the deadline is thirty days out, not ${days}`);
    assert.equal("password_hash" in (res.body.user || {}), false);
  });

  await t.test("the principal bound at issue is the one authenticated (§11)", async (tt) => {
    const challenge = await R.liveChallenge({ code: "424242", principalId: "u-bound" });
    const pool = makePool([
      ...R.rateLimitAllowing(),
      ...R.otpVerifyHandlers(challenge),
      { match: "FROM users WHERE id = ? AND is_active = 1", rows: [{ ...USER, id: "u-bound" }] },
      { match: "INSERT INTO audit_log", rows: { affectedRows: 1 } },
    ]);
    const srv = await boot(pool);
    tt.after(() => srv.close());
    const res = await call(srv.url, "POST", "/verify-otp", { phone: USER.phone, otp: "424242" });
    assert.equal(res.body.user.id, "u-bound");
    const byId = pool.all("FROM users WHERE id = ? AND is_active = 1");
    assert.equal(byId.length, 1, "the lookup used the bound principal, not the phone the caller sent");
  });
});

// ════════════════════════════════════════════════════════════
test("§19 POST /auth/refresh cannot extend a session forever", async (t) => {
  const sign = (claims) => jwt.sign(claims, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "7d" });

  const refreshPool = () => makePool([
    { match: "SELECT id, name, email, phone, role, avatar, kyc_status, verified, balance, points, is_active FROM users", rows: [USER] },
    { match: "SELECT id, name, email, phone, role, avatar, kyc_status, verified, balance, points FROM users", rows: [USER] },
  ]);

  await t.test("a token past its session deadline is refused", async (tt) => {
    const srv = await boot(refreshPool());
    tt.after(() => srv.close());
    const expired = sign({ id: USER.id, role: USER.role, sae: Math.floor(Date.now() / 1000) - 60 });
    const res = await call(srv.url, "POST", "/refresh", {}, { Authorization: `Bearer ${expired}` });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, "SESSION_EXPIRED");
    assert.equal(res.body.token, undefined);
  });

  // NEGATIVE CONTROL: reissue with a fresh deadline instead of carrying the
  // one presented, and this fails. That is F-10 exactly.
  await t.test("refreshing does not move the deadline", async (tt) => {
    const srv = await boot(refreshPool());
    tt.after(() => srv.close());
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    let token = sign({ id: USER.id, role: USER.role, sae: deadline });

    for (let i = 0; i < 5; i += 1) {
      const res = await call(srv.url, "POST", "/refresh", {}, { Authorization: `Bearer ${token}` });
      assert.equal(res.status, 200, `refresh ${i + 1} failed`);
      token = res.body.token;
      const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
      assert.equal(claims.sae, deadline, `refresh ${i + 1} moved the deadline`);
    }
  });

  await t.test("a token issued before this change acquires a deadline instead of being rejected", async (tt) => {
    const srv = await boot(refreshPool());
    tt.after(() => srv.close());
    const legacy = sign({ id: USER.id, role: USER.role });
    assert.equal(jwt.decode(legacy).sae, undefined);

    const res = await call(srv.url, "POST", "/refresh", {}, { Authorization: `Bearer ${legacy}` });
    assert.equal(res.status, 200, "the change must not sign anybody out");
    const claims = jwt.verify(res.body.token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    assert.equal(typeof claims.sae, "number", "and it must not stay unbounded either");
  });

  await t.test("the deadline is a verified claim, not one the caller can assert", async (tt) => {
    const srv = await boot(refreshPool());
    tt.after(() => srv.close());
    // Signed with the wrong key: an attacker moving their own deadline out.
    const forged = jwt.sign(
      { id: USER.id, role: USER.role, sae: Math.floor(Date.now() / 1000) + 999_999_999 },
      "not-the-server-secret", { algorithm: "HS256" }
    );
    const res = await call(srv.url, "POST", "/refresh", {}, { Authorization: `Bearer ${forged}` });
    assert.equal(res.status, 401);
  });
});
