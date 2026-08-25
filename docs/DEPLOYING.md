# Deploying

**Read §1 before merging anything.** The order matters, and getting it wrong
takes the marketplace down while the health check still reports green.

---

## 1. Why the order matters

Render is configured with `autoDeploy: true` (`render.yaml`), so a merge to
`main` puts the new backend live within minutes. The new backend queries
`providers.listing_state` and `verification_case`, neither of which exists in
production until migrations **011** and **012** have run.

Reproduced locally against a copy of the current production schema:

```
GET /api/health      200  {"status":"ok","db":{"status":"ok"}}
GET /api/providers   500  Table 'verification_case' doesn't exist
```

The health check passes because it only pings the database. Render sees a
successful deploy, no alarm fires, and the product's front page is down.

**So: migrate first, deploy second.** Migration 011 is additive — it creates
two tables and adds one column — so it is safe to run *before* the code that
uses them. The old code does not reference any of it.

---

## 2. Before you touch production

### GitHub Actions is currently locked

```
The job was not started because your account is locked due to a billing issue.
```

Nothing can be verified or deployed through CI until that is resolved:
`deploy.yml` gates the GitHub Pages publish on `ci.yml` passing, so **the
frontend cannot deploy at all** while Actions is locked. Fix billing at
https://github.com/settings/billing first.

### Measure what the trust gate will hide

`TRUST-ARCHITECTURE.md` §5 makes listing a conjunction, and the directory now
requires a verified identity case. Providers grandfathered by migration 002
(`is_approved = 1`, no KYC) will stop appearing.

Run this **after** migration 011, **before** deploying the backend:

```sql
SELECT
  SUM(is_approved = 1) AS listed_today,
  SUM(is_approved = 1 AND NOT EXISTS (
        SELECT 1 FROM verification_case v
         WHERE v.principal_id = providers.user_id
           AND v.kind = 'identity' AND v.state = 'verified')) AS would_be_delisted
FROM providers;
```

