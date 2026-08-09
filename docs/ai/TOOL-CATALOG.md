# IMAP 2.0 — AI Tool Catalog

**Status:** PROPOSED · **Phase:** 2 · **Date:** 2026-08-09
**Product law:** Constitution §4 (Tier A/B/C), D-002, D-008 · **Chain:** `AI-ARCHITECTURE.md` §3

This is the complete inventory of what AI can do. **A capability not listed here does not exist for AI.**

---

## 1. Tier partition

| Tier | Rule | Implementation |
|---|---|---|
| **A — Automatic** | Read-only, reversible, no money, no third-party contact, no state visible to another person | Executes on invocation |
| **B — User-confirmed** | Money, commitments, third-party contact, anything another person sees | Returns a **proposal**. Has **no commit path**. Execution is a separate, user-initiated call |
| **C — Never AI-autonomous** | Financial authority, verification decisions, deletion, punitive action, fund movement, emergency dispatch, role grants, audit writes | **No tool exists.** Absence of capability, not policy |

**Tier B tools are structurally incapable of committing.** They return `{proposal_id, …}`; only `POST /ai/tasks/{id}/confirm` — driven by an explicit user action — invokes the domain use case.

---

## 2. Tool contract

Every tool declares all of the following. A tool missing any field fails registration at startup.

```
name                    stable, versioned
tier                    A | B
description             what it does, for the model
input_schema            JSON Schema, validated before invocation
output_schema           JSON Schema, validated after
result_state            one of the nine states (D-008)
evidence                what proves the result
required_permission     policy id in the authorization kernel
resource_scope          what resource the permission is checked against
side_effects            none | proposal | write (Tier B execution only)
idempotency             none | key-required | deterministic-reference
audit                   none | invocation | invocation+payload
rate_limit              per principal, per window
cost_class              free | cheap | expensive
timeout_ms
failure_modes
```

**Generated, not hand-written.** Schemas derive from the OpenAPI contract (`API-ARCHITECTURE.md` §8), so a tool cannot drift from the endpoint it calls.

---

## 3. Tier A — read and prepare

### Discovery

| Tool | Input | Output | State | Evidence |
|---|---|---|---|---|
| `searchServices` | `{query, locale, area_id?}` | candidate services + confidence | **Suggested** | Catalogue match |
| `getService` | `{service_id}` | scope, inclusions, price model, required capabilities | **Available** | Catalogue row |
| `getRelatedServices` | `{service_id, edge_kinds[]}` | related services + weights | **Suggested** | Graph projection |
| `searchProviders` | `{service_id, area_id, window?, price_max?}` | ranked providers + **ranking basis** | **Available** | Discovery query, timestamped |
| `getProvider` | `{provider_id}` | public profile, trust facts, capabilities | **Available** | Provider record. **No phone number** (P1-1) |
| `getAvailability` | `{provider_id, service_id, from, to}` | windows with capacity | **Available**, stamped | Availability query — *"as of 2 minutes ago"* |
| `compareProviders` | `{provider_ids[], service_id}` | side-by-side facts | **Available** | Provider records |

`searchProviders` returns the ranking basis with the results, because R-302 requires the user be able to see why an order was chosen — and a model cannot invent one.

### Pricing

| Tool | Input | Output | State | Notes |
|---|---|---|---|---|
| `getPriceEstimate` | `{service_id, provider_id?, area_id}` | range + drivers | **Estimated** | **Never Confirmed.** No quote is created |
| `getQuote` | `{quote_id}` | itemised quote | **Quoted** | Existing quote only. Tier A cannot issue one |

### The user's own records

All principal-scoped. No tool returns another user's data.

