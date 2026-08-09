# IMAP 2.0 — Phase 3 Implementation Roadmap

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**The master ordered sequence for Phase 4.** Derived in `IMPLEMENTATION-DEPENDENCY-GRAPH.md`.

**Complexity, not time.** S ≈ one session · M ≈ 2–3 · L ≈ 4–6 · XL ≈ split before starting.
No calendar estimates: there is no velocity history to base one on, and an invented date becomes a commitment.

---

## I-01 — Foundation · **M**

| | |
|---|---|
| **Objective** | The structure, the boundaries that enforce it, and CI — before any module |
| **Depends on** | Phase 2.75 complete |
| **Files** | `backend/src/{shared,composition}/`, `backend/openapi/imap.v1.yaml`, `.github/workflows/ci.yml`, lint config, `vite.config.js` |
| **Database** | **M-03 … M-05** — formalise the 6 import-time tables and 7 `ALTER`s; add `area` |
| **Tests** | Integration harness; the 59 existing tests green **in CI** |
| **Security** | No change |
| **Acceptance** | 1. `npm test` runs in CI and blocks merge · 2. Import-boundary lint reports violations · 3. OpenAPI skeleton validates · 4. No module creates a table at import time · 5. Bundle budget plugin fails on a deliberate overrun |
| **Rollback** | Revert; nothing user-facing |
| **Risk** | Low |

> **This closes `PHASE-3-READINESS.md` §5.3.** The repository deploys without testing today; that ends here, before anything else is built.

---

## I-02 — Audit · **M**

| | |
|---|---|
| **Objective** | An append-only audit log written in-transaction |
| **Depends on** | I-01 |
| **Files** | `modules/platform/audit/` |
| **Database** | **M-06** — `audit_log`, partitioned, **`INSERT`/`SELECT` grant only** |
| **Tests** | Matrix 51–58 · **test-first** |
| **Acceptance** | 1. A state change with no audit record fails the transaction · 2. `writeAudit` without a connection throws · 3. Changed fields only · 4. No Sensitive value in a payload · 5. **The app role cannot `DELETE`** · 6. `reason` enforced before the change · 7. Reading the log writes a record |
| **Rollback** | Drop the table; revert |
| **Risk** | Low |

---

## I-03 — Authorization kernel · **L**

| | |
|---|---|
| **Objective** | One kernel, one entry point, a registry that fails startup |
| **Depends on** | I-02 |
| **Files** | `modules/platform/authorization/`, `composition/policies.js` |
| **Database** | none |
| **Tests** | Matrix 12–19 · **test-first** |
| **Acceptance** | 1. **A use case with no policy fails at startup** · 2. **A policy with no resource is rejected at registration** · 3. Four outcomes per policy · 4. `404`/`403` byte-identical · 5. Denials audited · 6. Roles from the database, never the token |
| **Rollback** | Revert; existing checks untouched |
| **Risk** | Medium — every later module registers into it |

---

## I-04 — Events · **M**

| | |
|---|---|
| **Objective** | Transactional outbox and dispatcher |
| **Depends on** | I-03 · **Database** M-07 |
| **Tests** | Matrix 42; event tests 16–20 |
| **Acceptance** | 1. No outbox row for a rolled-back change · 2. Per-aggregate ordering · 3. Duplicate delivery handled once · 4. INDEF events never dead-letter · 5. A poisoned event does not block its aggregate |
| **Risk** | Medium |

---

## I-05 — Jobs · **M**

| | |
|---|---|
| **Objective** | Durable queue with AD-024 idempotency; Redis replaces the in-process `Map`s |
| **Depends on** | I-04 · **Database** M-08, M-09 |
| **Files** | `modules/platform/jobs/`, `modules/platform/infrastructure/redis/` |
| **Tests** | Matrix 38–41 |
| **Acceptance** | 1. **A job with no idempotency declaration throws at registration** · 2. Duplicate enqueue is a no-op · 3. Retry reuses the effect token · 4. Timeout never marked failed · 5. `utils/cache.js` and `otp-store.js` are Redis-backed (R-1107) |
| **Risk** | Medium |

---

## I-06 — Identity core · **L**

