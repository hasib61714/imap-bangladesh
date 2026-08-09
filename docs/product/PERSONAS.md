# IMAP 2.0 — Personas

**Status:** PROPOSED · **Phase:** 1 · **Date:** 2026-08-09
**Governed by:** `PRODUCT-CONSTITUTION.md`

---

## How these were built, and their limits

These personas are derived from **product affordances and market structure**, not from research IMAP has conducted. IMAP has run no user interviews, has no analytics instrumentation, and has no usage data — the audit found no analytics events and no funnel measurement anywhere in the codebase.

**No demographic statistics appear here, because IMAP has none.** Any number in this document is a design assumption, labelled as such, and each carries a falsification test — the question that would prove it wrong.

**Every persona must be validated before MVP launch.** `ROADMAP.md` Phase A includes this as an exit criterion.

---

## Consumer personas

### C1 — Nusrat, the working professional

**Situation.** Works full time in Dhaka. Rents a flat. Something breaks and she has no time to find someone and no way to tell whether they are competent or safe.

**How she solves it today.** Asks in a building or neighbourhood Facebook group; asks the caretaker; asks a colleague. Gets a phone number. Calls. Negotiates a price on the doorstep after the person has already arrived.

**What she actually wants.** To not spend her evening on this. A named person, at a time she chose, at a price agreed before they arrive.

**Where IMAP wins.** Price certainty before arrival, and a scheduled slot instead of "he'll come sometime tomorrow."

**Where IMAP loses.** If the app takes longer than a WhatsApp message, or if the provider does not show up and IMAP cannot fix it. Her tolerance for a failed booking is roughly one.

**Trust requirements.** Verified identity. Evidence of previous similar jobs. Somebody accountable if it goes wrong.

**Assumption to validate:** *price uncertainty and scheduling, not price level, are her primary pain.* → Falsified if users abandon at the price screen rather than at scheduling.

---

### C2 — Rahim, the family decision-maker

**Situation.** Manages a household of five, including elderly parents and children. Recurring needs: AC servicing before summer, water tank cleaning, tutoring, periodic electrical work. Budget-conscious and comparison-driven.

**How he solves it today.** A mental list of "our electrician", "our AC person". Calls the same people. When they are unavailable he starts from zero.

**What he wants.** Continuity with people he already trusts, and a safe substitute when they are not available.

**Where IMAP wins.** "Rahim is available Thursday" — remembering *his* provider is more valuable to him than discovering new ones. Recurring-need reminders that are useful rather than promotional.

**Where IMAP loses.** If IMAP pushes unfamiliar providers ahead of his known one to balance marketplace supply. That would break the relationship IMAP is supposed to be preserving.

**Trust requirements.** Repeat relationship, price consistency between visits, respectful conduct in a house with children and elderly parents.

**Assumption to validate:** *repeat booking of a known provider is a larger share of value than new discovery.* → Falsified if repeat rate stays low while new-provider discovery is high.

---

### C3 — Tanvir, the student / low-budget user

**Situation.** Shared accommodation, tight budget, high price sensitivity, very comfortable with a phone but on a cheap device with a limited data plan.

**How he solves it today.** Cheapest available option through personal networks. Often does it himself.

**What he wants.** To know what it should cost, and to avoid being overcharged for being young and unfamiliar.

**Where IMAP wins.** Transparent, comparable pricing, and a from-price before committing. This is where IMAP's price transparency has the most social value.

**Where IMAP loses.** If commission makes IMAP visibly more expensive than calling someone directly, he will call directly. **This is the central constraint on the commission rate (`BUSINESS-MODEL.md` §5).**

**Constraints.** 2 GB RAM Android. Data cost is a real consideration. He will not download a native app for a one-off repair.

**Assumption to validate:** *transparent pricing outweighs a modest platform premium for this segment.* → Falsified if this cohort converts at a materially lower rate than C1 at the same prices.

---

