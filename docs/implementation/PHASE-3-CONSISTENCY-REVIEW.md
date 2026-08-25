# IMAP 2.0 — Phase 3 Cross-Phase Consistency Review

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Required by:** Phase 3 brief §51 — verify Phase 1 ↔ 2 ↔ 2.5 ↔ 2.75 ↔ 3 with no contradictions.

Seven conflicts were found while deriving the blueprint. **None is resolved by silently overriding a product decision.** Each is recorded with its source, its resolution and where the resolution lives. Five are resolved in documentation; two remain open and belong to a human.

---

## K-01 — Separation of duties is unenforceable with Gate-1's role set · **OPEN, accepted**

| | |
|---|---|
| **Source A** | `AUTHORIZATION-ARCHITECTURE.md` §7 — "the approver of a refund is not the executor of the payout"; six platform roles |
| **Source B** | `GATE-1-ARCHITECTURE.md` §8 — four Gate-1 roles, one of which is `admin`; the other five "deferred to Gate 2, when there is more than one person" |
| **Conflict** | With one platform role held by one person, separation of duties cannot be enforced. Money moves at Gate 1 |

**Resolution — documented, not pretended.** Policies are written against the six platform roles from the first commit; the single `admin` membership is granted all six; tightening later is a **membership change, not a code change**; the same-actor approve-then-execute path is permitted **and writes an audit record flagged `sod_bypass`**, so the exception is counted rather than invisible.

**No product decision changed.** The control is unenforceable at this team size, which is a fact about the team, not about the architecture.

*Recorded in:* `AUTHORIZATION-IMPLEMENTATION-PLAN.md` §6 · `GATE-1-IMPLEMENTATION-MAP.md` Module 5 · risk **R-11**.

---

## K-02 — Refund is a machine in Phase 2 and absent from Gate 1's six · **RESOLVED**

| | |
|---|---|
| **Source A** | `STATE-MACHINES.md` §6 — a standalone Refund machine with `requested → approved → processing → completed` |
| **Source B** | `GATE-1-ARCHITECTURE.md` §5 — six machines, Refund not among them |
| **Conflict** | Refunds are required at Gate 1 (R-608, dispute outcomes), so the capability cannot simply be deferred |

**Resolution.** Refund states are implemented **inside the Payment aggregate** on a `refund` row, sharing Payment's transaction boundary. `STATE-MACHINES.md` §5's Payment diagram already contains `refund_pending → refunded / refund_failed`, so this is the narrower reading of two consistent documents rather than a change to either. No capability is lost; no seventh machine is added. The standalone approval workflow is the Gate-2 elaboration.

*Recorded in:* `STATE-MACHINE-IMPLEMENTATION-PLAN.md` §3.

---

## K-03 — Provider listing has nine states and is not a Gate-1 machine · **RESOLVED**

| | |
|---|---|
| **Source A** | `STATE-MACHINES.md` §2 — nine states; D-005 makes `applied → listed` the audited defect that must be impossible |
| **Source B** | `GATE-1-ARCHITECTURE.md` §5 — provider approval listed as "a validated enum, not a machine" |
| **Conflict** | A validated enum does not prevent a forbidden transition |

**Resolution.** Implemented as a **guarded enum**: the same transition table, the same `UPDATE … WHERE state = ?` + `affectedRows` check, without a separate machine abstraction. `applied → listed` is a **test**, not a comment. Gate-1 states are seven; `more_info` and the appeal path defer to Gate 2.

*Recorded in:* `GATE-1-IMPLEMENTATION-MAP.md` Module 3 · `STATE-MACHINE-IMPLEMENTATION-PLAN.md` §8.

---

## K-04 — `payout_batch` is deferred but PayoutClaim's `processing` state depends on it · **RESOLVED**

| | |
|---|---|
| **Source A** | `STATE-MACHINES.md` §8 — `processing` means "included in a payout batch" |
| **Source B** | `PHASE-2.5-SIMPLIFICATION.md` S-10 — `payout_batch` deferred |

**Resolution.** At Gate 1, `processing` means **"transfer submitted to the provider's channel"**. No state is removed; only its trigger differs. When batching arrives, `payout_batch` becomes the trigger and no state changes.

*Recorded in:* `STATE-MACHINE-IMPLEMENTATION-PLAN.md` §4.

---

## K-05 — Phase 2 specifies a monorepo; Gate 1 does not need one · **RESOLVED**

| | |
|---|---|
| **Source A** | `SYSTEM-ARCHITECTURE.md` §6 — `apps/web`, `apps/admin`, five workspace `packages/` |
| **Source B** | Phase 3 brief §5 — "do not blindly create `packages/` unless the architecture actually requires them" |

**Resolution.** The requirement a workspace would satisfy is `UX-CONSTITUTION.md` §7: Ant Design must never enter a consumer route. **Two rollup inputs satisfy it completely** — the admin entry has its own dependency graph. Gate 1 builds one Vite project with two entries and `src/shared/` behind a path alias.

**A promotion trigger is written down** so this is not re-litigated as a judgement call: move to a workspace when a second consumer of `shared/` appears, or `shared/` exceeds ~3,000 lines. The boundary is asserted in CI (`antd` absent from the consumer bundle), not trusted to discipline.

*Recorded in:* `TARGET-REPOSITORY-STRUCTURE.md` §1.2.

