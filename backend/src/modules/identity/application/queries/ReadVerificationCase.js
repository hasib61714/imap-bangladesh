/**
 * Open one verification case — identity / application
 *
 * I-07 §12, and V-07 is the whole point of the file.
 *
 * WHY A READ IS AUDITED
 * ─────────────────────
 * `GATE-1-ARCHITECTURE.md` §8 and `DATA-ARCHITECTURE.md` §6 class an identity
 * case as Sealed: "every access is logged with reason". A read that changes
 * nothing is still the event an investigation into misuse needs to find —
 * "who looked at this person's file, and when" has no other answer.
 *
 * `useCase.js` refuses a query with `audit: "required"` unless it also sets
 * `auditedRead: true`, so this cannot happen by accident and cannot be
 * removed by accident either.
 *
 * WHAT COMES BACK
 * ───────────────
 * The case, and a LIST of the documents attached to it — kind, size, when
 * uploaded. Not the documents. Opening one is a separate action with a
 * separate audit record and a mandatory stated reason, because a reviewer who
 * needs the front of an ID does not need the selfie as a side effect.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { NotFoundError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");
const V = require("../../domain/verificationCase");

module.exports = defineUseCase("identity.ReadVerificationCase", {
  kind: "query",
  action: ACTION.VERIFICATION_READ,
  resource: (input) => (input.case_id ? String(input.case_id) : null),
  idempotency: "read_only",
  audit: "required",
  // V-07, confirmed deliberately. See useCase.js's check.
  auditedRead: true,
  why: "Opening an identity case is an event. Sealed data, so the read itself is the record (V-07).",

  async run(input, ctx) {
    const repo = ctx.repositories.verification;
    const caseId = String(input.case_id);
    const row = await repo.findById(ctx.db, caseId);
    if (!row) throw new NotFoundError("verification_case");

    const documents = await repo.listDocuments(ctx.db, caseId);

    // A case migrated from `kyc_docs` has its evidence in LONGTEXT columns
    // rather than in object storage. Presence only — the bytes are fetched
    // one at a time through the audited document read, exactly as the new
    // ones are.
    const legacy = row.legacy_kyc_id
      ? await repo.legacyDocumentPresence(ctx.db, row.legacy_kyc_id)
      : null;

    ctx.recordAudit({
      resourceType: "verification_case",
      resourceId: caseId,
      resourceOwner: row.principal_id === null ? null : String(row.principal_id),
      // Nothing changed, and the record says so. `outcome: "permitted"` with
      // no before/after is what a Sealed READ looks like in the log — the
      // event is that it happened at all.
      before: null,
      after: { read: true, document_count: documents.length },
      reason: ctx.reason ?? null,
    });

    return {
      caseId,
      subjectId: row.principal_id === null ? null : String(row.principal_id),
      kind: row.kind,
      state: row.state,
      submittedAt: row.submitted_at,
      decidedAt: row.decided_at,
      decidedBy: row.decided_by === null ? null : String(row.decided_by),
      decisionReason: row.decision_reason,
      expiresAt: row.expires_at,
      isVerified: V.grantsIdentityVerified(row, ctx.clock.now()),
      /**
       * References, not content — and deliberately not object keys either.
       * A document is opened by its id through an action that demands a
       * stated reason; handing back the storage key would let a caller who
       * has this surface skip the one that records why.
       */
      documents: documents.map((d) => ({
        documentId: String(d.id),
        docType: d.doc_type,
        mime: d.mime,
        bytes: Number(d.bytes),
        uploadedAt: d.uploaded_at,
      })),
      legacyEvidence: legacy
        ? {
            legacyKycId: String(legacy.id),
            docType: legacy.doc_type,
            available: {
              id_front: Boolean(legacy.has_front),
              id_back: Boolean(legacy.has_back),
              selfie: Boolean(legacy.has_selfie),
            },
          }
        : null,
      // What this reviewer may do next, from the machine. A client that
      // renders buttons from this cannot offer a transition the server will
      // refuse.
      availableTransitions: Object.keys(V.TRANSITIONS[row.state] || {}).filter(
        (to) => (V.TRANSITIONS[row.state][to] || []).includes("trust_safety")
      ),
    };
  },
});
