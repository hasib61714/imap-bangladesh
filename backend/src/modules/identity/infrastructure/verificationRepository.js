/**
 * Verification repository — identity / infrastructure
 *
 * I-06 §14, §15. The only place verification SQL exists.
 *
 * Every method takes `db` first — a pool OR a transaction connection — so a
 * write joins the executor's transaction without the repository knowing
 * whether it is in one. Same signature as the I-05 repositories.
 *
 * DATES ARE `Date` OBJECTS, NEVER PRE-FORMATTED STRINGS
 * ────────────────────────────────────────────────────
 * I-05 lost six hours to this: `db.js` sets `timezone: "+06:00"`, so a
 * driver handed a UTC string writes it as if it were Dhaka local time. Every
 * OTP in that build read as having expired six hours before it was created.
 * The driver converts a `Date` correctly, so a `Date` is what it gets.
 *
 * NO AUTHORIZATION DECISIONS HERE (§14). The queue's filter comes from the
 * policy's scope; this turns it into a WHERE clause and does not decide what
 * it should have been.
 */
"use strict";

const { newId } = require("../../../shared/ids");

const at = (d) => (d instanceof Date ? d : new Date(d));

const CASE_COLUMNS = `
  id, principal_id, kind, state, submitted_at, decided_by, decided_at,
  decision_reason, expires_at, legacy_kyc_id, correlation_id, created_at, updated_at`;

// ── reads ──────────────────────────────────────────────────

async function findById(db, id) {
  const [rows] = await db.query(`SELECT ${CASE_COLUMNS} FROM verification_case WHERE id = ? LIMIT 1`, [id]);
  return rows.length ? rows[0] : null;
}

async function findByPrincipal(db, principalId, kind = "identity") {
  const [rows] = await db.query(
    `SELECT ${CASE_COLUMNS} FROM verification_case WHERE principal_id = ? AND kind = ? LIMIT 1`,
    [principalId, kind]
  );
  return rows.length ? rows[0] : null;
}

/**
 * The review queue.
 *
 * `documents: false` in the scope is honoured by the column list, not by a
 * caller remembering to strip fields: there is no object key and no image in
 * anything this returns, so paging the queue cannot produce evidence (P1-12).
 */
async function listQueue(db, { kind = "identity", state = "submitted", page = 1, limit = 30 }) {
  const offset = (page - 1) * limit;
  const [rows] = await db.query(
    `SELECT v.id, v.principal_id, v.kind, v.state, v.submitted_at, v.decided_at,
            v.decided_by, v.expires_at, v.legacy_kyc_id,
            u.name, u.phone, u.email,
            (SELECT COUNT(*) FROM identity_document d
              WHERE d.case_id = v.id AND d.deleted_at IS NULL) AS document_count
       FROM verification_case v
       LEFT JOIN users u ON u.id = v.principal_id
      WHERE v.kind = ? AND v.state = ?
      ORDER BY v.submitted_at ASC
      LIMIT ? OFFSET ?`,
    [kind, state, limit, offset]
  );
  const [[total]] = await db.query(
    "SELECT COUNT(*) AS v FROM verification_case WHERE kind = ? AND state = ?",
    [kind, state]
  );
  return { cases: rows, total: Number(total ? total.v : 0) };
}

// ── locking ────────────────────────────────────────────────

/**
 * Lock the case by primary key, as the transaction's FIRST statement.
 *
 * The I-05 locking discipline, and it was learned the hard way: a `SELECT …
 * FOR UPDATE` that reaches a row through a SECONDARY index and is then
 * followed by an `UPDATE` on the clustered index takes locks in two orders
 * and deadlocks under concurrency — and on MariaDB surfaces as `ER_CHECKREAD`
 * instead. Resolve the id in autocommit, then lock by PK here.
 */
async function lockById(db, id) {
  const [rows] = await db.query(
    `SELECT ${CASE_COLUMNS} FROM verification_case WHERE id = ? FOR UPDATE`,
    [id]
  );
  return rows.length ? rows[0] : null;
}

// ── writes ─────────────────────────────────────────────────

/**
 * Open a case, or return the existing one for this principal.
 *
 * `uniq_open_case` guarantees at most one per (principal, kind), so a race
 * between two submissions resolves in the database rather than in a
 * check-then-insert that both sides pass.
 */
