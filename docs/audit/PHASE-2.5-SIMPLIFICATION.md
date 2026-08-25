# IMAP 2.0 — Phase 2.5 Simplification Analysis

**Status:** VALIDATION · **Phase:** 2.5 · **Date:** 2026-08-09
**Tests:** brief §34 (over-engineering, mandatory gate) and §35 (under-engineering)
**Rule:** *A smaller architecture that safely solves the product problem is better than a theoretically perfect one nobody can implement.*

---

## 1. The core problem with Phase 2

Phase 2 classified everything against "MVP". **Phase 1 defines two gates, not one** (`PRD.md` §11):

* **Gate 1 — Core Loop Release.** The structured path works end to end. **No AI.**
* **Gate 2 — MVP Release.** Gate 1 plus intent understanding.

Phase 2 collapsed these into a single "MVP" label. The result is that the AI module, the Trust Graph, the context store and roughly a third of the entity model are presented as *first-build* concerns when Phase 1 places them in Gate 2 or Phase F.

**This is the single largest over-engineering finding, and it is a classification error rather than a design error.** The architecture is not wrong; its phasing is missing. Correcting it removes most of the apparent bulk without changing a single design decision.

| | Phase 2 "MVP" | **Gate 1 (corrected)** | Gate 2 | Phase F+ |
|---|---:|---:|---:|---:|
| Bounded contexts | 7 + Platform | **4 + Platform** | 5 + Platform | 7 + Platform |
| Backend modules | 14 | **8** | 10 | 14 |
| Entities | ~70 | **~38** | ~50 | ~70 |
| Domain events | ~45 | **~16** | ~24 | ~45 |
| AI tools | ~25 | **0** | ~12 | ~25 |
| State machines | 16 | **6** | 8 | 16 |

---

## 2. Over-engineering findings

### S-01 — The Service Graph closure table is premature · **ADOPT**

**Phase 2 (AD-004).** A materialised `service_edge_closure` table, rebuilt transactionally on every catalogue edit.

**Reality.** MVP is 30–50 leaf services with ~150 edges, traversed to depth 2, edited by staff perhaps weekly. That is a few kilobytes. It fits in process memory with room to spare.

**Simplification.** Hold the graph in memory, built from `service` and `service_edge` at boot and rebuilt on `catalog.graph_changed`. Keep the closure table as a documented option with a trigger (>500 services, or multi-instance cache coherence becoming a problem).

**Saves.** One table, one transactional rebuild path, one class of projection-drift bug. **This is a correction to my own AD-004** — the reasoning there ("small and slow-changing") actually argues *against* materialising it, and I materialised it anyway.

---

### S-02 — Three tables for one need · **ADOPT**

**Phase 2.** `need`, `need_understanding`, `need_outcome`.

**Reality.** A need has one lifecycle. Understanding and outcome are events on it, not separate aggregates. Splitting them means three inserts and a three-way join for the single most important funnel query in `KPI.md`.

**Simplification.** `need` (the aggregate) + `need_event(need_id, kind, payload, at)` where `kind ∈ {expressed, understood, accepted, booked, abandoned}`. One join for the whole funnel.

**Saves.** One table; simpler funnel queries. R-1108 is satisfied either way.

---

### S-03 — The discovery projection is premature · **ADOPT**

**Phase 2.** `provider_service_area`, maintained by eight event handlers.

**Reality.** Gate 1 is 3–5 areas of one city with, optimistically, low hundreds of providers. A four-table join with the indexes already specified in `DATA-ARCHITECTURE.md` §5 returns in single-digit milliseconds at that size. The projection adds eight handlers, a rebuild path, a staleness window, and the O-04 ownership ambiguity — to optimise a query that is not slow.

**Simplification.** Query directly. Introduce the projection when the discovery query breaches its 800 ms p95 budget (`PERFORMANCE.md` §2.1) — a measured trigger, not a guess.

**Saves.** One table, eight event handlers, one ownership defect, one staleness class.

---

### S-04 — Trust is not a bounded context at Gate 1 · **ADOPT**

**Phase 2.** Trust as one of seven contexts, with `trust_signal`, `provider_standing` and `appeal`.

**Reality.** `TRUST-ARCHITECTURE.md` §12 already says so: *"At Gate 1, trust is reduced to: verification state, completed-booking count, repeat-customer count and review average."* Every one of those is a direct query over data other contexts already own. Trust cannot be meaningfully built before the audit log and dispute workflow exist, which is why Phase 1 puts it in Phase F.

**Simplification for Gate 1.** No Trust context, no `trust_signal`, no `appeal`. A `provider_standing` **view** computed from bookings, reviews and verification state. Listing eligibility is a boolean owned by the verification workflow.

Introduce the full Trust context in Phase F, when the audit log and disputes exist to feed it.

**Saves.** One context, two tables, one recompute pipeline — deferred, not lost.

---

### S-05 — Most events have no Gate-1 consumer · **ADOPT**

**Phase 2.** ~45 events.

**Test applied:** does a component that exists at Gate 1 actually subscribe?

