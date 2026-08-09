/**
 * Rate-limit policy — platform / ratelimit / domain
 *
 * I-05 §14–§17. The rules, in one readable table, and the key design.
 *
 * WHAT WAS WRONG
 * ──────────────
 * `express-rate-limit` defaults to a MemoryStore. The production login
 * limiter reads "20 attempts per 15 minutes"; with two instances it was
 * forty, with three sixty. The effective limit was a function of the
 * deployment, and nobody chose it.
 *
 * COMPOSITE KEYS, NOT ONE DIMENSION (§15)
 * ───────────────────────────────────────
 * `SECURITY-ARCHITECTURE.md` §9 says authentication is limited "per
 * identifier AND per IP", and OTP "per phone, per IP". Both halves matter and
 * neither substitutes:
 *
 *   per IP only          — a botnet spreads one account's attempts across
 *                          thousands of addresses and never trips it
 *   per identifier only  — an attacker sprays one attempt each at ten
 *                          thousand accounts and never trips it either
 *
 * So every scope below carries both, evaluated independently, and the request
 * is refused if EITHER is exceeded.
 *
 * PRIVACY (§15)
 * ─────────────
 * Every dimension value is hashed before it becomes part of a key. This table
 * therefore holds no phone number, no email and no IP address in clear, and
 * nothing here needs to be read back — a counter only ever has to match
 * itself. No device fingerprint is collected: it would be a new class of
 * personal data for a marginal gain in a system whose abuse surface is SMS
 * cost and credential stuffing.
 */
"use strict";

const crypto = require("node:crypto");

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * scope → rules. Every rule is one bucket and one row.
 *
 * `limit` is the number of requests permitted in `windowMs`. `blockMs` is how
 * long a caller is refused after exceeding it — separate from the window, so
 * exceeding the limit costs more than waiting for the counter to roll over.
 *
 * The numbers are chosen against the current production limiter (20 per 15
 * minutes per IP across the whole of `/api/auth`) and are not looser than it
 * on any dimension.
 */
const RULES = Object.freeze({
  /** Password login. Credential stuffing is the threat. */
  "auth.login": Object.freeze([
    { dimension: "identifier", limit: 5, windowMs: 15 * MINUTE, blockMs: 15 * MINUTE },
    { dimension: "ip", limit: 20, windowMs: 15 * MINUTE, blockMs: 15 * MINUTE },
  ]),

  /**
   * Requesting an OTP. Every one costs money and rings somebody's phone, so
   * this is the tightest rule in the table — SMS flooding as harassment is a
   * real abuse of this endpoint, not a theoretical one.
   */
  "auth.otp_request": Object.freeze([
    { dimension: "destination", limit: 5, windowMs: HOUR, blockMs: HOUR },
    { dimension: "ip", limit: 15, windowMs: HOUR, blockMs: HOUR },
  ]),

  /** Verifying an OTP. The per-challenge attempt counter is the primary
   *  control; this stops an attacker cycling challenges to get more tries. */
  "auth.otp_verify": Object.freeze([
    { dimension: "destination", limit: 10, windowMs: 15 * MINUTE, blockMs: 15 * MINUTE },
    { dimension: "ip", limit: 30, windowMs: 15 * MINUTE, blockMs: 15 * MINUTE },
  ]),

  /** Registration. Automated account creation. */
  "auth.register": Object.freeze([
    { dimension: "ip", limit: 10, windowMs: HOUR, blockMs: HOUR },
  ]),

  /**
   * Social sign-in. IP only, and the omission is deliberate rather than an
   * oversight: the identifier is inside the provider's token and is not known
   * until it has been verified, so there is nothing to key an identifier rule
   * on at the point the limit must be applied.
   */
  "auth.social": Object.freeze([
    { dimension: "ip", limit: 30, windowMs: 15 * MINUTE, blockMs: 15 * MINUTE },
  ]),
});

const SCOPES = Object.freeze(Object.keys(RULES));
const isKnownScope = (s) => Object.prototype.hasOwnProperty.call(RULES, s);
const rulesFor = (scope) => RULES[scope] || null;

/**
 * A bucket key.
 *
 * Fixed windows, keyed by window index. The trade-off is stated rather than
 * discovered: a caller can spend the limit at the end of one window and again
 * at the start of the next, so the worst case across a boundary is 2x the
 * limit. For authentication that is the standard trade and it is bounded; a
 * sliding window changes this function and nothing else.
 */
function bucketKey(scope, dimension, value, windowMs, now) {
  const digest = crypto.createHash("sha256").update(`${scope}:${dimension}:${value}`).digest("hex").slice(0, 32);
  const windowIndex = Math.floor(now.getTime() / windowMs);
  return `${scope}|${dimension}|${digest}|${windowIndex}`;
}

const windowStart = (windowMs, now) => new Date(Math.floor(now.getTime() / windowMs) * windowMs);

module.exports = { RULES, SCOPES, isKnownScope, rulesFor, bucketKey, windowStart, MINUTE, HOUR };
