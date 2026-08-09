# IMAP 2.0 — Gate 1 Architecture (FROZEN)

**Status:** FROZEN · **Phase:** 2.75 · **Date:** 2026-08-09
**Authority:** AD-026. This document is the **implementation boundary for Phase 3.**
**Closes:** V-06 · **Adopts:** S-01 … S-10 from `PHASE-2.5-SIMPLIFICATION.md`

> Anything specified in Phase 2 and absent from this document is **deferred, not deleted.**
> It stays designed. It is not built at Gate 1. Adding it back is a scope decision with a
> named owner, not something that happens because a file already describes it.

---

## 1. What Gate 1 is

From `PRD.md`: **the core service loop, working, without any dependency on AI.**

A customer finds a provider, books them, the work happens, money moves correctly, and
both parties can see what occurred. Nothing else.

| In | Out — deferred to Gate 2 or later |
|---|---|
| Accounts, roles, sessions | AI understanding, conversation, tools |
| Service catalogue and search | Trust as a context; reputation scoring |
| Provider profiles, capabilities, coverage | Discovery projection; closure table |
| Availability and booking | Loyalty, promotions, referrals |
| Server-authoritative pricing | Short-form feed (D-006) |
| Payment, ledger, payouts, refunds | Stored value (D-010), lending (D-011) |
| Reviews | Disaster alerts (D-012), blood registry (D-013) |
| Emergency SOS with honest failure | Analytics beyond operational counters |
| Audit log, authorization kernel | Business workspace, multi-provider firms |

### 1.1 Why the split exists

Phase 2 classified everything against one "MVP" and produced ~14 modules, ~70 entities,
45 events, 16 state machines and 25 AI tools. Phase 1 defines **two** gates. Building the
Gate-2 architecture to reach Gate 1 means carrying roughly twice the surface — and every
unused table, event and state machine is somewhere a defect can hide while nobody is
looking at it.

| | Phase 2 | **Gate 1** | Deferred |
|---|---:|---:|---:|
| Modules | 14 | **5** | 9 |
| Bounded contexts | 12 | **4 + Platform** | 7 |
| Entities | ~70 | **~38** | ~32 |
| Events | 45 | **16** | 29 |
| Real state machines | 16 | **6** | 10 |
| AI tools | 25 | **0** | 25 |

Same safety properties. Every financial invariant, every authorization rule, every audit
requirement is in Gate 1. What is deferred is reach, not rigour.

---

## 2. Modules

Five. Validated against the Phase 2.5 recommendation rather than adopted from it — the
grouping below differs in one place, and the reason is given.

```
┌──────────────────────────────────────────────────────────────┐
│  platform    audit · authorization · outbox · jobs · config  │
│              (no domain logic; everything depends on it)     │
└──────────────────────────────────────────────────────────────┘
        ▲            ▲             ▲            ▲
┌───────┴────┐ ┌─────┴──────┐ ┌────┴──────┐ ┌───┴────────┐
│  identity  │ │ marketplace│ │  booking  │ │  finance   │
│            │ │            │ │           │ │            │
│ accounts   │ │ catalogue  │ │ booking   │ │ pricing    │
│ sessions   │ │ providers  │ │ messaging │ │ payment    │
│ KYC        │ │ capability │ │ reviews   │ │ ledger     │
│ capability │ │ coverage   │ │ emergency │ │ payouts    │
│ verification│ │ availability│ │          │ │ commission │
│            │ │ discovery  │ │           │ │            │
└────────────┘ └────────────┘ └───────────┘ └────────────┘
```

| Module | Owns | Depends on |
|---|---|---|
| `platform` | audit records, authorization policy, outbox, job queue, feature availability, environment | nothing |
| `identity` | account, membership, session, contact verification, identity documents, **capability verification decisions** | platform |
| `marketplace` | service catalogue, taxonomy, capability definitions, provider profile, declared capability, coverage, availability, discovery queries | platform, identity |
| `booking` | booking lifecycle, dispute, conversation, review, **emergency request** | platform, identity, marketplace |
| `finance` | quote, price, payment, ledger, payout claim, commission | platform, identity, booking (events only) |

### 2.1 Two placements that need justifying

