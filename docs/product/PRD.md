# IMAP 2.0 — Product Requirements Document

**Status:** PROPOSED · **Phase:** 1 · **Date:** 2026-08-09
**Governed by:** `PRODUCT-CONSTITUTION.md` · **Decisions:** `PRODUCT-DECISIONS.md`
**Tags:** CURRENT · TARGET · FUTURE · PROPOSED — see Constitution §0. Priority: NOW · NEXT · LATER · NEVER.

---

## 1. Scope of this document

This PRD defines **what IMAP 2.0 must do**, at what priority, and what "done" means. It does not specify how — architecture is Phase 2, visual design is Phase 3.

---

## 2. The MVP promise

One sentence the MVP must make true:

> **A person in Dhaka describes a household problem in Bangla, and within minutes has a verified provider booked at an agreed price, can see the provider's real status, and is charged only what was agreed.**

Decomposed into the acceptance loop:

```
User expresses need (Bangla or English, typed or spoken)
  → IMAP understands it as a service
  → Relevant services and providers discovered
  → Trusted providers matched and ranked with a visible basis
  → User approves an explicit, complete price
  → Booking executed atomically
  → User tracks real state
  → Task completed and confirmed by the customer
  → Both parties reviewed; the outcome improves the next match
```

**The MVP is this loop working end to end for a narrow slice — not a subset of every existing feature (D-014).**

### 2.1 MVP boundaries

| Dimension | MVP scope |
|---|---|
| Geography | One city (Dhaka), 3–5 named areas at launch |
| Categories | 5–8 home-service categories chosen for demand density and low regulatory risk. Proposed: electrical, plumbing, AC servicing, home cleaning, appliance repair |
| Users | Consumer + Provider. **No** business/SME workspace |
| Languages | Bangla (default) + English |
| Payment | Cash on completion + one digital method end-to-end (proposed: bKash via SSLCommerz) |
| Platform | Mobile web PWA. **No** native app |

### 2.2 What the MVP deliberately excludes

Goals · business workspace · short-form feed (D-006) · customer wallet (D-010) · microloans (D-011) · disaster alerts (D-012) · automated donor alerting (D-013) · multi-city · multi-country · provider CRM · promotions engine · loyalty redemption to cash.

---

## 3. Requirements

Each requirement: **ID · statement · priority · status · acceptance criteria**.

---

### 3.1 Need capture and understanding

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **R-101** | A user can express a need in free-form Bangla or English text and receive matched providers without selecting a category | NOW | TARGET |
| **R-102** | A user can express a need by voice in Bangla or English; the transcript enters the same intent pipeline as text | NOW | TARGET (**CURRENT:** voice exists but only matches keywords to page navigation — the transcript never reaches a model) |
| **R-103** | When intent confidence is below threshold, IMAP asks **at most one** disambiguating question before showing results | NOW | TARGET |
| **R-104** | When intent cannot be resolved, IMAP falls back to category browsing and says so plainly | NOW | TARGET |
| **R-105** | A user can browse by category as a first-class path | NOW | CURRENT (grid exists; must be re-sourced from the Service Graph, not `constants/data.js`) |
| **R-106** | A user can attach a photo to a need; it is stored and shown to the matched provider | NEXT | TARGET |
| **R-107** | Photo content contributes to service classification | LATER | FUTURE |
| **R-108** | Need capture works with no AI available, degrading to category + keyword search | NOW | TARGET (D-007) |

**Acceptance (R-101).** On a labelled evaluation set of ≥300 real Bangla/English need statements across the MVP categories, the correct service appears in the top 3 proposed services in ≥85% of cases, and the wrong service is never presented as **Confirmed** (Constitution §P4).

---

### 3.2 Service Graph

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **R-201** | A `service` is a first-class entity with a stable id, Bangla and English names, description, price model and required capabilities | NOW | TARGET |
| **R-202** | Exactly one service taxonomy exists, server-owned; no client-side category list | NOW | TARGET (**CURRENT:** three conflicting taxonomies — 12 / 8 / 19) |
| **R-203** | Services carry typed relationships: `related`, `precedes`, `alternative-to`, `part-of` | NOW | TARGET |
| **R-204** | A provider declares one or more capabilities mapping to services | NOW | TARGET (**CURRENT:** one free-text string) |
| **R-205** | Capabilities that require certification cannot be self-asserted; evidence is reviewed | NEXT | TARGET |
| **R-206** | A provider declares explicit coverage areas; discovery filters on them | NOW | TARGET (**CURRENT:** free text; `latitude`/`longitude` exist and are never queried) |
| **R-207** | Availability is dated with capacity; booking consults it and holds a slot | NOW | TARGET (**CURRENT:** free-text dateless slots that booking never reads — double-booking is unpreventable) |
| **R-208** | A goal maps to a set of services | LATER | FUTURE |