async function openCase(db, { principalId, kind = "identity", correlationId, now }) {
  const id = newId();
  const [res] = await db.query(
    `INSERT INTO verification_case (id, principal_id, kind, state, submitted_at, correlation_id, created_at, updated_at)
     VALUES (?,?,?,'submitted',?,?,?,?)
     ON DUPLICATE KEY UPDATE id = id`,
    [id, principalId, kind, at(now), correlationId || null, at(now), at(now)]
  );
  // affectedRows is 1 for an insert and 0 for the no-op update, which is how
  // the caller learns whether this was a first submission without a second
  // round trip.
  return { id: res.affectedRows === 1 ? id : null, created: res.affectedRows === 1 };
}

/**
 * Move a case from one state to another.
 *
 * `WHERE id = ? AND state = ?` is the concurrency control: two reviewers
 * deciding the same case at the same moment produce one update and one
 * `affectedRows === 0`, and the loser is told the case moved rather than
 * silently overwriting the winner. The domain decided the transition was
 * legal; this makes sure the case is still where the domain thought it was.
 */
async function transition(db, { caseId, from, to, decidedBy, reason, expiresAt, now, isDecision }) {
  const [res] = await db.query(
    `UPDATE verification_case
        SET state = ?,
            decision_reason = ?,
            decided_by = ${isDecision ? "?" : "decided_by"},
            decided_at = ${isDecision ? "?" : "decided_at"},
            expires_at = ?,
            updated_at = ?
      WHERE id = ? AND state = ?`,
    isDecision
      ? [to, reason ?? null, decidedBy ?? null, at(now), expiresAt ? at(expiresAt) : null, at(now), caseId, from]
      : [to, reason ?? null, expiresAt ? at(expiresAt) : null, at(now), caseId, from]
  );
  return res.affectedRows === 1;
}

/** Re-open a case for resubmission: back to `submitted`, decision cleared. */
async function resubmit(db, { caseId, from, now, correlationId }) {
  const [res] = await db.query(
    `UPDATE verification_case
        SET state = 'submitted', submitted_at = ?, decided_by = NULL, decided_at = NULL,
            decision_reason = NULL, expires_at = NULL, correlation_id = ?, updated_at = ?
      WHERE id = ? AND state = ?`,
    [at(now), correlationId || null, at(now), caseId, from]
  );
  return res.affectedRows === 1;
}

// ── documents ──────────────────────────────────────────────

/**
 * Attach a document, retiring any live one of the same kind.
 *
 * Soft-delete then insert, in that order, inside the caller's transaction:
 * `uniq_live_document` would reject the insert otherwise, which is the
 * constraint doing its job rather than a race to lose.
 *
 * The OBJECT of the retired document is not removed here. Deleting bytes is a
 * retention decision nobody has made (migration 011 §Retention), and doing it
 * inside a transaction that might roll back would destroy evidence for a
 * change that never happened.
 */
async function attachDocument(db, { caseId, docType, objectKey, mime, bytes, uploadedBy, now }) {
  await db.query(
    `UPDATE identity_document
        SET deleted_at = ?, live_slot = NULL
      WHERE case_id = ? AND doc_type = ? AND deleted_at IS NULL`,
    [at(now), caseId, docType]
  );
  const id = newId();
  await db.query(
    `INSERT INTO identity_document
       (id, case_id, doc_type, object_key, mime, bytes, uploaded_by, uploaded_at, live_slot)
     VALUES (?,?,?,?,?,?,?,?,'1')`,
    [id, caseId, docType, objectKey, mime, bytes, uploadedBy || null, at(now)]
  );
  return id;
}

/** What evidence a case currently holds. Keys included — reviewer surface only. */
async function listDocuments(db, caseId) {
  const [rows] = await db.query(
    `SELECT id, case_id, doc_type, object_key, mime, bytes, uploaded_at
       FROM identity_document
      WHERE case_id = ? AND deleted_at IS NULL
      ORDER BY doc_type`,
    [caseId]
  );
  return rows;
}

/** Retired documents, for the retention job that exists when the policy does. */
async function listRetiredObjectKeys(db, caseId) {
  const [rows] = await db.query(
    "SELECT id, object_key FROM identity_document WHERE case_id = ? AND deleted_at IS NOT NULL",
    [caseId]
  );
  return rows;
}

