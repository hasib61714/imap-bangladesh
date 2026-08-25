/**
 * I-05 — the reliability primitives, against a real engine, from two instances
 *
 * §36 is explicit: "Do not claim actual distributed execution was proven if
 * only a single process was tested."
 *
 * WHAT "TWO INSTANCES" MEANS HERE, EXACTLY
 * ───────────────────────────────────────
 * Every test below drives TWO INDEPENDENT CONNECTION POOLS against one
 * database. Each pool has its own TCP connections, its own transactions and
 * its own locks, so from the engine's point of view they are two application
 * instances — which is the property under test. What they are not is two
 * operating-system processes, and that distinction is stated rather than
 * glossed: it would catch a bug in module-level caching that this harness
 * would not.
 *
 * It does catch the thing that actually mattered. The defect this phase
 * exists to fix — an OTP and its attempt counter living in a `Map` — is
 * invisible to a single pool and fails immediately against two.
 *
 * The concurrency tests fire N requests without awaiting in between, so they
 * are genuinely in flight together and genuinely contend for the same row.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const HOST = process.env.IMAP_TEST_DB_HOST;
const PORT = process.env.IMAP_TEST_DB_PORT || "3306";
const USER = process.env.IMAP_TEST_DB_USER || "root";
const PASS = process.env.IMAP_TEST_DB_PASSWORD || "";
const BACKEND = path.join(__dirname, "..", "..");
const SUITE = `imap_reliab_${process.pid}`;
const configured = Boolean(HOST);

const LOCAL = new Set(["127.0.0.1", "localhost", "::1", "host.docker.internal"]);
if (configured && !LOCAL.has(String(HOST).toLowerCase())) {
  throw new Error(`IMAP_TEST_DB_HOST=${HOST} is not loopback; these tests create and drop databases.`);
}

/** One "instance": its own pool, its own connections, its own locks. */
function instancePool(database) {
  const mysql = require("mysql2/promise");
  return mysql.createPool({
    host: HOST, port: Number(PORT), user: USER, password: PASS, database,
    connectionLimit: 8, waitForConnections: true,
  });
}

const childEnv = () => ({
  ...process.env,
  APP_ENV: "test", DATABASE_ENV: "test",
  DB_HOST: HOST, DB_PORT: PORT, DB_USER: USER, DB_PASSWORD: PASS,
  DB_NAME: SUITE, DB_SSL: "false",
});

