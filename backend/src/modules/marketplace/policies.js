/**
 * Marketplace authorization policies — marketplace
 *
 * I-06 §11. Registered into the I-04 kernel; there is no second
 * authorization system and these are policies, not checks.
 *
 * `TARGET-REPOSITORY-STRUCTURE.md` §3.1 gives each module a `policies.js`
 * holding the policies it registers. I-04 registered its 37 in one file
 * because no module owned them yet; these are the first to live with their
 * module, which is where the rest move as each module migrates.
 *
 * TWO OF THESE ARE PUBLIC, AND THAT IS A POLICY
 * ─────────────────────────────────────────────
 * `discovery.search` and `provider.read` carry `roles: ["*"]`. A public
 * endpoint is not an endpoint with no policy — it is one whose policy says
 * anyone may call it, which keeps the answer to "who may do this" in one
 * register and lets the public visibility RULE be a scope rather than a
 * WHERE clause somebody has to remember.
 */
"use strict";

// Through the module's public surface. The import-boundary rule caught the
// first draft reaching into `authorization/registry` and three siblings —
// which is how five modules become one.
const platform = require("../platform");
const { ACTION } = require("./actions");
const { LISTING } = require("./domain/listingEligibility");

const { registerPolicy, PERMISSION, ROLE, isPlatformRole, DENY } = platform.authorization;

const { CUSTOMER, PROVIDER, OPERATIONS, TRUST_SAFETY, PLATFORM_OWNER, SUPPORT } = ROLE;

const same = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
const holdsPlatformRole = (actor) => Boolean(actor && actor.roles.some(isPlatformRole));

/** The provider profile this actor owns, if any. */
const ownsProfile = (actor, provider) => same(actor.principalId, provider.userId);

let installed = false;

