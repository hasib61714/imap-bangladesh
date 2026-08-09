-- ═══════════════════════════════════════════════════════════
--  MIGRATION : 007_identity   (plan id M-10)
--  PURPOSE   : The Gate-1 identity model — principal, account, membership,
--              credential, session, contact_verification.
--  DEPENDS   : 006_audit_log
--  CLASS     : REVERSIBLE  (additive; no existing table is touched)
--  RISK      : LOW for the DDL. The BACKFILL is a separate, higher-risk step
--              and is deliberately not in this migration — see §Backfill.
--  PRE-CHECK : SELECT table_name FROM information_schema.tables
--                WHERE table_schema = DATABASE()
--                  AND table_name IN ('principal','account','membership',
--                      'credential','session','contact_verification');
--  VALIDATE  : six tables; 6 foreign keys; the unique constraints in §Invariants.
--  ROLLBACK  : DROP the six tables. They hold nothing until the backfill runs,
--              and `users` remains authoritative throughout.
--  STOP IF   : any table already exists with a different shape.
--  APPROVAL  : none for the DDL.
--
--  WHAT THIS DOES NOT DO
--  ---------------------
--  It creates no data, changes no existing table, and does not make these
--  tables authoritative. `users.role` remains the live authorization source
--  until the cutover, which is a separate owner-coordinated event
--  (AUTH-MIGRATION-PLAN.md §7 steps 4-9: dual-write, diff, switch reads,
--  rotate JWT_SECRET). Creating the tables early is safe; switching to them
--  is not, and the two are not the same act.
-- ═══════════════════════════════════════════════════════════

