-- ═══════════════════════════════════════════════════════════
--  MIGRATION : 012_active_slot_null_safe
--  PURPOSE   : Close a hole in migration 009's chk_active_slot. An OTP
--              challenge could be `active` and hold no active_slot, which
--              made uniq_active_challenge stop constraining it.
--  DEPENDS   : 011_verification
--  CLASS     : REVERSIBLE  (constraint replacement; one narrow data repair)
--  RISK      : LOW. The repair only touches rows that are already invalid,
--              and it moves them to a fail-closed state.
--  PRE-CHECK : SELECT COUNT(*) AS violating FROM otp_challenge
--                WHERE status = 'active' AND active_slot IS NULL;
--  VALIDATE   : the count above is 0, and
--              INSERT INTO otp_challenge (…, status, active_slot)
--                VALUES (…, 'active', NULL)  is REFUSED.
--  ROLLBACK  : restore 009's constraint text. Nothing else changes.
--  STOP IF   : the pre-check returns a number large enough to suggest this
--              was happening routinely rather than being a latent hole —
--              that would mean OTP single-use was not being enforced by the
--              index, and the repository's own guards need reviewing first.
--  APPROVAL  : none. This restores an invariant that was intended.
--
--  WHAT WENT WRONG
--  ---------------
--  Migration 009 wrote:
--
--      CHECK ((status =  'active' AND active_slot =  '1') OR
--             (status <> 'active' AND active_slot IS NULL))
--
--  A CHECK constraint rejects a row only when it evaluates to FALSE. NULL
--  passes. For a row with `status = 'active'` and `active_slot IS NULL`:
--
--      (TRUE  AND NULL)  → NULL
--      (FALSE AND TRUE)  → FALSE
--      NULL OR FALSE     → NULL      → ACCEPTED
--
--  So the one row shape the constraint existed to prevent was the one shape
--  it let through. And because `uniq_active_challenge (destination_hash,
--  purpose, active_slot)` does not collide on NULLs, two simultaneously
--  active challenges for one destination would also have been accepted —
--  which is the F-9 defect I-05 closed, reachable by a different door.
--
--  Nothing in the codebase writes that shape: `otpRepository` always sets
--  `active_slot = '1'` alongside `status = 'active'`. The hole was latent,
--  and this closes it before something else learns to write the column.
--
--  Found while testing migration 011, which copied 009's constraint shape
--  and inherited the same flaw. Both are fixed with `<=>`, which is
--  null-safe: `NULL <=> '1'` is FALSE rather than NULL, so the constraint
--  rejects. Verified by probe on MariaDB 12.2.2.
--
--  TiDB: UNVERIFIED, the same posture 009 recorded for the original
--  constraint. If TiDB does not enforce CHECK constraints, the repository
--  remains the primary control there and this is defence in depth.
-- ═══════════════════════════════════════════════════════════

-- ── the repair, before the constraint that would refuse the rows ──
--
-- An OTP challenge lives five minutes. A malformed one is expired rather
-- than repaired: setting `active_slot = '1'` could collide with a genuinely
-- active challenge for the same destination, and the fail-closed answer to
-- "is this challenge valid" is no.
UPDATE otp_challenge
   SET status = 'expired', active_slot = NULL
 WHERE status = 'active' AND active_slot IS NULL;

ALTER TABLE otp_challenge DROP CONSTRAINT chk_active_slot;

ALTER TABLE otp_challenge
  ADD CONSTRAINT chk_active_slot CHECK (
    (status =  'active' AND active_slot <=> '1') OR
    (status <> 'active' AND active_slot IS NULL)
  );
