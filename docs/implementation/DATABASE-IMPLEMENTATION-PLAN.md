# IMAP 2.0 — Database Implementation Plan

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**No migration files are created in this phase.** This is the sequence they will follow.
**Governed by:** `MIGRATION-STRATEGY.md` (incl. Phase 2.75 amendment G1–G4) · `BACKUP-RECOVERY.md` §3.3 · `ENTITY-IMPLEMENTATION-MAP.md`

---

## 1. Starting position

Applied: `001_baseline`, `002_phase05_containment` — **rehearsed on a MySQL-family engine, never applied to production** (`PHASE-2.75-DATABASE-REHEARSAL.md`).

Three facts shape everything below:

1. **`schema.sql` is not a complete description of the database.** Six tables and seven `ALTER`s are executed at module import time, so the production shape depends on load order.
2. **`002` has not been applied to production.** Every plan step assumes it is applied first, and it carries a mandatory read-only pre-check.
3. **`wallet_transactions` cannot reconstruct `users.balance`.** This is not a migration problem to solve; it is a business decision to obtain (§7).

---

## 2. Shape of the sequence

```
002 applied to production  (prerequisite, not part of this plan)
        ↓
M-03 … M-05   Compatibility — retire import-time DDL. Nothing new.
        ↓
M-06 … M-09   Platform — audit, outbox, jobs, idempotency. Additive.
        ↓
M-10 … M-13   Identity — principal/account/membership. Dual-write window.
        ↓
M-14 … M-15   Documents to object storage. IRREVERSIBLE at M-15.
        ↓
M-16 … M-19   Service graph.  VERY HIGH — human mapping.
        ↓
M-20 … M-22   Provider, coverage, availability.
        ↓
M-23 … M-26   Ledger.  VERY HIGH — opening balances need sign-off.
        ↓
M-27 … M-29   Booking, quote, payment.
        ↓
M-30 … M-31   Emergency, messaging.
        ↓
M-32 … M-34   Cutover, legacy read-only, cleanup.
```

**Rule from `MIGRATION-STRATEGY.md` §4 that governs every step:** additive first, backfill second, switch reads third, stop writes fourth, drop last — with a full release cycle between "stop writes" and "drop".

---

## 3. Migration register

`REV` reversible · `IRR` irreversible · `DES` data-destructive · `BUS` business-decision dependent.
Risk is the risk of *running* it.

### Compatibility — retire import-time DDL

| ID | Purpose | Deps | Preconditions | Transformation | Validation | Rollback | Risk | Stop condition |
|---|---|---|---|---|---|---|---|---|
| **M-03** | Formalise `system_settings`, `chat_messages`, `disaster_reports`, `push_subscriptions` as migrations | 002 | snapshot | `CREATE TABLE IF NOT EXISTS` matching what the modules create | shape matches the module's DDL byte for byte | drop the ones that did not pre-exist | **REV** · Low | any column type differs from what the module creates |
| **M-04** | Formalise the 7 import-time `ALTER`s (`blood_donors` ×3, `promos` ×3, `users` ×1) | M-03 | — | idempotent `ADD COLUMN IF NOT EXISTS` | column set matches | drop added columns | **REV** · Low | — |
| **M-05** | Add `area` hierarchy + reference data | M-03 | — | create + load Division/District/Upazila/Area | row counts match the official source | drop | **REV** · Low | source is not an official list |

After M-05 the import-time DDL is deleted **from the modules in the same commit**. Until then the database has two authorities for its own shape.

### Platform — additive, no existing table touched

| ID | Purpose | Transformation | Validation | Rollback | Risk |
|---|---|---|---|---|---|
| **M-06** | `audit_log`, partitioned monthly | create; **grant `INSERT`,`SELECT` only to the app role** | a `DELETE` from the app role fails | drop | **REV** · Low |
| **M-07** | `outbox_event` | create + `(published_at, id)` index | dispatcher reads it | drop | **REV** · Low |
| **M-08** | `job` | create + `UNIQUE(kind, job_key)` | duplicate enqueue is a no-op | drop | **REV** · Low |
| **M-09** | `idempotency_key`, `feature_flag` | create + `UNIQUE(key, scope)`; migrate `system_settings` rows | replay returns the stored response | drop | **REV** · Low |

