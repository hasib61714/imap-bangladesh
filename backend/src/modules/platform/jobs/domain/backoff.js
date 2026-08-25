/**
 * Retry policy — platform / jobs / domain
 *
 * I-05 §30. Bounded, always.
 *
 * An unbounded retry is not resilience. A job that fails because its input is
 * malformed will fail identically forever, and the only thing infinite
 * retries produce is a worker that never gets to the next job and a log
 * nobody can read.
 */
"use strict";

const SECOND = 1000;

const BASE_DELAY_MS = 5 * SECOND;
const MAX_DELAY_MS = 15 * 60 * SECOND;
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Errors that will not succeed on a second try.
 *
 * Retrying these wastes attempts a transient failure could have used, and
 * delays the dead-letter that tells an operator something is actually wrong.
 */
const NON_RETRYABLE = Object.freeze([
  "ER_DUP_ENTRY",          // an idempotency constraint did its job
  "ER_NO_REFERENCED_ROW",  // the row it references is gone
  "ER_NO_REFERENCED_ROW_2",
  "ER_DATA_TOO_LONG",
  "ER_BAD_NULL_ERROR",
  "ER_PARSE_ERROR",
  "VALIDATION_FAILED",
  "UNKNOWN_JOB_KIND",
]);

function isRetryable(err) {
  if (!err) return false;
  if (err.retryable === false) return false;
  if (err.retryable === true) return true;
  return !NON_RETRYABLE.includes(err.code);
}

/**
 * Exponential backoff with full jitter.
 *
 * Jitter matters when a dependency comes back after an outage: without it,
 * every job that failed during the outage retries at the same instant and
 * knocks it over again. Full jitter — a uniform draw from [0, delay] — is the
 * variant that spreads a thundering herd best.
 *
 * `Math.random` is correct here and nowhere else in this phase. Jitter is a
 * scheduling decision with no adversary; an OTP is a secret, and
 * `domain/challenge.js` uses `crypto.randomInt` for exactly that reason.
 *
 * @param {number} attempt  1 for the first retry
 * @param {() => number} [rng]  injectable so a test can be deterministic
 */
function delayMs(attempt, rng = Math.random) {
  const n = Math.max(1, Math.floor(attempt));
  // 2^30 overflows nothing here, but the cap is applied before the draw so a
  // large attempt number cannot produce an absurd intermediate.
  const ceiling = Math.min(BASE_DELAY_MS * Math.pow(2, Math.min(n - 1, 20)), MAX_DELAY_MS);
  return Math.floor(rng() * ceiling);
}

/** When this attempt should next run, or null if it has run out of attempts. */
function nextRunAt(attempt, maxAttempts, now, rng = Math.random) {
  if (attempt >= maxAttempts) return null;
  return new Date(now.getTime() + delayMs(attempt, rng));
}

module.exports = {
  BASE_DELAY_MS, MAX_DELAY_MS, DEFAULT_MAX_ATTEMPTS, NON_RETRYABLE,
  isRetryable, delayMs, nextRunAt,
};
