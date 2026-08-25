-- ═══════════════════════════════════════════════════════════
--  002_phase05_containment
--  Phase 0.5 — security, financial and emergency containment.
--  See docs/audit/PHASE-0.5-CONTAINMENT-PLAN.md §3
--
--  Every statement is written to be safe to re-run.
-- ═══════════════════════════════════════════════════════════

-- ── P1-10: wallet ledger rejected every 'topup' row AFTER the
--          balance had already been credited. Widen the enum so
--          the ledger can record what actually happens.
ALTER TABLE wallet_transactions
  MODIFY COLUMN type ENUM('credit','debit','topup','refund','payout','withdrawal') NOT NULL;

-- ── P0-5 / P0-6 / P0-12: database-level idempotency for money.
--    ref_id carries a deterministic key such as
--    'booking:<id>:payout' or 'loan:<id>:disburse'.
--    NULL is still allowed many times (legacy rows).
CREATE UNIQUE INDEX uniq_wallet_ref ON wallet_transactions (ref_id);

-- ── P1-9: routes accept birth_cert / driving_license but the
--          column enum did not contain them, so those submissions
--          failed at INSERT with a generic 500.
ALTER TABLE kyc_docs
  MODIFY COLUMN doc_type ENUM('nid','driving','passport','birth','birth_cert','driving_license') NOT NULL;

-- ── P1: push_subscriptions.user_id was INT while users.id is a
--        VARCHAR(36) UUID, so every subscription was stored against
--        user 0 and push never delivered.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL,
  endpoint   VARCHAR(600) NOT NULL,
  `keys`     JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ep (endpoint(255))
) ENGINE=InnoDB;

ALTER TABLE push_subscriptions MODIFY COLUMN user_id VARCHAR(36) NOT NULL;

DELETE FROM push_subscriptions
  WHERE user_id NOT IN (SELECT id FROM users);

-- ── P1-7: provider applications were publicly listed immediately
--          while the applicant was told review takes 24-48 hours.
--          Existing providers are grandfathered so the live
--          directory does not empty on deploy.
ALTER TABLE providers ADD COLUMN is_approved TINYINT(1) NOT NULL DEFAULT 0;

UPDATE providers SET is_approved = 1;

-- ── P0-10: demo rows must never be readable as verified
--           real-world data in production.
ALTER TABLE blood_donors ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0;

UPDATE blood_donors SET is_demo = 1 WHERE user_id IS NULL;

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

ALTER TABLE disaster_reports ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0;

UPDATE disaster_reports SET is_demo = 1
  WHERE user_id IS NULL AND reporter_name IS NULL;

-- ── P0-10: blood requests were written to a log line and then
--           answered with "Request sent to available donors".
--           Persist them so the claim can eventually be true.
CREATE TABLE IF NOT EXISTS blood_requests (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      VARCHAR(36),
  requester    VARCHAR(120) NOT NULL,
  blood_group  VARCHAR(6) NOT NULL,
  contact      VARCHAR(40),
  message      VARCHAR(500),
  area         VARCHAR(120),
  status       ENUM('received','dispatched','fulfilled','cancelled') NOT NULL DEFAULT 'received',
  dispatched_at TIMESTAMP NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_group  (blood_group),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ── P0-9: the seeded administrator's bcrypt hash and its plaintext
--          are both published in this repository, so the credential
--          is compromised. Null the hash: combined with the P0-1 fix,
--          a NULL hash can no longer authenticate at all.
--          Re-bootstrap with: node scripts/resetAdmin.js
UPDATE users
   SET password_hash = NULL
 WHERE id = 'admin-001'
   AND password_hash = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

-- ── P0-9: demo provider accounts were seeded with the shared
--          password 'demo1234'. The salt differs per seed run so the
--          hash cannot be matched; these reserved demo phone numbers
--          are neutralised instead. Fails closed — the accounts
--          survive, they simply cannot password-authenticate.
UPDATE users
   SET password_hash = NULL
 WHERE role = 'provider'
   AND phone IN ('01700000001','01700000002','01700000003',
                 '01700000004','01700000005','01700000006');

-- ── Free money at signup: every account was created with a
--    spendable balance of 500.00 and no ledger entry.
ALTER TABLE users
  MODIFY COLUMN balance DECIMAL(12,2) NOT NULL DEFAULT 0.00;