**M-06's validation is the important one.** If the application role can `DELETE` from `audit_log`, it is not an audit log. Assert the grant, do not assume it.

### Identity

| ID | Purpose | Deps | Preconditions | Transformation | Validation | Rollback | Risk |
|---|---|---|---|---|---|---|---|
| **M-10** | Create `principal`, `account`, `membership`, `credential`, `session`, `contact_verification` | M-09 | snapshot | create only | — | drop | **REV** · Low |
| **M-11** | Backfill from `users` | M-10 | M-10 verified | 1 principal + 1 consumer account + 1 membership per user; **1 provider account per `providers` row**; credential row **only where `password_hash IS NOT NULL`**; contact verification only where a verification actually occurred | `COUNT(principal) = COUNT(users)`; every `users.role` maps to exactly one membership; **no credential row for any user whose hash is NULL** | truncate the six tables | **REV** · **High** |
| **M-12** | Dual-write window | M-11 | app writes both | — | nightly diff `users` vs `principal` is empty for 7 days | stop dual-write | **REV** · Med |
| **M-13** | Switch reads to `principal`; `users` becomes read-only | M-12 | 7 clean days | app reads new tables | auth, booking, payment smoke tests pass | switch reads back | **REV** · **High** |

**M-11 is where an unsafe legacy credential path is closed.** A user with `password_hash IS NULL` — which migration `002` deliberately created for the compromised admin and the six demo providers — produces **no credential row**. The Phase 0.5 fail-closed rule becomes structural rather than conditional.

### Documents — the first irreversible step

| ID | Purpose | Transformation | Validation | Rollback | Risk |
|---|---|---|---|---|---|
| **M-14** | `verification_case`, `identity_document`; copy base64 → object storage | copy bytes out; write object keys; **source columns untouched** | every case has ≥1 document; **every object fetched back and byte-compared** | drop new tables; originals intact | **REV** · Med |
| **M-15** | Null the four `LONGTEXT` columns in `kyc_docs` | `UPDATE kyc_docs SET front_image = NULL, …` | columns are NULL; documents still fetchable through the signed-URL path | **NONE — restore from snapshot only** | **IRR · DES** · **High** |

**M-15 is separated from M-14 by a full release cycle.** M-14 is a copy; M-15 is a deletion of the only other copy. Running them together means an object-storage misconfiguration discovered after the source is gone. The verification for M-15 is not "the upload returned 200" — it is **fetching every object back and comparing bytes**, done in M-14 and re-asserted before M-15 runs.

### Service graph — VERY HIGH

| ID | Purpose | Deps | Preconditions | Transformation | Validation | Rollback | Risk |
|---|---|---|---|---|---|---|---|
| **M-16** | Create `service_category`, `service`, `service_edge`, `capability`, `service_capability_req` | M-05 | — | create only | — | drop | **REV** · Low |
| **M-17** | Load the **reviewed** taxonomy mapping | M-16 | **human sign-off on the mapping table** | insert services and edges from the approved mapping | every source value is mapped or queued; **none dropped, none guessed** | truncate | **REV** · **High** |
| **M-18** | Map providers to capabilities | M-17 | M-17 signed off | derive `provider_capability` from `service_type_bn/en` via the mapping | every provider has ≥1 capability **or** appears in the review queue | truncate | **REV** · **High** |
| **M-19** | Legacy taxonomy columns read-only | M-18 | 30 days stable | mark `categories`, `providers.service_type_*` read-only | discovery serves only from `service` | resume writes | **REV** · Med |

**Stop conditions for M-17/M-18** (`MIGRATION-STRATEGY.md` G2): more than 5% of providers land in the review queue, **or any provider loses a regulated capability they previously advertised**. The second clause is the one that matters — a silently lost capability means a provider stops receiving work with no explanation, and no metric surfaces it.

**Old columns are retained for one full release cycle.** That is what makes M-19's rollback real rather than theoretical.

### Provider, coverage, availability

