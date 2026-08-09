/**
 * Submit identity evidence — identity / application
 *
 * I-07 §13, §14, §16. The use case that ends the base64-in-the-database
 * architecture Phase 0 found.
 *
 * WHAT CHANGES, CONCRETELY
 * ────────────────────────
 * `POST /api/kyc` used to run:
 *
 *     INSERT INTO kyc_docs (…, front_image, back_image, selfie_image)
 *     VALUES (…, <5 MB of base64>, <5 MB>, <5 MB>)
 *
 * into the primary transactional database. After this, the same request
 * writes bytes to private object storage and a REFERENCE to the database, and
 * `identity_document` has no column a byte could go in.
 *
 * ORDER OF OPERATIONS, AND WHY
 * ────────────────────────────
 * The uploads happen BEFORE any write in this transaction. `BEGIN` alone
 * holds no locks, so the network round-trips to object storage do not block
 * another transaction — and if storage fails, nothing has been written and
 * the transaction rolls back over an empty change set.
 *
 * The residual risk is the inverse: an upload succeeds and the transaction
 * rolls back, leaving an object nothing references. That is the SAFE
 * direction of the two — an orphan object costs storage; a row referencing a
 * missing object is a case a reviewer cannot decide. Orphans are collectable
 * from the key prefix, which is why the key carries the case id.
 *
 * ZERO AI (§30). Nothing classifies the document, scores it, extracts text
 * from it, or pre-fills a decision. It is stored and it waits for a human.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { ValidationError, ConflictError } = require("../../../../shared/errors");
const { ACTION } = require("../../actions");
const V = require("../../domain/verificationCase");
const store = require("../../../platform").sealedStorage;

/**
 * What a submission must contain.
 *
 * `id_front` and `selfie` are both required, and that pairing is
 * `TRUST-ARCHITECTURE.md` §6's ("NID + selfie, human review") rather than a
 * preference: a document without a face beside it verifies that the document
 * exists, not that the person holding it is its subject.
 *
 * `id_back` is optional — a passport has no second side.
 */
const REQUIRED = Object.freeze(["id_front", "selfie"]);
const ACCEPTED = Object.freeze(["id_front", "id_back", "selfie"]);

/**
 * Pull the documents out of the input.
 *
 * Deliberately NOT logged, echoed, or included in any error message: the
 * value is an identity document, and an error string is the least controlled
 * place a fragment of one could end up.
 */
function readSubmission(input) {
  const documents = input.documents || {};
  const out = [];
  for (const docType of ACCEPTED) {
    const entry = documents[docType];
    if (!entry) continue;
    const buffer = store.decodeDocument(entry.data, { field: docType });
    // A declared type is compared against the magic bytes; an undeclared one
    // is read from them and refused if it is not on the allow-list. The
    // legacy wire format has no MIME field, which is why the second path
    // exists at all.
    const mime = entry.mime
      ? store.sniffMime(buffer, String(entry.mime))
      : store.requireDetectedMime(buffer, { field: docType });
    out.push({ docType, buffer, mime });
  }
  const supplied = new Set(out.map((d) => d.docType));
  const missing = REQUIRED.filter((r) => !supplied.has(r));
  if (missing.length) {
    throw new ValidationError(`identity verification requires ${missing.join(" and ")}`, {
      fields: missing.map((field) => ({ field, code: "REQUIRED" })),
      userMessage: {
        en: "Please upload both your ID and a photo of yourself holding it.",
        bn: "অনুগ্রহ করে আপনার পরিচয়পত্র এবং সেটি হাতে নিয়ে তোলা ছবি দুটোই আপলোড করুন।",
      },
    });
  }
  return out;
}

