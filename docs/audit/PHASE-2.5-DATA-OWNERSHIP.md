# IMAP 2.0 — Phase 2.5 Data Ownership Validation

**Status:** VALIDATION · **Phase:** 2.5 · **Date:** 2026-08-09
**Validates:** `docs/architecture/DOMAIN-ARCHITECTURE.md` §4, `DATA-ARCHITECTURE.md` §3
**Rule under test:** every authoritative state has **exactly one** owner. Any state with two owners is a critical architecture defect.

---

## 1. Result

| Check | Result |
|---|---|
| States examined | 24 |
| Single, unambiguous owner | 20 |
| **Ambiguous or duplicated — defect** | **3** (O-01, O-02, O-03) |
| Owner correct but the derived copy is under-specified | 1 (O-04) |

**Gate B (domain consistency): CONDITIONAL PASS** — passes once O-01, O-02 and O-03 are resolved in documentation. All three are specification gaps, not design errors: the right owner is identifiable in each case, but Phase 2 does not say so unambiguously, and an implementer could reasonably choose wrong.

---

## 2. Ownership register

| # | Authoritative state | Owner | Readers | Verdict |
|---|---|---|---|---|
| 1 | Principal identity, credentials, sessions | Identity | All | ✅ |
| 2 | Account, membership, role | Identity | All | ✅ |
| 3 | Contact verification level | Identity | Booking, Trust, Marketplace | ✅ |
| 4 | Identity documents, verification decision | Identity (KYC) | Trust (outcome only) | ✅ |
| 5 | Service definition, taxonomy | Catalog | All | ✅ |
| 6 | Service relationships | Catalog | Discovery, AI | ✅ |
| 7 | Capability definition | Catalog | Provider, Trust | ✅ |
| 8 | Provider profile | Provider | Discovery, Booking | ✅ |
| 9 | Provider capability (declared) | Provider | Discovery | ✅ |
| 10 | Capability **verification** | **Ambiguous** | — | ❌ **O-01** |
| 11 | Coverage area | Provider | Discovery | ✅ |
| 12 | Provider price input | Provider | Pricing | ✅ |
| 13 | **Listing eligibility** | Trust (granted), Marketplace (applied) | Discovery | ✅ — correctly separated |
| 14 | Availability windows, slot holds | Availability | Booking | ✅ |
| 15 | Need record | Discovery | Analytics, AI | ✅ |
| 16 | Quote and price | Pricing | Booking, Finance | ✅ |
| 17 | Booking state | Booking | All | ✅ |
| 18 | **Booking's payment status** | **Ambiguous** | — | ❌ **O-02** |
| 19 | Payment state | Payment | Booking (derived), Finance | ✅ |
| 20 | Ledger entries | Ledger | Finance | ✅ |
| 21 | Balance | **Derived from Ledger** — no independent owner | Finance | ✅ |
| 22 | Payout claim state | Payout | Provider (read) | ✅ |
| 23 | Commission owed | Commission | Payout, Analytics | ✅ |
| 24 | Trust signals | Trust | — | ✅ |
| 25 | Provider standing | Trust | Marketplace, Discovery | ⚠️ **O-04** — derived copy under-specified |
| 26 | Review content | Review | Trust, Marketplace | ✅ |
| 27 | **Dispute state vs held funds** | **Ambiguous** | — | ❌ **O-03** |
| 28 | Conversation, messages | Messaging | Realtime | ✅ |
| 29 | Emergency request | Emergency | Administration | ✅ |
| 30 | Donor consent, contact release | Emergency | — | ✅ |
| 31 | Verified source, hotline | Emergency | Public read | ✅ |
| 32 | AI conversation, task, proposal | AI | — | ✅ |
| 33 | AI context item | AI Context | AI only | ✅ |
| 34 | Notification preference | Notification | — | ✅ |
| 35 | Notification state | Notification | — | ✅ |
| 36 | Audit records | Audit (write-only from others) | Authorized ops roles | ✅ |
| 37 | Outbox events | Platform | Dispatcher | ✅ |
| 38 | Feature availability | Platform | All, Emergency | ✅ |