| Tool | Input | Output | State |
|---|---|---|---|
| `getMyBookings` | `{state?, limit}` | bookings | **Confirmed** / **Completed** / … per row |
| `getBooking` | `{booking_id}` | detail + timeline | actual state |
| `trackBooking` | `{booking_id}` | current state, provider position **if the window is open** | actual state |
| `getPaymentStatus` | `{booking_id}` | payment state | actual state |
| `getMyContext` | `{}` | what IMAP remembers (Open tier) | **Available** |
| `getCancellationPolicy` | `{booking_id}` | the policy that applies | **Available** — must cite the real policy record |
| `getEmergencyCapabilities` | `{}` | what IMAP can and cannot do | from `feature_availability` |

### Drafting

| Tool | Input | Output | State | Notes |
|---|---|---|---|---|
| `draftMessage` | `{booking_id, intent}` | text | **Suggested** | **Not sent** |
| `draftReview` | `{booking_id, sentiment}` | text | **Suggested** | **Not submitted** |
| `summarise` | `{resource_type, id}` | summary | **Available** | Only resources the user may read |

---

## 4. Tier B — propose, then execute on confirmation

Each has two phases. The proposal phase is a Tier B tool; the execution phase is `POST /ai/tasks/{id}/confirm`, which invokes **the same use case the HTTP API calls**.

| Tool | Proposal contains | Execution | Idempotency | Audit |
|---|---|---|---|---|
| `proposeBooking` | provider, service, slot, **complete price from a real quote**, cancellation policy | `CreateBooking` | Key required | Full |
| `proposePayment` | booking, amount from the quote, method | `InitiatePayment` | Key required | Full |
| `proposeCancellation` | booking, **refund consequence**, policy applied | `CancelBooking` | Key required | Full |
| `proposeRefundRequest` | booking, amount, reason | `RequestRefund` | Key required | Full |
| `proposeMessage` | recipient, **exact text** | `SendMessage` | Key required | Invocation |
| `proposeReview` | booking, rating, text | `SubmitReview` | Key required | Invocation |
| `proposeReschedule` | booking, new slot, consequence | `RescheduleBooking` | Key required | Full |
| `proposeLocationShare` | purpose, scope, duration | `GrantLocationAccess` | Key required | Full |
| `proposeDonorContactRelease` | donor **reference the user already selected**, purpose | `ReleaseDonorContact` | Key required | Full (D-013) |
| `proposeEmergencyRequest` | kind, description | `CreateEmergencyRequest` | Key required | Full |

### 4.1 Rules

| Rule | Detail |
|---|---|
| A proposal is **immutable once presented** | Any change requires fresh confirmation |
| Confirmation requires an explicit user action | No pre-selection, no auto-advance, no timeout-into-acceptance (Constitution §4) |
| Authorization is checked at proposal **and** at execution | A revoked permission fails the execution |
| Price on a proposal comes from a real `Quote` | Never model-generated |
| Confirmation shown afterwards is derived **from the committed event** | Never from model output |
| `proposeEmergencyRequest` | Available, but an emergency is **never inferred from conversation**. It requires one deliberate user action (Constitution §4) |
| `proposeDonorContactRelease` | The AI **never reads donor records** — they are Sealed. The user selects a donor from the authenticated, masked list; the tool proposes releasing that one contact. The AI sees a reference, not the data |

---

## 5. Tier C — no tool exists

Listed so the absence is deliberate and reviewable.

| Capability | Why no tool |
|---|---|
| Change commission, fees, payout rules | Platform economics are not model output |
| Make a KYC or verification decision | Legal consequence; accountable human review |
| Delete an account or its data | Irreversible |
| Suspend, ban or downgrade a provider | Punitive; requires human review and appeal |
| Move platform funds; execute a payout | Regulated |
| Disburse a loan | D-011 — no lending exists at all |
| **Dispatch an emergency response** | **IMAP does not have this capability** (D-012, D-013) |
| Grant a role or permission | Privilege escalation |
| Write to the audit log | The log records; it is never authored |
| Read another user's data | Isolation |
| Read Sealed context | Constitution §5.3 |
| Publish a service or edit the catalogue | Staff-owned |
| Adjust a trust standing | D-004 |
| Read or modify ledger entries | AD-007 |

