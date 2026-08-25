# IMAP 2.0 — UX Implementation Plan (Gate 1)

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Governed by:** `UX-CONSTITUTION.md` · `USER-FLOWS.md` · `INFORMATION-ARCHITECTURE.md` · `BEHAVIORAL-DESIGN.md`
**Baseline:** behavioural scorecard **1.4 / 5** across 21 capabilities (`UX-GAPS.md`)

---

## 1. The rule that generates every table below

> **No feature is complete without loading, empty, error and success states.**

The audit found *every* list loader shaped `if (d?.x?.length) setX(...)` — so an empty database, a failed request, an expired token and a cold-started backend all produced the same outcome: **fabricated rows presented as real, with no error**. That is one defect with four causes, and it is the single highest-impact UX problem in the product.

Consequently every surface below specifies six states, not three: **loading · empty · error · degraded · success · offline**. A surface missing any of them is not implemented.

---

## 2. Journey → implementation

### J1 · F1 — Need to booking (the core flow)

| Screen | Route | Components | API | State | Loading | Empty | Error | Success | Degraded | Realtime | A11y |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Home | `/` | `AskInput`, `ActiveBookingCard`, `QuickActions`, `BrowseServices` | `GET /bookings?state=active`, `GET /services` | server + session | skeleton **unlike content** | **section absent, not empty** (IA §3.2) | inline retry | — | AI off → search + browse | active-booking card updates | landmarks; input labelled |
| Ask | `/ask` | `AskInput`, `VoiceButton`, `SuggestedServices` | `POST /needs` | flow (persisted) | inline | example needs in Bangla | "couldn't understand — browse instead" | services shown as **Suggested** | **Gate 1 = keyword + browse; no AI** | — | voice on tap, never on load |
| Results | `/providers` | `ProviderCard`, `FilterBar`, `SortBasis` | `GET /providers` | server, **URL-keyed** | 3 skeleton cards | **"No providers for AC servicing in Mirpur today"** + notify · widen · another day · related | "Couldn't load providers" + retry. **Never fallback data** | list | availability unknown → **say so**, never assume available | — | cards are links; filters removable individually |
| Profile | `/providers/:id` | `ProviderHeader`, `TrustFacts`, `ServiceList`, `Availability` | `GET /providers/:id` | server | skeleton | "No availability this week" | retry | — | — | — | shareable, SEO |
| **Approval** | `/book/:p/:s` | `PriceBreakdown`, `CancellationPolicy`, `ConfirmButton` | `POST /quotes`, `POST /bookings` | flow | button spinner | n/a | "Could not create — **nothing was charged**" + retry | → `/activity/:id` **Pending** | — | — | **focus trap; total reachable without scrolling** |
| Created | `/activity/:id` | `BookingStateCard` | `GET /bookings/:id` | server | — | — | — | **"Pending"**, never "Confirmed" | — | live state | announced to screen readers |

**Approval-surface rules, from F1·N — each is a test:**
* Service · platform fee · **TOTAL**, itemised, **no scrolling to reach the total**.
* Cancellation terms **in full**, not a link.
* One primary button. **Never pre-selected. Never auto-advancing. No countdown.**
* If the price changed since results, **say so explicitly before the user can confirm**.
* No confetti and no "Success!" on creation — a booking request is a request, not an outcome.

### J1 · F2 — Booking lifecycle

| State | Headline | Visible | Actions | Realtime | Rule |
|---|---|---|---|---|---|
| Pending | "Waiting for Karim to accept" | expected response time | cancel · message | state | — |
| Confirmed | "Karim will arrive Thursday 3:00 PM" | identity, address, total | cancel (**policy shown**) · message · reschedule | state | — |
| Active | "Karim is on the way" | **live location** | message · call · emergency | location | **only in this window, only to the customer** |
| Arrived | "Karim has arrived" | — | message · emergency | state | location window **closes** |
| Awaiting confirmation | "Karim marked the work complete" | what was done, **the auto-confirm deadline** | **Confirm** · raise an issue | state | deadline stated **when the window starts** |
| Completed | "Service completed" | final price, payment state | review · receipt · rebook | — | — |
| Cancelled | "Booking cancelled" | who cancelled, refund state | rebook · view refund | — | — |
| Disputed | "Issue under review" | case state, SLA, **funds held** | add evidence · message support | — | both parties see the same state |

