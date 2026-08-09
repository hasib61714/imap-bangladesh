# IMAP 2.0 — Behavioural Design

**Status:** PROPOSED · **Phase:** 1 · **Date:** 2026-08-09
**Governed by:** `docs/product/PRODUCT-CONSTITUTION.md` (P7) and `UX-CONSTITUTION.md`

How IMAP should behave over time: what it remembers, when it speaks, what it recommends, and the limits on all three.

---

## 1. The behavioural objective

Modern consumer products are extremely good at capturing attention. Most of those techniques are available to IMAP and most of them are wrong for it, because IMAP's success metric is the opposite of theirs.

> **We extract the underlying behavioural patterns that reduce effort, and reject the ones that manufacture engagement.**

| Pattern | Where it comes from | IMAP's use | Verdict |
|---|---|---|---|
| Personalised ranking | YouTube, Instagram | Show *your* provider, *your* area, *your* usual service first | **Adopt** — reduces effort |
| Recommendation from behaviour | Amazon, Netflix | "AC servicing is usually due before summer" | **Adopt, bounded** — see §4 |
| Continuity / resume | Netflix, Google Docs | "You were comparing 3 electricians" | **Adopt** — directly reduces abandonment |
| One-tap action | Uber | Rebook a known provider | **Adopt** |
| Live status | Uber, food delivery | Real booking states | **Adopt** — only for true states |
| Social proof | Airbnb, Amazon | Repeat customers, completed jobs | **Adopt** — facts only |
| Visual proof of work | Instagram, YouTube | Before/after photos on a profile | **Adopt** on profiles (D-006) |
| Proactive prompts | Calendar, banking apps | "Your booking needs confirmation" | **Adopt, hard-capped** |
| Infinite feed | TikTok, Facebook | — | **Reject** — no resolution objective |
| Variable-reward loops | Social, gaming | — | **Reject** — engineered compulsion |
| Streaks, daily rewards | Duolingo, gaming | — | **Reject** — manufactures obligation |
| Notification-driven return | Social | — | **Reject** — attention farming |
| Artificial scarcity | Booking sites | — | **Reject** — P7, and often untrue |
| Countdown pressure | E-commerce | — | **Reject** unless genuinely time-limited |
| Autoplay | Video | — | **Reject** — data cost matters here |

**The test:** does this pattern reduce the user's effort to resolve a need, or increase the number of times they open the app? Only the first is adopted.

---

## 2. Continuity

**The single highest-value behavioural investment**, and completely absent today — closing the booking modal discards all progress, and favourites are in-memory and lost on reload.

### 2.1 What is preserved

| State | Duration | Resumes as |
|---|---|---|
| Partially-expressed need | 24 h | "You were looking for an electrician in Mirpur" |
| Comparison in progress | 24 h | "You were comparing 3 electricians" |
| Incomplete booking | 24 h | "Your booking for Thursday isn't confirmed yet" |
| Booking awaiting provider response | Until resolved | "Waiting for Karim to accept" |
| Active booking | Until terminal | Always visible on home |
| Unreviewed completed booking | 14 days | "How was the AC servicing?" |
| Draft message | 7 days | Restored in the thread |
| Unfinished provider onboarding | 30 days | "You're 2 steps from being listed" |

### 2.2 Rules

1. Continuity is **shown, never forced**. A resumable task appears on home; it never blocks or interstitials.
2. Every resumable item is dismissible, and dismissal is permanent for that item.
3. Continuity state is server-held, so it survives device change (R-801).
4. Nothing financial is auto-resumed. A resumed booking returns to the approval step, never past it.
5. Expiry is silent. A stale task disappears; it does not generate a "you forgot" message.

---

## 3. Personalisation

### 3.1 Signals used

| Signal | Use | Tier (Constitution §5.3) |
|---|---|---|
| Previously used providers | Rank first for the same service | Open |
| Service history | Suggest recurring services; pre-fill | Open |
| Area | Filter and rank by proximity | Open |
| Stated budget preference | Order and filter | Open |
| Language | All copy | Open |
| Time-of-day patterns | Default slot suggestions | Open |
| Precise location | ETA and distance during an active booking only | **Guarded** |
| KYC, ledger, health, emergency, dispute files | **Never used for personalisation** | **Sealed** |

