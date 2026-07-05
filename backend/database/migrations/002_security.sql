-- 002_security.sql — security-era objects (idempotent)
-- Audit trail + payment purpose + KYC doc_type widening.
-- Safe to run on a DB already built from 001 (no-ops) or an older DB.

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id    VARCHAR(36),
  actor_role  VARCHAR(20),
  action      VARCHAR(60) NOT NULL,
  target_type VARCHAR(40),
  target_id   VARCHAR(80),
  ip          VARCHAR(60),
  meta        JSON,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_action (action),
  INDEX idx_actor  (actor_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

ALTER TABLE payments  ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) DEFAULT 'booking';
ALTER TABLE kyc_docs  MODIFY COLUMN doc_type VARCHAR(30) NOT NULL;