| | |
|---|---|
| **Objective** | Principal, account, membership, credential, session — `users.role` retired |
| **Depends on** | I-03 · **Database** M-10 … M-13 |
| **Tests** | Matrix 1–11 · **test-first** |
| **Security** | **The largest single security change.** `AUTH-MIGRATION-PLAN.md` governs |
| **Acceptance** | 1. **No credential row never authenticates** · 2. Timing indistinguishable · 3. `/auth/social-login` → 410 · 4. Role unsettable via any input path · 5. Revoked session rejected immediately · 6. Every auth attempt audited · 7. **Migration: NULL hash produces no credential row** |
| **Rollback** | M-13 switches reads back; dual-write for 7 days first |
| **Risk** | **High** — most-referenced table; global logout at cutover |

---

## I-07 — Verification · **M**

| | |
|---|---|
| **Objective** | KYC and capability decisions; documents to object storage |
| **Depends on** | I-06 · **Database** M-14, then **M-15 one cycle later** |
| **Tests** | Matrix 33, 58; state machine #4 |
| **Acceptance** | 1. Documents in object storage, **not the database** · 2. **Every read audited with a reason** · 3. Sealed access denied without the role · 4. **A self-asserted regulated capability is never `verified`** (O-01) · 5. Decisions require a reason |
| **Risk** | Medium — **M-15 is irreversible** |

---

## I-08 — Ledger · **L**

| | |
|---|---|
| **Objective** | Double-entry ledger, accounts, projection, reconciliation |
| **Depends on** | I-05, I-06 · **Database** M-23; **M-24/M-25 later and separately** |
| **Tests** | Matrix 26–35 · **test-first** |
| **Acceptance** | 1. Unbalanced throws before any write · 2. All 8 flows balance · 3. Duplicate reference posts once · 4. **Two concurrent postings: one wins** · 5. No update/delete path · 6. Derived = stored · 7. **`customer_liability` has zero entries** |
| **Rollback** | Unused until I-11 |
| **Risk** | **High** — the hardest correctness problem |

> **M-25 (opening balances) is blocked on a business decision** and is *not* part of this phase's exit. Build the ledger; populate it when the decision exists.

---

## I-09 — Catalog and Service Graph · **XL → split**

| | |
|---|---|
| **Objective** | One server-owned taxonomy replacing three |
| **Depends on** | I-07 · **Database** M-16 … M-19 |
| **Split** | **I-09a** entities + API · **I-09b** the human mapping exercise · **I-09c** provider capability mapping · **I-09d** legacy read-only |
| **Tests** | Matrix 53; graph traversal |
| **Acceptance** | 1. One taxonomy, server-owned · 2. Every source value mapped **or queued — none dropped, none guessed** · 3. Typed edges · 4. **No closure table** (AD-021) · 5. Discovery serves only from `service` |
| **Rollback** | Legacy columns retained a full cycle |
| **Risk** | **VERY HIGH** — human judgement; **stop condition: >5% queued, or any provider loses a regulated capability** |
| **Blocked by** | **Taxonomy mapping sign-off** (product + operations) |

---

## I-10 — Provider, coverage, availability · **L**

| | |
|---|---|
| **Objective** | Capabilities, coverage areas, dated availability with holds |
| **Depends on** | I-09 · **Database** M-20 … M-22 |
| **Tests** | Matrix 48–52 |
| **Acceptance** | 1. Unapproved provider not listed · 2. **`applied → listed` impossible** (D-005) · 3. **Two concurrent holds: one wins** (R-207) · 4. Coverage by area, not free text · 5. Discovery filters by capability, area, availability |
| **Risk** | Medium — **`provider_schedule` is not migrated**; providers re-enter availability, which must be communicated first |

---

## I-11 — Quote and booking creation · **L**

| | |
|---|---|
| **Objective** | Server-issued immutable quotes; a booking cannot exist without one |
| **Depends on** | I-08, I-10 · **Database** M-27, M-28 |
| **Tests** | Matrix 20–22 |
| **Acceptance** | 1. **No endpoint accepts an amount** · 2. `booking.quote_id` NOT NULL · 3. Expired quote refused · 4. Price fails closed · 5. Components itemised · 6. Slot hold acquired at creation |
| **Risk** | High — live booking data |

---

## I-12 — Booking lifecycle · **L**

