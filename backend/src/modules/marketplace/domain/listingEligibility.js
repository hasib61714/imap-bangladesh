/**
 * Listing eligibility — marketplace / domain
 *
 * I-07 §9, §18, §19. The answer to "may this provider be offered to a
 * customer?", computed rather than read off a boolean.
 *
 * `TRUST-ARCHITECTURE.md` §5 states the rule and it is transcribed here
 * without addition:
 *
 *     listable = identity_verified
 *              ∧ at least one capability
 *              ∧ at least one coverage area
 *              ∧ at least one price
 *              ∧ not suspended
 *              ∧ approved by a human reviewer
 *
 * WHY THIS IS NOT `is_approved === 1` (§9)
 * ────────────────────────────────────────
 * Because that column cannot distinguish an unreviewed application from a
 * refused one from a suspended provider, and because nothing but
 * `scripts/seedDemo.js` ever set it (F-12) — so in production it means
 * "existed before migration 002" and nothing more. It remains ONE conjunct,
 * carrying the "approved by a human reviewer" clause it genuinely represents,
 * and it is no longer the authority.
 *
 * WHERE THE GATE-1 SUBSTITUTES ARE, AND THAT THEY ARE SUBSTITUTES (§19)
 * ────────────────────────────────────────────────────────────────────
 * Two conjuncts have no first-class model yet:
 *
 *   capability  — `ProviderCapability` is I-09. The stand-in is
 *                 `service_type_en/bn`, free text a provider types.
 *   coverage    — the Bangladesh area hierarchy is I-10 and an owner
 *                 decision besides. The stand-in is `area_en/bn`, also free
 *                 text.
 *
 * They are checked as PRESENCE, which is what §5 asks ("at least one"), and
 * each carries `approximate: true` so a caller can tell a real check from a
 * stand-in. Nothing here pretends a typed word is a verified skill — §19 of
 * the I-07 brief is explicit that a verified identity is not a qualified
 * electrician, and this file makes no such claim.
 */
"use strict";

const { ConflictError, ValidationError } = require("../../../shared/errors");

/**
 * The listing lifecycle column added by migration 011.
 *
 * `STATE-MACHINES.md` §2's states, minus the two that already have homes
 * (`listed`/`paused` are `is_available`) and the one no use case grants
 * (`removed`). The migration records that reasoning against the enum.
 */
const LISTING = Object.freeze({
  APPLIED: "applied",
  APPROVED: "approved",
  REJECTED: "rejected",
  SUSPENDED: "suspended",
});

/**
 * from → { to → roles }, guarded the same way the verification machine is.
 *
 * GATE-1 §5 calls provider approval a validated enum rather than a machine,
 * so this is a transition table on a column and not a case table. The guard
 * is the same either way: an arbitrary `UPDATE providers SET listing_state`
 * is not reachable from a route.
 *
 * `subject` appears once: a rejected applicant re-applying returns their own
 * listing to `applied`. That is the resubmission path §2 gives the provider,
 * and without it a rejection would be permanent — which is a business
 * decision nobody made.
 */
const LISTING_TRANSITIONS = Object.freeze({
  [LISTING.APPLIED]: {
    [LISTING.APPROVED]: ["trust_safety", "operations"],
    [LISTING.REJECTED]: ["trust_safety", "operations"],
  },
  [LISTING.APPROVED]: {
    [LISTING.SUSPENDED]: ["trust_safety", "operations"],
  },
  [LISTING.REJECTED]: {
    [LISTING.APPLIED]: ["subject"],
    [LISTING.APPROVED]: ["trust_safety", "operations"],
  },
  // A suspension is not a deletion. Restoring returns the provider to
  // `approved` — which still has to pass every other conjunct below, so a
  // provider whose verification expired while suspended does not come back
  // listable.
  [LISTING.SUSPENDED]: {
    [LISTING.APPROVED]: ["trust_safety", "operations"],
  },
});

/** Transitions whose reason is written into the audit record and required. */
const LISTING_REASON_REQUIRED = Object.freeze([LISTING.REJECTED, LISTING.SUSPENDED]);

const isNonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

/**
 * Evaluate the conjunction.
 *
 * Returns every clause and its verdict rather than a bare boolean, because an
 * operator asking "why is this provider not showing up?" needs the answer,
 * and because a support agent guessing is how a provider gets told the wrong
 * thing.
 *
 * @param {object} p
 * @param {boolean} p.identityVerified   from the verification case, NOT from users.kyc_status
 * @param {string}  p.listingState
 * @param {boolean} p.accountActive      users.is_active
 * @param {string}  p.serviceType        capability stand-in
 * @param {string}  p.area               coverage stand-in
 * @param {number}  p.hourlyRate
 */
