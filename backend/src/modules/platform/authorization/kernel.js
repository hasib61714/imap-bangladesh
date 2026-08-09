/**
 * Authorization kernel — platform / authorization
 *
 * I-04 §5. One entry point:
 *
 *     authorize(actor, action, resourceRef, ctx) → permit | deny(reason)
 *
 * Three implementations existed before this: `requireRole()`, inline `if`
 * blocks in eighteen route files, and `utils/bookingAccess.js`. There is one
 * now, and the route files call it rather than deciding for themselves.
 *
 * ORDER, AND WHY
 * ──────────────
 *   1. policy      — unregistered action denies. It cannot happen; startup
 *                    asserts it. If it happens anyway, it denies.
 *   2. actor       — an actor that is not an actor denies before anything
 *                    else is consulted.
 *   3. role        — cheap, and it decides whether loading the resource is
 *                    even worth a round trip.
 *   4. resource    — loaded from the database, never from the request.
 *   5. relationship— is this actor related to THIS row?
 *   6. conditions  — state, verification level, time.
 *   7. reason      — an override with no stated reason is unappealable.
 *
 * EVERY EXIT IS A DENY EXCEPT THE LAST ONE.
 *
 * That is the fail-closed property, and it is structural rather than
 * intended: there is no `return permit` anywhere above the final line, so no
 * early return can accidentally allow. A missing policy, an unloadable
 * resource, a relationship function that throws — all of them land on deny.
 */
"use strict";

const { getPolicy } = require("./registry");
const { loadResource, wasLoadedFromDatabase } = require("./resources");
const { DENY, DENY_REASONS, permit, deny } = require("./decision");
const { ROLE } = require("./roles");

const DENY_SET = new Set(DENY_REASONS);

/**
 * @param {object} actor
 * @param {string} action
 * @param {string|null} resourceRef  the id. Never an object from the request.
 * @param {object} ctx  { db, reason, ...domain context }
 */
async function authorize(actor, action, resourceRef = null, ctx = {}) {
  const policy = getPolicy(action);

  // 1 ── unregistered action.
  //
  // The startup assertion means an unregistered action reaching here is a
  // programming error, not a configuration one. It still denies rather than
  // throwing: a kernel whose failure mode is an exception has a failure mode
  // that a `catch (e) { next() }` somewhere can turn into a permit.
  if (!policy) return deny(DENY.POLICY_DENIED, null, { action });

  // 2 ── the actor must be one, and 3 ── the role must be plausible.
  //
  // Two different failures at step 2, and conflating them sends the wrong
  // answer: no principal at all is `unauthenticated` and signing in would
  // help; a principal holding nothing is `no_membership` and signing in again
  // would not, so telling them to try produces a login loop.
  const gate = checkActorAndRole(policy, actor);
  if (gate) return gate;

  // ── collection: no row to load; the scope decides the subset ──
  if (policy.cardinality === "collection") {
    let scope;
    try {
      scope = policy.scope(actor, ctx);
    } catch {
      return deny(DENY.POLICY_DENIED, policy);
    }
    if (!scope) return deny(DENY.MISSING_PERMISSION, policy);

    const reasonDenial = checkReason(policy, actor, null, ctx);
    if (reasonDenial) return reasonDenial;

    return permit(policy, {
      resource: null,
      scope,
      sodBypass: evaluateSameActor(policy, actor, null, ctx),
      shadow: evaluateShadow(policy, actor, null, ctx),
    });
  }

  // 4 ── the resource, from the database.
  if (resourceRef === null || resourceRef === undefined || resourceRef === "") {
    // An instance policy with no id is not "no constraint"; it is a call the
    // kernel cannot evaluate, and an unevaluatable call denies.
    return deny(DENY.WRONG_RESOURCE, policy);
  }

  let resource;
  try {
    resource = await loadResource(policy.resource, resourceRef, ctx);
  } catch {
    // A loader that fails is not evidence of permission.
    return deny(DENY.NOT_FOUND, policy);
  }
  if (!resource) return deny(DENY.NOT_FOUND, policy);

  return decideAgainst(policy, actor, resource, ctx);
}

/**
 * Authorize a SECOND action against a resource this caller already loaded.
 *
 * Reading a booking and then deciding whether its completion OTP may be read
 * are two decisions about one row. Loading it twice is the N+1 §36 warns
 * about, and it is avoidable without weakening anything — provided the row
 * genuinely came from a loader.
 *
 * That proviso is the whole design. `resource` must carry the symbol
 * `loadResource` stamps, and its `type` must match the policy's. A caller
 * that hands over a request body, or a row it fetched itself with a WHERE
 * clause of its own choosing, is DENIED — not trusted, not warned about.
 * Without that, this function would be the request-supplied-ownership defect
 * with a nicer name.
 */