| | |
|---|---|
| **Objective** | The full state machine, messaging, reviews, disputes |
| **Depends on** | I-11 |
| **Tests** | Matrix 43–50 · **transitions test-first** |
| **Acceptance** | 1. Every legal transition succeeds · 2. **Every illegal transition refused — full matrix** · 3. **The provider cannot reach `completed`** (R-505) · 4. Concurrent: one winner · 5. `auto_confirm_at` immutable once set · 6. Side effects, audit and event atomic · 7. Non-participant cannot read |
| **Risk** | **High** — the core loop |

---

## I-13 — Emergency · **M**

| | |
|---|---|
| **Objective** | Requests, hotlines, blood consent — with the stricter contract kept in full |
| **Depends on** | I-12 · **Database** M-30 |
| **Tests** | Matrix 71–78 |
| **Acceptance** | 1. Capability statement served as **data** · 2. **No `dispatched` state anywhere** · 3. Response reports **actual** admin reachability · 4. **Failure surfaces the hotline** · 5. **Only verified hotlines served** (R-1009) · 6. Contact release logged, one at a time · 7. Provider in-booking emergency (R-1010) |
| **Risk** | Medium — **highest consequence of being wrong** |
| **Blocked by** | Hotline verification (operations) |

---

## I-14 — Payment · **L**

| | |
|---|---|
| **Objective** | Gateway, IPN settlement, cash, refunds |
| **Depends on** | I-12 · **Database** M-29 |
| **Tests** | Matrix 79–87 |
| **Acceptance** | 1. **Unconfigured gateway in production ⇒ 503** · 2. Duplicate IPN credits once · 3. **Two concurrent IPNs credit once** · 4. Amount mismatch refuses · 5. Redirect cannot settle · 6. Timeout leaves `initiated` · 7. **Cash creates a `payment` row** (O-02) · 8. Refund recognition precedes settlement |
| **Risk** | **High** — real money |

---

## I-15 — Payouts and commission · **M**

| | |
|---|---|
| **Objective** | Claims, clearance, execution, earnings surface |
| **Depends on** | I-14 |
| **Tests** | Matrix 86, 87 |
| **Acceptance** | 1. Accrual on completion · 2. Clearance requires elapsed time **and** no dispute · 3. **Disputed claim cannot be paid** · 4. **Clearance re-reads dispute state at execution** (O-03) · 5. Earnings show gross, commission, net, payout state (R-904) · 6. **`PLATFORM_FEE_PCT=0` produces no commission entries** |
| **Risk** | High |

---

## I-16 — Realtime · **M**

| | |
|---|---|
| **Objective** | Outbox-driven emission; one client |
| **Depends on** | I-12 |
| **Tests** | Matrix 59–70 |
| **Acceptance** | 1. P0-7/P0-8 tests still pass · 2. **No emission for a rolled-back transaction** · 3. Per-aggregate order · 4. Terminal state evicts sockets · 5. Reconnect re-authorizes · 6. **One connection per user** · 7. **Polling fallback works with sockets blocked** |
| **Risk** | Low — already close to target |

---

## I-17 — Frontend foundation · **L**

| | |
|---|---|
| **Objective** | Delete the fabricated surfaces; routing; `shared/`; design system |
| **Depends on** | I-01 only — **parallel with all backend work** |
| **Files** | `APP-JSX-MIGRATION.md` Steps 0–2, `DESIGN-SYSTEM-IMPLEMENTATION.md` DS-1…DS-4 |
| **Acceptance** | 1. **~1,900 lines of fabricated surfaces deleted** · 2. Every surface has a URL; back/forward work · 3. **One socket connection** · 4. Design system with all eight states per component · 5. `StatusBadge` without evidence throws · 6. `MoneyAmount` refuses a bare number |
| **Risk** | Medium — Step 1 is the highest-leverage change in the frontend |

---

## I-18 — Discovery UI · **L**

| | |
|---|---|
| **Objective** | Services, results, provider profile — **and `constants/data.js` deleted** |
| **Depends on** | I-17; **the OpenAPI contract, not the implementation** |
| **Acceptance** | 1. **`constants/data.js` deleted** · 2. Empty results render an empty state **with alternatives**, never fabricated rows · 3. Error state never falls back to data · 4. Filter state in the URL · 5. Ranking basis displayed (R-302) · 6. Profile shareable and phone-free · 7. Route within budget |
| **Risk** | **High** — this is where the defining defect is removed |