### 3.2 Rules

1. **Explainable.** Any personalised ordering shows why: "you booked Karim in March".
2. **Escapable.** A neutral sort is always one tap away; personalisation is never the only view.
3. **Never hides alternatives.** Personalisation reorders; it does not filter out materially better options (P7).
4. **No cross-user inference on sensitive attributes.** Never infer or use gender, religion, income or health.
5. **Cold start is honest.** A new user sees popularity and proximity, not a fabricated personal feed.
6. **Turn it off.** A single control disables behavioural personalisation entirely, and the product still works.

### 3.3 The line P7 draws, concretely

| Allowed | Prohibited |
|---|---|
| "Karim, who you used in March, is available Thursday" | "Only Karim is available" when others are |
| "AC servicing is usually done before summer" | "Book now — prices rise next week" (unsupported) |
| "3 providers in Mirpur, sorted by earliest availability" | Hiding a cheaper provider because they yield less commission |
| "This provider costs ৳200 more and has 40 more completed jobs" | Presenting the higher-commission option as "recommended" without stating why |

---

## 4. Proactive assistance

The highest-risk behavioural surface: the difference between helpful and spam is entirely in the limits.

### 4.1 The four legitimate triggers

Proactive contact is permitted **only** when one is true:

| # | Trigger | Example | Channel |
|---|---|---|---|
| 1 | **The user must act or something breaks** | "Your booking needs confirmation or it expires in 2 hours" | Push + in-app |
| 2 | **Real state changed on something the user owns** | "Karim accepted for Thursday 3pm" | Push + in-app |
| 3 | **A recurring need is genuinely due, based on their own history** | "Your AC was serviced 11 months ago" | In-app only, once per cycle |
| 4 | **Something they explicitly asked to be told** | "A plumber is now available in Mirpur" | Push, opt-in per request |

Everything else — promotions, re-engagement, "we miss you", feature announcements, streaks — is **prohibited**.

### 4.2 Hard limits

| Limit | Value |
|---|---|
| Push notifications per user per week | **≤3**, excluding trigger 1 and 2 on the user's own active bookings |
| Recurring-need reminders | **1 per cycle per service.** Dismissing it silences that service permanently |
| Re-engagement messages to inactive users | **0** |
| Promotional pushes | **0** |
| Quiet hours | 22:00–08:00 local, except trigger 1 on an active booking |
| Unsubscribe | One tap from the notification, per category, effective immediately |

### 4.3 Rules

1. Every proactive message states why it was sent and how to stop it.
2. Notification permission is requested at the moment it becomes useful — after the first booking, never on first load.
3. A dismissed suggestion never returns in the same form.
4. Silence is the default. A user who takes no action receives nothing.

**Enforcement:** notification volume per user is a monitored metric. Exceeding the cap is a defect, not a growth experiment.

---

## 5. Habit formation — the honest version

IMAP wants to be the reflex when something breaks. Two ways to get there:

| Manufactured habit | Earned habit |
|---|---|
| Notifications, streaks, variable rewards | It worked last time |
| Fear of missing out | The provider is already known and trusted |
| Gamified progress | Rebooking takes one tap |
| Daily surface for a non-daily need | It is faster than asking in a Facebook group |

**IMAP pursues only the right column.** For a service platform this is also the commercially correct choice: home-service needs are episodic, so a manufactured daily habit would be both manipulative and futile — nobody needs a plumber daily.

The measurable expression is **repeat rate**, not session frequency (`KPI.md` §4).

---

## 6. Discovery behaviour

### 6.1 Home

Home answers one question: *"What can IMAP help me with right now?"*

Priority order (`INFORMATION-ARCHITECTURE.md` §3):