**Capability *verification* sits in `identity`, not `marketplace`** (O-01). The
declaration — "I do electrical work" — belongs to the provider and lives in
`marketplace`. The *decision* that the certificate is genuine is the same human-review
workflow as identity verification, with the same Sealed evidence handling and the same
Tier-C constraint. Splitting them would give the same evidence two handling regimes.

**Emergency sits inside `booking`, not in its own module** — and this differs from
`AD-020`, which makes Emergency a separate bounded context with a stricter contract.

That AD is right about the *contract* and, at Gate 1, wrong about the *module*. Gate-1
emergency is one entity, three endpoints and an admin notification. A separate module
buys isolation that a 5-module monolith already provides, at the cost of a fifth
top-level boundary for ~200 lines. **The stricter contract is kept in full** — emergency
paths may not be degraded by non-emergency load, may never claim an unverified external
action, and always surface the hotline on failure. It is enforced by tests and by an
explicit contract on the use cases, not by a directory. When D-012 and D-013 are decided
and the surface grows, it becomes its own module; that is AD-020 executing later, not
being abandoned.

---

## 3. Bounded contexts

Four, plus Platform. Down from twelve.

| Context | Collapsed into it | Why the collapse is safe |
|---|---|---|
| **Identity** | KYC, capability verification | Same workflow, same evidence tier, same reviewer |
| **Marketplace** | Catalogue, Provider, Availability, Discovery, **Matching** | Matching at Gate 1 is a filtered query, not a domain. A Matching context with no ranking model is a folder |
| **Booking** | Booking, Messaging, Review, Dispute, Emergency | All keyed on a booking or on a person needing help; all share the same participant authorization |
| **Finance** | Pricing, Payment, Ledger, Payout, **Commission** | Commission is a calculation and two ledger entries. It has no lifecycle of its own |
| **Platform** | Audit, Authorization, Outbox, Jobs, Config | Cross-cutting by definition |

Deferred contexts: **Trust**, **Fraud/Abuse**, **AI**, **AI Evaluation**, **Analytics**,
**Loyalty**, **Administration**.

### 3.1 Trust — what survives without a Trust context

Deferring Trust must not defer *safety*. Checked one capability at a time:

| Capability | Required at Gate 1? | Where it lives instead |
|---|---|---|
| Provider must be approved before listing | **yes** | `provider.is_approved` — already exists, migration `002` |
| Identity verified before approval | **yes** | `identity` — KYC decision |
| Regulated capability verified before bookable | **yes** | `identity` — capability verification (O-01) |
| Contact verification level | **yes** | `identity` |
| Suspension / removal from the directory | **yes** | `marketplace` — an admin command, audited |
| Review capture | **yes** | `booking` |
| Aggregate rating displayed | **yes** | computed view over reviews |
| Composite trust *score* | no | Gate 2 |
| Standing bands, tiering, badges | no | Gate 2 |
| Behavioural signal collection | no | Gate 2 |
| Automated eligibility from signals | no | Gate 2 — humans decide at Gate 1 |

**Every safety-relevant capability survives.** What is deferred is *scoring* — turning
signals into an automatic judgement. At a few hundred providers, a human approving each
one is better than a model nobody has calibrated. Two tables saved, one context saved,
and defect O-04 disappears with the projection.

### 3.2 Discovery without a projection

| Need | Gate-1 mechanism |
|---|---|
| Find services | indexed query on `service` |
| Find providers for a service | join `provider_capability` → `provider` where `is_approved = 1` |
| Filter by area | join `provider_coverage` |
| Filter by availability | join `availability_window` |
| Basic ranking | rating, then completed-booking count, then distance |
| Text search | `LIKE` on indexed name columns; the corpus is a few hundred rows |

Four tables, one query, no projection, no event handlers, no drift. Revisit against
measured p95 latency (AD-022), not against a feeling that it looks unsophisticated.

---

## 4. Entities (~38)

**platform (6)** — `audit_record`, `authorization_policy`, `outbox_event`, `job`,
`feature_flag`, `schema_migration`

**identity (8)** — `account`, `membership`, `session`, `refresh_token`,
`contact_verification`, `identity_document`, `verification_case`, `capability_verification`

**marketplace (9)** — `service`, `service_category`, `service_edge`, `capability`,
`provider`, `provider_capability`, `provider_coverage`, `availability_window`,
`availability_hold`

**booking (8)** — `booking`, `booking_participant`, `booking_event`, `dispute`,
`conversation`, `message`, `review`, `emergency_request`

