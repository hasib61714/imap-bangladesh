/**
 * Read one provider's public profile — marketplace / application
 *
 * The kernel has already loaded the row and applied the approval condition,
 * so by the time `run` is reached "may this person see this profile" is
 * settled. What is left is reading the full record.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { NotFoundError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");
const { describeArea } = require("../../domain/serviceArea");

module.exports = defineUseCase("marketplace.ReadProviderProfile", {
  kind: "query",
  action: ACTION.PROVIDER_READ,
  resource: (input) => input.providerId,
  idempotency: "read_only",
  audit: "none",
  why: "A provider's public profile, readable once the platform has approved them.",

  async run(input, ctx) {
    const provider = await ctx.repositories.providers.findById(ctx.db, input.providerId, { describeArea });
    // The kernel loaded a lighter shape and permitted; a null here means the
    // row disappeared between the two reads.
    if (!provider) throw new NotFoundError("provider_profile");

    const schedule = await ctx.repositories.schedule.listForProvider(ctx.db, provider.providerId);
    const reviews = await ctx.repositories.activity.recentReviews(ctx.db, provider.providerId);

    return { provider, schedule, reviews };
  },
});
