# IMAP 2.0 — UX Constitution

**Status:** PROPOSED · **Phase:** 1 · **Date:** 2026-08-09
**Governed by:** `docs/product/PRODUCT-CONSTITUTION.md`
**Baseline:** `docs/audit/UX-GAPS.md` — behavioural scorecard **1.4 / 5** across 21 capabilities

This document defines how IMAP behaves toward the person using it. Visual design is Phase 3; this is the law that visual design must obey.

---

## 1. The UX thesis

> **IMAP is a tool, not a destination.**

The best session ends quickly with the need resolved. Every design decision is judged against that. A design that increases time-on-task is a failure even if it increases time-in-app.

### 1.1 What "modern" means operationally

The audit warns against meaningless direction like "make it modern". For IMAP, modern means exactly these seven measurable things:

| Modern means | Operational definition | Measurable |
|---|---|---|
| **Fast on a bad phone** | Core loop usable on 2 GB RAM Android over 3G | FCP ≤3 s p75 (N-01) |
| **Understands you** | Free-form Bangla input reaches a correct service without category navigation | Intent accuracy ≥85% (R-101) |
| **Honest about state** | Every state claim uses the nine-state vocabulary with evidence | Zero unevidenced claims (P4) |
| **Few decisions** | Core loop completable in ≤5 deliberate decisions | Step count |
| **Resumable** | Progress survives reload, connection loss and app switching | R-801 |
| **Reachable by anyone** | Completable by keyboard, by screen reader, at 200% text | A-01…A-09 |
| **Never fabricated** | No number, provider, alert or status shown that did not come from the server | Code review + `KPI.md` §9.4 |

Anything that does not map to one of these is decoration.

---

## 2. UX principles

### U1 — Truth over polish

**The product's defining constraint.** Where they conflict, truth wins without discussion.

* Empty means empty. A list with no results shows an empty state, never fallback data.
* Loading means loading. Never render placeholder content that resembles real content.
* Failure is visible. An action that failed says so — it never renders as if it succeeded.
* Unknown is a legitimate state and must be designable.

**Why stated first.** The audit found *every* list loader in the app shaped as `if (d?.x?.length) setX(...)` — so an empty database, a failed request, an expired token or a cold-started backend all produced the same result: fabricated rows presented as real, with no error. This is the single highest-impact UX defect in the product and the one most likely to recur.

---

### U2 — The user always knows the state, the price, and who is coming

Three facts must be visible without asking, at every point after a booking exists:

1. What state is this in, in plain language?
2. What will I pay, in total?
3. Who is the person, and when?

If a screen cannot answer all three, it is incomplete.

---

### U3 — Decisions are visible; AI is an accelerant, not an oracle

Consistent with `PRODUCT-CONSTITUTION.md` P2 and D-007.

* Every AI proposal renders as a structured object with inspectable fields.
* Every AI ranking exposes its basis: "shown first: available today · 47 jobs in Mirpur · ৳150 lower".
* Every core journey is completable with AI switched off.
* AI never occupies the whole screen while a decision is pending.

---

### U4 — Progressive commitment

Ask for nothing until it is needed.

```
Browse                    → no account
Express a need            → no account
See providers and prices  → no account
Book                      → phone + OTP, at this point and not before
Pay                       → payment details, at this point and not before
```

**CURRENT problem:** authentication currently gates too much, and the app opens on a splash/auth surface. Discovery must be public.

---

### U5 — One screen, one job

Each surface has a single primary action, visually unambiguous. Secondary actions are visibly secondary. The audit's 5,538-line `App.jsx` with ~50 components and ~30 page keys is the failure mode: surfaces accreted rather than being designed.

---

### U6 — Bangla is the source language

Not a translation layer. Bangla copy is authored first and English is authored alongside it — never machine-translated from English. Numerals, dates and currency follow one consistent convention per locale.

**CURRENT problem:** ~108 keys are externalised; the majority of strings are inline `lang==="en" ? … : …` ternaries scattered across every file. Bengali and Western numerals appear on the same screen.

---

### U7 — Designed for interruption

Users are on unreliable networks, on phones that ring, with one hand free. Every multi-step flow survives interruption: state persists, the user returns to where they were, nothing partial is charged.