**finance (7)** — `quote`, `payment`, `ledger_transaction`, `ledger_entry`,
`ledger_account`, `balance_projection`, `payout_claim`

### 4.1 Removed, collapsed, deferred

| | Entity | Reason |
|---|---|---|
| **removed** | `task` | Never distinct from `booking` |
| **removed** | standalone `price` | A price is a field on `quote` |
| **removed** | `ai_memory` | No AI at Gate 1 |
| **collapsed** | `need_understanding` + `need_outcome` → `booking_event` | One append-only event row; the funnel is a query |
| **deferred** | `service_edge_closure` | AD-021 |
| **deferred** | discovery projection | AD-022 |
| **deferred** | `payout_batch` | S-10 — a claim carries its own state; batching is a query until volume needs it |
| **deferred** | `trust_signal`, `provider_standing` | §3.1 |
| **deferred** | all loyalty, promotion, referral entities | Gate 2 |

### 4.2 Ledger accounts (10)

`customer_receivable`, `booking_clearing`, `gateway_clearing`, `platform_cash`,
`provider_payable`, `provider_receivable`, `commission_revenue`, `refund_liability`,
`promotional_expense`, `customer_liability`.

The last is **defined and non-issuable** (AD-019, D-010). `booking_clearing` is AD-023,
and must never be merged with it.

---

## 5. State machines — 6 real, the rest are validated enums

A state machine earns its machinery when transitions are guarded, role-restricted and
audited. Otherwise it is a column with a `CHECK`.

| # | Machine | States | Why it is a machine |
|---|---|---|---|
| 1 | **Booking** | `pending → confirmed → active → awaiting_confirmation → completed`; `disputed`; `cancelled` | Money and obligations turn on it; every transition is role-restricted and audited |
| 2 | **Payment** | `initiated → authorised → captured → settled`; `failed`; `refunded` | External system; ambiguous outcomes; must never guess |
| 3 | **PayoutClaim** | `accrued → payable → paid_out`; `held`; `reversed` | Real money leaving the platform |
| 4 | **VerificationCase** | `submitted → in_review → approved \| rejected`; `expired` | Human decision on Sealed evidence |
| 5 | **Dispute** | `raised → under_review → resolved \| withdrawn` | Holds funds; changes who gets paid |
| 6 | **EmergencyRequest** | `received → dispatched → acknowledged → closed`; `failed` | The truthfulness rule is a state-machine property |

Validated enums, not machines: provider approval, availability hold, review moderation,
message delivery, job status, outbox status, KYC document type, contact verification
level, notification status, emergency severity.

`AD-023`'s ledger entry remains **stateless and immutable** — C-01 resolved.

---

## 6. Events — 16, every one with a consumer

**Binding rule: no event is published that has no consumer.** Producer, consumer,
payload, ordering, idempotency and failure behaviour for all sixteen:

| # | Event | Producer | Consumer(s) | Payload | Ordering | Idempotency | On consumer failure |
|---|---|---|---|---|---|---|---|
| 1 | `account.created` | identity | platform (audit) | account id, role | none | account id | retry → DLQ |
| 2 | `identity.verified` | identity | marketplace (eligibility) | account id, level | per account | (account, level) | retry → DLQ |
| 3 | `capability.verified` | identity | marketplace (bookable) | provider, capability, decision | per provider | (provider, capability, case) | retry → DLQ |
| 4 | `provider.approved` | marketplace | booking, platform | provider id | per provider | provider id | retry → DLQ |
| 5 | `provider.suspended` | marketplace | booking (block new), platform | provider id, reason | per provider | (provider, decision) | **retry indefinitely** — safety |
| 6 | `booking.created` | booking | finance (quote freeze), marketplace (hold) | booking, quote, provider | per booking | booking id | retry → DLQ |
| 7 | `booking.confirmed` | booking | finance, platform | booking id | per booking | booking id | retry → DLQ |
| 8 | `booking.completed` | booking | **finance (allocate)**, platform | booking, amounts | per booking | booking id | **retry indefinitely** — money |
| 9 | `booking.cancelled` | booking | finance (refund), marketplace (release hold) | booking, stage, by | per booking | booking id | retry indefinitely |
| 10 | `booking.disputed` | booking | **finance (hold funds)** | booking, dispute | per booking | dispute id | **retry indefinitely** — O-03 |
| 11 | `dispute.resolved` | booking | finance (release/redirect) | dispute, outcome | per dispute | dispute id | retry indefinitely |
| 12 | `payment.captured` | finance | **booking (read model)**, platform | payment, booking, amount | per payment | payment id | retry indefinitely |
| 13 | `payment.failed` | finance | booking (read model) | payment, reason | per payment | payment id | retry → DLQ |
| 14 | `refund.issued` | finance | booking (read model), platform | refund, booking, amount | per refund | refund id | retry indefinitely |
| 15 | `review.submitted` | booking | marketplace (rating view) | review, provider, rating | per provider | review id | retry → DLQ |
| 16 | `emergency.raised` | booking | platform (admin notify) | request, severity, location | none | request id | **retry indefinitely + alert** |

