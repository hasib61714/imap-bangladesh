# IMAP 2.0 — Phase 2.5 Gate Report

**Status:** GATE DECISION · **Phase:** 2.5 · **Date:** 2026-08-09
**Evidence:** `PHASE-2.5-VALIDATION.md` · `PHASE-2.5-DATA-OWNERSHIP.md` · `PHASE-2.5-SIMPLIFICATION.md` · `PHASE-2.5-DATABASE-VERIFICATION.md`

---

## Can implementation begin?

# NO

Not because the architecture is wrong. Because **the environment in which it would be built is unsafe, and three foundations that implementation depends on do not exist.**

The architecture itself passes on design merit. Every blocker below is environmental, procedural, or a documentation gap that takes hours rather than a redesign.

---

## Gate results

| Gate | Result | Basis |
|---|---|---|
| **A — Product consistency** | **PASS** | Every Phase 1 requirement traces to a domain, data, command, event, UX consequence and security boundary. No contradiction found in the booking trace across six documents |
| **B — Domain consistency** | **CONDITIONAL PASS** | No state has two owners *by design*. Three (O-01, O-02, O-03) are ambiguously specified, all on money or safety paths |
| **C — Financial integrity** | **CONDITIONAL PASS** | All eight ledger flows balance. Authority is server-only on every command. Two specification defects (V-03, V-04) and one idempotency hole (U-01) |
| **D — Security** | **FAIL** | The design is sound. **The running environment defeats it** — V-01 |
| **E — AI safety** | **PASS** | Containment chain has no gap. AI cannot reach the database, money, authorization, or Sealed data |
| **F — Data** | **CONDITIONAL PASS** | Entities justified; 3 removals, 2 collapses, 4 deferrals recommended. V-03 leaves a worked flow unimplementable as written |
| **G — Events** | **CONDITIONAL PASS** | Outbox atomicity, retries, DLQ, ordering, replay and consumer idempotency all correct. 8 events have no consumer |
| **H — Migration** | **FAIL** | Two VERY HIGH irreversible steps with **no environment to rehearse in** — V-02 |
| **I — Scope** | **CONDITIONAL PASS** | Over-engineered for Gate 1 (10 simplifications, ~45% of surface) and under-engineered on operations (7 gaps, 3 blocking) |
| **J — Database** | **BLOCKED** | No isolated environment exists; the only configured database is production. Nothing was executed |

**2 FAIL · 1 BLOCKED · 5 CONDITIONAL PASS · 2 PASS.**

---

## Blocking conditions

### B1 — Development environment targets the production database · **CRITICAL**

`backend/.env` points at `gateway01.ap-northeast-1.prod.aws.tidbcloud.com` / `imap_db` — byte-identical to `render.yaml` — while setting `NODE_ENV=development`.

Every Phase 0.5 production guard is keyed on `NODE_ENV`. In this configuration, against production data:

* the demo seeder would create six provider accounts sharing one password;
* blood and disaster demo seeds would be written, and demo rows would be *served* as real;
* mock payment settlement would be active — free wallet credit;
* self-service wallet top-up would be permitted;
* OTPs would be returned in API responses.

**P0-9, P0-10 and P0-12 were fixed in code and are currently defeated by configuration.** Phase 0 could not have found this: it was a read-only audit of tracked files, and `.env` is gitignored.

**Required:** point development at a separate database; rotate the TiDB credential; add a startup guard on the resolved host that does not depend on `NODE_ENV`; and have someone with authorised access check whether the demo seeder has already run against production.

---

### B2 — No environment in which any migration can be rehearsed · **HIGH**

`MIGRATION-STRATEGY.md` specifies a stop condition and a rollback for every step. None can be exercised. Two steps are VERY HIGH risk and involve irreversible data decisions:

* **Service Graph** — three conflicting taxonomies reconciled into one, with human capability mapping.
* **Ledger** — opening balances that *cannot be derived* from existing data and must be established by documented human sign-off.

Migration `002_phase05_containment.sql` has still never run against any TiDB instance.

**Required:** a provably isolated, disposable database, plus a restored copy of production for rehearsing the two VERY HIGH steps at realistic volume.

---

### B3 — No testing strategy · **HIGH**

