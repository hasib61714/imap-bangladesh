/**
 * Read my own provider profile — marketplace / application
 *
 * The resource reference is the ACTOR's own id, taken from the verified actor
 * and never from the request. `GET /api/providers/me` carries no id, and
 * inventing one from the body would be the client-controlled-ownership defect
 * with a friendlier name.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { NotFoundError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");
const { describeArea } = require("../../domain/serviceArea");

module.exports = defineUseCase("marketplace.ReadOwnProviderProfile", {
  kind: "query",
  action: ACTION.PROVIDER_READ_OWN,
  resource: (input, ctx) => (ctx.actor ? ctx.actor.principalId : null),
  idempotency: "read_only",
  audit: "none",
  why: "A provider's own record, including the contact details the public shape omits (P1-1).",

  async run(input, ctx) {
    const provider = await ctx.repositories.providers.findByUserId(
      ctx.db, ctx.actor.principalId, { describeArea }
    );
    if (!provider) throw new NotFoundError("provider_profile");
    return provider;
  },
});
