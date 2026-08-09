-- ═══════════════════════════════════════════════════════════
--  MIGRATION : 003_formalise_runtime_tables   (plan id M-03)
--  PURPOSE   : Bring the five tables that route modules create at
--              import time under migration control, so the production
--              schema no longer depends on module load order.
--  DEPENDS   : 002_phase05_containment
--  CLASS     : REVERSIBLE
--  RISK      : LOW
--  PRE-CHECK : SELECT table_name FROM information_schema.tables
--                WHERE table_schema = DATABASE()
--                  AND table_name IN ('system_settings','chat_messages',
--                      'blood_donors','disaster_reports','push_subscriptions');
--              Any subset may already exist; every statement is IF NOT EXISTS.
--  VALIDATE  : all five present; push_subscriptions.user_id is VARCHAR(36).
--  ROLLBACK  : DROP the tables that did not pre-exist. Nothing is dropped
--              by this migration, so a rollback loses no data that
--              existed before it ran.
--  STOP IF   : push_subscriptions.user_id is INT after this migration —
--              see the note under that table.
--  APPROVAL  : none required
--
--  Background. docs/implementation/CURRENT-SYSTEM-INVENTORY.md §4.1 found
--  six modules issuing DDL on import. The shape of the production database
--  therefore depended on which module Node loaded first, and backend/schema.sql
--  was not a complete description of it. The DDL below is copied from those
--  modules unchanged, so applying this migration is a no-op on any database
--  where the modules have already run.
-- ═══════════════════════════════════════════════════════════

-- ── from routes/admin.js — was created on import ────────────
CREATE TABLE IF NOT EXISTS system_settings (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  key_name   VARCHAR(80) NOT NULL UNIQUE,
  val        TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── from routes/chat.js — was created on import ─────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  booking_id  VARCHAR(36) NOT NULL,
  sender_id   VARCHAR(36) NOT NULL,
  sender_role ENUM('customer','provider','admin') DEFAULT 'customer',
  message     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_booking (booking_id)
) ENGINE=InnoDB;

-- ── from routes/blood.js — was created on import ────────────
--    Also present in schema.sql; included so migrations alone are
--    sufficient to build the schema once schema.sql is archived.
CREATE TABLE IF NOT EXISTS blood_donors (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(36),
  name          VARCHAR(120) NOT NULL,
  blood_group   VARCHAR(6) NOT NULL,
  phone         VARCHAR(20) NOT NULL,
  area_bn       VARCHAR(100),
  area_en       VARCHAR(100),
  district      VARCHAR(60),
  is_available  TINYINT(1) DEFAULT 1,
  total_donated INT DEFAULT 0,
  last_donated  DATE NULL,
  latitude      DECIMAL(10,8),
  longitude     DECIMAL(11,8),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── from routes/disaster.js — was created on import ─────────
--    Already created by 002; repeated here for a from-scratch build.
CREATE TABLE IF NOT EXISTS disaster_reports (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(36),
  reporter_name VARCHAR(120),
  type          VARCHAR(60) NOT NULL,
  description   TEXT,
  area          VARCHAR(120),
  severity      ENUM('low','medium','high','critical') DEFAULT 'medium',
  status        ENUM('pending','confirmed','resolved') DEFAULT 'pending',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── from routes/users.js — was created on FIRST USE ─────────
--
--    ⚠ This one is not a straight copy, and the difference matters.
--
--    routes/users.js ensurePushTable() creates:
--        user_id INT NOT NULL          ← wrong: users.id is VARCHAR(36)
--        keys JSON                     ← unquoted; `keys` is reserved
--
--    That is precisely the P1 defect migration 002 corrected: every
--    subscription was stored against user 0 and push never delivered.
--    Because the function is lazy rather than import-time, it would have
--    RECREATED the broken shape on any database where the table did not
--    yet exist — including a fresh one. The corrected shape from 002 is
--    used here, and ensurePushTable() is deleted in the same commit.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL,
  endpoint   VARCHAR(600) NOT NULL,
  `keys`     JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ep (endpoint(255))
) ENGINE=InnoDB;

-- ── from routes/loans.js — was created on import ────────────
--    loans is deferred from Gate 1 (D-011) and its data is retained,
--    not deleted. The table is formalised so the deferred module can be
--    unmounted without the schema changing shape underneath it.
--    Definition copied from schema.sql, which is identical to the one in
--    routes/loans.js except that schema.sql also declares the foreign key.
--    The fuller definition is used so a from-scratch build matches what a
--    schema.sql-built database actually has.
CREATE TABLE IF NOT EXISTS microloans (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL,
  provider_id   VARCHAR(36),
  full_name     VARCHAR(120) NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  purpose       TEXT,
  amount        DECIMAL(12,2) NOT NULL,
  tenure_months INT NOT NULL DEFAULT 12,
  interest_rate DECIMAL(5,2) NOT NULL DEFAULT 9.00,
  loan_score    INT NOT NULL DEFAULT 0,
  status        ENUM('pending','approved','disbursed','rejected','repaid') DEFAULT 'pending',
  admin_note    TEXT,
  reference_no  VARCHAR(20) UNIQUE,
  applied_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at   TIMESTAMP NULL,
  reviewed_by   VARCHAR(36),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user   (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ── from server.js — was created inside the listen() callback ───
--
--    ⚠ Not found by the Phase 3 inventory, which recorded six DDL sites
--    in route modules. server.js itself creates two more on startup.
--    `loyalty_log` is at least declared in schema.sql; `referrals` is
--    declared NOWHERE — not in schema.sql, not in any migration. It has
--    existed only as a string inside a startup callback whose error was
--    logged and swallowed, which means a database where that call failed
--    silently has no referrals table and no record of why.
--
--    Both are deferred from Gate 1 (loyalty and referral are post-Gate-1),
--    and both are formalised here rather than dropped: the data belongs
--    to real users and D-011's precedent applies — deferring a product
--    surface does not authorise deleting its records.
CREATE TABLE IF NOT EXISTS loyalty_log (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL,
  points     INT NOT NULL,
  reason_bn  VARCHAR(200),
  reason_en  VARCHAR(200),
  booking_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS referrals (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  referrer_id VARCHAR(36) NOT NULL,
  referred_id VARCHAR(36) NOT NULL,
  status      ENUM('pending','active') DEFAULT 'pending',
  bonus_paid  DECIMAL(10,2) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ref (referrer_id, referred_id)
) ENGINE=InnoDB;
