# IMAP 2.0 — Environment Architecture

**Status:** IMPLEMENTED (Gate 1 scope) · **Phase:** 2.75 · **Date:** 2026-08-09
**Closes:** V-01, U-07 · **Implements:** `backend/config/environment.js`
**Related:** `docs/security/SECRETS-MANAGEMENT.md`, `docs/engineering/BACKUP-RECOVERY.md`, `docs/engineering/TESTING-STRATEGY.md`

---

## 1. What went wrong, precisely

Phase 0.5 added seven production safety controls. Every one of them was keyed on the same expression:

```js
process.env.NODE_ENV === "production"
```

Phase 2.5 read `backend/.env` and found:

```
NODE_ENV = development
DB_HOST  = gateway01.ap-northeast-1.prod.aws.tidbcloud.com    ← production
DB_NAME  = imap_db                                             ← production
```

The controls were correct. The **discriminator** was wrong. A single string decided whether the process would seed fake blood donors, settle payments without a gateway, credit wallets on request, or return OTPs in HTTP responses — and that string described the *process*, while the danger came from the *database*.

The architectural error is worth naming because it generalises: **an environment is not one fact.** It is at least two — what this process is, and what data it can reach — and a safety rule that reads only one of them is not a safety rule.

---

## 2. The model

Two independent axes, resolved separately, combined explicitly.

```
                     ┌─────────────────────────────────────┐
   APP_ENV ─────────▶│  declaredEnvironment()              │
   NODE_ENV          │  what this PROCESS is               │
   (unset → prod)    └──────────────┬──────────────────────┘
                                    │
   DATABASE_ENV ─────┐              │
   PRODUCTION_DB_HOST├──▶ databaseEnvironment()            │
   DB_HOST           │    what the DATA is                 │
   (unknown → prod)  └──────────────┬──────────────────────┘
                                    │
                     ┌──────────────▼──────────────────────┐
                     │ allowsDevelopmentBehaviour()        │
                     │   = BOTH are development-like       │
                     │ isProduction() = NOT the above      │
                     └─────────────────────────────────────┘
```

Development behaviour requires a **conjunction**. That single change is what closes V-01: a development process on production data satisfies one side and fails the other, so it gets production behaviour on every guard.

### 2.1 Resolution rules

**Process** — `APP_ENV`, then `NODE_ENV`, then **`production`**.
`APP_ENV` is authoritative because `NODE_ENV` is overloaded: bundlers, hosting platforms and libraries all write to it for unrelated reasons. An unset or unrecognised value resolves to production.

**Data** — first match wins:

| # | Rule | Result |
|---|---|---|
| 1 | `DATABASE_ENV` is set | that value — the operator's explicit statement always wins, in both directions |
| 2 | host equals `PRODUCTION_DB_HOST` | production |
| 3 | host is loopback (`127.0.0.1`, `localhost`, `::1`, `host.docker.internal`) | development |
| 4 | host matches `/(^\|[.\-_])(prod\|production\|live)([.\-_]\|$)/` | production |
| 5 | **anything else** | **production** |

Rule 5 is the point of the exercise. An unrecognised remote host is production until an operator says otherwise. A staging cluster must declare `DATABASE_ENV=staging`; silence is never read as safe.

---

## 3. Environment classes

| Environment | Database | Real payments | Demo seed | Mock settlement | Debug logs | OTP in response |
|---|---|---|---|---|---|---|
| **development** | local / isolated remote | no — sandbox | **yes** | yes | yes | yes |
| **test** | disposable, loopback only | no — never called | no (fixtures) | yes | suppressed | yes |
| **staging** | own cluster, scrubbed restore | sandbox gateway | **no** | **no** | no | **no** |
| **production** | production cluster | **yes** | **no** | **no** | no | **no** |

**Staging deliberately gets production behaviour.** It is internet-reachable and is populated from a scrubbed restore, not from the demo seeder — whose accounts share one password. The only thing staging relaxes is which external integrations it addresses.

### 3.1 Required variables

| Variable | dev | test | staging | production |
|---|---|---|---|---|
| `APP_ENV` | `development` | `test` | `staging` | `production` |
| `NODE_ENV` | `development` | `test` | `production` | `production` |
| `DATABASE_ENV` | `development` | `test` | `staging` | `production` |
| `PRODUCTION_DB_HOST` | recommended | — | recommended | set |
| `SSL_IS_SANDBOX` | `true` | `true` | `true` | `false` |
| `SMS_PROVIDER` | `mock` | `mock` | `mock` | real provider |
| `PLATFORM_FEE_PCT` | `0` | `0` | `0` | **`0` until D-009 is decided** |

`render.yaml` now declares `APP_ENV`, `DATABASE_ENV` and `PRODUCTION_DB_HOST` explicitly, so the production deployment never depends on a hostname pattern being matched correctly.

---

## 4. The guards, and what each one protects

Implemented in `backend/config/environment.js`; every one has a test in `backend/test/p275-environment.test.js`.

| Guard | Fires when | Override |
|---|---|---|
| `assertEnvironmentIsCoherent()` | a non-production process opens a production database | typed acknowledgement |
| `requireProductionAcknowledgement(op)` | a script writes to production | typed acknowledgement |
| `forbidInProduction(op)` | an operation has no safe production use | **none** |
| `isProduction()` | the widened predicate at every former `NODE_ENV` guard | — |
| `isProductionEnvironment()` | declared process environment only | — |

### 4.1 Call sites migrated