---

### U8 — Respect the user's attention

* Notifications are earned, not scheduled. See `BEHAVIORAL-DESIGN.md` §4.
* No infinite scroll on any surface.
* No artificial urgency, countdowns or scarcity that the data does not support.
* No interstitial that blocks a task the user has already started.
* Unsubscribe and cancel are as easy as subscribe and book.

---

### U9 — Accessibility is the baseline, not a mode

The C4 (Amina) persona is the accessibility bar for the entire product. The existing elderly mode is a genuine strength and should raise the floor everywhere rather than compensate for a poor default.

---

### U10 — Every surface degrades

For each surface, three states are designed together, or the surface is not designed:

```
Full        — data present, network good, AI available
Degraded    — data partial, network slow, or AI unavailable
Empty/Error — no data, or the request failed
```

---

## 3. Interaction laws

| Law | Rule |
|---|---|
| **Confirmation** | Money and commitments require an explicit deliberate action. No pre-selected confirm buttons, no timeouts that accept by default |
| **Reversibility** | Anything reversible is done immediately with undo. Anything irreversible requires confirmation and says it is irreversible |
| **Optimism** | Optimistic UI is permitted only where failure can be cleanly reverted **and** the reversion is shown. The audit found admin actions rendering as successful under `.catch(e => console.warn(...))` — that is prohibited |
| **Latency** | <100 ms no indicator · 100 ms–1 s inline indicator · >1 s explicit progress with what is happening · >10 s allow backgrounding |
| **Errors** | Say what happened, whether anything was charged, and what to do next. Never a raw error string, never a code alone |
| **Focus** | Opening an overlay moves focus into it and traps it; closing restores focus |
| **Destruction** | Deleting or cancelling names the specific thing being lost |

---

## 4. Content and copy rules

### 4.1 The nine states are the vocabulary

All state copy uses exactly one state from `PRODUCT-CONSTITUTION.md` §P4.1: Suggested · Available · Requested · Pending · Confirmed · Completed · Failed · Unavailable · Unknown. Copy that does not map to one is not approved.

### 4.2 Banned constructions

| Banned | Use instead |
|---|---|
| "Help is on the way" | "Request recorded. No response yet." |
| "Payment successful" (before gateway confirmation) | "Payment submitted. Confirming with your bank." |
| "Provider notified" (without delivery evidence) | "Request sent to Karim." |
| "Best price guaranteed" | "৳850 for this service." |
| "Only 2 left!" (without real scarcity) | "2 slots available today." |
| "Verified professional" (without stating what was verified) | "ID verified · 47 jobs completed" |

### 4.3 Tone

Plain, specific, respectful. No exclamation marks on failure states. No jargon in either language. Numbers are always attributed — "47 jobs on IMAP", not "experienced".

### 4.4 Emergency copy

Fixed rules on every emergency surface:
1. The real emergency number (999) is the most prominent element.
2. What IMAP can and cannot do appears **before** any input field.
3. Zero exclamation marks, zero urgency styling that is not backed by verified data.
4. Every state is one of the nine, and dispatch is never claimed (D-012, D-013).

---

## 5. Trust presentation

Trust must be legible, not scored (`PRODUCT-CONSTITUTION.md` §7, D-004).

**Show facts:**
```
Md. Karim Hossain
ID verified · 47 jobs on IMAP · 12 repeat customers
Usually replies within 1 hour · Electrical, AC servicing
Serves: Mirpur, Kazipara, Shewrapara
```

**Do not show:** a composite score, a badge whose criteria are not stated, or a rating with no volume context.

**New providers:** "New to IMAP · ID verified" — neither hidden nor inflated (R-408).

**Paid placement, if ever introduced:** labelled in the same visual weight as the content, never woven into organic results (D-009, P7).

---

## 6. AI presentation

| Rule | Detail |
|---|---|
| **Always identified** | AI-generated content is visually distinct from platform data |
| **Never full-screen while deciding** | The user must see the underlying options |
| **Proposals are objects** | Rendered as the same structured card the manual flow uses, with the same fields |
| **Confidence is honest** | Low confidence produces a question or a fallback, never a confident wrong answer |
| **Sources are cited** | "Based on your booking in March" — not unexplained personalisation |
| **Failure is graceful** | AI unavailable → the structured path, with a one-line explanation |
| **Never the only path** | D-007 |