// ── legacy compatibility ───────────────────────────────────

/**
 * Which legacy image columns a migrated case still has.
 *
 * Presence, not content. A reviewer opening a migrated case needs to know
 * there is a front image before deciding whether to fetch five megabytes of
 * base64, and P1-12 is the standing reminder of what happens when a list
 * endpoint selects those columns by habit.
 */
async function legacyDocumentPresence(db, legacyKycId) {
  const [rows] = await db.query(
    `SELECT id, doc_type, doc_number IS NOT NULL AS has_number,
            front_image IS NOT NULL  AS has_front,
            back_image IS NOT NULL   AS has_back,
            selfie_image IS NOT NULL AS has_selfie
       FROM kyc_docs WHERE id = ? LIMIT 1`,
    [legacyKycId]
  );
  return rows.length ? rows[0] : null;
}

/** One legacy image, by column. Called only from an audited document read. */
async function legacyDocumentImage(db, legacyKycId, column) {
  const COLUMNS = { id_front: "front_image", id_back: "back_image", selfie: "selfie_image", certificate: "certificate_image" };
  const col = COLUMNS[column];
  // Not interpolated from the caller: a column name in a template string is
  // how a repository grows an injection point.
  if (!col) return null;
  const [rows] = await db.query(`SELECT ${col} AS image FROM kyc_docs WHERE id = ? LIMIT 1`, [legacyKycId]);
  return rows.length ? rows[0].image : null;
}

/**
 * The compatibility mirror (§23, §24).
 *
 * `users.kyc_status` and `kyc_docs.status` are read by the existing frontend
 * and by `providerRepository`'s candidate shape. The verification case is the
 * AUTHORITY; these two are derived, written in the same transaction as the
 * decision, and never read back as a source of truth by anything I-07 adds.
 *
 * The mapping is narrower than the case's state set, because the legacy enum
 * has three values and the machine has seven:
 *
 *     submitted · under_review · more_info  → pending
 *     verified                              → verified
 *     rejected · revoked · expired          → rejected
 *
 * `expired` mapping to `rejected` is the lossy one, and it is lossy in the
 * safe direction: a legacy reader treats it as not-verified, which is true.
 */
const LEGACY_STATUS = Object.freeze({
  submitted: "pending",
  under_review: "pending",
  more_info: "pending",
  verified: "verified",
  rejected: "rejected",
  revoked: "rejected",
  expired: "rejected",
});

async function mirrorLegacyStatus(db, { principalId, legacyKycId, state, reason, decidedBy, now }) {
  const legacy = LEGACY_STATUS[state];
  if (!legacy) return;
  const verified = legacy === "verified" ? 1 : 0;

  // `users.verified` and `providers.nid_verified` moved with the decision in
  // the old `PATCH /api/kyc/:id` handler and they move with it here, in the
  // same transaction rather than in three sequential pool queries that could
  // half-apply.
  await db.query("UPDATE users SET kyc_status = ?, verified = ? WHERE id = ?", [legacy, verified, principalId]);
  await db.query("UPDATE providers SET nid_verified = ? WHERE user_id = ?", [verified, principalId]);

  // NOT MIRRORED: `providers.trust_score = LEAST(trust_score + 30, 100)`.
  //
  // The old handler added 30 on every approval, so approve → revoke →
  // approve added 60 for one verified identity. A score that ratchets upward
  // on repeated review is not a measurement, and reproducing it here would
  // carry the defect into the model that replaces it. Trust score is left
  // untouched by verification until TRUST-ARCHITECTURE §4's formula is
  // implemented, which is not this phase.

  if (legacyKycId) {
    await db.query(
      `UPDATE kyc_docs
          SET status = ?, rejection_reason = COALESCE(?, rejection_reason),
              reviewed_by = COALESCE(?, reviewed_by), reviewed_at = ?
        WHERE id = ?`,
      [legacy, reason ?? null, decidedBy ?? null, at(now), legacyKycId]
    );
  }
}

module.exports = {
  findById, findByPrincipal, listQueue,
  lockById, openCase, transition, resubmit,
  attachDocument, listDocuments, listRetiredObjectKeys,
  legacyDocumentPresence, legacyDocumentImage,
  mirrorLegacyStatus, LEGACY_STATUS,
};
