# IMAP 2.0 — Legacy Schema Disposition

**Status:** IMPLEMENTATION RECORD · **Phase:** 4 / I-02 · **Date:** 2026-08-09
**Required by:** I-02 §13, §14 · **Governed by:** `ENTITY-IMPLEMENTATION-MAP.md`, `DATABASE-IMPLEMENTATION-PLAN.md`

---

## 1. The single authoritative mechanism (§13)

Three sources of schema truth existed. Two are now retired.

| Mechanism | Before I-01 | After I-02 |
|---|---|---|
| **Migrations** | 12 tables; could not build a database alone | **AUTHORITATIVE** — 26 tables, builds from nothing |
| Runtime DDL in modules | 10 statements across 9 locations | **removed** (I-01), and now refused at execution time |
| `backend/schema.sql` | 17 tables; the only definition of most of them | **archived** — executed by nothing |

```
Code  →  Migration  →  Schema
```

`schema.sql` is retained as the record of where the baseline came from. Editing it changes nothing; its header says so. `scripts/initDb.js`, which applied it, is deleted.

**Creating the database itself is now an operator action.** `CREATE DATABASE` is a privilege the application should not hold, and on TiDB Serverless it happens in the console. Setup is: create the database, then `npm run db:migrate`.

### 1.1 Verified, not asserted

| Proof | Result |
|---|---|
| Migrations alone, from an empty database | 26 tables, 19 FKs, 12 categories |
| `001` against a `schema.sql`-built database — **the production shape** | applied; **zero column changes** |
| `001` re-run over an already-migrated schema | tolerated; no failures |
| Column fingerprints of both build paths | **identical** (`a3339ffa…`) |

The second is the one that matters for production: `001` has never been applied there, so it *will* run for the first time, and it must change nothing.

---

## 2. Table disposition

`R` = rows exist in production (assumed — production has not been inspected).
Target owner per `GATE-1-IMPLEMENTATION-MAP.md`.

### Carried into Gate 1

| Legacy table | R | Target | Owner | Disposition | Notes |
|---|:-:|---|---|---|---|
| `users` | ✔ | `principal` + `account` + `membership` + `credential` + `contact_verification` | identity | **MIGRATE (split)** | M-10…M-13. Highest-risk migration; dual-write week |
| `providers` | ✔ | `provider` + `provider_capability` + `provider_coverage` + `provider_price` | marketplace | **MIGRATE** | Needs the human capability mapping (I-09) |
| `categories` | ✔ | `service_category` + `service` + `service_edge` | marketplace | **REWRITE** | One of three conflicting taxonomies |
| `bookings` | ✔ | `booking` + `quote` + `booking_event` | booking | **MIGRATE** | Live data. `otp_code` hashed, then dropped |
| `payments` | ✔ | `payment` + `payment_attempt` + ledger | finance | **MIGRATE** | Financial. Nothing deleted |
| `wallet_transactions` | ✔ | `ledger_transaction` + `ledger_entry` | finance | **MIGRATE** | **Highest risk.** Cannot reconstruct `users.balance` |
| `kyc_docs` | ✔ | `verification_case` + `identity_document` | identity | **MIGRATE** | Bytes leave the database (§31) |
| `reviews` | ✔ | `review` | booking | **KEEP** | Best-implemented flow in the codebase |
| `sos_alerts` | ✔ | `emergency_request` | booking | **KEEP+REFACTOR** | |
| `blood_donors` | ✔ | `donor_consent` + `contact_release` | booking | **MIGRATE** | Consent model is already the target |
| `blood_requests` | ✔ | keep | booking | **KEEP** | Added by `002` |
| `complaints` | ✔ | `dispute` | booking | **MIGRATE** | |
| `chat_messages` | ✔ | `conversation` + `message` | booking | **MIGRATE** | Formalised by `003` |
| `notifications` | ✔ | `notification` | platform | **KEEP+EXTEND** | |
| `provider_schedule` | ✔ | `availability_window` + `availability_hold` | marketplace | **REWRITE — not migrated** | Dateless free-text slots booking never read. Migrating them would migrate the double-booking defect |
| `disaster_reports` | ✔ | `verified_source` | booking | **MIGRATE (reduce)** | D-012 signposting |
| `system_settings` | ✔ | `feature_flag` | platform | **REFACTOR** | Formalised by `003` |
| `push_subscriptions` | ✔ | keep | platform | **KEEP** | Corrected shape; `ensurePushTable()` deleted |
| `area` | — | keep | marketplace | **NEW** (`005`) | Structure only — **no data loaded**, §4 |
| `audit_log` | — | keep | platform | **NEW** (`006`) | I-02 deliverable |
| `schema_migrations` | ✔ | keep | platform | **KEEP** | Runner's own |

