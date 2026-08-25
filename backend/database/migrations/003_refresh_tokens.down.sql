-- Rollback 003_refresh_tokens
ALTER TABLE refresh_tokens DROP INDEX idx_rt_token_hash;
ALTER TABLE refresh_tokens DROP INDEX idx_rt_family;
ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS token_hash;
ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS family_id;
ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS revoked;
ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS replaced_by;
ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS used_at;
