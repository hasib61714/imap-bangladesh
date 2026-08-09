# IMAP 2.0 — Phase 2.5 Architecture Validation

**Status:** VALIDATION · **Phase:** 2.5 · **Date:** 2026-08-09
**Companions:** `PHASE-2.5-DATA-OWNERSHIP.md` · `PHASE-2.5-SIMPLIFICATION.md` · `PHASE-2.5-DATABASE-VERIFICATION.md` · `PHASE-2.5-GATE-REPORT.md`
**Scope:** read-only. No application code, schema, migration, dependency or configuration was modified.

---

## 1. Finding index

| ID | Finding | Severity | Blocks Phase 3? |
|---|---|---|---|
| **V-01** | Development `.env` targets the production database; every `NODE_ENV`-keyed Phase 0.5 guard is disabled against production data | **CRITICAL** | **YES** |
| **V-02** | No environment exists in which any migration step can be rehearsed; `MIGRATION-STRATEGY.md` assumes one | **HIGH** | **YES** |
| **V-03** | `customer_settlement` account used in worked ledger flows but absent from the account-kind taxonomy | HIGH | YES (doc fix) |
| **V-04** | Refund ledger entries presented in the wrong order (settlement before recognition) | MEDIUM | No |
| **V-05** | Job-level idempotency unspecified — a retried job can repeat an external side effect | HIGH | YES (doc fix) |
| **V-06** | Phase 2 classifies against a single "MVP"; Phase 1 defines two gates | HIGH | YES (doc fix) |
| **V-07** | Audit timing for Tier-A (read) AI tool calls unspecified — there is no state-change transaction to write inside | MEDIUM | No |
| **V-08** | Booking ↔ Finance runtime cycle real but not stated as a rule | MEDIUM | No |
| **O-01** | Capability *verification* has no declared owner | HIGH | YES (doc fix) |
| **O-02** | Booking payment status has two plausible owners | HIGH | YES (doc fix) |
| **O-03** | Dispute state vs held funds — split authority | MEDIUM | No |
| **O-04** | Standing copied into a Marketplace projection, not labelled derived | LOW | No |
| **U-01…U-07** | Under-engineering gaps (`PHASE-2.5-SIMPLIFICATION.md` §3) | 3 HIGH/CRITICAL | **YES** (U-02, U-03, U-07) |
| **S-01…S-10** | Over-engineering simplifications | — | No (recommended) |

**Nothing found invalidates a Phase 2 design decision.** Every finding is either a specification gap, a phasing error, or an operational prerequisite. The architecture's shape is sound; its edges and its environment are not yet.

---

## 2. Master validation matrix

| Area | Phase 1 requirement | Phase 2 design | Current code | Compatible? | Gap | Severity |
|---|---|---|---|---|---|---|
| **Product** | Need→resolution loop, two gates (`PRD.md` §11) | Loop is the organising principle of `SYSTEM-ARCHITECTURE.md` §1 | Category→provider→book only | ✅ | Phase 2 does not phase its own output by gate | **V-06** |
| **UX** | Real routing, empty states, continuity (U1, R-801) | `apps/web` routes; task context server-held | ~30 page keys in React state; fallback constants | ✅ | — | — |
| **Frontend** | 4 audiences, no god component | 2 builds + packages (AD-012) | `App.jsx` 5,567 lines, no routing | ✅ | Decomposition is the largest single work item | — |
| **Backend** | Server-authoritative everything (P6) | 4 layers, boundary lint (AD-001/003) | SQL inline in 18 route files | ✅ | — | — |
| **Database** | One taxonomy, ledger, audit (R-202, R-607, R-1101) | ERD, ~70 entities | 17 declared + 8 runtime-created tables | ✅ | ~38 sufficient at Gate 1 | **S-**series |
| **Booking** | State machine, customer-confirmed completion (R-505) | 7 states, guarded, actor-constrained | 5 states (Phase 0.5), no `arrived`/`awaiting_confirmation` | ✅ | Declared as C-05 in Phase 2 | — |
| **Pricing** | Server-authoritative, 3 models (R-304/305) | Quote entity, fail-closed | Fail-closed hourly only (Phase 0.5) | ✅ | — | — |
| **Payments** | IPN-only, reconciled (R-605) | 4-state domain machine + adapter | IPN-only, reconciled (Phase 0.5) | ✅ | C-02 already declared | — |
| **Ledger** | Derived balance (R-607) | Double-entry, 9 account kinds | Mutable `users.balance` | ⚠️ | Undeclared 10th account in worked flows | **V-03** |
| **Trust** | Multi-signal, explainable (D-004) | Trust context + signals + standing | `trust_score` written once, read never | ✅ | Not a context at Gate 1 | **S-04** |
| **Identity** | Accounts + memberships (AD-017) | principal/account/membership | `users.role` enum | ✅ | Capability verification unowned | **O-01** |
| **Realtime** | Authorized rooms (R-1010, P0-7) | Verified membership, admin room | Phase 0.5 fix already matches target | ✅ | — | — |
| **Events** | — | Transactional outbox, ~45 events | `io.emit` inside handlers | ✅ | 8 events have no consumer | **S-05** |
| **AI** | Tool chain, 9 states (D-002/008) | Gateway, tools, tiers, evals | Chat proxy + 8 rule scorers | ✅ | Tool set halvable; read-tool audit timing | **S-08, V-07** |
| **Emergency** | Truthful, isolated (R-1001…1010) | Isolated context, capability-as-data | Truthful since Phase 0.5 | ✅ | — | — |
| **Audit** | Every state change (R-1101) | In-transaction, append-only | **None** | ✅ | Read-tool timing | **V-07** |
| **Security** | One kernel (P0-1…P0-12) | Kernel + policy registry | 3 implementations | ✅ | **Guards defeated by environment** | **V-01** |
| **Observability** | Traceable (R-1106) | Correlation, metrics, traces | Winston + `/api/health` | ✅ | — | — |
| **Migration** | Incremental, reversible | 6 steps with stop conditions | — | ⚠️ | **No environment to rehearse in** | **V-02** |