**Acceptance (R-207).** Two concurrent bookings for the same provider and slot: exactly one succeeds; the other receives a clear "no longer available" with alternatives.

---

### 3.3 Discovery, matching, pricing

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **R-301** | Providers are ranked by a documented multi-signal basis, not rating alone | NOW | TARGET (**CURRENT:** `ORDER BY rating DESC`) |
| **R-302** | The ranking basis is inspectable — the user can see why this provider is first | NOW | TARGET |
| **R-303** | Discovery filters by area, availability window and service capability | NOW | TARGET |
| **R-304** | Every listed provider shows a complete price for the requested service before booking | NOW | TARGET (**CURRENT:** server-derived from `hourly_rate` → `base_price`, but the model is hourly-only) |
| **R-305** | Three price models are supported: **fixed**, **from-price**, **inspection-then-quote** | NOW | TARGET |
| **R-306** | Where a quote is required, the customer sees an inspection fee upfront and approves the quote before work begins | NOW | TARGET |
| **R-307** | Search works without AI (keyword + filters) | NOW | CURRENT (`LIKE '%q%'`; must be replaced with an indexed search) |
| **R-308** | Paid placement, if ever introduced, is labelled and never outranks a materially better option | LATER | PROPOSED (D-009, P7) |
| **R-309** | Comparison view for up to 3 providers side by side | NEXT | TARGET |

**Acceptance (R-304).** No booking can be created for a service/provider pair with no resolvable price. The system fails closed — **CURRENT** behaviour since Phase 0.5 (409, `backend/utils/pricing.js`).

---

### 3.4 Trust

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **R-401** | Provider identity is verified before listing; the verification performed is stated exactly | NOW | TARGET (D-005; `is_approved` gate is CURRENT) |
| **R-402** | Users see legible trust facts, not a composite score | NOW | TARGET |
| **R-403** | Reviews come only from the paying customer of a completed, unrated booking | NOW | **CURRENT** — already correctly enforced |
| **R-404** | Repeat-customer count is computed and displayed | NOW | TARGET |
| **R-405** | Cancellation and response behaviour are measured over a rolling window | NEXT | TARGET |
| **R-406** | A provider can see their standing and what changes it | NEXT | TARGET |
| **R-407** | Any negative trust determination is appealable to a human | NEXT | TARGET (Tier C) |
| **R-408** | A new provider is presented as new — neither trusted nor untrusted | NOW | TARGET |
| **R-409** | Provider proof-of-work media on the profile (before/after photos, ≤30s clips) | NEXT | TARGET (D-006) |
| **R-410** | Customers are phone-verified before booking an in-home service, and the provider sees the customer's verification level and IMAP booking history before accepting | NOW | TARGET — two-sided safety (`PERSONAS.md` P2). Document-level customer verification is LATER |

---

### 3.5 Booking and execution

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **R-501** | Booking states: `pending → confirmed → active → completed`, plus `cancelled`; terminal states are final | NOW | **CURRENT** (Phase 0.5) |
| **R-502** | Transitions are role-guarded server-side | NOW | **CURRENT** |
| **R-503** | Financial effects occur exactly once per booking, enforced at the database | NOW | **CURRENT** (unique ledger refs) |
| **R-504** | An `arrived` state is observable to the customer | NOW | TARGET |
| **R-505** | Completion requires customer confirmation (code or in-app confirm) | NOW | TARGET (**CURRENT:** `otp_code` exists in the schema; nothing enforces it) |
| **R-506** | Cancellation policy is stated before booking and applied consistently | NOW | TARGET |
| **R-507** | A booking holds the provider's availability slot | NOW | TARGET |
| **R-508** | Both parties can message within a booking | NOW | **CURRENT** (participation correctly verified) |
| **R-509** | Reschedule without cancel-and-rebook | NEXT | TARGET |

**Acceptance (R-505).** A provider cannot move a booking to `completed` without the customer's confirmation, except through an admin action that is audit-logged with a reason.

---