---

## 3. Defects

### O-01 — Capability *verification* has no declared owner · **HIGH**

**The ambiguity.** `DOMAIN-ARCHITECTURE.md` places `provider_capability` under the Provider domain (a provider declares what they do) and `verification_case` under Identity/KYC (a human decides whether documents are genuine). `TRUST-ARCHITECTURE.md` §6 then lists "Capability verified — evidence for certification-gated capabilities" as a verification level, implying Trust owns it.

Three domains touch it. None is named as the authority.

**Why it matters.** `provider_capability.verified` is the flag that decides whether someone may be booked for a refrigerant-handling job. If Provider owns it, a provider can self-assert a regulated capability — precisely the class of defect D-005 exists to prevent.

**Recommended resolution (documentation only).**
* `provider_capability` (the *declaration*) — owned by **Provider**. A provider says what they do.
* `capability_verification` (the *decision*) — owned by **Identity/KYC**, because it is the same human-review workflow as identity, with the same Sealed evidence handling and the same Tier-C constraint.
* **Trust reads the decision; it does not make it.** Trust's role is to fold a verified capability into eligibility.
* `provider_capability.verified` becomes a **projection** of the KYC decision, not an independently writable column.

---

### O-02 — Booking's payment status has two plausible owners · **HIGH**

**The ambiguity.** `FINANCIAL-ARCHITECTURE.md` states Payment owns payment state and that "Booking marks itself paid **on this event**". `DATA-ARCHITECTURE.md` lists no `payment_status` on the `booking` entity. The current schema *does* have `bookings.payment_status`, and Phase 0.5 writes to it from the booking-creation path for wallet settlement.

So: does a booking carry payment status, and if so is it authoritative or derived? Phase 2 does not say.

**Why it matters.** This is the exact shape of the duplicated-authority defect the audit found with `users.balance`. If `bookings.payment_status` is writable by the Booking domain *and* updated from `payment.captured`, the two can diverge, and the divergence decides whether a customer gets charged twice — which is P1-5, the double-charge, returning by a different route.

**Recommended resolution (documentation only).**
* **Payment is authoritative.** Full stop.
* `booking.payment_status` is a **read-model column**, updated only by the `payment.captured` / `payment.failed` / `refund.issued` event handlers, never by a booking use case.
* It is rebuildable from Payment state, and a reconciliation check compares the two (add to `FINANCIAL-ARCHITECTURE.md` §7).
* The cash-on-completion path needs an explicit answer: cash never enters the Payment machine (`STATE-MACHINES.md` §5), so Booking would have nothing to derive from. **Recommendation: cash settlement produces a `Payment` record with `method = cash` and state `captured` at completion**, so there is one payment concept and one owner rather than two paths.

---

### O-03 — Dispute state and held funds have split authority · **MEDIUM**

**The ambiguity.** `DOMAIN-ARCHITECTURE.md` puts Dispute inside the **Booking** context. `STATE-MACHINES.md` §8 has the **PayoutClaim** move to `held` when a dispute is raised. `FINANCIAL-ARCHITECTURE.md` describes funds being held.

Who decides that funds are held — Booking (by raising a dispute) or Finance (by observing the event)?

**Why it matters.** If Booking writes the hold, a Booking use case is mutating Finance-owned state, violating the rule this document tests. If Finance observes the event, there is a window between the dispute being raised and the hold applying, during which a payout batch could execute.

**Recommended resolution (documentation only).**
* Booking owns the **dispute**. It publishes `booking.disputed`.
* Finance owns the **hold**. It applies the hold on that event.
* The race is closed by making the payout clearance check re-read dispute state at batch time rather than relying solely on the claim's `held` flag — a belt-and-braces guard consistent with the three-layer idempotency approach used elsewhere.