---

## 3. Product → architecture traceability

Sampled across every Phase 1 requirement family. No requirement was found without an architectural home.

| Requirement | Domain | Data | Command | Event | UX | Security boundary |
|---|---|---|---|---|---|---|
| R-101 need→service | Discovery | `need`, `need_event` | `RecordNeed`, `UnderstandNeed` | `need.expressed/understood` | F1 Ask IMAP | Public; principal-scoped when signed in |
| R-207 no double-booking | Availability | `availability_window`, `slot_hold` | `HoldSlot` | `slot.held` | F1 slot picker | Provider owns windows |
| R-302 inspectable ranking | Discovery | `ranking_explanation` | `RankCandidates` | — | Results "why this order" | Public |
| R-304 complete price | Pricing | `quote`, `quote_component` | `IssueQuote` | `quote.issued` | F1·N approval | Server-only issuance |
| R-410 customer verification | Identity | `contact_verification` | `VerifyContact` | `identity.contact_verified` | F5 provider sees level | Provider reads level, not the value |
| R-505 customer completion | Booking | `booking`, `booking_event` | `ConfirmCompletion` | `booking.completed` | F2 awaiting_confirmation | Customer-only policy |
| R-607 earnings ledger | Finance | `ledger_*`, `payout_claim` | `PostTransaction` | `finance.earnings_accrued` | Provider earnings | Finance role |
| R-705 AI actions audited | AI + Audit | `ai_tool_call`, `audit_log` | tool runtime | `ai.tool_invoked` | — | Acting user's permissions |
| R-803 tiered context | AI Context | `context_item`, `context_grant` | `AssembleContext` | — | `/me/context` | Sealed structurally excluded |
| R-904 earnings breakdown | Finance | `payout_claim`, `commission_accrual` | `GetEarnings` | — | F5 net primary | Own account only |
| R-1001 999 prominence | Emergency | `hotline`, `feature_availability` | `GetCapabilities` | — | F6 | Public |
| R-1010 provider emergency | Emergency | `emergency_request` | `CreateEmergencyRequest` | `emergency.request_received` | F6 provider variant | Responder room only |
| R-1101 audit | Audit | `audit_log` | in-transaction write | — | Ops surfaces | Write-only from other contexts |
| R-1108 need entity | Discovery | `need` | `RecordNeed` | `need.*` | — | Principal-scoped |

### 3.1 Architecture with no product justification

The reverse test. Components present in Phase 2 that no Phase 1 requirement demands:

| Component | Justification found? | Verdict |
|---|---|---|
| `service_edge_closure` | No — a performance optimisation for a scale that does not exist | **S-01 defer** |
| `provider_service_area` | No — same | **S-03 defer** |
| `payout_batch` | No — manual payouts at Gate 1 | **S-10 defer** |
| `trust_signal`, `appeal` | Phase F only | **S-04 defer** |
| `summarise` tool | No requirement | **S-08 remove** |
| `proposeEmergencyRequest` tool | Contradicted by Constitution §4 ("one deliberate action") | **S-08 remove** |
| `service_variant` | R-305 variants — weak | Already post-MVP |
| `eval_case/run/result` | R-710 | Justified |
| `feature_availability` | R-1002 capability-as-data | Justified |
| 8 consumerless events | No | **S-05** |

Everything else traces to a requirement.

---

## 4. Domain boundary validation

