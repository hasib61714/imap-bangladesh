/**
 * Credential — identity domain
 *
 * P0-1 was: /login skipped password verification entirely when
 * `password_hash` was NULL, which was true of every account created by OTP or
 * a social provider. Knowing a phone number was enough to obtain that user's
 * token.
 *
 * Phase 0.5 fixed it with a conditional. This module makes it structural:
 *
 *     A PasswordCredential CANNOT BE CONSTRUCTED without a bcrypt hash.
 *
 * There is no object to verify against when the hash is absent, so there is
 * no branch that could be written the wrong way round. The database CHECK is
 * defence in depth; per DATA-ARCHITECTURE's note on AD-002 the domain is the
 * primary control, because TiDB's CHECK enforcement is unverified.
 *
 * Pure: no database, no network, no clock. Testable without either.
 */
"use strict";

const bcrypt = require("bcryptjs");

/**
 * A bcrypt hash: $2a$/$2b$/$2y$, a two-digit cost, then a 53-character
 * salt+digest. Anything else is not a hash this system produced, and is
 * refused rather than passed to bcrypt.compare() to see what happens.
 */
const BCRYPT_SHAPE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Compared against when no credential exists, so that a caller cannot
 * distinguish "no account", "no password credential" and "wrong password" by
 * response time. A real hash of a value nobody holds.
 */
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;   // bcrypt truncates at 72 bytes; refuse long input rather than silently ignore it
const DEFAULT_COST = 12;

class CredentialError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CredentialError";
    this.code = code;
  }
}

function isBcryptHash(value) {
  return typeof value === "string" && BCRYPT_SHAPE.test(value);
}

/**
 * A password credential. Its existence is the proof that password
 * authentication is possible for this principal.
 */
class PasswordCredential {
  /**
   * @param {{ id: string, principalId: string, secretHash: string }} row
   * @throws {CredentialError} when the hash is absent or malformed
   */
  constructor({ id, principalId, secretHash }) {
    if (!isBcryptHash(secretHash)) {
      // NULL, "", "hunter2", a truncated hash, an md5 — all the same answer.
      // A malformed hash is not "probably fine"; it is a credential that
      // cannot be verified, and pretending otherwise is how P0-1 happened.
      throw new CredentialError(
        "a password credential requires a bcrypt hash",
        "INVALID_CREDENTIAL_HASH"
      );
    }
    this.id = id;
    this.principalId = principalId;
    this.secretHash = secretHash;
    Object.freeze(this);
  }

  /** @returns {Promise<boolean>} */
  async verify(password) {
    if (typeof password !== "string" || password.length === 0) return false;
    if (password.length > MAX_PASSWORD_LENGTH) return false;
    return bcrypt.compare(password, this.secretHash);
  }
}

/**
 * Build a credential from a database row, or return null.
 *
 * Returns null — it does not throw — because "this principal has no password
 * credential" is an ordinary outcome, not an error. The caller must then run
 * {@link verifyAbsent} so the timing is indistinguishable.
 */
function fromRow(row) {
  if (!row) return null;
  try {
    return new PasswordCredential({
      id: row.id,
      principalId: row.principal_id ?? row.principalId,
      secretHash: row.secret_hash ?? row.secretHash,
    });
  } catch (err) {
    if (err instanceof CredentialError) return null;   // malformed = absent
    throw err;
  }
}

/**
 * Burn the same time bcrypt.compare would have taken, and return false.
 *
 * Without this, "no such account" answers in microseconds while "wrong
 * password" takes ~100 ms, and the endpoint becomes an account-existence
 * oracle.
 */
async function verifyAbsent(password) {
  await bcrypt.compare(String(password || ""), DUMMY_HASH);
  return false;
}

/**
 * Hash a new password. Rejects what cannot be a real password rather than
 * hashing it and storing something unusable.
 */
async function hashPassword(password, cost = DEFAULT_COST) {
  if (typeof password !== "string") {
    throw new CredentialError("password must be a string", "INVALID_PASSWORD");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new CredentialError(
      `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      "PASSWORD_TOO_SHORT"
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    // bcrypt silently ignores bytes past 72. Accepting a 500-character
    // password and verifying only its first 72 bytes is worse than refusing.
    throw new CredentialError("password is too long", "PASSWORD_TOO_LONG");
  }
  return bcrypt.hash(password, cost);
}

/**
 * Whether a stored hash should be re-hashed on next successful login.
 * Legacy hashes are cost 10; new ones are cost 12. Re-hashing needs the
 * plaintext, so it can only happen at the moment of a successful login.
 */
function needsRehash(secretHash, targetCost = DEFAULT_COST) {
  if (!isBcryptHash(secretHash)) return false;
  const cost = Number(secretHash.slice(4, 6));
  return cost < targetCost;
}

module.exports = {
  PasswordCredential,
  CredentialError,
  fromRow,
  verifyAbsent,
  hashPassword,
  needsRehash,
  isBcryptHash,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  DEFAULT_COST,
};
