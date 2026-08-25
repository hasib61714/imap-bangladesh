/**
 * Search for candidates that could meet a need — marketplace / application
 *
 * I-06 §4, §16, §17. The first place in the codebase where a NEED is a thing
 * rather than a set of query-string parameters.
 *
 *     Need → candidates → (later) availability → ranking → offer
 *
 * A customer typing "electrician" with a price ceiling in Mirpur has
 * expressed a need. Today that is answered by a filtered query; tomorrow by
 * understanding, location and ranking. The boundary is the same either way,
 * and it exists now so the flow grows into it rather than around it.
 *
 * INTERNAL AND EXTERNAL ARE ONE RESULT SET (§16)
 * ──────────────────────────────────────────────
 * Every result is a FulfillmentCandidate carrying its `source`. One query,
 * one shape, one endpoint — which is what stops two workforces becoming two
 * architectures.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { ACTION } = require("../../actions");
const { describeNeed } = require("../../domain/need");
const { describeArea } = require("../../domain/serviceArea");

const SORTS = new Set(["rating", "price", "jobs", "new"]);

module.exports = defineUseCase("marketplace.SearchFulfillmentCandidates", {
  kind: "query",
  action: ACTION.DISCOVERY_SEARCH,
  idempotency: "read_only",
  audit: "none",
  why: "The public directory: a need in, candidates out, internal and external in one set.",

  async run(input, ctx) {
    const need = describeNeed({
      text: input.text,
      categorySlug: input.categorySlug,
      area: input.areaLabel ? describeArea({ label: input.areaLabel }) : null,
      maxPrice: input.maxPrice,
      minRating: input.minRating,
    });

    const sort = SORTS.has(input.sort) ? input.sort : "rating";
    const page = Math.max(1, Number(input.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(input.limit) || 20));

    // The scope came from the policy — what THIS actor may see. It is why the
    // approval gate is no longer a WHERE clause somebody could forget.
    const scope = ctx.authorized.scope;
    const repo = ctx.repositories.providers;

    // The unfiltered first page is the hot path and is cached, as before. A
    // need with anything in it is answered from the database: caching a
    // personalised result would serve one customer's need to another.
    const cacheable = !need.isSpecific && page === 1;
    const params = { need, scope, sort, page, limit, describeArea };
    const { candidates, total } = cacheable
      ? await repo.searchCached(ctx.db, params)
      : await repo.search(ctx.db, params);

    return { need, candidates, total, page, limit };
  },
});