async function authorizeLoaded(actor, action, resource, ctx = {}) {
  const policy = getPolicy(action);
  if (!policy) return deny(DENY.POLICY_DENIED, null, { action });
  if (policy.cardinality !== "instance") return deny(DENY.WRONG_RESOURCE, policy);

  if (!wasLoadedFromDatabase(resource) || resource.type !== policy.resource) {
    return deny(DENY.WRONG_RESOURCE, policy);
  }

  const gate = checkActorAndRole(policy, actor);
  if (gate) return gate;

  return decideAgainst(policy, actor, resource, ctx);
}

/** Steps 2 and 3, shared. Returns a denial, or null to continue. */
function checkActorAndRole(policy, actor) {
  if (!actor || typeof actor !== "object" || !Array.isArray(actor.roles)) {
    return deny(DENY.UNAUTHENTICATED, policy);
  }
  const wildcard = policy.roles.includes("*");
  const anonymousOnly = actor.roles.length === 0
    || (actor.roles.length === 1 && actor.roles[0] === ROLE.ANONYMOUS);
  if (!wildcard) {
    if (!actor.principalId) return deny(DENY.UNAUTHENTICATED, policy);
    if (anonymousOnly) return deny(DENY.NO_MEMBERSHIP, policy);
  }
  if (!wildcard && !policy.roles.some((r) => actor.roles.includes(r))) {
    return deny(DENY.MISSING_PERMISSION, policy);
  }
  return null;
}

/** Steps 5 to 7, shared. */
function decideAgainst(policy, actor, resource, ctx) {
  // 5 ── relationship.
  //
  // A relationship function returns `true`, `false`, or one of the DENY
  // reasons when it can say something more precise than "not the owner" —
  // `wrong_account` for a member of a different account, `account_disabled`
  // for a membership that exists but is not live. The reason is internal; the
  // caller is told the same thing either way.
  let related;
  try {
    related = policy.relationship(actor, resource, ctx);
  } catch {
    return deny(DENY.POLICY_DENIED, policy);
  }
  if (related !== true) {
    const precise = typeof related === "string" && DENY_SET.has(related) ? related : null;
    if (precise) return deny(precise, policy);
    if (related) return deny(DENY.NOT_OWNER, policy);   // truthy but not `true`: not an approval
    return deny(DENY.NOT_OWNER, policy);
  }

  // 6 ── conditions: state, verification, time.
  if (policy.conditions) {
    let ok;
    try {
      ok = policy.conditions(actor, resource, ctx);
    } catch {
      return deny(DENY.POLICY_DENIED, policy);
    }
    if (!ok) return deny(DENY.INVALID_STATE, policy);
  }

  // 7 ── a stated reason, where the policy demands one.
  const reasonDenial = checkReason(policy, actor, resource, ctx);
  if (reasonDenial) return reasonDenial;

  return permit(policy, {
    resource,
    sodBypass: evaluateSameActor(policy, actor, resource, ctx),
    shadow: evaluateShadow(policy, actor, resource, ctx),
  });
}

/**
 * §24. A rule the architecture specifies and the live system does not yet
 * apply. It runs only on a decision that is otherwise a permit, because that
 * is the only case where it says anything: "legacy allows this and the target
 * design would not".
 *
 * It CANNOT deny. There is no path from this function to a deny — the caller
 * receives it on an already-constructed permit. Shadow logic that could
 * become authoritative by accident is the failure mode §24 names, and the
 * only reliable defence is for it to be structurally incapable of it.
 */
function evaluateShadow(policy, actor, resource, ctx) {
  if (!policy.shadowConditions) return null;
  let wouldPermit;
  try {
    wouldPermit = Boolean(policy.shadowConditions(actor, resource, ctx));
  } catch {
    // An unevaluatable shadow rule is recorded as a mismatch, not as agreement.
    wouldPermit = false;
  }
  if (wouldPermit) return null;
  return Object.freeze({
    action: policy.action,
    legacy: "permit",
    kernel: "deny",
    reason: policy.shadowConditionsReason,
  });
}

function checkReason(policy, actor, resource, ctx) {
  const required = typeof policy.reasonRequired === "function"
    ? Boolean(policy.reasonRequired(actor, resource, ctx))
    : Boolean(policy.reasonRequired);
  if (!required) return null;
  if (String(ctx.reason || "").trim().length >= 3) return null;
  return deny(DENY.REASON_REQUIRED, policy);
}

/**
 * §12. Whether this permit is the same actor on both sides of a control that
 * is supposed to require two people.
 *
 * It never changes the decision at Gate 1 — one person holds every platform
 * role, so enforcing separation of duties would stop operations entirely. It
 * changes the RECORD. `AUTHORIZATION-IMPLEMENTATION-PLAN` §6: "Counting the
 * exception is the point. An unenforceable control that is invisible is worse
 * than one that is enforced later, because nobody knows how often it
 * mattered."
 *
 * A sameActor predicate that throws returns TRUE — an uncertain separation of
 * duties is recorded as absent, never as satisfied.
 */
function evaluateSameActor(policy, actor, resource, ctx) {
  if (!policy.sameActor) return false;
  try {
    return Boolean(policy.sameActor(actor, resource, ctx));
  } catch {
    return true;
  }
}

module.exports = { authorize, authorizeLoaded };
