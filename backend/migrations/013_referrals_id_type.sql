-- ═══════════════════════════════════════════════════════════════════
--  013 — referrals stores user ids, and this system's user ids are UUIDs
--
--  WHAT IS WRONG
--  ─────────────
--  On the production database:
--
--      `referrer_id` int NOT NULL,
--      `referred_id` int NOT NULL,
--
--  Every `users.id` in this system is a `VARCHAR(36)` UUID. An INT column
--  cannot hold one, so no referral has ever been recorded, and the only
--  query that reads the table —
--
--      SELECT … FROM referrals r WHERE r.referrer_id = ?      (routes/users.js)
--
--  compares a UUID string against an integer column. That is not an error.
--  MySQL and TiDB coerce the string to a number, a UUID starting with a
--  letter coerces to 0, and the query returns no rows. Every user's referral
--  page shows an empty list of friends and always has, with nothing logged
--  and nothing failing.
--
--  HOW IT GOT THERE, AND WHY MIGRATION 003 DID NOT FIX IT
--  ─────────────────────────────────────────────────────
--  `server.js` used to `CREATE TABLE referrals` on every startup, with the
--  error logged and swallowed — the code that did it is gone, its remains
--  described in the comment at the end of `server.js`. That boot-time DDL
--  declared INT.
--
--  Migration 003 declares the table correctly, but opens with
--  `CREATE TABLE IF NOT EXISTS`, which against a table that already exists
--  is a silent no-op: it compares a name, not a shape. The same sentence
--  applies to `audit_log` and migration 006, which is what migration 000 is
--  about. This is the second instance of one defect.
--
--  SAFE, BECAUSE THE TABLE IS EMPTY
--  ────────────────────────────────
--  It is empty for the reason above — nothing could ever be inserted. The
--  ALTER below therefore converts nothing. It is guarded on the row count
--  anyway: an integer id widened to a string is a string of digits that
--  refers to nobody, and if some other deployment does hold rows here, a
--  human should look at them rather than have them quietly reinterpreted.
--
--  WHAT THIS DOES NOT DO
--  ─────────────────────
--  It does not make the referral feature work. Nothing in the codebase ever
--  INSERTs into this table; `users.referred_by` records who referred whom and
--  this ledger is never written. Building the missing half means deciding
--  what a referral is worth and when it pays out — `bonus_paid` is money —
--  and that is the owner's decision, not a migration's.
--
--  This fixes the column so that when that decision is made, the schema is
--  not also in the way.
-- ═══════════════════════════════════════════════════════════════════

SET @is_int := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'referrals'
     AND column_name IN ('referrer_id', 'referred_id')
     AND data_type IN ('int', 'bigint', 'smallint', 'mediumint')
);

-- Empty by necessity, but stated as a condition rather than assumed. The
-- table is guaranteed to exist here: migration 003 creates it unconditionally
-- and migrations run in order.
SET @rows := (SELECT COUNT(*) FROM referrals);

SET @sql := IF(@is_int = 2 AND @rows = 0,
  'ALTER TABLE referrals
     MODIFY referrer_id VARCHAR(36) NOT NULL,
     MODIFY referred_id VARCHAR(36) NOT NULL',
  'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
