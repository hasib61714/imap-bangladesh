-- ═══════════════════════════════════════════════════════════
--  MIGRATION : 011_verification   (plan id M-14, DDL half)
--  PURPOSE   : The trust boundary — verification_case, identity_document,
--              and the provider listing state that replaces a bare boolean.
--  DEPENDS   : 010_provider_source
--  CLASS     : REVERSIBLE  (additive; no existing column changes)
--  RISK      : LOW for the DDL. The BYTE COPY out of kyc_docs is the other
--              half of M-14 and is NOT here — see §What this does not do.
--  PRE-CHECK : SELECT table_name FROM information_schema.tables
--                WHERE table_schema = DATABASE()
--                  AND table_name IN ('verification_case','identity_document');
--              SELECT column_name FROM information_schema.columns
--                WHERE table_schema = DATABASE() AND table_name = 'providers'
--                  AND column_name = 'listing_state';
--  VALIDATE  : two tables; uniq_open_case; uniq_live_document;
--              chk_reason_when_refused; providers.listing_state present with
--              every existing row reading 'approved' or 'applied' per §Backfill.
--  ROLLBACK  : DROP the two tables; ALTER TABLE providers DROP COLUMN
--              listing_state. No existing data is altered by this migration.
--  STOP IF   : any of the three already exists with a different shape.
--  APPROVAL  : none for the DDL. Retention is an owner decision and no
--              retention is implemented — §Retention.
--
--  WHY identity_document HOLDS NO BYTES
--  ------------------------------------
--  AD-011 and DATA-ARCHITECTURE §6 classify an identity document as Highly
--  Sensitive: object storage, every read audited, Sealed from AI context.
--  Today `kyc_docs` holds up to four LONGTEXT base64 columns of ~5 MB each in
--  the primary database, which Phase 0 named as one of the largest data
--  defects in the system.
--
--  This table holds a reference and nothing else. There is no column a byte
--  could go in, which is a stronger guarantee than a rule saying not to.
-- ═══════════════════════════════════════════════════════════

-- ── verification_case — the thing being verified ────────────
--
-- One case per (principal, kind). A resubmission moves the SAME case back to
-- `submitted` rather than creating a second, so "what is this person's
-- verification state" has one answer. The history — who decided what, when,
-- and why — is `audit_log`, which is append-only and cannot be edited by the
-- decision path (AD-009).
CREATE TABLE IF NOT EXISTS verification_case (
  id             VARCHAR(36) PRIMARY KEY,

  -- No foreign key, and for the reason migration 009 records for
  -- otp_challenge: `principal` is not populated until the I-03 backfill runs,
  -- and verification must work before then. The backfill reuses `users.id` as
  -- `principal.id`, so the value stored here resolves after the cutover
  -- without being rewritten.
  principal_id   VARCHAR(36) NOT NULL,

  -- ENTITY-IMPLEMENTATION-MAP: kind ∈ identity | capability. Capability
  -- verification is defined and has no surface at Gate 1 (O-01 places the
  -- DECISION here and the declaration in marketplace); the value exists so
  -- the case table does not need altering when I-09 brings the catalogue.
  kind           ENUM('identity','capability') NOT NULL,

  -- STATE-MACHINES.md §9, verbatim. `not_submitted` is deliberately ABSENT
  -- from this enum: it is the machine's initial state and it is represented
  -- by the absence of a case, so a row can never hold it. The domain exposes
  -- it as the derived state for a principal with no case.
  state          ENUM('submitted','under_review','verified','rejected','more_info','expired','revoked')
                 NOT NULL DEFAULT 'submitted',

  submitted_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- Who decided, not who reviewed: `under_review` records a reviewer picking
  -- the case up, and that is an audit record rather than a column, because a
  -- case can be picked up by several people before one decides.
  decided_by     VARCHAR(36) NULL,
  decided_at     DATETIME(3) NULL,
  -- R-1103: a refusal without a stated reason is unappealable. Enforced by
  -- chk_reason_when_refused below, not by the handler.
  decision_reason VARCHAR(500) NULL,
  -- TRUST-ARCHITECTURE §6: verification is time-bounded and expiry is not a
  -- penalty. NULL means "no expiry set" — the validity period is an owner
  -- decision that has not been made, and inventing one here would be
  -- inventing a compliance posture.
  expires_at     DATETIME(3) NULL,

  -- The `kyc_docs` row this case was migrated from, where there was one.
  --
  -- Two models with two queues would diverge on the first decision, so there
  -- is one queue and this is how a case reaches the evidence that predates
  -- `identity_document`. It is NULL for everything submitted after this
  -- migration, and it becomes dead weight the day M-15 runs.
  legacy_kyc_id  VARCHAR(36) NULL,

  correlation_id CHAR(36) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE KEY uniq_open_case (principal_id, kind),

  CONSTRAINT chk_reason_when_refused CHECK (
    state NOT IN ('rejected','revoked') OR decision_reason IS NOT NULL
  ),

  -- "What is waiting for a reviewer?" — the queue, without a scan.
  INDEX idx_queue (kind, state, submitted_at),
  INDEX idx_principal (principal_id, kind),
  INDEX idx_expiry (state, expires_at),
  INDEX idx_legacy (legacy_kyc_id)
) ENGINE=InnoDB;

