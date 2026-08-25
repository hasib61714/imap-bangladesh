/**
 * Fixtures for the I-05 shared stores.
 *
 * The OTP store and the rate limiter are tables now, so a route test that
 * touches an authentication endpoint has to answer their queries as well as
 * its own. These builders keep that out of the tests themselves — the
 * alternative is every auth test carrying six handlers that have nothing to
 * do with what it is checking.
 *
 * Nothing here loosens anything: the handlers describe a store that is
 * working normally, which is the precondition the tests are written against.
 * A test that wants a store to refuse says so explicitly.
 */
"use strict";

const bcrypt = require("bcryptjs");

/** A rate limiter that is counting normally and permitting. */
function rateLimitAllowing(hits = 1) {
  return [
    { match: "INSERT INTO rate_limit_counter", rows: { affectedRows: 1 } },
    { match: "SELECT hits, blocked_until FROM rate_limit_counter", rows: [{ hits, blocked_until: null }] },
    { match: "UPDATE rate_limit_counter", rows: { affectedRows: 1 } },
    { match: "DELETE FROM rate_limit_counter", rows: { affectedRows: 1 } },
  ];
}

/** A rate limiter that has already blocked this caller. */
function rateLimitBlocking(retryAfterSeconds = 900) {
  const until = new Date(Date.now() + retryAfterSeconds * 1000);
  return [
    { match: "INSERT INTO rate_limit_counter", rows: { affectedRows: 1 } },
    { match: "SELECT hits, blocked_until FROM rate_limit_counter", rows: [{ hits: 999, blocked_until: until }] },
    { match: "UPDATE rate_limit_counter", rows: { affectedRows: 1 } },
  ];
}

/** A store that cannot be reached at all. */
function storeUnavailable(match) {
  return [{ match, rows: { __throw: Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }) } }];
}

/**
 * A live OTP challenge row, hashed the way the repository stores it.
 *
 * The hash is real bcrypt rather than a stub: the point of these tests is the
 * route's behaviour against the store's actual contract, and a comparison
 * that is faked proves nothing about a code being wrong.
 */
async function liveChallenge({
  code, principalId = null, attempts = 0, maxAttempts = 5,
  expiresInMs = 5 * 60 * 1000, id = "otp-challenge-1",
} = {}) {
  return {
    id,
    code_hash: await bcrypt.hash(String(code), 10),
    principal_id: principalId,
    status: "active",
    attempts,
    max_attempts: maxAttempts,
    expires_at: new Date(Date.now() + expiresInMs),
  };
}

/**
 * Handlers for a verify against `challenge`, or against nothing.
 *
 * `null` means "no live challenge for this destination", which is what the
 * store returns for an unknown number, an expired one and a spent one alike.
 */
function otpVerifyHandlers(challenge) {
  return [
    { match: "FROM otp_challenge", rows: challenge ? [challenge] : [] },
    { match: "UPDATE otp_challenge", rows: { affectedRows: 1 } },
  ];
}

/** Handlers for an issue that succeeds. */
function otpIssueHandlers({ existingLive = null } = {}) {
  return [
    { match: "FROM otp_challenge", rows: existingLive ? [existingLive] : [] },
    { match: "UPDATE otp_challenge", rows: { affectedRows: 1 } },
    { match: "INSERT INTO otp_challenge", rows: { affectedRows: 1 } },
  ];
}

module.exports = {
  rateLimitAllowing, rateLimitBlocking, storeUnavailable,
  liveChallenge, otpVerifyHandlers, otpIssueHandlers,
};
