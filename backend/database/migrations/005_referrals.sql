-- 005_referrals.sql — referral tracking (idempotent)
-- Previously created only by boot-time DDL in server.js; moved here so the
-- migration set is the single, complete source of truth for the schema.

CREATE TABLE IF NOT EXISTS referrals (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  referrer_id VARCHAR(36) NOT NULL,
  referred_id VARCHAR(36) NOT NULL,
  status      ENUM('pending','active') DEFAULT 'pending',
  bonus_paid  DECIMAL(10,2) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ref (referrer_id, referred_id)
) ENGINE=InnoDB;
