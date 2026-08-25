/**
 * Provider listing decisions — marketplace / application
 *
 * I-07 §9, §12, §21, and the fix for F-12.
 *
 * F-12, RESTATED
 * ──────────────
 * "No provider approval endpoint exists. `providers.is_approved` is written
 *  by `scripts/seedDemo.js` and by nothing else, so a genuine applicant can
 *  never become listable."
 *
 * I-05 §41 said to record it and leave it. I-06 §… left it. This is where it
 * closes: three use cases, three actions, three policies, every transition
 * guarded by the domain and recorded in the audit log.
 *
 * WHAT MAKES THIS NOT AN OPAQUE BOOLEAN FLIP (§12)
 * ────────────────────────────────────────────────
 *   · no `PATCH /providers/:id {"is_approved": true}` — three verb-named
 *     routes, three permissions
 *   · approving requires a VERIFIED IDENTITY CASE, which is TRUST §6's
 *     ordering ("identity verified … grants provider listing eligibility")
 *   · rejecting and suspending require a stated reason, enforced by the
 *     policy so the kernel denies rather than a handler forgetting
 *   · the state machine says which moves exist; the caller does not
 *   · `is_approved` moves as a MIRROR in the same UPDATE, so the two cannot
 *     disagree, and nothing reads it back as authority
 *
 * ZERO AI (§30). Nothing scores an application, ranks a queue, or suggests a
 * decision. A human decides, and the record says who.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { ConflictError, NotFoundError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");
const L = require("../../domain/listingEligibility");

/**
 * Build one listing decision use case.
 *
 * @param {object} spec
 * @param {string} spec.name
 * @param {string} spec.action
 * @param {string} spec.to
 * @param {string[]} spec.from
 * @param {boolean} [spec.requiresVerifiedIdentity]
 * @param {string} spec.why
 */
function listingDecisionUseCase(spec) {
  return defineUseCase(spec.name, {
    kind: "command",
    action: spec.action,
    resource: (input) => (input.provider_id ? String(input.provider_id) : null),
    context: (input) => ({ reason: input.reason ?? null, targetState: spec.to }),
    idempotency: "at_most_once_effect",
    audit: "required",
    why: spec.why,

    async run(input, ctx) {
      const repo = ctx.repositories.providers;
      const providerId = String(input.provider_id);

      // First statement, by primary key. I-05's locking discipline.
      const row = await repo.lockById(ctx.tx, providerId);
      if (!row) throw new NotFoundError("provider_profile");

      const from = row.listing_state || L.LISTING.APPLIED;
      if (!spec.from.includes(from)) {
        throw new ConflictError(
          "LISTING_TRANSITION_INVALID",
          `a provider listing in state ${from} cannot move to ${spec.to}`,
          { userMessage: { en: "That is not possible in this provider's current state.",
                           bn: "এই অবস্থায় এটি সম্ভব নয়।" } }
        );
      }

      // The domain decides too. This use case's `from` list is its narrower
      // claim; the transition table is the machine's. Both must agree.
      L.assertListingTransition(from, spec.to, "trust_safety");
      const reason = L.requireListingReason(spec.to, input.reason);

      if (spec.requiresVerifiedIdentity) {
        // TRUST §6: identity verification is what "grants provider listing
        // eligibility". Approving without it would hand out that grant on no
        // evidence — and it would do so silently, because the search filter
        // would then hide the provider anyway and nobody would know why.
        L.assertApprovable({
          identityVerified: row.identity_verified === 1 || row.identity_verified === true,
        });
      }

      const moved = await repo.setListingState(ctx.tx, {
        providerId, from, to: spec.to, userId: row.user_id,
      });
      if (!moved) {
        throw new ConflictError("LISTING_MOVED", "the provider listing changed while being decided");
      }

      ctx.recordAudit({
        resourceType: "provider_profile",
        resourceId: providerId,
        resourceOwner: row.user_id === null ? null : String(row.user_id),
        before: { listing_state: from, is_approved: row.is_approved ? 1 : 0 },
        after: {
          listing_state: spec.to,
          is_approved: spec.to === L.LISTING.APPROVED ? 1 : 0,
          // Recorded because it is the evidence the decision rested on, and
          // because an audit that says "approved" without it cannot show
          // whether the rule was followed.
          identity_verified: row.identity_verified === 1 || row.identity_verified === true,
        },
        reason,
      });

      return { providerId, listingState: spec.to, reason };
    },
  });
}

const ApproveProviderListing = listingDecisionUseCase({
  name: "marketplace.ApproveProviderListing",
  action: ACTION.PROVIDER_APPROVE_LISTING,
  from: [L.LISTING.APPLIED, L.LISTING.REJECTED, L.LISTING.SUSPENDED],
  to: L.LISTING.APPROVED,
  requiresVerifiedIdentity: true,
  why: "The human approval TRUST §5 requires. Closes F-12 — before this, nothing but a seed script could list a provider.",
});

const RejectProviderListing = listingDecisionUseCase({
  name: "marketplace.RejectProviderListing",
  action: ACTION.PROVIDER_REJECT_LISTING,
  from: [L.LISTING.APPLIED],
  to: L.LISTING.REJECTED,
  why: "A refusal an applicant can answer only if it carries a reason (R-1103).",
});

/**
 * approved → suspended.
 *
 * NOT the same as `is_available = 0`, and the distinction matters: that is
 * the provider's own switch and they can turn it back on. This one they
 * cannot, which is what makes it a control.
 */
const SuspendProviderListing = listingDecisionUseCase({
  name: "marketplace.SuspendProviderListing",
  action: ACTION.PROVIDER_SUSPEND_LISTING,
  from: [L.LISTING.APPROVED],
  to: L.LISTING.SUSPENDED,
  why: "Removing a working provider from the marketplace. Never unexplained, and never by the provider.",
});

module.exports = {
  listingDecisionUseCase,
  ApproveProviderListing, RejectProviderListing, SuspendProviderListing,
};
