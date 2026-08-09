# IMAP 2.0 — Phase 3 Readiness

**Status:** GATE DECISION · **Phase:** 2.75 · **Date:** 2026-08-09
**Answers:** `docs/audit/PHASE-2.5-GATE-REPORT.md`
**Evidence:** `ENVIRONMENT-ARCHITECTURE.md` · `BACKUP-RECOVERY.md` · `TESTING-STRATEGY.md` · `SECRETS-MANAGEMENT.md` · `CREDENTIAL-INCIDENT.md` · `GATE-1-ARCHITECTURE.md` · `PHASE-2.75-DATABASE-REHEARSAL.md`

---

## Can implementation begin?

# YES

Every condition Phase 2.5 set for entering Phase 3 is met. Three things remain open and
are **hard blockers at specific later points**, not at this one — they are named in §5
and attached to the exact step they gate.

Phase 2.5 said the architecture was correct enough to build and the environment was not
safe to build in. The environment is now safe to build in.

---

## 1. The §33 gate, condition by condition

| Condition | Result | Evidence |
|---|---|---|
| **V-01** environment safety | **CLOSED** | `config/environment.js`; 14 call sites migrated; 18 unit + 3 integration tests; `db.js` refuses to start on a production database from a non-production process |
| **V-02** database rehearsal | **SAFE REHEARSAL PATH EXISTS — and was used** | Isolated MariaDB 12.2 on loopback; `001` and `002` applied, asserted, re-run, failure-tested, recovered. TiDB verification still outstanding (§5.1) |
| **U-02** backup / recovery | **CLOSED as design; OPEN as capability** | `BACKUP-RECOVERY.md` — RPO/RTO, restore procedure, seven failure modes, verification schedule. Four vendor assumptions unverified (§5.2) |
| **U-03** testing strategy | **CLOSED** | `TESTING-STRATEGY.md` — pyramid, nine layers, 32-row matrix, environments, conventions, coverage. 59 tests passing |
| **V-03** customer settlement | **RESOLVED** | Five alternatives tested and rejected; `booking_clearing` added as AD-023 |
| **V-05 / U-01** job idempotency | **RESOLVED** | Job key / execution id / effect token; two permitted declarations; AD-024 |
| **V-06** Gate 1 vs Gate 2 | **RESOLVED** | `GATE-1-ARCHITECTURE.md`, AD-026 |
| **O-01** capability verification | **RESOLVED** | Declaration → Provider; decision → Identity/KYC; Trust reads only |
| **O-02** booking payment status | **RESOLVED** | Payment authoritative; booking column is a read model; cash produces a `Payment` |
| **O-03** dispute vs held funds | **RESOLVED** | Booking owns the dispute, Finance owns the hold, payout re-reads at batch time |
| **Gate-1 architecture** | **FROZEN** | 5 modules · ~38 entities · 16 events · 6 state machines · 0 AI tools |

Also closed in passing: **V-04** (refund ordering), **V-07** (Sealed reads audited),
**V-08** (Booking ↔ Finance cycle rule), **O-04** (derived standing), **S-01 … S-10**.

Per §33, legal decisions do not block Phase 3, because AD-019 and AD-020 keep them as
extension points. They still block *launch* — §7.

---

## 2. Readiness checklist

### Environment

- [x] Test DB isolated — loopback only, enforced at module load, not by convention
- [x] Production DB identified — `PRODUCTION_DB_HOST` declared, not inferred
- [x] Production uses production environment mode — `APP_ENV`, `NODE_ENV`, `DATABASE_ENV` all `production` in `render.yaml`
- [x] Development cannot accidentally target production — the process refuses to start
- [ ] **Development DB isolated** — owner action; `backend/.env` still names the production host
- [ ] **Staging DB isolated** — not provisioned
- [ ] **Secrets separated** — policy written; production credentials still present on the development workstation

### Database

- [x] Migration tool safe — `--status` is genuinely read-only; writes require a typed acknowledgement
- [x] Migration rehearsal completed — MySQL-family, including failure and recovery
- [x] Schema verified — nine assertions against `information_schema`
- [x] Backup plan — specified
- [x] Restore plan — specified, step by step
- [ ] **Recovery tested** — no drill has been run
- [ ] **TiDB-specific verification** — no TiDB instance exists other than production

### Testing

- [x] Test runner — `node:test`, no dependency added
- [x] Unit strategy · [x] Integration strategy · [x] Security strategy · [x] Financial strategy · [x] E2E strategy
- [x] Isolated test database available
- [ ] **CI running the suite** — the repository deploys without testing

### Architecture

- [x] Gate-1 scope frozen · [x] Domain ownership · [x] Financial model · [x] Authorization · [x] Audit · [x] Events