### Deferred — retained, not deleted

| Legacy table | R | Disposition | Why retained |
|---|:-:|---|---|
| `microloans` | ✔ | **DEFER (frozen)** | D-011 removes lending from *product scope*. It does not authorise deleting records of money owed to or by real people. Wind-down is a business obligation |
| `promos` | ✔ | **DEFER (frozen)** | Validated but never applied to any price. Rebuild when discounting is a real requirement |
| `loyalty_log` | ✔ | **DEFER (frozen)** | Existing points must be honoured when R-611 ships. Deleting them would silently take balance from real users |
| **`referrals`** | ? | **DEFER — OUTSIDE GATE 1** | §35. Not recreated, not migrated, no referral functionality built. Formalised in `003` only so the table stops being created by a startup callback whose error was swallowed. **Whether production has this table at all is unknown**, because that callback's failure was logged and discarded |
| `refresh_tokens` | ✔ | **REMOVE → replace** | Never read or written by any code path. Replaced by `session` at I-06. Removal is a later migration, not I-02 |

**Nothing in this section is dropped by I-02.** Every destructive step lands a full release cycle after the step it finalises, per `DATABASE-IMPLEMENTATION-PLAN.md` §4.

---

## 3. Data explicitly not touched (§33, §34)

| | |
|---|---|
| `users.balance` | **Untouched.** Not converted, not written off, not migrated to a liability, no opening balance calculated. That decision is the business owner's and is unresolved |
| `wallet_transactions` rows | **Untouched.** Migration M-24/M-25 is not part of I-02 |
| `payments`, `bookings` | **Untouched.** No financial history rewritten |
| `kyc_docs` base64 columns | **Untouched.** M-14 copies to object storage; M-15 nulls them a release cycle later, only after every object is fetched back and byte-compared |
| Production database | **Never contacted** |

---

## 4. `area` is empty on purpose

`005` creates the Bangladesh location hierarchy and loads **nothing**.

`DATABASE-IMPLEMENTATION-PLAN.md` gives M-05 the stop condition *"source is not an official list"*, and no official administrative dataset has been supplied. Inventing division and district rows would be fabricated product data, which Phase 4 §23 prohibits outright, and it is the same class of defect as the unverified hotline numbers still open as R-1009.

`source` and `verified_at` are columns on the table, so provenance travels with the row rather than in a comment. **Loading the data is a separate migration blocked on the owner naming a verified source.**

---

## 5. Privacy classification of what exists now (§30)

| Class | Tables | Consequence at I-02 |
|---|---|---|
| **Public** | `categories`, `area`, `reviews` | none |
| **Internal** | `audit_log`, `system_settings`, `schema_migrations` | audit payloads carry changed fields only; no sensitive values |
| **Private** | `bookings`, `notifications`, `providers`, `blood_requests` | ids only in logs |
| **Sensitive** | `chat_messages`, `push_subscriptions`, `blood_donors`, `disaster_reports` | never in an audit payload |
| **Highly sensitive** | `kyc_docs`, `complaints` | **base64 document bytes still in the database** — the AD-011 violation M-14/M-15 corrects. Not corrected by I-02 |
| **Financial** | `payments`, `wallet_transactions`, `microloans` | untouched |
| **Emergency** | `sos_alerts` | Sealed |
| **Identity** | `users` (credential half), `refresh_tokens` | `refresh_tokens` is dead and replaced at I-06 |