Each domain tested against six questions (brief §5). Domains failing on "owns real business rules" **and** "owns state" are marked COLLAPSE.

| Domain | Rules | State | Data | Commands | Queries | Events | Verdict |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Identity | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| Account/Membership | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| KYC/Verification | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep — **must absorb capability verification (O-01)** |
| Catalog | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| Provider | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| Availability | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep — the slot-hold invariant is real |
| Discovery | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| **Matching/Recommendation** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | **COLLAPSE** into Discovery — Phase 2 already says "not a separate service", but lists it as a domain |
| Booking | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| Quote/Pricing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| Messaging | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| Dispute | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep (Phase F) |
| Ledger | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Keep — no events is correct; the ledger is the record, not a notifier |
| Payment | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| Payout | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| **Commission** | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | **COLLAPSE** into Pricing (rate) + Ledger (accrual). It owns a percentage and an accrual entry — neither needs a domain |
| Refund | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| Trust | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep **from Phase F** (S-04) |
| Review | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| Fraud/Abuse | ✅ | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | **COLLAPSE** into Trust — it produces signals, which Trust owns |
| AI Orchestration | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep (Gate 2) |
| AI Context | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Keep (Gate 2) |
| **AI Evaluation** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **COLLAPSE** — it is CI tooling, not a domain |
| Emergency Request | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| Blood Registry | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| Verified Source | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Keep |
| Audit | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Keep |
| Notification | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep |
| Analytics | ⚠️ | ✅ | ✅ | ❌ | ✅ | ❌ | Keep — a read model, correctly non-authoritative |
| Administration | ⚠️ | ❌ | ❌ | ⚠️ | ✅ | ❌ | **COLLAPSE** — it is a transport surface over other domains, not a domain |
| Promotion | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep (post-MVP) |
| Loyalty | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Keep (post-MVP) |

**5 COLLAPSE recommendations:** Matching, Commission, Fraud/Abuse, AI Evaluation, Administration. None is implemented in this phase.

**Result: 28 required domains → 23**, before the Gate-1 phasing in `PHASE-2.5-SIMPLIFICATION.md` reduces the *first-build* set further.

---

## 5. Coupling matrix

| Domain | Depends on | Direction | Mechanism | Risk |
|---|---|---|---|---|
| Marketplace | Identity | → | Query | Low |
| Marketplace | Trust | → | Event (`standing_changed`) | Low |
| Booking | Marketplace | → | Query + command (hold) | Medium — the slot hold is a cross-context command |
| Booking | Pricing | → | Query (`quoteId`) | Low |
| **Booking ↔ Finance** | **both** | **↔** | **Event both ways** | **Medium — V-08** |
| Finance | Booking | → | Event | Low |
| Trust | Booking, Review, Dispute | → | Event | Low |
| Discovery | Marketplace, Trust | → | Query + projection | Low |
| AI | everything | → | Tool → use case only | Low — the constraint is structural |
| Emergency | Identity, Booking | → | Reference only | Low |
| Platform | all | ← | Write-only in | Low |

**Circular dependencies: one** (Booking ↔ Finance). Assessed in `PHASE-2.5-DATA-OWNERSHIP.md` §6 as benign because both write directions are event-only. **V-08: this must be stated as a rule in `DOMAIN-ARCHITECTURE.md`, not left as a diagram artefact.**

**Cross-domain writes: none by design.** Two are at risk of becoming so through under-specification (O-02, O-03).

**Shared mutable state: none.** Balance, standing and the discovery projection are all explicitly derived.

---

## 6. Entity justification

~70 entities classified. Full register in `DATA-ARCHITECTURE.md` §3; here are the ones the brief calls out plus every entity whose classification changed.

