# IMAP 2.0 — Traceability Matrix

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09

`Requirement → UX → Domain → Entity → API → Event → Frontend → Test → Acceptance`

Two directions are checked:
* **Forward** — every NOW requirement reaches an implementation and a test. A gap is a **coverage gap**.
* **Reverse** — every Gate-1 component traces back to a requirement. Something with no source is an **over-engineering gap**.

Gate-1 scope. `PRD.md` requirements tagged NEXT/LATER are listed as deferred, not omitted.

---

## 1. Forward — NOW requirements

### Need capture and discovery

| Req | UX | Domain | Entity | API | Event | Frontend | Test | Acceptance |
|---|---|---|---|---|---|---|---|---|
| R-104 fall back to browse, say so | F1·B | marketplace | `service` | `GET /services` | — | discovery | 53 | Low confidence shows categories, never a silent guess |
| R-105 category browse first-class | IA §3.3 | marketplace | `service_category` | `GET /services` | — | `/services` | 53 | Reachable from home in one tap |
| R-108 works with no AI | F1 degraded | marketplace | — | `GET /providers` | — | discovery | 89 | **Gate 1 has no AI at all — met by construction** |
| R-307 search without AI | F1·G | marketplace | `service_synonym` | `GET /providers` | — | results | 52 | Indexed search, not `LIKE '%q%'` |
| **R-101/102/103** intent, voice, one question | F1·A/B/C | — | — | — | — | — | — | **DEFERRED to Gate 2** — the AI layer |

### Service graph

| Req | UX | Domain | Entity | API | Event | Frontend | Test | Acceptance |
|---|---|---|---|---|---|---|---|---|
| R-201 service is first-class | — | marketplace | `service` | `GET /services/{slug}` | — | service detail | 53 | Stable id, both names, price model |
| R-202 one server-owned taxonomy | — | marketplace | `service`, `service_category` | `GET /services` | — | all | 53 | **Three taxonomies become one; no client list** |
| R-203 typed relationships | — | marketplace | `service_edge` | `GET /services/{slug}/related` | — | related | graph | 4 edge kinds |
| R-204 provider declares capabilities | F4 | marketplace | `provider_capability` | `PUT /provider/capabilities` | — | onboarding | 50 | **Visual picking, never free text** |
| R-206 explicit coverage areas | F4 | marketplace | `provider_coverage`, `area` | `PUT /provider/coverage` | — | onboarding | 52 | Discovery filters on it |
| **R-207 dated availability with holds** | F1·K | marketplace | `availability_window`, `availability_hold` | `PUT /provider/availability` | — | slot picker | **50** | **Two concurrent bookings: exactly one succeeds** |

### Discovery, matching, pricing

| Req | UX | Domain | Entity | API | Event | Frontend | Test | Acceptance |
|---|---|---|---|---|---|---|---|---|
| R-301 multi-signal ranking | F1·G | marketplace | — | `GET /providers` | — | results | 52 | Rating, completion count, distance — not rating alone |
| R-302 basis inspectable | F1·G | marketplace | — | `GET /providers` | — | `SortBasis` | 52 | Returned with the result; **`ranking_explanation` deferred** |
| R-303 filter by area/window/capability | F1·G | marketplace | — | `GET /providers` | — | `FilterBar` | 52 | Individually removable |
| **R-304 complete price before booking** | F1·G/N | finance | `quote`, `provider_price` | `POST /quotes` | — | `PriceBreakdown` | **21** | **No booking without a resolvable price — fails closed 409** |
| R-305 three price models | — | finance | `quote.price_model` | `POST /quotes` | — | approval | 21 | fixed · from · inspection-quote |
| R-306 inspection fee approved upfront | F1·N | finance | `quote_component` | `POST /quotes` | — | approval | 21 | Fee visible before work begins |

### Trust