**Open and unresolved:** retention periods. Financial audit records follow statutory retention, which is a legal question nobody has answered (`PHASE-3-READINESS.md` §7). No retention is implemented and none is invented (§32).

---

## 6. Engine compatibility — what is verified, assumed, and unknown (§39)

Rehearsed on **MariaDB 12.2.2**, loopback, disposable. **TiDB verification: BLOCKED** — no TiDB instance exists other than production.

| Feature used | Verified on MariaDB | Assumed compatible | Unknown |
|---|:-:|:-:|:-:|
| `CREATE TABLE IF NOT EXISTS` | ✔ | MySQL 8, TiDB | |
| `INSERT IGNORE` | ✔ | MySQL 8, TiDB | |
| Plain `ADD COLUMN` + tolerated `ER_DUP_FIELDNAME` | ✔ | MySQL 8 | **TiDB error codes not observed** |
| `ENUM` | ✔ | MySQL 8, TiDB | |
| `JSON` columns | ✔ (reported as `longtext` — MariaDB aliases it) | MySQL 8 has a native type | **TiDB behaviour not observed** |
| Composite `PRIMARY KEY (id, occurred_at)` | ✔ | MySQL 8, TiDB | |
| Self-referencing FK (`area`) | ✔ | MySQL 8 | **TiDB FK support is version-dependent** |
| `ON DELETE CASCADE` / implicit `RESTRICT` | ✔ | MySQL 8 | **TiDB FK enforcement** |
| Prefix index `(endpoint(255))` | ✔ | MySQL 8 | |
| `DATETIME(3)` | ✔ | MySQL 8, TiDB | |
| **`ADD COLUMN IF NOT EXISTS`** | MariaDB only | — | **MySQL 8 REJECTS IT** — found in `schema.sql`; the portable form is used in `001` |
| RANGE partitioning | not used | — | **deferred pending TiDB verification** |

**Never claim MariaDB PASS equals TiDB PASS.** The CI service container is MySQL 8, which is stricter evidence than MariaDB and still not TiDB.

---

## 7. Findings recorded, not acted on (§48)

| # | Finding | Impact | Recommended phase |
|---|---|---|---|
| F-1 | `schema.sql` used two MariaDB-only `ADD COLUMN IF NOT EXISTS` statements. The I-01 CI job piped it into a MySQL 8 container, so that step would have failed on its first real run | CI would have been red on first push | **Fixed in I-02** — the step no longer applies `schema.sql` |
| F-2 | `003` re-declares `push_subscriptions`, but `002` already creates and corrects it, so `003`'s copy is always a no-op | none — harmless redundancy | leave |
| F-3 | Whether production has a `referrals` table at all is unknown: it was created by a startup callback whose error was logged and swallowed | unknown-state table | check during the I-06 production migration window |
| F-4 | `kyc_docs` still holds base64 document bytes in the database, violating AD-011 | Sealed data in every database backup | **M-14 / M-15**, I-07 |
| F-5 | `bookings.otp_code` is still plaintext | weak completion proof | M-28 / M-29b, I-11 |
| F-6 | `users.balance` is still a mutable authority with no ledger behind it | the defect the ledger exists to remove | I-08, blocked on the opening-balance decision |
| F-7 | Legacy `id` columns are `VARCHAR(36)` with no default and no auto-increment; the application supplies every id | not a defect — but there is no database-side fallback, so an insert that forgets an id fails at runtime rather than being assigned one | note for I-06 onward |

---

## 8. Owner actions arising from I-02

| # | Action | Why |
|---|---|---|
| 1 | Apply the `audit_log` grant: `GRANT INSERT, SELECT` to the application role, and nothing else | Immutability must be enforced by grants, not discipline. The application cannot restrict itself |
| 2 | Name a verified source for the Bangladesh administrative hierarchy | `area` is empty until then, and discovery filtering depends on it |
| 3 | Decide the retention period per audit record class, including the statutory question for financial records | Nothing is implemented and nothing is invented |
| 4 | Confirm whether production has a `referrals` table (F-3) | Its creation failure was silently discarded |

None of these is an engineering task, and none has been performed.