### Product

- [x] Gate 1 / Gate 2 consistent
- [x] Legal decisions explicitly unresolved — and not invented
- [x] Commission rate explicitly unresolved — `PLATFORM_FEE_PCT = 0` everywhere

---

## 3. What changed in this phase

### Code — readiness tooling only. No feature, no domain, no frontend.

| File | Change |
|---|---|
| `backend/config/environment.js` | **new** — two-axis fail-closed environment identity and four guards |
| `backend/db.js` | refuses to start on a production database from a non-production process; non-secret startup diagnostics |
| `routes/blood.js`, `routes/disaster.js` ×2 each | demo seeding and demo filters now consider the database |
| `routes/users.js` | self-service wallet top-up |
| `routes/auth.js` | OTP never returned when either axis is production |
| `routes/payments.js` | mock settlement refusal |
| `server.js` | rate limits, CORS, error detail |
| `utils/logger.js`, `utils/payment.js` | declared environment — deliberately not widened (§4.2 of `ENVIRONMENT-ARCHITECTURE.md`) |
| `scripts/migrate.js` | `--status` read-only; production acknowledgement before any write |
| `scripts/seedDemo.js` | `forbidInProduction` — no override exists |
| `scripts/resetAdmin.js`, `scripts/initDb.js`, `scripts/checkLogin.js` | production acknowledgement |
| `schema.sql` | stopped forcing every table into a database named `imap_db` |
| `.gitignore` | all `.env` variants, keys, certificates; templates allowed back |
| `backend/.env.example`, `render.yaml` | environment identity documented and declared |
| `backend/package.json` | `test:unit`, `test:integration` scripts |

**Not touched:** any domain logic, any route behaviour beyond the environment predicate,
the frontend, the database schema's table definitions, dependencies, production data.

### Tests

| | Before | After |
|---|---:|---:|
| Unit / route | 31 | **49** |
| Integration | 0 | **10** |
| **Total passing** | **31** | **59** |

### Documentation

New: `ENVIRONMENT-ARCHITECTURE.md`, `BACKUP-RECOVERY.md`, `TESTING-STRATEGY.md`,
`PHASE-3-READINESS.md`, `SECRETS-MANAGEMENT.md`, `CREDENTIAL-INCIDENT.md`,
`GATE-1-ARCHITECTURE.md`, `PHASE-2.75-DATABASE-REHEARSAL.md`.

Amended with binding corrections: `ARCHITECTURE-DECISIONS.md` (AD-021 … AD-026),
`FINANCIAL-ARCHITECTURE.md`, `EVENT-ARCHITECTURE.md`, `API-ARCHITECTURE.md`,
`DOMAIN-ARCHITECTURE.md`, `DATA-ARCHITECTURE.md`, `SERVICE-GRAPH.md`,
`MIGRATION-STRATEGY.md`.

---

## 4. Defects found by executing rather than reading

Phase 2.5 reviewed these same files and found none of the following. That is the argument
for the rehearsal, stated as a fact rather than a principle.

| # | Defect | Found by |
|---|---|---|
| 1 | `migrate.js --status` wrote DDL — the read-only command was not read-only | running it |
| 2 | `schema.sql` forced every table into `imap_db` regardless of the selected database | applying it to a differently-named database |
| 3 | `002` aborts on duplicate `ref_id` — correct, and a required production pre-check | seeding the failure case |
| 4 | A MariaDB engine was available all along; Phase 2.5's `PATH` check was insufficient | checking services, not `PATH` |

---

## 5. Open, with the point at which each becomes blocking

### 5.1 TiDB verification — blocks migration execution against production

MariaDB is not TiDB. The rehearsal establishes that the migrations are valid, ordered,
re-runnable and non-destructive; it establishes nothing about TiDB DDL semantics, timing
at production row counts, or whether TiDB returns the same error codes the runner
tolerates. Full breakdown in `PHASE-2.75-DATABASE-REHEARSAL.md` §5.

**Blocks:** build-order step 8. **Not** steps 1–7.

### 5.2 Backup capability — blocks any production write

Four vendor assumptions are unverified (`BACKUP-RECOVERY.md` §0). Until they are checked
in the TiDB and Cloudflare consoles, the correct statement is that **IMAP does not know
whether it has a backup**. No restore drill has been run, so the stated RTO is an estimate.

**Blocks:** build-order step 8, and any production migration. **Not** steps 1–7.

### 5.3 CI — blocks the Gate-1 release

`.github/workflows/` deploys and does not test. 59 tests exist and run only when someone
runs them.

**Blocks:** Gate-1 release. **Not** Phase 3.

---

## 6. Owner actions

