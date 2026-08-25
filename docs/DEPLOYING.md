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

If `would_be_delisted` is material, that is a business decision, not a
technical one. The options are to run a verification drive first, to verify
the existing providers in bulk (and record honestly in `decision_reason` that
it was a bulk grandfathering rather than a review), or to accept the drop.

---

## 3. The sequence

### 3.1 Migrate production

TiDB compatibility for these two migrations is **unverified** — see §5. Take a
backup first; TiDB Cloud can restore to a point in time, and this is the
moment you want that to be true.

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

`--status` touches nothing and creates nothing. Run it first and confirm the
pending list is exactly `011_verification` and `012_active_slot_null_safe`.

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

Rolling the code back without rolling the migration back is safe: the old
code does not know those tables exist.

---

## 5. What is not verified

**TiDB.** Migrations 011 and 012 are verified on MariaDB 12.2.2 and, through
CI, on MySQL 8.0. Neither is TiDB. Specifically untested there:

- whether `CHECK` constraints are enforced at all — TiDB historically parsed
  and ignored them. Where they are not enforced the repository and the domain
  remain the primary controls and the constraints are defence in depth, so
  this degrades rather than breaks.
- whether `<=>` is accepted inside a `CHECK`
- `ALTER TABLE … DROP CONSTRAINT` in migration 012
- the query plans for `idx_queue` and the eligibility `EXISTS`

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

**The de-listing count.** §2 above.

**Landing-page claims.** "10,000+ satisfied customers", "8,492+ verified
professionals", "98% satisfaction rate", and the named testimonials are
fabricated. They are marketing copy and the owner's to decide, but they are
public claims about a platform that currently has six providers.