### 3.6 Money

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **R-601** | The server computes all prices, fees and totals; client values are never trusted | NOW | **CURRENT** (Phase 0.5) |
| **R-602** | Negative, `NaN`, `Infinity` and out-of-range money values are rejected at every entry point | NOW | **CURRENT** |
| **R-603** | All money operations are transactional and idempotent | NOW | **CURRENT** |
| **R-604** | The UI distinguishes Estimated · Quoted · Confirmed · Paid · Refunded · Pending · Failed | NOW | TARGET |
| **R-605** | Payment settles only on verified gateway confirmation | NOW | **CURRENT** (IPN is the sole crediting path) |
| **R-606** | Cash-on-completion is a first-class method with its own settlement path | NOW | TARGET |
| **R-607** | Provider earnings accrue to an append-only ledger; `balance` is derived | NOW | TARGET (D-010; **CURRENT:** mutable column + best-effort log) |
| **R-608** | Refunds return to the original payment method via the gateway | NOW | TARGET (**CURRENT:** wallet credit only; no gateway refund exists) |
| **R-609** | Commission is applied to completed bookings at a server-controlled rate | NOW | TARGET (**CURRENT:** `PLATFORM_FEE_PCT`, default `0`) |
| **R-610** | Customer stored value / wallet top-up is removed | NOW | PROPOSED (D-010) |
| **R-611** | Loyalty points convert to a per-booking discount, never to spendable balance | NEXT | PROPOSED (D-010). **Gap to manage:** removing stored value at Gate 1 leaves existing points unredeemable until this lands. Earning is paused and existing balances are honoured when R-611 ships; this must be communicated, not silently dropped |
| **R-612** | Every money movement is reconcilable from the ledger alone | NOW | TARGET |

---

### 3.7 AI behaviour

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **R-701** | AI actions execute through `Tool → Auth → Authorization → Rules → Transaction → DB → Event → Confirmation` | NOW | TARGET (D-002) |
| **R-702** | AI acts as the user with the user's permissions; never elevated | NOW | TARGET |
| **R-703** | Tier A actions are automatic; Tier B require explicit confirmation; Tier C have no tool | NOW | TARGET (Constitution §4) |
| **R-704** | All state claims use the nine-state vocabulary with the required evidence | NOW | TARGET (D-008; partially CURRENT) |
| **R-705** | Every AI-initiated write is audit-logged with actor, tool, and confirmation timestamp | NOW | TARGET |
| **R-706** | AI never sees Sealed context (KYC documents, full ledger, health/emergency records, dispute files) | NOW | TARGET (Constitution §5.3) |
| **R-707** | AI endpoints require authentication | NOW | **CURRENT** (Phase 0.5) |
| **R-708** | The model provider is abstracted; swapping models requires no route changes | NOW | TARGET (**CURRENT:** three inline `fetch` calls with hardcoded model names) |
| **R-709** | AI has per-user cost limits and usage is recorded | NEXT | TARGET |
| **R-710** | An evaluation suite covering intent, tool selection and refusal runs in CI | NOW | TARGET |
| **R-711** | Prompt-injection defences on all user-supplied content entering a prompt | NOW | TARGET |
| **R-712** | AI proposals render as structured objects the UI can display field by field | NOW | TARGET (Constitution §P2) |

**Acceptance (R-710).** ≥200 labelled cases. Gate: correct tool selection ≥90%; **zero** Tier-C tool invocations; **zero** unevidenced Completed claims. A build failing any of the three does not ship.

---

### 3.8 Personal context and privacy

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **R-801** | Task continuity survives reload and session change | NOW | TARGET |
| **R-802** | Service history informs recommendations | NEXT | TARGET |
| **R-803** | Context is tiered Open / Guarded / Sealed with distinct access rules | NOW | TARGET |
| **R-804** | A user can view everything IMAP remembers, in plain language | NEXT | TARGET |
| **R-805** | A user can delete any remembered item; deletion takes effect within one session boundary | NEXT | TARGET |
| **R-806** | Precise location is per-purpose, time-bounded and revocable | NOW | TARGET |
| **R-807** | Account deletion and data export are available | NEXT | TARGET (**CURRENT:** neither exists) |
| **R-808** | Sensitive context is never used for commercial targeting | NOW | TARGET (P7) |

---

