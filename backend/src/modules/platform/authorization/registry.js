/**
 * Policy registry — platform / authorization
 *
 * I-04 §7, and AUTHORIZATION-IMPLEMENTATION-PLAN A-2, which insists the
 * registry is built BEFORE the kernel:
 *
 *   "Building the kernel first and the registry later means a window in which
 *    unguarded use cases are possible — and that window never closes."
 *
 * THE ONE RULE THAT MATTERS
 * ─────────────────────────
 * A policy with no `resource` is rejected at registration
 * (AUTHORIZATION-ARCHITECTURE §3). That single rule is what makes the audited
 * defect — a role check with no resource — impossible to reintroduce, because
 * the code that would express it does not compile into a valid policy.
 *
 * It has an obvious escape hatch: name a resource and never look at it. That
 * is closed too. An `instance` policy must resolve a real row or the kernel
 * denies; a `collection` policy must declare a `scope`, which is a function
 * saying WHICH subset this actor may see. There is no shape of policy that
 * reduces to "has role, therefore yes".
 */
"use strict";

const { ALL_ROLES, assertKnownRole } = require("./roles");
const { isKnownPermission, PERMISSIONS } = require("./actions");

class AuthorizationConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthorizationConfigError";
  }
}

const CARDINALITY = new Set(["instance", "collection"]);
const AUDIT = new Set(["required", "on_deny", "none"]);
const TIERS = new Set(["A", "B", "C"]);
const STATUS_MODES = new Set(["indistinguishable", "legacy"]);

/** action → policy. Module-level, because there is one register per process. */
const policies = new Map();

/**
 * Register one policy.
 *
 * @param {string} action
 * @param {object} spec
 * @param {string}   spec.resource      resource TYPE. Required, always.
 * @param {string}   spec.permission    a verb from PERMISSIONS.
 * @param {string[]} spec.roles         roles that may plausibly perform it.
 *                                      `["*"]` means "any actor including
 *                                      anonymous" and must be written out.
 * @param {"instance"|"collection"} spec.cardinality
 * @param {(actor, resource, ctx) => boolean} [spec.relationship]
 *        instance only. Scope: is this actor related to THIS resource?
 * @param {(actor) => object} [spec.scope]
 *        collection only. Which subset may this actor see? Returning null
 *        means "no subset" and denies.
 * @param {(actor, resource, ctx) => boolean} [spec.conditions]
 *        state, time, verification level. Denies when false.
 * @param {(actor, resource, ctx) => boolean} [spec.shadowConditions]
 *        §23/§24. A condition the architecture specifies and the LIVE system
 *        does not yet apply. Evaluated, recorded, and discarded — it can only
 *        produce a discrepancy record, never a denial. Requires
 *        `shadowConditionsReason`.
 * @param {string} [spec.shadowConditionsReason]
 * @param {(actor, resource, ctx) => boolean} [spec.sameActor]
 *        true when the actor sits on both sides of a control that should
 *        require two people. Permitted at Gate 1; marked in audit (§12).
 * @param {boolean|(actor) => boolean} [spec.reasonRequired]
 * @param {"A"|"B"|"C"} spec.tier
 * @param {"required"|"on_deny"|"none"} spec.audit
 * @param {"indistinguishable"|"legacy"} [spec.statusMode="indistinguishable"]
 * @param {string} spec.why             one line. Why this shape, in review.
 */