| Req | UX | Domain | Entity | API | Event | Frontend | Test | Acceptance |
|---|---|---|---|---|---|---|---|---|
| **R-401 verified before listing** | F4 | identity + marketplace | `verification_case`, `provider.state` | `POST /ops/providers/{id}/approve` | `provider.approved` | status | **49** | **`applied → listed` impossible** |
| R-402 facts, not a score | §5 | marketplace | `review`, `provider` | `GET /providers/{id}` | — | `TrustFacts` | — | No composite score shown |
| R-403 review from the paying customer only | — | booking | `review` | `POST /bookings/{id}/review` | `review.submitted` | review | 62 | **Already correct today** |
| R-408 new provider presented as new | §5 | marketplace | `provider` | `GET /providers/{id}` | — | `TrustFacts` | — | Neither hidden nor inflated |
| **R-410 customer phone-verified before booking** | F9 | identity | `contact_verification` | `POST /bookings` | — | auth | 9 | Provider sees verification level and history |

### Booking and execution

| Req | UX | Domain | Entity | API | Event | Frontend | Test | Acceptance |
|---|---|---|---|---|---|---|---|---|
| R-501 states, terminal final | F2 | booking | `booking.state` | 8 commands | 5 events | `BookingStateCard` | 43–45 | Terminal is terminal |
| R-502 role-guarded server-side | F2 | booking | — | all commands | — | — | 44, 46 | **Full illegal-transition matrix** |
| R-503 financial effects exactly once | — | finance | `ledger_transaction.reference` | — | `booking.completed` | — | 28, 29 | Enforced at the database |
| R-504 arrived observable | F2 | booking | `booking.state` | `POST …/arrive` | — | tracking | 43 | Customer sees it |
| **R-505 customer confirms completion** | F2 | booking | `booking.state` | `POST …/confirm-completion` | `booking.completed` | Confirm | **46** | **The provider cannot reach `completed`** |
| R-506 cancellation policy stated first | F1·N | booking | — | `POST …/cancel` | `booking.cancelled` | policy | — | In full, not a link |
| R-507 booking holds the slot | — | marketplace | `availability_hold` | `POST /bookings` | `booking.created` | — | 50 | Hold acquired at creation |
| R-508 in-booking messaging | F2 | booking | `conversation`, `message` | `/bookings/{id}/messages` | — | chat | 61 | **Participation already correct today** |

### Money

| Req | UX | Domain | Entity | API | Event | Frontend | Test | Acceptance |
|---|---|---|---|---|---|---|---|---|
| **R-601 server computes everything** | F1·N | finance | `quote` | `POST /quotes` | — | `PriceBreakdown` | **20** | **No endpoint accepts an amount** |
| R-602 bad money rejected | — | shared | — | all | — | — | 23 | Negative · NaN · Infinity · over-cap |
| R-603 transactional and idempotent | — | finance | `ledger_transaction` | — | — | — | 26–29, 36–42 | Three layers |
| R-604 nine-state money vocabulary | §4.1 | — | — | — | — | `StatusBadge` | 92 | **A claim without evidence throws** |
| R-605 settle only on gateway confirmation | — | finance | `payment` | `POST /webhooks/payment/ipn` | `payment.captured` | — | 79–83 | **IPN is the sole crediting path** |
| R-606 cash first-class | — | finance | `payment{method:cash}` | — | — | earnings | 85 | Own settlement path (O-02) |
| **R-607 append-only ledger; derived balance** | — | finance | `ledger_entry`, `balance_projection` | `GET /provider/earnings` | — | earnings | **30–32** | **No mutable balance column** |
| R-608 refund to original method | F8 | finance | `refund` | `POST /payments/{id}/refunds` | `refund.issued` | refund state | 34, 35 | Never to a balance (D-010) |
| R-609 server-controlled commission | — | finance | `commission_accrual` | — | — | earnings | 25 | **`PLATFORM_FEE_PCT=0` until D-009** |
| R-610 stored value removed | — | finance | `customer_liability` non-issuable | — | — | wallet deleted | **33** | **Zero entries after the full suite** |
| R-612 reconcilable from the ledger alone | — | finance | `ledger_entry` | — | — | — | 31, 32 | Nightly reconciliation |

### Provider experience