1. **Ask IMAP** — the need input, always first
2. **Active tasks** — anything in flight, if any
3. **Continuity** — resumable tasks, if any
4. **Quick actions** — the user's own most-used services; popular ones for a new user
5. **Your providers** — previously used, if any
6. **Browse categories** — the always-available fallback

**Not on home:** a feed, promotional banners, fabricated statistics, engagement badges. If a user has nothing in flight, home is small and mostly empty. **That is correct.**

### 6.2 Proof-of-work media (D-006)

Provider media appears in exactly three places, all at the point of a trust decision:

* Provider profile — a gallery of previous work
* Provider card in results — one representative image
* Comparison view — visual difference between candidates

It never appears as a browsable feed, never autoplays, and never loads on a metered connection without an explicit tap.

---

## 7. Behavioural scorecard — target

Against the `docs/audit/UX-GAPS.md` scale (0 absent → 5 production-grade). Current average: **1.4**.

| Capability | Current | MVP target | Phase F target |
|---|:---:|:---:|:---:|
| Personalised discovery | 0 | 1 | 3 |
| Contextual recommendation | 1 | 2 | 3 |
| Nearby discovery | 2 | 3 | 4 |
| Visual discovery | 1 | 2 | 3 |
| Natural language | 2 | 4 | 4 |
| Voice | 1 | 3 | 4 |
| Multimodal input | 1 | 2 | 3 |
| One-tap actions | 2 | 3 | 4 |
| Quick actions | 2 | 3 | 4 |
| Continue previous task | 0 | **3** | 4 |
| Active task state | 1 | **3** | 4 |
| History | 2 | 3 | 4 |
| Saved state | 1 | 3 | 4 |
| Proactive assistance | 0 | 1 | 3 |
| Memory | 0 | 1 | 3 |
| Contextual suggestions | 1 | 2 | 3 |
| Agentic execution | 0 | 2 | 3 |
| Ratings | 3 | 3 | 4 |
| Reviews | 3 | 3 | 4 |
| Verification | 1 | **3** | 4 |
| Transparent pricing | 1 | **4** | 4 |
| Provider reliability | 2 | 3 | 4 |
| Instant feedback | 2 | 3 | 4 |
| Live tracking | 2 | 3 | 4 |
| Status updates | 3 | 4 | 4 |
| **Average** | **1.4** | **2.8** | **3.6** |

Bold entries are the MVP's behavioural priorities: continuity, active task state, honest verification and transparent pricing. Deliberately, **agentic execution and memory stay low at MVP** — they are the most attention-grabbing capabilities and the least safe to rush.

---

## 8. Prohibited behaviours

| Behaviour | Why |
|---|---|
| Re-engagement notifications to inactive users | §4.1 — attention farming |
| Streaks, points-for-visiting, daily rewards | Manufactured obligation |
| Variable reward mechanics anywhere | Engineered compulsion |
| Infinite scroll | No resolution objective |
| Autoplaying media | Data cost; attention capture |
| Urgency not present in the data | P7 |
| Hiding an alternative to favour a monetised option | P7, M2 |
| Personalisation using Sealed context | Constitution §5.3 |
| Personalisation on inferred sensitive attributes | §3.2 rule 4 |
| Notification permission prompt on first load | §4.3 rule 2 |
| Cancellation harder than booking | U8 |
| A resumed task that skips the approval step | §2.2 rule 4 |

---

## 9. Measurement and governance

| Behaviour | Metric | Failure signal |
|---|---|---|
| Continuity | Resumed-task completion rate | Low ⇒ resume is not working |
| Personalisation | Selection rank of the chosen provider | Not improving ⇒ personalisation adds nothing |
| Proactive assistance | Actioned rate; opt-out rate; volume per user | Rising opt-out ⇒ too much or too irrelevant |
| Repeat behaviour | Repeat customer rate | The honest habit metric |
| Attention | Session length | **Diagnostic only. Never a target. Never in a success report** |

**Governance rule.** Any behavioural change ships with a paired measurement: the engagement effect *and* the resolution effect. If engagement rises and Resolved Needs does not, the change is reverted (`KPI.md` §8).
