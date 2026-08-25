/**
 * Job worker — platform / jobs
 *
 * I-05 §26, §31, §32. Claims, runs, records, repeats.
 *
 * ONE PASS IS THE UNIT, NOT THE LOOP
 * ──────────────────────────────────
 * `runOnce()` does a complete cycle and returns what happened. The loop is a
 * thin wrapper around it. That split is what makes crash recovery testable
 * without killing a process: a test can call `runOnce` as worker A, stop
 * calling it — which is exactly what a dead worker looks like from the
 * database — and then call it as worker B once the lease has expired.
 *
 * A HANDLER THAT THROWS IS NORMAL
 * ───────────────────────────────
 * It is recorded, backed off and retried, or dead-lettered. What must never
 * happen is a handler taking the worker down with it, because then one bad
 * payload stops every other job in the queue.
 */
"use strict";

const os = require("node:os");
const logger = require("../../../../utils/logger");
const { newId } = require("../../../shared/ids");
const { systemClock } = require("../../../shared/clock");
const repo = require("./infrastructure/jobRepository");
const { getJobHandler } = require("./registry");

/**
 * A name for this worker, stable for the life of the process.
 *
 * §29 requires a lock to have an owner. `hostname:pid:short-id` is enough to
 * answer "which process is holding this?" from a dead-letter row, and the
 * random suffix keeps two processes on one host distinct after a pid reuse.
 */
function workerId() {
  return `${os.hostname()}:${process.pid}:${newId().slice(0, 8)}`.slice(0, 64);
}

/**
 * Claim and run up to `limit` jobs.
 *
 * @returns {Promise<{claimed: number, succeeded: number, retried: number, deadLettered: number}>}
 */
async function runOnce(db, { owner, kinds = null, limit = 5, leaseMs = repo.DEFAULT_LEASE_MS, clock = systemClock, rng } = {}) {
  const me = owner || workerId();
  const jobs = await repo.claim(db, { owner: me, kinds, limit, leaseMs, clock });

  const result = { claimed: jobs.length, succeeded: 0, retried: 0, deadLettered: 0 };

  for (const job of jobs) {
    const startedAt = Date.now();
    const handler = getJobHandler(job.kind);

    if (!handler) {
      // An unknown kind cannot become known by waiting, so it is not retried.
      const err = Object.assign(new Error(`no handler registered for job kind "${job.kind}"`), {
        code: "UNKNOWN_JOB_KIND",
      });
      const outcome = await repo.fail(db, { ...job, owner: me, error: err, clock, rng });
      if (outcome.outcome === "dead_letter") result.deadLettered += 1;
      logJob("failed", job, me, startedAt, err);
      continue;
    }

    try {
      await handler.handler(job.payload, {
        jobId: job.id,
        attempt: job.attempts,
        correlationId: job.correlationId,
        idempotencyKey: job.idempotencyKey,
        db,
      });
      const done = await repo.complete(db, { id: job.id, owner: me, clock });
      if (done) result.succeeded += 1;
      logJob(done ? "succeeded" : "lost_lease", job, me, startedAt, null);
    } catch (err) {
      const outcome = await repo.fail(db, {
        id: job.id, owner: me, error: err,
        attempts: job.attempts, maxAttempts: job.maxAttempts, clock, rng,
      });
      if (outcome.outcome === "retry") result.retried += 1;
      if (outcome.outcome === "dead_letter") result.deadLettered += 1;
      logJob(outcome.outcome, job, me, startedAt, err);
    }
  }

  return result;
}

/**
 * §32. Telemetry for one job.
 *
 * The payload is never logged: a job's payload is domain data and, once
 * notifications and SMS move here, would carry phone numbers and message
 * bodies. What is logged is the shape of what happened.
 */
function logJob(result, job, owner, startedAt, err) {
  logger.info("job", {
    jobId: job.id,
    kind: job.kind,
    result,
    attempt: job.attempts,
    maxAttempts: job.maxAttempts,
    durationMs: Date.now() - startedAt,
    owner,
    correlationId: job.correlationId,
    // The message only, never the stack — a stack in a log line is where
    // internal paths and query text end up.
    failureReason: err ? String(err.message).slice(0, 200) : undefined,
  });
}

/**
 * Poll forever. Returns a stop function.
 *
 * `unref` so a worker never keeps a process alive that is trying to exit —
 * the same defect I-03 found in the OTP store's sweep timer, which made
 * graceful shutdown wait up to five minutes.
 */
function start(db, { intervalMs = 1000, owner = null, kinds = null, limit = 5, leaseMs = repo.DEFAULT_LEASE_MS } = {}) {
  const me = owner || workerId();
  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await runOnce(db, { owner: me, kinds, limit, leaseMs });
    } catch (err) {
      // The store is unreachable. Keep polling: it may come back, and a
      // worker that exits on the first blip needs an operator to restart it.
      logger.warn("job worker pass failed", { owner: me, err: err.message });
    }
    if (!stopped) {
      timer = setTimeout(tick, intervalMs);
      if (typeof timer.unref === "function") timer.unref();
    }
  };

  timer = setTimeout(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();

  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

module.exports = { runOnce, start, workerId };
