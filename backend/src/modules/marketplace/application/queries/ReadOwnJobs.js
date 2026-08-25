/**
 * A provider's own booked work — marketplace / application
 *
 * Reads booking-module data through a repository that says so in its header.
 * The correct end state is a read model booking maintains; that needs the
 * booking module, which is I-11/I-12.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { NotFoundError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");

module.exports = defineUseCase("marketplace.ReadOwnJobs", {
  kind: "query",
  action: ACTION.PROVIDER_READ_OWN_ACTIVITY,
  resource: (input, ctx) => (ctx.actor ? ctx.actor.principalId : null),
  idempotency: "read_only",
  audit: "none",
  why: "The bookings assigned to this provider. Carries customer phone numbers, so it is owner-only.",

  async run(input, ctx) {
    const providerId = ctx.authorized.resource ? ctx.authorized.resource.id : null;
    if (!providerId) throw new NotFoundError("provider_profile");
    return ctx.repositories.activity.jobs(ctx.db, {
      userId: ctx.actor.principalId, providerId,
    });
  },
});
