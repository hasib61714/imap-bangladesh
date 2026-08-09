/**
 * Rate-limit repository — platform / ratelimit / infrastructure
 *
 * I-05 §16, §17. One authoritative counter per bucket, incremented
 * atomically, shared by every instance.
 *
 * WHY THE INCREMENT IS ATOMIC AND NOT MERELY QUICK
 * ────────────────────────────────────────────────
 * `INSERT ... ON DUPLICATE KEY UPDATE hits = hits + 1` takes an exclusive
 * lock on that row for the rest of the transaction. A concurrent request for
 * the same bucket — on this instance or another — blocks at its own INSERT
 * until this one commits, and then reads a value that already includes it.
 *
 * A read-then-write would not do that. Two instances would both read 4,
 * both decide 5 is under the limit of 5, and both write 5. §18 exists
 * precisely to catch that, and the test drives two independent connections
 * concurrently rather than one process twice.
 *
 * LOCK ORDER
 * ──────────
 * Rules are locked in the order `policy.js` declares them, always. Two
 * transactions touching the same scope therefore take the same locks in the
 * same order and cannot deadlock.
 */
"use strict";

const { systemClock } = require("../../../../shared/clock");
const P = require("../domain/policy");

/**
 * §17. Raised when the store cannot answer.
 *
 * It is an error, not a `false`. A rate limiter that returns "allowed"
 * because it could not reach its counter is not a rate limiter, and §35 is
 * explicit that there is no in-memory fallback for security-critical state.
 * The caller maps this to 503.
 *
 * Fail-closed costs nothing extra here: authentication needs the same
 * database to look the user up, so a store that cannot answer is a database
 * that cannot authenticate anyone anyway.
 */
class RateLimitUnavailable extends Error {
  constructor(cause) {
    super("the rate-limit store is unavailable");
    this.name = "RateLimitUnavailable";
    this.cause = cause;
    this.status = 503;
  }
}

/**
 * A DATETIME parameter.
 *
 * mysql2 formats a Date using the connection's timezone (db.js sets +06:00)
 * and parses DATETIME back with the same one, so a Date round-trips exactly.
 * A pre-formatted UTC string does NOT: it is written verbatim and then read
 * as if it were in the connection's zone, which shifts every value by the
 * offset. The first version of this file did that, and the symptom was every
 * freshly-issued OTP reading as expired six hours ago.
 *
 * Passing Dates is also what src/modules/platform/audit/writeAudit.js already
 * does, so this is the codebase's existing convention rather than a new one.
 */
const at = (d) => new Date(d);

/**
 * Count one attempt against every rule for a scope.
 *
 * @param {object} db     a pool exposing getConnection()
 * @param {string} scope
 * @param {object} dimensions  { ip, identifier, destination } — only the ones
 *        the scope's rules name are read; a missing one denies rather than
 *        being skipped, because a rule that silently does not apply is a rule
 *        that is not there.
 * @returns {Promise<{allowed: boolean, scope: string, retryAfterSeconds: number,
 *                    limitedBy: string|null, hits: object}>}
 */
async function consume(db, scope, dimensions = {}, { clock = systemClock } = {}) {
  const rules = P.rulesFor(scope);
  if (!rules) throw new RateLimitUnavailable(new Error(`unknown rate-limit scope "${scope}"`));

  const now = clock.now();
  let conn;
  try {
    conn = await db.getConnection();
  } catch (err) {
    throw new RateLimitUnavailable(err);
  }

  try {
    await conn.beginTransaction();

    const hits = {};
    let limitedBy = null;
    let retryAfterSeconds = 0;
    // True only on the call that CROSSES the limit, so §33 can record abuse
    // without recording every subsequent 429 from the same blocked caller.
    let blockedNow = false;

    for (const rule of rules) {
      const raw = dimensions[rule.dimension];
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        // Fail closed. A login with no resolvable IP is not an unlimited
        // login; it is a request this limiter cannot evaluate.
        await conn.rollback();
        return {
          allowed: false, scope, limitedBy: rule.dimension, hits, blockedNow: false,
          retryAfterSeconds: Math.ceil(rule.blockMs / 1000),
          reason: "unevaluatable",
        };
      }

      const key = P.bucketKey(scope, rule.dimension, String(raw), rule.windowMs, now);
      const start = P.windowStart(rule.windowMs, now);

      await conn.query(
        `INSERT INTO rate_limit_counter (bucket_key, scope, window_start, window_ms, hits)
         VALUES (?,?,?,?,1)
         ON DUPLICATE KEY UPDATE hits = hits + 1`,
        [key, scope, at(start), rule.windowMs]
      );

      const [[row]] = await conn.query(
        "SELECT hits, blocked_until FROM rate_limit_counter WHERE bucket_key = ?",
        [key]
      );
      // The INSERT above holds an exclusive lock on this row for the rest of
      // the transaction, so it must be here. If it is not, the store is not
      // behaving as a store and the only safe answer is to say so — a missing
      // counter must not be read as a zero counter.
      if (!row) throw new Error(`rate-limit bucket ${key} vanished inside its own transaction`);
      hits[rule.dimension] = row.hits;

      const blockedUntil = row.blocked_until ? new Date(row.blocked_until) : null;
      if (blockedUntil && blockedUntil.getTime() > now.getTime()) {
        limitedBy = limitedBy || rule.dimension;
        retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000));
        continue;
      }

      if (row.hits > rule.limit) {
        const until = new Date(now.getTime() + rule.blockMs);
        await conn.query(
          "UPDATE rate_limit_counter SET blocked_until = ? WHERE bucket_key = ?",
          [at(until), key]
        );
        limitedBy = limitedBy || rule.dimension;
        blockedNow = true;
        retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil(rule.blockMs / 1000));
      }
    }

    await conn.commit();
    return { allowed: limitedBy === null, scope, limitedBy, retryAfterSeconds, hits, blockedNow };
  } catch (err) {
    try { await conn.rollback(); } catch { /* the connection is already gone */ }
    throw new RateLimitUnavailable(err);
  } finally {
    conn.release();
  }
}

/**
 * Forget one dimension's counters for a scope — used after a SUCCESSFUL
 * authentication, so a user who mistyped their password four times is not
 * punished for the rest of the window once they get it right.
 *
 * Deliberately scoped to one dimension: clearing the IP counter on success
 * would let an attacker reset their own limit by authenticating to an account
 * they already control.
 */
async function forget(db, scope, dimension, value, { clock = systemClock } = {}) {
  const rules = P.rulesFor(scope);
  if (!rules) return 0;
  const rule = rules.find((r) => r.dimension === dimension);
  if (!rule) return 0;
  const key = P.bucketKey(scope, dimension, String(value), rule.windowMs, clock.now());
  try {
    const [res] = await db.query("DELETE FROM rate_limit_counter WHERE bucket_key = ?", [key]);
    return res.affectedRows;
  } catch (err) {
    // Failing to clear a counter is not a security failure — it leaves the
    // caller MORE limited, not less — so it does not fail the request.
    return 0;
  }
}

/** Prune windows that can no longer be reached. Called by an operator or a job. */
async function pruneExpired(db, { olderThanMs = 2 * P.HOUR, clock = systemClock } = {}) {
  const cutoff = new Date(clock.now().getTime() - olderThanMs);
  const [res] = await db.query(
    "DELETE FROM rate_limit_counter WHERE window_start < ? AND (blocked_until IS NULL OR blocked_until < ?)",
    [at(cutoff), at(clock.now())]
  );
  return res.affectedRows;
}

module.exports = { consume, forget, pruneExpired, RateLimitUnavailable };