### 3.9 Provider experience

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **R-901** | Onboarding is completable on a mid-range phone in under 10 minutes | NOW | TARGET |
| **R-902** | A provider sees incoming requests with service, area, time and price before accepting | NOW | TARGET |
| **R-903** | Accept / decline is one tap | NOW | **CURRENT** |
| **R-904** | Earnings show gross, commission and net per booking, and a payout status | NOW | TARGET (**CURRENT:** a balance number with no breakdown) |
| **R-905** | Availability is manageable in under 30 seconds | NOW | TARGET |
| **R-906** | Demand signal: where and when requests are unmet in the provider's categories | NEXT | TARGET |
| **R-907** | Pricing guidance relative to comparable providers | LATER | FUTURE |
| **R-908** | Customer history for repeat customers | NEXT | TARGET |
| **R-909** | Provider CRM, invoicing, marketing tools | LATER | FUTURE |

---

### 3.10 Emergency

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **R-1001** | Every emergency surface shows the real emergency number (999) prominently | NOW | TARGET (partially CURRENT) |
| **R-1002** | IMAP states plainly what it can and cannot do in an emergency | NOW | **CURRENT** (Phase 0.5) |
| **R-1003** | No emergency outcome is claimed without server evidence | NOW | **CURRENT** |
| **R-1004** | Emergency requests are recorded, routed to a verified admin channel, and auditable | NOW | **CURRENT** (admin room; audit log still TARGET) |
| **R-1005** | Emergency personal data is Sealed and never enters AI context | NOW | TARGET |
| **R-1006** | Blood donor registry is opt-in, contact release is per-request and logged | NOW | **CURRENT** (D-013) |
| **R-1007** | No automated donor notification is offered or implied | NOW | **CURRENT** (D-013) |
| **R-1008** | Disaster surface signposts official sources; no first-party alerts | NOW | PROPOSED (D-012) |
| **R-1009** | Hotline numbers are verified against an official source | NOW | TARGET (**open risk** — currently unverified) |
| **R-1010** | A provider can raise an emergency during an active booking; the booking and location are attached and routed to admins | NOW | TARGET — the `PERSONAS.md` P2 two-sided-safety requirement |

---

### 3.11 Platform and operations

| ID | Requirement | Priority | Status |
|---|---|---|---|
| **R-1101** | Every state change and admin action is audit-logged: actor, action, target, before/after, timestamp | NOW | TARGET (**CURRENT: none — the largest single gap carried from Phase 0**) |
| **R-1102** | A dispute has a workflow with states, evidence, SLA and a resolution linked to a refund where applicable | NEXT | TARGET |
| **R-1103** | Admin actions on trust or verification require a recorded reason | NEXT | TARGET |
| **R-1104** | Schema changes go through versioned migrations | NOW | **CURRENT** (Phase 0.5 runner) |
| **R-1105** | Backend CI runs tests before deploy | NOW | TARGET (**CURRENT:** frontend CI only; backend autodeploys untested) |
| **R-1106** | Errors are tracked and alertable | NOW | TARGET |
| **R-1107** | Horizontal scaling is possible — no in-process session or OTP state | NEXT | TARGET (**CURRENT:** in-process `Map`s block this) |
| **R-1108** | A `need` entity links expression → understanding → booking → outcome, so the North Star and the funnel in `KPI.md` §2 are computable | NOW | TARGET |

---

## 4. State models

Conceptual only. No implementation.

### 4.1 User
`registered → active → suspended → active` · `active → closed` (terminal)
Verification is a separate axis: `unverified → phone_verified → id_verified`.

### 4.2 Provider
`applied → under_review → approved → listed` · `listed ⇄ paused` (provider-controlled) · `approved → rejected` (terminal, appealable) · `listed → suspended → listed | removed`
**CURRENT:** `is_approved` boolean only; no review or appeal workflow.

### 4.3 Service (catalogue entity)
`draft → active → deprecated → retired`. A retired service cannot be booked; existing bookings are unaffected.

### 4.4 Booking
`pending → confirmed → active → [arrived] → completed` · `cancelled` from `pending`/`confirmed` by either party, from `active` by admin only. Terminal: `completed`, `cancelled`. **CURRENT** except `arrived`.

### 4.5 Payment
`initiated → authorised → captured → settled` · `failed` · `refund_requested → refunded` (partial or full). Only gateway confirmation advances past `authorised`. **CURRENT:** `pending → success | failed`; no authorise/capture split, no refund path.

### 4.6 Provider earnings (ledger entry)
`accrued → payable → paid_out` · `held` (dispute) → `payable | reversed`. Append-only; no entry is mutated. **CURRENT:** none — a mutable balance column.

### 4.7 Review
`eligible → drafted → submitted → published` · `flagged → under_review → published | removed`. **CURRENT:** eligibility correctly enforced; no moderation states.