-- ── principal — a human ─────────────────────────────────────
-- Replaces the identity half of `users`. The backfill reuses users.id as
-- principal.id: it is the lowest-risk mapping, keeps every existing
-- reference resolvable during the dual-write window, and needs no id
-- translation table. Legacy ids are UUIDv4; new principals get UUIDv7, and
-- src/shared/ids.js#isTimeOrderedId distinguishes them.
CREATE TABLE IF NOT EXISTS principal (
  id         VARCHAR(36) PRIMARY KEY,
  status     ENUM('registered','active','suspended','closed') NOT NULL DEFAULT 'registered',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ── account — a thing a principal acts for ──────────────────
-- `organisation` is defined and unused at Gate 1. It is the seam for the
-- business workspace, present now so that workspace is a membership grant
-- later rather than a schema migration.
CREATE TABLE IF NOT EXISTS account (
  id           VARCHAR(36) PRIMARY KEY,
  kind         ENUM('consumer','provider','organisation') NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  status       ENUM('active','suspended','closed') NOT NULL DEFAULT 'active',
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_kind (kind, status)
) ENGINE=InnoDB;

-- ── membership — principal ↔ account, with a role ───────────
-- This is what retires `users.role`. One person with a consumer account and
-- a provider account has one principal, two accounts, two memberships —
-- which a single mutable role column cannot express at all. Today a provider
-- literally cannot book a service without changing their own role.
--
-- I-03 creates memberships. It grants no permissions: what a role may DO is
-- I-04's authorization kernel.
CREATE TABLE IF NOT EXISTS membership (
  id           VARCHAR(36) PRIMARY KEY,
  principal_id VARCHAR(36) NOT NULL,
  account_id   VARCHAR(36) NOT NULL,
  role         VARCHAR(40) NOT NULL,
  granted_by   VARCHAR(36) NULL,          -- NULL = granted by migration, not by a person
  granted_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at   DATETIME(3) NULL,          -- NULL = currently held
  UNIQUE KEY uniq_membership (principal_id, account_id),
  INDEX idx_principal (principal_id, revoked_at),
  INDEX idx_account   (account_id, revoked_at),
  CONSTRAINT fk_membership_principal FOREIGN KEY (principal_id)
    REFERENCES principal (id) ON DELETE CASCADE,
  CONSTRAINT fk_membership_account FOREIGN KEY (account_id)
    REFERENCES account (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── credential — how a principal proves who they are ────────
--
-- THE NULL-HASH RULE, MADE STRUCTURAL (§9).
--
-- P0-1: /login skipped password verification entirely when password_hash was
-- NULL — true of every account created by OTP or a social provider — so
-- knowing a phone number was enough to obtain that user's token.
--
-- In this model the rule is absence, not a conditional: a principal with no
-- password credential ROW cannot authenticate by password, because there is
-- nothing to look up. The backfill creates no row where users.password_hash
-- is NULL, which is exactly the six demo providers and the compromised
-- administrator that migration 002 nulled.
--
-- Defence in depth is a CHECK. Following DATA-ARCHITECTURE's stated position
-- on AD-002 — TiDB CHECK support varies by version, so the DOMAIN is the
-- primary control and the database check is added where available. The
-- domain expression is a PasswordCredential that cannot be constructed
-- without a bcrypt-shaped hash.
CREATE TABLE IF NOT EXISTS credential (
  id               VARCHAR(36) PRIMARY KEY,
  principal_id     VARCHAR(36) NOT NULL,
  kind             ENUM('password','oauth') NOT NULL,
  -- NULL only for kind='oauth', where there is no secret to hold.
  secret_hash      VARCHAR(255) NULL,
  provider         VARCHAR(40) NULL,       -- 'google'; NULL for password
  provider_subject VARCHAR(191) NULL,      -- the provider's verified `sub`
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at     DATETIME(3) NULL,
  -- One password credential per principal; one link per provider.
  UNIQUE KEY uniq_credential_kind (principal_id, kind, provider),
  -- A provider subject identifies exactly one principal. Without this, two
  -- principals could claim the same Google account.
  UNIQUE KEY uniq_provider_subject (provider, provider_subject),
  INDEX idx_principal (principal_id),
  CONSTRAINT fk_credential_principal FOREIGN KEY (principal_id)
    REFERENCES principal (id) ON DELETE CASCADE,
  CONSTRAINT chk_password_has_hash
    CHECK (kind <> 'password' OR secret_hash IS NOT NULL),
  CONSTRAINT chk_oauth_has_subject
    CHECK (kind <> 'oauth' OR (provider IS NOT NULL AND provider_subject IS NOT NULL))
) ENGINE=InnoDB;

-- ── session — revocable, unlike a bare JWT ──────────────────
-- Replaces `refresh_tokens`, which exists in the schema and is never read or
-- written by any code path.
--
-- The refresh token is stored HASHED. A database read must not yield a
-- usable credential — the same reason password_hash exists.
--
-- Logout becomes a real security event: revoked_at is set server-side, and a
-- revoked session cannot be refreshed. Today logout only deletes a token
-- from the browser, and the JWT remains valid until it expires.
CREATE TABLE IF NOT EXISTS session (
  id                 VARCHAR(36) PRIMARY KEY,
  principal_id       VARCHAR(36) NOT NULL,
  -- Which account this session is acting for. NULL until account switching
  -- exists; it is not "unknown", it is "not yet selected".
  account_id         VARCHAR(36) NULL,
  refresh_token_hash CHAR(64) NOT NULL,     -- SHA-256 hex; never the token
  issued_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at         DATETIME(3) NOT NULL,
  revoked_at         DATETIME(3) NULL,      -- NULL = live
  revoked_reason     VARCHAR(60) NULL,      -- 'logout' | 'rotated' | 'admin' | 'credential_change'
  last_seen_at       DATETIME(3) NULL,
  device             VARCHAR(200) NULL,     -- user-agent, truncated; for the user's own session list
  ip                 VARCHAR(45)  NULL,
  UNIQUE KEY uniq_refresh (refresh_token_hash),
  INDEX idx_principal_live (principal_id, revoked_at, expires_at),
  CONSTRAINT fk_session_principal FOREIGN KEY (principal_id)
    REFERENCES principal (id) ON DELETE CASCADE,
  CONSTRAINT fk_session_account FOREIGN KEY (account_id)
    REFERENCES account (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── contact_verification — proof, not a flag ────────────────
-- `users.verified` is a boolean with no record of WHAT was verified, WHEN, or
-- HOW. Migrating it wholesale into this table would manufacture evidence, so
-- the backfill only creates a row where a verification demonstrably occurred
-- (AUTH-MIGRATION-PLAN.md §5).
--
-- The value is stored hashed: this table records that a channel was proven,
-- and the contact value itself lives on the principal's account. Duplicating
-- it here would spread personal data for no gain.
CREATE TABLE IF NOT EXISTS contact_verification (
  id             VARCHAR(36) PRIMARY KEY,
  principal_id   VARCHAR(36) NOT NULL,
  channel        ENUM('phone','email') NOT NULL,
  value_hash     CHAR(64) NOT NULL,         -- SHA-256 of the normalised value
  method         VARCHAR(40) NOT NULL,      -- 'otp' | 'oauth' | 'otp_legacy'
  verified_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at     DATETIME(3) NULL,
  UNIQUE KEY uniq_contact (principal_id, channel, value_hash),
  INDEX idx_lookup (channel, value_hash, revoked_at),
  CONSTRAINT fk_contact_principal FOREIGN KEY (principal_id)
    REFERENCES principal (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── §Invariants enforced here rather than in application code ──
--
--   uniq_membership        one membership per (principal, account)
--   uniq_credential_kind   one password credential per principal
--   uniq_provider_subject  one principal per provider subject
--   uniq_refresh           a refresh token hash identifies one session
--   uniq_contact           one verification per (principal, channel, value)
--   chk_password_has_hash  a password credential cannot exist without a hash
--   chk_oauth_has_subject  an oauth credential cannot exist without a subject
--
-- The two CHECKs are defence in depth. Their enforcement on TiDB is
-- UNVERIFIED (PHASE-2.75-DATABASE-REHEARSAL.md §5), so the domain layer is
-- the primary control, per DATA-ARCHITECTURE's note on AD-002.

-- ── §Backfill — DELIBERATELY NOT IN THIS MIGRATION ──────────
--
-- DATABASE-IMPLEMENTATION-PLAN.md M-11 backfills these tables from `users`.
-- It is not here, and the reason is risk, not tidiness.
--
-- `npm run db:migrate` is a routine command. M-11 is a HIGH-risk data
-- transformation with preconditions, a duplicate pre-check, a stop condition
-- and a documented dual-write window. Putting it in the chain would make a
-- deliberate operation a side effect of a routine one.
--
-- It is scripts/backfill-identity.js instead: dry-run by default, requires
-- --apply, and requires the production acknowledgement. Its dry run is also
-- the §22 duplicate analysis, which must be read BEFORE anything is written.
