-- 003_refresh_tokens.sql — rotation columns (idempotent)
-- Store only the hash; track family + reuse.

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS token_hash  VARCHAR(64);
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id   VARCHAR(36);
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked     TINYINT(1) DEFAULT 0;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by VARCHAR(64);
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS used_at     TIMESTAMP NULL;
ALTER TABLE refresh_tokens MODIFY COLUMN token VARCHAR(512) NULL;

CREATE INDEX idx_rt_token_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_rt_family     ON refresh_tokens (family_id);
