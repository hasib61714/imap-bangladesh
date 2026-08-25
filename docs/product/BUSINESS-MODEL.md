# IMAP 2.0 — Business Model

**Status:** PROPOSED · **Phase:** 1 · **Date:** 2026-08-09
**Governed by:** `PRODUCT-CONSTITUTION.md` · **Key decisions:** D-009, D-010, D-011

---

## 1. Where the business is today

**CURRENT.** IMAP has **no functioning revenue mechanism**. This is not a gap in ambition; it is a fact about the code.

| Mechanism | Built? | Working? | Evidence |
|---|---|---|---|
| Commission | Partially | **No** | `bookings.platform_fee` exists. It was client-supplied until Phase 0.5 and is now server-computed from `PLATFORM_FEE_PCT`, which defaults to `0`. Every booking currently earns zero. |
| Subscription | No | — | No plan, entitlement or billing-cycle model exists |
| Lead fees | No | — | — |
| Premium placement | No | — | Ranking is `ORDER BY rating DESC` for everyone |
| Paid provider tools | No | — | All provider features are free |
| Business SaaS | No | — | `users.role` has three values; no organisation entity |
| Transaction fee on payments | No | — | `payments.amount` equals the booking total; no fee is split out |
| AI features | No | — | AI endpoints are free |

**Revenue is zero by construction.** Setting `PLATFORM_FEE_PCT` to a non-zero value is a one-line configuration change, but *what* that number should be is a business decision nobody has made, and the surrounding product (payouts, disputes, refunds) is not ready to support it.

---

## 2. Monetisation principles

Binding constraints on every mechanism below.

| # | Principle | Consequence |
|---|---|---|
| **M1** | **IMAP earns when a need is resolved.** | Rules out lead fees, which pay the platform for failed matches |
| **M2** | **Monetisation must never degrade recommendation quality.** | Rules out unlabelled paid placement (P7) |
| **M3** | **Price transparency is not negotiable.** | The customer sees the total they will pay, including any IMAP fee, before approving |
| **M4** | **Provider economics must remain viable.** | Provider net earnings-per-hour is a tracked metric (`KPI.md` §3). A change that grows GMV while lowering it is a regression |
| **M5** | **No monetisation of sensitive context.** | Health, emergency, KYC and financial-distress signals are never commercial inputs |
| **M6** | **Do not monetise before value is proven.** | Charging providers before they receive jobs kills the supply side at cold start |
| **M7** | **No regulated activity without a licence.** | See D-010, D-011 |

---

## 3. Mechanism analysis

Every plausible mechanism, assessed honestly.

### 3.1 Commission on completed bookings — **MVP**

**How.** A percentage of the service amount on bookings that reach `completed`.

| | |
|---|---|
| **Alignment (M1)** | Strong — IMAP is paid exactly when a need is resolved |
| **Willingness to pay** | Providers pay for demand they could not otherwise reach. The comparison is not "commission vs zero" but "commission vs marketing they cannot do" |
| **Risk** | **Disintermediation.** After the first job, both parties have each other's number. This is the central commercial risk in home services and it cannot be prevented by contract — only by being worth using again (booking record, dispute recourse, payment handling, scheduling) |
| **Cash flow** | Only on completion. Slow at low volume |
| **Rate** | Not decided. Must be set before launch |
| **Blocked on** | Reliable completion state (R-505), payout ledger (R-607) and a working refund path (R-608) — all three are hard prerequisites at Gate 1. **Taking a commission without a refund path is taking money you cannot return.** A *productised* dispute workflow (R-1102) is Phase F; at Gate 1 a manual, audit-logged admin process is the minimum acceptable substitute, and it must exist before the first commission is charged |

**Recommendation.** Launch with a single flat percentage across all MVP categories. Resist per-category optimisation until there is data. Publish the rate to providers; do not hide it in a payout total.

**Rate-setting inputs (to be gathered in Phase A, not guessed now):** typical job value per category, provider's realistic alternative acquisition cost, customer price sensitivity at the C3 end (`PERSONAS.md`), and competitive reference points in the local market.

---

### 3.2 Cash-on-completion handling — **MVP, and the hard part**

**The problem.** Cash is the dominant payment method for home services in Bangladesh. If the customer pays the provider in cash, IMAP has no automatic way to collect its commission.

**Options.**