Phase 2 produced `AI-EVALUATION.md` and nothing else on testing. There is no design for unit/integration/contract/E2E layering, test data, fixtures, or how the existing module-cache-injection harness evolves — a harness `CURRENT-TO-TARGET.md` itself calls "not a long-term seam".

The first things Phase 3 builds are a ledger, an authorization kernel and an audit log. Building those without a stated test strategy is how untested foundations get laid.

**Required:** `docs/engineering/TESTING-STRATEGY.md`.

---

### B4 — No backup, restore or recovery design · **HIGH**

No RPO, no RTO, no restore procedure, no rehearsed restore, and nothing for object storage — which will hold identity documents under AD-011. "TiDB handles it" is an assumption.

**Required:** stated RPO/RTO, a documented restore procedure, one rehearsed restore, and an object-storage backup story.

---

### B5 — Six specification gaps on money and safety paths · **HIGH, cheap**

Each is a paragraph in an existing document, not a redesign. Together they are blocking because an implementer would otherwise have to guess, and every one of them sits where the Phase 0 defects were.

| ID | Gap | Fix |
|---|---|---|
| V-03 | `customer_settlement` used in ledger flows, absent from the account taxonomy | Add a tenth account kind, distinguished from the non-issuable `customer_liability` |
| V-05 / U-01 | Job idempotency unspecified — a retried job repeats external side effects | Require every job to declare a deterministic key or explicit at-least-once tolerance |
| V-06 | Phase 2 classifies against one "MVP"; Phase 1 defines two gates | Re-tag the domain, entity and event registers by Gate 1 / Gate 2 / Phase F |
| O-01 | Capability *verification* has no owner — a provider could self-assert a regulated capability | Declaration → Provider; decision → Identity/KYC; Trust reads only |
| O-02 | Booking payment status has two plausible owners | Payment is authoritative; the booking column is an event-driven read model. Cash produces a `Payment` record with `method = cash` |
| O-03 | Dispute state vs held funds — split authority | Booking owns the dispute and publishes; Finance owns the hold and applies it on the event |

---

## Non-blocking, recommended before Phase 3

| ID | Item |
|---|---|
| V-04 | Refund ledger entries are shown settlement-before-recognition; reverse the order |
| V-07 | Tier-A read-tool audit has no state-change transaction to write inside; exempt it explicitly and route it through the job queue |
| V-08 | State the Booking ↔ Finance cycle as a rule (both write directions event-only; synchronous reads permitted) |
| O-04 | Label the discovery projection non-authoritative (moot if S-03 is adopted) |
| U-04 | Write the compromised-credential runbook — B1 makes it immediate |
| U-05 | Specify the retention-enforcement mechanism |
| U-06 | Specify secret rotation — B1 makes it immediate |
| — | Bilingual `*_bn`/`*_en` columns bake two languages into the schema; decide now whether to accept |
| — | Add AI state as a fifth frontend state kind |
| — | Rename the "Intent agent" a classifier — it has no tools, planning or autonomy |

---

## Simplifications recommended

Adopting these reduces the Gate-1 build by roughly 45% of surface **without removing any safety property**.

| ID | Simplification | Saves |
|---|---|---|
| S-01 | Defer the service-graph closure table; hold the graph in memory | 1 table, 1 rebuild path, 1 drift class. *Corrects AD-004, whose own reasoning argues against materialising* |
| S-02 | Collapse `need_understanding` + `need_outcome` into `need_event` | 1 table; simpler funnel |
| S-03 | Defer the discovery projection; query directly | 1 table, 8 handlers, 1 ownership defect |
| S-04 | No Trust context at Gate 1 — a computed standing view | 1 context, 2 tables |
| S-05 | Publish 16 events, not 45. **No event without a consumer** | 29 events deferred, 8 removed |
| S-06 | 6 real state machines; the rest are validated enums | Machinery on 10 |
| S-07 | 5 module roots, not 14 | Cross-module wiring |
| S-08 | 12 AI tools at Gate 2, not 25 | Halves the eval and authorization matrix |
| S-09 | Consider merging `outbox_event` and `job` | Marginal |
| S-10 | Defer `payout_batch` | 1 table |

**Gate-1 target: 5 modules · ~38 entities · ~16 events · 6 state machines · 0 AI tools · 4 contexts + Platform.**

