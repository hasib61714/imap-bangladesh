/**
 * The verification review queue — identity / application
 *
 * I-07 §12. Metadata: whose case, what state, how long it has waited, how
 * many documents are attached. No object keys and no images — P1-12's lesson
 * stated as a column list rather than as a rule somebody has to remember.
 *
 * That is also why `operations` may call this and may not open a case: a
 * marketplace has to know how long people are waiting, and that question is
 * answerable without anybody's national identity card.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { ValidationError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");
const { STORED_STATES, KIND } = require("../../domain/verificationCase");

const MAX_LIMIT = 100;

module.exports = defineUseCase("identity.ListVerificationQueue", {
  kind: "query",
  action: ACTION.VERIFICATION_LIST,
  idempotency: "read_only",
  audit: "on_deny",
  why: "Running a marketplace means knowing how long people wait. The queue is metadata; evidence is not.",

  async run(input, ctx) {
    const state = input.state ? String(input.state) : "submitted";
    if (!STORED_STATES.includes(state)) {
      throw new ValidationError(`state must be one of: ${STORED_STATES.join(", ")}`, {
        fields: [{ field: "state", code: "UNKNOWN_STATE" }],
      });
    }
    const kind = input.kind ? String(input.kind) : KIND.IDENTITY;
    if (!Object.values(KIND).includes(kind)) {
      throw new ValidationError(`kind must be one of: ${Object.values(KIND).join(", ")}`, {
        fields: [{ field: "kind", code: "UNKNOWN_KIND" }],
      });
    }

    const page = Math.max(1, parseInt(input.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(input.limit, 10) || 30));

    const { cases, total } = await ctx.repositories.verification.listQueue(ctx.db, {
      kind, state, page, limit,
    });

    return {
      cases: cases.map((c) => ({
        caseId: String(c.id),
        subjectId: c.principal_id === null ? null : String(c.principal_id),
        subjectName: c.name ?? null,
        // Contact details are here because a reviewer sometimes has to ring
        // an applicant about a blurred photo. They are already visible to
        // this role on the provider queue (P1-1 removed them from the PUBLIC
        // list, not from the operator's).
        subjectPhone: c.phone ?? null,
        subjectEmail: c.email ?? null,
        kind: c.kind,
        state: c.state,
        submittedAt: c.submitted_at,
        decidedAt: c.decided_at,
        documentCount: Number(c.document_count || 0),
        // Whether this case predates object storage. A reviewer opening it
        // will be shown legacy base64 rather than signed URLs, and knowing
        // that in the list saves a wasted click.
        legacy: c.legacy_kyc_id !== null,
      })),
      total, page, limit, state, kind,
    };
  },
});
