/**
 * Open one identity document — identity / application
 *
 * I-07 §14. The most sensitive read in the system at Gate 1, and the one
 * place a national identity card leaves storage.
 *
 * FOUR CONTROLS, EACH INDEPENDENT
 * ───────────────────────────────
 *   1. the POLICY grants `trust_safety` and nobody else — not support, not
 *      finance, not operations, not `platform_owner` (I-04 §6)
 *   2. the policy sets `reasonRequired`, so a reviewer who will not say why
 *      is DENIED by the kernel rather than validated by a handler (R-1103,
 *      D-03)
 *   3. the URL is signed and expires in five minutes — it is not a location,
 *      it is a temporary permission
 *   4. the read is audited whether or not the reviewer ever loads it (V-07)
 *
 * The fourth is worth stating plainly: the audit record is written at the
 * moment the URL is MINTED, not when the object is fetched. The fetch goes
 * directly to object storage and this system never sees it. Minting is the
 * decision, so minting is what is recorded.
 *
 * ZERO AI (§30). No OCR, no classification, no extraction. A human is handed
 * a picture.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { NotFoundError, GoneError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");
const store = require("../../../platform").sealedStorage;

module.exports = defineUseCase("identity.GetIdentityDocumentUrl", {
  kind: "query",
  action: ACTION.DOCUMENT_READ,
  resource: (input) => (input.document_id ? String(input.document_id) : null),
  // The reason travels to the POLICY, which denies without it. A handler that
  // forgot to check would still be refused by the kernel.
  context: (input, ctx) => ({ reason: ctx.reason ?? input.reason ?? null }),
  idempotency: "read_only",
  audit: "required",
  auditedRead: true,
  why: "Sealed evidence leaves storage here and nowhere else. Every mint is a record with a stated reason (V-07, D-03).",

  async run(input, ctx) {
    // Loaded by the KERNEL, from the database, before this ran. Not
    // re-queried — §36, no N+1 authorization — and never taken from the
    // request.
    const doc = ctx.authorized.resource;
    if (!doc) throw new NotFoundError("identity_document");
    if (doc.deleted) {
      // Belt and braces: the policy already refuses a deleted document. If
      // this ever fires, that condition has been removed.
      throw new GoneError("DOCUMENT_DELETED", "that document is no longer available");
    }

    const url = await store.signedReadUrl(doc.objectKey, {
      ttlSeconds: store.READ_URL_TTL_SECONDS,
    });

    ctx.recordAudit({
      resourceType: "identity_document",
      resourceId: String(doc.id),
      resourceOwner: doc.subjectPrincipalId,
      before: null,
      // The object key is NOT recorded. An audit log is queried by support
      // staff who may not read identity documents, and a key plus a signing
      // credential is the document. What the record says is that a document
      // of this KIND was opened, by whom, when, and why — which is what an
      // investigation needs and all it needs.
      after: { doc_type: doc.docType, case_id: doc.caseId, url_ttl_seconds: store.READ_URL_TTL_SECONDS },
      reason: ctx.reason ?? null,
    });

    return {
      documentId: String(doc.id),
      docType: doc.docType,
      mime: doc.mime,
      url,
      expiresInSeconds: store.READ_URL_TTL_SECONDS,
    };
  },
});