Measured on the replica (production's schema, not its data):
`would_be_delisted` was **0** — migration 011 carries migration 002's
grandfathering into `listing_state`, so an approved provider with no KYC keeps
its listing state. Run the query against production anyway: the replica has
one provider and production has more, and this is a count that only production
can answer.

If `would_be_delisted` is material, that is a business decision, not a
technical one. The options are to run a verification drive first, to verify
the existing providers in bulk (and record honestly in `decision_reason` that
it was a bulk grandfathering rather than a review), or to accept the drop.

---

## 2b. RESOLVED — production is on the *other* migration chain

Measured 2026-08-25, first with `scripts/schema-diff.mjs` and then by
rehearsing the whole thing against a replica.

### What the divergence actually was

This repository contains **two migration systems**:

| runner | directory | ledger records |
|---|---|---|
| `scripts/migrate.js` | `backend/migrations/` | `001_baseline` … `012_…` |
| `backend/database/migrator.js` | `backend/database/migrations/` | `001_initial.sql` … `005_referrals.sql` |

Production's `schema_migrations` records the second list. Those filenames
were not in the repository until main was merged, which is why the lineage
looked unrecognisable. **Production was built by `database/migrator.js`, and
it is seven migrations behind this chain — not on an unknown one.**

### The rehearsal

A replica was built by running the foreign chain into a local database, which
reproduces production's ledger exactly. Running `scripts/migrate.js` against
it — the deploy step — failed in three places, each of which would have
happened to production:

1. **The ledger has a different shape.** `schema_migrations` from the other
   runner has `name` and `checksum` (both `NOT NULL`, no default) where this
   one has `statements`, and declares `version` as `VARCHAR(20)` where
   `003_formalise_runtime_tables` is 28 characters. The first `INSERT` failed
   *after* migration 001 had applied its statements, leaving the database
   changed and the ledger silent about it. `ensureTable()` in
   `scripts/migrate.js` now reconciles a foreign ledger before writing to it.

2. **Two different tables are called `audit_log`.** Migration 006 opens with
   `CREATE TABLE IF NOT EXISTS audit_log`, which against production is a
   silent no-op — it compares a name, not a shape. The chain then continued
   as though its own table were there, and migration 008 **successfully added
   `sod_bypass` and `deny_reason` to the live audit table** before failing on
   an index over a column that does not exist there. Migration
   `000_reconcile_foreign_schema.sql` moves the old table aside as
   `audit_log_pre_i03`, whole and unmodified, and creates the right one.

   The old rows are **not converted**. Doing so would mean inventing
   `correlation_id`, `actor_via` and `outcome` for every historical row and
   minting a UUID per `bigint` id. A fabricated audit record is worse than a
   missing one. How long to keep `audit_log_pre_i03` is the owner's call;
   nothing deletes it.

3. **`media_assets`** exists in production and in no migration — main created
   it. Nothing in this chain touches it, and it survives untouched.

### The result

After those two fixes, against a replica of production's schema:

```
✔ 000_reconcile_foreign_schema … ✔ 012_active_slot_null_safe
schema-diff: The target already matches the migration chain.
smoke:       59 passed  0 failed  0 skipped
```

The smoke suite there covers register → KYC → review → approve → list →
book → pay end to end. `GET /api/providers` returns 200 with data — the
endpoint that returns 500 on an unmigrated database while `/api/health` still
reports green.

### Reproduce it before trusting it

```bash
# 1. build a replica of production's schema (local, disposable)
cd backend
DB_HOST=127.0.0.1 DB_PORT=3399 DB_USER=root DB_PASSWORD=… DB_NAME=imap_db   node -e "require('./database/migrator').runMigrations({log:console.log})"

# 2. run the deploy step against it
APP_ENV=test DATABASE_ENV=test DB_HOST=127.0.0.1 DB_PORT=3399 DB_USER=root DB_PASSWORD=… DB_NAME=imap_db DB_SSL=false   node scripts/migrate.js

# 3. confirm
cd .. && DB_HOST=127.0.0.1 … REF_DB_HOST=127.0.0.1 … node scripts/schema-diff.mjs
```

Note that `database/migrations/001_initial.sql` contains `USE imap_db`, so
that runner ignores `DB_NAME` and always migrates `imap_db`. That is a hazard
in its own right and the reason the replica has to be called `imap_db`.

### Still required before production

- **A backup.** TiDB Cloud can restore to a point in time; this is the moment
  to confirm that.
- **Rehearse on a TiDB branch restored from production**, not only on the
  local replica. The replica reproduces production's *schema*; it does not
  reproduce its *data*, and the differences that matter under real data are
  row counts and the `audit_log` history.
- **Read `audit_log`'s row count first.** The rename is instant on any size,
  but knowing what was preserved is worth recording before it moves.

---

## 3. The sequence

§2b is resolved; what follows assumes its two fixes are deployed — they are
in `scripts/migrate.js` and `migrations/000_reconcile_foreign_schema.sql`.

### 3.1 Migrate production

Take a backup first; TiDB Cloud can restore to a point in time, and this is
the moment you want that to be true.

```bash
cd backend
DB_HOST=<tidb-host> DB_PORT=4000 DB_USER=<user> DB_PASSWORD=<password> \
DB_NAME=imap_db DB_SSL=true \
APP_ENV=production DATABASE_ENV=production \
IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION=imap_db \
  node scripts/migrate.js --status      # read-only: shows what is pending

# then, to apply:
… same variables … node scripts/migrate.js
```

`--status` touches nothing and creates nothing. Run it first. Against
production the pending list will be **all thirteen**, `000_reconcile_foreign_schema`
first — that is expected and is what §2b explains. `000` must be the first
applied; it is numbered to sort there.

Migration 011 also backfills: every `kyc_docs` row becomes a verification
case so there is one review queue rather than two that diverge on the first
decision. It is idempotent — re-running inserts nothing.

Then validate:

```sql
SELECT COUNT(*) FROM verification_case;          -- one per legacy kyc_docs user
SELECT COUNT(*) FROM identity_document;          -- 0 until people submit
SHOW COLUMNS FROM providers LIKE 'listing_state';
SELECT listing_state, COUNT(*) FROM providers GROUP BY listing_state;
```

### 3.2 Set the backend environment

In the Render dashboard, add:

| Key | Value |
|---|---|
| `SSLCOMMERZ_STORE_ID` | your store id |
| `SSLCOMMERZ_STORE_PASSWORD` | your store password |
| `SSL_IS_SANDBOX` | `true` while testing, `false` for live |
| `R2_SEALED_BUCKET` | a bucket with **public access blocked** |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 credentials |

`BACKEND_URL` must already be the public Render URL — the payment IPN is a
server-to-server callback and cannot reach anything private. Without it,
payments complete at the gateway and settle only when the customer happens to
return to the app and reconciliation runs.

Identity documents need the sealed bucket. Without it a production process
**refuses to accept them** rather than writing to a container filesystem that
disappears on the next restart — deliberate, and it means KYC will return 503
until the bucket is configured.

### 3.3 Merge

```bash
gh pr merge 4 --squash        # or merge in the GitHub UI
```

Render redeploys the backend. GitHub Actions builds and publishes the
frontend — once billing is unlocked.

### 3.4 Check it

```bash
curl -s https://imap-backend-mghb.onrender.com/api/health
curl -s https://imap-backend-mghb.onrender.com/api/providers | head -c 200
```

The second one is the check that matters. A 200 with a non-empty
`providers` array means the migration and the deploy agree with each other.

You can also run the smoke suite against production **read paths**, but note
it registers accounts and creates bookings, so do not point it at production
without reading what it does first.

---

## 4. Rolling back

| What | How |
|---|---|
| Backend | Render → Deploys → redeploy the previous commit |
| Frontend | re-run the previous `deploy.yml` run |
| Migration 011 | `DROP TABLE identity_document, verification_case; ALTER TABLE providers DROP COLUMN listing_state;` — additive, so this is clean |
| Migration 012 | restore migration 009's constraint text |
| Migration 000 | `RENAME TABLE audit_log TO audit_log_i03, audit_log_pre_i03 TO audit_log;` — the old table was never modified, so this is exact |
| Ledger reconciliation | nothing to undo: it added a column, widened one, and relaxed two NOT NULLs. No row was changed |

Rolling the code back without rolling the migration back is safe: the old
code does not know those tables exist.

---

## 5. What is not verified

**TiDB — ANSWERED 2026-08-25.** Measured against the production cluster
(`8.0.11-TiDB-v8.5.3-serverless`) with `scripts/migration-preflight.mjs`:

| check | result |
|---|---|
| the DDL is accepted, including `<=>` inside a `CHECK` | pass |
| `chk_reason_when_refused` is enforced | **FAIL — parsed and ignored** |
| `chk_live_slot` is enforced | **FAIL — parsed and ignored** |
| `uniq_live_document` refuses a duplicate live slot | pass |
| NULL slots do not collide | pass |
| `ALTER TABLE … DROP CONSTRAINT` (migration 012) | pass |

**TiDB parses `CHECK` constraints and does not enforce them.** The migrations
apply; the constraints are decorative on this engine.

Survivable, and anticipated — migration 009 already recorded that enforcement
was unverified and that the repository was the primary control. Concretely:

- **R-1103** (a refusal carries a reason) holds at two layers rather than
  three: the policy's `reasonRequired` denies at the kernel and the domain's
  `requireReason` throws. The database will not catch a third-party writer.
- **`live_slot`** integrity rests on `attachDocument` always setting it plus
  `uniq_live_document`, which TiDB *does* enforce. The CHECK was defence in
  depth against a shape the application never writes.
- The same applies to `chk_active_slot` from migration 009 — so **migration
  012, whose whole purpose was correcting that constraint, buys nothing on
  TiDB.** Worth applying for engines where it does; worth knowing it does not
  here.

Do not describe these constraints as controls in a security review. They are
not, on the engine that matters.

Still unmeasured: the query plans for `idx_queue` and the eligibility
`EXISTS` under real data volume.

`scripts/migration-preflight.mjs` settles the first three in one command,
without applying anything:

```bash
DB_HOST=<tidb-host> DB_PORT=4000 DB_USER=<user> DB_PASSWORD=<password> DB_NAME=imap_db DB_SSL=true   node scripts/migration-preflight.mjs
```

It creates one scratch table with a random name, tries to violate each
constraint, drops the table, and reports what the engine actually did. It
never reads, writes or references an application table. Run it against a TiDB
branch first if you can.

A failure there is not a blocker — it means the `CHECK` constraints are
defence in depth on that engine rather than controls, which is the posture
migration 009 already recorded for `chk_active_slot`. What matters is knowing
which it is, rather than assuming.

**The de-listing count.** Measured as 0 on a replica of production's schema
(§2). Unmeasured against production's *data*, which is the number that
decides it.

**Landing-page claims.** "10,000+ satisfied customers", "8,492+ verified
professionals", "98% satisfaction rate", and the named testimonials are
fabricated. They are marketing copy and the owner's to decide, but they are
public claims about a platform that currently has six providers.
