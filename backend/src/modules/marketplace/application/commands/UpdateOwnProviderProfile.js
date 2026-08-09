/**
 * Update my own provider profile — marketplace / application
 *
 * The fields a provider may set are decided by `domain/providerProfile.js`
 * and nowhere else. Standing — approval, rating, completed jobs, trust score,
 * NID verification, provider source — is absent from the shape that function
 * returns, so this use case has no way to write it even by accident. That is
 * the mass-assignment answer: not a denylist, but a shape that does not
 * contain the fields.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { NotFoundError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");
const { editableProfile } = require("../../domain/providerProfile");
const { describeArea } = require("../../domain/serviceArea");

module.exports = defineUseCase("marketplace.UpdateOwnProviderProfile", {
  kind: "command",
  action: ACTION.PROVIDER_UPDATE_OWN,
  resource: (input, ctx) => (ctx.actor ? ctx.actor.principalId : null),
  /** Setting a value that is already set changes nothing; a retry is safe. */
  idempotency: "naturally_idempotent",
  audit: "required",
  why: "A profile change alters what customers are shown and what they are charged.",

  async run(input, ctx) {
    const profile = editableProfile(input);
    const userId = ctx.actor.principalId;
    const repo = ctx.repositories.providers;

    const before = await repo.findByUserId(ctx.tx, userId, { describeArea });
    if (!before) throw new NotFoundError("provider_profile");

    await repo.update(ctx.tx, { userId, providerId: before.providerId, profile });

    ctx.recordAudit({
      resourceType: "provider_profile",
      resourceId: before.providerId,
      resourceOwner: userId,
      // Changed fields only — the audit writer computes the diff and refuses a
      // whole row, so what lands in the log is what moved.
      before: {
        service_type_en: before.capability.serviceTypeEn,
        area_en: before.area ? before.area.label : null,
        hourly_rate: before.pricing.hourlyRate,
      },
      after: {
        service_type_en: profile.serviceTypeEn ?? before.capability.serviceTypeEn,
        area_en: profile.areaEn ?? (before.area ? before.area.label : null),
        hourly_rate: profile.hourlyRate ?? before.pricing.hourlyRate,
      },
    });

    const after = await repo.findByUserId(ctx.tx, userId, { describeArea });
    return after;
  },
});
