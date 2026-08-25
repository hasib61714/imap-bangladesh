/**
 * Apply to become a provider — marketplace / application
 *
 * I-06 §12, §13. A command: it opens a transaction, changes state, and
 * stages an audit record inside it. If the record cannot be written the
 * application does not happen — AD-009, enforced by the executor rather than
 * by the author remembering.
 *
 * WHY THIS IS AUDITED AND A PROFILE READ IS NOT
 * ─────────────────────────────────────────────
 * Applying starts a trust review that decides whether somebody may be booked
 * by strangers in their home. "Who applied, when, with what claimed
 * experience" is exactly the question a later dispute asks, and
 * `CREDENTIAL-INCIDENT.md` §2 is the standing reminder of what it costs to be
 * unable to answer one.
 *
 * NOT SET HERE: `is_approved`, and now `listing_state` beyond one narrow
 * move. D-005 makes eligibility trust-granted — a provider does not list
 * themselves (P1-7).
 *
 * The one move this use case may make is `rejected → applied`, and only for
 * the applicant's own listing. Without it a rejection would be permanent,
 * which is a business decision nobody made; `STATE-MACHINES.md` §2 gives the
 * provider that resubmission path and the domain's transition table records
 * `subject` as the only role that holds it.
 *
 * F-12 is closed by `marketplace.ApproveProviderListing`, not by this.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { newId } = require("../../../../shared/ids");
const { ACTION } = require("../../actions");
const { editableProfile, boundedText } = require("../../domain/providerProfile");
const { describeArea } = require("../../domain/serviceArea");
const { LISTING, assertListingTransition } = require("../../domain/listingEligibility");

module.exports = defineUseCase("marketplace.ApplyAsProvider", {
  kind: "command",
  action: ACTION.PROVIDER_APPLY,
  /**
   * Applying twice updates the same profile rather than creating a second —
   * `providers` has one row per person, and the second call is the applicant
   * correcting what they typed. That is what makes a retried request safe
   * without an idempotency key.
   */
  idempotency: "naturally_idempotent",
  audit: "required",
  why: "Starts the trust review that decides whether someone may be booked (D-005).",

  async run(input, ctx) {
    const profile = editableProfile(input);
    const nidNumber = boundedText(input.nid_number, "nid_number");
    const userId = ctx.actor.principalId;
    const repo = ctx.repositories.providers;

    const existingId = await repo.findIdByUserId(ctx.tx, userId);

    let reapplied = false;
    if (existingId) {
      await repo.update(ctx.tx, { userId, providerId: existingId, profile });
      // A rejected applicant correcting their profile is re-applying. The
      // domain holds the rule; this asks it rather than deciding.
      const current = await repo.lockById(ctx.tx, existingId);
      if (current && current.listing_state === LISTING.REJECTED) {
        assertListingTransition(LISTING.REJECTED, LISTING.APPLIED, "subject");
        reapplied = await repo.setListingState(ctx.tx, {
          providerId: existingId, from: LISTING.REJECTED, to: LISTING.APPLIED, userId,
        });
      }
    } else {
      await repo.insert(ctx.tx, { id: newId(), userId, profile });
    }

    const providerId = existingId || await repo.findIdByUserId(ctx.tx, userId);

    if (nidNumber) {
      // Identity data on `users`, not marketplace data. It travels with the
      // application because that is when it is collected; where it LIVES is
      // identity's, and the verification decision is I-07's.
      await repo.attachNationalId(ctx.tx, { userId, nidNumber });
    }

    ctx.recordAudit({
      resourceType: "provider_profile",
      resourceId: providerId,
      resourceOwner: userId,
      before: existingId ? { applied: true } : null,
      after: {
        applied: true,
        service_type_en: profile.serviceTypeEn,
        area_en: profile.areaEn,
        experience_yrs: profile.experienceYears,
        // The rate is recorded because it is what the platform will charge a
        // customer on this provider's behalf. The NID is NOT: it is identity
        // evidence, and AUDIT-LOG-ARCHITECTURE §3.2 records the metadata
        // rather than the value.
        hourly_rate: profile.hourlyRate,
        nid_supplied: Boolean(nidNumber),
        ...(reapplied ? { listing_state: LISTING.APPLIED, reapplied: true } : {}),
      },
    });

    return {
      providerId,
      area: describeArea({ label: profile.areaEn, labelBn: profile.areaBn }),
      // What the applicant is told. It says what happened and promises
      // nothing about when — the previous copy said "24-48 hours", and F-12
      // records that no endpoint can approve them at all.
      status: "submitted_for_review",
      created: !existingId,
    };
  },
});
