# IMAP 2.0 — Product Decision Log

**Status:** PROPOSED — decisions D-001…D-014 require sign-off · **Phase:** 1 · **Date:** 2026-08-09

Every material product decision is recorded here: what was decided, why, what else was considered, why those were rejected, and what it costs us. Decisions are amended by superseding entries, never by editing history.

Legend: **PROPOSED** = recommended, needs sign-off · **ACCEPTED** = signed off · **SUPERSEDED** = replaced by a later entry.

**Decisions requiring explicit owner sign-off before Phase 2 begins: D-006, D-010, D-011, D-012, D-013.** These change what the product *is*, remove shipped functionality, or carry regulatory exposure.

---

## D-001 — Need-first is the default entry point; category browsing is retained

**Status:** PROPOSED

**Decision.** The primary way to start on IMAP is to describe a problem in natural language. Category browsing remains fully available as a peer path, not a deprecated one.

**Why.** The single most common failure in home services is that the user does not know the name of what they need. "My bathroom water isn't draining" is not a category. Requiring category knowledge pushes the classification work onto the least-equipped party.

**Alternatives considered.**
1. *Category-first only (status quo).* Rejected: it is the current design, and the audit shows it produced a 19-category hardcoded grid with fabricated provider counts and no path from a described problem to a service.
2. *Need-first only, remove categories.* Rejected: breaks users who know exactly what they want, destroys SEO, and creates a hard dependency on intent accuracy for 100% of traffic. A wrong classification would have no escape hatch.
3. *AI chat as the only entry point.* Rejected under P2 — a chatbot-only product is a worse search box when the model is wrong or unavailable.

**Consequences.** Requires the Service Graph (D-003) and an intent layer before it can ship. Two entry paths must be maintained. Category pages become the fallback when intent confidence is low, which is also the graceful-degradation story when the model is unavailable.

---

## D-002 — AI acts only through the authorization chain; there is no AI-only code path

**Status:** PROPOSED (restates a Phase 0.5 commitment as product law)

**Decision.** Every AI action goes `AI → Tool → Authentication → Authorization → Business Rules → Transaction → Database → Event → User-visible confirmation`. AI acts as the user, with the user's permissions, never elevated. Tools that write are the same services the HTTP API calls.

**Why.** The audit found AI advising the *client*, which then asserted the result to the server: `/ai/dynamic-price` computed a price, sent it to the browser, and the browser sent back whatever number it liked. `/ai/fraud-check` returned `blocked: true` and nothing read it. AI that only advises the client is decorative; AI that writes outside the authorization path is the most dangerous component in the system.

**Alternatives considered.**
1. *AI service account with elevated rights.* Rejected: makes every prompt-injection a privilege escalation.
2. *A separate faster AI write path.* Rejected: guarantees the two paths diverge, and the divergence will be discovered in production.
3. *Client-side AI orchestration (status quo).* Rejected: the client is not authoritative for anything that matters (P6).

**Consequences.** AI features are gated on the service/authorization layer existing (Phase 2). Slower to first demo; the alternative is a demo that cannot become a product.

---

## D-003 — Build the Service Graph before any AI matching or goal feature

**Status:** PROPOSED

**Decision.** `services`, service relationships, provider capabilities, coverage areas and dated availability are built first. Intent understanding, goal decomposition, bundle recommendation and multi-signal matching all depend on it and are sequenced after.