**The provider can never reach Completed.** Only the customer confirms (R-505). Every state change notifies once — not repeatedly.

### J3 · F6 — Emergency

The highest-consequence surface in the product.

```
┌────────────────────────────────────┐
│  🚨  Call 999                      │  ← largest element, one tap, FIRST
│      Police · Fire · Ambulance     │
├────────────────────────────────────┤
│  What IMAP can do                  │  ← BEFORE any input field
│  • Record your request             │
│  • Alert the on-duty admin team    │
│  What IMAP cannot do               │
│  • Dispatch emergency services     │
│  • Guarantee a response time       │
├────────────────────────────────────┤
│  [ Record an emergency request ]   │
└────────────────────────────────────┘
```

| State | Copy |
|---|---|
| Loading | Hotlines render **first and synchronously**; the form may wait |
| Success | "Recorded. **2 admins reachable.** Dispatch is not available." |
| Error | **"Could not record your request. Call 999 now."** + the number, larger |
| Degraded | Hotlines are cached and shown offline |

**Zero exclamation marks. No urgency styling not backed by data. No state called `dispatched`.** The capability statement comes from `GET /emergency/capabilities` as **data**, so copy and behaviour cannot drift apart.

**Blood (D-013):** masked contact `017••••••01`; "Show number" is authenticated, logged, one donor at a time; a request returns **"Recorded. donors_notified: 0. Automatic donor alerts are not available yet. Contact a hospital blood bank, or call 999."**

**Disaster (D-012):** signposting only. Official sources, verified hotlines, **no first-party alerts, no red warning styling on unverified community reports.**

### J4 · F4 — Provider onboarding

| Step | Route | Rule |
|---|---|---|
| Capabilities | `/provider/apply/capabilities` | **Visual picking from the Service Graph — never free text** (R-204) |
| Coverage | `…/coverage` | Areas from the hierarchy, not free text |
| Pricing | `…/pricing` | **Show the range other providers charge** for the same service in the same area |
| Availability | `…/availability` | Dated windows |
| Identity | `…/identity` | Camera-first with on-device guidance; **no typing an NID if it can be read** |
| Status | `…/status` | **"Under review — 48 hours"**, and it must be true |

Under 10 minutes on a mid-range phone (R-901). **Every step saved; resumable for 30 days.** Rejection states a specific reason, what to fix, and how to appeal.

The status screen matters because the audit found this claim was false: providers were told review takes 24–48 hours **while already publicly listed**.

### J5 · F5 — Provider working day

```
New request · expires in 12 minutes
  AC servicing · Mirpur, Kazipara
  Thursday 3:00 PM
  You earn: ৳720  (৳800 − ৳80 commission)     ← net is the primary number
  Customer: Nusrat R. · 4 previous bookings on IMAP
  [ Accept ]   [ Decline ]
```

A full surface, not a toast. **Net earnings are primary — a provider must never compute their own take.** Decline is free. Expiry is visible and the request **disappears** when it expires rather than lingering as a false opportunity. The availability toggle is one tap from every provider surface.

### J8 · F8 — Dispute

Structured options + free text → optional photos → case number and stated SLA → **funds held, visible to both parties** → both may add evidence → human decision with a reason → outcome executed → one appeal each.

**Never AI-decided** (Tier C). Every step audit-logged.

---

## 3. Cross-flow state rules

| Situation | Behaviour |
|---|---|
| Network lost mid-flow | Progress preserved; offline banner; **nothing financial queued** |
| Backgrounded | Resumes exactly where it was |
| Session expired mid-flow | Re-authenticate, return to the same step, nothing lost |
| Two devices | Server-held state; both show the same truth |
| Provider acts while the customer watches | Live update with a **visible change**, never a silent replacement |
| **Price changed between screens** | **Stated explicitly before confirm — never absorbed silently** |
| Realtime disconnected | Banner; polling fallback; state marked "as of" a time |

---

## 4. The nine states, in code

```js
// shared/state/status.js
export const STATUS = ['Suggested','Available','Requested','Pending',
                       'Confirmed','Completed','Failed','Unavailable','Unknown'];
```