| Option | Mechanics | Assessment |
|---|---|---|
| **A. Commission on digital only** | Cash bookings are free to the provider | Simple, but creates a strong incentive to steer every job to cash. Undermines the whole model |
| **B. Accrue commission as a provider debit** | Commission is owed and deducted from future digital payouts | **Recommended.** Uses the earnings ledger IMAP is building anyway (R-607). Requires a mixed payment history to work, and a policy for providers who only ever take cash |
| **C. Charge a customer-side booking fee on cash** | The customer pays IMAP directly at booking | Adds friction at conversion for the most price-sensitive segment. Rejected for launch |
| **D. Cash-free marketplace** | Digital payment only | Rejected — excludes a large share of the market and both C4 and C3 |

**Recommendation: B, with a stated cap on accrued debt and a clear path to settle it.** This is an unsolved area and should be treated as a launch risk, not a solved design.

---

### 3.3 Provider subscription — **Phase 2**

**How.** An optional paid tier: enhanced profile, richer analytics, priority in the new-provider allocation, scheduling tools.

**Assessment.** Predictable recurring revenue and smooths commission-driven cash flow. But it violates M6 if introduced before providers reliably receive jobs, and it prices out the single-operator supply base if it becomes mandatory.

**Recommendation.** Never mandatory. Never a route to better ranking on quality-neutral grounds (M2). Introduce only once providers demonstrably earn more through IMAP than they spend on it.

---

### 3.4 Premium placement — **Phase 3, with hard constraints**

**Assessment.** Reliable marketplace revenue and directly in tension with M2 and P7.

**Constraints if ever introduced.** Visibly labelled. Never outranks a materially better option on price, availability or trust. Confined to a bounded slot, not woven through organic results. Removed if it measurably reduces need-resolution rate.

**Recommendation.** Do not build before there is enough supply density that placement is genuinely scarce. Premature placement monetisation in a thin marketplace degrades the product and earns almost nothing.

---

### 3.5 Lead fees — **NEVER**

Charging a provider per introduced lead regardless of outcome. **Directly violates M1** — IMAP would be paid for failed matches, which is precisely the incentive that makes classified-ad platforms unpleasant. Rejected permanently.

---

### 3.6 Business / SME subscription — **Phase 3+**

**How.** Per-seat or per-site pricing for the workspace in `USER-JOURNEYS.md` J6: approvals, recurring services, consolidated invoicing, spend analytics.

**Assessment.** Higher value per account, more predictable, and lower disintermediation risk — an office manager wants the invoice trail and cannot easily replicate approvals over WhatsApp. But it is a different product with a different sales motion, and none of it exists.

**Recommendation.** Real opportunity, correctly sequenced late (D-014).

---

### 3.7 Payment / transaction fee — **not separately**

A fee on payment processing distinct from commission. Rejected as a *separate* line: it is commission with extra steps and worse optics. Gateway costs are an input to the commission rate, not a second charge.

---

### 3.8 AI features as a paid product — **Phase 3+, provider side only**

**Assessment.** Consumer-side AI must stay free — it is the core promise (Constitution §1.1), and charging for understanding would be charging for the product. Provider-side AI (demand forecasting, pricing guidance, customer insight) is genuinely a business tool with willingness to pay, and belongs inside the subscription tier rather than as a separate SKU.

---

### 3.9 Financial products — **removed, see D-010 / D-011**

| Product | Decision | Why |
|---|---|---|
| Customer wallet / stored value | **Removed** (D-010) | Stored value is regulated in Bangladesh (Bangladesh Bank PSO/PSP). No product need. The audit's worst money defects clustered here |
| Microloans | **Removed** (D-011) | Microcredit is licensed under the MRA Act 2006. The implementation was a heuristic score and a fixed rate with no repayment, collections or ledger |
| Referral to a licensed lender | **FUTURE** | IMAP's booking and earnings history is genuinely valuable underwriting data for provider working-capital finance. IMAP introduces; a licensed partner underwrites and lends |
| Insurance / warranty | **FUTURE** | Regulated. A "work guaranteed for 30 days" product is commercially attractive and legally non-trivial |

**Both removals need legal confirmation before implementation.** They are recorded as ⚠ sign-off decisions.

---

## 4. Prioritisation