test("reliability primitives across two instances", { skip: configured ? false : "IMAP_TEST_DB_HOST not set" }, async (t) => {
  const mysql = require("mysql2/promise");
  const admin = await mysql.createConnection({ host: HOST, port: Number(PORT), user: USER, password: PASS });
  await admin.query(`DROP DATABASE IF EXISTS \`${SUITE}\``);
  await admin.query(`CREATE DATABASE \`${SUITE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  execFileSync(process.execPath, ["scripts/migrate.js"], { cwd: BACKEND, env: childEnv(), stdio: ["ignore", "pipe", "pipe"] });

  // Two instances of the application, one database.
  const A = instancePool(SUITE);
  const B = instancePool(SUITE);
  const C = instancePool(SUITE);

  t.after(async () => {
    await Promise.all([A.end(), B.end(), C.end()]);
    await admin.query(`DROP DATABASE IF EXISTS \`${SUITE}\``);
    await admin.end();
  });

  const otp = require("../../src/modules/platform/otp");
  const limiter = require("../../src/modules/platform/ratelimit");
  const jobs = require("../../src/modules/platform/jobs");
  const sessions = require("../../src/modules/identity/infrastructure/sessionRepository");
  const { fixedClock } = require("../../src/shared/clock");

  const reset = async () => {
    await A.query("SET FOREIGN_KEY_CHECKS=0");
    for (const tbl of ["otp_challenge", "rate_limit_counter", "job", "session", "principal", "account"]) {
      await A.query(`DELETE FROM ${tbl}`);
    }
    await A.query("SET FOREIGN_KEY_CHECKS=1");
  };

  const PHONE = "01711111111";

  // ══════════════════════════════════════════════════════════
  //  §36 — OTP issued on A, verified on B
  // ══════════════════════════════════════════════════════════
  await t.test("an OTP issued by instance A verifies on instance B", async () => {
    await reset();
    const issued = await otp.issue(A, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE });
    assert.equal(issued.issued, true);

    const verified = await otp.verify(B, {
      purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, code: issued.code,
    });
    assert.equal(verified.ok, true, "the Map made this impossible: B had never seen the code");
  });

  // NEGATIVE CONTROL: remove the `status = 'active'` guard from the consuming
  // UPDATE in otpRepository.verify and this passes twice.
  await t.test("a code is single-use, and the second instance loses", async () => {
    await reset();
    const issued = await otp.issue(A, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE });
    const first = await otp.verify(A, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, code: issued.code });
    const second = await otp.verify(B, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, code: issued.code });
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(second.reason, "none", "a spent challenge is gone, not merely marked");
  });

  await t.test("two instances verifying the same code concurrently produce one success", async () => {
    await reset();
    const issued = await otp.issue(A, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE });
    const spec = { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, code: issued.code };
    const results = await Promise.all([otp.verify(A, spec), otp.verify(B, spec), otp.verify(C, spec)]);
    assert.equal(results.filter((r) => r.ok).length, 1, "a race must not let one code authenticate twice");
  });

  await t.test("the attempt counter is shared, so wrong guesses on A count on B", async () => {
    await reset();
    await otp.issue(A, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE });
    const wrong = { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, code: "000000" };
    // Alternate instances, which is what a load balancer does.
    const pools = [A, B, A, B];
    const reasons = [];
    for (const pool of pools) reasons.push((await otp.verify(pool, wrong)).reason);
    assert.deepEqual(reasons, ["invalid", "invalid", "invalid", "invalid"]);
    const fifth = await otp.verify(A, wrong);
    assert.equal(fifth.reason, "blocked",
      "with a per-instance Map this would have been the second attempt on A, not the fifth");
  });

  await t.test("an expired code does not verify", async () => {
    await reset();
    const t0 = fixedClock(new Date("2026-08-09T10:00:00Z"));
    const issued = await otp.issue(A, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, clock: t0 });
    const late = fixedClock(new Date("2026-08-09T10:05:01Z"));
    const r = await otp.verify(B, {
      purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, code: issued.code, clock: late,
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "expired");
  });

  // NEGATIVE CONTROL: change `purpose` to a wildcard in the verify query and
  // this passes.
  await t.test("§10 a code issued for one purpose does not verify for another", async () => {
    await reset();
    const issued = await otp.issue(A, {
      purpose: otp.PURPOSE.PHONE_VERIFICATION, channel: "phone", destination: PHONE,
    });
    const asLogin = await otp.verify(B, {
      purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, code: issued.code,
    });
    assert.equal(asLogin.ok, false, "proving control of a number is not the same as signing in");
    const asIssued = await otp.verify(B, {
      purpose: otp.PURPOSE.PHONE_VERIFICATION, channel: "phone", destination: PHONE, code: issued.code,
    });
    assert.equal(asIssued.ok, true);
  });

  await t.test("§11 a code is bound to its destination, so it cannot be spent on another", async () => {
    await reset();
    const issued = await otp.issue(A, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE });
    const elsewhere = await otp.verify(B, {
      purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: "01799999999", code: issued.code,
    });
    assert.equal(elsewhere.ok, false);
  });

  await t.test("§11 the principal resolved at issue is what verification returns", async () => {
    await reset();
    const issued = await otp.issue(A, {
      purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, principalId: "user-42",
    });
    const r = await otp.verify(B, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, code: issued.code });
    assert.equal(r.principalId, "user-42");
  });

  await t.test("a resend is throttled, and only one live challenge can exist", async () => {
    await reset();
    const first = await otp.issue(A, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE });
    assert.equal(first.issued, true);
    const second = await otp.issue(B, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE });
    assert.equal(second.issued, false);
    assert.equal(second.reason, "throttled");

    const [[{ n }]] = await A.query(
      "SELECT COUNT(*) AS n FROM otp_challenge WHERE status = 'active' AND destination_hash = ?",
      [otp.hashDestination("phone", PHONE)]
    );
    assert.equal(Number(n), 1);
  });

  await t.test("§9 a superseded code stops working once the cooldown has passed", async () => {
    await reset();
    const t0 = fixedClock(new Date("2026-08-09T10:00:00Z"));
    const first = await otp.issue(A, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, clock: t0 });
    const later = fixedClock(new Date("2026-08-09T10:01:30Z"));
    const second = await otp.issue(B, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, clock: later });
    assert.equal(second.issued, true, "past the resend cooldown, a new code may be sent");

    const old = await otp.verify(A, {
      purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, code: first.code, clock: later,
    });
    assert.equal(old.ok, false, "an SMS an attacker already saw must not still work");
    const fresh = await otp.verify(A, {
      purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE, code: second.code, clock: later,
    });
    assert.equal(fresh.ok, true);
  });

  await t.test("concurrent issues from two instances leave exactly one live challenge", async () => {
    await reset();
    const spec = { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE };
    const results = await Promise.all([otp.issue(A, spec), otp.issue(B, spec), otp.issue(C, spec)]);
    assert.equal(results.filter((r) => r.issued).length, 1, "three racing sends must not send three codes");
    const [[{ n }]] = await A.query("SELECT COUNT(*) AS n FROM otp_challenge WHERE status = 'active'");
    assert.equal(Number(n), 1);
  });

  await t.test("the destination is normalised, so formatting buys nothing", async () => {
    await reset();
    const issued = await otp.issue(A, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: "01799-999999" });
    const blocked = await otp.issue(B, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: "01799999999" });
    assert.equal(blocked.issued, false, "F-11: the same number written two ways is one destination");
    const r = await otp.verify(B, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: "01799999999", code: issued.code });
    assert.equal(r.ok, true);
  });

  await t.test("the code is never stored in clear", async () => {
    await reset();
    const issued = await otp.issue(A, { purpose: otp.PURPOSE.LOGIN, channel: "phone", destination: PHONE });
    const [rows] = await A.query("SELECT * FROM otp_challenge LIMIT 1");
    const dumped = JSON.stringify(rows[0]);
    assert.equal(dumped.includes(issued.code), false, "the code appeared in the row");
    assert.equal(dumped.includes(PHONE), false, "the destination appeared in the row");
    assert.match(rows[0].code_hash, /^\$2[aby]\$/, "and what is stored is a bcrypt hash");
  });

  // ══════════════════════════════════════════════════════════
  //  §16, §18 — rate limiting, shared and atomic
  // ══════════════════════════════════════════════════════════
  await t.test("§18 a limit counted on A is enforced on B", async () => {
    await reset();
    const dims = { identifier: "victim@example.test", ip: "203.0.113.7" };
    // auth.login permits 5 per identifier. Spend four on A.
    for (let i = 0; i < 4; i += 1) {
      const r = await limiter.consume(A, "auth.login", dims);
      assert.equal(r.allowed, true, `attempt ${i + 1} should be permitted`);
    }
    const fifth = await limiter.consume(B, "auth.login", dims);
    assert.equal(fifth.allowed, true, "the fifth is the last permitted one");
    const sixth = await limiter.consume(B, "auth.login", dims);
    assert.equal(sixth.allowed, false, "with a per-instance MemoryStore B would have counted this as its first");
    assert.equal(sixth.limitedBy, "identifier");
    assert.ok(sixth.retryAfterSeconds > 0);
  });

  // NEGATIVE CONTROL: replace the atomic INSERT..ON DUPLICATE KEY UPDATE with
  // a SELECT then an UPDATE and this over-permits.
  await t.test("§16 twelve concurrent attempts across three instances permit exactly the limit", async () => {
    await reset();
    const dims = { identifier: "race@example.test", ip: "203.0.113.9" };
    const pools = [A, B, C];
    const inFlight = [];
    for (let i = 0; i < 12; i += 1) inFlight.push(limiter.consume(pools[i % 3], "auth.login", dims));
    const results = await Promise.all(inFlight);
    const permitted = results.filter((r) => r.allowed).length;
    assert.equal(permitted, 5,
      `a two-instance race must not permit more than the limit — permitted ${permitted}`);
  });

  await t.test("both dimensions are enforced, and either can be the one that trips", async () => {
    await reset();
    // auth.otp_request permits 5 per destination and 15 per IP. Five distinct
    // destinations from one address spends the IP budget without any single
    // destination reaching its own.
    let lastResult = null;
    for (let i = 0; i < 16; i += 1) {
      lastResult = await limiter.consume(A, "auth.otp_request", {
        destination: `0171000${String(i).padStart(4, "0")}`, ip: "198.51.100.4",
      });
    }
    assert.equal(lastResult.allowed, false);
    assert.equal(lastResult.limitedBy, "ip", "a botnet spreading across numbers must still trip the address rule");
  });

  await t.test("a missing dimension denies rather than being skipped", async () => {
    await reset();
    const r = await limiter.consume(A, "auth.login", { identifier: "x@y.test" });
    assert.equal(r.allowed, false, "a rule that cannot be evaluated is not a rule that passes");
    assert.equal(r.reason, "unevaluatable");
  });

  await t.test("a successful authentication clears its own counter but not the address's", async () => {
    await reset();
    const dims = { identifier: "ok@example.test", ip: "203.0.113.11" };
    for (let i = 0; i < 4; i += 1) await limiter.consume(A, "auth.login", dims);
    await limiter.forget(B, "auth.login", "identifier", dims.identifier);
    const after = await limiter.consume(B, "auth.login", dims);
    assert.equal(after.hits.identifier, 1, "the identifier counter restarted");
    assert.equal(after.hits.ip, 5, "the address counter did not — clearing it would let an attacker reset their own");
  });

  await t.test("§17 an unreachable store raises rather than permitting", async () => {
    const dead = { getConnection: async () => { throw Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }); } };
    await assert.rejects(
      () => limiter.consume(dead, "auth.login", { identifier: "a", ip: "b" }),
      (err) => { assert.equal(err.name, "RateLimitUnavailable"); assert.equal(err.status, 503); return true; },
      "a limiter that permits because it could not count is not a limiter"
    );
  });

  // ══════════════════════════════════════════════════════════
  //  §19–§25 — sessions
  // ══════════════════════════════════════════════════════════
  const seedPrincipal = async (id = "p-sess") => {
    await A.query("INSERT INTO principal (id, status) VALUES (?, 'active')", [id]);
    return id;
  };

  await t.test("§21 a session created on A is revoked on B, and A then refuses to refresh it", async () => {
    await reset();
    const pid = await seedPrincipal();
    const created = await sessions.create(A, { principalId: pid, device: "test", ip: "203.0.113.1" });

    const revoked = await sessions.revoke(B, { sessionId: created.sessionId, reason: "logout" });
    assert.equal(revoked, 1);

    const rotated = await sessions.rotate(A, { refreshToken: created.refreshToken });
    assert.equal(rotated.ok, false);
    assert.equal(rotated.reason, "revoked", "logout must be a server-side fact, not a deleted browser token");
  });

  // NEGATIVE CONTROL: have rotate() insert `expires_at = now + REFRESH_TTL_MS`
  // instead of inheriting the old row's, and this fails. That is F-10.
  await t.test("§20 rotation does not extend the session's absolute deadline", async () => {
    await reset();
    const pid = await seedPrincipal("p-rot");
    const t0 = fixedClock(new Date("2026-08-09T10:00:00Z"));
    const created = await sessions.create(A, { principalId: pid, clock: t0 });

    let token = created.refreshToken;
    let deadline = null;
    for (let day = 1; day <= 5; day += 1) {
      const at = fixedClock(new Date(`2026-08-${String(9 + day).padStart(2, "0")}T10:00:00Z`));
      const r = await sessions.rotate(B, { refreshToken: token, clock: at });
      assert.equal(r.ok, true, `rotation ${day} failed`);
      token = r.refreshToken;
      deadline = r.expiresAt;
    }
    assert.equal(
      new Date(deadline).getTime(), new Date(created.expiresAt).getTime(),
      "five refreshes must not have moved the deadline — that is exactly how a session became eternal"
    );
  });

  await t.test("§20 replaying a rotated refresh token ends every session for that principal", async () => {
    await reset();
    const pid = await seedPrincipal("p-reuse");
    const first = await sessions.create(A, { principalId: pid });
    const alsoLive = await sessions.create(A, { principalId: pid, device: "phone" });

    const rotated = await sessions.rotate(A, { refreshToken: first.refreshToken });
    assert.equal(rotated.ok, true);

    // The old token, presented again. Two parties hold it and neither can be
    // identified as the user.
    const replay = await sessions.rotate(B, { refreshToken: first.refreshToken });
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, "reuse_detected");
    assert.ok(replay.revokedSessions >= 2, "the rotated token's successor and the other device both end");

    const survivor = await sessions.rotate(A, { refreshToken: alsoLive.refreshToken });
    assert.equal(survivor.ok, false, "an unrelated live session must also be ended");
  });

  await t.test("§22 a security event ends every live session at once", async () => {
    await reset();
    const pid = await seedPrincipal("p-mass");
    const a = await sessions.create(A, { principalId: pid });
    const b = await sessions.create(B, { principalId: pid });
    const n = await sessions.revokeAllForPrincipal(C, { principalId: pid, reason: "credential_change" });
    assert.equal(n, 2);
    assert.equal((await sessions.rotate(A, { refreshToken: a.refreshToken })).ok, false);
    assert.equal((await sessions.rotate(B, { refreshToken: b.refreshToken })).ok, false);
  });

  await t.test("§23 the refresh token is never stored", async () => {
    await reset();
    const pid = await seedPrincipal("p-hash");
    const created = await A.query ? await sessions.create(A, { principalId: pid }) : null;
    const [rows] = await A.query("SELECT * FROM session LIMIT 1");
    assert.equal(JSON.stringify(rows[0]).includes(created.refreshToken), false);
    assert.match(rows[0].refresh_token_hash, /^[0-9a-f]{64}$/);
  });

  await t.test("§24 authentication mints a new session rather than promoting an old identifier", async () => {
    await reset();
    const pid = await seedPrincipal("p-fix");
    const one = await sessions.create(A, { principalId: pid });
    const two = await sessions.create(A, { principalId: pid });
    assert.notEqual(one.sessionId, two.sessionId);
    assert.notEqual(one.refreshToken, two.refreshToken);
  });

  await t.test("two instances rotating the same token concurrently produce one new token", async () => {
    await reset();
    const pid = await seedPrincipal("p-race");
    const created = await sessions.create(A, { principalId: pid });
    const results = await Promise.all([
      sessions.rotate(A, { refreshToken: created.refreshToken }),
      sessions.rotate(B, { refreshToken: created.refreshToken }),
    ]);
    assert.equal(results.filter((r) => r.ok).length, 1);
  });

  // ══════════════════════════════════════════════════════════
  //  §26–§31 — jobs
  // ══════════════════════════════════════════════════════════
  await t.test("§28 the same idempotency key enqueues one job", async () => {
    await reset();
    const first = await jobs.enqueue(A, { kind: "test.noop", idempotencyKey: "k-1", payload: { n: 1 } });
    const again = await jobs.enqueue(B, { kind: "test.noop", idempotencyKey: "k-1", payload: { n: 2 } });
    assert.equal(first.created, true);
    assert.equal(again.created, false);
    assert.equal(again.id, first.id);
    const [[{ n }]] = await A.query("SELECT COUNT(*) AS n FROM job WHERE kind = 'test.noop'");
    assert.equal(Number(n), 1);
  });

  await t.test("a job with no key is always distinct", async () => {
    await reset();
    await jobs.enqueue(A, { kind: "test.noop" });
    await jobs.enqueue(B, { kind: "test.noop" });
    const [[{ n }]] = await A.query("SELECT COUNT(*) AS n FROM job");
    assert.equal(Number(n), 2, "NULL keys do not collide, which is what 'no natural key' should mean");
  });

  // NEGATIVE CONTROL: drop the status guard from the claim UPDATE and both
  // workers claim the same job.
  await t.test("§36 a job enqueued on A is claimed by exactly one of two workers", async () => {
    await reset();
    await jobs.enqueue(A, { kind: "test.noop", idempotencyKey: "solo" });
    const [claimedByB, claimedByC] = await Promise.all([
      jobs.claim(B, { owner: "worker-B", limit: 5 }),
      jobs.claim(C, { owner: "worker-C", limit: 5 }),
    ]);
    assert.equal(claimedByB.length + claimedByC.length, 1, "two workers must not both run one job");
  });

  await t.test("§29 only the lease holder may complete or fail a job", async () => {
    await reset();
    await jobs.enqueue(A, { kind: "test.noop", idempotencyKey: "owned" });
    const [job] = await jobs.claim(B, { owner: "worker-B" });
    assert.ok(job);

    assert.equal(await jobs.complete(C, { id: job.id, owner: "worker-C" }), false,
      "releasing another worker's lease is the classic distributed-lock defect");
    assert.equal(await jobs.complete(B, { id: job.id, owner: "worker-B" }), true);
  });

  // NEGATIVE CONTROL: remove the `lease_expires_at < NOW` branch from the
  // claim query and this job is stuck forever.
  await t.test("§31 a crashed worker's job is picked up once its lease expires", async () => {
    await reset();
    // Enqueued on the same fixed clock the claims use: `run_after` is a real
    // timestamp, so a claim on a clock set in the past finds no candidate and
    // the test would pass for the wrong reason.
    const t0 = fixedClock(new Date("2026-08-09T10:00:00Z"));
    await jobs.enqueue(A, { kind: "test.noop", idempotencyKey: "crash", clock: t0 });

    const [held] = await jobs.claim(B, { owner: "worker-B", leaseMs: 30_000, clock: t0 });
    assert.ok(held, "worker B claimed it");

    // Worker B dies here. It never completes, never fails, never renews —
    // which from the database is indistinguishable from a process that was
    // killed mid-handler.
    const during = fixedClock(new Date("2026-08-09T10:00:20Z"));
    assert.deepEqual(await jobs.claim(C, { owner: "worker-C", clock: during }), [],
      "while the lease is live, nobody else may take it");

    const after = fixedClock(new Date("2026-08-09T10:00:31Z"));
    const [recovered] = await jobs.claim(C, { owner: "worker-C", clock: after });
    assert.ok(recovered, "no job may be stuck forever because one process died");
    assert.equal(recovered.id, held.id);
    assert.equal(recovered.attempts, 2, "the recovery counts as an attempt, so it cannot loop unboundedly");
  });

  await t.test("§29 renewing keeps a long job, and only its holder may renew", async () => {
    await reset();
    const t0 = fixedClock(new Date("2026-08-09T11:00:00Z"));
    await jobs.enqueue(A, { kind: "test.noop", idempotencyKey: "long", clock: t0 });
    const [job] = await jobs.claim(B, { owner: "worker-B", leaseMs: 30_000, clock: t0 });

    const mid = fixedClock(new Date("2026-08-09T11:00:20Z"));
    assert.equal(await jobs.renew(B, { id: job.id, owner: "worker-B", leaseMs: 30_000, clock: mid }), true);
    assert.equal(await jobs.renew(C, { id: job.id, owner: "worker-C", clock: mid }), false);

    const later = fixedClock(new Date("2026-08-09T11:00:40Z"));
    assert.deepEqual(await jobs.claim(C, { owner: "worker-C", clock: later }), [],
      "a renewed lease is still held");
  });

  // NEGATIVE CONTROL: make nextRunAt ignore maxAttempts and the job retries
  // forever instead of dead-lettering.
  await t.test("§30 retries are bounded and end in the dead-letter state", async () => {
    await reset();
    await jobs.enqueue(A, { kind: "test.explode", idempotencyKey: "boom", maxAttempts: 3 });

    const noJitter = () => 0;   // deterministic: retry immediately
    let outcome = null;
    for (let pass = 1; pass <= 6; pass += 1) {
      const claimed = await jobs.claim(B, { owner: "worker-B" });
      if (!claimed.length) break;
      const job = claimed[0];
      outcome = await jobs.fail(B, {
        id: job.id, owner: "worker-B", error: new Error("upstream is down"),
        attempts: job.attempts, maxAttempts: job.maxAttempts, rng: noJitter,
      });
      if (outcome.outcome === "dead_letter") break;
    }
    assert.equal(outcome.outcome, "dead_letter");
    const [[row]] = await A.query("SELECT status, attempts, last_error FROM job WHERE idempotency_key = 'boom'");
    assert.equal(row.status, "dead_letter");
    assert.equal(row.attempts, 3, "exactly maxAttempts, not one more and not forever");
    assert.match(row.last_error, /upstream is down/);
    assert.deepEqual(await jobs.claim(C, { owner: "worker-C" }), [], "a dead-lettered job is not claimable");
  });

  await t.test("§30 an error that cannot succeed skips straight to dead-letter", async () => {
    await reset();
    await jobs.enqueue(A, { kind: "test.bad", idempotencyKey: "malformed", maxAttempts: 5 });
    const [job] = await jobs.claim(B, { owner: "worker-B" });
    const outcome = await jobs.fail(B, {
      id: job.id, owner: "worker-B",
      error: Object.assign(new Error("payload is not JSON"), { code: "VALIDATION_FAILED" }),
      attempts: job.attempts, maxAttempts: job.maxAttempts,
    });
    assert.equal(outcome.outcome, "dead_letter",
      "spending four more tries on a malformed payload only delays the moment an operator finds out");
    const [[row]] = await A.query("SELECT attempts FROM job WHERE idempotency_key = 'malformed'");
    assert.equal(row.attempts, 1);
  });

  await t.test("§36 the worker on instance B runs a job enqueued on instance A", async () => {
    await reset();
    jobs.__resetJobRegistryForTests();
    const ran = [];
    jobs.registerJobHandler("test.records", {
      handler: async (payload, ctx) => { ran.push({ payload, jobId: ctx.jobId, attempt: ctx.attempt }); },
      idempotency: "naturally_idempotent",
      why: "it appends to an array in a test and asserts on the count",
    });

    await jobs.enqueue(A, { kind: "test.records", payload: { hello: "world" }, idempotencyKey: "w-1" });
    const result = await jobs.runOnce(B, { owner: "worker-B" });

    assert.equal(result.claimed, 1);
    assert.equal(result.succeeded, 1);
    assert.deepEqual(ran[0].payload, { hello: "world" });

    const [[row]] = await A.query("SELECT status, completed_at FROM job WHERE idempotency_key = 'w-1'");
    assert.equal(row.status, "succeeded");
    assert.ok(row.completed_at);
    jobs.__resetJobRegistryForTests();
  });

  await t.test("a job whose kind has no handler is dead-lettered, not retried", async () => {
    await reset();
    jobs.__resetJobRegistryForTests();
    await jobs.enqueue(A, { kind: "test.unregistered", idempotencyKey: "orphan" });
    const result = await jobs.runOnce(B, { owner: "worker-B" });
    assert.equal(result.deadLettered, 1, "an unknown kind cannot become known by waiting");
  });

  await t.test("the worker survives a handler that throws", async () => {
    await reset();
    jobs.__resetJobRegistryForTests();
    jobs.registerJobHandler("test.throws", {
      handler: async () => { throw new Error("handler exploded"); },
      idempotency: "at_most_once_effect",
      why: "it has no effect at all",
    });
    await jobs.enqueue(A, { kind: "test.throws", idempotencyKey: "t-1" });
    const result = await jobs.runOnce(B, { owner: "worker-B", rng: () => 0 });
    assert.equal(result.retried, 1, "one bad payload must not stop every other job in the queue");
    jobs.__resetJobRegistryForTests();
  });

  await t.test("job counts are readable for an operator", async () => {
    await reset();
    await jobs.enqueue(A, { kind: "test.noop", idempotencyKey: "s1" });
    await jobs.enqueue(A, { kind: "test.noop", idempotencyKey: "s2" });
    const [job] = await jobs.claim(B, { owner: "worker-B" });
    await jobs.complete(B, { id: job.id, owner: "worker-B" });
    const s = await jobs.stats(A);
    assert.equal(s.pending, 1);
    assert.equal(s.succeeded, 1);
  });

  // ══════════════════════════════════════════════════════════
  //  §34 — the migration landed
  // ══════════════════════════════════════════════════════════
  await t.test("migration 009 created the three tables with their invariants", async () => {
    const [tables] = await A.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN ('otp_challenge','rate_limit_counter','job')`
    );
    assert.equal(tables.length, 3);

    const [idx] = await A.query(
      `SELECT index_name FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'otp_challenge'
          AND index_name = 'uniq_active_challenge' AND non_unique = 0`
    );
    assert.ok(idx.length >= 1, "single-active semantics must be the engine's job");

    const [jobIdx] = await A.query(
      `SELECT index_name FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'job'
          AND index_name = 'uniq_job_idempotency' AND non_unique = 0`
    );
    assert.ok(jobIdx.length >= 1);
  });

  await t.test("a row whose status and active slot disagree cannot be written", async () => {
    await reset();
    await assert.rejects(
      () => A.query(
        `INSERT INTO otp_challenge (id, purpose, channel, destination_hash, code_hash,
                                    status, attempts, max_attempts, expires_at, resend_after, active_slot)
         VALUES ('bad','login','phone',REPEAT('a',64),'x','verified',0,5,NOW(3),NOW(3),'1')`
      ),
      "a verified challenge holding the active slot would block every future code for that number"
    );
  });
});
