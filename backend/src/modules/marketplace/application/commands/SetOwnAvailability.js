/**
 * Turn my availability on or off — marketplace / application
 *
 * The one command here that is NOT audited, and the reason is §12's own
 * caution against noise: a provider flips this several times a day, it
 * changes only whether they appear in results, and a log full of it buries
 * the records that matter. The profile change beside it IS audited, because
 * it moves a price.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { NotFoundError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");
const { availabilityFlag } = require("../../domain/providerProfile");

module.exports = defineUseCase("marketplace.SetOwnAvailability", {
  kind: "command",
  action: ACTION.PROVIDER_SET_AVAILABILITY,
  resource: (input, ctx) => (ctx.actor ? ctx.actor.principalId : null),
  idempotency: "naturally_idempotent",
  audit: "none",
  why: "A provider's own switch: it removes them from results and does nothing else.",

  async run(input, ctx) {
    // P1-11's rule, in the domain: only a strict 0 or 1. `-1` meant "suspend"
    // in the admin panel and `!(-1)` is false, so the suspended user kept full
    // access — a boolean-ish column that accepts anything truthy is that
    // defect waiting for a different caller.
    const isAvailable = availabilityFlag(input.is_available);

    const provider = ctx.authorized.resource;
    if (!provider) throw new NotFoundError("provider_profile");

    await ctx.repositories.providers.setAvailability(ctx.tx, {
      userId: ctx.actor.principalId,
      providerId: provider.id,
      isAvailable,
    });

    return { isAvailable };
  },
});
