/**
 * Read my own verification — identity / application
 *
 * I-07 §12. What a person is entitled to know about a decision made about
 * them: the state, when it was decided, and why.
 *
 * WHAT IT DOES NOT RETURN
 * ───────────────────────
 * The reviewer's identity. R-406 gives the subject a decision they can act
 * on, not a name they can pursue — and a small trust team whose members are
 * individually attributable to rejected applicants is a safety problem for
 * the reviewers.
 *
 * No object keys, no document URLs. A subject re-uploading is a submission,
 * not a read.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { ACTION } = require("../../actions");
const V = require("../../domain/verificationCase");

module.exports = defineUseCase("identity.ReadOwnVerification", {
  kind: "query",
  action: ACTION.VERIFICATION_READ_OWN,
  // The actor's own id, server-side. Never from the request.
  resource: (input, ctx) => (ctx.actor && ctx.actor.principalId ? String(ctx.actor.principalId) : null),
  idempotency: "read_only",
  // Not a Sealed read: this returns a state and a reason and never touches
  // the evidence, so V-07 does not apply.
  audit: "none",
  why: "A person is entitled to know their own verification state and why it was decided (R-406).",

  async run(input, ctx) {
    const row = await ctx.repositories.verification.findByPrincipal(
      ctx.db, ctx.actor.principalId, V.KIND.IDENTITY
    );
    const now = ctx.clock.now();
    const view = V.toSubjectView(row, now);

    return {
      ...view,
      // How many documents are on file, so the client can tell "nothing
      // uploaded" from "waiting". A count, not a list — there are no keys and
      // no URLs on this surface.
      documentCount: row ? (await ctx.repositories.verification.listDocuments(ctx.db, row.id)).length : 0,
      // What the subject can do next, derived from the machine rather than
      // hardcoded in a client. `not_submitted`, `rejected`, `more_info` and
      // `expired` all accept a submission; `under_review` does not.
      canSubmit: Boolean(V.TRANSITIONS[view.state] && V.TRANSITIONS[view.state][V.STATE.SUBMITTED]),
    };
  },
});
