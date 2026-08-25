# IMAP 2.0 — Phase 2.75 Database Rehearsal Record

**Status:** EXECUTED · **Phase:** 2.75 · **Date:** 2026-08-09
**Supersedes the blocked state in:** `docs/audit/PHASE-2.5-DATABASE-VERIFICATION.md`
**Result:** migrations rehearsed successfully on a MySQL-family engine · **TiDB verification still outstanding**

---

## 1. Result

```
REHEARSAL          : PASS   (MariaDB 12.2.2, isolated, disposable)
TiDB VERIFICATION  : NOT PERFORMED — no TiDB instance other than production exists
PRODUCTION         : NOT CONTACTED
```

Phase 2.5 recorded database verification as BLOCKED on the basis that no isolated engine existed. **That finding was incomplete.** `mysql` and `mysqld` are not on `PATH` on this machine, which is what Phase 2.5 checked, but a MariaDB 12.2 service is installed and running, and its server binaries are present. A disposable instance was therefore available the whole time.

---

## 2. The instance, and why it is provably isolated

A **second, temporary** server was started. The machine's existing MariaDB service was never touched.

```
engine        MariaDB 12.2.2  (MySQL wire protocol, client 15.2)
binary        C:\Program Files\MariaDB 12.2\bin\mysqld.exe
host : port   127.0.0.1 : 3399          (the installed service uses 3306)
datadir       <session scratchpad>/rehearsal-db/data
credential    fresh root, no shared password with anything
process       separate; started and stopped within this phase
```

| Isolation property | Evidence |
|---|---|
| Distinct host from production | `127.0.0.1` vs `gateway01.ap-northeast-1.prod.aws.tidbcloud.com` |
| Distinct port from the installed service | 3399 vs 3306 |
| Distinct data directory | initialised empty in the session scratchpad |
| No shared credential | initialised fresh; production credentials never supplied |
| Disposable | deleting the data directory affects nothing else |
| Contents at start | `information_schema, mysql, performance_schema, sys, test` — no application data |

Every command was executed with an explicit pre-flight assertion that the resolved target was `127.0.0.1:3399`, aborting otherwise. `dotenv` does not override variables already present in the environment, which is what made the override reliable — and that was verified, not assumed.

---

## 3. What was executed

| # | Step | Result |
|---|---|---|
| 1 | Initialise a disposable datadir | ok |
| 2 | Start the instance; confirm version, port, datadir, database list | ok |
| 3 | Apply `schema.sql` | ok — 17 tables |
| 4 | `migrate.js --status` on a virgin database | **defect reproduced** — see §4.1 |
| 5 | `migrate.js` — apply `001` and `002` | **ok — all 17 statements of `002` succeeded** |
| 6 | Re-run — runner idempotency | ok — "Nothing to migrate" |
| 7 | Schema assertions against `information_schema` | ok — all 9 |
| 8 | Re-run `002` over an already-migrated schema | ok — 4 statements tolerated |
| 9 | `002` against duplicate non-NULL `ref_id` | **fails closed, correctly** — §4.2 |
| 10 | `002` against many NULL `ref_id` | ok — NULLs do not collide |
| 11 | Recovery: de-duplicate, re-run | ok |
| 12 | Phase 0.5 regression suite | 31/31 |
| 13 | Full suite after the Phase 2.75 changes | 59/59 |

### 3.1 Schema assertions (step 7)

| Assertion | Observed |
|---|---|
| `wallet_transactions.type` widened | `enum('credit','debit','topup','refund','payout','withdrawal')` |
| `uniq_wallet_ref` exists and is UNIQUE | `non_unique = 0` on `ref_id` |
| `kyc_docs.doc_type` widened | includes `birth_cert`, `driving_license` |
| `push_subscriptions.user_id` corrected | `varchar(36)` — was `INT` against a UUID |
| `providers.is_approved` | `tinyint(1) NOT NULL DEFAULT 0` |
| `blood_donors.is_demo` | present |
| `users.balance` default | `0.00` — was `500.00` |
| New tables | `blood_requests`, `disaster_reports`, `push_subscriptions`, `schema_migrations` |
| `schema_migrations` | `001_baseline`, `002_phase05_containment` |

---

## 4. Defects found by executing rather than reading

Three of these were invisible to two prior read-only reviews.

### 4.1 `--status` wrote DDL to the database it was asked to inspect

Reproduced exactly:

```
schema_migrations exists before --status: 0
$ node scripts/migrate.js --status
· pending  001_baseline
· pending  002_phase05_containment
schema_migrations exists AFTER --status: 1     ← DDL written by a read-only command
```

This is why Phase 2.5 could not even inspect production safely. **Fixed** in Phase 2.75: `--status` now probes `information_schema` and reports an uninitialised database instead of initialising it. Pinned by an integration test that asserts the table still does not exist afterwards.

### 4.2 `002` aborts on duplicate ledger references — and that is correct

```
[02] CREATE UNIQUE INDEX uniq_wallet_ref ON wallet_transactions (ref_id) ✗
❌ Migration 002_phase05_containment failed at statement 2
```

`ER_DUP_ENTRY` is not in the tolerated set, so the migration stops and does not stamp itself. Verified that **no ledger row was destroyed**. This is the right behaviour — the alternative would be a migration that silently discards financial records to satisfy a constraint.

It is also a **production prerequisite**. Run this first, read-only:

```sql
SELECT ref_id, COUNT(*) AS n
  FROM wallet_transactions
 WHERE ref_id IS NOT NULL
 GROUP BY ref_id HAVING COUNT(*) > 1;
```