### 4.8 KYC
`not_submitted → submitted → under_review → verified | rejected` · `rejected → submitted` (resubmit) · `verified → expired → submitted`. Decisions are Tier C. **CURRENT:** states exist; no expiry, no appeal.

### 4.9 Emergency request
`received → acknowledged → in_progress → resolved | closed`. **`dispatched` does not exist** — IMAP has no dispatch capability (D-012, D-013).

### 4.10 Dispute
`raised → evidence → under_review → resolved(outcome) → closed` · outcomes: `refund_full`, `refund_partial`, `no_action`, `provider_penalty`. **CURRENT:** a `complaints` row with a status field; no workflow.

### 4.11 AI task
`intent_received → planned → proposed → awaiting_confirmation → executing → completed | failed | abandoned`. A Tier-B task cannot leave `awaiting_confirmation` without explicit user action. **CURRENT:** none.

---

## 5. AI behaviour model

| Stage | AI may | AI may not | Evidence required | Confirmation |
|---|---|---|---|---|
| **Intent** | Classify a need into candidate services; ask one disambiguating question | Assert a category as fact when confidence is low | — | No |
| **Context** | Read Open context; read Guarded for a declared purpose | Read Sealed context, ever | Purpose declared and logged | No |
| **Planning** | Decompose into candidate tool calls | Execute during planning | — | No |
| **Retrieval** | Query the graph, providers, availability, prices, the user's own history | Read other users' data | Query result | No |
| **Recommendation** | Rank and explain | Hide materially better options; invent scarcity | Ranking inputs | No |
| **Action (Tier A)** | Execute | Anything beyond Tier A | Tool result | No |
| **Action (Tier B)** | Prepare a structured proposal | Commit | Proposal object | **Yes — explicit** |
| **Confirmation** | Render the proposal for approval | Pre-select, auto-advance, or time out into acceptance | — | User acts |
| **Execution** | Call the tool with the confirmed proposal + idempotency key | Alter the proposal after confirmation | Transaction committed | Already given |
| **Verification** | Read the resulting event and report state | Report success without the event | **Committed event** | No |
| **Memory** | Write to Open context; write to Guarded with notice | Write to Sealed; retain beyond policy | — | Visible to user |

---

## 6. Non-functional requirements

| ID | Requirement | Target | Measurement | Current |
|---|---|---|---|---|
| **N-01** | First contentful paint, mid-range Android, 3G | ≤3 s p75 | RUM | Unmeasured; ~540 KB gzip JS |
| **N-02** | Need → first provider results | ≤4 s p75 | Server + client trace | Unmeasured |
| **N-03** | AI first token | ≤2 s p75 | Server trace | Unmeasured |
| **N-04** | Booking confirmation round trip | ≤2 s p95 | Server trace | Unmeasured |
| **N-05** | Realtime status propagation | ≤3 s p95 | Event trace | Unmeasured |
| **N-06** | API availability | ≥99% month one, ≥99.5% after | Uptime monitor | Render free tier sleeps on idle |
| **N-07** | Works on 2 GB RAM Android, Chrome | Core loop usable | Device test | Untested |
| **N-08** | Core loop usable offline-degraded | Read cached state; queue nothing financial | Manual test | Network-first SW |

Targets are provisional and must be re-baselined against real measurement before being treated as SLAs. Nothing here is currently instrumented.

---

## 7. Accessibility requirements

| ID | Requirement | Priority |
|---|---|---|
| **A-01** | Core loop completable by keyboard alone | NOW |
| **A-02** | Interactive elements are real controls with accessible names | NOW |
| **A-03** | Text contrast meets WCAG AA | NOW |
| **A-04** | Layout survives 200% font scaling | NOW |
| **A-05** | Touch targets ≥44×44 px | NOW |
| **A-06** | Status never conveyed by colour alone | NOW |
| **A-07** | Modals trap focus and restore it on close | NOW |
| **A-08** | `<html lang>` tracks the selected language | NOW |
| **A-09** | `prefers-reduced-motion` respected | NOW |
| **A-10** | Simplified high-contrast large-target mode | NEXT (**CURRENT:** an elderly mode exists and is a genuine strength) |
| **A-11** | Bangla screen-reader compatibility verified on Android TalkBack | NEXT |

**CURRENT:** inline styles throughout, `<div onClick>` handlers, no focus management, `outline:none` without replacement, `<html lang="bn">` fixed. See `docs/audit/UX-GAPS.md` §6.

