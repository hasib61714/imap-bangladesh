/**
 * Session repository — identity / infrastructure
 *
 * I-05 §19–§25. Rotation, reuse detection and revocation against the `session`
 * table migration 007 created.
 *
 * NOT LIVE, AND THE REASON IS A FOREIGN KEY
 * ─────────────────────────────────────────
 * `session.principal_id` REFERENCES `principal(id)`, and `principal` is
 * populated by `scripts/backfill-identity.js`, which has not been applied
 * (I-03 §32 — the cutover is owner-coordinated). Until it runs, a session row
 * cannot be written for a live user at all: the insert fails on the foreign
 * key. That is a hard blocker, discovered by reading the schema rather than
 * by trying it in production, and it is why `/api/auth/refresh` is bounded by
 * a token claim in this phase instead of by a session row.
 *
 * So this file is built, proven against a real engine, and called by nothing
 * on the request path. When the backfill runs it becomes the mechanism
 * without being rewritten.
 *
 * WHAT ROTATION BUYS, AND WHAT REUSE DETECTION BUYS
 * ────────────────────────────────────────────────
 * Rotation means a captured refresh token is usable ONCE. Reuse detection is
 * what turns that from an inconvenience for the attacker into an alarm: if a
 * token that has already been rotated is presented again, then two parties
 * hold it, and there is no way to tell which one is the user. The only safe
 * answer is to end every session for that principal and make both sign in.
 */
"use strict";

const { newId } = require("../../../shared/ids");
const { systemClock } = require("../../../shared/clock");
const S = require("../domain/session");
const { withTransientRetry } = require("../../../shared/transient");