module.exports = defineUseCase("identity.SubmitIdentityVerification", {
  kind: "command",
  action: ACTION.VERIFICATION_SUBMIT,
  /**
   * The actor's OWN principal id, server-side, from the verified actor.
   *
   * Never `input.user_id`. A resource id supplied by the caller for their own
   * resource is the client-controlled-ownership defect wearing a different
   * hat, and this is the surface where it would matter most.
   */
  resource: (input, ctx) => (ctx.actor && ctx.actor.principalId ? String(ctx.actor.principalId) : null),
  /**
   * Submitting twice replaces the evidence on the same case rather than
   * opening a second — `uniq_open_case` makes that structural, and it is what
   * makes a retried upload safe without an idempotency key.
   */
  idempotency: "naturally_idempotent",
  audit: "required",
  why: "Ends base64-in-the-database for identity documents and starts the review that gates listing eligibility.",

  async run(input, ctx) {
    const principalId = ctx.actor.principalId;
    const repo = ctx.repositories.verification;
    const now = ctx.clock.now();

    // Validate and decode before anything else. A malformed submission must
    // not produce a case, an object, or an audit record.
    const documents = readSubmission(input);

    const existing = await repo.findByPrincipal(ctx.tx, principalId, V.KIND.IDENTITY);
    const from = V.stateOf(existing);

    // The machine decides whether a resubmission is allowed from here. The
    // policy refuses `under_review` as well — two layers, and the negative
    // control in the test suite removes both.
    V.assertTransition(from, V.STATE.SUBMITTED, "subject");

    // ── storage, before the first lock ─────────────────────
    const stored = [];
    let caseId = existing ? String(existing.id) : null;
    if (!caseId) {
      const opened = await repo.openCase(ctx.tx, {
        principalId, kind: V.KIND.IDENTITY, correlationId: ctx.correlationId, now,
      });
      caseId = opened.id || String((await repo.findByPrincipal(ctx.tx, principalId, V.KIND.IDENTITY)).id);
    }

    for (const doc of documents) {
      const put = await store.putSealed({
        caseId, docType: doc.docType, buffer: doc.buffer, mime: doc.mime,
      });
      stored.push({ ...put, docType: doc.docType });
    }

    // ── the case ───────────────────────────────────────────
    if (existing) {
      // Back to `submitted` with the decision cleared, and `submitted_at`
      // restarted — a resubmission goes to the back of the queue, so replacing
      // evidence cannot jump a person ahead of people who have been waiting.
      const moved = await repo.resubmit(ctx.tx, { caseId, from, now, correlationId: ctx.correlationId });
      if (!moved) {
        throw new ConflictError(
          "VERIFICATION_CASE_MOVED",
          "the verification case changed while the submission was in flight"
        );
      }
    }

    for (const doc of stored) {
      await repo.attachDocument(ctx.tx, {
        caseId, docType: doc.docType, objectKey: doc.objectKey,
        mime: doc.mime, bytes: doc.bytes, uploadedBy: principalId, now,
      });
    }

    // §23: the legacy column the current frontend reads moves with it.
    await repo.mirrorLegacyStatus(ctx.tx, {
      principalId, legacyKycId: existing ? existing.legacy_kyc_id : null,
      state: V.STATE.SUBMITTED, reason: null, decidedBy: null, now,
    });

    ctx.recordAudit({
      resourceType: "verification_case",
      resourceId: caseId,
      resourceOwner: String(principalId),
      before: existing ? { state: from } : null,
      after: {
        state: V.STATE.SUBMITTED,
        // WHAT was submitted, never the submission. AUDIT-LOG-ARCHITECTURE
        // §3.2: the metadata of sensitive evidence, and not the evidence — so
        // no object key, no bytes, no NID number, no MIME sniff result.
        document_kinds: stored.map((d) => d.docType).sort(),
        document_count: stored.length,
        resubmission: Boolean(existing),
      },
    });

    return {
      caseId,
      state: V.STATE.SUBMITTED,
      documents: stored.map((d) => d.docType).sort(),
      // What the subject is told. It says what happened and promises nothing
      // about when — the old copy said "24-48 hours" and F-12 recorded that
      // nothing could approve them at all.
      status: "submitted_for_review",
    };
  },
});
