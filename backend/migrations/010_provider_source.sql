-- ═══════════════════════════════════════════════════════════
--  MIGRATION : 010_provider_source
--  PURPOSE   : Make the internal/external workforce distinction a fact the
--              row states, rather than an assumption living in code.
--  DEPENDS   : 009_reliability
--  CLASS     : REVERSIBLE  (one additive, defaulted column)
--  RISK      : LOW. No existing column changes; every existing row takes the
--              default, which is what those rows already are.
--  PRE-CHECK : SELECT column_name FROM information_schema.columns
--                WHERE table_schema = DATABASE() AND table_name = 'providers'
--                  AND column_name = 'provider_source';
--              -- expect zero rows
--  VALIDATE  : column present, NOT NULL, DEFAULT 'external';
--              every existing row reads 'external'.
--  ROLLBACK  : ALTER TABLE providers DROP COLUMN provider_source;
--  STOP IF   : the column already exists with a different type.
--  APPROVAL  : none. It records a distinction the owner has stated; it
--              decides nothing about anybody.
--
--  WHY A COLUMN AND NOT A DERIVED VALUE
--  ------------------------------------
--  IMAP fulfils a need from two workforces: its own employees, and
--  independent providers operating through the platform. A customer must
--  experience one service network; the platform must not.
--
--  The cheaper option was to derive it — "every provider is external until we
--  build employees". That is an assumption in a mapping function, and it is
--  the kind that survives long after it stops being true. A column is a fact
--  the row asserts about itself, and the day IMAP hires a technician the
--  record can say so without a migration.
--
--  WHY 'external' IS THE RIGHT DEFAULT AND NOT A GUESS
--  ---------------------------------------------------
--  Every row in `providers` today arrived through POST /api/providers/apply
--  or through scripts/seedDemo.js. Both are independent providers by
--  construction; IMAP has no internal workforce records at all. So the
--  default states what is already true rather than asserting something new
--  about anyone.
--
--  WHAT THIS COLUMN DOES NOT DO
--  ----------------------------
--  Nothing financial. Payout rules, employment compensation, commission
--  rates, scheduling and reporting all differ by source and NONE of them are
--  decided — D-009 sets the commission rate and is unset, PLATFORM_FEE_PCT
--  defaults to 0 and stays there until somebody with the authority changes
--  it. The column records the distinction so those rules have somewhere to
--  attach; it does not anticipate them.
--
--  It also does not fork the booking model. There is one fulfillment
--  abstraction and `provider_source` is a field on it.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE providers
  ADD COLUMN provider_source ENUM('internal','external') NOT NULL DEFAULT 'external';

-- "How much of the network is our own workforce?" is a question an operator
-- will ask, and the answer should not be a full scan of a growing table.
ALTER TABLE providers
  ADD INDEX idx_source (provider_source, is_approved);