**Enforcement.** The tool registry is a closed allow-list. An attempted invocation of an unregistered name is refused, logged, and counted — `tier_c_invocation_attempts` must be **zero** in evaluation (R-710) and any occurrence in production is a security alert.

---

## 6. Permissions

Tools carry a permission checked against the **acting user's** rights (D-002). A tool never holds rights of its own.

| Tool class | Permission | Resource |
|---|---|---|
| Public discovery | none | — |
| Own records | `self.read` | principal |
| Booking read | `booking.observe` | booking (participant or admin) |
| Booking propose | `booking.request` | quote + provider |
| Payment propose | `payment.initiate` | booking (customer) |
| Message propose | `message.send` | conversation (participant) |
| Provider tools (Phase G) | `provider.*` | provider account, via membership |
| Emergency | `emergency.request` | principal |

Guarded context access additionally requires an active grant (`CONTEXT-ARCHITECTURE.md` §3.2).

---

## 7. Evidence and state binding (D-008)

Every tool result carries `result_state` and `evidence`. The renderer will not display a claim whose state is unsupported.

| Situation | Tool returns | Assistant may say |
|---|---|---|
| Availability queried 2 min ago | `Available` + timestamp | "Karim is available Thursday — as of 2 minutes ago" |
| Estimate, no quote | `Estimated` | "Around ৳800–1,200" |
| Quote issued | `Quoted` + quote_id | "৳880 total, valid for 30 minutes" |
| Booking created, provider has not accepted | `Pending` | "Request sent. Waiting for Karim to accept" |
| Provider accepted | `Confirmed` + event id | "Karim accepted for Thursday 3 PM" |
| Tool failed | `Failed` + reason | "That didn't go through. You were not charged" |
| Capability absent | `Unavailable` | "Automatic donor alerts aren't available yet" |
| No evidence | `Unknown` | "I can't confirm that — check your bookings" |

**A `Completed` claim requires a committed domain event.** No event, no claim.

---

## 8. Failure handling

| Failure | Tool returns | User sees |
|---|---|---|
| Timeout | `Unknown` | "I couldn't check that just now" |
| Authorization denied | `Failed` + reason code | Plain explanation |
| Validation failed | `Failed` + field errors | What to fix |
| Resource not found | `Unknown` | Neutral — never confirms existence |
| Rate limited | `Unavailable` + retry-after | "Too many requests, try shortly" |
| Downstream unavailable | `Unavailable` | Degrade to the structured path |
| Idempotency conflict | prior result | Same outcome, no duplicate |

---

## 9. Lifecycle

| Stage | Requirement |
|---|---|
| **Add** | Contract complete (§2); Tier assigned; permission mapped; eval cases added; a Tier B tool must have a proposal renderer before it registers |
| **Change** | Additive only within a version. A breaking change is a new version, both live during migration |
| **Retire** | Announced; usage measured to zero; then removed from the registry |
| **Audit** | Every registration change is audit-logged. The registry is diffed in review — a new tool is a security-relevant change |

---

## 10. What is deliberately absent

| Not a tool | Why |
|---|---|
| `createBooking` (direct) | Booking is Tier B — propose then confirm |
| `setPrice` | Pricing is server-owned (P6) |
| `rankProviders` (LLM ranking) | Deterministic and inspectable (R-302) |
| `sendNotification` | Notification is event-driven with caps |
| `findVerifiedBloodResources` (as an autonomous search) | Donor data is Sealed; access is a per-release, consent-gated Tier B action (D-013) |
| `dispatchEmergency` | The capability does not exist |
| `createSupportTicket` | Phase F, with the dispute workflow |
| `getUserContext` for another user | Isolation |
| Anything writing to the catalogue, ledger, audit log or trust standing | Tier C |