| Entity | Class | Why it exists | Owner | Could another represent it? |
|---|---|---|---|---|
| **Need** | **CORE** | R-1108; the North Star is uncomputable without it | Discovery | No |
| **NeedUnderstanding** | **COLLAPSE → `need_event`** | An event on the need, not an aggregate | Discovery | **Yes — S-02** |
| **NeedOutcome** | **COLLAPSE → `need_event`** | Same | Discovery | **Yes — S-02** |
| **Goal** | **FUTURE** | LATER in Phase 1 | Catalog | — |
| **Task** | **REMOVE** | Never appears in Phase 1 or Phase 2 beyond the brief's suggestion list. A goal-task is `booking`; an AI task is `ai_task` | — | Yes |
| **ServiceVariant** | **OPTIONAL** | R-305 sizing. Weak justification | Catalog | Yes — an attribute on `provider_price` |
| **Quote** | **CORE** | The mechanism that makes P0-3 impossible | Pricing | **No** |
| **Price** (standalone) | **REMOVE** | Phase 2 has `provider_price` and `quote_component`. A separate `Price` entity is the brief's suggestion, not Phase 2's design | — | Yes |
| **TrustSignal** | **REQUIRED, Phase F** | Append-only observations behind an appealable standing | Trust | No — but not needed at Gate 1 (S-04) |
| **AIContext** | **REQUIRED, Gate 2** | R-803 tiering | AI Context | No |
| **AIMemory** | **REMOVE — duplicate** | Phase 2 has one `context_item` table. "Memory" and "context" are the same store | — | **Yes — it is `context_item`** |
| **AITask** | **REQUIRED, Gate 2** | The Tier-B confirmation gate needs a durable task | AI | No |
| **AIToolCall** | **REQUIRED, Gate 2** | R-705 | AI | No |
| **BusinessWorkspace** | **FUTURE** | LATER; accommodated by `account.kind = organisation` | Identity | Yes — for now |
| **LedgerAccount** | **CORE** | Double-entry requires accounts | Ledger | No |
| **LedgerEntry** | **CORE** | Double-entry requires entries | Ledger | No |
| **BalanceProjection** | **DERIVED** | Read performance; rebuildable | Ledger | No |
| `service_edge_closure` | **DERIVED → defer** | Optimisation | Catalog | **S-01** |
| `provider_service_area` | **DERIVED → defer** | Optimisation | Marketplace | **S-03** |
| `payout_batch` | **SUPPORTING → defer** | Volume optimisation | Payout | **S-10** |
| `appeal` | **REQUIRED, Phase F** | D-004 appealability | Trust | No |
| `idempotency_key` | **CORE** | AD-010 | Platform | No |
| `audit_log` | **CORE** | R-1101 | Audit | No |
| `outbox_event` | **CORE** | AD-006 | Platform | No |
| `job` | **SUPPORTING** | AD-016 | Platform | Possibly merge — S-09 |
| `feature_availability` | **REQUIRED** | Emergency capability-as-data | Platform | No |

**Removals: 3** (`Task`, standalone `Price`, `AIMemory`). **Collapses: 2** (`NeedUnderstanding`, `NeedOutcome`). **Deferrals: 4.**

---

## 7. State machine validation

All 16 tested against: every state purposeful · every transition has actor, authorization, evidence, side effects · no illegal transition · terminal states terminal · repeats safe.

| Machine | States purposeful | Actor | AuthZ | Evidence | Side effects | Terminal | Repeat-safe | Verdict |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Principal | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Status column (S-06) |
| Provider listing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Pass |
| Service | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ | ✅ | Status column (S-06) |
| **Booking** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **Pass — the strongest machine** |
| **Payment** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Pass; C-02 already declared |
| **Refund** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Pass; **V-04 entry ordering** |
| **PayoutClaim** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Pass; **O-03 hold authority** |
| **Verification** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Pass; **O-01 capability scope** |
| Review | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | Mostly a status (S-06) |
| **Emergency** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Pass — `dispatched` correctly absent |
| **Dispute** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Pass; O-03 |
| **AI task** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Pass — `awaiting_confirmation` cannot self-advance |
| Notification | ✅ | ⚠️ | — | ✅ | ✅ | ✅ | ⚠️ | Status column; **U-01 job idempotency** |
| Ledger entry | n/a | n/a | n/a | n/a | n/a | n/a | ✅ | Correctly has none |
| Lending | n/a | — | — | — | — | — | — | Correctly absent (D-011) |
| Slot hold | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Pass |

**No illegal transition found. No terminal state is escapable. Every money-moving transition is guarded and repeat-safe.**

---

## 8. Booking trace validation (brief §11)

`Need → Booking → Matching → Provider → Confirmation → Execution → Completion → Payment → Review` traced across `PRD.md` §4.4, `USER-JOURNEYS.md` J1, `USER-FLOWS.md` F1/F2, `STATE-MACHINES.md` §4, `FINANCIAL-ARCHITECTURE.md` §4, `EVENT-ARCHITECTURE.md` §4.

| Step | PRD | Journey | Flow | State machine | Financial | Events | Agree? |
|---|---|---|---|---|---|---|---|
| Need | R-101 | J1·2 | F1·A | `need` | — | `need.expressed` | ✅ |
| Quote | R-304 | J1·9 | F1·N | `quote` | §5.3 | `quote_issued` | ✅ |
| Request | R-501 | J1·12 | F1·P | `pending` | intent | `booking.requested` | ✅ |
| Accept | R-501 | J1·14 | F2 | `confirmed` | — | `booking.confirmed` | ✅ |
| Arrive | R-504 | J1·15 | F2 | `arrived` | — | `provider_arrived` | ✅ |
| Work done | R-505 | J1·16 | F2 | `awaiting_confirmation` | — | `work_reported_done` | ✅ (C-05 declared) |
| Complete | R-505 | J1·16 | F2 | `completed` | §4.1 step 3 | `booking.completed` | ✅ |
| Pay | R-605/606 | J1·17 | F1 | payment machine | §4.1/4.2 | `payment.captured` | ⚠️ **O-02** |
| Review | R-403 | J1·18 | — | review | — | `review_published` | ✅ |

