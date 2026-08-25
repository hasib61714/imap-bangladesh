# IMAP 2.0 — Metrics and North Star

**Status:** PROPOSED · **Phase:** 1 · **Date:** 2026-08-09
**Governed by:** `PRODUCT-CONSTITUTION.md`

**Nothing in this document is currently measured.** The audit found no analytics events, no funnel instrumentation and no business metrics anywhere in the codebase — the only counters are booking count and summed amount in `/api/admin/stats`. Every metric here is TARGET. Instrumentation is a Phase B roadmap item and a prerequisite for making any claim about whether IMAP works.

---

## 1. North Star: Successful Needs Resolved

### 1.1 Definition

> **A Resolved Need is a need a user expressed on IMAP that reached a completed service, settled correctly, with no unresolved dispute after 7 days.**

**North Star metric: count of Resolved Needs per week.**

### 1.2 Precise criteria

A need-thread counts as Resolved when **all** hold:

| # | Criterion | Evidence |
|---|---|---|
| 1 | A need was expressed (natural language, voice, category selection or direct search) | Need record created |
| 2 | It produced at least one booking | Booking linked to the need |
| 3 | A booking reached `completed` | Terminal state committed |
| 4 | Completion was confirmed by the customer | Customer confirmation (R-505) |
| 5 | Payment settled — captured digitally or recorded as cash received | Ledger entry |
| 6 | No dispute open, and none raised in the following 7 days | Dispute state |

### 1.3 What deliberately does not count

| Not counted | Why |
|---|---|
| A booking that completed but is disputed | The need was not resolved |
| A completed booking the customer never confirmed | Provider self-completion is not evidence (the original defect) |
| A need where the user found a provider and left the platform | Honest: IMAP cannot verify the outcome. Counting it would let us claim credit for things we cannot see |
| Sessions, searches, screen time, notification opens | Not outcomes |

### 1.4 The measurement gap we are accepting

Criterion 2 makes the North Star booking-dependent. Some needs are legitimately resolved by information alone ("is this something I can fix myself?"). Counting only bookings under-reports genuine value **and** conveniently aligns the metric with revenue — a bias worth naming.

**Mitigation:** track *Needs Expressed* and *Need Resolution Rate* alongside the absolute count, and track **Abandoned Needs** with reasons (§2). A rising Resolved Need count alongside a falling resolution rate means IMAP is growing traffic while helping a smaller share of people. That is a failure, and the metric set must be able to show it.

### 1.5 Why not the alternatives

| Candidate | Rejected because |
|---|---|
| GMV | Grows by raising prices or by shifting to expensive categories. Says nothing about resolution |
| Bookings created | Counts intent, not outcome. A booking nobody honours counts the same as a job well done |
| MAU | A user who returns weekly because IMAP keeps failing counts as success |
| Time in app | Directly contradicts the product thesis (Constitution §11). **Never reported as a success metric** |
| Completed bookings | Closest alternative, but ignores disputes and customer confirmation — the two things that distinguish "finished" from "resolved" |

---

## 2. Funnel metrics — the resolution loop

One metric per stage of the product equation (Constitution §2). Each has an obvious failure interpretation.