**Why.** There is currently no service entity at all — a service is a free-text string on `providers.service_type_en` and again on `bookings.service_name_en`, and three incompatible taxonomies coexist (12 rows in `schema.sql`, 8 in the seeder which fails to insert due to a PK type mismatch, 19 hardcoded in the frontend, and it is the frontend's list that users see). Any intent model would be classifying into a vocabulary that does not exist.

**Alternatives considered.**
1. *Ship AI intent against free-text service strings.* Rejected: the model would map to unstable strings; no two providers describe the same service identically; nothing downstream could act on the result.
2. *Let the LLM define the taxonomy at runtime.* Rejected: non-deterministic, unpriceable, unmatchable, and impossible to report on.
3. *Buy or import a taxonomy.* Considered and partly adopted — international taxonomies are a useful skeleton, but the leaf-level content ("what an AC servicing in Dhaka actually includes") is exactly the local knowledge that makes the graph defensible (Constitution §13).

**Consequences.** MVP timeline is front-loaded with unglamorous data modelling. The graph is the highest-leverage asset in the product; building the AI first would produce a demo and no product.

---

## D-004 — Trust is multi-signal, explainable and appealable; never a single score shown to users

**Status:** PROPOSED

**Decision.** A Trust Graph (Constitution §7) combining identity, capability, completed jobs, satisfaction, repeat customers, reliability, response time, cancellation behaviour and complaint history. Users see a small set of legible facts, not a composite number. Providers see exactly why their standing is what it is and how to change it. Every negative determination is appealable to a human. Trust changes are Tier C — never AI-adjudicated.

**Why.** A star average is trivially gamed at low volume, gives a new provider no path in, and gives a penalised provider no recourse. `providers.trust_score` already exists as an opaque integer written in exactly one place and read nowhere — an opaque score that nothing consumes is worse than none.

**Alternatives considered.**
1. *Star rating only (status quo).* Rejected: gameable, uninformative, no cold-start path.
2. *Single composite score shown publicly.* Rejected: users cannot act on "82/100", providers cannot fix it, and it invites a scoring arms race.
3. *Purely algorithmic trust including automated suspension.* Rejected: a false positive removes someone's income with no recourse. Punitive decisions require human review.

**Consequences.** More expensive than an average. Requires the dispute workflow and the audit log. Cold-start honesty ("new provider") must be designed, not hidden.

---

## D-005 — Provider listing requires approval; the "verified" claim must be true

**Status:** PROPOSED (formalises the Phase 0.5 `is_approved` gate)

**Decision.** A provider is not publicly listed or bookable until approved. Public claims about verification state exactly which checks were performed.

**Why.** The audit found `POST /api/providers/apply` listing any authenticated user publicly and immediately, while the same handler told them "your application will be reviewed within 24–48 hours" and the site meta description marketed "KYC-verified providers". Three mutually contradictory statements, one of them to search engines.

**Alternatives considered.**
1. *Auto-list, review later (status quo).* Rejected: makes the verification claim false and puts unvetted people in homes.
2. *Auto-list with an "unverified" badge.* Considered seriously — it solves supply cold-start. Rejected for launch because home services involve entering a home; the safety asymmetry is too large. Revisit for low-risk remote categories.
3. *Full KYC before listing.* Rejected as too heavy for launch — a phone-verified, identity-checked, manually-approved provider is the launch bar; full document KYC gates higher-trust badges and higher-value categories.

**Consequences.** Slower supply onboarding, and a review queue that needs staffing. Migration `002` grandfathered existing providers to `is_approved = 1` so the live directory did not empty.

---

## D-006 — No standalone short-form video feed; provider proof-of-work media instead ⚠ NEEDS SIGN-OFF

**Status:** PROPOSED

**Decision.** IMAP will **not** build a TikTok-style discovery feed. Instead, short media (before/after photos, ≤30s work clips) attaches to **provider profiles and service listings** as trust artefacts, surfaced inside discovery and comparison — not as a browsable entertainment surface.

**Why.**
1. *Objective conflict.* A feed is optimised for time-on-app. The North Star is Resolved Needs (Constitution §1.2, `KPI.md` §1). Building a surface whose success metric contradicts the product's success metric creates permanent internal conflict.
2. *Cold-start supply.* A feed needs continuous content. Providers are single operators fixing air conditioners; they will not produce daily video.
3. *Moderation cost.* An open video surface requires a moderation function IMAP does not have — and the audit shows the organisation has not yet built an audit log, let alone a moderation pipeline.
4. *The value is real but does not need a feed.* Seeing a plumber's previous work is genuinely persuasive. That value is captured on the profile, at the exact moment of the trust decision, where it converts.

**Alternatives considered.**
1. *Full short-form feed.* Rejected above.
2. *Feed of local service content (tips, offers).* Rejected for MVP: same moderation cost, weaker trust payoff. Reconsider as an acquisition channel once supply is dense in one city.
3. *No media at all.* Rejected: photo evidence of prior work is one of the strongest trust signals available, and it is cheap.

**Consequences.** IMAP forgoes a potential viral acquisition loop. Acquisition must come from need-driven search, referral and provider-led local networks instead. If growth stalls and this decision is revisited, it must be revisited as a *discovery* feature with a resolution metric — never as an engagement feature.

---

## D-007 — Hybrid interface; AI is never the only path to any core action

**Status:** PROPOSED

**Decision.** Every core journey (find → compare → book → pay → track → review) is completable entirely through structured UI with no AI involvement. AI accelerates; it is never load-bearing for completion.

**Why.** Models fail, time out, cost money, and are unavailable on poor networks — a real constraint for the target market. A product whose checkout depends on an LLM has an availability floor set by a third party. It also matters for trust: users making a payment decision want to see fields, not prose.

**Alternatives considered.**
1. *AI-first with UI fallback.* Rejected: "fallback" surfaces are always under-built, and the fallback is exactly what a low-connectivity user gets.
2. *UI-first with AI as an add-on.* Rejected as too weak — it produces the current situation, where AI is a floating chat panel that shares no state with the app.

**Consequences.** Two paths to maintain. Structured UI is the source of truth for what an action *is*; AI renders proposals into that same structure (Constitution §P2).

---

## D-008 — Nine-state truthfulness vocabulary is mandatory in all user-facing copy

**Status:** PROPOSED (formalises the Phase 0.5 truthfulness principle)

**Decision.** All AI output and UI copy about system state uses exactly one of: Suggested, Available, Requested, Pending, Confirmed, Completed, Failed, Unavailable, Unknown. Each has a required server evidence standard (Constitution §P4.1).

**Why.** The audit found four live fabrications, including an AI fallback that told every user who typed "loan" that their credit score was 82/100 and they qualified for ৳50,000 — a user-specific financial claim, read from a hardcoded string. Ambiguous copy is how that becomes possible; a closed vocabulary with evidence requirements makes it a review-catchable error.

**Alternatives considered.**
1. *Style guidance without enforcement.* Rejected: guidance is what existed implicitly and it failed.
2. *A smaller vocabulary (success/pending/failure).* Rejected: it cannot distinguish "we sent it and don't know" from "they accepted", which is exactly the distinction that was being fudged.

**Consequences.** Copy review becomes a checklist item. Tool return types must carry state explicitly rather than free prose.

---

## D-009 — Commission on completed bookings is the only launch revenue mechanism

**Status:** PROPOSED

**Decision.** IMAP takes a percentage commission on successfully completed bookings. No subscriptions, no lead fees, no paid placement, no AI upsell at launch.

**Why.** Commission aligns platform revenue with the North Star: IMAP earns when a need is resolved. Lead fees earn on *failed* matches. Paid placement earns by degrading recommendation quality — directly violating P7. The mechanism is already partly built: `bookings.platform_fee` exists, is server-computed since Phase 0.5, and is driven by `PLATFORM_FEE_PCT`, currently `0`.

**Alternatives considered.**
1. *Provider subscription.* Rejected for launch: charges before value is proven, and prices out the single-operator providers who are the supply base. Revisit as an optional tools tier (`BUSINESS-MODEL.md` §3).
2. *Lead fees.* Rejected: misaligned — the platform is paid whether or not the user is helped.
3. *Premium placement.* Rejected at launch under P7. If ever introduced, it must be labelled and must never outrank a materially better option.
4. *Charging the customer a booking fee.* Rejected for launch: adds friction at the exact moment of conversion in a price-sensitive market.

**Consequences.** Revenue is zero until bookings complete, so cash-flow depends on transaction volume. The commission rate becomes a sensitive, publicly-visible number and must be set before launch — `PLATFORM_FEE_PCT = 0` today means launching with no revenue by default.

---

## D-010 — No customer stored value; the wallet becomes a provider earnings ledger ⚠ NEEDS SIGN-OFF

**Status:** PROPOSED

**Decision.** IMAP will not hold customer funds. The customer-facing "wallet top-up" capability is withdrawn. `users.balance` is repurposed to represent **provider earnings owed by the platform**, backed by an append-only ledger. Customers pay per booking through the gateway; providers accrue earnings and withdraw them.

**Why.**
1. **Regulatory.** Accepting customer funds for later spending is stored value / e-money. In Bangladesh this sits under Bangladesh Bank payment-system regulation (PSO/PSP licensing). IMAP does not hold such a licence, and a marketplace commission model does not require one. Building the feature creates licensing exposure with no product need.
2. **The audit's worst money defects clustered here.** Free ৳500 on signup with no ledger entry; wallet credited before a ledger row that the enum then rejected, producing unlogged credits; an unconfigured gateway crediting balances for free (P0-12); double-charging where the wallet was debited at booking creation *and* the gateway charged for the same booking (P1-5).
3. **No product benefit.** Stored value adds nothing to need resolution. It exists because it was easy to implement, not because a user asked for it.
4. **Provider earnings genuinely need a ledger.** That is the real requirement, and it is a different thing.

**Alternatives considered.**
1. *Keep the wallet, obtain a licence.* Rejected for MVP: months of regulatory work for a feature with no demonstrated demand.
2. *Keep it as "promotional credit only", non-withdrawable.* Considered — this is likely still not stored value if it is non-redeemable, non-transferable and platform-issued. Held open as a **FUTURE** option for refunds and goodwill credits; explicitly not a top-up product. Requires legal review.
3. *Status quo.* Rejected: unlicensed stored value plus the defect history above.

**Consequences.** Removes shipped user-facing functionality — top-up UI, top-up payment type, self-service credit. Refunds must return to the original payment method rather than to a balance, which is slower and needs gateway refund support (not currently implemented). Loyalty points can no longer redeem into spendable balance and must convert to a per-booking discount instead. **This decision requires legal confirmation for the Bangladesh market before implementation.**

---

## D-011 — Microloans are removed from product scope pending licensing ⚠ NEEDS SIGN-OFF

**Status:** PROPOSED

**Decision.** The microloan capability is withdrawn from the product. Existing code is frozen and the surface disabled; no lending is offered in IMAP 2.0.

**Why.**
1. **Regulatory.** Microcredit in Bangladesh is licensed and supervised by the Microcredit Regulatory Authority under the Microcredit Regulatory Authority Act 2006. Offering credit at a stated interest rate without authorisation is not a product risk, it is a legal one.
2. **The implementation is a marketplace feature wearing a lender's clothes.** A heuristic score from loyalty points and booking count; a hardcoded 9% rate; a ৳100,000 cap; no repayment schedule, no instalments, no collections, no default handling, no ledger. Phase 0.5 fixed the double-disbursement bug — it did not make it a lending product.
3. **Focus.** Consuming scarce build capacity on a regulated vertical while the core loop (need → resolution) does not yet work is the exact breadth-over-depth failure the audit identified.

**Alternatives considered.**
1. *Keep it, pursue an MRA licence.* Rejected for IMAP 2.0. Legitimate as a separate future business line with its own team and compliance function — not a feature.
2. *Partner with a licensed MFI/bank, IMAP as introducer only.* **Recommended future path.** IMAP's booking and earnings history is genuinely valuable underwriting data for provider working-capital loans. IMAP refers; the licensed partner underwrites, lends and collects. Classified **FUTURE**, dependent on a partner and a compliance review.
3. *Rename it "advance on earnings".* Rejected: an advance repaid from future earnings is still credit. Renaming a regulated activity does not deregulate it.

**Consequences.** Removes a shipped feature and any user expectation set by it. Existing applications and any disbursed amounts need an explicit wind-down plan owned by the business, not by engineering. **Requires legal confirmation before implementation.**

---

## D-012 — IMAP does not publish disaster alerts; it links to official sources ⚠ NEEDS SIGN-OFF

**Status:** PROPOSED

**Decision.** IMAP stops presenting disaster alerts as a first-party information product. The surface becomes a signposting page to official sources (Bangladesh Meteorological Department, Department of Disaster Management, 999) plus, optionally, clearly-labelled community reports that are never styled as warnings.

**Why.**
1. **The audit found fabricated emergency information served as real** — four seeded alerts including a "critical" cyclone warning for Cox's Bazar, plus three more hardcoded in the client carrying instructions like "Evacuate coastal areas immediately". Phase 0.5 gated and labelled them; it did not create a source of truth.
2. **IMAP has no authority and no feed.** Publishing warnings without a verified source is the highest-harm defect class in the product: the people most likely to act on it are the most vulnerable.
3. **Signposting is genuinely useful and honest.** Getting someone to the real hotline fast is a real service.

**Alternatives considered.**
1. *Integrate an official feed.* **The right long-term answer** and the reason the surface is retained rather than deleted. Requires a data-sharing arrangement; classified **FUTURE**.
2. *Keep community reports as alerts with a disclaimer.* Rejected: a disclaimer does not undo the visual grammar of a red "CRITICAL" banner. If we cannot verify it, it must not look like a warning.
3. *Delete the feature entirely.* Rejected: hotline signposting has real value at near-zero cost and risk.

**Consequences.** Reduces apparent feature scope. Requires verified hotline numbers — the numbers currently shipped (999, 10941, 16321) are plausible but were never checked against an official source, and this is flagged as an open risk in `PHASE-0.5-SECURITY-REGRESSION.md`.

---

## D-013 — Blood donation stays as a consent-first registry, with no dispatch claim ⚠ NEEDS SIGN-OFF

**Status:** PROPOSED

**Decision.** IMAP retains an opt-in blood donor registry with contact release gated behind an authenticated, logged, per-request action. IMAP does not claim to notify, dispatch or match donors, and does not build automated donor alerting in IMAP 2.0.

**Why.**
1. Blood donor coordination is a real and valuable civic function in Bangladesh, and the volunteer supply is genuine.
2. **But the audit found eight fabricated donors with phone numbers seeded into production**, and a request endpoint that wrote a log line and replied "Request sent to available donors". Both are fixed; neither made it a working service.
3. Automated donor alerting is a notification system with a safety profile: wrong-blood-group alerts, alert fatigue, harassment of volunteers, and the impossibility of verifying urgency. It should not be built casually alongside a marketplace.
4. Donor phone numbers are health-adjacent personal data belonging to volunteers, not a directory.

**Alternatives considered.**
1. *Build automated donor matching and notification.* Rejected for IMAP 2.0 on the safety and focus grounds above. **FUTURE**, and only with a partner blood bank.
2. *Delete the feature.* Rejected: the registry has real value and the consent model is now sound.
3. *Keep it fully public (status quo before 0.5).* Rejected: exposed volunteers' phone numbers to unauthenticated callers.

**Consequences.** The feature stays deliberately modest. Copy must state plainly what IMAP does and does not do. Consent must be re-confirmable and revocable, and a donor must be able to remove themselves instantly.

---

## D-014 — MVP is one vertical slice, not a subset of every existing feature

**Status:** PROPOSED

**Decision.** IMAP 2.0's MVP delivers the full lifecycle for a **small set of home-service categories in one city**, rather than a shallow version of all 18 current modules. Everything else is disabled, deferred, or frozen.

**Why.** The audit's central finding was breadth without depth: 18 route modules, 19 categories, uniformly shallow, no prioritisation evidenced anywhere, and a scorecard of 1.4/5. Preserving that shape into 2.0 reproduces the failure. The MVP promise (`PRD.md` §2) is a *loop*, and a loop is only demonstrated by completing it.

**Alternatives considered.**
1. *Rebuild everything at higher quality.* Rejected: multiplies scope by the number of domains and delays proving the core thesis indefinitely.
2. *Keep all features, improve incrementally.* Rejected: no capacity to build the Service Graph, trust model and AI layer while maintaining 18 domains.
3. *Narrow to a single category.* Considered — highest focus, but too narrow to test the intent layer, which is only interesting when there is more than one plausible service to classify into.

**Consequences.** Visible feature reduction, which needs communicating to any existing users. Frozen features (`sos`, `blood`, `disaster`) remain deployed in their Phase 0.5 truthful state; `loans` is disabled per D-011. Success is measured by loop completion rate, not by feature count.

---

## Decision index

| ID | Decision | Status | Needs sign-off | Constitution ref |
|---|---|---|---|---|
| D-001 | Need-first default, categories retained | PROPOSED | | §3 P1 |
| D-002 | AI acts only through the authorization chain | PROPOSED | | §3 P3 |
| D-003 | Service Graph before AI matching | PROPOSED | | §6.2 |
| D-004 | Multi-signal, explainable, appealable trust | PROPOSED | | §7 |
| D-005 | Provider approval before listing | PROPOSED | | §10 |
| D-006 | No short-form feed; proof-of-work media | PROPOSED | ⚠ | §11 |
| D-007 | Hybrid UI; AI never load-bearing | PROPOSED | | §3 P2 |
| D-008 | Nine-state truthfulness vocabulary | PROPOSED | | §3 P4 |
| D-009 | Commission-only at launch | PROPOSED | | §10 |
| D-010 | No customer stored value | PROPOSED | ⚠ legal | §10 |
| D-011 | Microloans removed pending licensing | PROPOSED | ⚠ legal | §11 |
| D-012 | No first-party disaster alerts | PROPOSED | ⚠ | §11 |
| D-013 | Blood registry, no dispatch claim | PROPOSED | ⚠ | §3 P8 |
| D-014 | MVP is a vertical slice | PROPOSED | | §14 |
