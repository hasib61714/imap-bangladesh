/**
 * A provider's own earnings summary — marketplace / application
 *
 * WHAT THIS NO LONGER REPORTS
 * ───────────────────────────
 * `views: (total_jobs || 0) * 4`. There is no view counter anywhere in the
 * system; the number was derived from the job count and shown to providers as
 * a measurement. It is gone. A fabricated metric is the defect class the
 * Phase 0 audit catalogued, and carrying it through a structural migration
 * would have laundered it.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { NotFoundError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");

module.exports = defineUseCase("marketplace.ReadOwnEarnings", {
  kind: "query",
  action: ACTION.PROVIDER_READ_OWN_ACTIVITY,
  resource: (input, ctx) => (ctx.actor ? ctx.actor.principalId : null),
  idempotency: "read_only",
  audit: "none",
  why: "What a provider has earned and what customers said, for their own dashboard.",

  async run(input, ctx) {
    // The kernel loaded this provider's row to decide; reading its id from
    // the decision is one query rather than two.
    const providerId = ctx.authorized.resource ? ctx.authorized.resource.id : null;
    if (!providerId) throw new NotFoundError("provider_profile");
    return ctx.repositories.activity.summary(ctx.db, {
      userId: ctx.actor.principalId, providerId,
    });
  },
});
