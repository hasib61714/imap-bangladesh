/**
 * Membership resolution — platform / authorization
 *
 * I-04 §13, §14. Turns an authenticated principal plus a requested context
 * into an actor, by asking the database what that principal actually holds.
 *
 * THE RULE
 * ────────
 * A client may SAY which account it is acting for. It may not say whether it
 * belongs to it. `account_id` in a request is a selector, never a claim —
 * the server looks the membership up, and a principal with no live membership
 * in the requested account is denied regardless of what it sent.
 *
 * WHY AMBIGUITY DENIES INSTEAD OF PICKING
 * ───────────────────────────────────────
 * A principal with a consumer account and a provider account has two
 * memberships. Asked to act with no context stated, this resolver refuses
 * rather than choosing. Choosing would mean an implicit rule, and the only
 * two implicit rules available are "the first row" — which is arbitrary and
 * ordering-dependent — and "the most capable" — which is privilege escalation
 * with a friendly name.
 *
 * NOT LIVE YET
 * ────────────
 * `membership` is populated by scripts/backfill-identity.js, which has not
 * been applied. `users.role` remains the authorization source until the
 * cutover (I-03 §32). This resolver is built, tested against a real engine,
 * and called by nothing on the request path — see legacy.js for what is.
 */
"use strict";

const { makeActor } = require("./actor");
const { DENY } = require("./decision");
const { isGrantableRole } = require("./roles");

/** A principal may act only from `active`. `registered` has not completed sign-up. */
const LIVE_PRINCIPAL_STATUS = "active";
const LIVE_ACCOUNT_STATUS = "active";

/**
 * Every live membership this principal holds, with the account attached.
 *
 * One query, not one per account (§36). `revoked_at IS NULL` is applied in
 * SQL rather than in JavaScript so a revoked membership is never in memory to
 * be used by mistake.
 */
async function liveMemberships(db, principalId) {
  const [rows] = await db.query(
    `SELECT m.id            AS membership_id,
            m.role          AS role,
            m.account_id    AS account_id,
            a.kind          AS account_kind,
            a.status        AS account_status,
            p.status        AS principal_status
       FROM membership m
       JOIN account   a ON a.id = m.account_id
       JOIN principal p ON p.id = m.principal_id
      WHERE m.principal_id = ?
        AND m.revoked_at IS NULL
      ORDER BY m.granted_at ASC, m.id ASC`,
    [principalId]
  );
  return rows;
}

/**
 * Resolve the acting context.
 *
 * @param {object} db
 * @param {string} principalId
 * @param {string|null} requestedAccountId  what the client asked for. A
 *        selector; never treated as proof.
 * @param {object} [ctx] { correlationId, sessionId, via }
 * @returns {Promise<{ok: true, actor: object} | {ok: false, reason: string}>}
 */
async function resolveActor(db, principalId, requestedAccountId = null, ctx = {}) {
  if (!principalId) return { ok: false, reason: DENY.UNAUTHENTICATED };

  const rows = await liveMemberships(db, principalId);
  if (rows.length === 0) return { ok: false, reason: DENY.NO_MEMBERSHIP };

  // The principal's own standing, before any account is considered. A
  // suspended person does not become active by acting for a live account.
  if (rows[0].principal_status !== LIVE_PRINCIPAL_STATUS) {
    return { ok: false, reason: DENY.ACCOUNT_DISABLED };
  }

  let chosen;
  if (requestedAccountId) {
    chosen = rows.find((r) => String(r.account_id) === String(requestedAccountId));
    // The membership does not exist, or exists and is revoked — the query
    // already excluded revoked rows, so both look identical from here, which
    // is correct: neither grants anything.
    if (!chosen) return { ok: false, reason: DENY.WRONG_ACCOUNT };
  } else if (rows.length === 1) {
    chosen = rows[0];
  } else {
    return { ok: false, reason: DENY.WRONG_ACCOUNT };
  }

  if (chosen.account_status !== LIVE_ACCOUNT_STATUS) {
    return { ok: false, reason: DENY.ACCOUNT_DISABLED };
  }
  // A role string the kernel does not know grants nothing. Storing an
  // unrecognised role is a data defect; treating it as "some role" would be
  // a security one.
  if (!isGrantableRole(chosen.role)) {
    return { ok: false, reason: DENY.NO_MEMBERSHIP };
  }

  return {
    ok: true,
    actor: makeActor({
      principalId,
      accountId: chosen.account_id,
      roles: [chosen.role],
      primaryRole: chosen.role,
      via: ctx.via || "http",
      correlationId: ctx.correlationId || null,
      sessionId: ctx.sessionId || null,
      source: "membership",
    }),
  };
}

module.exports = { resolveActor, liveMemberships, LIVE_PRINCIPAL_STATUS, LIVE_ACCOUNT_STATUS };