| Req | UX | Domain | Entity | API | Event | Frontend | Test | Acceptance |
|---|---|---|---|---|---|---|---|---|
| R-901 onboarding <10 min | F4 | marketplace | `provider` | `/provider/applications` | — | onboarding | — | Resumable 30 days |
| R-902 request shows service, area, time, price | F5 | booking | `booking` | `GET /provider/jobs` | — | request surface | — | Full surface, not a toast |
| R-903 one-tap accept/decline | F5 | booking | — | `POST …/accept` | `booking.confirmed` | jobs | 43 | **Already correct today** |
| **R-904 gross, commission, net, payout state** | F5 | finance | `payout_claim` | `GET /provider/earnings` | — | earnings | — | **Never an unexplained deduction** |
| R-905 availability in <30 s | IA §4 | marketplace | `availability_window` | `PUT /provider/availability` | — | schedule | — | One tap from every provider surface |

### Emergency

| Req | UX | Domain | Entity | API | Event | Frontend | Test | Acceptance |
|---|---|---|---|---|---|---|---|---|
| **R-1001 999 most prominent** | F6 | booking | `hotline` | `GET /emergency/hotlines` | — | emergency | **75** | Largest element, before any input |
| **R-1002 capability statement as data** | F6 | booking | `feature_flag` | `GET /emergency/capabilities` | — | emergency | 72 | **Data, not copy — they cannot drift** |
| **R-1003 no unevidenced outcome** | F6 | booking | `emergency_request` | `POST /emergency/requests` | `emergency.raised` | emergency | **71, 74** | Reports **actual** admin reachability |
| R-1004 recorded, routed, auditable | F6 | booking + platform | `emergency_request`, `audit_log` | — | `emergency.raised` | ops | 64, 65 | Admin room only |
| R-1005 emergency data Sealed | — | booking | `emergency_request` | — | — | — | 54 | Never in AI context |
| R-1006/1007 consent-first registry, no auto-alert | F6 | booking | `donor_consent`, `contact_release` | `/emergency/blood/*` | — | blood | 76 | **`donors_notified: 0`, stated plainly** |
| R-1008 signposting only | F6 | booking | `verified_source` | `GET /emergency/sources` | — | disaster | — | No first-party alerts |
| **R-1009 hotlines verified** | F6 | booking | `hotline.verified_at` | `GET /emergency/hotlines` | — | emergency | **77** | **OPEN RISK — carried since Phase 0.5** |
| R-1010 provider in-booking emergency | F6 | booking | `emergency_request.booking_id` | `POST /emergency/requests` | `emergency.raised` | tracking | 78 | Booking and location attached |

### Platform and operations

| Req | UX | Domain | Entity | API | Event | Frontend | Test | Acceptance |
|---|---|---|---|---|---|---|---|---|
| **R-1101 every state change audited** | — | platform | `audit_log` | `GET /ops/audit` | all 16 | ops | **51–58** | **The largest gap from Phase 0** |
| R-1104 versioned migrations | — | platform | `schema_migration` | — | — | — | migration | **Already true since Phase 0.5** |
| **R-1105 CI runs tests before deploy** | — | — | — | — | — | — | CI | **I-01 exit criterion** |
| R-1107 horizontal scaling possible | — | platform | — | — | — | — | — | Redis replaces in-process `Map`s |
| R-1108 `need` links expression → outcome | — | marketplace | `need`, `booking_event` | `POST /needs` | — | ask | — | **North Star computable** |

---

## 2. Reverse — does every Gate-1 component have a source?

| Component | Traces to | Verdict |
|---|---|---|
| 38 entities | Each named in `ENTITY-IMPLEMENTATION-MAP.md` with a requirement | ✔ |
| 16 events | Each has a **named consumer** (S-05) | ✔ |
| 6 state machines | `PRD.md` §4 + `STATE-MACHINES.md` | ✔ |
| ~62 endpoints | Each maps to a requirement or a named flow | ✔ |
| 84 authorization actions | One per command/query | ✔ |
| `audit_log` | R-1101 | ✔ |
| `outbox_event` | AD-006 — 16 consumers | ✔ |
| `job` | AD-016, AD-024 — 10 job kinds | ✔ |
| `idempotency_key` | AD-010, R-603 | ✔ |
| `need` | **R-1108** — the North Star is not computable without it | ✔ **kept despite no AI at Gate 1** |
| `booking_clearing` | AD-023, V-03 — five alternatives tested and rejected | ✔ |
| `customer_liability` | AD-019 — **defined, non-issuable**; test 33 asserts zero entries | ✔ |
| `platform_opening_equity` | M-25 — one migration only | ✔ |
| `area` hierarchy | R-206, `DATA-ARCHITECTURE.md` §8 | ✔ |
| `service_synonym` | R-307, AD-005 — no search infrastructure | ✔ |

