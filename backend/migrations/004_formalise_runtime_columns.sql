-- ═══════════════════════════════════════════════════════════
--  MIGRATION : 004_formalise_runtime_columns   (plan id M-04)
--  PURPOSE   : Bring the seven ALTER TABLE statements that route modules
--              execute at import time under migration control.
--  DEPENDS   : 003_formalise_runtime_tables
--  CLASS     : REVERSIBLE
--  RISK      : LOW
--  PRE-CHECK : SELECT table_name, column_name FROM information_schema.columns
--                WHERE table_schema = DATABASE()
--                  AND (table_name = 'blood_donors' AND column_name IN
--                         ('last_donated','latitude','longitude'))
--                   OR (table_name = 'promos'       AND column_name IN
--                         ('category','tag','max_discount'))
--                   OR (table_name = 'users'        AND column_name = 'nid_number');
--  VALIDATE  : all seven columns present.
--  ROLLBACK  : ALTER TABLE ... DROP COLUMN for the columns that did not
--              pre-exist. None carries data at the time this runs.
--  STOP IF   : any statement fails with a code outside the runner's
--              tolerated set — that means the column exists with a
--              different type, which is a drift this migration must not
--              paper over.
--  APPROVAL  : none required
--
--  Plain ADD COLUMN is used rather than ADD COLUMN IF NOT EXISTS: the
--  latter is MariaDB/TiDB syntax that MySQL 8 rejects, and the runner
--  already tolerates ER_DUP_FIELDNAME. This matches 002's style.
-- ═══════════════════════════════════════════════════════════

-- ── from routes/blood.js — three defensive ALTERs on import ──
--    Present in schema.sql; the module re-added them for databases
--    predating that column set.
ALTER TABLE blood_donors ADD COLUMN last_donated DATE NULL;
ALTER TABLE blood_donors ADD COLUMN latitude     DECIMAL(10,8) NULL;
ALTER TABLE blood_donors ADD COLUMN longitude    DECIMAL(11,8) NULL;

-- ── from routes/promos.js — three ALTERs on import ───────────
--    promos is deferred from Gate 1 (see docs/implementation/
--    TARGET-REPOSITORY-STRUCTURE.md §6), but the columns are formalised
--    so the table's shape stops depending on whether the module loaded.
ALTER TABLE promos ADD COLUMN category     VARCHAR(50) DEFAULT 'all';
ALTER TABLE promos ADD COLUMN tag          VARCHAR(20) DEFAULT '';
ALTER TABLE promos ADD COLUMN max_discount DECIMAL(10,2);

-- ── from routes/providers.js — one ALTER on import ───────────
--    This one ran unconditionally on every process start, against the
--    most-referenced table in the schema, with its error swallowed.
ALTER TABLE users ADD COLUMN nid_number VARCHAR(30) NULL;