### C4 — Amina, the elderly / non-technical user

**Situation.** Lives alone or with family. May not read English. May not read fluently at all. Needs help more often than most and is the most exposed to being overcharged or unsafe.

**How she solves it today.** Asks a family member to arrange it. She is frequently not the person using the app even though she is the person with the need.

**What she wants.** To speak, not type. To see a face and a name. To be certain the person at the door is the person who was sent.

**Where IMAP wins.** Voice input in Bangla; large, high-contrast targets; the provider's photo and name shown before arrival. **CURRENT:** a genuine simplified elderly mode already exists in the codebase (`App.jsx`) and is one of the product's real strengths.

**Where IMAP loses.** Any flow requiring typing, small targets, English, or unexplained jargon. Every additional confirmation step is a place she stops.

**Trust requirements.** Face and name before arrival. A phone number that reaches a human. Not being asked to pay in a way she does not understand.

**Design consequence.** Amina is the accessibility bar for the whole product, not a special mode bolted on afterwards. If the core loop works for her, it works for everyone.

**Assumption to validate:** *a meaningful share of needs are expressed by, or on behalf of, users who cannot complete a typed English flow.* → Falsified if voice and elderly mode see negligible use after being made discoverable.

---

## Provider personas

### P1 — Karim, the independent technician

**Situation.** Electrician or plumber working alone. Phone is his entire business infrastructure. Income is irregular and depends on word of mouth. Often working with one hand free, on a ladder, in poor light.

**How he gets work today.** Repeat customers, referrals, a local shop that passes his number on, sometimes a Facebook group.

**What he wants.** More jobs, in his area, that are worth travelling for, and to be paid without chasing.

**Where IMAP wins.** Demand he could not reach. A price agreed before he travels. Payment he does not have to argue about.

**Where IMAP loses.** If onboarding takes an hour, if the app is heavy, if commission makes a job not worth doing, or if a customer can damage his standing with no recourse. **He will leave over an unappealable rating before he leaves over commission.**

**Constraints.** Low digital literacy. Cheap Android. May not read English. Cannot manage a complex calendar while working.

**Trust requirements.** Predictable, understandable payout. Protection from bad-faith customers. Clarity on why a job did or did not come to him.

**Assumption to validate:** *payout speed and clarity matter more to him than volume.* → Falsified if providers optimise for job count and tolerate slow payout.

---

### P2 — Shirin, the home-service professional

**Situation.** Nurse, tutor, caregiver or cleaner working in homes, often with vulnerable people. Frequently a woman working alone in strangers' homes.

**What she wants.** Safe, verified clients. Predictable schedule. Recognition of qualifications so she is not compared purely on price.

**Where IMAP wins.** Verified customers (not only verified providers), a record of who she is visiting, and credentials displayed so her rate is justified.

**Where IMAP loses.** If IMAP verifies providers but not customers, it has made the safety asymmetry worse — it now sends verified women to unverified addresses. **This is a product-safety requirement, not a nice-to-have.**

**Trust requirements.** Customer identity known to the platform. A way to decline without penalty. A working escalation path with a human at the end of it.

**Design consequence.** Two-sided verification is a launch requirement for in-home service categories — at Gate 1 that means the customer is phone-verified and the provider sees their verification level and IMAP booking history before accepting (R-410). Document-level customer verification is LATER. A provider-triggered in-booking emergency (R-1010) is also a Gate-1 requirement, and is the strongest justification for retaining the emergency surface at all.

**Assumption to validate:** *safety concerns limit supply in in-home categories.* → Falsified if provider signup in these categories shows no gender skew or safety-related drop-off.

---

### P3 — Ariful, the small service business

**Situation.** Runs a small firm with 3–10 technicians. Already has a business: a phone line, a WhatsApp group, a notebook or spreadsheet.

**What he wants.** Consistent lead flow, the ability to assign jobs to his own staff, and one place to see what is owed to him.

