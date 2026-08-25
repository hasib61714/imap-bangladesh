-- ═══════════════════════════════════════════════════════════
--  MIGRATION : 006_audit_log   (plan id M-06)
--  PURPOSE   : The append-only audit log. Phase 0 called its absence the
--              largest single gap in the system.
--  DEPENDS   : 005_area_hierarchy
--  CLASS     : REVERSIBLE
--  RISK      : LOW  (additive; no existing table is touched)
--  PRE-CHECK : SELECT COUNT(*) FROM information_schema.tables
--                WHERE table_schema = DATABASE() AND table_name = 'audit_log';
--  VALIDATE  : table present; 5 indexes present; composite PK (id, occurred_at);
--              zero foreign keys.
--  ROLLBACK  : DROP TABLE audit_log — it holds nothing until I-03 writes to it.
--  STOP IF   : the table already exists with a different shape.
--  APPROVAL  : none for the DDL. The GRANT in §Grants is an operator action.
--
--  WHY THIS IS THE FIRST THING BUILT
--  ---------------------------------
--  docs/security/CREDENTIAL-INCIDENT.md §2 has to answer "was the published
--  admin credential used?" with UNKNOWN, and it will say UNKNOWN for that
--  period forever, because no authentication attempt was ever recorded. An
--  audit log does not prevent an incident; it is the difference between
--  knowing what happened and guessing.
--
--  I-02 CREATES THE TABLE ONLY. No writer, no use-case integration. The
--  in-transaction writeAudit() helper and the rule that a state change
--  without an audit record fails the transaction (AD-009) belong to the
--  audit module task; this migration is its substrate.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
  -- UUIDv7. Time-ordered, so the primary key clusters in write order on an
  -- append-only table and does not page-split the way v4 would.
  id                 CHAR(36)     NOT NULL,

  -- When the audited action occurred. This IS the creation time: the record
  -- is written inside the same transaction as the change it records, so a
  -- separate created_at would always equal it and would only create a second
  -- value that could drift. Stored UTC (DATA-ARCHITECTURE rule 10).
  occurred_at        DATETIME(3)  NOT NULL,

  -- Ties one user action across HTTP, events, jobs and (at Gate 2) tool calls.
  -- middleware/requestLogger.js already generates a request id and never uses
  -- it; wiring that in is the writer's job.
  correlation_id     CHAR(36)     NOT NULL,

  -- ── Actor ────────────────────────────────────────────────
  -- NULL only for a genuine system action (a scheduled job with no human
  -- behind it). NULL here means "no human actor", never "unknown actor".
  actor_principal_id VARCHAR(36)  NULL,
  -- Which account they were acting for (AD-017). NULL where the action is
  -- not account-scoped, e.g. authentication before an account is selected.
  actor_account_id   VARCHAR(36)  NULL,
  -- The role AT THE TIME, not looked up later. Roles change; the record must
  -- reflect what was true. NOT NULL — every actor has a role, including
  -- 'anonymous' and 'system'.
  actor_role         VARCHAR(40)  NOT NULL,
  actor_via          ENUM('http','ai','job','system','ops') NOT NULL,
  -- Set when support acts for a user. NULL means the actor acted as themself.
  on_behalf_of       VARCHAR(36)  NULL,

  -- ── What ─────────────────────────────────────────────────
  action             VARCHAR(80)  NOT NULL,   -- 'booking.confirm_completion'
  resource_type      VARCHAR(40)  NOT NULL,   -- 'booking'
  -- NULL for an action with no single resource, e.g. a failed authentication
  -- where the principal was never resolved.
  resource_id        VARCHAR(36)  NULL,
  -- Denormalised so an investigation can ask "everything touching this user's
  -- resources" without joining tables that may since have changed.
  resource_owner     VARCHAR(36)  NULL,

  -- ── Outcome ──────────────────────────────────────────────
  -- 'denied' is recorded for sensitive actions: attempted access matters as
  -- much as successful access.
  outcome            ENUM('permitted','denied','failed') NOT NULL,

  -- CHANGED FIELDS ONLY, never whole rows. A whole-row copy turns this table
  -- into an uncontrolled second copy of the database and drags sensitive
  -- values into a log that is widely readable in operations. Enforced by the
  -- writer, which computes the diff rather than trusting its caller.
  -- NULL means "this action changed no state" (a read, a denial).
  before_json        JSON         NULL,
  after_json         JSON         NULL,

  -- Mandatory for admin overrides and punitive actions (R-1103) — a
  -- suspension with no stated reason is unappealable. Enforced by policy in
  -- the authorization kernel, before the state change, not by this column:
  -- most actions legitimately have no reason.
  reason             VARCHAR(500) NULL,

  -- ── Request context, where policy requires ───────────────
  -- NULL means "not captured for this action", never "unknown". Which
  -- actions capture them is a policy decision that does not exist yet.
  ip                 VARCHAR(45)  NULL,       -- 45 = max IPv6 text length
  user_agent         VARCHAR(255) NULL,

  -- Composite primary key, deliberately.
  --
  -- occurred_at is included so that monthly RANGE partitioning stays possible
  -- without rebuilding the primary key of what will be one of the largest
  -- tables. MySQL-family engines require every unique key to contain the
  -- partition column. Partitioning itself is NOT applied here — see §Retention.
  --
  -- Consequence, stated rather than discovered: `id` alone is not enforced
  -- unique by the database. Its uniqueness comes from UUIDv7 generation. A
  -- UNIQUE KEY on id alone would foreclose partitioning entirely.
  PRIMARY KEY (id, occurred_at),

  -- "What happened to this booking?"
  INDEX idx_resource    (resource_type, resource_id, occurred_at),
  -- "What did this admin do?"
  INDEX idx_actor       (actor_principal_id, occurred_at),
  -- "Trace this request across HTTP, events and jobs."
  INDEX idx_correlation (correlation_id),
  -- "Who read identity documents, and when?"
  INDEX idx_action      (action, occurred_at),
  -- "Everything touching this account's resources."
  INDEX idx_owner       (resource_owner, occurred_at)
) ENGINE=InnoDB;