---

### O-04 — Standing copied into a Marketplace projection · **LOW, documentation only**

`SERVICE-GRAPH.md` §4 defines `provider_service_area` carrying `standing_facts`. Trust owns standing; Marketplace owns the projection.

This is legitimate — `DATA-ARCHITECTURE.md` permits derived state — but the projection is not labelled as non-authoritative in `SERVICE-GRAPH.md` itself, and a reader of that document alone could treat it as a place to write.

**Resolution.** Add an explicit "derived, never authoritative; rebuildable from Trust" note to `SERVICE-GRAPH.md` §4.

*(This defect disappears entirely if the simplification in `PHASE-2.5-SIMPLIFICATION.md` S-03 is adopted, since the projection is deferred.)*

---

## 4. Ownership patterns that are correct and worth keeping

| Pattern | Where | Why it is right |
|---|---|---|
| **Granted by one, applied by another** | Trust grants listing eligibility; Marketplace applies it | Neither can act alone. A provider cannot self-list, and Trust does not reach into the directory |
| **Derived, never stored as authority** | Balance from ledger entries | The single most important correction from Phase 0 |
| **Write-only from outside** | Audit | Other contexts append; none can edit |
| **Read-only outward** | AI | AI owns nothing another context depends on |
| **Isolated** | Emergency | Nothing outside depends on it |
| **Immutable + lifecycle elsewhere** | Ledger entry (no states) + PayoutClaim (states) | Resolves the Phase 2 C-01 conflict correctly |

---

## 5. Cross-context write check

The rule: *a domain must not directly mutate another domain's authoritative state.*

| Potential violation | Verdict |
|---|---|
| Booking → Availability (slot hold) | ✅ Booking **requests** a hold; Availability owns the record |
| Booking → Finance (completion payout) | ✅ Booking publishes; Finance posts |
| Trust → Marketplace (eligibility) | ✅ Trust publishes `StandingChanged`; Marketplace applies |
| Payment → Booking (paid) | ⚠️ **O-02** — must be event-driven, not a direct write |
| Booking → Finance (dispute hold) | ⚠️ **O-03** — must be event-driven |
| AI → anything | ✅ Only through tool → use case |
| Discovery → Provider | ✅ Read-only |
| Analytics → anything | ✅ Read-only |
| Emergency → Booking | ✅ Reference only (R-1010) |

Two of nine need the direction stated explicitly. Neither is a design error; both are unstated assumptions that an implementer could get wrong.

---

## 6. Circular dependency: Booking ↔ Finance

`DOMAIN-ARCHITECTURE.md` §1 shows `BK --> FN` (`BookingCompleted`) and `FN --> BK` (`PaymentCaptured`). This is a genuine cycle at the context level.

**Assessment: acceptable, but it must be stated as a rule rather than left as a diagram artefact.**

| Direction | Mechanism | Constraint |
|---|---|---|
| Booking → Finance | **Event** (`booking.completed`) | Asynchronous. Booking never calls a Finance command synchronously |
| Finance → Booking | **Event** (`payment.captured`) | Asynchronous. Finance never writes booking state |
| Booking → Finance | **Query** (read payment status for display) | Synchronous read is permitted; it creates no write cycle |

Both write directions are event-only, so there is no synchronous call cycle and no distributed transaction. The runtime cycle is real but benign, provided O-02 and O-03 are resolved as event-driven.

**Recommendation:** add this table to `DOMAIN-ARCHITECTURE.md` §1.1 as an explicit rule.

---

## 7. Verdict

**Gate B — CONDITIONAL PASS.**

No state has two genuine owners by design. Three have ambiguous documentation that would let an implementer create duplicate authority, and all three sit on money or safety paths — which is exactly where the Phase 0 audit found the original defects.

**Required before Phase 3:** resolve O-01, O-02 and O-03 in the Phase 2 documents. Each is a paragraph, not a redesign. O-04 is a one-line note.
