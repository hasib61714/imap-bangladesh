/**
 * Why is this provider not showing up? — marketplace / application
 *
 * I-07 §18. The conjunction from `TRUST-ARCHITECTURE.md` §5, clause by
 * clause, for one provider.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Because the alternative is guessing. Listing eligibility now has six
 * clauses across three tables, and a provider who cannot see which one is
 * failing will ask support, who will look at `is_approved`, see a 1, and tell
 * them everything is fine.
 *
 * The subject may ask about themselves — the clauses are the most actionable
 * thing a provider can be told, and four of the six are things they can fix.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { NotFoundError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");
const { evaluateEligibility } = require("../../domain/listingEligibility");

module.exports = defineUseCase("marketplace.ReadListingEligibility", {
  kind: "query",
  action: ACTION.PROVIDER_READ_ELIGIBILITY,
  resource: (input) => (input.provider_id ? String(input.provider_id) : null),
  idempotency: "read_only",
  audit: "none",
  why: "\"Why am I not showing up?\" has one answer, and support guessing at it is worse than none.",

  async run(input, ctx) {
    const row = await ctx.repositories.providers.findEligibilityInput(ctx.db, String(input.provider_id));
    if (!row) throw new NotFoundError("provider_profile");

    const result = evaluateEligibility({
      identityVerified: row.identity_verified === 1 || row.identity_verified === true,
      listingState: row.listing_state,
      accountActive: row.account_active === 1 || row.account_active === true,
      serviceType: row.service_type_en || row.service_type_bn,
      area: row.area_en || row.area_bn,
      hourlyRate: row.hourly_rate === null ? null : Number(row.hourly_rate),
    });

    return {
      providerId: String(row.id),
      listingState: row.listing_state,
      listable: result.listable,
      failing: result.failing,
      clauses: result.clauses,
      /**
       * Which clauses rest on a Gate-1 stand-in rather than a modelled fact.
       *
       * Surfaced rather than hidden: an operator reading "has_capability: ok"
       * should know that means "the provider typed something in the service
       * field", not "a verified electrician". §19 of this phase's brief is
       * explicit that the two must not be equated, and the honest way to keep
       * that true is to say so on the surface that reports it.
       */
      approximated: result.approximated,
      // `is_available` is deliberately NOT a clause. It is the provider's own
      // switch and turning it off is not a failure to be explained — but it
      // is reported, because "I turned myself off" is the other reason
      // somebody is not showing up.
      isAvailable: row.is_available === 1 || row.is_available === true,
    };
  },
});
