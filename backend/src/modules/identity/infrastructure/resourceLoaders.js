/**
 * Identity resource loaders — identity / infrastructure
 *
 * I-04 §17: a loader takes an id and returns the authoritative row. It cannot
 * take a request, and the kernel calls it — so the row a policy decides
 * against is the row in the database, never one the caller described.
 *
 * THREE TYPES, AND THE THIRD IS THE INTERESTING ONE
 * ─────────────────────────────────────────────────
 *   verification_case      keyed by case id       — the reviewer's surface
 *   own_verification_case  keyed by PRINCIPAL id  — "my verification"
 *   identity_document      keyed by document id   — Sealed evidence
 *
 * `own_verification_case` exists for the same reason marketplace has
 * `own_provider_profile`: `GET /api/verification/me` carries no id, and the
 * alternative is the use case looking the row up itself and then comparing —
 * ownership decided outside the kernel, which is the defect I-04 removed.
 *
 * `identity_document` carries `subjectPrincipalId` so a policy can ask "is
 * the reviewer the subject?" without a second query. That is what feeds
 * `sameActor`, and it is how the Gate-1 separation-of-duties gap gets
 * counted rather than pretended away (I-04 §12).
 */
"use strict";

const { registerLoader } = require("../../platform").authorization;

const CASE_SELECT = `
  SELECT v.id, v.principal_id, v.kind, v.state, v.decided_by, v.expires_at,
         v.legacy_kyc_id, v.submitted_at
    FROM verification_case v`;

const shapeCase = (r, type) => ({
  type,
  id: String(r.id),
  subjectPrincipalId: r.principal_id === null ? null : String(r.principal_id),
  kind: r.kind,
  state: r.state,
  decidedBy: r.decided_by === null ? null : String(r.decided_by),
  expiresAt: r.expires_at,
  legacyKycId: r.legacy_kyc_id === null ? null : String(r.legacy_kyc_id),
  submittedAt: r.submitted_at,
});

async function loadVerificationCase(id, { db }) {
  const [rows] = await db.query(`${CASE_SELECT} WHERE v.id = ? LIMIT 1`, [id]);
  return rows.length ? shapeCase(rows[0], "verification_case") : null;
}

/**
 * The actor's own case, by principal id.
 *
 * Returns a SYNTHETIC shape when there is no row. A person who has never
 * submitted still has a verification state — `not_submitted` — and denying
 * `read_own` with "not found" would tell them their own status is unknowable.
 * The synthetic shape is owned by the actor by construction, so it cannot be
 * used to reach anybody else's.
 */
async function loadOwnVerificationCase(principalId, { db }) {
  if (!principalId) return null;
  const [rows] = await db.query(`${CASE_SELECT} WHERE v.principal_id = ? AND v.kind = 'identity' LIMIT 1`, [principalId]);
  if (rows.length) return shapeCase(rows[0], "own_verification_case");
  return {
    type: "own_verification_case",
    id: String(principalId),
    subjectPrincipalId: String(principalId),
    kind: "identity",
    state: "not_submitted",
    decidedBy: null,
    expiresAt: null,
    legacyKycId: null,
    submittedAt: null,
    synthetic: true,
  };
}

async function loadIdentityDocument(id, { db }) {
  const [rows] = await db.query(
    `SELECT d.id, d.case_id, d.doc_type, d.object_key, d.mime, d.deleted_at,
            v.principal_id, v.state AS case_state
       FROM identity_document d
       JOIN verification_case v ON v.id = d.case_id
      WHERE d.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    type: "identity_document",
    id: String(r.id),
    caseId: String(r.case_id),
    docType: r.doc_type,
    // The key travels so the use case does not query a second time (§36 — no
    // N+1 authorization). It is an opaque storage path, not a URL, and there
    // is no way to fetch it without the signing credentials.
    objectKey: r.object_key,
    mime: r.mime,
    deleted: r.deleted_at !== null,
    subjectPrincipalId: r.principal_id === null ? null : String(r.principal_id),
    caseState: r.case_state,
  };
}

let installed = false;
function installIdentityLoaders() {
  if (installed) return;
  installed = true;
  registerLoader("verification_case", loadVerificationCase);
  registerLoader("own_verification_case", loadOwnVerificationCase);
  registerLoader("identity_document", loadIdentityDocument);
}

module.exports = {
  installIdentityLoaders,
  loadVerificationCase, loadOwnVerificationCase, loadIdentityDocument,
};