function evaluateEligibility(p) {
  const clauses = [
    {
      clause: "identity_verified",
      ok: p.identityVerified === true,
      approximate: false,
      source: "verification_case",
    },
    {
      clause: "has_capability",
      ok: isNonEmpty(p.serviceType),
      approximate: true,
      source: "providers.service_type_*",
      gap: "ProviderCapability is I-09; free text stands in",
    },
    {
      clause: "has_coverage",
      ok: isNonEmpty(p.area),
      approximate: true,
      source: "providers.area_*",
      gap: "ServiceArea hierarchy is I-10 and an owner decision; free text stands in",
    },
    {
      clause: "has_price",
      ok: typeof p.hourlyRate === "number" && Number.isFinite(p.hourlyRate) && p.hourlyRate > 0,
      approximate: false,
      source: "providers.hourly_rate",
    },
    {
      clause: "not_suspended",
      // Two ways to be suspended and both count: the listing itself, and the
      // account behind it. P1-11 is why the account is checked with `=== 1`
      // rather than truthiness.
      ok: p.accountActive === true && p.listingState !== LISTING.SUSPENDED,
      approximate: false,
      source: "providers.listing_state + users.is_active",
    },
    {
      clause: "human_approved",
      ok: p.listingState === LISTING.APPROVED,
      approximate: false,
      source: "providers.listing_state",
    },
  ];

  const failing = clauses.filter((c) => !c.ok).map((c) => c.clause);
  return Object.freeze({
    listable: failing.length === 0,
    failing: Object.freeze(failing),
    clauses: Object.freeze(clauses.map(Object.freeze)),
    // An honest label for a caller that wants to know how much of the verdict
    // rests on a Gate-1 stand-in.
    approximated: Object.freeze(clauses.filter((c) => c.approximate).map((c) => c.clause)),
  });
}

/**
 * May a reviewer approve this listing?
 *
 * `TRUST-ARCHITECTURE.md` §6 makes identity verification the thing that
 * "grants provider listing eligibility", so approving a provider whose
 * identity is not verified would hand out that grant on no evidence. This is
 * the architecture's own ordering, not a policy invented here.
 *
 * Note what it does NOT require: a skill certificate. §19 of the brief is
 * explicit — a verified identity is not a qualified electrician, capability
 * verification is a separate `kind` with no Gate-1 surface, and demanding a
 * certificate that cannot be issued would block every provider forever.
 */
function assertApprovable({ identityVerified }) {
  if (identityVerified !== true) {
    throw new ConflictError(
      "LISTING_REQUIRES_VERIFIED_IDENTITY",
      "a provider listing cannot be approved before identity verification is verified",
      { userMessage: { en: "Identity verification must be completed first.",
                       bn: "প্রথমে পরিচয় যাচাই সম্পন্ন করতে হবে।" } }
    );
  }
}

/**
 * §21: the state machine decides, not the caller.
 *
 * The mirror of `verificationCase.assertTransition`, and deliberately shaped
 * the same way — two transition tables that behave differently would be two
 * things to learn and one to get wrong.
 */
function assertListingTransition(from, to, actorRole) {
  if (!Object.values(LISTING).includes(to)) {
    throw new ValidationError(`"${to}" is not a provider listing state`, {
      fields: [{ field: "listing_state", code: "UNKNOWN_STATE" }],
    });
  }
  const allowed = LISTING_TRANSITIONS[from] && LISTING_TRANSITIONS[from][to];
  if (!allowed) {
    throw new ConflictError(
      "LISTING_TRANSITION_INVALID",
      `a provider listing cannot move from ${from} to ${to}`,
      { userMessage: { en: "That is not possible in this provider's current state.",
                       bn: "এই অবস্থায় এটি সম্ভব নয়।" } }
    );
  }
  if (!allowed.includes(actorRole)) {
    throw new ConflictError(
      "LISTING_TRANSITION_ACTOR",
      `${actorRole} may not move a provider listing from ${from} to ${to}`
    );
  }
  return { reasonRequired: LISTING_REASON_REQUIRED.includes(to) };
}

/** R-1103 again: a suspension nobody explained cannot be appealed. */
function requireListingReason(to, reason) {
  if (!LISTING_REASON_REQUIRED.includes(to)) return reason ? String(reason).slice(0, 500) : null;
  const text = String(reason ?? "").trim();
  if (text.length < 10) {
    throw new ValidationError(
      `moving a provider listing to ${to} requires a stated reason of at least 10 characters`,
      { fields: [{ field: "reason", code: "REASON_REQUIRED" }] }
    );
  }
  return text.slice(0, 500);
}

module.exports = {
  LISTING, LISTING_TRANSITIONS, LISTING_REASON_REQUIRED,
  evaluateEligibility, assertApprovable, assertListingTransition, requireListingReason,
};
