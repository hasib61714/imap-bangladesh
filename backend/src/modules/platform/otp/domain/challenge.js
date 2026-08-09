/**
 * OTP challenge — platform / otp / domain
 *
 * I-05 §8–§13. Pure: no database, no clock of its own, no transport.
 *
 * WHAT THIS REPLACES
 * ──────────────────
 * `utils/otp-store.js`, a module-level `Map`. I-03 recorded it as F-9 and the
 * consequence is worse than "does not scale": with two instances a code
 * issued by A did not exist on B, so a user who happened to hit the other
 * instance was told their valid code had expired — and `attempts`, which is
 * the only thing standing between a six-digit number and an exhaustive
 * search, counted separately on each instance. Two instances meant ten
 * attempts, three meant fifteen, and nobody chose that number.
 *
 * IT ALSO GENERATED CODES WITH Math.random()
 * ──────────────────────────────────────────
 * `routes/auth.js` used `Math.floor(100000 + Math.random() * 900000)`.
 * `Math.random()` is not a cryptographic generator: V8 seeds xorshift128+
 * from a weak source and its internal state is recoverable from a modest
 * number of outputs. An attacker who can request OTPs for their own number
 * can therefore predict the next one issued to somebody else.
 * `SECURITY-ARCHITECTURE.md` §3 says "cryptographically random". It is now.
 */
"use strict";

const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

/**
 * §10. The closed set. A purpose arriving from a client is checked against
 * this and never stored raw — an OTP proving control of a phone number must
 * not be spendable as a password reset just because the caller asked for it.
 */
const PURPOSE = Object.freeze({
  LOGIN: "login",
  REGISTRATION: "registration",
  PASSWORD_RESET: "password_reset",
  PHONE_VERIFICATION: "phone_verification",
});
const PURPOSES = Object.freeze(Object.values(PURPOSE));
const isKnownPurpose = (p) => PURPOSES.includes(p);

const CHANNELS = Object.freeze(["phone", "email"]);

/** §9. The lifecycle. `active` is the only state that can verify. */
const STATUS = Object.freeze({
  ACTIVE: "active",
  VERIFIED: "verified",
  EXPIRED: "expired",
  INVALIDATED: "invalidated",
});

const CODE_DIGITS = 6;
const TTL_MS = 5 * 60 * 1000;
const RESEND_WAIT_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * The cost of hashing a code at rest, and what it does and does not buy.
 *
 * bcrypt cost 10 over a 10^6 space is roughly 18 CPU-hours per code — real,
 * but not the control. What protects a six-digit code is MAX_ATTEMPTS and
 * TTL_MS. The hash is what stops a casual read of the table — an operator
 * glancing at it, a backup, a support query, a log dump — from yielding live
 * codes, which is exactly the exposure `SECURITY-ARCHITECTURE.md` §3 means by
 * "hashed at rest".
 *
 * Cost 10 rather than 12 because a challenge lives five minutes and the same
 * hash is computed on an unauthenticated endpoint; the password path uses 12.
 */
const BCRYPT_COST = 10;

class OtpError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "OtpError";
    this.code = code;
  }
}

/**
 * A code no attacker can predict from previous ones.
 *
 * `crypto.randomInt` is rejection-sampled, so the distribution is uniform —
 * `randomBytes % 900000` would not be, and the bias is measurable.
 */
function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(CODE_DIGITS, "0");
}

/**
 * Normalise before hashing, so `01799-999999` and `01799999999` are the same
 * destination. F-11 records that `users.phone` is unique on the RAW value; a
 * challenge keyed on the raw value would let one number hold several live
 * codes, one per formatting.
 */
function normaliseDestination(channel, value) {
  const s = String(value ?? "").trim();
  if (channel === "phone") return s.replace(/[^0-9]/g, "");
  return s.toLowerCase();
}

/** The destination is never stored in clear: it already exists on `users`. */
function hashDestination(channel, value) {
  const normalised = normaliseDestination(channel, value);
  if (!normalised) throw new OtpError("destination is empty", "INVALID_DESTINATION");
  return crypto.createHash("sha256").update(`${channel}:${normalised}`).digest("hex");
}

const hashCode = (code) => bcrypt.hash(String(code), BCRYPT_COST);
const codeMatches = (presented, storedHash) => {
  if (!storedHash || typeof storedHash !== "string") return Promise.resolve(false);
  return bcrypt.compare(String(presented ?? ""), storedHash);
};

/**
 * A code shaped like ours, before any database work.
 *
 * Cheap rejection of obvious junk. It is NOT a security control — the
 * attempt counter is — and it deliberately does not distinguish "wrong
 * length" from "wrong code" to the caller.
 */
const isCodeShaped = (code) => /^[0-9]{6}$/.test(String(code ?? ""));

/**
 * Why a challenge cannot be used, or null if it can.
 *
 * Order matters: expiry is checked before attempts, so a challenge that both
 * expired and ran out of attempts reports the reason a user can act on.
 */
function unusableReason(row, now) {
  if (!row) return "none";
  if (row.status !== STATUS.ACTIVE) return row.status === STATUS.VERIFIED ? "consumed" : "unusable";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  if (row.attempts >= row.max_attempts) return "blocked";
  return null;
}

const isLive = (row, now) => unusableReason(row, now) === null;

module.exports = {
  PURPOSE, PURPOSES, isKnownPurpose, CHANNELS, STATUS,
  CODE_DIGITS, TTL_MS, RESEND_WAIT_MS, MAX_ATTEMPTS, BCRYPT_COST,
  generateCode, normaliseDestination, hashDestination, hashCode, codeMatches,
  isCodeShaped, unusableReason, isLive, OtpError,
};