---

## 7. Performance budgets

Provisional targets, to be re-baselined against real measurement. **Nothing is currently instrumented.**

| Budget | Target | Current |
|---|---|---|
| Initial JS (core loop, gzip) | ≤150 KB | ~540 KB total; `index` chunk alone ~102 KB gz |
| FCP, mid-range Android, 3G | ≤3 s p75 | Unmeasured |
| Need → first results | ≤4 s p75 | Unmeasured |
| Interaction to next paint | ≤200 ms p75 | Unmeasured |
| Images | Responsive, lazy, never base64 in a JSON payload | Avatars up to ~2 MB base64; KYC images up to ~5 MB each |
| Fonts | Bangla subset, `font-display: swap` | Unmeasured |

**Rule:** a route that exceeds its budget does not ship. Ant Design (~135 KB gz) is admin-only and must never enter a consumer route.

---

## 8. Design system requirements

Not a visual spec — the properties the Phase 3 system must have.

1. **One system.** The product currently runs two (custom inline styles for consumer, Ant Design for admin) with four shared primitives in total. Pick one for the consumer product.
2. **Tokens, not literals.** `constants/theme.js` is a real token set already and is the correct foundation.
3. **Component library over inline styles.** Accessibility, theming and performance fixes must be made once, not in hundreds of literal style objects.
4. **Every component has all states.** default · hover · focus-visible · active · disabled · loading · error · empty.
5. **Bangla-first typography.** Line-height and font stack chosen for Bengali script first; verified at 200% scaling.
6. **Dark mode is a peer.** Already implemented and must stay.
7. **Motion is functional and optional.** Motion communicates state change. `prefers-reduced-motion` is respected. Decorative animation is out of budget on the core loop.

---

## 9. Accessibility requirements

Binding. Ships with the MVP, on the core loop (`PRD.md` §7 A-01…A-09).

| Area | Requirement |
|---|---|
| Semantics | Real controls with accessible names. No `<div onClick>` |
| Keyboard | Entire core loop operable; visible focus everywhere; logical order |
| Screen reader | Verified on Android TalkBack in Bangla and English |
| Contrast | WCAG AA for text and meaningful UI |
| Scaling | Layout survives 200% |
| Targets | ≥44×44 px |
| Colour | Never the sole carrier of meaning |
| Motion | `prefers-reduced-motion` honoured |
| Language | `<html lang>` tracks the selection |
| Forms | Labels, errors linked to fields, errors announced |

---

## 10. Anti-patterns — explicitly prohibited

| Anti-pattern | Why |
|---|---|
| Fallback to fabricated data when the API is empty or failing | U1. The defining defect of the current product |
| Fake progress or simulated streaming | The audit found a canned string replayed 3 characters at a time to imitate a model |
| Client-generated codes presented as verification | The "Demo OTP" removed in Phase 0.5 |
| Statistics not sourced from the metric pipeline | Landing counters animating to 10,000 customers from a constant |
| Infinite scroll | U8 |
| Notification badges for non-actionable events | U8 |
| Countdown timers on non-time-limited offers | U8 |
| Hiding the total price until the final step | U2 |
| Cancellation flows harder than booking flows | U8 |
| Pre-ticked consent | Consent must be an action |
| Dark-pattern defaults on location or notifications | P9 |
| A full-screen AI takeover during a decision | U3 |

---

## 11. How a design is reviewed

A design is not approved until every question is answered:

1. Which stage of the product equation does this serve?
2. What are the empty, loading, error and offline states?
3. Where does every displayed number come from? (No number without a source.)
4. Which of the nine states does each status claim map to, and what is its evidence?
5. Is this completable without AI?
6. Is this completable by keyboard and by screen reader?
7. What is the JS cost, and does the route stay within budget?
8. Is it usable one-handed on a 5" screen at 200% text?
9. Does the Bangla copy read naturally to a native speaker, or is it translated English?
10. Which metric does this move, and how will we know if it made things worse?