| ID | Purpose | Transformation | Validation | Rollback | Risk |
|---|---|---|---|---|---|
| **M-20** | `provider`, `provider_coverage`, `provider_price` | backfill from `providers`; **all existing providers → `listed`** (carrying forward `002`'s grandfathering explicitly) | count matches; every listed provider has ≥1 coverage area | drop | **REV** · Med |
| **M-21** | `availability_window`, `availability_hold` | **create empty.** `provider_schedule` is not migrated | unique partial index on `window_id` while active exists and fires | drop | **REV** · Low |
| **M-22** | `provider_schedule` read-only, then dropped after one cycle | — | no reads in 30 days | restore from snapshot | **DES** · Low |

**M-21 preserves nothing deliberately.** `provider_schedule` holds dateless free-text slots that booking has never read; migrating them would migrate the defect that makes double-booking unpreventable. Providers re-enter availability at first login, which is a 30-second task by design (R-905) — and this must be **communicated before the release**, not discovered.

### Ledger — VERY HIGH, business-decision dependent

| ID | Purpose | Deps | Preconditions | Transformation | Validation | Rollback | Risk |
|---|---|---|---|---|---|---|---|
| **M-23** | `ledger_account`, `ledger_transaction`, `ledger_entry`, `balance_projection` | M-13 | snapshot | create; seed the 10 account kinds | `customer_liability` exists and **no code path issues it** | drop | **REV** · Low |
| **M-24** | Migrate resolvable `wallet_transactions` rows | M-23 | duplicate-`ref_id` pre-check clean | rows with a resolvable counterparty → balanced ledger transactions | every transaction balances; count of migrated + unresolved = source count | delete migrated | **REV** · **High** |
| **M-25** | **Opening balances** | M-24 | **signed business decision (§7)** | one dated opening transaction per account against `platform_opening_equity` | **Σ debits = Σ credits globally and per transaction**; every derived balance equals `users.balance` to the minor unit; total opening liability reported as one number to the signer | delete opening transactions | **IRR · BUS** · **Highest** |
| **M-26** | `users.balance` read-only; nightly reconciliation | M-25 | 30 days of matching | stop writing the column | daily diff derived vs stored is zero | resume writes | **REV** · **High** |

**Stop condition for M-25: any imbalance, at any scale.** Not "within 0.1%". A double-entry ledger that does not balance is not a ledger, and a tolerance turns the one property worth having into a target.

`users.balance` is **retained read-only for a full cycle** and reconciled daily — the check the column could never pass while it was authoritative.

### Booking, quote, payment

| ID | Purpose | Transformation | Validation | Rollback | Risk |
|---|---|---|---|---|---|
| **M-27** | `quote`, `quote_component` | create empty; **no historical quotes are invented** | `booking.quote_id` is nullable *only* for pre-migration rows | drop | **REV** · Low |
| **M-28** | `booking`, `booking_participant`, `booking_event`, `dispute`, `conversation`, `message`, `review` | backfill; **hash `otp_code`**; derive participants; seed one `booking_event` per booking from `created_at` + current state | counts match; every booking has 2 participants; every review still has its booking | drop | **REV** · **High** |
| **M-29** | `payment`, `payment_attempt`, `refund`; **cash payments synthesised** for completed cash bookings (O-02) | backfill | every completed cash booking has a `payment` row with `method = cash` | drop | **REV** · **High** |
| **M-29b** | Drop `bookings.otp_code` | after M-28 verified, one cycle later | plaintext gone; OTP verification still works | restore from snapshot | **IRR · DES** · Med |

M-28 seeds exactly **one** `booking_event` per booking. Inventing a full historical timeline would be fabricating audit data, which is worse than having none.

### Emergency, messaging, cleanup

| ID | Purpose | Risk |
|---|---|---|
| **M-30** | `emergency_request`, `emergency_ack`, `donor_consent`, `contact_release`, `verified_source`, `hotline`; backfill from `sos_alerts`, `blood_donors`, `disaster_reports`. **`hotline` rows load only from a verified source** (R-1009) — an unverified number is not loaded | **REV** · Low |
| **M-31** | Retire `refresh_tokens` (**never read or written**) | **DES** · None |
| **M-32** | `microloans`, `promos`, `loyalty_log` → read-only, **retained** | **REV** · Low |
| **M-33** | Drop legacy taxonomy columns, `provider_schedule`, `wallet_transactions` — **one cycle after M-19/M-22/M-26** | **IRR · DES** · Med |
| **M-34** | Drop `users` columns superseded by identity tables | **IRR · DES** · Med |

**M-32 keeps loan data.** D-011 removes lending from *product scope*; it does not authorise deleting records of money owed to or by real people. Wind-down is a business obligation (`PHASE-3-READINESS.md` §7), and deleting the data would make it impossible to discharge.

---

## 4. Classification summary

| Class | Migrations | Rule |
|---|---|---|
| **REVERSIBLE** | M-03…M-14, M-16…M-21, M-23, M-24, M-26…M-29, M-30, M-32 | Rollback tested in rehearsal before production |
| **IRREVERSIBLE** | M-15, M-25, M-29b, M-33, M-34 | Verified snapshot mandatory; ≥1 release cycle after the step it finalises |
| **DATA-DESTRUCTIVE** | M-15, M-22, M-29b, M-31, M-33, M-34 | Human approval per run; **the data is verified present elsewhere first** |
| **BUSINESS-DECISION DEPENDENT** | **M-25** | Blocked until §7 is signed |

**No migration deletes data to make the new schema cleaner.** Every destructive step either (a) removes a duplicate whose replacement has been byte-verified, or (b) removes a column proven unread for 30 days.

---

## 5. Per-migration required contents

Every file carries this header. A migration without it does not merge.

```sql
-- MIGRATION : M-nn_name
-- PURPOSE   :
-- DEPENDS   :
-- CLASS     : REVERSIBLE | IRREVERSIBLE | DATA-DESTRUCTIVE | BUSINESS-DECISION
-- RISK      : LOW | MEDIUM | HIGH | VERY HIGH
-- PRE-CHECK : (read-only SQL that must return the expected result)
-- VALIDATE  : (SQL asserting success)
-- ROLLBACK  : (SQL, or "SNAPSHOT ONLY")
-- STOP IF   :
-- APPROVAL  : (role that must sign; blank if none)
```

The `PRE-CHECK` is not optional. `002`'s duplicate-`ref_id` case (`PHASE-2.75-DATABASE-REHEARSAL.md` §4.2) is the pattern: a migration that fails closed on unexpected data is correct, and the pre-check is what turns a failed deploy into a planned conversation.

---

## 6. Execution rules

1. **Rehearse on a restored production copy first.** For M-17, M-18, M-25 this is mandatory, not recommended — their risk is in the data, not the DDL.
2. **Verified snapshot before every MEDIUM+ migration.** Verified means restorable, not "the call returned success" (`BACKUP-RECOVERY.md` §3.3).
3. **One migration per deploy** for HIGH and above.
4. **Never fix forward on production.** A failed migration stops; the fix is rehearsed, then re-run.
5. **`--status` before every run.** Genuinely read-only since Phase 2.75.
6. **`IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION=<db>` for every production run**, one invocation at a time.
7. Record the outcome — duration, rows affected, anomalies — in `PHASE-2.75-DATABASE-REHEARSAL.md` §7.

### Timing is unknown

The rehearsal ran against **17 empty tables**. It says nothing about how long `CREATE UNIQUE INDEX` or `ALTER TABLE` takes on production row counts, and TiDB's online DDL behaviour has not been observed. **Measure on the restored copy; do not extrapolate from the rehearsal.**

---

## 7. The decision that blocks M-25

Some portion of the current `users.balance` total is the **500.00 credited free at signup** — money that was never paid in, with no ledger entry behind it.

| Option | Consequence |
|---|---|
| Treat it as a platform liability | The platform states it owes real money it never received |
| Write it off | Balance disappears from real users' accounts |
| Honour it as promotional credit | Requires the same legal review as D-010 |

**Engineering can compute the number. Engineering cannot choose.** The decision, its amount and its date must be recorded before M-25 runs; the migration references that record.

Until then, M-01 through M-24 proceed. M-25 onward does not.

---

## 8. What this plan deliberately does not do

| Not done | Why |
|---|---|
| Big-bang cutover | Every step is separately deployable and reversible where it can be |
| Delete anything at Gate 1 that could be needed | Destructive steps land a cycle later, after 30 days of proven non-use |
| Migrate `provider_schedule` | The data encodes the double-booking defect |
| Invent historical timelines or quotes | Fabricated audit data is worse than absent audit data |
| Delete loan or promo records | D-011 removes product scope, not the obligation |
| Assume TiDB behaves like the rehearsal engine | `PHASE-2.75-DATABASE-REHEARSAL.md` §5 |