| Verdict | Count | Examples |
|---|---:|---|
| **Keep — real Gate-1 consumer** | 16 | `booking.*` (7), `payment.captured/failed`, `refund.issued`, `need.*` (3), `provider.listed/paused`, `trust.review_published` |
| **Defer to Gate 2** | 5 | `ai.*` (4), `need.understood` detail |
| **Defer to Phase F** | 12 | `trust.*` (except review), `booking.dispute_*`, `finance.payout_*` |
| **Candidate for removal** | 8 | `identity.session_revoked` (a direct call to the socket layer is simpler), `catalog.service_deprecated` (no consumer once S-03 removes the projection), `provider.price_changed` (same), `provider.coverage_changed` (same), `provider.capability_changed` (same), `availability.changed` (same), `catalog.graph_changed` (becomes a cache-invalidation signal, not a domain event), `finance.commission_accrued` (derivable from the ledger) |

**Simplification.** Publish 16 at Gate 1. An event with no subscriber is a maintenance cost and a false signal that something is listening.

**Rule to add:** *no event is published without at least one registered consumer.* Enforced at startup, in the same style as the "no use case without a policy" rule.

---

### S-06 — Six of sixteen "state machines" are status columns · **ADOPT**

A state machine earns the name when transitions are **guarded, actor-constrained and side-effecting**. Otherwise it is an enum.

| Genuine machine | Status column |
|---|---|
| Booking (7 states, financial side effects) | Service (`draft/active/deprecated/retired` — no side effects) |
| Payment (gateway-driven, money) | Notification (`queued/sent/failed` — a status) |
| Refund (money) | Review (mostly a status; moderation is Phase F) |
| PayoutClaim (money) | Principal (`active/suspended/closed` — a status with a hook) |
| Verification (Tier C, legal) | AI task (Gate 2) |
| Dispute (money held) | Emergency request (a status; the constraint is that `dispatched` cannot exist) |

**Simplification.** Implement the state-machine *mechanism* (guarded conditional update, `affectedRows` check, transition table) for the six on the left. The others are validated enums with an audit record. Same safety, a fraction of the machinery.

---

### S-07 — Fourteen backend modules is more than Gate 1 needs · **ADOPT**

**Simplification for Gate 1:**

```
identity/      principals · accounts · memberships · verification (incl. capability verification, O-01)
marketplace/   catalog · service graph · provider · availability · discovery
booking/       booking · quote · pricing · messaging
finance/       ledger · payment · payout · commission · refund
platform/      audit · outbox · jobs · notification · authorization · config
```

Five module roots instead of fourteen. Every Phase 2 boundary is preserved — `marketplace/` still has internal `catalog/`, `provider/`, `availability/`, `discovery/` folders with their own public surfaces. What changes is that the *deployable* boundary count drops, and with it the cross-module wiring.

`trust/` (S-04), `ai/`, `emergency/` and `analytics/` join later. Emergency stays isolated whenever it arrives (AD-020 unaffected).

---

### S-08 — The Gate-2 AI tool set can be halved · **ADOPT**

Of ~25 tools, these are not needed for the Gate-2 promise (need → understanding → booking):

| Tool | Verdict | Reason |
|---|---|---|
| `compareProviders` | **MERGE** | Client-side composition of `getProvider` |
| `summarise` (generic) | **REMOVE** | Unbounded scope, hard to evaluate, no product requirement |
| `draftMessage`, `draftReview` | **FUTURE** | Pleasant, not core |
| `getRelatedServices` | **FUTURE** | Bundle suggestion is post-booking |
| `proposeReschedule` | **FUTURE** | R-509 is NEXT |
| `proposeRefundRequest` | **FUTURE** | Manual at Gate 1 |
| `proposeLocationShare` | **MERGE** | Part of the booking flow, not a standalone tool |
| `proposeDonorContactRelease` | **FUTURE** | The blood surface is frozen (D-013) |
| `proposeEmergencyRequest` | **REMOVE** | Constitution §4 requires one deliberate user action. A tool for it adds risk and no convenience |

**Gate-2 minimum: 12 tools.** Each additional tool multiplies the evaluation matrix (`AI-EVALUATION.md` §5) and the authorization surface.

---

### S-09 — Two durable-work tables where one would do · **CONSIDER**

`outbox_event` and `job` are both "durable work with retries and a dead-letter". AD-016 already says they share a mechanism.

**Simplification.** One `work_item` table with a `kind` discriminator, or accept two tables and share the dispatcher. Marginal either way — listed for completeness rather than urgency.

---

### S-10 — `payout_batch` is not needed at Gate 1 · **ADOPT**

Payouts at Gate 1 will be low-volume and executed manually by finance. `payout_claim` carries everything needed; batching is an optimisation for a volume that does not exist.

---

## 3. Under-engineering findings

Simplification must not remove safety-critical infrastructure. Checked against brief §35.

