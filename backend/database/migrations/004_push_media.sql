-- 004_push_media.sql — push UUID fix + media metadata (idempotent)

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL,
  endpoint   VARCHAR(600) NOT NULL,
  `keys`     JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ep (endpoint(255)),
  INDEX idx_ps_user (user_id)
) ENGINE=InnoDB;
ALTER TABLE push_subscriptions MODIFY COLUMN user_id VARCHAR(36) NOT NULL;

CREATE TABLE IF NOT EXISTS media_assets (
  id         VARCHAR(36) PRIMARY KEY,
  owner_id   VARCHAR(36) NOT NULL,
  kind       VARCHAR(30) NOT NULL,
  object_key VARCHAR(512) NOT NULL,
  cdn_url    VARCHAR(800),
  mime_type  VARCHAR(100),
  size       INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ma_owner (owner_id),
  INDEX idx_ma_kind (kind)
) ENGINE=InnoDB;
