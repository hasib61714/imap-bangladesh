# IMAP 2.0 — Phase 2.5 Database Verification

**Status:** **BLOCKED** · **Phase:** 2.5 · **Date:** 2026-08-09
**Scope:** brief §37–§38 — verify migration `002_phase05_containment.sql` against a real TiDB instance

---

## Result

```
DATABASE VERIFICATION: BLOCKED
Reason: no isolated or disposable database environment could be proven to exist.
Migration NOT executed. No database was contacted.
```

**Nothing was run. No connection was opened. No result is claimed.**

---

## 1. What §37 requires

Execution is permitted **only** against an environment that can be *proven* isolated and disposable. If it cannot be proven, the instruction is explicit: stop, do not execute, do not claim success.

## 2. Environment assessment

| Check | Result | Evidence |
|---|---|---|
| Isolated/test database configured | **No** | No `.env.test`, no `.env.local`, no test DSN anywhere in the repo |
| Local database engine available | **No** | `mysql`, `mysqld` not on PATH |
| Container runtime available | **No** | `docker` not on PATH |
| Database env vars in the session | **No** | `env \| grep -E "^DB_\|^TIDB\|^DATABASE"` returns nothing |
| Any configured database | **Yes — one, and it is production** | `backend/.env` |

### 2.1 The only configured database is production

```
backend/.env                         render.yaml (production)
DB_HOST = gateway01.ap-northeast-1   DB_HOST = gateway01.ap-northeast-1
         .prod.aws.tidbcloud.com              .prod.aws.tidbcloud.com
DB_PORT = 4000                       DB_PORT = 4000
DB_NAME = imap_db                    DB_NAME = imap_db
NODE_ENV = development
```

**Host, port and database name are identical to the deployed production configuration.** The hostname contains `.prod.`.

There is therefore no environment that could be used, and the one that exists must not be.

## 3. What was deliberately not done

| Action | Status |
|---|---|
| `npm run db:migrate:status` | **Not run** — it opens a connection to the configured database, which is production |
| `npm run db:migrate` | **Not run** |
| Any `SELECT`, DDL or DML | **Not run** |
| Reading `DB_PASSWORD` | **Not read** — only non-secret keys were inspected |

Even a read-only status query was withheld: `scripts/migrate.js` calls `ensureTable()`, which executes `CREATE TABLE IF NOT EXISTS schema_migrations` **before** the `--status` branch. `--status` is therefore not read-only, and running it would have written DDL to production.

## 4. Finding V-01 — development environment targets the production database

**Severity: P0 (configuration).** Discovered in Phase 2.5. Not visible to Phase 0, which was a read-only audit of tracked files — `.env` is gitignored and was never read.

### 4.1 The defect

`backend/.env` sets `NODE_ENV=development` while pointing at the production TiDB instance.

Every production safety control added in Phase 0.5 is keyed on `NODE_ENV`. With this configuration, **all of them are disabled while connected to production data**:

| Control (Phase 0.5) | Guard | Effect with this `.env` |
|---|---|---|
| Demo seeder refuses to run | `scripts/seedDemo.js:25` — refuses only if `NODE_ENV === "production"` | **Would seed 6 provider accounts sharing one password into production** |
| Blood demo donors not seeded | `routes/blood.js:38` — returns early only in production | **Would seed fabricated donors into production** |
| Demo rows filtered from reads | `routes/blood.js` / `routes/disaster.js` — `DEMO_FILTER` empty outside production | **Demo rows would be served as real** |
| Disaster demo alerts not seeded | `routes/disaster.js:29` | **Would seed fabricated alerts into production** |
| Payment gateway fails closed | `routes/payments.js:106` — `!isConfigured() && isProd()` | **Mock settlement active → free wallet credit against production** |
| Self-service wallet top-up blocked | `routes/users.js:116` | **Permitted against production** |
| OTP never returned in a response | `routes/auth.js` — `mockOtp` gated on non-production | **OTP returned in API responses** |

### 4.2 Why this matters beyond the migration

P0-9, P0-10 and P0-12 were reported as *fixed* in `PHASE-0.5-SECURITY-REGRESSION.md`. That report is accurate about the code. What Phase 2.5 establishes is that **those fixes are environment-dependent, and the environment currently defeats them.** A developer running `npm run dev` on this machine is running the unguarded code paths against production.

`PHASE-0.5-SECURITY-REGRESSION.md` is not amended — it was correct about what it verified. This finding is recorded here and escalated in `PHASE-2.5-GATE-REPORT.md`.

### 4.3 Recommended containment (not performed — Phase 2.5 modifies nothing)

1. Point `backend/.env` at a separate development database. Nothing else should be done to this machine until that is true.
2. Rotate the TiDB credential, on the assumption that a credential present in a development `.env` has a wider exposure surface than a production secret should.
3. Add a startup guard independent of `NODE_ENV`: refuse to start when the resolved `DB_HOST` matches the production host unless an explicit `IMAP_ALLOW_PRODUCTION_DB=true` is set. `NODE_ENV` alone has now been shown to be an insufficient discriminator.
4. Make `--status` genuinely read-only by moving `ensureTable()` into the apply path.
5. Verify whether the demo seeder has *already* been run against production — check for the reserved phone numbers `01700000001`–`01700000006` and for `is_demo = 1` rows. **This requires a human with authorised access; it is not an engineering task to perform unilaterally.**

## 5. Consequence for the migration

Migration `002_phase05_containment.sql` remains **unverified against any TiDB instance**. It has been carried as an open risk since Phase 0.5 and this phase does not close it.

Additionally: **`MIGRATION-STRATEGY.md` assumes a rehearsal environment that does not exist.** Every step in that document specifies a stop condition and a rollback, and none of them can be exercised. This raises the risk classification of every migration step by one level and is recorded as finding V-02 in `PHASE-2.5-VALIDATION.md`.

## 6. What would unblock this

| Prerequisite | Detail |
|---|---|
| An isolated database | A separate TiDB Serverless cluster, or a local MySQL 8 / TiDB container, with its own credential |
| Proof of isolation | Distinct host **and** distinct database name from production; confirmed by the person who provisioned it |
| Disposability | Destroying it must have no production consequence |
| A restored copy for rehearsal | For the ledger and taxonomy migrations, a copy of production data is needed to rehearse against realistic volume and shape |

Once such an environment exists, the verification procedure is: record engine and version → prove isolation → `--status` → apply → schema assertions → application smoke test → the 31-test regression suite → record results here.

---

**No database was contacted during Phase 2.5.**