**One contradiction: none.** One ambiguity: who owns the booking's paid flag (O-02). Every other step agrees across all six documents.

---

## 9. Financial validation

### 9.1 Ledger balance check

Every worked flow in `FINANCIAL-ARCHITECTURE.md` §4 recomputed:

| Flow | Debits | Credits | Balanced? |
|---|---|---|---|
| Payment captured | 88000 | 88000 | ✅ |
| Booking completed | 88000 | 80000 + 8000 | ✅ |
| Settlement | 88000 | 88000 | ✅ |
| Payout paid | 80000 | 80000 | ✅ |
| Cash commission accrual | 8000 | 8000 | ✅ |
| Cash payout netting | 8000 | 8000 | ✅ |
| Refund settlement | 40000 | 40000 | ✅ |
| Refund reversal | 36000 + 4000 | 40000 | ✅ |

**All balanced.** Two defects in presentation, not arithmetic:

* **V-03 (HIGH).** `customer_settlement` appears in flows 4.1 steps 2–3 but is **not in the nine-kind account taxonomy** in §3.1. An implementer would have to invent it. It is a legitimate transient platform holding account and must be added as a tenth kind, explicitly distinguished from `customer_liability` (which is the non-issuable stored-value placeholder, AD-019).
* **V-04 (MEDIUM).** §4.3 shows the refund *settlement* entry before the *recognition* entry. Correct order: recognise the liability (DR provider_payable + DR commission_revenue / CR refund_liability), then settle it (DR refund_liability / CR gateway_clearing). As written, an implementer following the order literally would credit a liability that had not been recognised.

### 9.2 Financial authority

Every financial command traced for client influence:

| Command | Client supplies | Server determines | Verdict |
|---|---|---|---|
| `IssueQuote` | service, provider, window | **amount, fee, total** | ✅ |
| `CreateBooking` | `quoteId`, address, note | everything monetary | ✅ |
| `InitiatePayment` | `bookingId` | amount from the quote | ✅ |
| `ConfirmCompletion` | booking id | payout, commission | ✅ |
| `RequestRefund` | booking id, reason | amount, eligibility | ✅ |
| `RequestPayout` | — | amount from claims | ✅ |

**No path exists by which a client value reaches a money field.** Gate C's core property holds.

### 9.3 Idempotency — can anything still execute twice?

| Effect | L1 client key | L2 deterministic ref | L3 guarded transition | Safe? |
|---|:-:|:-:|:-:|---|
| Booking creation | ✅ | — | ✅ slot hold | ✅ |
| Payment capture | — | ✅ `payment:<id>:capture` | ✅ CAS | ✅ |
| Provider payout | — | ✅ `booking:<id>:payout` | ✅ | ✅ |
| Commission accrual | — | ✅ | ✅ | ✅ |
| Refund | ✅ | ✅ `:refund:<seq>` | ✅ | ✅ |
| Cancellation refund | — | ✅ | ✅ | ✅ |
| Payout batch execution | ✅ | ✅ | ✅ | ✅ |
| Event consumers | — | ✅ `event_id` unique | — | ✅ |
| **Job execution** | ❌ | ❌ | ❌ | ❌ **U-01** |

**One hole: jobs.** A job that performs an external side effect (SMS, push, email) and crashes before marking itself complete will repeat it on retry. Every other financial effect is triple-protected; jobs have nothing.

---

## 10. Audit coverage

| Operation | Audited? | Actor | Resource | Before/After | Reason | Correlation | Gap |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Booking transitions | ✅ | ✅ | ✅ | ✅ | admin only | ✅ | — |
| Payment / capture | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| Refund | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Ledger transaction | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| Payout | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| KYC decision | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Document access | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | — |
| Admin actions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Authorization denials | ✅ (sensitive) | ✅ | ✅ | n/a | n/a | ✅ | — |
| Emergency access | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | — |
| **AI Tier-B execution** | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | — |
| **AI Tier-A read tools** | ⚠️ | ✅ | ✅ | n/a | n/a | ✅ | **V-07** |
| Membership / role change | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Config change | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Donor contact release | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | — |
| Audit log read | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | — |

**V-07:** AD-009 requires audit inside the state-change transaction. A Tier-A read tool has no state change, so there is no transaction to write inside. `TOOL-CATALOG.md` says Tier-A tools may declare `audit: invocation`, but the *timing* is unspecified. Resolution: read-tool audit is written asynchronously via the job queue with at-least-once tolerance, explicitly exempted from the in-transaction rule and labelled as such. Missing this would either drop read audit or force a pointless transaction around a read.