**Where IMAP wins.** Additional demand without additional marketing spend.

**Where IMAP loses.** If IMAP forces every technician to have a separate account, or if the trust model is attached to individuals in a way that stops him deploying his own team.

**Constraint on the model.** The current schema has no notion of a team: `providers` is one row per user. Multi-technician providers are **LATER** (`ROADMAP.md` Phase F), and the Service Graph must not make them impossible to add.

**Assumption to validate:** *a meaningful share of usable supply is small firms rather than individuals.* → Falsified if signups are overwhelmingly single operators.

---

## Business persona

### B1 — Farhana, the SME operations manager ⟶ LATER

**Situation.** Runs operations for a restaurant, office or small chain. Recurring maintenance, multiple vendors, an approval process, and invoices that must reconcile.

**What she wants.** One vendor relationship instead of fifteen. Approval before spend. Invoices that satisfy an accountant.

**Why this is LATER, not NOW.** The consumer loop must work first. B2B needs approval workflows, multi-seat accounts, credit terms, formal invoicing and SLA commitments — none of which exist and all of which are a different product. `users.role` currently has three values and none of them is "organisation".

**What must not be foreclosed.** Bookings should not assume that the payer, the requester and the beneficiary are the same person. That single modelling choice keeps B2B possible without a rewrite.

---

## Platform persona

### A1 — The operations reviewer

**Situation.** Reviews provider applications and KYC, handles disputes, monitors emergency requests, and is the human at the end of every appeal.

**What they need.** A verification queue with sufficient evidence to decide; a dispute workflow with states and SLA; audit trails for every decision; and the ability to act quickly without being able to act carelessly.

**Where the product fails them today.** There is no audit log at all. There is no dispute workflow — only a `complaints` row with a status field. Admin actions were optimistically rendered as successful even when the API call failed, and one action (suspend) did not work at all until Phase 0.5. An operations function cannot be run on this.

**Design consequence.** The audit log (R-1101) and dispute workflow (R-1102) are prerequisites for the trust model, not back-office polish. Every Tier-C action in Constitution §4 lands on this person.

---

## Cross-persona conflicts

Real tensions that require explicit product decisions rather than compromise language.

| Conflict | Sides | Resolution |
|---|---|---|
| Price transparency vs provider margin | C3 wants the lowest price; P1 needs a viable rate | Show a price range and what drives it. Never run a race to the bottom — provider earnings-per-hour is a tracked metric (`KPI.md` §3) |
| Repeat provider vs marketplace liquidity | C2 wants his known provider; the marketplace wants distribution | The user's preference wins. Surfacing a known provider first is the product, not a leak (P7) |
| Provider verification vs supply growth | Trust requires review; growth wants instant listing | Trust wins for in-home categories (D-005). Revisit for low-risk remote services |
| Customer convenience vs provider safety | Customers dislike verification friction; P2's safety depends on it | Two-sided verification for in-home categories. Non-negotiable |
| AI speed vs user control | Fewer taps convert better; Tier B requires confirmation | Consequence sets the rule (Constitution §4). Money and commitments always confirm |
| Personalisation vs privacy | Better recommendations need more context | Tiered context, user-visible, deletable (Constitution §5.3) |

---

## What we do not know

Stated plainly, because pretending otherwise would make the roadmap unfalsifiable.

1. Whether users will describe needs in natural language, or default to categories out of habit.
2. Whether providers will accept a commission at all, given that direct contact costs them nothing.
3. Whether price transparency increases or decreases conversion in this market.
4. Which categories have enough repeat demand to sustain retention.
5. Whether voice input is used when it is available and discoverable.
6. Whether verification is a real purchase driver or something users say they want and then ignore.
7. Whether the elderly-mode user is the account holder or a family member acting for them.

**Phase A of the roadmap exists primarily to answer 1, 2 and 3.** Nothing downstream is safe to build until they are answered.
