-- ═══════════════════════════════════════════════════════════════════
--  000 — two tables named audit_log
--
--  WHAT THIS IS FOR
--  ────────────────
--  This repository contains two migration systems. `scripts/migrate.js` runs
--  `migrations/` (this chain); `database/migrator.js` runs
--  `database/migrations/` (001_initial … 005_referrals). Production's ledger
--  records the second chain's filenames, so production's schema is the second
--  chain's — including its `audit_log`:
--
--      id bigint · actor_id · actor_role varchar(20) · action varchar(60)
--      target_type · target_id · ip varchar(60) · meta longtext · created_at
--
--  This chain's `audit_log` (006, extended by 008) is a different table that
--  happens to share a name: `id char(36)`, a composite primary key with
--  `occurred_at`, `correlation_id`, `actor_via`, `outcome`, `before_json` /
--  `after_json`, and six indexes.
--
--  Migration 006 opens with `CREATE TABLE IF NOT EXISTS audit_log`, which
--  against production is a SILENT NO-OP — it does not compare shapes, it
--  checks a name. The chain then continues as though its own table were
--  there. Rehearsed against a replica of production, the result was that
--  migration 008 successfully added `sod_bypass` and `deny_reason` to the
--  OTHER table, and then failed on `ADD INDEX idx_sod (sod_bypass,
--  occurred_at)` because `occurred_at` does not exist there.
--
--  That is the failure worth being precise about: not that the chain stops,
--  but that it gets seven migrations in, mutates the live audit table into a
--  shape neither system defines, and stops in the middle.
--
--  WHY THE LEGACY TABLE IS MOVED RATHER THAN CONVERTED
--  ──────────────────────────────────────────────────
--  The two tables do not hold the same information. Converting would mean
--  inventing `correlation_id`, `actor_via` and `outcome` for every historical
--  row, and minting a UUID for each `bigint` id. Fabricating audit records is
--  worse than having none: a reader cannot tell a manufactured value from a
--  recorded one.
--
--  So the old table is kept, whole and unmodified, under a name that says
--  what it is. Its rows remain readable and exportable; what they are not is
--  merged into a history they were never part of. Deciding how long to keep
--  it is the owner's — this migration does not delete anything.
--
--  WHY IT IS NUMBERED 000
--  ─────────────────────
--  It has to run BEFORE 006, or there is nothing left to reconcile — 006 has
--  already no-opped and 008 has already welded two columns onto the wrong
--  table. `scripts/migrate.js` orders by filename, and production has none of
--  this chain applied, so 000 goes first there.
--
--  On a database this chain already built, it sorts among the pending set and
--  runs whenever it runs. That is fine because it is a no-op there, and it is
--  a no-op by inspection rather than by ordering: every step below is
--  conditional on a shape only the other chain produces.
--
--  IDEMPOTENT, AND A NO-OP WHERE THE SCHEMA IS ALREADY CORRECT
--  ──────────────────────────────────────────────────────────
--  The rename happens only where `audit_log` exists AND has no `occurred_at`
--  column — that condition is true only of the other chain's table. On
--  development, CI, and any database this chain built, nothing is renamed and
--  the CREATE below is the usual no-op.
-- ═══════════════════════════════════════════════════════════════════

-- Is the audit_log that is present the OTHER chain's? Only that one lacks
-- `occurred_at`, which this chain's has had since 006 and cannot be without.
SET @legacy_audit := (
  SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = 'audit_log'
) = 1 AND (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'audit_log'
     AND column_name = 'occurred_at'
) = 0;

-- And has it already been moved? Re-running must not stack up copies.
SET @already_moved := (
  SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = 'audit_log_pre_i03'
) > 0;

SET @sql := IF(@legacy_audit AND NOT @already_moved,
  'RENAME TABLE audit_log TO audit_log_pre_i03',
  'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Migration 008 adds these two to whatever `audit_log` it finds. Where that
-- was the legacy table, they are now on `audit_log_pre_i03` — columns the old
-- writer never set and the old readers do not know. Dropped, so the preserved
-- table is exactly what it was.
SET @grafted := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'audit_log_pre_i03'
     AND column_name IN ('sod_bypass', 'deny_reason')
);
SET @sql := IF(@grafted = 2,
  'ALTER TABLE audit_log_pre_i03 DROP COLUMN sod_bypass, DROP COLUMN deny_reason',
  'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- The table this chain means by `audit_log`: 006's definition with 008's two
-- columns and its index already included, because there is no earlier state
-- to migrate from here.
CREATE TABLE IF NOT EXISTS audit_log (
  id                 CHAR(36)     NOT NULL,
  occurred_at        DATETIME(3)  NOT NULL,
  correlation_id     CHAR(36)     NOT NULL,
  actor_principal_id VARCHAR(36)  NULL,
  actor_account_id   VARCHAR(36)  NULL,
  actor_role         VARCHAR(40)  NOT NULL,
  actor_via          ENUM('http','ai','job','system','ops') NOT NULL,
  on_behalf_of       VARCHAR(36)  NULL,
  action             VARCHAR(80)  NOT NULL,
  resource_type      VARCHAR(40)  NOT NULL,
  resource_id        VARCHAR(36)  NULL,
  resource_owner     VARCHAR(36)  NULL,
  outcome            ENUM('permitted','denied','failed') NOT NULL,
  before_json        LONGTEXT     NULL CHECK (JSON_VALID(before_json)),
  after_json         LONGTEXT     NULL CHECK (JSON_VALID(after_json)),
  reason             VARCHAR(500) NULL,
  ip                 VARCHAR(45)  NULL,
  user_agent         VARCHAR(255) NULL,
  sod_bypass         TINYINT(1)   NOT NULL DEFAULT 0,
  deny_reason        VARCHAR(40)  NULL,
  PRIMARY KEY (id, occurred_at),
  KEY idx_resource    (resource_type, resource_id, occurred_at),
  KEY idx_actor       (actor_principal_id, occurred_at),
  KEY idx_correlation (correlation_id),
  KEY idx_action      (action, occurred_at),
  KEY idx_owner       (resource_owner, occurred_at),
  KEY idx_sod         (sod_bypass, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
