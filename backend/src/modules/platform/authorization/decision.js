/**
 * Authorization decision — platform / authorization
 *
 * I-04 §6. A decision is more than a boolean, and its extra content is
 * deliberately split in two:
 *
 *   reason      a fixed enum, for the audit log and for the developer
 *   response    what the caller is allowed to learn
 *
 * The split is the whole point. "Denied because you are not this booking's
 * customer" tells an attacker the booking exists and that someone else owns
 * it. `NOT_OWNER` records exactly that internally and says nothing outward.
 */
"use strict";

/**
 * §6's list, plus two the architecture requires:
 *
 *   NOT_FOUND      the resource did not load. Distinct from NOT_OWNER
 *                  internally; deliberately indistinguishable outward
 *                  (AUTHORIZATION-ARCHITECTURE §8).
 *   REASON_REQUIRED an admin override with no stated reason is unappealable
 *                  (R-1103). It is a denial, not a validation error, because
 *                  the policy — not the schema — is what requires it.
 */
const DENY = Object.freeze({
  UNAUTHENTICATED: "unauthenticated",
  NO_MEMBERSHIP: "no_membership",
  MISSING_PERMISSION: "missing_permission",
  WRONG_ACCOUNT: "wrong_account",
  NOT_OWNER: "not_owner",
  WRONG_RESOURCE: "wrong_resource",
  INVALID_STATE: "invalid_state",
  ACCOUNT_DISABLED: "account_disabled",
  POLICY_DENIED: "policy_denied",
  NOT_FOUND: "not_found",
  REASON_REQUIRED: "reason_required",
});

const DENY_REASONS = Object.freeze(Object.values(DENY));
const DENY_SET = new Set(DENY_REASONS);

/**
 * User-facing text. Three strings for eleven reasons, because the mapping is
 * deliberately lossy: a caller may learn "you are not authenticated", "you may
 * not do this", or "this does not exist", and nothing finer.
 */
const PUBLIC_MESSAGE = Object.freeze({
  [DENY.UNAUTHENTICATED]: "Authentication required",
  [DENY.NOT_FOUND]: "Not found",
  [DENY.WRONG_RESOURCE]: "Not found",
});
const DEFAULT_MESSAGE = "Access denied";

/**
 * HTTP status, in two modes.
 *
 * `indistinguishable` is the architecture's target (API-ARCHITECTURE §4.1,
 * CRITICAL-TEST-MATRIX row 16): a resource the caller may not see returns the
 * same status as one that does not exist, so the API cannot be used to
 * enumerate ids.
 *
 * `legacy` preserves what `/api/*` returns today — 403 when the resource
 * exists and the caller is not a participant, 404 when it does not. That is
 * an enumeration oracle and it is recorded as such
 * (I-04-AUTHORIZATION-MAP.md §7). It is kept because collapsing it to 404
 * changes responses the current frontend and the existing P0-7/P0-8 tests
 * both depend on, and that is a product decision with an owner, not a
 * side effect of building a kernel.
 *
 * Which policies use which mode is declared per policy and asserted by a
 * test, so the exception is counted rather than assumed.
 */
function toHttpStatus(reason, mode = "indistinguishable") {
  if (reason === DENY.UNAUTHENTICATED) return 401;
  if (reason === DENY.INVALID_STATE) return 409;
  if (reason === DENY.REASON_REQUIRED) return 422;
  if (reason === DENY.NOT_FOUND || reason === DENY.WRONG_RESOURCE) return 404;

  // Everything left is "the resource exists and you may not touch it".
  if (mode === "legacy") return 403;
  return 404;
}

/**
 * @param {object} policy
 * @param {object} [extra]
 * @param {object|null} [extra.resource]  the loaded resource, so the caller
 *        does not query it a second time (§36 — no N+1 authorization)
 * @param {boolean} [extra.sodBypass]     same actor on both sides of a control
 *        that should require two people (§12)
 */
function permit(policy, extra = {}) {
  return Object.freeze({
    allowed: true,
    action: policy.action,
    reason: null,
    resource: extra.resource ?? null,
    /** Collection policies only: the subset this actor may see. */
    scope: extra.scope ?? null,
    sodBypass: Boolean(extra.sodBypass),
    /** §24: set when a shadow rule disagreed. Never affects `allowed`. */
    shadow: extra.shadow ?? null,
    policy,
  });
}

function deny(reason, policy = null, extra = {}) {
  if (!DENY_SET.has(reason)) {
    // A free-text reason would leak into the audit log and, eventually, into
    // a response. The enum is the control.
    throw new TypeError(`unknown deny reason "${reason}" — must be one of: ${DENY_REASONS.join(", ")}`);
  }
  return Object.freeze({
    allowed: false,
    action: policy ? policy.action : (extra.action ?? null),
    reason,
    resource: null,
    scope: null,
    sodBypass: false,
    shadow: null,
    policy,
  });
}

/** What a denied caller is told. Never derived from the resource. */
function publicResponse(decision, statusMode = "indistinguishable") {
  const status = toHttpStatus(decision.reason, statusMode);
  return { status, body: { error: PUBLIC_MESSAGE[decision.reason] ?? DEFAULT_MESSAGE } };
}

module.exports = { DENY, DENY_REASONS, permit, deny, toHttpStatus, publicResponse, PUBLIC_MESSAGE };
