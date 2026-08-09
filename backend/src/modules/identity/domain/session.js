/**
 * Session — identity domain
 *
 * Today a session is a bare JWT: not revocable, and `/auth/refresh` exchanges
 * a still-valid token for a fresh 7-day one, so a stolen token can be renewed
 * indefinitely. `refresh_tokens` exists in the schema and is read by nothing.
 * Logout deletes a token from the browser and the server never learns of it.
 *
 * This module holds the rules that make a session a server-side fact:
 *
 *   - the refresh token is a secret; only its SHA-256 is ever stored
 *   - a session has an expiry AND a revocation, and either ends it
 *   - refresh ROTATES: the presented token is retired as it is replaced, so
 *     a captured token is usable at most once, and its reuse is detectable
 *
 * Pure: no database, no clock of its own. Time is injected
 * (src/shared/clock.js) so expiry is testable without sleeping.
 */
"use strict";

const crypto = require("crypto");

const ACCESS_TTL_MS = 15 * 60 * 1000;             // 15 minutes
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days

/**
 * A refresh token: 32 random bytes, base64url.
 *
 * Returned to the caller ONCE. Only `hash` is persisted, so a database read —
 * a backup, a dump, an injection — yields nothing usable. Same reason a
 * password hash exists.
 */
function issueRefreshToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/**
 * Constant-time comparison of two refresh-token hashes.
 * Both are fixed-length hex, so a length mismatch is malformed input.
 */
function refreshTokenMatches(presentedToken, storedHash) {
  if (typeof storedHash !== "string" || storedHash.length !== 64) return false;
  const presented = Buffer.from(hashRefreshToken(presentedToken), "utf8");
  const stored = Buffer.from(storedHash, "utf8");
  if (presented.length !== stored.length) return false;
  return crypto.timingSafeEqual(presented, stored);
}

const REVOCATION_REASONS = new Set([
  "logout",             // the user asked
  "rotated",            // replaced by refresh — the normal path
  "admin",              // an operator ended it
  "credential_change",  // password changed; every other session dies
  "reuse_detected",     // a retired token was presented again
]);

/**
 * Is this session usable right now?
 *
 * Both conditions are checked. A revoked session that has not yet expired
 * must fail, and an expired session that was never revoked must fail. Reading
 * only one of them is how "logout" becomes decorative.
 */
function isLive(session, now) {
  if (!session) return false;
  if (session.revoked_at || session.revokedAt) return false;
  const expires = new Date(session.expires_at ?? session.expiresAt).getTime();
  return Number.isFinite(expires) && expires > now.getTime();
}

/**
 * Why a session is not usable. Distinguished for the AUDIT record, never for
 * the client: the response to a revoked and an expired session is identical.
 */
function unusableReason(session, now) {
  if (!session) return "unknown_session";
  if (session.revoked_at || session.revokedAt) return "revoked";
  const expires = new Date(session.expires_at ?? session.expiresAt).getTime();
  if (!Number.isFinite(expires) || expires <= now.getTime()) return "expired";
  return null;
}

/**
 * The fields of a new session. The caller persists them; this function
 * decides nothing about storage.
 *
 * @param {{ id: string, principalId: string, accountId?: string|null,
 *           device?: string|null, ip?: string|null, clock: {now: () => Date} }} spec
 */
function newSession({ id, principalId, accountId = null, device = null, ip = null, clock }) {
  const now = clock.now();
  const { token, hash } = issueRefreshToken();
  return {
    record: {
      id,
      principal_id: principalId,
      account_id: accountId,
      refresh_token_hash: hash,
      issued_at: now,
      expires_at: new Date(now.getTime() + REFRESH_TTL_MS),
      // Truncated: a user-agent is for the user's own "where am I signed in"
      // list, not a forensic artefact, and an unbounded header is a storage
      // vector.
      device: device ? String(device).slice(0, 200) : null,
      ip: ip ? String(ip).slice(0, 45) : null,
    },
    refreshToken: token,
  };
}

/** Access-token lifetime. Short, because the session is what carries duration. */
function accessTokenExpirySeconds() {
  return Math.floor(ACCESS_TTL_MS / 1000);
}

module.exports = {
  issueRefreshToken,
  hashRefreshToken,
  refreshTokenMatches,
  isLive,
  unusableReason,
  newSession,
  accessTokenExpirySeconds,
  REVOCATION_REASONS,
  ACCESS_TTL_MS,
  REFRESH_TTL_MS,
};