Delivered through the transactional outbox (AD-006). Written in the same transaction as
the state change; a consumer never sees an event for a change that did not commit.

**"Retry indefinitely" is deliberate.** Events 5, 8, 9, 10, 11, 12, 14 and 16 carry money
or safety. Dead-lettering them means a provider stays listed after suspension, or a
completed booking never pays out. They retry with backoff and alert, and they do not give
up.

**Deferred: 29 events.** Eight of them had no consumer in the Phase 2 model at all
(S-05) and are removed rather than deferred; the other 21 become live with their consumers.

---

## 7. Commands and queries per module

Named commands, not CRUD. Every command carries an authorization policy and writes an
audit record in the same transaction (AD-009).

### identity
`RegisterAccount` · `AuthenticateWithPassword` · `AuthenticateWithOtp` · `RefreshSession`
· `RevokeSession` · `VerifyContact` · `SubmitIdentityDocument` · `DecideVerificationCase`
· `DecideCapabilityVerification` · `AssignRole`
Queries: `GetAccount` · `GetVerificationStatus` · `ListPendingCases`

### marketplace
`CreateService` · `UpdateService` · `SubmitProviderApplication` · `ApproveProvider` ·
`SuspendProvider` · `DeclareCapability` · `SetCoverage` · `PublishAvailability` ·
`HoldSlot` · `ReleaseSlot`
Queries: `SearchServices` · `FindProviders` · `GetProvider` · `GetAvailability`

### booking
`CreateBooking` · `ConfirmBooking` · `StartWork` · `MarkWorkDone` · `ConfirmCompletion` ·
`CancelBooking` · `RaiseDispute` · `ResolveDispute` · `SendMessage` · `SubmitReview` ·
`RaiseEmergency` · `AcknowledgeEmergency`
Queries: `GetBooking` · `ListMyBookings` · `GetConversation` · `ListProviderReviews`

### finance
`IssueQuote` · `InitiatePayment` · `RecordGatewayCallback` · `SettleCashPayment` ·
`ApproveRefund` · `ExecuteRefund` · `AccrueEarnings` · `MarkPayable` · `ExecutePayout` ·
`HoldFunds` · `ReleaseFunds`
Queries: `GetQuote` · `GetPaymentStatus` · `GetBalance` · `ListLedgerEntries` · `GetEarnings`

### platform
`WriteAuditRecord` (internal) · `EnqueueJob` · `PublishEvent` · `SetFeatureFlag`
Queries: `GetJobStatus` · `SearchAuditLog` · `GetHealth`

---

## 8. Permissions

Four roles at Gate 1: `anonymous`, `customer`, `provider`, `admin`.
Deferred: `verifier`, `finance_operator`, `support`, `business_owner` — Gate 2, when
there is more than one person.

| Command class | anonymous | customer | provider | admin |
|---|---|---|---|---|
| Register, authenticate | ✔ | — | — | — |
| Search, view provider | ✔ | ✔ | ✔ | ✔ |
| Create / cancel own booking | — | ✔ | — | — |
| Accept, start, mark done | — | — | ✔ own | — |
| Confirm completion | — | ✔ own | — | — |
| Raise dispute | — | ✔ own | ✔ own | — |
| Resolve dispute | — | — | — | ✔ |
| Message | — | ✔ participant | ✔ participant | — |
| Submit review | — | ✔ after completion | — | — |
| Initiate payment | — | ✔ own | — | — |
| View own balance / earnings | — | ✔ own | ✔ own | — |
| Execute payout, approve refund | — | — | — | ✔ |
| Approve / suspend provider | — | — | — | ✔ |
| Decide verification | — | — | — | ✔ |
| Read identity documents (Sealed) | — | — | — | ✔ **audited on every read** |
| Raise emergency | ✔ | ✔ | ✔ | — |
| Read audit log | — | — | — | ✔ |