---

## 11. AI validation

| Property | Verdict | Evidence |
|---|---|---|
| Cannot access the database | ✅ | Model emits tool calls; runtime executes |
| Cannot change money directly | ✅ | Tier B proposes; no commit path |
| Cannot bypass authorization | ✅ | Same kernel, checked twice |
| Cannot invent system state | ✅ | Evidence binding; nine states |
| Cannot invent external actions | ✅ | Capability declaration; no dispatch tool |
| Cannot escalate permissions | ✅ | Acts as the user; no service account |
| Cannot reach Sealed data | ✅ | Assembler has no query for it |

**AI containment: PASS.** The chain in `AI-ARCHITECTURE.md` §3 has no gap.

**Agent justification re-tested (brief §18).** Phase 2 justified two: Intent and Assistant.

* **Intent agent** — is it an agent, or a classifier? It has no tools, no planning, no autonomy. **It is a deterministic service wrapping a model call.** Recommend renaming it a *classifier* to avoid implying autonomy it does not have. Behaviour unchanged; the naming matters because "agent" invites scope creep.
* **Assistant** — genuinely needs bounded planning across multiple tools. Justified as an agent.

**Result: 1 true agent, 1 service.** Correctly conservative.

**Tool audit.** 25 tools tested against nine questions each. 12 KEEP for Gate 2, 2 MERGE, 2 REMOVE, 9 FUTURE (`PHASE-2.5-SIMPLIFICATION.md` S-08).

**AI cost controls** are specified (routing, caching, quotas, cost-per-resolved-need) and measurable. One gap: no *default* quota value is proposed, so an implementer has no starting point. Minor.

---

## 12. Service graph and search validation

**Relational model tested against required queries:**

| Query | Supported relationally? |
|---|---|
| Services related to X | ✅ one join |
| Providers with capability for service X in area Y | ✅ three joins, indexed |
| Available in window W | ✅ range scan |
| Services implied by goal G | ✅ (LATER) |
| Recommendations from co-booking | ✅ aggregate |

**Verdict: relational is sufficient.** Trigger for reconsidering: >500 services, or traversal depth >2 becoming a product requirement, or multi-hop weighted paths for goals.

**Search (AD-005) tested against MVP reality:** 5–8 categories, one city, hundreds of providers, Bangla + English + code-mixed. Structured filtering plus curated synonyms is adequate **because the intent layer is the primary path from Gate 2**. The honest weakness — no Bangla stemming or typo tolerance — is stated in `SERVICE-GRAPH.md` §6 and measurable via `need_outcome.reason = intent_failed`.

**Triggers for dedicated search:** >5,000 active providers · >3 cities · measured search abandonment above threshold · semantic retrieval becoming a requirement. All four are in AD-005 already.

---

## 13. Realtime, events, authorization, privacy, emergency

| Area | Verdict | Notes |
|---|---|---|
| **Realtime** | ✅ PASS | Every channel has publisher, subscriber, membership verification and post-authorization-change behaviour specified. Location windows bounded. Emergency to admin room only |
| **Events** | ⚠️ CONDITIONAL | Outbox atomicity correct; retries, DLQ, ordering, replay and consumer idempotency all specified. **8 events have no consumer (S-05)** |
| **Authorization** | ✅ PASS | Every sensitive action answers who/what/which resource/which relationship/which permission/which state. All seven actor types covered including AI |
| **Privacy** | ✅ PASS | Data classification cross-checked against API responses, realtime payloads, AI context, logs, analytics, notifications and storage. No sensitive class crosses a boundary unnecessarily |
| **Emergency** | ✅ PASS | No first-party disaster claims; blood is a consent registry; SOS truthful; location purpose-limited; all access auditable |

---

## 14. Bangladesh-first and internationalisation

| Concern | Configurable? | Hardcoded anywhere? |
|---|---|---|
| Currency | ✅ `{amount_minor, currency}` | No |
| Country | ✅ `area` hierarchy with `kind` | No |
| Language | ✅ `packages/i18n` | ⚠️ `bn`/`en` assumed in `message_bn`/`message_en` **column names** |
| Timezone | ✅ UTC storage | No |
| Address | ✅ strategy-based | No |
| Tax | ⚠️ Named as unmodelled; **VAT treatment flagged for legal** | No |
| Payment methods | ✅ adapter registry | No |
| Regulatory | ✅ per-market capability rules | No |

**One accidental hardcode:** bilingual columns named `*_bn` / `*_en` bake two specific languages into the schema. A third language would require columns, not rows. **Recommendation:** a `translation(entity_type, entity_id, locale, field, value)` table, or accept the limitation explicitly. Low urgency — no second market is planned — but it is a schema-shaped decision that is expensive to reverse later.

