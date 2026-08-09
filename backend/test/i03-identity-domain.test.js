/**
 * I-03 — identity domain
 *
 * The null-hash bypass (P0-1) is the property under test. Phase 0.5 fixed it
 * with a conditional in one route; this asserts the structural form — a
 * credential object that cannot exist without a verifiable hash.
 *
 * NEGATIVE CONTROLS, each executable:
 *   1. delete the `if (!isBcryptHash(secretHash)) throw` in
 *      domain/credential.js -> every "cannot be constructed" test fails
 *   2. make refreshTokenMatches() use `===` on the raw token
 *      -> the constant-time test fails
 *   3. drop the `revoked_at` check from isLive()
 *      -> "a revoked session is not live" fails
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const cred = require("../src/modules/identity/domain/credential");
const sess = require("../src/modules/identity/domain/session");
const { fixedClock } = require("../src/shared/clock");

const REAL_HASH = bcrypt.hashSync("correct horse battery staple", 4); // low cost: tests, not storage

// ── P0-1: a credential cannot exist without a verifiable hash ──

const NOT_HASHES = {
  null: null,
  undefined: undefined,
  "empty string": "",
  whitespace: "   ",
  plaintext: "hunter2",
  md5: "5f4dcc3b5aa765d61d8327deb882cf99",
  "truncated bcrypt": "$2a$10$N9qo8uLOickgx2ZMRZoMye",
  "wrong prefix": "$1a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
  "no cost": "$2a$$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
  number: 12345,
  object: { secret: "x" },
  array: ["$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"],
};

for (const [name, value] of Object.entries(NOT_HASHES)) {
  test(`P0-1: a PasswordCredential cannot be constructed from ${name}`, () => {
    assert.throws(
      () => new cred.PasswordCredential({ id: "c1", principalId: "p1", secretHash: value }),
      (err) => {
        assert.equal(err.name, "CredentialError");
        assert.equal(err.code, "INVALID_CREDENTIAL_HASH");
        return true;
      },
      "a credential that cannot be verified must not exist"
    );
  });

  test(`P0-1: fromRow returns null for ${name} — malformed is treated as absent`, () => {
    const c = cred.fromRow({ id: "c1", principal_id: "p1", secret_hash: value });
    assert.equal(c, null, "a malformed hash must be indistinguishable from no credential");
  });
}

test("fromRow returns null when there is no row at all", () => {
  assert.equal(cred.fromRow(null), null);
  assert.equal(cred.fromRow(undefined), null);
});

test("a valid credential verifies the correct password and rejects others", async () => {
  const c = new cred.PasswordCredential({ id: "c1", principalId: "p1", secretHash: REAL_HASH });
  assert.equal(await c.verify("correct horse battery staple"), true);
  assert.equal(await c.verify("wrong"), false);
  assert.equal(await c.verify(""), false);
  assert.equal(await c.verify(null), false);
  assert.equal(await c.verify(undefined), false);
  assert.equal(await c.verify(REAL_HASH), false, "the hash itself is not the password");
});

test("verifyAbsent always returns false and still runs a comparison", async () => {
  // The point is the timing, not the answer. If this returned early, "no such
  // account" would answer in microseconds and become an existence oracle.
  const t0 = process.hrtime.bigint();
  assert.equal(await cred.verifyAbsent("anything"), false);
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(elapsedMs > 1, `expected a real bcrypt comparison, took ${elapsedMs.toFixed(2)}ms`);
});

test("a credential is frozen once constructed", () => {
  const c = new cred.PasswordCredential({ id: "c1", principalId: "p1", secretHash: REAL_HASH });
  assert.equal(Object.isFrozen(c), true);
  // The observable property is that the hash cannot be swapped — not that the
  // assignment throws. A frozen object throws only in strict mode, and a
  // CommonJS test file is sloppy by default, so asserting on the throw would
  // be asserting on the caller's strictness rather than on the credential.
  c.secretHash = "$2a$10$" + "x".repeat(53);
  assert.equal(c.secretHash, REAL_HASH, "a credential's hash must not be replaceable");
});

// ── password acceptance rules ─────────────────────────────────

test("hashPassword refuses what cannot be a usable password", async () => {
  await assert.rejects(() => cred.hashPassword("short"), /at least 8/);
  await assert.rejects(() => cred.hashPassword(null), /must be a string/);
  await assert.rejects(() => cred.hashPassword(12345678), /must be a string/);
  // bcrypt silently ignores bytes past 72. Verifying only the first 72 of a
  // 500-character password, while telling the user it was accepted, is worse
  // than refusing it.
  await assert.rejects(() => cred.hashPassword("a".repeat(201)), /too long/);
});

test("hashPassword produces a hash the credential accepts", async () => {
  const hash = await cred.hashPassword("a good long password", 4);
  const c = new cred.PasswordCredential({ id: "c", principalId: "p", secretHash: hash });
  assert.equal(await c.verify("a good long password"), true);
});

test("legacy cost-10 hashes are flagged for rehash, current ones are not", () => {
  assert.equal(cred.needsRehash("$2a$10$" + "x".repeat(53)), true, "Phase 0.5 hashes are cost 10");
  assert.equal(cred.needsRehash("$2a$12$" + "x".repeat(53)), false);
  assert.equal(cred.needsRehash(null), false);
  assert.equal(cred.needsRehash("not a hash"), false);
});

// ── session rules ─────────────────────────────────────────────

test("a refresh token is returned once and only its hash is retained", () => {
  const { token, hash } = sess.issueRefreshToken();
  assert.ok(token.length >= 40, "token must carry real entropy");
  assert.equal(hash.length, 64, "SHA-256 hex");
  assert.notEqual(token, hash);
  assert.ok(!hash.includes(token), "the token must not be recoverable from the hash");
});

test("refresh tokens are unique across issuances", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(sess.issueRefreshToken().token);
  assert.equal(seen.size, 200);
});

test("refreshTokenMatches compares the presented token against a stored hash", () => {
  const { token, hash } = sess.issueRefreshToken();
  assert.equal(sess.refreshTokenMatches(token, hash), true);
  assert.equal(sess.refreshTokenMatches("wrong", hash), false);
  assert.equal(sess.refreshTokenMatches(token, null), false);
  assert.equal(sess.refreshTokenMatches(token, "short"), false);
  // Flip the last hex digit to a DIFFERENT one. Appending a literal "0"
  // reproduced the original hash roughly one run in sixteen, and the test
  // then failed for the right reason on the wrong input.
  const flipped = hash.slice(0, 63) + (hash[63] === "0" ? "1" : "0");
  assert.notEqual(flipped, hash);
  assert.equal(sess.refreshTokenMatches(token, flipped), false);
});

test("a session is live only while unrevoked AND unexpired", () => {
  const clock = fixedClock(new Date("2026-08-09T12:00:00Z"));
  const { record } = sess.newSession({ id: "s1", principalId: "p1", clock });

  assert.equal(sess.isLive(record, clock.now()), true);

  // revoked but not yet expired — logout must actually end it
  const revoked = { ...record, revoked_at: clock.now() };
  assert.equal(sess.isLive(revoked, clock.now()), false, "a revoked session is still live");
  assert.equal(sess.unusableReason(revoked, clock.now()), "revoked");

  // expired but never revoked
  const later = fixedClock(new Date("2026-08-09T12:00:00Z")).advance(sess.REFRESH_TTL_MS + 1000);
  assert.equal(sess.isLive(record, later.now()), false);
  assert.equal(sess.unusableReason(record, later.now()), "expired");

  assert.equal(sess.isLive(null, clock.now()), false);
  assert.equal(sess.unusableReason(null, clock.now()), "unknown_session");
});

test("a session expires exactly at its boundary, not after it", () => {
  const start = new Date("2026-08-09T12:00:00Z");
  const clock = fixedClock(start);
  const { record } = sess.newSession({ id: "s1", principalId: "p1", clock });

  const justBefore = fixedClock(start).advance(sess.REFRESH_TTL_MS - 1);
  const exactly = fixedClock(start).advance(sess.REFRESH_TTL_MS);
  assert.equal(sess.isLive(record, justBefore.now()), true);
  assert.equal(sess.isLive(record, exactly.now()), false, "expiry must be inclusive of the boundary");
});

test("device and ip are bounded — a header cannot become a storage vector", () => {
  const clock = fixedClock(new Date("2026-08-09T12:00:00Z"));
  const { record } = sess.newSession({
    id: "s1", principalId: "p1", clock,
    device: "U".repeat(5000),
    ip: "9".repeat(500),
  });
  assert.equal(record.device.length, 200);
  assert.equal(record.ip.length, 45);
});

test("the access token is short-lived; the session carries the duration", () => {
  assert.equal(sess.accessTokenExpirySeconds(), 900);
  assert.ok(sess.REFRESH_TTL_MS > sess.ACCESS_TTL_MS * 100);
});

test("revocation reasons are a closed set", () => {
  for (const r of ["logout", "rotated", "admin", "credential_change", "reuse_detected"]) {
    assert.ok(sess.REVOCATION_REASONS.has(r));
  }
  assert.equal(sess.REVOCATION_REASONS.has("because"), false);
});