Rules: default deny; a command with no policy fails at startup; ownership checks are
server-side from the database, never from a client claim; **every Sealed read is audited
whether or not it changes anything** (V-07).

---

## 9. External dependencies

| Dependency | Used by | Gate 1 | Failure behaviour |
|---|---|---|---|
| TiDB Serverless | all | **required** | fail closed; maintenance page |
| SSLCommerz | finance | **required** | refuse; cash remains available; never mock-settle |
| SMS provider | identity | **required** for OTP | password login remains; **never** return an OTP |
| Cloudflare R2 | identity | **required** for KYC | upload fails closed; **no base64 fallback in production** |
| Socket.io | booking | optional | polling |
| Web Push | platform | optional | in-app only |
| Gemini / OpenAI | — | **not used at Gate 1** | n/a |

The last row is the point of Gate 1: **the core loop has no AI dependency at all.**

---

## 10. Tests required

Mapped to `TESTING-STRATEGY.md` §5.

| Area | Layers | Matrix rows |
|---|---|---|
| Authentication, sessions | unit + security | 1 |
| Authorization matrix | integration + security | 2, 3 |
| Booking lifecycle | unit + integration | 4, 5, 6 |
| Pricing | unit | 7 |
| Payment | integration | 8, 9, 10 |
| Ledger | integration | 11, 12, 13, 14 |
| Idempotency (API, event, job) | integration | 15, 16 |
| Money parsing | unit | 17 |
| Provider approval, capability | integration | 18, 19 |
| Realtime | integration | 20, 21, 22 |
| Emergency truthfulness | integration + E2E | 23 |
| Audit coverage | integration | 24 |
| KYC / Sealed access | integration + security | 25 |
| Environment, migrations | unit + integration | 26, 27 |
| Rate limiting, validation | integration + contract | 28, 29 |

Rows 30–32 (AI) are Gate 2. Rows 1, 9, 17, 20–22, 26, 27 already exist and pass.

---

## 11. Build order

Dependency-driven. Each step is releasable to staging.

| # | Step | Why here |
|---|---|---|
| 1 | `platform`: audit, authorization kernel, outbox, jobs | Everything else must be able to write an audit record and declare a policy from its first commit. Retrofitting audit is how `CREDENTIAL-INCIDENT.md` §2 ends up saying UNKNOWN |
| 2 | `identity`: accounts, memberships, sessions | Every other module authorises against it. Retires the `users.role` enum (AD-017) |
| 3 | `finance`: ledger, accounts, balance projection | The hardest correctness problem. Build it before anything depends on it, with the full financial test set green |
| 4 | `marketplace`: catalogue, providers, capability, coverage, availability | The service-graph migration lands here — VERY HIGH, rehearsed first |
| 5 | `booking`: lifecycle, messaging, reviews | Ties 2, 3 and 4 together |
| 6 | `finance`: payment, payout, commission | Needs booking events to exist |
| 7 | `booking`: emergency | Small; strict contract; independently testable |
| 8 | Migration execution against production | Only after 1–7 are green on staging |

Steps 1 and 3 first is the whole argument of this phase. The audit log and the ledger are
the two things that cannot be added convincingly later — one because it has no history,
the other because it *is* the history.

---

## 12. Gate-1 exit criteria

Not architecture; release. Listed so the boundary is not mistaken for a finish line.

1. All 29 Gate-1 test-matrix rows implemented and green in CI.
2. Financial and authorization code at 100% branch coverage.
3. One full backup-restore drill completed and timed.
4. Migrations applied to production, verified, with the `002` pre-check clean.
5. `CREDENTIAL-INCIDENT.md` §3 steps 1–8 complete.
6. D-009 commission rate decided by a business owner, or launch explicitly at 0%.
7. Emergency truthfulness verified end to end, including the failure path.
8. No `PROVISIONAL` architecture decision on a Gate-1 path.

Item 6 is a business decision, not an engineering one. `PLATFORM_FEE_PCT` defaults to 0
and **stays** at 0 until someone with the authority to set it does so.
