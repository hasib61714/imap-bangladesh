-- ═══════════════════════════════════════════════════════════
--  MIGRATION : 009_reliability
--  PURPOSE   : The three tables I-05 needs so that security state stops
--              living in a process: otp_challenge, rate_limit_counter, job.
--  DEPENDS   : 008_authorization_audit
--  CLASS     : REVERSIBLE  (additive; no existing table is touched)
--  RISK      : LOW for the DDL. Cutting the OTP path over to it is a code
--              change in the same phase and is covered by its own tests.
--  PRE-CHECK : SELECT table_name FROM information_schema.tables
--                WHERE table_schema = DATABASE()
--                  AND table_name IN ('otp_challenge','rate_limit_counter','job');
--  VALIDATE  : three tables; uniq_active_challenge, chk_active_slot and
--              uniq_job_idempotency present; rate_limit_counter keyed on
--              bucket_key alone.
--  ROLLBACK  : DROP the three tables. They hold only transient state — an OTP
--              lives five minutes, a rate-limit window an hour, and no
--              business job exists yet.
--  STOP IF   : any of the three already exists with a different shape.
--  APPROVAL  : none.
--
--  WHY THE DATABASE AND NOT REDIS
--  ------------------------------
--  Stated here because the choice is easy to mistake for laziness.
--
--  `GATE-1-ARCHITECTURE.md` §9 is FROZEN and is the implementation boundary
--  for this phase. Its external-dependency table lists TiDB, SSLCommerz, the
--  SMS provider, R2, Socket.io, Web Push and the LLM providers. Redis is not
--  in it. `SYSTEM-ARCHITECTURE.md` §9 places Redis at the 10K scale point —
--  "In-process state -> Redis for cache/OTP/sockets" — and describes 1K as
--  "1 API + 1 worker | None | Correctness, not capacity".
--
--  The architecture has already made this call twice for exactly this class
--  of problem. AD-006 chose a polled outbox TABLE over a broker because it
--  needs "no extra infrastructure". AD-016 chose "a durable job table (same
--  database)" over a hosted queue. AD-010 specifies an idempotency-key TABLE.
--
--  And one thing Redis could not do: an OTP verification must be single-use
--  AND audited, and a rate-limit decision must be recorded. AD-009 requires
--  the record to share the transaction with the change. Two stores cannot
--  share one transaction. Putting this state next to `audit_log` keeps
--  writeAudit(conn, ...) usable.
--
--  Redis remains the documented mechanism for CACHE and the Socket.io
--  adapter (AD-013), neither of which is security state and neither of which
--  I-05 touches. The trigger for revisiting is the one the architecture
--  already names: a second API instance needing shared cache and socket
--  fan-out.
-- ═══════════════════════════════════════════════════════════