| Stage | Metric | Definition | Failure signal |
|---|---|---|---|
| NEED | **Needs Expressed** | Distinct need-threads started | — |
| UNDERSTAND | **Intent Resolution Rate** | Needs mapped to a service the user accepted / needs expressed | Low ⇒ the intent model is wrong or the taxonomy is missing entries |
| UNDERSTAND | **Disambiguation Depth** | Mean questions before a service is accepted | >1 ⇒ violates R-103; the flow is an interrogation |
| DISCOVER | **Supply Hit Rate** | Needs with ≥1 available matched provider / needs understood | Low ⇒ thin supply. **The most likely early failure** |
| RECOMMEND | **Selection Rank** | Median rank of the provider actually chosen | Consistently >3 ⇒ ranking does not reflect user preference |
| TRUST | **Profile-to-Book Rate** | Bookings / provider profile views | Low ⇒ profiles do not convince; trust signals are insufficient |
| APPROVE | **Approval Completion Rate** | Bookings confirmed / approval surfaces reached | Low ⇒ price shock or unclear terms at the final step |
| EXECUTE | **Booking Success Rate** | Bookings reaching `confirmed` / bookings created | Low ⇒ providers not accepting; supply liquidity problem |
| TRACK | **Arrival Accuracy** | Actual vs promised arrival window | Poor ⇒ the tracking promise is not real |
| COMPLETE | **Completion Rate** | Completed / confirmed | Low ⇒ jobs falling through after acceptance |
| COMPLETE | **Time to Resolution** | Need expressed → completed, median and p90 | Rising ⇒ the marketplace is getting slower |
| LEARN | **Review Rate** | Reviews / eligible completed bookings | Low ⇒ the trust graph starves |

**Abandoned Needs** must be tracked with a reason: `no_provider`, `price_too_high`, `no_availability`, `intent_failed`, `user_left`, `technical_error`. This is the most actionable single dataset the product will have.

---

## 3. Provider metrics

Provider success is a first-class outcome, not a supply statistic (Constitution §11, M4).

| Metric | Definition | Why |
|---|---|---|
| **Active providers** | Accepted ≥1 booking in the period | Real supply, not signups |
| **Time to first job** | Approval → first completed booking | The cold-start metric. A long tail here means new providers churn before earning |
| **Provider net earnings per active hour** | Net after commission ÷ hours committed | **M4 guardrail.** A change that grows GMV while lowering this is a regression |
| **Job acceptance rate** | Accepted / offered | Low ⇒ poor matching or unattractive terms |
| **Provider retention (90-day)** | Still active after 90 days | Supply-side health |
| **Earnings concentration** | Share of bookings going to the top decile | High ⇒ new providers are starved; the allocation policy (J4) is not working |
| **Payout timeliness** | Promised vs actual | Trust with the supply side |
| **Provider-initiated cancellation rate** | After acceptance | Direct trust-graph input |

---

## 4. Trust and safety metrics

| Metric | Definition | Target direction |
|---|---|---|
| **Dispute rate** | Disputes / completed bookings | Low, stable |
| **Dispute resolution time** | Raised → resolved, median | Low |
| **Repeat customer rate** | Customers with ≥2 completed bookings / customers with ≥1 | **High — the strongest single signal that IMAP works** |
| **Provider repeat rate** | Bookings from a returning customer / total | High |
| **Verification coverage** | Listed providers with completed identity verification | 100% (D-005) |
| **Safety incidents** | Reported incidents involving harm, theft or harassment | Zero-tolerance monitoring; **any incident is reviewed individually, never treated as a rate** |
| **Appeal rate and overturn rate** | Appeals / negative determinations; overturned / appealed | High overturn ⇒ the trust model is making bad calls |

---

## 5. Commercial metrics

| Metric | Definition | Notes |
|---|---|---|
| **GMV** | Value of completed bookings | Volume context only — never a headline metric |
| **Net revenue** | Commission collected | |
| **Take rate (effective)** | Net revenue / GMV | Differs from the nominal rate because of cash accrual and refunds |
| **Contribution per booking** | Revenue − variable cost (`BUSINESS-MODEL.md` §5) | |
| **Commission collection rate** | Collected / owed | The cash-payment risk, made visible |
| **Disintermediation rate** | Customer–provider pairs whose bookings stop after the first while both stay active | **The existential number.** Approximate; document the estimation method |
| **CAC by channel** | | |
| **Payback period** | CAC ÷ contribution per customer per period | |

---

## 6. AI metrics