-- ── §Backfill — every legacy KYC row becomes a case ─────────
--
-- WHY THE BACKLOG IS MIGRATED AND NOT LEFT BEHIND
-- One queue or two is the whole question. Two means a reviewer has to know
-- which screen a person's evidence is on, means `users.kyc_status` can be
-- written by two paths, and means the first decision made on either side puts
-- them permanently out of step. So every `kyc_docs` row becomes a case, and
-- `legacy_kyc_id` is how the case reaches images that live in the old table.
--
-- The state mapping, `kyc_docs.status` → `verification_case.state`:
--     pending  → submitted    (waiting for a reviewer — §9's `submitted`)
--     verified → verified
--     rejected → rejected
--
-- `pending` maps to `submitted` rather than `under_review` because nothing in
-- the legacy table records a reviewer having picked the case up. Claiming
-- otherwise would put work in progress that nobody is doing.
--
-- The reason text for a legacy rejection is `rejection_reason` where one was
-- recorded, and a MARKER where none was. chk_reason_when_refused requires a
-- value; the marker states that the legacy row had none rather than inventing
-- a reason a reviewer never gave. R-1103's requirement starts here — it
-- cannot be applied retroactively to decisions made before it existed.
--
-- Only ONE case per (user, identity) can exist. `kyc_docs` has no such
-- constraint, so the newest submission per user wins and older rows stay in
-- `kyc_docs` unreferenced — reachable by user, not lost.
INSERT INTO verification_case
  (id, principal_id, kind, state, submitted_at, decided_by, decided_at,
   decision_reason, legacy_kyc_id, created_at, updated_at)
SELECT
  k.id,
  k.user_id,
  'identity',
  CASE k.status WHEN 'verified' THEN 'verified'
                WHEN 'rejected' THEN 'rejected'
                ELSE 'submitted' END,
  k.submitted_at,
  k.reviewed_by,
  k.reviewed_at,
  CASE WHEN k.status = 'rejected'
       THEN COALESCE(NULLIF(TRIM(k.rejection_reason), ''),
                     '[migrated] the legacy kyc_docs row recorded no reason')
       ELSE k.rejection_reason END,
  k.id,
  k.submitted_at,
  COALESCE(k.reviewed_at, k.submitted_at)
FROM kyc_docs k
JOIN (
  -- The newest row per user. `submitted_at` ties are broken by id so the
  -- result is deterministic. The timestamp is zero-padded to a fixed width so
  -- the string comparison orders the same way the numbers do.
  SELECT user_id,
         MAX(CONCAT(LPAD(UNIX_TIMESTAMP(submitted_at), 12, '0'), '-', id)) AS newest
    FROM kyc_docs GROUP BY user_id
) pick ON pick.user_id = k.user_id
      AND pick.newest = CONCAT(LPAD(UNIX_TIMESTAMP(k.submitted_at), 12, '0'), '-', k.id)
-- Re-running this migration inserts nothing: `uniq_open_case` catches the
-- second attempt and this turns it into a no-op. Deliberately NOT `INSERT
-- IGNORE`, which would also swallow a chk_reason_when_refused violation and
-- silently drop the row it was protecting.
ON DUPLICATE KEY UPDATE verification_case.id = verification_case.id;

-- ── identity_document — a reference, never a document ───────
CREATE TABLE IF NOT EXISTS identity_document (
  id           VARCHAR(36) PRIMARY KEY,
  case_id      VARCHAR(36) NOT NULL,

  -- What the image IS, not what kind of identity paper it depicts. The paper
  -- type is a property of the submission and is deliberately not stored: the
  -- NUMBER on it certainly is not (`kyc_docs.doc_number` holds one in clear
  -- today), and the reviewer reads both from the image they are shown.
  doc_type     ENUM('id_front','id_back','selfie','certificate') NOT NULL,

  -- The object-storage key. Never a URL: a URL implies a host and a
  -- retrieval policy, and the retrieval policy for these is a short-lived
  -- signed URL minted per authorised read (AD-011, D-03).
  object_key   VARCHAR(500) NOT NULL,
  mime         VARCHAR(100) NOT NULL,
  bytes        INT UNSIGNED NOT NULL,

  uploaded_by  VARCHAR(36) NULL,
  uploaded_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- A replaced document is not erased. The row stays so an investigation can
  -- see that a replacement happened; the object is deleted separately, which
  -- is a retention decision nobody has made.
  deleted_at   DATETIME(3) NULL,

  -- One LIVE document of each kind per case. Same shape as
  -- otp_challenge.active_slot, and the CHECK keeps the marker and the state
  -- from drifting apart.
  --
  -- `<=>` AND NOT `=`, AND THE REASON IS THREE-VALUED LOGIC
  -- ------------------------------------------------------
  -- A CHECK constraint rejects only on FALSE; NULL passes. Written as
  -- `live_slot = '1'`, a row with `deleted_at IS NULL` and `live_slot IS
  -- NULL` evaluates to (TRUE AND NULL) OR (FALSE AND …) → NULL → ACCEPTED.
  -- That row is live and holds no slot, so `uniq_live_document` does not
  -- constrain it either — NULLs do not collide — and two live front-of-ID
  -- images could sit on one case with no way to know which the reviewer saw.
  --
  -- `<=>` is null-safe: NULL <=> '1' is FALSE, not NULL, so the constraint
  -- rejects. Verified by probe on MariaDB 12.2.2; migration 012 carries the
  -- same fix to `otp_challenge`, where I-05 wrote the same hole.
  live_slot    CHAR(1) NULL,
  UNIQUE KEY uniq_live_document (case_id, doc_type, live_slot),
  CONSTRAINT chk_live_slot CHECK (
    (deleted_at IS NULL     AND live_slot <=> '1') OR
    (deleted_at IS NOT NULL AND live_slot IS NULL)
  ),

  CONSTRAINT fk_document_case FOREIGN KEY (case_id)
    REFERENCES verification_case (id) ON DELETE CASCADE,

  INDEX idx_case (case_id, deleted_at)
) ENGINE=InnoDB;

-- ── providers.listing_state — the authority is not a boolean ─
--
-- `providers.is_approved` is a TINYINT written by scripts/seedDemo.js and by
-- nothing else (F-12): a genuine applicant could never become listable. It
-- also cannot express the difference between "not yet reviewed", "refused"
-- and "suspended", so an operator could not tell one from another.
--
-- STATE-MACHINES §2 defines the provider listing lifecycle. GATE-1 §5 places
-- provider approval among the "validated enums, not machines", so this is a
-- column with guarded transitions rather than a machine table — the
-- transitions live in the domain and every one is authorised and audited.
--
-- WHICH OF §2's STATES ARE HERE, AND WHY THE REST ARE NOT
-- -------------------------------------------------------
--   applied    · approved · rejected · suspended     ← here
--   listed / paused        → `is_available`. That column already exists, it is
--                            the provider's own switch, and duplicating it as
--                            a second state would give one fact two homes.
--   under_review           → the VERIFICATION CASE's `under_review`. The
--                            substantive review of a provider is the identity
--                            case; a second review queue over the same person
--                            would be a claim step nobody has specified.
--   removed                → no use case grants it, so it is not an enum
--                            value. I-06 §6: no speculative states.
--
-- Every value below is reachable and every transition into it belongs to a
-- named, authorised, audited use case. An enum value nothing can produce is a
-- claim the schema makes and the code cannot keep.
ALTER TABLE providers
  ADD COLUMN listing_state ENUM('applied','approved','rejected','suspended')
    NOT NULL DEFAULT 'applied';

-- ── §Backfill — carrying migration 002's grandfathering forward ──
--
-- Migration 002 approved the providers that existed when P1-7 closed the
-- self-listing hole. Those rows say `is_approved = 1` and this states the
-- same fact in the new column, so no provider is de-listed by a structural
-- change. Everything else is `applied`, which is what an unreviewed
-- application is.
--
-- This is the ONLY data this migration writes, and it writes a value the row
-- already implies rather than a new claim about anybody.
UPDATE providers SET listing_state = 'approved' WHERE is_approved = 1;

ALTER TABLE providers
  ADD INDEX idx_listing_state (listing_state, is_available);

-- ── §What this migration does NOT do ────────────────────────
--
-- M-14's other half — copying the base64 out of `kyc_docs` into object
-- storage and byte-comparing every object — is not here. It needs production
-- data, and DATABASE-IMPLEMENTATION-PLAN separates it from M-15 (nulling the
-- source columns) by a full release cycle precisely so an object-storage
-- misconfiguration is discovered while the original still exists.
--
-- M-15 is IRREVERSIBLE and remains an owner-scheduled step.
--
-- ── §Retention ──────────────────────────────────────────────
--
-- None is implemented and none is invented. How long an identity document may
-- be kept after a decision is a legal question for Bangladesh that
-- PHASE-3-READINESS.md §7 records as unanswered. `deleted_at` and
-- `idx_case` make a retention job one range scan when the answer exists.