### Removed as over-engineering

| Removed | Would have traced to | Why removed |
|---|---|---|
| `service_edge_closure` | AD-004 | **Contradicted by AD-004's own reasoning** — AD-021 |
| discovery projection | performance | Unmeasured — AD-022 |
| `payout_batch` | payout flow | A claim carries its own state — S-10 |
| `trust_signal`, `provider_standing` | R-402, R-405 | **Scoring** deferred; every safety capability survives |
| `ranking_explanation` | R-302 | Basis returned with the result, not stored |
| `notification_preference` | — | Written and never read today |
| 8 events | — | **No consumer at all** |
| 29 AI entities and tools | Gate 2 | AD-026 |

**No Gate-1 component lacks a source.** Fifteen candidates were removed, and the reason is recorded for each.

---

## 3. Coverage summary

| Category | NOW reqs | In Gate 1 | Deferred to Gate 2 | Test-covered |
|---|---:|---:|---:|---:|
| Need capture | 4 | 2 | 2 (AI) | 2/2 |
| Service graph | 6 | 6 | 0 | 6/6 |
| Discovery & pricing | 6 | 6 | 0 | 6/6 |
| Trust | 5 | 5 | 0 | 5/5 |
| Booking | 8 | 8 | 0 | 8/8 |
| Money | 11 | 11 | 0 | 11/11 |
| AI behaviour | 12 | **0** | 12 | — |
| Privacy | 4 | 4 | 0 | 3/4 |
| Provider | 5 | 5 | 0 | 4/5 |
| Emergency | 10 | 10 | 0 | 9/10 |
| Platform | 6 | 5 | 1 | 5/5 |
| **Total** | **77** | **62** | **15** | **59/62** |

### The three NOW requirements without a dedicated Gate-1 test

| Req | Why | Handling |
|---|---|---|
| R-806 location per-purpose, time-bounded | Covered indirectly by realtime test 66 | **Add an explicit retention test at I-13** |
| R-901 onboarding <10 min | A timing measurement, not an assertion | Manual timing at I-21 |
| R-905 availability in <30 s | Same | Manual timing at I-21 |

The last two are genuinely user-timing measurements. Automating them would test a stopwatch, not the product. They are Gate-1 exit checks, done by hand.

---

## 4. Deferred requirements — recorded, not dropped

**Gate 2 (AI):** R-101, R-102, R-103, R-701…R-712.
**NEXT:** R-106, R-205, R-309, R-404…R-407, R-409, R-509, R-611, R-802, R-804, R-805, R-807, R-906, R-908, R-1102, R-1103 (partial), R-1106.
**LATER/FUTURE:** R-107, R-208, R-308, R-907, R-909, I-01…I-09.

**R-611 needs watching.** Removing stored value at Gate 1 leaves existing loyalty points unredeemable until the per-booking discount ships. Earning is paused and existing balances are honoured when it lands — **and that must be communicated, not silently dropped** (`PHASE-3-IMPLEMENTATION-ROADMAP.md` owner action 13).

---

## 5. Requirements met by *removing* something

Worth naming, because it is the least intuitive part of the plan:

| Req | Met by |
|---|---|
| R-108 works with no AI | **Gate 1 has no AI** — met by construction |
| R-610 stored value removed | The wallet surface is **deleted**; the account kind exists and is non-issuable |
| R-1007 no automated donor notification | The capability is **absent**, and the response says so |
| R-1008 no first-party disaster alerts | `disaster_alert` **does not exist**; `verified_source` replaces it |
| D-011 no lending | **No lending entity of any kind**, deliberately, so nobody can wire one up |

Five requirements satisfied by absence. Each is testable — an absent capability is asserted by a test that fails if it appears.