---

## K-06 — Emergency is a separate context in AD-020 and a sub-module at Gate 1 · **RESOLVED**

| | |
|---|---|
| **Source A** | AD-020 — Emergency is a separate bounded context with a stricter contract |
| **Source B** | `GATE-1-ARCHITECTURE.md` §2.1 — Emergency lives inside `booking` at Gate 1 |

**Resolution.** AD-020 is right about the **contract** and, at Gate 1, wrong about the **module**. Gate-1 emergency is one entity, three endpoints and an admin notification; a separate module buys isolation a 5-module monolith already provides.

**The stricter contract is kept in full** — no `dispatched` state, actual admin reachability reported, hotline surfaced on any failure, Sealed data, emergency paths never degraded by non-emergency load — enforced by tests and an explicit use-case contract rather than by a directory. When D-012 and D-013 are decided and the surface grows, it becomes its own module: AD-020 executing later, not being abandoned.

*Recorded in:* `GATE-1-IMPLEMENTATION-MAP.md` §2.1 · declared, not absorbed.

---

## K-07 — `DATA-ARCHITECTURE.md` marks deferred entities as required · **RESOLVED**

| | |
|---|---|
| **Source A** | `DATA-ARCHITECTURE.md` §3 marks `service_edge_closure`, `payout_batch`, `trust_signal`, `provider_standing`, `ranking_explanation` and `notification_preference` as **R** (required for MVP) |
| **Source B** | AD-021, AD-022, S-04, S-10 defer all six |

**Resolution.** `DATA-ARCHITECTURE.md`'s **R** was assigned against the single "MVP" that Phase 2.5 found conflated two gates (V-06). The Phase 2.75 amendment E3 already states that `GATE-1-ARCHITECTURE.md` §4 is the binding list and that entities absent from it are **deferred, not deleted**. This blueprint follows the amendment.

*Recorded in:* `DATA-ARCHITECTURE.md` amendment E3 · `ENTITY-IMPLEMENTATION-MAP.md`.

---

## Two findings that are not contradictions but change the plan

### F-01 — Nine frontend surfaces have no backend at all

Ten hardcoded arrays in `App.jsx` are rendered as product data: analytics, loyalty, referral, portfolio, provider analytics, skill certification, promos, wallet transactions, calendar. `pseudoBooked()` hashes a provider id and a date into a boolean and shows the result as whether a slot is taken.

Every one is already outside Gate-1 scope (`INFORMATION-ARCHITECTURE.md` §3.3 "Not routes"). **They are deleted, not migrated** — removing ~1,900 lines, 34% of `App.jsx`, before any decomposition begins.

Phase 2's `CURRENT-TO-TARGET.md` classified `App.jsx` as one REWRITE. It is materially smaller than that once the fabricated third is subtracted.

*Recorded in:* `CURRENT-SYSTEM-INVENTORY.md` §1.1 · `APP-JSX-MIGRATION.md` §1.

### F-02 — Two line-count corrections

`CURRENT-TO-TARGET.md` records `AdminPanel.jsx` at 1,556 (actual **1,600**), `api.js` at 408 (actual **416**) and `server.js` at 428 (actual **249** — the Phase 0.5 realtime extraction). Immaterial, corrected for accuracy; `server.js` is better-separated than the Phase 2 document assumes.

*Recorded in:* `CURRENT-SYSTEM-INVENTORY.md` §0.1, marked `[VERIFIED-DIFF]`.

---

## Open items belonging to a human

Unchanged from `PHASE-3-READINESS.md` §7. **No approval has been invented, inferred or worked around.**

| Item | Owner | Blocks |
|---|---|---|
| D-006 short-form feed | Product | nothing structural |
| **D-009 commission rate** | **Business** | Gate-1 **launch** — `PLATFORM_FEE_PCT` is 0 and stays 0 |
| D-010 customer stored value | **Legal** | wallet wind-down; R-611 loyalty redemption |
| D-011 microloans | **Legal** | loan wind-down |
| D-012 disaster alerts · D-013 blood registry | Product + legal | emergency surface scope |
| Loan wind-down plan | Business | outstanding balances |
| **Hotline verification** | Operations | **I-13 exit** — R-1009, open since Phase 0.5 |
| VAT / marketplace tax treatment | **Legal** | pricing completeness |
| **Ledger opening balances** | **Business** | **M-25** |
| **Taxonomy mapping sign-off** | Product + operations | **I-09** |

---

## Verdict

| Check | Result |
|---|---|
| Phase 1 ↔ Phase 3 | **Consistent.** Every NOW requirement traces to an implementation and a test, or is explicitly deferred with its reason |
| Phase 2 ↔ Phase 3 | **Consistent**, with K-02 … K-07 declared and resolved in documentation |
| Phase 2.5 ↔ Phase 3 | **Consistent.** V-03, V-04, V-05, V-06, O-01…O-04 all have implementation and test coverage |
| Phase 2.75 ↔ Phase 3 | **Consistent.** AD-021…AD-026 are all reflected; the frozen Gate-1 counts are unchanged |
| Product decisions | **None changed.** Five conflicts resolved by documentation; two remain open and belong to their owners |
| Over-engineering | 15 components removed with a recorded reason; **no Gate-1 component lacks a source** |

**No Phase 1 product decision has been changed by this phase.**