| Foundation | Phase 2 status | Verdict |
|---|---|---|
| Audit | Designed, in-transaction | ✅ **Keep. Not negotiable** |
| Authorization | One kernel, resource-scoped | ✅ **Keep** |
| Idempotency | Three layers | ⚠️ **Gap — U-01** |
| Transactions | `withTransaction` on six boundaries | ✅ Keep |
| Reconciliation | Six checks | ✅ Keep |
| Observability | Designed | ✅ Keep |
| **Backups / restore** | Delegated to TiDB; no RPO/RTO, no restore drill | ❌ **Gap — U-02** |
| **Testing strategy** | Only AI evaluation exists | ❌ **Gap — U-03** |
| Privacy | 8 classes, tiered context | ✅ Keep |
| **Incident response** | Runbooks named as required, none written | ❌ **Gap — U-04** |
| **Data retention** | Schedule defined, no mechanism | ❌ **Gap — U-05** |
| **Secret rotation** | Named, no mechanism | ❌ **Gap — U-06** |
| **Environment separation** | **Absent — and currently violated** | ❌ **Gap — U-07, critical** |

### U-01 — Job idempotency is unspecified · **HIGH**

Events, commands and ledger effects each have an idempotency story. **Jobs do not.** A job that sends an SMS and then crashes before marking itself done will send twice on retry.

**Required:** every job declares idempotency the way every endpoint does — either a deterministic key or an explicitly-documented at-least-once tolerance. Add to `EVENT-ARCHITECTURE.md` §8.

### U-02 — No backup, restore or recovery design · **HIGH**

No RPO, no RTO, no restore procedure, no drill, and nothing at all for object storage (which will hold identity documents). "TiDB handles it" is an assumption, not a design.

**Required before Phase 3:** a stated RPO/RTO, a documented restore procedure, one rehearsed restore, and a backup story for object storage.

### U-03 — No testing strategy · **HIGH**

Phase 2 produced `AI-EVALUATION.md` and nothing else on testing. There is no design for unit/integration/contract/E2E layering, test data management, fixtures, or how the existing module-cache-injection harness evolves — a harness `CURRENT-TO-TARGET.md` itself calls "not a long-term seam".

**Required before Phase 3:** `docs/engineering/TESTING-STRATEGY.md`. Building a ledger and an authorization kernel without a stated test strategy is how untested foundations get laid.

### U-04 — Runbooks not written · **MEDIUM**

`SECURITY-ARCHITECTURE.md` §13 lists five required runbooks and none exists. At minimum the compromised-credential runbook is needed now, given V-01.

### U-05 — Retention has no mechanism · **MEDIUM**

Schedules are specified per class; nothing describes the job that enforces them, or how deletion interacts with the audit log and statutory financial retention.

### U-06 — No secret rotation mechanism · **MEDIUM**

Secrets are "environment-provided, rotated on exposure". No procedure. V-01 makes this immediate.

### U-07 — Environment separation is absent and actively violated · **CRITICAL**

There is no environment topology anywhere in Phase 2 — no dev/staging/production separation, no rules about which database a given environment may reach. `PHASE-2.5-DATABASE-VERIFICATION.md` V-01 shows the consequence: the development configuration points at production, disabling every `NODE_ENV`-keyed safety control.

**Required before Phase 3.** This is a prerequisite for the whole migration strategy, which assumes a rehearsal environment that does not exist.

---

## 4. What must not be simplified away

| Component | Why it stays |
|---|---|
| **Double-entry ledger** | The Phase 0 finding was that `users.balance` is unreconcilable. Single-entry does not fix that |
| **In-transaction audit log** | An audit record that can be lost is not one |
| **Authorization kernel** | Three implementations produced the IDOR class |
| **Three-layer idempotency** | Each layer caught a different Phase 0 P0 |
| **Server-authoritative pricing** | P0-3 |
| **Transactional outbox** | Dual-write reproduces the "credited but unlogged" class |
| **Nine-state truthfulness** | The AI safety mechanism |
| **Tier A/B/C tool partition** | The AI containment mechanism |
| **Emergency isolation + capability-as-data** | Highest-harm class |
| **Accounts + memberships** | `users.role` cannot express reality |
| **Integer minor units** | Cheap now, a migration later |

---

## 5. Simplified Gate-1 target

```
Modules    5   identity · marketplace · booking · finance · platform
Entities  ~38  (from ~70)
Events    ~16  (from ~45)
Machines   6   guarded; the rest are validated enums
AI tools   0   (Gate 1 has no AI by definition)
Contexts   4 + Platform
```

**Nothing in §4 is removed.** Every safety property survives. What is deferred is optimisation (S-01, S-03), later-phase capability (S-04, S-05, S-08, S-10), and modelling that split one concept into three (S-02).

---

## 6. Net effect

| | Removed | Added |
|---|---|---|
| Over-engineering | 10 simplifications, ~45% of Gate-1 surface | — |
| Under-engineering | — | 7 gaps, 3 of them blocking |

The architecture was **simultaneously over-built for the first release and under-built on operational foundations.** The corrections pull in opposite directions and both are required: defer the projections and the Trust Graph; add environment separation, a testing strategy, and backup/restore before writing implementation code.