---

## I-19 — Booking UI · **L**

| | |
|---|---|
| **Objective** | Flow, approval surface, activity, tracking |
| **Depends on** | I-18 |
| **Acceptance** | 1. **Total visible without scrolling; cancellation policy in full** · 2. **Never pre-selected, never auto-advancing, no countdown** · 3. Price change stated before confirm · 4. Created state is **"Pending"**, never "Confirmed" · 5. Per-state views (F2) · 6. **Location only between `active` and `arrived`** · 7. Keyboard-completable |
| **Risk** | **High** — the highest-stakes surface |

---

## I-20 — Provider UI and admin separation · **L**

| | |
|---|---|
| **Objective** | Provider surfaces; admin into its own entry |
| **Depends on** | I-19 (provider) — admin can start at I-17 |
| **Acceptance** | 1. **Earnings show gross, commission, net** (R-904) · 2. Availability in under 30 seconds (R-905) · 3. Incoming request is a full surface with **net as the primary number** · 4. **Consumer bundle contains no `antd`** · 5. Admin fixture fallback rows removed · 6. Every admin mutation records a reason and appears in the audit log |
| **Risk** | Medium |

---

## I-21 — Gate-1 verification · **L**

| | |
|---|---|
| **Objective** | Prove the exit criteria; not new features |
| **Depends on** | I-15, I-16, I-20 |
| **Acceptance** | The 9 conditions in `PRD.md` §11 Gate 1, each demonstrated end to end |
| **Risk** | Low — findings here are defects, not new work |

---

## Summary

| Phase | Complexity | Risk | Critical path |
|---|:--:|:--:|:--:|
| I-01 Foundation | M | Low | ✔ |
| I-02 Audit | M | Low | ✔ |
| I-03 Authorization | L | Med | ✔ |
| I-04 Events | M | Med | ✔ |
| I-05 Jobs | M | Med | ✔ |
| I-06 Identity | L | **High** | |
| I-07 Verification | M | Med | |
| I-08 Ledger | L | **High** | ✔ |
| I-09 Catalog | **XL→split** | **VERY HIGH** | |
| I-10 Provider | L | Med | |
| I-11 Quote + booking | L | High | ✔ |
| I-12 Lifecycle | L | **High** | ✔ |
| I-13 Emergency | M | Med | |
| I-14 Payment | L | **High** | ✔ |
| I-15 Payouts | M | High | ✔ |
| I-16 Realtime | M | Low | |
| I-17 Frontend foundation | L | Med | |
| I-18 Discovery UI | L | **High** | |
| I-19 Booking UI | L | **High** | |
| I-20 Provider + admin UI | L | Med | |
| I-21 Gate-1 | L | Low | ✔ |

**11 phases on the critical path.** 4 XL-adjacent (I-09 split into four). The frontend block (I-17…I-20) is the largest parallelisable work and depends on nothing but I-01 and the contract.

---

## Owner actions that gate specific phases

Carried from `PHASE-3-READINESS.md` §6 and §7 — none is an engineering task.

| # | Action | Gates |
|---|---|---|
| 1 | Point `backend/.env` at a development database | **everything** — the app refuses to start |
| 2 | Rotate the TiDB credential, `JWT_SECRET`, gateway/SMS/storage/AI keys | I-06 cutover |
| 3 | Run the demo-seed detection queries against production | scope of any cleanup |
| 4 | Answer `CREDENTIAL-INCIDENT.md` §2 with evidence | incident closure |
| 5 | Verify the four backup assumptions | **any production migration** |
| 6 | Provision staging | I-09, I-08 rehearsal against real data |
| 7 | Confirm Render env vars match `render.yaml` | deploy |
| 8 | Apply migration `002` to production | I-09 onward |
| 9 | **Sign off the taxonomy mapping** | **I-09** |
| 10 | **Decide the ledger opening-balance treatment** | **M-25** |
| 11 | **Set the commission rate (D-009)** | Gate-1 **launch**, not the build |
| 12 | Verify hotline numbers against an official source | I-13 exit |
| 13 | **Communicate**: global logout (I-06), availability re-entry (I-10), loyalty-point pause (R-611) | those releases |

Item 13 is the one most likely to be forgotten and the one users feel. A silent global logout on a marketplace is indistinguishable from an outage.