---

## 8. Data and privacy requirements

| ID | Requirement | Priority |
|---|---|---|
| **D-01** | Purpose is declared for every category of personal data collected | NOW |
| **D-02** | Identity documents are stored in object storage, encrypted, never in the primary database | NOW (**CURRENT:** base64 `LONGTEXT`, up to ~5 MB per image) |
| **D-03** | Access to identity documents is logged with actor and reason | NOW |
| **D-04** | Precise location is collected only for an active booking and retained only for its duration | NOW |
| **D-05** | A published retention schedule exists per data category | NEXT |
| **D-06** | Users can export and delete their data | NEXT |
| **D-07** | Donor and emergency data are Sealed | NOW |
| **D-08** | No personal data enters a third-party model call beyond what the declared purpose requires | NOW |

---

## 9. Internationalisation requirements

**FUTURE — abstractions only. No second market in IMAP 2.0.**

| ID | Requirement |
|---|---|
| **I-01** | Money carries an explicit currency and is stored in minor units |
| **I-02** | Country is an explicit dimension on user, provider and service availability |
| **I-03** | Locale is independent of country; Bangla-in-UK must work |
| **I-04** | Timestamps stored in UTC; displayed in the user's timezone |
| **I-05** | Address format is strategy-based, not a fixed schema |
| **I-06** | Payment methods come from a registry, not a hardcoded list |
| **I-07** | Tax treatment is a per-market policy, not embedded in pricing |
| **I-08** | All user-facing strings are externalised (**CURRENT:** ~108 keys externalised; the majority are inline ternaries across every file) |
| **I-09** | Service regulations (which capabilities need certification) are per-market data |

---

## 10. Out of scope for IMAP 2.0

| Item | Rationale |
|---|---|
| Native mobile apps | PWA first; native only when retention justifies it |
| Multi-city / multi-country | Prove one city |
| Business/SME workspace | LATER (`ROADMAP.md` Phase F) |
| Goals | LATER — depends on the Service Graph |
| Short-form feed | D-006 |
| Customer wallet / stored value | D-010 |
| Microloans | D-011 |
| First-party disaster alerts | D-012 |
| Automated donor notification | D-013 |
| Provider CRM / invoicing / marketing | FUTURE |
| Insurance, warranty products | FUTURE — regulated |
| Provider hiring / staffing | NEVER — different business |

---

## 11. Release gates

There are **two** gates, because the MVP promise in §2 includes AI understanding while the loop underneath it must be provably sound first.

### Gate 1 — Core Loop Release (end of `ROADMAP.md` Phase D)

The structured path works end to end. AI is not required for any of it.

| # | Condition |
|---|---|
| 1 | **Loop.** A new user completes need → booking → payment → tracking → completion → review without staff intervention, in Bangla, on a mid-range Android over 3G, using category browse and search |
| 2 | **Money.** Every completed booking reconciles from the ledger alone; commission is applied and correct |
| 3 | **Trust.** Every listed provider is approved; the verification claim on the site matches what was actually checked |
| 4 | **Availability.** No double-booking is possible (R-207) |
| 5 | **Audit.** Every state change and admin action is logged (R-1101) |
| 6 | **Safety.** No emergency surface claims a capability IMAP does not have; provider in-booking emergency works (R-1010) |
| 7 | **No fabrication.** No user-facing surface renders data that did not come from the server |
| 8 | **Regression.** The Phase 0.5 P0 suite passes, extended to the new money and state paths |
| 9 | **Accessibility.** A-01 through A-09 verified on the core loop |

### Gate 2 — MVP Release (end of `ROADMAP.md` Phase E)

Gate 1 still holds, **plus** the understanding layer that makes §2 true.

| # | Condition |
|---|---|
| 10 | **Intent.** ≥85% top-3 service accuracy on the held-out evaluation set (R-101) |
| 11 | **Truthfulness.** Zero unevidenced Completed claims in the AI eval suite (R-710) |
| 12 | **Tool safety.** ≥90% tool-selection accuracy; zero Tier-C invocation attempts |
| 13 | **Degradation.** Every AI-assisted journey degrades cleanly to its Gate-1 equivalent (D-007) |
| 14 | **Cost.** AI cost per resolved need is measured and within budget (R-709) |

**Only Gate 2 may be called "the MVP".** Gate 1 is a real, shippable product and may be launched to a limited audience, but it does not yet deliver the promise in §2.
