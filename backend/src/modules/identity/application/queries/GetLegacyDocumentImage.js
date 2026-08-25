/**
 * Open one legacy identity document — identity / application
 *
 * I-07 §23, §25. The pre-object-storage backlog, reviewable under exactly the
 * controls the new path uses.
 *
 * WHY THIS EXISTS AT ALL
 * ──────────────────────
 * Migration 011 turns every `kyc_docs` row into a verification case so there
 * is ONE queue. The evidence for those cases is still base64 in LONGTEXT
 * columns, and M-14's byte-copy — which needs production data — has not run.
 * Without this, migrating the queue would make the backlog undecidable.
 *
 * WHAT IS NOT RELAXED
 * ───────────────────
 * `trust_safety` only. A stated reason or the kernel denies. Tier C. Audited
 * on every read. A compatibility path with a weaker guard than the path it is
 * compatible with is the hole, not the compatibility.
 *
 * WHAT IS DIFFERENT
 * ─────────────────
 * It returns BYTES rather than a URL, because there is no object to sign for.
 * That is a worse shape — the image passes through this process and through
 * whatever logs the response size — and it is the shape the old architecture
 * left behind. It goes away when M-14's copy and M-15's null run.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { NotFoundError, ValidationError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");

/** Which legacy column each document kind lives in. */
const KINDS = Object.freeze(["id_front", "id_back", "selfie", "certificate"]);

module.exports = defineUseCase("identity.GetLegacyDocumentImage", {
  kind: "query",
  action: ACTION.DOCUMENT_READ_LEGACY,
  resource: (input) => (input.case_id ? String(input.case_id) : null),
  context: (input, ctx) => ({ reason: ctx.reason ?? input.reason ?? null }),
  idempotency: "read_only",
  audit: "required",
  auditedRead: true,
  why: "The pre-object-storage backlog stays decidable, under the same four controls as the new path (V-07).",

  async run(input, ctx) {
    const docType = String(input.doc_type || "");
    if (!KINDS.includes(docType)) {
      throw new ValidationError(`doc_type must be one of: ${KINDS.join(", ")}`, {
        fields: [{ field: "doc_type", code: "UNKNOWN_KIND" }],
      });
    }

    // The kernel loaded this and its condition already refused a case with no
    // legacy evidence.
    const subject = ctx.authorized.resource;
    if (!subject || !subject.legacyKycId) throw new NotFoundError("legacy_document");

    const image = await ctx.repositories.verification.legacyDocumentImage(
      ctx.db, subject.legacyKycId, docType
    );
    if (!image) throw new NotFoundError("legacy_document");

    ctx.recordAudit({
      resourceType: "identity_document",
      resourceId: `${subject.legacyKycId}:${docType}`,
      resourceOwner: subject.subjectPrincipalId,
      before: null,
      // The KIND that was opened and the fact that it was legacy. Never the
      // image, never its length in a form that hints at content.
      after: { doc_type: docType, legacy: true, case_id: subject.id },
      reason: ctx.reason ?? null,
    });

    return { caseId: subject.id, docType, legacy: true, image };
  },
});