Any row returned is a pre-existing double-credit — a P0-5/P0-6 occurrence that already happened. Each must be reconciled by a human before `002` can apply, and the reconciliation is a financial decision, not a migration step.

Confirmed separately: many NULL `ref_id` rows do **not** collide, so legacy rows do not block the index.

### 4.3 `schema.sql` hardcoded the production database name

The file opened with:

```sql
CREATE DATABASE IF NOT EXISTS imap_db …;
USE imap_db;
```

so every table landed in a database called `imap_db` **regardless of `DB_NAME`, and regardless of which database the client had selected**. Discovered by applying it to a database named `imap_rehearsal` and finding 17 tables in `imap_db` instead.

Same class of defect as V-01: a hardcoded production identifier overriding an operator's explicit choice. **Fixed** — the target is now the connection's database; `initDb.js` creates and selects `DB_NAME` first. Pinned by an integration test.

### 4.4 A failed migration leaves partial state

Statement 01 committed before statement 02 failed. MySQL-family engines do not roll DDL back, so this is inherent rather than a bug — but it means a failed migration leaves a partially-migrated schema. Re-running is safe because of the tolerated-error set (verified in step 8). **Requirement:** a pre-migration snapshot (`BACKUP-RECOVERY.md` §3.3), because "re-run after fixing the data" is only safe when the data can be restored if the fix is wrong.

---

## 5. What this rehearsal does NOT establish

Stated plainly, because the distinction is the difference between a claim and a fact.

**MariaDB 12.2 is not TiDB.** TiDB targets MySQL 8.0 compatibility; MariaDB diverged from MySQL after 5.7. A successful MariaDB run demonstrates that these migrations are valid, ordered, re-runnable, and correct in their data effects. It does not demonstrate TiDB behaviour.

| Verified by this rehearsal | Not verified — needs TiDB |
|---|---|
| SQL parses; statements are correctly ordered | TiDB DDL semantics (online, asynchronous) |
| Every statement succeeds on a schema-accurate database | TiDB `ALTER TABLE` behaviour at production row counts |
| Column types, enums, indexes reach the intended state | TiDB unique-index build on a large existing table |
| Re-running is safe; tolerated codes are the right ones | TiDB error codes matching the tolerated set |
| Duplicate data fails closed without loss | Lock and availability impact during the ALTER |
| `--status` is read-only | Timing — a rehearsal on 17 empty tables says nothing about duration |
| Migration runner idempotency | TiDB `JSON` column behaviour |
| 59/59 application tests | Behaviour under production concurrency |

**The tolerated error codes deserve specific attention.** `ER_DUP_FIELDNAME`, `ER_DUP_KEYNAME`, `ER_TABLE_EXISTS_ERROR` and `ER_CANT_DROP_FIELD_OR_KEY` are MySQL codes; MariaDB emits them, and TiDB is documented as MySQL-compatible, but this has not been observed on TiDB. If TiDB returns a different code, a re-run would abort instead of tolerating — safe, but it would look like a failure.

---

## 6. Status of migration `002`

| Question | Answer |
|---|---|
| Syntactically valid? | **yes** — executed |
| Reaches the intended schema? | **yes** — asserted |
| Safe to re-run? | **yes** — demonstrated |
| Destructive on unexpected data? | **no** — fails closed, verified |
| Verified against TiDB? | **no** |
| Applied to production? | **no** |
| Safe to apply to production? | **conditionally** — see §7 |

`002` has moved from *never executed anywhere* to *executed, asserted and stress-tested on a MySQL-family engine*. That is a material change in confidence. It is not TiDB verification.

---

## 7. Production application procedure

Not performed. For the owner, when ready.

```
1.  Read-only pre-check: the duplicate ref_id query in §4.2.
    Any result → stop; reconcile with a human first.
2.  Verified backup / snapshot (BACKUP-RECOVERY.md §3.3).
    Verify it is restorable, not merely that it was created.
3.  Set APP_ENV=production and DATABASE_ENV=production.
4.  node scripts/migrate.js --status
    Now genuinely read-only. Expect both migrations pending, or 001 applied.
5.  If the schema predates 002 but already matches baseline:
      node scripts/migrate.js --stamp 001_baseline
6.  IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION=imap_db node scripts/migrate.js
7.  Re-run the §3.1 schema assertions against production.
8.  Confirm the compromised admin hash is NULL
    (CREDENTIAL-INCIDENT.md §2.1) — this is what step 6 is for.
9.  Application smoke test: login, booking, payment initiation, wallet read.
10. Record the outcome in this file.
```

Expect step 6 to take longer than the rehearsal. `CREATE UNIQUE INDEX` and three `ALTER TABLE`s on tables with production row counts are the slow statements; TiDB performs DDL online, but the duration is unknown because it has not been measured.

---

## 8. Effect on Phase 2.5 findings

| Finding | Was | Now |
|---|---|---|
| **V-02** — no rehearsal environment | FAIL | **PARTIALLY CLOSED.** A rehearsal environment exists and has been used. TiDB-specific rehearsal and the two VERY HIGH steps still require a restored copy of production |
| Database verification | BLOCKED | **REHEARSED, NOT TiDB-VERIFIED** |
| `--status` not read-only | open | **CLOSED** |
| `002` unverified | open | **REHEARSED** — TiDB outstanding |

The instance was destroyed at the end of the phase. Recreating it takes about a minute; the procedure is in `ENVIRONMENT-ARCHITECTURE.md` §7.
