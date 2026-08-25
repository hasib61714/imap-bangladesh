# IMAP 2.0 — Gate-1 Implementation Map

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Frozen scope:** `GATE-1-ARCHITECTURE.md` · **Structure:** `TARGET-REPOSITORY-STRUCTURE.md`
**0 AI tools. Anything not listed here is deferred.**

---

## Module 1 — `platform`

**Purpose.** The substrate every other module stands on: audit, authorization, events, jobs, idempotency, notification dispatch, feature availability. It has no domain of its own and no business rules. It is built first because audit and authorization cannot be retrofitted convincingly — `CREDENTIAL-INCIDENT.md` §2 is the evidence.

| | |
|---|---|
| **Entities (6)** | `audit_record` · `authorization_policy` (registry, in code) · `outbox_event` · `job` · `feature_flag` · `schema_migration` |
| **Commands** | `WriteAuditRecord` (internal only) · `EnqueueJob` · `PublishEvent` (internal) · `SetFeatureFlag` |
| **Queries** | `GetJobStatus` · `SearchAuditLog` · `GetHealth` · `GetFeatureAvailability` |
| **State machines** | none. `job.state` and `outbox_event.state` are validated enums |
| **Events produced** | none |
| **Events consumed** | **all 16** — every event writes an audit record |
| **Authorization** | `audit.read` (admin) · `audit.write` (**nobody** — Tier C) · `job.read` (owner or admin) · `feature.set` (admin, reason required) |
| **Tables** | `audit_log` · `outbox_event` · `job` · `idempotency_key` · `feature_flag` |
| **External** | Redis (cache, OTP store, rate limits) |
| **Tests** | audit atomicity · audit immutability · policy-registration startup assertion · outbox in-transaction · job idempotency · idempotency replay |
| **Frontend** | none (admin surfaces read the audit log in Module 5) |
| **Depends on** | nothing |
| **Order** | **I-02 … I-05** |

### Non-negotiables

1. `WriteAuditRecord` accepts a transaction handle and **fails if not given one**. There is no path to an audit record outside a transaction.
2. The application database role has `INSERT` and `SELECT` on `audit_log` and nothing else. Immutability is a grant, not a discipline.
3. `composition/policies.js` asserts at startup that every registered use case has a policy and every policy names a resource. **The process refuses to start otherwise.**
4. Every job declares `idempotent: "key"` or `idempotent: "at-least-once"` (AD-024). A job declaring neither throws at registration.

---

## Module 2 — `identity`

**Purpose.** Who someone is, what accounts they act for, and what has been verified about them. Replaces `users.role` with accounts and memberships (AD-017), and owns the capability-verification *decision* (O-01).