-- ── otp_challenge — a one-time code, with a life ────────────
--
-- Replaces the `Map` in utils/otp-store.js (F-9). That Map made a second
-- instance actively incorrect: an OTP issued by instance A did not exist on
-- instance B, so a user hitting the other instance was told their valid code
-- had expired — and the attempt counter, which is the only thing standing
-- between a 6-digit code and a brute force, reset to zero per instance.
--
-- THE CODE IS HASHED (SECURITY-ARCHITECTURE §3), and the honest limit is
-- worth writing down: bcrypt at cost 10 over a 10^6 space is roughly
-- 18 CPU-hours per code, not "unbreakable". What actually protects a
-- six-digit code is `max_attempts` and `expires_at`. The hash is what stops a
-- casual read of this table — an operator glancing at it, a backup, a log
-- dump — from yielding live codes.
CREATE TABLE IF NOT EXISTS otp_challenge (
  id               VARCHAR(36) PRIMARY KEY,

  -- §10: an OTP is bound to a purpose. A code issued to verify a phone
  -- number must not be spendable as a login. The set is closed server-side;
  -- a client-supplied purpose is validated against it, never stored raw.
  purpose          VARCHAR(30) NOT NULL,
  channel          ENUM('phone','email') NOT NULL,

  -- SHA-256 of the NORMALISED destination. The number itself is already on
  -- `users`; duplicating it here would spread personal data into a table
  -- whose whole point is to be short-lived.
  destination_hash CHAR(64) NOT NULL,
  code_hash        VARCHAR(255) NOT NULL,

  -- §11: the principal this challenge is for, resolved SERVER-SIDE at issue
  -- when the destination is already known. NULL means "no account yet",
  -- which is a legitimate registration case — not "unknown principal".
  principal_id     VARCHAR(36) NULL,

  -- §9: the lifecycle, explicit.
  --   active      issued, unspent, unexpired
  --   verified    spent. A verified challenge never verifies again
  --   expired     ran out of time
  --   invalidated superseded, or ended by a security event
  status           ENUM('active','verified','expired','invalidated') NOT NULL DEFAULT 'active',

  attempts         INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts     INT UNSIGNED NOT NULL DEFAULT 5,

  issued_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at       DATETIME(3) NOT NULL,
  -- Resend throttle (SECURITY-ARCHITECTURE §9). Distinct from expires_at:
  -- a code stays valid for five minutes but may not be re-sent for one.
  resend_after     DATETIME(3) NOT NULL,
  consumed_at      DATETIME(3) NULL,

  -- Observability (§32). Never the code, never the destination in clear.
  correlation_id   CHAR(36) NULL,
  ip               VARCHAR(45) NULL,

  -- ── SINGLE ACTIVE CHALLENGE PER (destination, purpose) ────
  --
  -- '1' while the challenge is active, NULL once it is not.
  --
  -- This is the mirror image of the defect migration 007 records. There,
  -- NULLs failing to collide BROKE a constraint: a password credential had
  -- provider IS NULL, so `UNIQUE (principal_id, kind, provider)` permitted
  -- unlimited rows. Here that same property is exactly what is wanted —
  -- spent, expired and invalidated challenges all carry NULL and never
  -- conflict, while two ACTIVE challenges for one destination and purpose
  -- collide and the second insert fails.
  --
  -- Uniqueness therefore holds against a race, not merely against a
  -- read-then-write: two instances issuing simultaneously produce one row and
  -- one ER_DUP_ENTRY, and a resend cannot leave two live codes behind.
  --
  -- A generated column would express this more directly and MariaDB rejects
  -- every conditional form of one (`IF`, `CASE` — error 1901, verified rather
  -- than assumed), so the column is plain and the CHECK below is what stops
  -- it drifting out of step with `status`.
  active_slot      CHAR(1) NULL,
  UNIQUE KEY uniq_active_challenge (destination_hash, purpose, active_slot),

  -- Defence in depth, and the reason a plain column is safe here: a row whose
  -- status and slot disagree cannot be written at all. Enforcement on TiDB is
  -- UNVERIFIED (PHASE-2.75-DATABASE-REHEARSAL.md §5), so the repository is
  -- the primary control — the same posture as `chk_password_has_hash`.
  CONSTRAINT chk_active_slot CHECK (
    (status = 'active'  AND active_slot = '1') OR
    (status <> 'active' AND active_slot IS NULL)
  ),

  INDEX idx_lookup (destination_hash, purpose, status),
  INDEX idx_expiry (expires_at),
  INDEX idx_principal (principal_id, issued_at)
) ENGINE=InnoDB;

-- ── rate_limit_counter — one authority, not one per instance ─
--
-- `express-rate-limit` defaults to a MemoryStore, so the login limiter
-- (20 attempts / 15 min in production) was 20 PER INSTANCE. Two instances
-- meant forty, and the number nobody set was the real limit.
--
-- Fixed windows, keyed by window index, so a bucket is self-expiring and
-- prunable rather than needing a sliding structure. The known trade-off is
-- stated rather than discovered: a caller can spend the limit at the end of
-- one window and again at the start of the next, so the true worst case is
-- 2x the limit across a boundary. For authentication that is the standard
-- trade and it is bounded; a sliding window is a later change to one file.
CREATE TABLE IF NOT EXISTS rate_limit_counter (
  -- scope|dimension|value|window-index. Hashed where the value is personal,
  -- so this table never holds a phone number in clear.
  bucket_key    VARCHAR(191) PRIMARY KEY,
  scope         VARCHAR(40) NOT NULL,
  window_start  DATETIME(3) NOT NULL,
  window_ms     INT UNSIGNED NOT NULL,
  hits          INT UNSIGNED NOT NULL DEFAULT 0,
  -- Set when a limit is exceeded and a cooling-off period applies. NULL
  -- means "counting", not "blocked forever".
  blocked_until DATETIME(3) NULL,
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  -- "Delete everything older than the longest window" is one range scan.
  INDEX idx_window (window_start),
  INDEX idx_scope (scope, window_start)
) ENGINE=InnoDB;

