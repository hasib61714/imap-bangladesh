/**
 * Job repository — platform / jobs / infrastructure
 *
 * I-05 §26–§31, AD-016: "a durable job table (same database) consumed by a
 * worker process, with attempts, backoff and a dead-letter state".
 *
 * THE LEASE, NOT THE LOCK (§29)
 * ─────────────────────────────
 * A claim writes an owner and an expiry. It is a lease because the holder can
 * die: an infinite lock plus one crashed worker is a job nobody can ever run
 * again, and the failure is silent — the job simply never happens.
 *
 * Every state change is a CONDITIONAL UPDATE guarded on what was read, with
 * `affectedRows` checked. Two workers racing for one job produce one winner,
 * and the loser learns it lost from the database rather than from a lock it
 * believed it held. This is the P0-5 pattern — the one that stopped a booking
 * being completed twice — applied to work instead of to money.
 *
 * `WHERE ... AND lease_owner = ?` on every release: a worker can only finish
 * or fail a job it actually holds. Releasing another worker's lease is the
 * classic distributed-lock defect and the guard is one clause.
 */
"use strict";

const { newId } = require("../../../../shared/ids");
const { systemClock } = require("../../../../shared/clock");
const backoff = require("../domain/backoff");

class JobStoreUnavailable extends Error {
  constructor(cause) {
    super("the job store is unavailable");
    this.name = "JobStoreUnavailable";
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
const DEFAULT_LEASE_MS = 60_000;

/**
 * Enqueue.
 *
 * @param {object} db   a pool, OR a transaction connection — enqueueing in
 *        the same transaction as the state change that caused it is the
 *        outbox property (AD-006), and the signature allows it deliberately.
 * @returns {Promise<{id: string, created: boolean}>}  `created: false` means
 *        an identical job already existed.
 */
async function enqueue(db, spec) {
  const {
    kind, payload = null, idempotencyKey = null, maxAttempts = backoff.DEFAULT_MAX_ATTEMPTS,
    runAfter = null, correlationId = null, clock = systemClock,
  } = spec;

  if (!kind) throw new JobStoreUnavailable(new Error("a job must have a kind"));
  const now = clock.now();
  const id = newId();

  try {
    await db.query(
      `INSERT INTO job (id, kind, payload_json, idempotency_key, status, attempts,
                        max_attempts, run_after, correlation_id, created_at)
       VALUES (?,?,?,?, 'pending', 0, ?, ?, ?, ?)`,
      [id, kind, payload === null ? null : JSON.stringify(payload), idempotencyKey,
       maxAttempts, at(runAfter || now), correlationId, at(now)]
    );
    return { id, created: true };
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      // §28: same logical job, same key, one effective execution. The
      // constraint decided, not a SELECT that could have raced.
      const [rows] = await db.query(
        "SELECT id FROM job WHERE kind = ? AND idempotency_key = ? LIMIT 1",
        [kind, idempotencyKey]
      );
      return { id: rows.length ? String(rows[0].id) : null, created: false };
    }
    throw new JobStoreUnavailable(err);
  }
}

/**
 * Claim up to `limit` jobs for this worker.
 *
 * The candidate query and the claim are separate on purpose. `SELECT ... FOR
 * UPDATE SKIP LOCKED` would be one statement, but its behaviour on TiDB is
 * not something this project may assert (PHASE-2.75-DATABASE-REHEARSAL §5),
 * and the conditional-update form is portable and provably correct: a job
 * only moves to `running` if it was still claimable at the moment of the
 * write.
 *
 * The second branch of the WHERE clause is crash recovery (§31). A `running`
 * job whose lease has expired is claimable again, by the same statement, so
 * there is no separate reaper to forget to run.
 */
async function claim(db, { owner, kinds = null, limit = 1, leaseMs = DEFAULT_LEASE_MS, clock = systemClock }) {
  if (!owner) throw new JobStoreUnavailable(new Error("a claim must name its owner"));
  const now = clock.now();
  const nowSql = at(now);
  const leaseUntil = at(new Date(now.getTime() + leaseMs));

  try {
    const kindFilter = kinds && kinds.length ? ` AND kind IN (${kinds.map(() => "?").join(",")})` : "";
    const [candidates] = await db.query(
      `SELECT id FROM job
        WHERE ( (status = 'pending' AND run_after <= ?)
             OR (status = 'running' AND lease_expires_at < ?) )${kindFilter}
        ORDER BY run_after ASC, created_at ASC
        LIMIT ?`,
      kinds && kinds.length ? [nowSql, nowSql, ...kinds, Number(limit)] : [nowSql, nowSql, Number(limit)]
    );

    const claimed = [];
    for (const c of candidates) {
      const [res] = await db.query(
        `UPDATE job
            SET status = 'running', lease_owner = ?, lease_expires_at = ?,
                attempts = attempts + 1, started_at = COALESCE(started_at, ?)
          WHERE id = ?
            AND ( (status = 'pending' AND run_after <= ?)
               OR (status = 'running' AND lease_expires_at < ?) )`,
        [owner, leaseUntil, nowSql, c.id, nowSql, nowSql]
      );
      // Lost the race to another worker. Not an error — the other worker has
      // it, which is the outcome we wanted.
      if (res.affectedRows === 0) continue;

      const [[row]] = await db.query(
        `SELECT id, kind, payload_json, idempotency_key, status, attempts, max_attempts,
                lease_owner, lease_expires_at, correlation_id
           FROM job WHERE id = ?`,
        [c.id]
      );
      claimed.push({
        id: String(row.id),
        kind: row.kind,
        payload: parsePayload(row.payload_json),
        idempotencyKey: row.idempotency_key,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        leaseOwner: row.lease_owner,
        leaseExpiresAt: row.lease_expires_at,
        correlationId: row.correlation_id,
      });
    }
    return claimed;
  } catch (err) {
    throw new JobStoreUnavailable(err);
  }
}

/** mysql2 returns JSON columns already parsed on some drivers and as text on others. */
function parsePayload(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}

/**
 * Extend a lease held by this worker.
 *
 * A long-running handler that does not renew loses its job to the reclaim
 * branch of `claim()`, which is the correct outcome: from the outside, a
 * worker that has stopped renewing is indistinguishable from one that died.
 */
async function renew(db, { id, owner, leaseMs = DEFAULT_LEASE_MS, clock = systemClock }) {
  const until = at(new Date(clock.now().getTime() + leaseMs));
  const [res] = await db.query(
    "UPDATE job SET lease_expires_at = ? WHERE id = ? AND lease_owner = ? AND status = 'running'",
    [until, id, owner]
  );
  return res.affectedRows === 1;
}

/** Mark succeeded. Only the holder may. */
async function complete(db, { id, owner, clock = systemClock }) {
  const now = at(clock.now());
  const [res] = await db.query(
    `UPDATE job SET status = 'succeeded', completed_at = ?, lease_owner = NULL,
                    lease_expires_at = NULL, last_error = NULL
      WHERE id = ? AND lease_owner = ? AND status = 'running'`,
    [now, id, owner]
  );
  return res.affectedRows === 1;
}

/**
 * Record a failure and decide what happens next.
 *
 * Three outcomes, and which one applies is the retry policy's decision rather
 * than the caller's:
 *   retry        attempts remain and the error is retryable
 *   dead_letter  attempts exhausted, or the error will never succeed
 *
 * A non-retryable error goes straight to dead-letter without burning the
 * remaining attempts — spending four more tries on a malformed payload delays
 * the moment an operator finds out.
 */
async function fail(db, { id, owner, error, attempts, maxAttempts, clock = systemClock, rng }) {
  const now = clock.now();
  const message = String((error && error.message) || error || "unknown error").slice(0, 500);
  const retryable = backoff.isRetryable(error);
  const nextRun = retryable ? backoff.nextRunAt(attempts, maxAttempts, now, rng) : null;

  if (nextRun) {
    const [res] = await db.query(
      `UPDATE job SET status = 'pending', run_after = ?, last_error = ?,
                      lease_owner = NULL, lease_expires_at = NULL
        WHERE id = ? AND lease_owner = ? AND status = 'running'`,
      [at(nextRun), message, id, owner]
    );
    return { outcome: res.affectedRows === 1 ? "retry" : "not_held", runAfter: nextRun };
  }

  const [res] = await db.query(
    `UPDATE job SET status = 'dead_letter', failed_at = ?, last_error = ?,
                    lease_owner = NULL, lease_expires_at = NULL
      WHERE id = ? AND lease_owner = ? AND status = 'running'`,
    [at(now), message, id, owner]
  );
  return { outcome: res.affectedRows === 1 ? "dead_letter" : "not_held", runAfter: null };
}

/** Counts by status, for the health surface and for an operator. */
async function stats(db, { kind = null } = {}) {
  const [rows] = await db.query(
    kind
      ? "SELECT status, COUNT(*) AS n FROM job WHERE kind = ? GROUP BY status"
      : "SELECT status, COUNT(*) AS n FROM job GROUP BY status",
    kind ? [kind] : []
  );
  const out = { pending: 0, running: 0, succeeded: 0, failed: 0, dead_letter: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

module.exports = {
  enqueue, claim, renew, complete, fail, stats,
  DEFAULT_LEASE_MS, JobStoreUnavailable,
};