---

## 15. Migration feasibility

Each step re-assessed against actual code, with **V-02 (no rehearsal environment) raising every risk by one level**.

| Step | Downtime? | Rollback? | Data transform | Dual-support | Gate | Risk (was → now) |
|---|---|---|---|---|---|---|
| 0 Guardrails | None | Revert | None | No | CI green | LOW → LOW |
| 1 Foundation (audit, outbox, Redis, storage) | None | Yes | Backfill base64→object | Yes | Audit populated | MEDIUM → **HIGH** |
| 2 Service Graph | None | Yes until cutover | 3 taxonomies → 1; human capability mapping | Yes | One taxonomy serving | HIGH → **VERY HIGH** |
| 3 Ledger | None | Only during dual-write | **Opening balances by human sign-off** | Yes | Clean reconciliation | HIGH → **VERY HIGH** |
| 4 Route extraction | None | Per route | None | Yes | Tests pass | MEDIUM → MEDIUM |
| 5 Frontend decomposition | None | Per route | None | Yes | Route works | MEDIUM → MEDIUM |
| 6 AI layer | None | Flag off | None | Yes | Eval gates | LOW → LOW |
| — Money representation | None | Until columns drop | DECIMAL→BIGINT, exact | Yes | Sum equality | MEDIUM → **HIGH** |

**Two VERY HIGH steps**, both involving irreversible data decisions, both currently unrehearsable. This is the strongest argument for U-07 (environment separation) being a hard prerequisite.

**Current→Target realism (brief §32).** The 17 REWRITE classifications were re-checked. All hold except two worth noting: `services.js` (87 lines) and `utils/cache.js` (57 lines) are labelled REWRITE, which is technically true but misleading — the *work* is the data model and the Redis integration, not the file. `admin.js` (471 lines, no audit, one flat permission) is labelled REFACTOR and is arguably REWRITE. Neither changes the plan.

---

## 16. Frontend architecture validation

| Requirement | Satisfied? |
|---|---|
| Supports consumer, provider, business, admin | ✅ `apps/web` route groups + `apps/admin`; business as a later route group |
| No duplicated business logic | ✅ Domain logic is server-side; the client renders |
| No giant global state | ✅ Four state kinds separated |
| No giant component | ✅ Feature modules + monotonic-shrink rule on `App.jsx` |
| No API logic in presentation | ✅ `packages/api-client` |
| No domain logic in UI | ✅ Server-authoritative |

**State classification tested against the brief's five kinds:**

| Brief's kind | Phase 2 | Present? |
|---|---|---|
| Server state | Query cache | ✅ |
| Client state | Domain/session context | ✅ |
| UI state | Component-local | ✅ |
| Task state | Flow state, server-mirrored | ✅ |
| **AI state** | — | ⚠️ **Not separately classified** |

**Minor gap:** AI conversation and proposal state is neither server state (it is ephemeral until confirmed) nor flow state. It needs its own classification, or proposals risk being cached like server data and re-rendered as if still valid after expiry. Recommend adding a fifth kind to `SYSTEM-ARCHITECTURE.md` §6.2.

---

## 17. Architecture decision review (AD-001 … AD-020)

| AD | Decision | Still valid? | Classification | Reversal trigger |
|---|---|---|---|---|
| AD-001 | Modular monolith | ✅ | **LOCKED** | Scale/ownership triggers |
| AD-002 | Stay MySQL/TiDB | ✅ | **PROVISIONAL** | Semantic search; availability constraints |
| AD-003 | Layered Express | ✅ | **PROVISIONAL** | Team >6 backend engineers |
| AD-004 | Materialised service-graph closure | ⚠️ | **REQUIRES RESEARCH** | **Contradicted by its own reasoning — S-01** |
| AD-005 | No search infrastructure | ✅ | **LOCKED** | Four stated triggers |
| AD-006 | Transactional outbox | ✅ | **LOCKED** | — |
| AD-007 | Double-entry ledger | ✅ | **LOCKED** | — |
| AD-008 | Integer minor units | ✅ | **LOCKED** | — |
| AD-009 | In-transaction audit | ✅ | **LOCKED** | Needs the V-07 read-tool exemption |
| AD-010 | Two-layer idempotency | ⚠️ | **PROVISIONAL** | **Incomplete — jobs uncovered (U-01)** |
| AD-011 | Object storage + signed URLs | ✅ | **LOCKED** | — |
| AD-012 | Two frontend builds | ✅ | **LOCKED** | — |
| AD-013 | Socket.io + Redis adapter | ✅ | **LOCKED** | Connection volume |
| AD-014 | Incremental TypeScript | ✅ | **LOCKED** | — |
| AD-015 | LLM provider abstraction | ✅ | **LOCKED** | — |
| AD-016 | Durable job queue | ⚠️ | **PROVISIONAL** | **Idempotency unspecified (U-01)** |
| AD-017 | Accounts + memberships | ✅ | **LOCKED** | — |
| AD-018 | Relational AI context | ✅ | **PROVISIONAL** | Semantic recall requirement |
| AD-019 | Legally-gated extension points | ✅ | **BLOCKED BY SIGN-OFF** | D-010, D-011 legal review |
| AD-020 | Emergency isolation | ✅ | **BLOCKED BY SIGN-OFF** | D-012, D-013 |

