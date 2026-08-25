/**
 * Audit writer — platform
 *
 * I-02 created `audit_log`. Nothing wrote to it. This is the minimum writer
 * §35 permits: enough for authentication events, and no more.
 *
 * WHY THIS EXISTS AT ALL
 * ──────────────────────
 * CREDENTIAL-INCIDENT.md §2 has to answer "was the published admin credential
 * used?" with UNKNOWN, and it will say UNKNOWN for that period forever,
 * because no authentication attempt was ever recorded. From the moment this
 * ships, that question is answerable for every subsequent period.
 *
 * WHAT THIS IS NOT
 * ────────────────
 * Not the full audit system. AD-009's rule — every state change writes its
 * audit record inside the same transaction, and a state change without one
 * fails — needs the use-case layer that arrives with the domain modules. Two
 * halves of that rule are enforced here already:
 *
 *   - a connection may be passed, and when it is, the record commits or rolls
 *     back with the change
 *   - the payload is a computed diff of CHANGED FIELDS ONLY; handing it a
 *     whole row throws
 *
 * `writeAuditOutOfBand` exists for events that have no transaction to join —
 * a failed login changes no state but must still be recorded. It is a
 * separate, named function so that using it is a visible choice rather than
 * the accidental default.
 */
"use strict";

const { newId } = require("../../../shared/ids");
const { systemClock } = require("../../../shared/clock");

const VIA = new Set(["http", "ai", "job", "system", "ops"]);
const OUTCOMES = new Set(["permitted", "denied", "failed"]);

/**
 * Fields that must never reach the log. It is widely readable within
 * operations, so a value that is sensitive anywhere is sensitive here.
 * AUDIT-LOG-ARCHITECTURE §3.2 records the metadata instead of the value.
 */
const FORBIDDEN_FIELDS = new Set([
  "password", "password_hash", "secret_hash", "secret", "token",
  "refresh_token", "refresh_token_hash", "access_token", "otp", "otp_code",
  "credential", "authorization", "cookie", "session_token", "api_key",
  "front_image", "back_image", "selfie_image", "certificate_image",
  "card_number", "cvv", "pin",
]);

class AuditError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuditError";
  }
}

/**
 * Changed fields only, computed here rather than trusted from the caller.
 *
 * A whole-row before/after turns the log into an uncontrolled second copy of
 * the database and drags every sensitive column along with it. Computing the
 * diff is the difference between an audit log and a replica.
 */
function diffChangedFields(before, after) {
  if (!before && !after) return { before: null, after: null };
  const b = before || {};
  const a = after || {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const outBefore = {};
  const outAfter = {};
  let changed = false;
  for (const k of keys) {
    const bv = b[k];
    const av = a[k];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    changed = true;
    if (k in b) outBefore[k] = bv;
    if (k in a) outAfter[k] = av;
  }
  if (!changed) return { before: null, after: null };
  return { before: Object.keys(outBefore).length ? outBefore : null,
           after: Object.keys(outAfter).length ? outAfter : null };
}

function assertNoForbiddenFields(payload, action) {
  if (!payload) return;
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_FIELDS.has(key.toLowerCase())) {
      throw new AuditError(
        `audit payload for "${action}" contains a forbidden field "${key}". ` +
        "Record the metadata, not the value — see AUDIT-LOG-ARCHITECTURE §3.2."
      );
    }
  }
}

// sod_bypass and deny_reason arrive with migration 008 (I-04). Both are
// defaulted in the schema, so a record written without them is still valid —
// but they are always supplied here, because "0" and "not recorded" must not
// be the same value in a log used to count exceptions.
const INSERT = `
  INSERT INTO audit_log (
    id, occurred_at, correlation_id,
    actor_principal_id, actor_account_id, actor_role, actor_via, on_behalf_of,
    action, resource_type, resource_id, resource_owner,
    outcome, before_json, after_json, reason, ip, user_agent,
    sod_bypass, deny_reason
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

function buildRecord(spec, clock) {
  const {
    actor = {}, action, resourceType, resourceId = null, resourceOwner = null,
    outcome = "permitted", before = null, after = null, reason = null,
    ip = null, userAgent = null, sodBypass = false, denyReason = null,
  } = spec;

  if (!action) throw new AuditError("audit record requires an action");
  if (!resourceType) throw new AuditError(`audit record for "${action}" requires a resourceType`);
  if (!OUTCOMES.has(outcome)) throw new AuditError(`unknown audit outcome "${outcome}"`);

  const via = actor.via || "system";
  if (!VIA.has(via)) throw new AuditError(`unknown actor_via "${via}"`);
  if (!actor.correlationId) throw new AuditError(`audit record for "${action}" requires a correlation id`);

  const diff = diffChangedFields(before, after);
  assertNoForbiddenFields(diff.before, action);
  assertNoForbiddenFields(diff.after, action);

  return [
    newId(),
    clock.now(),
    actor.correlationId,
    actor.principalId || null,
    actor.accountId || null,
    // Every actor has a role, including one that has not authenticated.
    // "anonymous" is a fact about the actor, not a missing value.
    actor.role || "anonymous",
    via,
    actor.onBehalfOf || null,
    action,
    resourceType,
    resourceId,
    resourceOwner,
    outcome,
    diff.before ? JSON.stringify(diff.before) : null,
    diff.after ? JSON.stringify(diff.after) : null,
    reason,
    ip ? String(ip).slice(0, 45) : null,
    userAgent ? String(userAgent).slice(0, 255) : null,
    sodBypass ? 1 : 0,
    denyReason ? String(denyReason).slice(0, 40) : null,
  ];
}

/**
 * Write inside a caller's transaction.
 *
 * `conn` is REQUIRED. The record then commits or rolls back with the change
 * it records, which is AD-009's whole point: an audit record that can be lost
 * while the change succeeds is not an audit record.
 */
async function writeAudit(conn, spec, clock = systemClock) {
  if (!conn || typeof conn.query !== "function") {
    throw new AuditError(
      "writeAudit requires a transaction connection. For an event with no " +
      "state change to join, use writeAuditOutOfBand() — deliberately, and by name."
    );
  }
  await conn.query(INSERT, buildRecord(spec, clock));
}

/**
 * Write with no transaction, for an event that changes no state.
 *
 * A failed login is the case this exists for: nothing to commit, but the
 * attempt is exactly what an investigation needs. Named separately so that
 * choosing it is visible in review rather than being the path of least
 * resistance.
 *
 * Never throws to its caller. An audit failure must not turn a successful
 * authentication into a 500 — but it must be loud, so it is logged at error.
 */
async function writeAuditOutOfBand(pool, spec, clock = systemClock) {
  try {
    await pool.query(INSERT, buildRecord(spec, clock));
    return true;
  } catch (err) {
    // eslint-disable-next-line global-require
    require("../../../../utils/logger").error("audit write failed", {
      action: spec && spec.action,
      err: err.message,
    });
    return false;
  }
}

module.exports = {
  writeAudit,
  writeAuditOutOfBand,
  diffChangedFields,
  assertNoForbiddenFields,
  AuditError,
  FORBIDDEN_FIELDS,
};