| Metric | Definition | Gate |
|---|---|---|
| **Intent accuracy** | Correct service in top 3, on a held-out labelled set | ≥85% to ship (R-101) |
| **Tool selection accuracy** | Correct tool chosen, on the eval set | ≥90% to ship (R-710) |
| **Unevidenced claim rate** | Completed/Confirmed claims without a matching event | **Zero. Any occurrence blocks release** (P4) |
| **Tier-C invocation attempts** | Attempts to call a tool that must not exist | **Zero** |
| **AI action success rate** | Confirmed AI-proposed actions that committed successfully | High |
| **AI recommendation acceptance** | Proposals the user accepted unmodified | Informative, not a target — a high rate could mean good proposals or passive users |
| **AI-assisted resolution rate** | Resolved Needs where AI was used / all Resolved Needs | Compare against the non-AI path. **If AI-assisted resolution is not better, AI is not earning its cost** |
| **Cost per resolved need (AI)** | Inference spend ÷ Resolved Needs | Must stay well below contribution per booking |
| **Fallback rate** | Sessions degrading to the non-AI path | Availability signal |
| **Time to first token** | p75 | ≤2 s (N-03) |

---

## 7. Experience metrics

| Metric | Target | Source |
|---|---|---|
| First contentful paint (mid-range Android, 3G) | ≤3 s p75 | RUM (N-01) |
| Need → first results | ≤4 s p75 | Trace (N-02) |
| Booking confirmation round trip | ≤2 s p95 | Trace (N-04) |
| Realtime propagation | ≤3 s p95 | Trace (N-05) |
| Error rate on the core loop | <0.5% of sessions | Error tracking |
| Accessibility conformance on the core loop | A-01…A-09 pass | Audit |
| Bangla usage share | Observed | Locale |
| Voice input usage | Observed | Event — validates a `PERSONAS.md` C4 assumption |

---

## 8. Anti-metrics — never optimised, never celebrated

Reporting any of these as a success is a violation of Constitution §11 and P7.

| Anti-metric | Why |
|---|---|
| Session length | A user resolving a need in 90 seconds is a success |
| Sessions per day | Repeated visits often mean repeated failure |
| Notification open rate | Invites notification spam |
| Feed scroll depth | No feed exists (D-006), and if one ever does this is not its metric |
| Screens per session | More navigation is worse, not better |
| Time to first ad impression | No ads |

**Rule.** If a change improves an engagement metric and does not improve Resolved Needs or Need Resolution Rate, it is a regression and is reverted.

---

## 9. Metric governance

1. **One North Star.** Resolved Needs per week. Everything else is diagnostic.
2. **Every metric has an owner and a decision it informs.** A metric nobody acts on is deleted.
3. **Paired metrics.** Volume metrics are always reported with a quality counterpart: Resolved Needs with Resolution Rate; GMV with provider net earnings-per-hour; AI usage with unevidenced-claim rate.
4. **No vanity reporting.** Fabricated statistics are a live hazard for this product specifically — the audit found a landing page animating counters to 10,000 customers and 1,200 providers from hardcoded constants, and schema.org structured data publishing a 4.8 rating over 10,000 reviews. **Any number shown to a user or published externally must come from the metric pipeline.**
5. **Instrument before building.** A feature ships with its metric or it does not ship.

---

## 10. Instrumentation requirements (Phase B prerequisite)

| Requirement | Priority |
|---|---|
| A `need` entity linking expression → understanding → booking → outcome (R-1108) | NOW |
| An analytics event stream distinct from application logs | NOW |
| Funnel events at every stage in §2, including abandonment with a reason | NOW |
| The audit log (R-1101) as the source of truth for state-change metrics | NOW |
| AI evaluation harness running in CI (R-710) | NOW |
| RUM for §7 | NEXT |
| A single dashboard showing the North Star, funnel and the three paired metrics | NEXT |
| Cohort analysis for repeat and disintermediation rates | NEXT |

**Until the audit log exists, most of §2–§5 cannot be computed reliably.** That is one more reason R-1101 is a MUST.
