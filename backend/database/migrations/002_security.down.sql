-- Rollback 002_security
DROP TABLE IF EXISTS audit_log;
ALTER TABLE payments DROP COLUMN IF EXISTS purpose;
-- doc_type left as VARCHAR(30) (widening is non-destructive; no safe automatic revert).
