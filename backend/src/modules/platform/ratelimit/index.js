/**
 * Rate limiting — platform module public surface (I-05).
 *
 * One shared authority for every instance. The counters live in the database
 * next to `audit_log`, so a limit decision and the record of it can share a
 * transaction — see migrations/009_reliability.sql for why that ruled out a
 * second store.
 */
"use strict";

const policy = require("./domain/policy");
const repository = require("./infrastructure/rateLimitRepository");

module.exports = {
  ...policy,
  consume: repository.consume,
  forget: repository.forget,
  pruneExpired: repository.pruneExpired,
  RateLimitUnavailable: repository.RateLimitUnavailable,
};