-- ── job — durable background work (AD-016) ──────────────────
--
-- The audit counted 20+ `.catch(() => {})` sites: notifications, push and
-- SMS are fired from inside request handlers and a failure is invisible.
-- This table is the substrate for fixing that. I-05 builds the MECHANISM and
-- registers no business job — §26.
--
-- At-least-once, not exactly-once. A worker can commit a job's effect and
-- die before recording success, and no table can prevent that. The contract
-- is therefore at-least-once delivery with idempotent handlers (§28), which
-- is a promise that can actually be kept.
CREATE TABLE IF NOT EXISTS job (
  id             VARCHAR(36) PRIMARY KEY,
  kind           VARCHAR(60) NOT NULL,
  payload_json   JSON NULL,

  -- §28. Two enqueues of the same logical work collapse into one row.
  --
  -- NULL is the "no natural key" case and NULLs do not collide, so unkeyed
  -- jobs are always distinct — which is correct, and is the third place in
  -- this schema where that property matters. It is deliberate in all three;
  -- migration 007 records the one time it was not.
  idempotency_key VARCHAR(150) NULL,

  -- §27. `dead_letter` is a state, not a separate table: a job that has
  -- exhausted its attempts must stay where an operator will look for it.
  status         ENUM('pending','running','succeeded','failed','dead_letter') NOT NULL DEFAULT 'pending',

  attempts       INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts   INT UNSIGNED NOT NULL DEFAULT 5,
  -- Backoff is expressed as a time, not a sleep. A worker that is holding a
  -- job open while waiting to retry it is a worker that cannot do anything
  -- else, and a process restart loses the wait entirely.
  run_after      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  -- §29. A lease, never a lock: it has an owner and it expires. An infinite
  -- lock plus one crashed worker is a job nobody can ever run again.
  lease_owner      VARCHAR(64) NULL,
  lease_expires_at DATETIME(3) NULL,

  last_error     VARCHAR(500) NULL,
  correlation_id CHAR(36) NULL,

  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  started_at     DATETIME(3) NULL,
  completed_at   DATETIME(3) NULL,
  failed_at      DATETIME(3) NULL,

  UNIQUE KEY uniq_job_idempotency (kind, idempotency_key),
  -- "What can I run right now?"
  INDEX idx_claimable (status, run_after),
  -- "What did a dead worker leave behind?"
  INDEX idx_lease (status, lease_expires_at),
  INDEX idx_kind (kind, status, created_at)
) ENGINE=InnoDB;

-- ── §Invariants enforced here rather than in application code ──
--
--   uniq_active_challenge   one live OTP per (destination, purpose)
--   uniq_job_idempotency    one job per (kind, idempotency key)
--   rate_limit_counter PK   one row per bucket, so the increment is one
--                           atomic statement against one row
--
-- ── §No foreign keys on `job` or `rate_limit_counter` ────────
--
-- Deliberate, and for the same reason as `audit_log`: these reference things
-- that may legitimately disappear. `otp_challenge.principal_id` likewise
-- carries no FK, because `principal` is not populated until the I-03
-- backfill runs and an OTP must work before then.
--
-- ── §Retention ──────────────────────────────────────────────
--
-- All three tables are transient and all three need pruning. No pruning job
-- is registered here: §26 says the mechanism only, and a retention period is
-- a decision (PHASE-3-READINESS.md §7) rather than a default to invent.
-- `idx_expiry`, `idx_window` and `idx_kind` make each prune one range scan
-- when that decision is made.