| Mechanism | MVP | Phase 2 | Phase 3 | Future | Never |
|---|:---:|:---:|:---:|:---:|:---:|
| Commission on completed bookings | ● | | | | |
| Cash commission accrual (option B) | ● | | | | |
| Provider subscription (optional) | | ● | | | |
| Business/SME subscription | | | ● | | |
| Premium placement (labelled, bounded) | | | ● | | |
| Provider AI tools (within subscription) | | | ● | | |
| Referral to licensed lender | | | | ● | |
| Insurance / warranty | | | | ● | |
| Customer stored value | | | | | ● |
| Own-book lending | | | | | ● |
| Lead fees | | | | | ● |
| Unlabelled paid ranking | | | | | ● |
| Selling user data | | | | | ● |

---

## 5. Unit economics — the structure, not the numbers

**No figures are given because IMAP has none.** Inventing them would make the model unfalsifiable. What follows is the equation to fill in during Phase A.

```
Revenue per completed booking = service_amount × commission_rate

Variable cost per booking =
    payment gateway fee
  + AI inference (intent + assistant, per session)
  + SMS/OTP
  + support cost × dispute rate
  + refund/chargeback loss × failure rate

Contribution per booking = revenue − variable cost

Provider lifetime value  = bookings/month × months retained × contribution
Customer lifetime value  = bookings/year  × years retained  × contribution
```

**The three numbers that decide whether the business works:**

1. **Repeat rate.** Acquisition is the dominant cost. A marketplace where the median customer books once does not work at any commission rate.
2. **Disintermediation rate.** What share of relationships leave the platform after the first job. This is the existential number in home services, and it is measurable (`KPI.md` §5).
3. **Provider net earnings-per-hour with IMAP vs without.** If this is not clearly positive, supply erodes regardless of demand (M4).

**Cost note.** AI inference is a real per-session cost that scales with usage and is currently unmeasured and uncapped. `PRD.md` R-709 requires per-user cost limits and usage recording before AI is on the default path for all traffic.

---

## 6. Market entry

| | |
|---|---|
| **Wedge** | 5–8 home-service categories, one city, high-frequency and low-regulatory-risk |
| **Demand side** | Need-driven search, referral, and provider-led local networks. **Not** a viral content loop (D-006) |
| **Supply side** | Direct recruitment, area by area. Density in a few areas beats thin coverage across Dhaka — a marketplace with no available provider nearby is worse than no marketplace |
| **Sequencing** | Supply first, narrowly. A customer who searches and finds nobody does not come back |
| **The real incumbent** | Facebook groups and personal referral. Not another app. IMAP wins on accountability and price certainty, not on selection |

---

## 7. Risks to the model

| Risk | Severity | Mitigation | Status |
|---|---|---|---|
| **Disintermediation after job one** | **Existential** | Be worth returning to: booking record, dispute recourse, payment handling, scheduling, repeat-provider convenience | Partly designed (J2), unproven |
| Commission rejected by providers | High | Rate research in Phase A; demonstrate incremental demand before charging | Not started |
| Cash payments bypass commission | High | Ledger accrual (option B) | Design open |
| Thin supply in the launch area | High | Narrow geographic focus; recruit before opening demand | Roadmap Phase A |
| Trust incident (theft, harassment, injury) | **Existential** | Two-sided verification, in-booking SOS, dispute workflow, insurance later | Partly built |
| Regulatory action on wallet/lending | High | Remove both (D-010, D-011) | Decisions pending sign-off |
| AI cost outruns contribution | Medium | Per-user caps; non-AI path always available | R-709 |
| Price transparency compresses provider rates | Medium | Show ranges and quality differentiation, not just the cheapest | Design |
| Platform absorbs blame for provider failure | Medium | Clear responsibility boundaries; visible recourse | Design |

---

## 8. What must be true for this to work

Stated as falsifiable conditions, so the model can be proven wrong early rather than late.

1. Customers will pay a modest premium over direct contact for price certainty and recourse.
2. Providers will accept a commission because IMAP brings demand they could not reach.
3. A meaningful share of relationships stay on the platform after the first job.
4. Repeat usage is frequent enough that acquisition cost amortises.
5. Trust incidents are rare enough to be handled by a dispute process rather than by insurance.
6. AI inference cost per resolved need stays well below contribution per booking.

**If (1), (2) or (3) is false, the model does not work and no amount of product polish fixes it.** Phase A of the roadmap exists to test them.
