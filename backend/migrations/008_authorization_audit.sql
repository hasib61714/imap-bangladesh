-- ═══════════════════════════════════════════════════════════
--  MIGRATION : 008_authorization_audit
--  PURPOSE   : Two columns the authorization kernel needs on `audit_log`:
--              the separation-of-duties marker, and the denial reason.
--  DEPENDS   : 007_identity
--  CLASS     : REVERSIBLE  (additive; both columns are nullable/defaulted)
--  RISK      : LOW. `audit_log` is append-only and holds only the
--              authentication records I-03 began writing; no rewrite occurs
--              and no existing column changes.
--  PRE-CHECK : SELECT column_name FROM information_schema.columns
--                WHERE table_schema = DATABASE() AND table_name = 'audit_log'
--                  AND column_name IN ('sod_bypass','deny_reason');
--              -- expect zero rows
--  VALIDATE  : both columns present; idx_sod present; existing rows have
--              sod_bypass = 0 and deny_reason IS NULL.
--  ROLLBACK  : ALTER TABLE audit_log DROP COLUMN sod_bypass, DROP COLUMN
--              deny_reason, DROP INDEX idx_sod;
--  STOP IF   : either column already exists with a different type.
--  APPROVAL  : none.
--
--  WHY A COLUMN AND NOT A LINE IN `reason`
--  ---------------------------------------
--  AUTHORIZATION-IMPLEMENTATION-PLAN §6, on the Gate-1 separation-of-duties
--  limitation:
--
--      "Counting the exception is the point. An unenforceable control that is
--       invisible is worse than one that is enforced later, because nobody
--       knows how often it mattered."
--
--  Counting requires a predicate. `reason` is free text supplied by a human
--  under R-1103 and means something different; putting a marker in it would
--  make both unqueryable. One indexed flag answers "how often did the same
--  person approve and execute" in a single statement, which is the question
--  the limitation exists to keep askable.
--
--  `deny_reason` is the kernel's fixed enum — `not_owner`, `wrong_account`,
--  `missing_permission`. It is deliberately NOT the same column as `reason`
--  for the mirror-image argument: an investigation asking "what was refused,
--  and why" should not have to distinguish the system's answer from the
--  operator's.
-- ═══════════════════════════════════════════════════════════

-- Portable form only. `ADD COLUMN IF NOT EXISTS` is MariaDB-specific and the
-- production engine is TiDB (I-02: the same assumption broke 001_baseline
-- before it was caught in the rehearsal).
ALTER TABLE audit_log
  ADD COLUMN sod_bypass TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN deny_reason VARCHAR(40) NULL;

-- "How often did one actor sit on both sides of a control that should need
-- two people, and when?" — one index, one query, no scan of the whole log.
ALTER TABLE audit_log
  ADD INDEX idx_sod (sod_bypass, occurred_at);