function registerPolicy(action, spec) {
  if (typeof action !== "string" || !/^[a-z_]+\.[a-z_]+$/.test(action)) {
    throw new AuthorizationConfigError(
      `policy id "${action}" must look like "resource.verb" in lower snake case`
    );
  }
  if (policies.has(action)) {
    // Two policies for one action means two answers, and no way to know which
    // decided. AUTHORIZATION-ARCHITECTURE §10: there will be one.
    throw new AuthorizationConfigError(`policy "${action}" is already registered`);
  }
  if (!spec || typeof spec !== "object") {
    throw new AuthorizationConfigError(`policy "${action}" has no specification`);
  }

  // ── THE rule ──────────────────────────────────────────────
  if (typeof spec.resource !== "string" || !spec.resource.trim()) {
    throw new AuthorizationConfigError(
      `policy "${action}" names no resource. A role check with no resource is the ` +
      "audited defect (AUTHORIZATION-ARCHITECTURE §3); it is rejected at registration."
    );
  }

  if (!isKnownPermission(spec.permission)) {
    throw new AuthorizationConfigError(
      `policy "${action}" declares unknown permission "${spec.permission}". Known: ${PERMISSIONS.join(", ")}`
    );
  }

  if (!Array.isArray(spec.roles) || spec.roles.length === 0) {
    throw new AuthorizationConfigError(`policy "${action}" lists no roles`);
  }
  for (const role of spec.roles) {
    if (role === "*") continue;
    assertKnownRole(role, `policy "${action}"`);
  }

  if (!CARDINALITY.has(spec.cardinality)) {
    throw new AuthorizationConfigError(
      `policy "${action}" must declare cardinality "instance" or "collection"`
    );
  }

  // ── the escape hatch, closed ──────────────────────────────
  if (spec.cardinality === "instance" && typeof spec.relationship !== "function") {
    throw new AuthorizationConfigError(
      `policy "${action}" acts on one ${spec.resource} but declares no relationship. ` +
      "Naming a resource and never comparing the actor to it is the same defect " +
      "wearing a resource type."
    );
  }
  if (spec.cardinality === "collection" && typeof spec.scope !== "function") {
    throw new AuthorizationConfigError(
      `policy "${action}" acts on a set of ${spec.resource} but declares no scope. ` +
      "A collection policy must say WHICH subset this actor may see, even when " +
      "the answer is 'all of it' — an unwritten 'all' is indistinguishable from " +
      "a forgotten check."
    );
  }
  if (spec.cardinality === "collection" && spec.relationship) {
    throw new AuthorizationConfigError(
      `policy "${action}" is a collection policy and cannot have a relationship; use scope`
    );
  }

  if (!TIERS.has(spec.tier)) {
    throw new AuthorizationConfigError(`policy "${action}" must declare tier A, B or C (Constitution §4)`);
  }
  if (!AUDIT.has(spec.audit)) {
    throw new AuthorizationConfigError(`policy "${action}" must declare audit: required | on_deny | none`);
  }

  if (spec.shadowConditions && typeof spec.shadowConditions !== "function") {
    throw new AuthorizationConfigError(`policy "${action}" shadowConditions must be a function`);
  }
  if (spec.shadowConditions && !String(spec.shadowConditionsReason || "").trim()) {
    throw new AuthorizationConfigError(
      `policy "${action}" carries a shadow condition with no reason. A rule that is ` +
      "evaluated and then discarded must say why discarding it is acceptable, or it is " +
      "indistinguishable from a rule someone forgot to switch on."
    );
  }

  if (spec.conditionMessage && typeof spec.conditionMessage !== "string") {
    throw new AuthorizationConfigError(`policy "${action}" conditionMessage must be a string`);
  }

  const statusMode = spec.statusMode || "indistinguishable";
  if (!STATUS_MODES.has(statusMode)) {
    throw new AuthorizationConfigError(`policy "${action}" has unknown statusMode "${statusMode}"`);
  }

  if (!String(spec.why || "").trim()) {
    throw new AuthorizationConfigError(`policy "${action}" has no "why"`);
  }

  const policy = Object.freeze({
    action,
    resource: spec.resource,
    permission: spec.permission,
    roles: Object.freeze([...spec.roles]),
    cardinality: spec.cardinality,
    relationship: spec.relationship || null,
    scope: spec.scope || null,
    conditions: spec.conditions || null,
    /**
     * A safe message for a CONDITION failure only.
     *
     * A relationship denial must stay opaque — saying "this booking belongs to
     * someone else" confirms the booking exists and that the caller is not its
     * owner. A condition denial is different in kind: the state it names is one
     * the actor already knows, because it is a fact about the actor or about a
     * resource they are entitled to reach. "You cannot deactivate your own
     * account" tells an operator nothing they did not just type.
     *
     * Used ONLY when the deny reason is `invalid_state`. Any other reason
     * ignores it.
     */
    conditionMessage: spec.conditionMessage || null,
    shadowConditions: spec.shadowConditions || null,
    shadowConditionsReason: spec.shadowConditionsReason || null,
    sameActor: spec.sameActor || null,
    reasonRequired: spec.reasonRequired ?? false,
    tier: spec.tier,
    audit: spec.audit,
    statusMode,
    why: spec.why,
  });

  policies.set(action, policy);
  return policy;
}

const getPolicy = (action) => policies.get(action) || null;
const hasPolicy = (action) => policies.has(action);
const registeredActions = () => [...policies.keys()].sort();
const allPolicies = () => [...policies.values()];

/**
 * The startup assertion (A-2). Called from the composition root; throws to
 * refuse startup.
 *
 * A process that cannot authorize correctly should not accept a request and
 * then fail. It should not accept the request.
 *
 * @param {{ hasLoader: (type: string) => boolean }} deps
 */
function assertRegistryIsSound(deps) {
  const problems = [];

  if (policies.size === 0) {
    problems.push("no policies are registered — the register is empty, which cannot be correct");
  }

  for (const policy of policies.values()) {
    if (policy.cardinality === "instance" && !deps.hasLoader(policy.resource)) {
      problems.push(
        `"${policy.action}" acts on one ${policy.resource}, but no loader for ` +
        `"${policy.resource}" is registered. Without a loader the resource would have ` +
        "to come from the request, which is the ownership-from-the-client defect."
      );
    }
    if (policy.tier === "C" && policy.audit === "none") {
      problems.push(`"${policy.action}" is Tier C and unaudited — a Tier-C action is by definition one worth recording`);
    }
  }

  if (problems.length) {
    throw new AuthorizationConfigError(
      ["Refusing to start — the authorization register is unsound:", "", ...problems.map((p) => `  • ${p}`)].join("\n")
    );
  }
  return { policies: policies.size };
}

/** Test-only. Never called by application code; a test asserts that. */
function __resetRegistryForTests() {
  policies.clear();
}

module.exports = {
  registerPolicy,
  getPolicy,
  hasPolicy,
  registeredActions,
  allPolicies,
  assertRegistryIsSound,
  AuthorizationConfigError,
  ALL_ROLES,
  __resetRegistryForTests,
};
