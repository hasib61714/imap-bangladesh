/**
 * Transient database failures — shared
 *
 * I-05. Some errors mean "this transaction did not happen; do it again", and
 * treating them as outages turns a correct system into an intermittently
 * broken one.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The concurrency tests in test/integration/reliability.integration.test.js
 * found it. Three instances verifying one OTP at the same moment
 * intermittently produced `OtpStoreUnavailable` — a 503 — instead of one
 * success and two refusals. The cause was an InnoDB deadlock: the verify
 * transaction locks the challenge through the secondary index
 * `idx_lookup(destination_hash, purpose, status)` and then updates it by
 * primary key, so three transactions can acquire the two locks in an order
 * that cycles.
 *
 * InnoDB resolves a deadlock by rolling one transaction back entirely, and
 * its documented contract is that the application retries. Nothing partially
 * applied, so a retry re-reads and reaches whichever answer is now correct —
 * usually "already consumed", which is the right answer for the loser of a
 * race.
 *
 * A user double-tapping "verify" would have seen an intermittent 503. That is
 * exactly the class of defect §36 exists to catch, and a single-process test
 * could not have.
 *
 * THIS IS THE BACKSTOP, NOT THE FIX
 * ─────────────────────────────────
 * The deadlock was removed by changing where the locks are taken: the
 * repositories resolve a row's id in autocommit and then lock it by PRIMARY
 * KEY, so contenders queue behind one record instead of cycling between a
 * secondary index and the clustered one. Fifteen consecutive runs of the
 * concurrency suite are clean.
 *
 * Retrying is kept because contention is inherent to concurrent writes and
 * because a deadlock is, by the engine's own contract, re-runnable. A retry
 * that hides a design that deadlocks constantly would be the wrong answer;
 * one that absorbs the occasional genuine collision is the right one.
 *
 * THE SET IS DELIBERATELY SMALL
 * ─────────────────────────────
 * Only failures where the transaction is known not to have applied. A
 * connection error mid-commit is NOT here: it is ambiguous, and retrying an
 * ambiguous write is how a payment gets taken twice.
 */
"use strict";

const TRANSIENT_CODES = Object.freeze([
  // The engine chose this transaction as the deadlock victim and rolled it
  // back. Nothing applied.
  "ER_LOCK_DEADLOCK",
  // The transaction gave up waiting for a lock. Nothing applied.
  "ER_LOCK_WAIT_TIMEOUT",
  /**
   * "Record has changed since last read" — MariaDB, errno 1020.
   *
   * A locking read in REPEATABLE READ, on a row another transaction committed
   * to after this one's snapshot was taken. MariaDB refuses rather than
   * silently reading the newer version, which is the safer choice and is a
   * genuine "your read was stale, start again".
   *
   * MySQL and TiDB do not raise it — their locking read takes the latest
   * version — so listing it costs nothing there. Which engine is running is
   * not something this code should have to know.
   */
  "ER_CHECKREAD",
]);

const isTransient = (err) => Boolean(err && TRANSIENT_CODES.includes(err.code));

/**
 * Run `fn`, retrying only a genuinely re-runnable failure.
 *
 * `fn` must be a whole transaction: it is called again from the start, and a
 * function that has already committed part of its work is not safe here.
 *
 * The delay is short and grows a little. A deadlock is resolved the moment
 * the victim rolls back, so the contention is already gone — this is not
 * backoff against an overloaded dependency, it is a nudge to avoid retrying
 * into the same instant.
 */
async function withTransientRetry(fn, { attempts = 3, baseDelayMs = 10 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!isTransient(err) || attempt === attempts) throw err;
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }
  /* istanbul ignore next — the loop either returns or throws */
  throw lastError;
}

module.exports = { TRANSIENT_CODES, isTransient, withTransientRetry };