| | |
|---|---|
| **Entities (8)** | `principal` · `credential` · `session` · `account` · `membership` · `contact_verification` · `verification_case` · `identity_document` |
| **Commands** | `RegisterPrincipal` · `AuthenticateWithPassword` · `AuthenticateWithOtp` · `RequestOtp` · `AuthenticateWithGoogle` · `RefreshSession` · `RevokeSession` · `VerifyContact` · `SubmitIdentityDocument` · `DecideVerificationCase` · `DecideCapabilityVerification` · `GrantMembership` · `RevokeMembership` · `CloseAccount` |
| **Queries** | `GetMe` · `GetVerificationStatus` · `ListPendingCases` · `GetIdentityDocumentUrl` (signed, audited) |
| **State machines** | **VerificationCase** (#4). Principal status and contact-verification level are validated enums, not machines |
| **Events produced** | `account.created` · `identity.verified` · `capability.verified` |
| **Events consumed** | none |
| **Authorization** | `identity.register` (anon) · `session.revoke` (self) · `verification.decide` (admin, reason, **Tier C**) · `verification.read_document` (admin, reason, **every read audited** — V-07) · `membership.grant` (admin, Tier C) |
| **Tables** | `principal` · `credential` · `session` · `account` · `membership` · `contact_verification` · `verification_case` · `identity_document` |
| **External** | SMS provider (OTP) · Google OAuth · object storage (documents) |
| **Tests** | matrix rows 1, 2, 19, 25 — NULL hash never authenticates · constant-time compare · no privilege escalation via registration or profile update · Sealed document access denied without role · self-asserted regulated capability is not `verified` |
| **Frontend** | `features/auth` · `features/account` · KYC capture |
| **Depends on** | platform |
| **Order** | **I-06 … I-07** |

### Non-negotiables

1. **No credential row means no password login.** The Phase 0.5 rule becomes structural: absence of a row, not a NULL column.
2. Roles are read from the database on every request, never from a token claim.
3. `identity_document` stores an object key. **No bytes in the database** (AD-011) and no base64 fallback in production.
4. Capability *declaration* belongs to `marketplace`; the *decision* is here. `provider_capability.verified` is a projection of this module's decision (O-01).

---

## Module 3 — `marketplace`

**Purpose.** What can be bought, who can do it, where, when, and for how much. This is where the Service Graph replaces three conflicting taxonomies.

| | |
|---|---|
| **Entities (9)** | `service` · `service_category` · `service_edge` · `capability` · `provider` · `provider_capability` · `provider_coverage` · `availability_window` · `availability_hold` |
| **Commands** | `CreateService` · `PublishService` · `DeprecateService` · `SubmitProviderApplication` · `ApproveProvider` · `RejectProvider` · `SuspendProvider` · `PauseListing` · `ResumeListing` · `DeclareCapability` · `SetCoverage` · `SetProviderPrice` · `PublishAvailability` · `HoldSlot` · `ReleaseSlot` |
| **Queries** | `SearchServices` · `GetService` · `GetRelatedServices` · `FindProviders` · `GetProvider` · `GetAvailability` |
| **State machines** | none as machines. Provider listing state is a **validated enum with guarded transitions** — see §Deviation below |
| **Events produced** | `provider.approved` · `provider.suspended` |
| **Events consumed** | `identity.verified` · `capability.verified` · `review.submitted` (rating view) |
| **Authorization** | `provider.list` — **Trust-granted eligibility only, no self-listing** (D-005) · `provider.approve` (admin, reason) · `provider.suspend` (admin, reason, Tier C) · `catalog.publish` (admin) · `provider.set_price` (owner) |
| **Tables** | `service` · `service_category` · `service_edge` · `capability` · `service_capability_req` · `provider` · `provider_capability` · `provider_coverage` · `provider_price` · `availability_window` · `availability_hold` · `area` |
| **External** | none |
| **Tests** | matrix rows 18, 19 — an unapproved provider is not listed · a provider cannot self-approve · two concurrent holds on one slot: exactly one wins (R-207) |
| **Frontend** | `features/discovery` · `features/provider` (profile, schedule, onboarding) |
| **Depends on** | platform, identity |
| **Order** | **I-09 … I-10** |

### Deviation from `GATE-1-ARCHITECTURE.md` §5, declared

The frozen six state machines do **not** include provider listing, yet `STATE-MACHINES.md` §2 models nine states with guarded transitions and D-005 makes `applied → listed` the audited defect that must be impossible.

**Resolution:** provider listing is implemented as a **guarded enum** — the same `UPDATE … WHERE state = ?` + `affectedRows` pattern and the same transition table as a machine, without a separate machine abstraction. It is not promoted to a seventh machine, and the forbidden transition `applied → listed` is a test, not a comment. Gate-1 states: `applied · under_review · approved · listed · paused · suspended · rejected`. `more_info` and the appeal path are deferred to Gate 2.

### Non-negotiables

1. **`availability_hold` has a unique constraint on `(window_id)` while active.** R-207's acceptance test is two concurrent bookings; exactly one succeeds. This is the constraint that makes double-booking impossible, and it is the reason `provider_schedule` is rewritten rather than migrated.
2. Discovery is a relational query over four tables. **No projection table** (AD-022).
3. The service graph is held in memory and rebuilt on change. **No closure table** (AD-021).
4. Text search uses `service_synonym` and indexed name columns. `LIKE '%q%'` across five columns does not survive.

---

## Module 4 — `booking`

**Purpose.** The central lifecycle, plus everything scoped to a booking: messaging, reviews, disputes — and emergency.

| | |
|---|---|
| **Entities (8)** | `booking` · `booking_participant` · `booking_event` · `dispute` · `conversation` · `message` · `review` · `emergency_request` |
| **Commands** | `CreateBooking` · `AcceptBooking` · `DeclineBooking` · `StartWork` · `MarkArrived` · `ReportWorkDone` · `ConfirmCompletion` · `CancelBooking` · `RaiseDispute` · `ResolveDispute` · `SendMessage` · `SubmitReview` · `RaiseEmergency` · `AcknowledgeEmergency` |
| **Queries** | `GetBooking` · `ListMyBookings` · `GetConversation` · `ListProviderReviews` · `GetEmergencyCapabilities` · `GetHotlines` |
| **State machines** | **Booking** (#1) · **Dispute** (#5) · **EmergencyRequest** (#6) |
| **Events produced** | `booking.created` · `booking.confirmed` · `booking.completed` · `booking.cancelled` · `booking.disputed` · `dispute.resolved` · `review.submitted` · `emergency.raised` |
| **Events consumed** | `payment.captured` · `payment.failed` · `refund.issued` (all three update the `booking.payment_status` **read model** only — O-02) |
| **Authorization** | `booking.observe` (participant) · `booking.accept` (assigned provider, state=pending) · `booking.confirm_completion` (**customer only**, state=awaiting_confirmation) · `booking.cancel` (participant; from `active` **admin only**) · `message.send` (participant) · `review.submit` (customer of a completed unrated booking) · `emergency.raise` (any authenticated) |
| **Tables** | `booking` · `booking_participant` · `booking_event` · `dispute` · `conversation` · `message` · `review` · `emergency_request` · `emergency_ack` · `donor_consent` · `contact_release` · `verified_source` · `hotline` |
| **External** | none directly (notifications via platform jobs) |
| **Tests** | matrix rows 3–6, 20–23 — every illegal transition refused · concurrent transition has exactly one winner · non-participant cannot read or join · emergency failure shows the hotline |
| **Frontend** | `features/booking` · `features/activity` · `features/emergency` · `features/provider` (jobs) |
| **Depends on** | platform, identity, marketplace |
| **Order** | **I-11 … I-13** |

### Non-negotiables

1. **A provider can never reach `completed`.** Only the customer confirms, or the disclosed auto-confirm window elapses (R-505). Admin override is audited with a reason.
2. The auto-confirm deadline is **set and shown at the moment `awaiting_confirmation` starts**, never applied retroactively.
3. Emergency keeps its stricter contract in full despite living in this module (`GATE-1-ARCHITECTURE.md` §2.1): no state called `dispatched`; the response reports how many admins were actually reachable; **on any failure the hotline is surfaced**.
4. `booking.payment_status` is a read model. No booking use case writes it.

---

## Module 5 — `finance`

**Purpose.** Every amount, and the ledger that makes them reconcilable. The hardest correctness problem in the system, built third — before anything depends on it.

| | |
|---|---|
| **Entities (7)** | `quote` · `payment` · `ledger_transaction` · `ledger_entry` · `ledger_account` · `balance_projection` · `payout_claim` |
| **Commands** | `IssueQuote` · `InitiatePayment` · `RecordGatewayCallback` · `SettleCashPayment` · `ApproveRefund` · `ExecuteRefund` · `AccrueEarnings` · `MarkPayable` · `RequestPayout` · `ExecutePayout` · `HoldFunds` · `ReleaseFunds` |
| **Queries** | `GetQuote` · `GetPaymentStatus` · `GetBalance` · `ListLedgerEntries` · `GetEarnings` (gross · commission · net · payout state — R-904) |
| **State machines** | **Payment** (#2, including refund sub-states) · **PayoutClaim** (#3) |
| **Events produced** | `payment.captured` · `payment.failed` · `refund.issued` |
| **Events consumed** | `booking.completed` (allocate) · `booking.cancelled` (refund) · `booking.disputed` (**hold** — O-03) · `dispute.resolved` (release or redirect) |
| **Authorization** | `payment.initiate` (booking's customer) · `refund.approve` (admin, reason) · `payout.execute` (admin; **not the approver of the same claim** — see §Deviation) · `ledger.read` (owning account, or admin) |
| **Tables** | `quote` · `quote_component` · `payment` · `payment_attempt` · `refund` · `ledger_account` · `ledger_transaction` · `ledger_entry` · `balance_projection` · `payout_claim` · `commission_accrual` |
| **External** | SSLCommerz |
| **Tests** | matrix rows 7–17 — all eight ledger flows balance · derived equals stored after every operation · duplicate callback credits once · two concurrent callbacks credit once · client price ignored at every endpoint |
| **Frontend** | booking approval surface · payment · `features/provider/earnings` |
| **Depends on** | platform, identity; booking **via events only** |
| **Order** | **I-08** (ledger core), **I-14 … I-15** (payment, payouts) |

### Deviation from `AUTHORIZATION-ARCHITECTURE.md` §7, declared

That document requires separation of duties: *the approver of a refund is not the executor of the payout*. `GATE-1-ARCHITECTURE.md` §8 defines four roles, of which one is `admin` — so at Gate 1 there is one platform role and, in practice, one person.

**Separation of duties cannot be enforced at Gate 1 and this blueprint does not pretend otherwise.** Resolution:

* Policies are **written against the six platform roles** (`support`, `finance`, `trust_safety`, `operations`, `emergency_responder`, `platform_owner`) from the first commit.
* At Gate 1, the single `admin` membership is granted all six. Tightening later is a **membership change, not a code change**.
* The same-actor approve-then-execute path is permitted **and writes an audit record flagged `sod_bypass`**, so the exception is counted rather than invisible.
* Enforcement switches on when a second operator exists. That is a launch decision with an owner, recorded in `IMPLEMENTATION-RISK-REGISTER.md` R-11.

### Non-negotiables

1. **The client never sends an amount.** It sends a `quote_id`. This is where P0-3 becomes structurally impossible.
2. Every ledger transaction carries a deterministic `reference` under a **unique** index, and every transaction balances in the domain before the write.
3. `ledger_entry` has no `UPDATE` and no `DELETE` path — no use case, no endpoint, no repository method.
4. Balance is **derived**. `users.balance` does not survive; the projection is rebuildable from entries alone and reconciled nightly.
5. `PLATFORM_FEE_PCT` defaults to **0** and stays there until a business owner decides D-009.

---

## Cross-module summary

| Module | Entities | Commands | Queries | Machines | Events out | Events in | Tables |
|---|---:|---:|---:|---:|---:|---:|---:|
| platform | 6 | 4 | 4 | 0 | 0 | 16 | 5 |
| identity | 8 | 14 | 4 | 1 | 3 | 0 | 8 |
| marketplace | 9 | 15 | 6 | 0¹ | 2 | 3 | 12 |
| booking | 8 | 14 | 6 | 3 | 8 | 3 | 13 |
| finance | 7 | 12 | 5 | 2 | 3 | 4 | 11 |
| **Total** | **38** | **59** | **25** | **6** | **16** | — | **49** |

¹ provider listing is a guarded enum, not a machine — see Module 3.

**49 tables for 38 entities:** join tables (`service_capability_req`, `booking_participant`), sub-entities kept separate for immutability (`quote_component`, `payment_attempt`), and platform tables with no domain entity (`idempotency_key`).

---

## Dependency direction

```
platform  ← identity  ← marketplace  ← booking
    ↑          ↑                          ↕ (events only)
    └──────────┴──────── finance ─────────┘
```

**One cycle, and it is deliberate:** booking ↔ finance. Both write directions are event-only; synchronous reads are permitted (V-08, `EVENT-ARCHITECTURE.md` B2). A synchronous write in either direction is an architecture violation, checked by the import-boundary lint rule.

---

## Implementation order

| # | Phase | Module | Delivers |
|---|---|---|---|
| I-01 | Foundation | — | structure, lint rules, CI, contract skeleton |
| I-02 | Audit | platform | `audit_log`, in-transaction helper |
| I-03 | Authorization | platform | kernel, registry, startup assertion |
| I-04 | Events | platform | outbox, dispatcher, consumer idempotency |
| I-05 | Jobs | platform | queue, idempotency, DLQ, notification dispatch |
| I-06 | Identity core | identity | principal, account, membership, session |
| I-07 | Verification | identity | KYC, capability decisions, object storage |
| I-08 | Ledger | finance | accounts, transactions, entries, projection |
| I-09 | Catalog | marketplace | service graph, capabilities, migration |
| I-10 | Provider | marketplace | profile, coverage, availability, holds |
| I-11 | Quote + booking | booking + finance | quote issuance, booking creation |
| I-12 | Booking lifecycle | booking | full state machine, messaging, reviews |
| I-13 | Emergency | booking | requests, hotlines, blood consent |
| I-14 | Payment | finance | gateway, settlement, refunds |
| I-15 | Payouts | finance | claims, clearance, execution |
| I-16 | Realtime | transport | outbox-driven rooms |
| I-17–20 | Frontend | — | `APP-JSX-MIGRATION.md` |
| I-21 | E2E | — | Gate-1 exit criteria |

Derived in `IMPLEMENTATION-DEPENDENCY-GRAPH.md`, not assumed.
