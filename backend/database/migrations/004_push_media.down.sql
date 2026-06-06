-- Rollback 004_push_media
DROP TABLE IF EXISTS media_assets;
-- push_subscriptions kept (data-bearing); drop manually if truly required.