---

## Architecture decisions

| Classification | Count | IDs |
|---|---:|---|
| **LOCKED** | 12 | AD-001, 005, 006, 007, 008, 009, 011, 012, 013, 014, 015, 017 |
| **PROVISIONAL** | 5 | AD-002 (TiDB), AD-003 (Express), AD-010 (idempotency — incomplete), AD-016 (jobs — idempotency unspecified), AD-018 (relational context) |
| **REQUIRES RESEARCH** | 1 | AD-004 — the closure table is contradicted by its own reasoning (S-01) |
| **BLOCKED BY SIGN-OFF** | 2 | AD-019 (D-010, D-011 legal), AD-020 (D-012, D-013) |

No provisional decision was silently promoted to locked.

---

## Human sign-off still required

**None of these has been resolved, and none may be assumed.**

| Item | Owner | Blocks |
|---|---|---|
| D-006 short-form feed | Product | Nothing structural |
| D-010 customer stored value | **Legal** | Wallet wind-down; loyalty redemption gap |
| D-011 microloans | **Legal** | Loan wind-down plan |
| D-012 disaster alerts | Product + legal | Emergency surface scope |
| D-013 blood registry | Product | Emergency surface scope |
| D-009 commission rate | Business | **Revenue is zero until set. `PLATFORM_FEE_PCT` defaults to 0** |
| Loan wind-down plan | Business | Outstanding balances — engineering cannot decide this |
| Hotline verification | Operations | R-1009; carried open since Phase 0.5 |
| VAT / marketplace tax treatment | **Legal** | Pricing model completeness |
| **Whether the demo seeder has run against production** | **Whoever holds DB access** | **B1 remediation scope** |

---

## What must happen before Phase 3

**Ordered. Items 1–4 are hard prerequisites.**

1. **Separate the development environment from production** (B1). Rotate the credential. Add a host-based startup guard. Establish whether production has already been seeded with demo data.
2. **Provision an isolated, disposable database** (B2), plus a restored copy for rehearsing the ledger and taxonomy migrations. Then verify migration `002`.
3. **Write `docs/engineering/TESTING-STRATEGY.md`** (B3).
4. **Design backup, restore and recovery**, including object storage, and rehearse one restore (B4).
5. **Close the six specification gaps** (B5) — V-03, V-05, V-06, O-01, O-02, O-03.
6. **Adopt the Gate-1 simplifications** (S-01…S-10) and re-tag the Phase 2 registers by gate.
7. **Obtain the sign-offs** above, or accept explicitly that the affected features stay withdrawn.
8. Address the non-blocking items as capacity allows.

**None of items 1–6 requires writing application code.** They are environment provisioning, one new document, and edits to Phase 2 documents. That is the honest scale of what stands between here and Phase 3.

---

## Scoring

| Dimension | Phase 2 self-score | Validated |
|---|:-:|:-:|
| Domain clarity | 4 | 3 |
| Data integrity | 5 | 4 |
| Financial safety | 5 | 4 |
| Security | 4 | **2** |
| AI readiness | 5 | 5 |
| UX support | 4 | 4 |
| Realtime | 4 | 4 |
| Scalability | 3 | 3 |
| Testability | 4 | **2** |
| Observability | 4 | 4 |
| Migration feasibility | — | **2** |
| Operational simplicity | 4 | 3 |
| Cost efficiency | 4 | 4 |
| **Overall** | **4.0** | **3.4** |

The design earns roughly what Phase 2 claimed. **The conditions for building it safely do not yet exist**, and that is what the three low scores measure.

---

## Assessment

The architecture is **correct enough to build** — once it can be built somewhere safe.

Nothing found in this validation invalidates a Phase 2 design decision. Two decisions need correction (AD-004's closure table, AD-010/016's job idempotency), six specifications need a paragraph each, and the whole thing is roughly twice as large as Gate 1 requires. Those are ordinary review outcomes.

The serious findings are elsewhere. There is no test environment, no test strategy, no restore procedure, and the development machine is wired to production with its safety guards disabled. Writing implementation code in that state would mean building a ledger and an authorization kernel with no way to test them, no way to rehearse their migrations, and a live connection to the data they are meant to protect.

**Phase 3 ready: NO.** The path there is short and does not involve writing application code.
