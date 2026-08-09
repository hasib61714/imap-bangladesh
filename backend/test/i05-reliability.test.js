/**
 * I-05 — the reliability primitives, unit level
 *
 * The distributed properties are proven against a real engine in
 * test/integration/reliability.integration.test.js, because they are
 * properties of the database. What is here is everything that can be decided
 * without one: the code generator, the key design, the retry policy and the
 * registration assertion.
 *
 * NEGATIVE CONTROLS (§37) are named in comments at the tests that carry them.
 * Each was reverted, the failure observed, and the file restored — the record
 * is in docs/implementation/I-05-RELIABILITY-MAP.md §8.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.APP_ENV = process.env.APP_ENV || "test";
process.env.DATABASE_ENV = process.env.DATABASE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const C = require("../src/modules/platform/otp/domain/challenge");
const P = require("../src/modules/platform/ratelimit/domain/policy");
const backoff = require("../src/modules/platform/jobs/domain/backoff");
const jobRegistry = require("../src/modules/platform/jobs/registry");
const { fixedClock } = require("../src/shared/clock");

// ════════════════════════════════════════════════════════════
test("§8 the OTP code", async (t) => {
  await t.test("is six digits, always, including the leading-zero cases", () => {
    for (let i = 0; i < 2000; i += 1) {
      assert.match(C.generateCode(), /^[0-9]{6}$/);
    }
  });

  // NEGATIVE CONTROL: put Math.random back and this fails within a few runs.
  //
  // Not a statistical test of randomness — those are unreliable at this size.
  // It asserts the SOURCE, because that is the actual property: V8 seeds
  // xorshift128+ weakly and its state is recoverable from a modest number of
  // outputs, so an attacker requesting codes for their own number could
  // predict the next one issued to somebody else.
  await t.test("comes from the crypto generator, not Math.random", () => {
    const crypto = require("node:crypto");
    const realRandomInt = crypto.randomInt;
    let cryptoCalls = 0;
    crypto.randomInt = (...args) => { cryptoCalls += 1; return realRandomInt(...args); };

    const realMathRandom = Math.random;
    let mathCalls = 0;
    Math.random = () => { mathCalls += 1; return realMathRandom(); };

    try {
      C.generateCode();
    } finally {
      crypto.randomInt = realRandomInt;
      Math.random = realMathRandom;
    }
    assert.equal(cryptoCalls, 1, "the code must come from crypto.randomInt");
    assert.equal(mathCalls, 0, "Math.random must not be in the path of a secret");
  });

  await t.test("covers the whole space, including 000000", () => {
    // Rejection-sampled over [0, 1000000) then padded, so every value is
    // reachable. `randomBytes % 900000` would be biased and would also never
    // produce a code below 100000.
    const seen = new Set();
    for (let i = 0; i < 5000; i += 1) seen.add(C.generateCode()[0]);
    assert.ok(seen.has("0"), "codes starting with 0 must be possible");
  });

  await t.test("is stored as a bcrypt hash and compares correctly", async () => {
    const code = "042195";
    const hash = await C.hashCode(code);
    assert.match(hash, /^\$2[aby]\$/);
    assert.equal(await C.codeMatches(code, hash), true);
    assert.equal(await C.codeMatches("042196", hash), false);
    assert.equal(await C.codeMatches(code, null), false);
    assert.equal(await C.codeMatches(code, ""), false);
  });
});

// ════════════════════════════════════════════════════════════
test("§10 purpose binding", async (t) => {
  await t.test("the purpose set is closed", () => {
    assert.deepEqual(C.PURPOSES, ["login", "registration", "password_reset", "phone_verification"]);
    for (const bad of ["admin", "", null, undefined, "LOGIN", "login ", {}, ["login"]]) {
      assert.equal(C.isKnownPurpose(bad), false, `${JSON.stringify(bad)} was accepted as a purpose`);
    }
  });

  await t.test("the route supplies the purpose; the client cannot", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "routes", "auth.js"), "utf8"
    );
    assert.match(src, /const OTP_PURPOSE = otp\.PURPOSE\./, "the purpose must be a server-side constant");
    assert.equal(/purpose:\s*req\.body/.test(src), false, "a purpose taken from the request body");
    assert.equal(/purpose:\s*req\.query/.test(src), false, "a purpose taken from the query string");
  });
});

// ════════════════════════════════════════════════════════════
test("the destination is normalised and never stored in clear", async (t) => {
  await t.test("formatting does not create a second destination", () => {
    const a = C.hashDestination("phone", "01799-999999");
    const b = C.hashDestination("phone", "01799999999");
    const c = C.hashDestination("phone", " 01799 999 999 ");
    assert.equal(a, b);
    assert.equal(b, c);
  });

  await t.test("email case does not either", () => {
    assert.equal(C.hashDestination("email", "Rina@Example.TEST"), C.hashDestination("email", "rina@example.test"));
  });

  await t.test("a channel is part of the hash, so a phone and an email never collide", () => {
    assert.notEqual(C.hashDestination("phone", "12345"), C.hashDestination("email", "12345"));
  });

  await t.test("the hash reveals nothing about the value", () => {
    const h = C.hashDestination("phone", "01711111111");
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.equal(h.includes("0171"), false);
  });

  await t.test("an empty destination is refused rather than hashed", () => {
    assert.throws(() => C.hashDestination("phone", ""), /INVALID_DESTINATION|destination is empty/);
    assert.throws(() => C.hashDestination("phone", "----"), /destination is empty/);
  });
});

// ════════════════════════════════════════════════════════════
test("§9 the challenge lifecycle", async (t) => {
  const now = new Date("2026-08-09T10:00:00Z");
  const live = { status: "active", attempts: 0, max_attempts: 5, expires_at: new Date("2026-08-09T10:05:00Z") };

  await t.test("a live challenge is usable", () => {
    assert.equal(C.unusableReason(live, now), null);
    assert.equal(C.isLive(live, now), true);
  });

  await t.test("no challenge, a spent one and an invalidated one are all unusable", () => {
    assert.equal(C.unusableReason(null, now), "none");
    assert.equal(C.unusableReason({ ...live, status: "verified" }, now), "consumed");
    assert.equal(C.unusableReason({ ...live, status: "invalidated" }, now), "unusable");
    assert.equal(C.unusableReason({ ...live, status: "expired" }, now), "unusable");
  });

  await t.test("expiry is checked before attempts, so the user is told what they can act on", () => {
    const both = { ...live, attempts: 5, expires_at: new Date("2026-08-09T09:00:00Z") };
    assert.equal(C.unusableReason(both, now), "expired");
  });

  await t.test("the boundary is exclusive — a code expires at its expiry", () => {
    assert.equal(C.unusableReason({ ...live, expires_at: now }, now), "expired");
    assert.equal(C.unusableReason({ ...live, expires_at: new Date(now.getTime() + 1) }, now), null);
  });

  await t.test("the resend cooldown is shorter than the lifetime", () => {
    assert.ok(C.RESEND_WAIT_MS < C.TTL_MS,
      "a code that cannot be resent before it expires strands anyone whose SMS is late");
  });
});

// ════════════════════════════════════════════════════════════
test("§15 rate-limit key design", async (t) => {
  const now = new Date("2026-08-09T10:00:00Z");

  await t.test("every authentication scope carries both an identifier-like dimension and an address", () => {
    for (const scope of ["auth.login", "auth.otp_request", "auth.otp_verify"]) {
      const dims = P.rulesFor(scope).map((r) => r.dimension);
      assert.ok(dims.includes("ip"), `${scope} does not limit by address — a botnet never trips it`);
      assert.ok(dims.some((d) => d !== "ip"),
        `${scope} limits only by address — spraying one attempt at ten thousand accounts never trips it`);
    }
  });

  await t.test("the key contains no personal data", () => {
    const key = P.bucketKey("auth.otp_request", "destination", "01711111111", P.HOUR, now);
    assert.equal(key.includes("01711111111"), false, "a phone number in a bucket key is a phone number in a table");
    assert.match(key, /^auth\.otp_request\|destination\|[0-9a-f]{32}\|\d+$/);
  });

  await t.test("the same value always lands in the same bucket within a window", () => {
    const a = P.bucketKey("auth.login", "ip", "203.0.113.5", P.MINUTE * 15, now);
    const b = P.bucketKey("auth.login", "ip", "203.0.113.5", P.MINUTE * 15, new Date(now.getTime() + 60_000));
    assert.equal(a, b);
  });

  await t.test("a new window is a new bucket, so old counters are prunable", () => {
    const a = P.bucketKey("auth.login", "ip", "203.0.113.5", P.MINUTE * 15, now);
    const b = P.bucketKey("auth.login", "ip", "203.0.113.5", P.MINUTE * 15, new Date(now.getTime() + 16 * 60_000));
    assert.notEqual(a, b);
  });

  await t.test("scopes and dimensions do not share buckets", () => {
    const login = P.bucketKey("auth.login", "ip", "1.2.3.4", P.MINUTE, now);
    const otpReq = P.bucketKey("auth.otp_request", "ip", "1.2.3.4", P.MINUTE, now);
    assert.notEqual(login, otpReq, "spending a login budget must not spend an OTP budget");
  });

  await t.test("a key fits the column", () => {
    const long = "a".repeat(500);
    assert.ok(P.bucketKey("auth.otp_request", "destination", long, P.HOUR, now).length <= 191);
  });

  await t.test("every rule is bounded and blocks for a stated time", () => {
    for (const scope of P.SCOPES) {
      for (const rule of P.rulesFor(scope)) {
        assert.ok(rule.limit > 0 && rule.limit < 10000, `${scope}/${rule.dimension} has an implausible limit`);
        assert.ok(rule.windowMs > 0, `${scope}/${rule.dimension} has no window`);
        assert.ok(rule.blockMs > 0, `${scope}/${rule.dimension} exceeds the limit and then does nothing`);
      }
    }
  });

  await t.test("SMS is the tightest budget in the table", () => {
    const otpPerDestination = P.rulesFor("auth.otp_request").find((r) => r.dimension === "destination");
    const loginPerIdentifier = P.rulesFor("auth.login").find((r) => r.dimension === "identifier");
    const otpRate = otpPerDestination.limit / otpPerDestination.windowMs;
    const loginRate = loginPerIdentifier.limit / loginPerIdentifier.windowMs;
    assert.ok(otpRate < loginRate, "every OTP costs money and rings somebody's phone");
  });
});

// ════════════════════════════════════════════════════════════
test("§30 the retry policy", async (t) => {
  // NEGATIVE CONTROL: remove the MAX_DELAY_MS cap and this fails at attempt 20.
  await t.test("the delay is bounded however many attempts have passed", () => {
    for (let attempt = 1; attempt <= 40; attempt += 1) {
      const d = backoff.delayMs(attempt, () => 1);
      assert.ok(d <= backoff.MAX_DELAY_MS, `attempt ${attempt} would wait ${d}ms`);
      assert.ok(Number.isFinite(d));
    }
  });

  await t.test("it grows, so a failing dependency is not hammered", () => {
    const noJitter = () => 1;
    assert.ok(backoff.delayMs(1, noJitter) < backoff.delayMs(2, noJitter));
    assert.ok(backoff.delayMs(2, noJitter) < backoff.delayMs(3, noJitter));
  });

  await t.test("jitter spreads a herd rather than releasing it together", () => {
    const delays = new Set();
    for (let i = 0; i < 200; i += 1) delays.add(backoff.delayMs(4));
    assert.ok(delays.size > 50,
      "without jitter every job that failed during an outage retries at the same instant");
  });

  // NEGATIVE CONTROL: make nextRunAt ignore maxAttempts and this returns a
  // date instead of null — the job then retries forever.
  await t.test("attempts run out", () => {
    const now = new Date("2026-08-09T10:00:00Z");
    assert.ok(backoff.nextRunAt(1, 3, now) instanceof Date);
    assert.ok(backoff.nextRunAt(2, 3, now) instanceof Date);
    assert.equal(backoff.nextRunAt(3, 3, now), null, "an unbounded retry is not resilience");
    assert.equal(backoff.nextRunAt(9, 3, now), null);
  });

  await t.test("an error that cannot succeed is not retried", () => {
    for (const code of backoff.NON_RETRYABLE) {
      assert.equal(backoff.isRetryable(Object.assign(new Error("x"), { code })), false, code);
    }
    assert.equal(backoff.isRetryable(new Error("connection reset")), true);
    assert.equal(backoff.isRetryable(Object.assign(new Error("x"), { retryable: false })), false);
    assert.equal(backoff.isRetryable(Object.assign(new Error("x"), { code: "ER_DUP_ENTRY", retryable: true })), true);
    assert.equal(backoff.isRetryable(null), false);
  });
});

// ════════════════════════════════════════════════════════════
test("§28 the job registration assertion", async (t) => {
  t.afterEach(() => jobRegistry.__resetJobRegistryForTests());

  await t.test("a handler must say how it survives running twice", () => {
    assert.throws(
      () => jobRegistry.registerJobHandler("test.silent", { handler: async () => {} }),
      /must declare idempotency/
    );
    assert.throws(
      () => jobRegistry.registerJobHandler("test.made_up", { handler: async () => {}, idempotency: "trust_me", why: "x" }),
      /must declare idempotency/
    );
    assert.throws(
      () => jobRegistry.registerJobHandler("test.no_why", { handler: async () => {}, idempotency: "naturally_idempotent" }),
      /does not say how/
    );
  });

  await t.test("a valid registration is accepted and readable", () => {
    const entry = jobRegistry.registerJobHandler("test.ok", {
      handler: async () => {},
      idempotency: "idempotency_key",
      why: "the effect is guarded by a unique constraint on the booking id",
    });
    assert.equal(entry.idempotency, "idempotency_key");
    assert.deepEqual(jobRegistry.registeredJobKinds(), ["test.ok"]);
    assert.doesNotThrow(() => jobRegistry.assertJobRegistryIsSound());
  });

  await t.test("two handlers for one kind is a configuration error", () => {
    jobRegistry.registerJobHandler("test.dup", { handler: async () => {}, idempotency: "naturally_idempotent", why: "x" });
    assert.throws(
      () => jobRegistry.registerJobHandler("test.dup", { handler: async () => {}, idempotency: "naturally_idempotent", why: "y" }),
      /already registered/
    );
  });

  // The assertion passes vacuously today because I-05 registers no business
  // job (§26). An assertion that has only ever seen an empty set proves
  // nothing, so this drives it against an unsound register.
  await t.test("the startup assertion refuses an unbounded retry", () => {
    const entry = jobRegistry.registerJobHandler("test.unbounded", {
      handler: async () => {}, idempotency: "naturally_idempotent", why: "x", maxAttempts: 500,
    });
    assert.equal(entry.maxAttempts, 500);
    assert.throws(() => jobRegistry.assertJobRegistryIsSound(), /bounded and reachable/);
  });

  await t.test("I-05 itself registers no business job", () => {
    // §26. The mechanism ships; the jobs arrive with the modules that need
    // them. A handler appearing here without its module is how a job runs
    // against a domain that does not exist yet.
    jobRegistry.__resetJobRegistryForTests();
    delete require.cache[require.resolve("../src/modules/platform/jobs")];
    const jobs = require("../src/modules/platform/jobs");
    assert.deepEqual(jobs.registeredJobKinds(), []);
  });
});

// ════════════════════════════════════════════════════════════
test("§19 the session deadline carried in the token", async (t) => {
  const { REFRESH_TTL_MS, ACCESS_TTL_MS } = require("../src/modules/identity/domain/session");

  await t.test("the absolute lifetime is the session lifetime I-03 chose, not a new number", () => {
    assert.equal(REFRESH_TTL_MS, 30 * 24 * 60 * 60 * 1000);
    assert.ok(REFRESH_TTL_MS > ACCESS_TTL_MS);
  });

  await t.test("routes/auth.js bounds the refresh rather than reissuing freely", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "routes", "auth.js"), "utf8"
    );
    const refresh = src.slice(src.indexOf('router.post("/refresh"'));
    assert.match(refresh, /SESSION_EXPIRED/, "a refresh past the deadline must be refused");
    assert.match(refresh, /sessionExpiresAt/, "the deadline must be carried, not recomputed");
    assert.equal(/makeToken\(rows\[0\]\)\s*;/.test(refresh), false,
      "reissuing with no deadline is exactly the defect F-10 records");
  });
});

// ════════════════════════════════════════════════════════════
test("§32 telemetry carries no secret", async (t) => {
  await t.test("the worker logs the shape of a job, never its payload", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "src", "modules", "platform", "jobs", "worker.js"), "utf8"
    );
    const logBlock = src.slice(src.indexOf("function logJob"));
    assert.equal(/payload/.test(logBlock.split("logger.info")[1] || ""), false,
      "a job payload will carry phone numbers and message bodies once notifications move here");
    assert.equal(/err\.stack/.test(logBlock), false, "a stack in a log line is where query text ends up");
  });

  await t.test("the OTP code is never logged", () => {
    // String literals are stripped before the check. The first version was not
    // and flagged `logger.error("send-otp: OTP store unavailable")` — a
    // message about the subsystem, containing no value. A test that cries
    // wolf on a correct line is how a real one gets ignored.
    const stripStrings = (line) =>
      line.replace(/"(?:[^"\\]|\\.)*"/g, '""')
          .replace(/'(?:[^'\\]|\\.)*'/g, "''")
          .replace(/`(?:[^`\\]|\\.)*`/g, "``")
          .replace(/\/\/.*/, "");

    const files = ["routes/auth.js", "src/modules/platform/otp/infrastructure/otpRepository.js"];
    for (const f of files) {
      const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", f), "utf8");
      for (const line of src.split("\n")) {
        if (!/logger\.(info|warn|error|debug)/.test(line)) continue;
        const bare = stripStrings(line);
        // A `code` or `otp` IDENTIFIER reaching a log call. `err.code` is
        // preceded by a dot and is a driver error code, not a secret.
        assert.equal(/(^|[^.\w])(code|otp)\b/i.test(bare), false,
          `${f}: a log line passes the code — ${line.trim()}`);
      }
    }
  });
});