| File | Was | Now | Protects |
|---|---|---|---|
| `db.js` | — | `assertEnvironmentIsCoherent()` at load | everything below |
| `routes/blood.js` ×2 | `NODE_ENV === "production"` | `env.isProduction()` | fabricated donors; demo filter |
| `routes/disaster.js` ×2 | ″ | `env.isProduction()` | fabricated alerts; demo filter |
| `routes/users.js` | ″ | `env.isProduction()` | self-service wallet top-up |
| `routes/auth.js` | `NODE_ENV !== "production"` | `env.allowsDevelopmentBehaviour()` | OTP in response |
| `routes/payments.js` | ″ | `env.isProduction()` | mock settlement / free credit |
| `server.js` | ″ | `env.isProduction()` | rate limits, CORS, error detail |
| `utils/logger.js` | ″ | `env.isProductionEnvironment()` | log level and format |
| `utils/payment.js` | ″ | `env.isProductionEnvironment()` | gateway sandbox selection |
| `scripts/migrate.js` | none | `requireProductionAcknowledgement` | schema changes |
| `scripts/seedDemo.js` | `NODE_ENV === "production"` | `forbidInProduction` | shared-password accounts |
| `scripts/resetAdmin.js` | none | `requireProductionAcknowledgement` | administrator credential |
| `scripts/initDb.js` | none | `requireProductionAcknowledgement` | schema application |
| `scripts/checkLogin.js` | none | `requireProductionAcknowledgement` | bulk personal-data dump |

### 4.2 Two deliberate exceptions

**`utils/payment.js` uses the declared environment, not the widened predicate.** Widening it would put a developer's run on the *live* gateway because their database happened to be production — turning a configuration mistake into real money movement. The correct response to that configuration is `db.js` refusing to start, which it does.

**`utils/logger.js` likewise.** Log verbosity is not a data-safety control, and a developer debugging locally should get readable logs.

---

## 5. The break-glass override

```
IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION=<exact DB_NAME>
```

Three properties, all tested:

* **It must name the database.** `true`, `yes`, `1` and a wrong name all fail. It cannot be set once in a shell profile and forgotten, because it stops working the moment the target changes.
* **It grants access, not permissiveness.** `isProduction()` stays `true`. Acknowledging that you are touching production does not make the data fake.
* **`forbidInProduction` ignores it entirely.** Demo seeding has no production use, so no override exists for it.

Every use should be a line in the operations log. It is a legitimate tool for a genuine production migration; it is not a way to make a warning go away.

---

## 6. Environment separation — required end state

| Environment | Cluster | Database | Credential | Status |
|---|---|---|---|---|
| production | TiDB Serverless (existing) | `imap_db` | production only, rotated | **exists** |
| staging | separate TiDB cluster | `imap_staging` | own | **not provisioned** |
| development | per-developer local MySQL/MariaDB, or a shared dev cluster | `imap_dev` | own | **not provisioned** |
| test | disposable, loopback only | ephemeral per run | none | **available** — see §7 |

Rules:

1. A credential valid for production must never be present on a developer machine.
2. Development and test may not resolve any hostname belonging to the production cluster.
3. Staging is populated by scrubbed restore, never by the demo seeder, never by a copy of production with live personal data.
4. `PLATFORM_FEE_PCT` stays `0` in every environment until D-009 is decided by a business owner.

---

## 7. The disposable test instance

An isolated instance was provisioned during Phase 2.75 and used for the migration rehearsal:

```
engine   MariaDB 12.2.2 (MySQL wire protocol)
host     127.0.0.1:3399          ← loopback, separate port
datadir  <session scratchpad>    ← outside the repository, outside the user profile data
scope    created and destroyed within the phase
```

Provable isolation: distinct host, distinct port, distinct data directory, separate process, no shared credential with production. Provable disposability: deleting the data directory has no effect on any other system.

**Caveat, stated plainly: MariaDB is not TiDB.** See `docs/audit/PHASE-2.75-DATABASE-REHEARSAL.md` §5 for exactly what this does and does not verify.

`backend/test/integration/` refuses any non-loopback `IMAP_TEST_DB_HOST` — enforced at module load, not documented and hoped for.

---

## 8. What still has to happen

| # | Action | Owner | Blocks |
|---|---|---|---|
| 1 | Repoint `backend/.env` at a development database | project owner | nothing — guards already refuse to start otherwise |
| 2 | Rotate the TiDB production credential | project owner | — |
| 3 | Establish whether the demo seeder has already run against production | project owner (DB access) | scope of any cleanup |
| 4 | Provision a staging cluster | project owner | rehearsal of the two VERY HIGH migrations |
| 5 | Set `APP_ENV` / `DATABASE_ENV` in the Render dashboard to match `render.yaml` | project owner | — |

Item 1 is not urgent in the way it was on 2026-08-09 before this phase: the application now refuses to start in that configuration. It is still the correct fix, because refusing to start is a guard, not a working development environment.

### 8.1 Detection query for item 3

Read-only. Run by a person with authorised access, against production:

```sql
SELECT id, name, phone, role, joined_at
  FROM users
 WHERE phone IN ('01700000001','01700000002','01700000003',
                 '01700000004','01700000005','01700000006');

SELECT COUNT(*) AS demo_donors FROM blood_donors      WHERE is_demo = 1;
SELECT COUNT(*) AS demo_alerts FROM disaster_reports  WHERE is_demo = 1;
SELECT COUNT(*) AS demo_names  FROM blood_donors      WHERE name LIKE '[DEMO]%';
```

Non-zero anywhere means the seeder reached production. That is a data-integrity incident, not just a configuration one, and the rows are identifiable and removable — which is why Phase 0.5 added `is_demo` in the first place.