Every status claim renders through one component that accepts a status **and its evidence**. A claim without evidence throws in development and renders `Unknown` in production.

| Banned | Use instead |
|---|---|
| "Help is on the way" | "Request recorded. No response yet." |
| "Payment successful" (pre-confirmation) | "Payment submitted. Confirming with your bank." |
| "Provider notified" (no delivery evidence) | "Request sent to Karim." |
| "Verified professional" | "ID verified · 47 jobs completed" |
| "Only 2 left!" | "2 slots available today." |

---

## 5. Accessibility — A-01…A-09, binding on the core loop

| ID | Requirement | Implementation | Verified by |
|---|---|---|---|
| A-01 | Keyboard-completable core loop | Real controls; **no `<div onClick>`** | Manual keyboard pass per step |
| A-02 | Accessible names | Component library enforces | axe in CI |
| A-03 | WCAG AA contrast | Token pairs pre-checked | Token test |
| A-04 | 200% scaling | Relative units; no fixed heights | Visual test |
| A-05 | ≥44×44 px targets | Minimum in the component library | Lint |
| A-06 | Never colour alone | Icon + text with every status | Review |
| A-07 | Modals trap and restore focus | One `Dialog` primitive | Unit test |
| A-08 | `<html lang>` tracks selection | Locale context | Test |
| A-09 | `prefers-reduced-motion` | Motion tokens honour it | Test |

**Current state:** inline styles throughout, `<div onClick>` handlers, no focus management, `outline: none` with no replacement, `<html lang="bn">` hardcoded. All nine are new work, and all nine are on the core loop only — `A-10`/`A-11` are Gate 2.

**`ElderlyMode` is kept and studied.** It is a genuine strength, and the intent is that it raises the default floor rather than compensating for a poor default.

---

## 6. Bangla-first

| Rule | Implementation |
|---|---|
| Bangla is authored first, English alongside | Both locales in one catalogue entry; **no machine translation** |
| One numeral convention per locale | `shared/i18n/format.js`; **Bengali and Western numerals never on the same screen** — they are today |
| Typography chosen for Bengali script first | Line-height and stack tuned for Bangla, verified at 200% |
| All strings externalised | ~108 keys exist; the majority are inline `lang === "en" ? … : …` ternaries across every file |

**Extraction happens per feature during its migration step**, not as one sweep. A sweep across 11,332 lines is a single unreviewable commit.

---

## 7. Per-surface checklist

Every surface, before it is done:

1. Which stage of the product equation does this serve?
2. Loading, empty, error, offline states — all four implemented?
3. **Where does every displayed number come from?** (No number without a server source.)
4. Which of the nine states does each claim map to, and what is its evidence?
5. Completable **without AI**?
6. Completable by keyboard and by screen reader?
7. JS cost — is the route within budget?
8. Usable one-handed on a 5″ screen at 200% text?
9. Does the Bangla read naturally to a native speaker, or is it translated English?
10. Which metric does this move, and how would we know if it made things worse?

---

## 8. Explicitly prohibited

| Anti-pattern | Where it exists today |
|---|---|
| **Fallback to fabricated data when empty or failing** | Every list loader |
| Fake progress or simulated streaming | A canned string replayed 3 characters at a time |
| Client-generated codes shown as verification | "Demo OTP" — removed in Phase 0.5 |
| Statistics not from the metric pipeline | Landing counters animating to 10,000 customers from a constant |
| Infinite scroll | — |
| Countdowns on non-time-limited offers | — |
| Hiding the total until the final step | — |
| Cancellation harder than booking | — |
| Pre-ticked consent | — |
| A full-screen AI takeover during a decision | — |

---

## 9. Measurement

| Metric | Target | Source |
|---|---|---|
| Core loop completion, new user | ≥60% | funnel |
| Deliberate decisions in the core loop | ≤5 | instrumented step count |
| FCP, mid-range Android, 3G | ≤3 s p75 | RUM |
| Need → first results | ≤4 s p75 | trace |
| **Surfaces rendering unsourced data** | **0** | code review + lint |
| A-01…A-09 on the core loop | 100% | manual + axe |
| Bangla completion vs English | within 5% | funnel by locale |

The fifth is the one that matters most, and it is the only one enforceable at build time.