class SessionStoreUnavailable extends Error {
  constructor(cause) {
    super("the session store is unavailable");
    this.name = "SessionStoreUnavailable";
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

/**
 * §24. Authentication creates a NEW session row with a NEW refresh token.
 *
 * Nothing about an unauthenticated request is carried forward, so there is no
 * identifier an attacker can fix in advance and then have promoted — session
 * fixation is prevented by the shape of this function rather than by a
 * regeneration step someone has to remember to call.
 */
async function create(db, { principalId, accountId = null, device = null, ip = null, clock = systemClock }) {
  const { record, refreshToken } = S.newSession({
    id: newId(), principalId, accountId, device, ip, clock,
  });
  try {
    await db.query(
      `INSERT INTO session (id, principal_id, account_id, refresh_token_hash,
                            issued_at, expires_at, device, ip)
       VALUES (?,?,?,?,?,?,?,?)`,
      [record.id, record.principal_id, record.account_id, record.refresh_token_hash,
       at(record.issued_at), at(record.expires_at), record.device, record.ip]
    );
    return { sessionId: record.id, refreshToken, expiresAt: record.expires_at };
  } catch (err) {
    throw new SessionStoreUnavailable(err);
  }
}

/** Look a session up by the token presented. The token itself is never stored. */
async function findByRefreshToken(db, refreshToken) {
  const hash = S.hashRefreshToken(refreshToken);
  const [rows] = await db.query(
    `SELECT id, principal_id, account_id, refresh_token_hash, issued_at, expires_at,
            revoked_at, revoked_reason, last_seen_at, device, ip
       FROM session WHERE refresh_token_hash = ? LIMIT 1`,
    [hash]
  );
  return rows[0] || null;
}

/**
 * Exchange a refresh token for a new one.
 *
 * @returns {Promise<{ok: true, sessionId: string, refreshToken: string, expiresAt: Date}
 *                  | {ok: false, reason: "unknown"|"expired"|"revoked"|"reuse_detected", revokedSessions?: number}>}
 *
 * The rotated session keeps its ABSOLUTE expiry: the new row inherits the old
 * row's `expires_at` rather than starting a fresh thirty days. That is what
 * stops a refresh loop extending a session forever, which is F-10 — and it is
 * the reason rotation alone is not enough. A rotation that also resets the
 * deadline is the same defect with more steps.
 */
async function rotate(db, spec) {
  return withTransientRetry(() => rotateOnce(db, spec));
}

async function rotateOnce(db, { refreshToken, device = null, ip = null, clock = systemClock }) {
  const now = clock.now();
  const hash = S.hashRefreshToken(refreshToken);

  // Resolved in AUTOCOMMIT, then locked by primary key — the same remedy, for
  // the same reason, as `otp/infrastructure/otpRepository.js`. Locking through
  // `uniq_refresh` and then updating by primary key lets two transactions
  // acquire the pair in an order that cycles: two clients refreshing the same
  // token at once deadlocked intermittently, and the caller saw a 503 rather
  // than one rotation and one refusal.
  let found;
  try {
    [found] = await db.query("SELECT id FROM session WHERE refresh_token_hash = ? LIMIT 1", [hash]);
  } catch (err) {
    throw new SessionStoreUnavailable(err);
  }
  if (!found.length) return { ok: false, reason: "unknown" };

  let conn;
  try {
    conn = await db.getConnection();
  } catch (err) {
    throw new SessionStoreUnavailable(err);
  }

  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id, principal_id, account_id, expires_at, revoked_at, revoked_reason
         FROM session WHERE id = ? FOR UPDATE`,
      [found[0].id]
    );

    if (!rows.length) {
      await conn.commit();
      return { ok: false, reason: "unknown" };
    }
    const row = rows[0];

    // §20. A token that was already rotated is being presented a second time.
    // Two parties hold it and neither can be identified as the user, so every
    // live session for this principal ends.
    if (row.revoked_at && row.revoked_reason === "rotated") {
      const [res] = await conn.query(
        `UPDATE session SET revoked_at = ?, revoked_reason = 'credential_change'
          WHERE principal_id = ? AND revoked_at IS NULL`,
        [at(now), row.principal_id]
      );
      await conn.commit();
      return { ok: false, reason: "reuse_detected", revokedSessions: res.affectedRows };
    }

    if (row.revoked_at) {
      await conn.commit();
      return { ok: false, reason: "revoked" };
    }
    if (new Date(row.expires_at).getTime() <= now.getTime()) {
      await conn.commit();
      return { ok: false, reason: "expired" };
    }

    const { token: nextToken, hash: nextHash } = S.issueRefreshToken();
    const nextId = newId();

    // Guarded on the state we read: two concurrent refreshes with the same
    // token produce one rotation, and the loser sees `revoked_reason =
    // 'rotated'` on its next attempt — which is reuse detection doing its job
    // on a race rather than on an attack. Both are the same event from here.
    const [revoked] = await conn.query(
      `UPDATE session SET revoked_at = ?, revoked_reason = 'rotated'
        WHERE id = ? AND revoked_at IS NULL`,
      [at(now), row.id]
    );
    if (revoked.affectedRows === 0) {
      await conn.commit();
      return { ok: false, reason: "revoked" };
    }

    await conn.query(
      `INSERT INTO session (id, principal_id, account_id, refresh_token_hash,
                            issued_at, expires_at, last_seen_at, device, ip)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [nextId, row.principal_id, row.account_id, nextHash,
       at(now), at(row.expires_at), at(now),
       device ? String(device).slice(0, 200) : null, ip ? String(ip).slice(0, 45) : null]
    );

    await conn.commit();
    return { ok: true, sessionId: nextId, refreshToken: nextToken, expiresAt: new Date(row.expires_at) };
  } catch (err) {
    try { await conn.rollback(); } catch { /* the connection is already gone */ }
    throw new SessionStoreUnavailable(err);
  } finally {
    conn.release();
  }
}

/** §21. Logout, server-side. A revoked session cannot refresh. */
async function revoke(db, { sessionId, reason = "logout", clock = systemClock }) {
  if (!S.REVOCATION_REASONS.has(reason)) throw new SessionStoreUnavailable(new Error(`unknown revocation reason "${reason}"`));
  const [res] = await db.query(
    "UPDATE session SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL",
    [at(clock.now()), reason, sessionId]
  );
  return res.affectedRows;
}

/**
 * §22, §25. End every live session for a principal.
 *
 * This is the mechanism behind password change, password reset, suspension,
 * an operator revoking access, and the containment step in
 * `CREDENTIAL-INCIDENT.md`. `JWT_SECRET` rotation is the wider hammer and
 * stays owner-controlled: it ends everyone's session, not one person's.
 */
async function revokeAllForPrincipal(db, { principalId, reason = "credential_change", clock = systemClock }) {
  if (!S.REVOCATION_REASONS.has(reason)) throw new SessionStoreUnavailable(new Error(`unknown revocation reason "${reason}"`));
  const [res] = await db.query(
    "UPDATE session SET revoked_at = ?, revoked_reason = ? WHERE principal_id = ? AND revoked_at IS NULL",
    [at(clock.now()), reason, principalId]
  );
  return res.affectedRows;
}

/** The user's own "where am I signed in" list. Never the token hash. */
async function listLive(db, { principalId, clock = systemClock }) {
  const [rows] = await db.query(
    `SELECT id, account_id, issued_at, expires_at, last_seen_at, device, ip
       FROM session
      WHERE principal_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY issued_at DESC`,
    [principalId, at(clock.now())]
  );
  return rows;
}

module.exports = {
  create, findByRefreshToken, rotate, revoke, revokeAllForPrincipal, listLive,
  SessionStoreUnavailable,
};