function installMarketplacePolicies() {
  if (installed) return;
  installed = true;

  // ── discovery ────────────────────────────────────────────
  registerPolicy(ACTION.DISCOVERY_SEARCH, {
    resource: "provider_profile",
    permission: PERMISSION.READ,
    roles: ["*"],
    cardinality: "collection",
    /**
     * The scope IS the P1-7 fix.
     *
     * A provider used to appear in this list the moment they applied, while
     * the applicant was told review takes 24-48 hours and the marketing copy
     * promised "KYC-verified providers". The rule that fixed it was three
     * conditions in a route's WHERE clause; here it is what the policy says
     * an anonymous caller may see, and the repository applies what it is
     * given.
     *
     * A platform role sees the unfiltered set, which is what
     * `provider.list_all` was doing with a separate query.
     */
    scope: (actor) => (holdsPlatformRole(actor) ? { visibility: "all" } : { visibility: "public" }),
    tier: "A",
    audit: "none",
    statusMode: "legacy",
    why: "The public directory. D-005: eligibility is trust-granted, so only approved providers are offered.",
  });

  registerPolicy(ACTION.PROVIDER_READ, {
    resource: "provider_profile",
    permission: PERMISSION.READ,
    roles: ["*"],
    cardinality: "instance",
    relationship: () => true,
    /**
     * An unapproved profile is visible only to its owner or to the platform.
     *
     * A BEHAVIOUR CHANGE, stated rather than slipped in. `GET
     * /api/providers/:id` did not filter on approval, so an applicant's
     * profile was publicly readable by id even though P1-7 had removed them
     * from the list. D-005 makes listing trust-granted; a profile page
     * reachable by anyone who knows the id is listing by another route.
     */
    // I-07 §9: `listingState`, not `isApproved`. The boolean is a mirror and
    // a policy that read it would be a second definition of "approved".
    conditions: (actor, provider) =>
      provider.listingState === LISTING.APPROVED ||
      ownsProfile(actor, provider) ||
      holdsPlatformRole(actor),
    tier: "A",
    audit: "none",
    /**
     * Indistinguishable, not `legacy`.
     *
     * A profile the caller may not see answers exactly as one that does not
     * exist. `GET /api/providers/:id` previously answered 200 for everyone,
     * so there is no legacy contract here to preserve — and telling an
     * anonymous caller "this id exists but is not approved" would hand them
     * the applicant list one id at a time.
     */
    statusMode: "indistinguishable",
    why: "A provider profile is public once the platform has approved them, and not before.",
  });

  // ── a provider's own profile ─────────────────────────────
  registerPolicy(ACTION.PROVIDER_READ_OWN, {
    resource: "own_provider_profile",
    permission: PERMISSION.READ,
    roles: [CUSTOMER, PROVIDER],
    cardinality: "instance",
    // `POST /api/providers/apply` never changes users.role, so a person who
    // signed up as a customer and later applied is a provider whose legacy
    // role is `customer`. Both roles are listed for that reason — the
    // relationship, not the role, is what decides.
    relationship: (actor, provider) => (ownsProfile(actor, provider) ? true : DENY.NOT_OWNER),
    tier: "A",
    audit: "none",
    statusMode: "legacy",
    why: "Their own profile, including the contact details the public shape omits (P1-1).",
  });

  registerPolicy(ACTION.PROVIDER_APPLY, {
    resource: "provider_profile",
    permission: PERMISSION.CREATE,
    roles: [CUSTOMER, PROVIDER],
    cardinality: "collection",
    // One application per authenticated person. The scope names the subject
    // so the repository cannot be handed somebody else's id.
    scope: (actor) => (actor.principalId ? { ownerUserId: actor.principalId } : null),
    tier: "B",
    audit: "required",
    statusMode: "legacy",
    why: "Applying is a trust event: it starts a review that decides whether someone may be booked.",
  });

  registerPolicy(ACTION.PROVIDER_UPDATE_OWN, {
    resource: "own_provider_profile",
    permission: PERMISSION.UPDATE,
    roles: [CUSTOMER, PROVIDER],
    cardinality: "instance",
    relationship: (actor, provider) => (ownsProfile(actor, provider) ? true : DENY.NOT_OWNER),
    tier: "B",
    audit: "required",
    statusMode: "legacy",
    why: "A profile change alters what customers are shown and what they are charged.",
  });

  registerPolicy(ACTION.PROVIDER_SET_AVAILABILITY, {
    resource: "own_provider_profile",
    permission: PERMISSION.UPDATE,
    roles: [CUSTOMER, PROVIDER],
    cardinality: "instance",
    relationship: (actor, provider) => (ownsProfile(actor, provider) ? true : DENY.NOT_OWNER),
    tier: "B",
    audit: "none",
    statusMode: "legacy",
    why: "A provider's own switch. Frequent and low-consequence — it removes them from results, nothing more.",
  });

  registerPolicy(ACTION.PROVIDER_READ_OWN_ACTIVITY, {
    resource: "own_provider_profile",
    permission: PERMISSION.READ,
    roles: [CUSTOMER, PROVIDER],
    cardinality: "instance",
    relationship: (actor, provider) => (ownsProfile(actor, provider) ? true : DENY.NOT_OWNER),
    tier: "A",
    audit: "none",
    statusMode: "legacy",
    why: "Their earnings and their booked work. Customer phone numbers appear here, so it is owner-only.",
  });

  // ── the listing decision (I-07, F-12) ────────────────────
  //
  // `TRUST-ARCHITECTURE.md` §5's last conjunct is "approved by a human
  // reviewer". These three are that human, and until I-07 there was no such
  // person: nothing but `scripts/seedDemo.js` ever wrote `is_approved`.
  //
  // `platform_owner` is deliberately absent, as it is from the verification
  // decisions. Listing eligibility is a trust decision, and I-04 §6 put trust
  // decisions with `trust_safety`. `operations` is here because delisting a
  // provider who is not turning up is an operational reality, not a trust
  // judgement.
  const listingDecision = (permission, why, { reasonRequired = false } = {}) => ({
    resource: "provider_profile",
    permission,
    roles: [TRUST_SAFETY, OPERATIONS],
    cardinality: "instance",
    relationship: (actor) => (holdsPlatformRole(actor) ? true : DENY.MISSING_PERMISSION),
    // Approving your own provider listing. Permitted at Gate 1 because one
    // person holds every role; marked so it can be counted (I-04 §12).
    sameActor: ownsProfile,
    reasonRequired,
    tier: "C",
    audit: "required",
    // A reviewer working the approval queue already knows the row exists.
    statusMode: "legacy",
    why,
  });

  registerPolicy(ACTION.PROVIDER_APPROVE_LISTING, listingDecision(
    PERMISSION.APPROVE,
    "The human approval TRUST §5 requires, and the endpoint F-12 recorded as missing."
  ));

  registerPolicy(ACTION.PROVIDER_REJECT_LISTING, listingDecision(
    PERMISSION.REJECT,
    "A refusal an applicant can answer only if it has a reason (R-1103).",
    { reasonRequired: true }
  ));

  registerPolicy(ACTION.PROVIDER_SUSPEND_LISTING, listingDecision(
    PERMISSION.UPDATE,
    "Removing a working provider from the marketplace. Never unexplained.",
    { reasonRequired: true }
  ));

  registerPolicy(ACTION.PROVIDER_READ_ELIGIBILITY, {
    resource: "provider_profile",
    permission: PERMISSION.READ,
    // The subject may ask about themselves — the eligibility clauses are the
    // most actionable thing a provider can be told, and a provider who cannot
    // find out why they are invisible will ask support, who will guess.
    roles: [CUSTOMER, PROVIDER, TRUST_SAFETY, OPERATIONS, SUPPORT],
    cardinality: "instance",
    relationship: (actor, provider) =>
      ownsProfile(actor, provider) || holdsPlatformRole(actor) ? true : DENY.NOT_OWNER,
    tier: "A",
    audit: "none",
    statusMode: "legacy",
    why: "\"Why am I not showing up?\" has one answer, and support guessing at it is worse than none.",
  });
}

module.exports = { installMarketplacePolicies, ownsProfile, holdsPlatformRole };
