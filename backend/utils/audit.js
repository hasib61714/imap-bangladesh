// ─────────────────────────────────────────────────────────────
//  IMAP – Audit logging
//  Append-only trail for sensitive actions (analytics access,
//  admin wallet adjustments, payment settlement). Writes to the
//  audit_log table and the application logger. Never throws.
// ─────────────────────────────────────────────────────────────
const pool   = require("../db");
const logger = require("./logger");

/**
 * Record an auditable action. Best-effort: failures are logged, not thrown,
 * so auditing can never break the primary request flow.
 *
 * @param {object} e
 * @param {string} [e.actor_id]    user id performing the action
 * @param {string} [e.actor_role]  role of the actor
 * @param {string}  e.action       short action code, e.g. "ai.analytics.view"
 * @param {string} [e.target_type] entity type acted upon
 * @param {string} [e.target_id]   entity id acted upon
 * @param {string} [e.ip]          request ip
 * @param {object} [e.meta]        small JSON-serialisable context (no secrets/PII dumps)
 */
async function audit(e = {}) {
  logger.info("AUDIT", {
    action: e.action, actor_id: e.actor_id, target_type: e.target_type,
    target_id: e.target_id, ip: e.ip,
  });
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_id, actor_role, action, target_type, target_id, ip, meta)
       VALUES (?,?,?,?,?,?,?)`,
      [
        e.actor_id || null, e.actor_role || null, e.action,
        e.target_type || null, e.target_id || null, e.ip || null,
        e.meta ? JSON.stringify(e.meta) : null,
      ]
    );
  } catch (err) {
    logger.warn("audit insert failed", { err: err.message, action: e.action });
  }
}

/** Express helper: pull a best-effort client IP from the request. */
function reqIp(req) {
  return req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null;
}

module.exports = { audit, reqIp };
