/**
 * OTP repository — platform / otp / infrastructure
 *
 * I-05 §6, §8, §9. The authoritative store is the database, so an OTP issued
 * by one instance is verifiable by any other.
 *
 * TWO THINGS ARE DONE BY THE ENGINE RATHER THAN BY THIS CODE
 * ─────────────────────────────────────────────────────────
 * Single-active semantics come from `uniq_active_challenge`, not from a
 * read-then-write. Two instances issuing at the same moment produce one row
 * and one duplicate-key error, and the loser is told to wait — a check in
 * JavaScript would let both through.
 *
 * Single-use comes from a conditional UPDATE guarded on the status we read,
 * with `affectedRows` checked. Two instances verifying the same code at the
 * same moment produce one success. This is the same shape as the P0-5 fix in
 * `routes/bookings.js`, applied to a credential instead of to money.
 */
"use strict";

const { newId } = require("../../../../shared/ids");
const { systemClock } = require("../../../../shared/clock");
const C = require("../domain/challenge");

/** Errors this repository raises when the store cannot answer. */
class OtpStoreUnavailable extends Error {
  constructor(cause) {
    super("the OTP store is unavailable");
    this.name = "OtpStoreUnavailable";
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
 * Issue a challenge.
 *
 * @returns {Promise<{issued: true, code: string, challengeId: string, expiresAt: Date, resendAfter: Date}
 *                  | {issued: false, reason: "throttled", retryAfterSeconds: number}>}
 *
 * The code is returned so the caller can send it. It is never persisted in
 * clear and never logged — §12 and §32.
 */
async function issue(db, spec) {
  const {
    purpose, channel, destination, principalId = null,
    correlationId = null, ip = null, clock = systemClock,
  } = spec;

  if (!C.isKnownPurpose(purpose)) throw new C.OtpError(`unknown OTP purpose "${purpose}"`, "UNKNOWN_PURPOSE");
  if (!C.CHANNELS.includes(channel)) throw new C.OtpError(`unknown OTP channel "${channel}"`, "UNKNOWN_CHANNEL");

  const destinationHash = C.hashDestination(channel, destination);
  const now = clock.now();

  let conn;
  try {
    conn = await db.getConnection();
  } catch (err) {
    throw new OtpStoreUnavailable(err);
  }

  try {
    await conn.beginTransaction();

    // The existing live challenge, locked so a concurrent issue on another
    // instance waits here rather than racing to the unique index.
    const [live] = await conn.query(
      `SELECT id, resend_after, expires_at, attempts, max_attempts
         FROM otp_challenge
        WHERE destination_hash = ? AND purpose = ? AND status = 'active'
        FOR UPDATE`,
      [destinationHash, purpose]
    );

    if (live.length) {
      const row = live[0];
      const expired = new Date(row.expires_at).getTime() <= now.getTime();
      const resendAt = new Date(row.resend_after).getTime();

      if (!expired && now.getTime() < resendAt) {
        await conn.commit();
        return {
          issued: false,
          reason: "throttled",
          retryAfterSeconds: Math.max(1, Math.ceil((resendAt - now.getTime()) / 1000)),
        };
      }

      // §9: a superseded challenge must not verify. Retiring it here rather
      // than leaving it to expire is what makes a resend actually replace the
      // old code — otherwise an SMS an attacker already saw stays valid.
      await conn.query(
        `UPDATE otp_challenge
            SET status = ?, active_slot = NULL, consumed_at = ?
          WHERE id = ? AND status = 'active'`,
        [expired ? C.STATUS.EXPIRED : C.STATUS.INVALIDATED, at(now), row.id]
      );
    }

    const code = C.generateCode();
    const codeHash = await C.hashCode(code);
    const id = newId();
    const expiresAt = new Date(now.getTime() + C.TTL_MS);
    const resendAfter = new Date(now.getTime() + C.RESEND_WAIT_MS);

    await conn.query(
      `INSERT INTO otp_challenge
         (id, purpose, channel, destination_hash, code_hash, principal_id,
          status, attempts, max_attempts, issued_at, expires_at, resend_after,
          active_slot, correlation_id, ip)
       VALUES (?,?,?,?,?,?, 'active', 0, ?, ?, ?, ?, '1', ?, ?)`,
      [id, purpose, channel, destinationHash, codeHash, principalId,
       C.MAX_ATTEMPTS, at(now), at(expiresAt), at(resendAfter),
       correlationId, ip ? String(ip).slice(0, 45) : null]
    );

    await conn.commit();
    return { issued: true, code, challengeId: id, expiresAt, resendAfter };
  } catch (err) {
    try { await conn.rollback(); } catch { /* the connection is already gone */ }
    // A duplicate key here means another instance won the race between our
    // read and our insert. That is not an error the caller should see as one:
    // a live code exists, which is exactly what "throttled" means.
    if (err && err.code === "ER_DUP_ENTRY") {
      return { issued: false, reason: "throttled", retryAfterSeconds: Math.ceil(C.RESEND_WAIT_MS / 1000) };
    }
    if (err instanceof C.OtpError) throw err;
    throw new OtpStoreUnavailable(err);
  } finally {
    conn.release();
  }
}

/**
 * Verify a code.
 *
 * @returns {Promise<{ok: true, principalId: string|null, challengeId: string}
 *                  | {ok: false, reason: "none"|"expired"|"blocked"|"invalid"|"consumed"|"unusable"}>}
 *
 * The reason is for the audit log and for the caller's own logic. §13: it is
 * NOT for the response — `routes/auth.js` collapses every failure into one
 * message, so the endpoint cannot be used to discover whether a number is
 * currently in a login flow.
 */
async function verify(db, spec) {
  const { purpose, channel, destination, code, clock = systemClock } = spec;

  if (!C.isKnownPurpose(purpose)) throw new C.OtpError(`unknown OTP purpose "${purpose}"`, "UNKNOWN_PURPOSE");

  const destinationHash = C.hashDestination(channel, destination);
  const now = clock.now();

  let conn;
  try {
    conn = await db.getConnection();
  } catch (err) {
    throw new OtpStoreUnavailable(err);
  }

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, code_hash, principal_id, status, attempts, max_attempts, expires_at
         FROM otp_challenge
        WHERE destination_hash = ? AND purpose = ? AND status = 'active'
        FOR UPDATE`,
      [destinationHash, purpose]
    );

    const row = rows[0] || null;
    const blocker = C.unusableReason(row, now);

    if (blocker === "expired") {
      await conn.query(
        "UPDATE otp_challenge SET status = 'expired', active_slot = NULL WHERE id = ? AND status = 'active'",
        [row.id]
      );
      await conn.commit();
      return { ok: false, reason: "expired" };
    }
    if (blocker) {
      await conn.commit();
      return { ok: false, reason: blocker };
    }

    const matches = await C.codeMatches(code, row.code_hash);

    if (!matches) {
      const attempts = row.attempts + 1;
      const exhausted = attempts >= row.max_attempts;
      // Exhausting the attempts ends the challenge rather than leaving it to
      // sit unusable: the slot frees, so the user can immediately request a
      // fresh code instead of waiting out the TTL of one they can no longer
      // use.
      await conn.query(
        exhausted
          ? "UPDATE otp_challenge SET attempts = ?, status = 'invalidated', active_slot = NULL, consumed_at = ? WHERE id = ? AND status = 'active'"
          : "UPDATE otp_challenge SET attempts = ? WHERE id = ? AND status = 'active'",
        exhausted ? [attempts, at(now), row.id] : [attempts, row.id]
      );
      await conn.commit();
      return { ok: false, reason: exhausted ? "blocked" : "invalid" };
    }

    // §9, single use. Guarded on the status we read: if another request
    // consumed it between the SELECT and here, affectedRows is 0 and this
    // caller does not also succeed.
    const [consumed] = await conn.query(
      `UPDATE otp_challenge
          SET status = 'verified', active_slot = NULL, consumed_at = ?
        WHERE id = ? AND status = 'active'`,
      [at(now), row.id]
    );
    if (consumed.affectedRows === 0) {
      await conn.commit();
      return { ok: false, reason: "consumed" };
    }

    await conn.commit();
    return { ok: true, principalId: row.principal_id, challengeId: row.id };
  } catch (err) {
    try { await conn.rollback(); } catch { /* the connection is already gone */ }
    if (err instanceof C.OtpError) throw err;
    throw new OtpStoreUnavailable(err);
  } finally {
    conn.release();
  }
}

/**
 * §25. End every live challenge for a destination — a password change, a
 * suspension, an operator acting on a compromise.
 */
async function invalidateAll(db, { channel, destination, purpose = null, reason = "invalidated", clock = systemClock }) {
  const destinationHash = C.hashDestination(channel, destination);
  const params = [at(clock.now()), destinationHash];
  let where = "destination_hash = ? AND status = 'active'";
  if (purpose) { where += " AND purpose = ?"; params.push(purpose); }
  try {
    const [res] = await db.query(
      `UPDATE otp_challenge SET status = 'invalidated', active_slot = NULL, consumed_at = ? WHERE ${where}`,
      params
    );
    return res.affectedRows;
  } catch (err) {
    throw new OtpStoreUnavailable(err);
  }
}

/** Seconds until a live challenge for this destination may be re-sent. */
async function secondsUntilResend(db, { channel, destination, purpose, clock = systemClock }) {
  const destinationHash = C.hashDestination(channel, destination);
  const [rows] = await db.query(
    `SELECT resend_after FROM otp_challenge
      WHERE destination_hash = ? AND purpose = ? AND status = 'active' LIMIT 1`,
    [destinationHash, purpose]
  );
  if (!rows.length) return 0;
  const delta = new Date(rows[0].resend_after).getTime() - clock.now().getTime();
  return delta > 0 ? Math.ceil(delta / 1000) : 0;
}

module.exports = { issue, verify, invalidateAll, secondsUntilResend, OtpStoreUnavailable };