-- ── NO FOREIGN KEYS. This is deliberate. ────────────────────
--
-- actor_principal_id, resource_id and resource_owner all reference rows that
-- may legitimately be deleted. An FK would force one of two wrong answers:
--
--   ON DELETE CASCADE   an account closure erases its own audit trail — the
--                       subject of an investigation can delete the evidence
--   ON DELETE RESTRICT  the audit log blocks account deletion, and the right
--                       to erasure becomes unimplementable
--
-- AUDIT-LOG-ARCHITECTURE §6: retention outlives the subject. Closure removes
-- the identity data these records point to; the records themselves remain,
-- carrying an id that no longer resolves. That is the correct behaviour and
-- it is only expressible without a foreign key.

-- ── §Grants — AN OPERATOR ACTION, NOT PART OF THIS MIGRATION ──
--
-- Immutability must be enforced by grants, not by discipline. On the
-- production database the application role must hold INSERT and SELECT on
-- audit_log and nothing else:
--
--     REVOKE ALL PRIVILEGES ON <db>.audit_log FROM '<app_user>'@'%';
--     GRANT INSERT, SELECT ON <db>.audit_log TO '<app_user>'@'%';
--
-- This migration does not issue it: the application's own credential cannot
-- restrict itself, and the grant differs per environment. It is listed as an
-- owner action. Until it is applied, immutability rests on the absence of an
-- UPDATE or DELETE path in the repository layer — which is a real control,
-- tested, but a weaker one than a grant.

-- ── §Retention — PARTITIONING DEFERRED ──────────────────────
--
-- AUDIT-LOG-ARCHITECTURE §7 specifies monthly RANGE partitioning so that
-- pruning is a partition drop rather than a mass DELETE.
--
-- It is not applied here. TiDB's partitioning support differs from MySQL's
-- and TiDB shards by region regardless, so a partition scheme chosen against
-- MariaDB and asserted to work on TiDB would be exactly the compatibility
-- claim PHASE-2.75-DATABASE-REHEARSAL.md §5 says not to make.
--
-- The primary key above keeps the option open at no cost today. Applying
-- partitioning later is then an ALTER, not a primary-key rebuild.
--
-- OPEN: retention period per record class. Financial audit records follow
-- statutory retention, which is a legal question that has not been answered
-- (PHASE-3-READINESS.md §7). No retention is implemented and none is invented.
