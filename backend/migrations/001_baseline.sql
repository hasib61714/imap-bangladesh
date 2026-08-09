-- ═══════════════════════════════════════════════════════════
--  001_baseline
--  Marker migration. The pre-Phase-0.5 schema is defined by
--  backend/schema.sql and by the runtime DDL that several route
--  modules still execute on import.
--
--  This file intentionally contains no DDL. It exists so that an
--  existing database can be stamped as "already at baseline"
--  before 002 runs, and so migration numbering starts at 001.
-- ═══════════════════════════════════════════════════════════

SELECT 1;
