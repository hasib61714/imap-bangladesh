/**
 * Actor — platform / authorization
 *
 * I-04, AUTHORIZATION-ARCHITECTURE §2.1.
 *
 * The authenticated subject plus the context they are acting in. This is the
 * richer object `audit/auditActor.js` said would arrive: that one describes
 * who did something, for the record; this one is consulted by a decision.
 *
 * ANONYMOUS IS AN ACTOR
 * ─────────────────────
 * Not `null`, not an early return before the kernel is reached. A missing
 * actor means every call site has to remember to check for it first, and one
 * that forgets fails open. An anonymous actor flows through the same kernel
 * and is denied by the same policy, so forgetting is not possible.
 *
 * ROLES ARE PLURAL
 * ────────────────
 * §7 gives one person six platform roles at Gate 1, so an actor holds a SET.
 * `primaryRole` is what the audit log records — the role as it was actually
 * held, which for a legacy administrator is the string `admin`, not one of
 * the six. That mismatch is the Gate-1 limitation, and having it visible in
 * every audit record is better than smoothing it over.
 */
"use strict";

const { ROLE, isKnownRole } = require("./roles");

const VIA = new Set(["http", "ai", "job", "system", "ops"]);

/**
 * @param {object} spec
 * @param {string|null} spec.principalId
 * @param {string|null} [spec.accountId]
 * @param {string[]}    spec.roles
 * @param {string}      [spec.primaryRole]  defaults to roles[0]
 * @param {string}      [spec.via="http"]
 * @param {string|null} [spec.correlationId]
 * @param {string|null} [spec.sessionId]
 * @param {string}      spec.source  where the roles came from — "legacy",
 *        "membership", "anonymous" or "system". Recorded so a decision can be
 *        traced to the mechanism that produced it during the transition.
 */
function makeActor(spec) {
  const via = spec.via || "http";
  if (!VIA.has(via)) throw new TypeError(`unknown actor via "${via}"`);

  // An unknown role is dropped rather than carried: a policy comparing
  // against a misspelt role would silently never match, and the endpoint
  // would look guarded while the actor was in fact role-less. Dropping makes
  // the actor visibly role-less, which denies.
  const roles = Object.freeze((spec.roles || []).filter(isKnownRole));
  const authenticated = Boolean(spec.principalId) && roles.length > 0
    && !(roles.length === 1 && roles[0] === ROLE.ANONYMOUS);

  return Object.freeze({
    principalId: spec.principalId || null,
    accountId: spec.accountId || null,
    roles,
    primaryRole: spec.primaryRole || roles[0] || ROLE.ANONYMOUS,
    via,
    sessionId: spec.sessionId || null,
    correlationId: spec.correlationId || null,
    source: spec.source || "unknown",
    authenticated,
  });
}

/** The actor a request has before it proves anything. */
function anonymousActor({ correlationId = null, via = "http" } = {}) {
  return makeActor({
    principalId: null,
    roles: [ROLE.ANONYMOUS],
    primaryRole: ROLE.ANONYMOUS,
    via,
    correlationId,
    source: "anonymous",
  });
}

/**
 * A job or event consumer.
 *
 * `name` is mandatory and appears in the audit record. §5 of the architecture
 * requires "an explicit, narrow system actor — never a wildcard", and a name
 * is the difference: "the payout reconciliation job" can be reviewed, "the
 * system" cannot.
 */
function systemActor(name, { correlationId = null } = {}) {
  if (!String(name || "").trim()) {
    throw new TypeError("a system actor must be named — a wildcard system actor is forbidden (§5)");
  }
  return makeActor({
    principalId: null,
    roles: [ROLE.SYSTEM],
    primaryRole: ROLE.SYSTEM,
    via: "system",
    correlationId,
    source: `system:${name}`,
  });
}

const hasRole = (actor, role) => actor.roles.includes(role);
const hasAnyRole = (actor, roles) => roles.some((r) => actor.roles.includes(r));

module.exports = { makeActor, anonymousActor, systemActor, hasRole, hasAnyRole, VIA };