**LOCKED 12 · PROVISIONAL 5 · REQUIRES RESEARCH 1 · BLOCKED BY SIGN-OFF 2.**

No provisional decision has been silently promoted.

---

## 18. Legally-gated decisions — architecture supports either outcome

Per brief §28, no legal conclusion is drawn.

| Decision | Option A (as proposed) | Option B (reversed) | Architecture impact | Migration impact |
|---|---|---|---|---|
| **D-006** feed | No feed; proof-of-work media on profiles | Build a feed | **Additive.** A feed is a new read model + moderation domain. Nothing existing changes | New tables; a moderation function |
| **D-010** stored value | No customer stored value | Licensed wallet | **Low.** `customer_liability` already in the taxonomy (AD-019); activation issues accounts and adds a top-up use case | New account instances; ledger unchanged |
| **D-011** microloans | Removed | Own-book or partner lending | **Own-book: HIGH** — a whole domain, absent by design. **Partner referral: LOW** — one `referral` record | Own-book: substantial. Referral: trivial |
| **D-012** disaster alerts | Signposting only | First-party alerts from an official feed | **Low.** `verified_source` already models provenance; an alert becomes a sourced entity | New table; feed integration |
| **D-013** blood dispatch | Registry, no notification | Automated donor notification | **Medium.** Notification domain exists; the safety design (blood-group matching, alert fatigue, harassment prevention) does not | New matching + notification rules |

**All five reverse without redesign.** D-011 own-book lending is the only one that would be a major build, and that is inherent to the activity, not to the architecture.

---

## 19. Architecture score

Scored against the *validated* architecture, with findings applied. Phase 2 self-scored 4.0.

| Dimension | Phase 2 | **Validated** | Reason for change |
|---|:-:|:-:|---|
| Domain clarity | 4 | **3** | Three ownership ambiguities on money/safety paths (O-01…O-03); five domains that are not domains |
| Data integrity | 5 | **4** | Model is sound; V-03 leaves a worked flow unimplementable as written |
| Financial safety | 5 | **4** | Ledger and idempotency are strong; U-01 leaves jobs uncovered; V-03/V-04 are specification defects on the money path |
| Security | 4 | **2** | Design is strong. **The running environment defeats it (V-01).** A control disabled by configuration is not a control |
| AI readiness | 5 | **5** | Containment chain has no gap; tool set is over-broad but that is scope, not safety |
| UX support | 4 | **4** | Unchanged; AI state classification is a minor gap |
| Realtime | 4 | **4** | Unchanged |
| Scalability | 3 | **3** | Unchanged |
| Testability | 4 | **2** | **No testing strategy exists (U-03).** A ledger and an authorization kernel cannot be built responsibly without one |
| Observability | 4 | **4** | Design complete; nothing instrumented — already reflected |
| Migration feasibility | — | **2** | Two VERY HIGH irreversible steps with **no environment to rehearse in (V-02)** |
| Operational simplicity | 4 | **3** | 14 modules / 70 entities / 45 events is more than Gate 1 needs |
| Cost efficiency | 4 | **4** | Controls specified and measurable |

**Validated score: 3.4 / 5** (Phase 2 self-assessed 4.0).

The drop is concentrated in three places — **security-in-practice, testability and migration feasibility** — and all three are *environmental and procedural*, not design flaws. The design earns its 4; the conditions for building it safely do not yet exist.

---

## 20. What this validation did not do

Stated so the limits of this assurance are clear:

* **No database was contacted.** Migration `002` remains unverified.
* **No code was executed** beyond the existing test suite (unchanged, 31/31).
* **No legal question was answered.** D-006, D-010, D-011, D-012, D-013, VAT treatment and the loan wind-down remain open.
* **No performance figure was measured.** All targets remain provisional.
* **No user research validated the personas.** `PERSONAS.md` assumptions remain untested.
* **This validation reviewed my own Phase 2 work.** An independent reviewer would be a genuinely different check, and the four defects found in my own financial and event design (V-03, V-04, V-05, S-01) suggest that check has value.