Nothing here is an engineering task, and none of it has been performed — Phase 2.75 did
not touch production or the local `.env`.

| # | Action | Why |
|---|---|---|
| 1 | Point `backend/.env` at a development database | The application already refuses to start otherwise; this is what makes development work again |
| 2 | Rotate the TiDB credential, `JWT_SECRET`, and the payment/SMS/storage/AI keys | They have lived on a workstation — `CREDENTIAL-INCIDENT.md` E-4 |
| 3 | Run the detection queries in `ENVIRONMENT-ARCHITECTURE.md` §8.1 | Establish whether the demo seeder ever reached production |
| 4 | Run the queries in `CREDENTIAL-INCIDENT.md` §2.1 and record the answers there | Turn UNKNOWN into a finding, either way |
| 5 | Verify the four backup assumptions in the TiDB and Cloudflare consoles | §5.2 |
| 6 | Provision a staging cluster | Required to rehearse the two VERY HIGH migrations against real data |
| 7 | Confirm `APP_ENV` / `DATABASE_ENV` in the Render dashboard match `render.yaml` | The file declares them; the dashboard applies them |
| 8 | Apply migration `002` to production, after the pre-check and a verified snapshot | It is what nulls the compromised administrator hash |

---

## 7. Decisions that are still nobody's but the owner's

Unchanged since Phase 2.5. **No approval has been invented, inferred, or worked around.**

| Item | Owner | Blocks |
|---|---|---|
| D-006 short-form feed | Product | nothing structural |
| D-010 customer stored value | **Legal** | wallet wind-down; loyalty redemption |
| D-011 microloans | **Legal** | loan wind-down plan |
| D-012 disaster alerts | Product + legal | emergency surface scope |
| D-013 blood registry | Product | emergency surface scope |
| **D-009 commission rate** | **Business** | **revenue. `PLATFORM_FEE_PCT` is 0 and stays 0** |
| Loan wind-down plan | Business | outstanding balances |
| Hotline verification | Operations | R-1009, open since Phase 0.5 |
| VAT / marketplace tax treatment | **Legal** | pricing completeness |
| **Ledger opening balances** | **Business** | migration Step 3 — `MIGRATION-STRATEGY.md` G3 |

The last one is new and is the sharpest. Some of the current `users.balance` total is the
500.00 credited free at signup, never paid in. Converting it to a ledger opening balance
makes it a stated platform liability; writing it off takes balance away from real users.
Engineering can compute the number. It cannot decide it.

---

## 8. Verification of this phase's constraints

| Constraint | Result |
|---|---|
| No new product features | **held** — no feature added |
| No AI implemented | **held** — zero AI code |
| Frontend not rewritten | **held** — no frontend file changed |
| Backend not rewritten | **held** — one new config module; the rest are one-line predicate substitutions in existing guards |
| No production data migrated | **held** — production never contacted |
| No SQL executed against production | **held** — every statement ran against `127.0.0.1:3399`, asserted before each run |
| No migrations run against production | **held** |
| No unnecessary dependencies | **held** — `package.json` dependencies unchanged; two scripts added |
| Safety checks not bypassed or weakened | **held** — every guard is strictly stronger; none was relaxed to make a test pass |
| Phase 3 not started | **held** |
| No secrets printed | **held** — key names only; `describe()` is tested to contain no credential |

---

## 9. Where the score stands

| Dimension | Phase 2 self | Phase 2.5 validated | **Phase 2.75** |
|---|:-:|:-:|:-:|
| Domain clarity | 4 | 3 | **4** |
| Data integrity | 5 | 4 | **5** |
| Financial safety | 5 | 4 | **5** |
| Security | 4 | **2** | **4** |
| AI readiness | 5 | 5 | 5 |
| UX support | 4 | 4 | 4 |
| Realtime | 4 | 4 | 4 |
| Scalability | 3 | 3 | 3 |
| Testability | 4 | **2** | **4** |
| Observability | 4 | 4 | 4 |
| Migration feasibility | — | **2** | **4** |
| Operational simplicity | 4 | 3 | **4** |
| Cost efficiency | 4 | 4 | 4 |
| **Overall** | **4.0** | **3.4** | **4.2** |

Security reaches 4, not 5: the design is sound and the guards are implemented and tested,
but there is still no audit log, no CI secret scanning, and a production credential set on
a workstation. Migration feasibility reaches 4, not 5: a rehearsal environment exists and
was used, but not on TiDB and not against production-shaped data.

---

## 10. Decision

**Phase 3 ready: YES.**

Build in the order set by `GATE-1-ARCHITECTURE.md` §11 — audit and authorization first,
identity second, ledger third. Do not execute build-order step 8 until §5.1 and §5.2 are
closed.
