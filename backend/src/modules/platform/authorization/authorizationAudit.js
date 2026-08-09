/**
 * Authorization audit — platform / authorization
 *
 * I-04 §25, §26, §27. What a decision leaves behind.
 *
 * WHAT IS RECORDED, AND WHAT IS NOT
 * ─────────────────────────────────
 * §25 says audit must be purposeful — "do not record every harmless GET
 * request indefinitely". The policy decides, not this module:
 *
 *   audit: "required"  every decision, permitted or denied. Reserved for
 *                      Sealed reads, privilege changes and money decisions.
 *   audit: "on_deny"   denials only. An attempt to reach something you may
 *                      not reach is evidence; succeeding at what you are
 *                      entitled to is noise.
 *   audit: "none"      neither. `booking.observe` runs on every page view.
 *
 * Two things are recorded regardless of the policy, because both are facts
 * about the CONTROLS rather than about the request:
 *
 *   - a separation-of-duties bypass (§12)
 *   - a shadow-rule mismatch (§24)
 *
 * WHY MOST OF THIS IS OUT OF BAND
 * ───────────────────────────────
 * §27: a state change and its audit record must share a transaction. A
 * DENIAL changes no state, so there is no transaction to join and none is
 * invented. The two live state changes that must be atomic with their record
 * — a role grant and a verification decision — call `writeAudit(conn, …)`
 * from inside their own transaction, and this module is not involved.
 */
"use strict";

const { writeAuditOutOfBand } = require("../audit/writeAudit");

/** §26. Never in an audit payload; the writer's denylist covers the rest. */
const AUDITABLE_CONTEXT_KEYS = ["targetStatus", "requestedRole"];

function shouldRecord(policy, decision) {
  if (decision.sodBypass) return true;
  if (decision.shadow) return true;
  if (!policy) return true;                       // unregistered action: record it
  if (policy.audit === "required") return true;
  if (policy.audit === "on_deny") return !decision.allowed;
  return false;
}

/**
 * Record an authorization decision.
 *
 * Never throws. An audit failure must not convert a correct denial into a
 * 500, or a correct permit into one — but it is logged at error level, so it
 * is loud rather than silent.
 *
 * @param {object} pool
 * @param {object} params
 * @param {object} params.actor
 * @param {object} params.decision
 * @param {string} params.action
 * @param {string|null} [params.resourceId]
 * @param {string|null} [params.reason]  the human-stated reason, where policy required one
 */
async function recordDecision(pool, params) {
  const { actor, decision, action } = params;
  const policy = decision.policy;
  if (!shouldRecord(policy, decision)) return false;

  return writeAuditOutOfBand(pool, {
    actor: {
      correlationId: actor.correlationId,
      principalId: actor.principalId,
      accountId: actor.accountId,
      // The role AS HELD. For a Gate-1 administrator that is the legacy
      // string, not one of the six — see legacy.js.
      role: actor.primaryRole,
      via: actor.via,
      onBehalfOf: null,
    },
    action,
    resourceType: policy ? policy.resource : "unknown",
    resourceId: params.resourceId ?? null,
    resourceOwner: ownerOf(decision.resource),
    outcome: decision.allowed ? "permitted" : "denied",
    // A decision changes nothing by itself; before/after belong to the use
    // case that acts on the permit.
    before: null,
    after: null,
    reason: params.reason ?? null,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
    sodBypass: decision.sodBypass,
    denyReason: decision.allowed ? null : decision.reason,
  });
}

/**
 * Whose resource it was. Resolved from the LOADED row, so it is the database's
 * answer rather than the request's — which is the same rule the relationship
 * predicates follow, applied to the record.
 */
function ownerOf(resource) {
  if (!resource) return null;
  return (
    resource.customerId ??
    resource.subjectUserId ??
    resource.payerUserId ??
    resource.raisedByUserId ??
    resource.applicantUserId ??
    (resource.type === "user" ? resource.id : null) ??
    null
  );
}

module.exports = { recordDecision, shouldRecord, ownerOf, AUDITABLE_CONTEXT_KEYS };
