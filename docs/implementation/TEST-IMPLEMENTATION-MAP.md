# IMAP 2.0 — Test Implementation Map

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Governed by:** `TESTING-STRATEGY.md` (Phase 2.75) · **Matrix:** `CRITICAL-TEST-MATRIX.md`

**Current: 59 tests passing** — 49 unit/route, 10 integration. No CI.

---

## 1. Test-first, where it earns its cost

Test-first is not applied uniformly. It is applied where a test written afterwards would be written to fit the implementation.

| Category | Order | Why |
|---|---|---|
| **Security** | **test first, always** | A test written after the code tends to assert what the code does. The Phase 0.5 suite contained one such test, and it passed against the broken implementation |
| **Financial** | **test first, always** | The invariants are known before the code; they come from the architecture, not the implementation |
| **State machines** | **test first** | The transition table *is* the specification; the illegal-transition matrix is derivable before any code |
| **Idempotency** | **test first** | The property is "twice equals once", which needs no implementation to express |
| Domain rules | test first | Pure functions with known inputs and outputs |
| Repositories | test alongside | Shape emerges with the schema |
| Transport / contract | **generated from OpenAPI** | Not hand-written at all |
| UI components | test alongside | The eight states are the checklist |
| E2E | after the flow works | Otherwise it tests scaffolding |

**The eight test sets that must exist before their implementation:**
authentication · authorization · money authority · ledger invariants · idempotency · booking transitions · audit atomicity · realtime authorization.

Every one is a place Phase 0 found a P0.

---

## 2. Per-phase test plan

### I-01 Foundation
Harness for integration tests (create db → migrate → drop); the lint rules themselves tested; **CI green with the existing 59**.
*Gate: `npm test` passes in CI with an integration database.*

### I-02 Audit — **test first**
1. A state change with no audit record **fails the transaction**
2. `writeAudit` without a connection throws
3. Audit rolls back with its change
4. `before`/`after` contain **changed fields only**
5. No Sensitive/Financial/Emergency value in a payload
6. **No `UPDATE`/`DELETE` path** — repository and DB grant
7. `reason` required for punitive actions, enforced **before** the change
8. Reading the audit log writes an audit record

*Gate: test 1 and test 6 both green. Without them there is no audit log, only a table.*

### I-03 Authorization — **test first**
9. Every policy: permit · deny-by-role · deny-by-relationship · deny-by-condition
10. **A use case with no policy fails at startup**
11. **A policy with no resource is rejected at registration**
12. Non-owner denied on every action of every resource type
13. `404` and `403` are **byte-identical** for an unauthorised id and a non-existent id
14. Denials on sensitive actions are audited
15. A role claim in a token is ignored; roles come from the database

*Gate: 10 and 11 green — they are what make "nothing ships unguarded" structural.*

### I-04 Events
16. No outbox row for a rolled-back change
17. Per-aggregate ordering preserved
18. Duplicate delivery handled once
19. INDEF events never dead-letter
20. A poisoned event does not block its aggregate's queue

### I-05 Jobs
21. **A job with no idempotency declaration throws at registration**
22. Duplicate enqueue is a no-op returning the existing job
23. Retry reuses the **effect token**, not a new one
24. Timeout is never marked failed
25. Dead-lettered job retains full attempt history

### I-06/07 Identity — **test first**
26. **No credential row never authenticates** (P0-1)
27. Timing indistinguishable: wrong password vs unknown user
28. `/auth/social-login` returns `410` (P0-2)
29. Google login requires a server-verified token, checked audience, `email_verified`
30. Role cannot be set via registration, profile update or mass assignment
31. Revoked session rejected immediately
32. Refresh rotation invalidates the used token
33. Sealed document access denied without the role; **every permitted read audited**
34. OTP never in a response outside development-like environments
35. Rate limits per phone **and** per IP
36. **Migration: NULL hash produces no credential row**

### I-08 Ledger — **test first**
37. Unbalanced transaction throws **before any write**
38. All 8 worked flows balance
39. Duplicate reference posts once
40. **Two concurrent identical postings: exactly one wins**
41. No `UPDATE`/`DELETE` path on entries
42. Derived balance equals stored after every operation
43. Rebuild from entries reproduces the projection exactly
44. Negative · NaN · Infinity · string · object · over-cap rejected
45. Currency mixing throws
46. `PLATFORM_FEE_PCT=0` produces **no** commission entries
47. **`customer_liability` has zero entries after the full suite** (L8)

*Gate: 37–43 green before any payment code runs against the ledger.*

### I-09/10 Marketplace
48. Unapproved provider is not listed
49. Provider cannot self-approve (`applied → listed` impossible)
50. **Self-asserted regulated capability is never `verified`** (O-01)
51. **Two concurrent slot holds: exactly one succeeds** (R-207)
52. Discovery filters by capability, area and availability
53. Retired service is unbookable; history stays readable

### I-11/12/13 Booking — **transitions test first**
54. **Every legal transition succeeds with the right actor**
55. **Every illegal transition is refused** — the full matrix
56. Terminal states are terminal
57. **Provider cannot reach `completed`** (R-505)
58. Two concurrent transitions: exactly one wins
59. `auto_confirm_at` set at `report_done` and never changes
60. Side effects, audit and event all roll back together
61. Non-participant cannot read a booking
62. Review only from the paying customer of a completed unrated booking
63. **Emergency failure surfaces the hotline**
64. Emergency response reports **actual** admin reachability
65. No `dispatched` state exists anywhere

### I-14/15 Payment
66. Client-supplied amount ignored at every endpoint (P0-3)
67. Expired quote refused
68. **Unconfigured gateway in production ⇒ 503, never settlement** (P0-12)
69. Duplicate IPN credits once (P0-5)
70. **Two concurrent IPNs credit once**
71. Amount mismatch refuses with no ledger movement
72. Redirect endpoint cannot settle
73. Timeout leaves `initiated`
74. Refund recognition precedes settlement (V-04)
75. Refund exceeding captured amount refused
76. Cash completion creates a `payment` row (O-02)
77. Disputed claim cannot be paid out
78. Clearance re-reads dispute state at execution (O-03)

### I-16 Realtime
Tests 1–7 exist (P0-7, P0-8). New: 79 location outside the window dropped · 80 terminal state evicts every socket · 81 reconnect re-authorizes · 82 no emission for a rolled-back transaction · 83 per-aggregate emission order · 84 **one connection per user** · 85 transport parity.

### I-17…I-20 Frontend
86. **No component imports a fabricated constant** (lint + test)
87. Every list surface renders a real empty state
88. Loading skeletons **do not resemble content**
89. Every money value renders from `{amount_minor, currency}`
90. **`StatusBadge` without evidence throws**
91. Modals trap and restore focus
92. Core loop keyboard-completable
93. Both locales render; `<html lang>` tracks
94. Bundle budgets met per entry
95. **Consumer bundle contains no `antd` module**

### I-21 E2E — 8 journeys
Register → verify → profile · search → book → pay → complete → review · provider apply → KYC → approval → listed · provider accept → arrive → complete → earnings · cash end to end · refund end to end · **emergency raised → admin sees → hotline on failure** · admin approves a provider.

---

## 3. Regression coverage of every historical P0

**Requirement: every Phase 0 P0 has a test that fails if the fix is reverted.**

| P0 | Defect | Test | Status |
|---|---|---|---|
| P0-1 | NULL hash authenticated | 26 | **exists** |
| P0-2 | Client-supplied `socialId` | 28 | **exists** |
| P0-3 | Client-supplied price | 66 | **exists** → extended |
| P0-4 | Negative/NaN amounts | 44 | **exists** |
| P0-5 | Repeat completion paid twice | 39, 58 | **exists** → extended |
| P0-6 | Double loan disbursement | 39 | **exists** (module removed) |
| P0-7 | Any socket joined any room | realtime 1–5 | **exists** |
| P0-8 | SOS broadcast to all sockets | realtime 6–7 | **exists** |
| P0-9 | Seeded `admin123` | 26, 36 | **exists** → extended |
| P0-10 | Fabricated emergency data | 65, 87 | **exists** → extended |
| P0-11 | Non-transactional money paths | 37, 60 | **exists** → extended |
| P0-12 | Mock settlement in production | 68 | **exists** |
| V-01 | Dev environment on production data | env suite | **exists** (18 tests) |
| V-03 | `customer_settlement` undefined | 47 | new |
| V-04 | Refund ordering | 74 | new |
| V-05 | Job idempotency | 21–24 | new |
| O-01 | Capability verification unowned | 50 | new |
| O-02 | Two payment-status owners | 76 | new |
| O-03 | Dispute/hold split authority | 78 | new |

**Nothing regresses silently.** Each carries a negative control naming the line whose reversion must make it fail.

---

## 4. Environments

| Layer | Database | Runs |
|---|---|---|
| Unit | none | everywhere, < 2 s |
| Integration | disposable loopback | local + CI service container, < 60 s |
| Contract | disposable | with integration |
| Security | disposable | with integration |
| E2E | staging | manual before Gate 1; automated at Phase 4 |

```bash
npm test              # unit + integration; integration skips silently when unconfigured
npm run test:unit
npm run test:integration
```

`test/integration/` **throws at module load** if `IMAP_TEST_DB_HOST` is not loopback. Integration tests create and drop databases; they must never be able to address a shared server.

---

## 5. CI

| Job | Blocks merge |
|---|---|
| Lint, including the import-boundary rules | ✔ |
| Unit | ✔ |
| Integration (service container) | ✔ |
| Contract, generated from OpenAPI | ✔ |
| Security suite | ✔ |
| Coverage: financial + authorization at **100% branch** | ✔ |
| Bundle budget per entry | ✔ |
| **`antd` absent from the consumer bundle** | ✔ |
| Secret scan (`gitleaks`) | ✔ |
| Dependency audit | warn |
| E2E on staging | pre-release |

**`.github/workflows/` deploys today and does not test.** That is fixed in I-01, before any other implementation phase — a Gate-1 release prerequisite carried from `PHASE-3-READINESS.md` §5.3.

---

## 6. Conventions

**Naming** — say what must be true: `"a NULL password hash never authenticates"`, not `"test login"`. A failing test name reads as a bug report.

**Negative controls** — every security and financial test names, in a comment, the production line whose reversion must make it fail.

**Fixtures** — builders, not shared JSON. Each test creates what it needs. No test depends on another's residue.

**Determinism** — no `Math.random()`, no wall-clock dependence, no sleeps. **A flaky financial test is a concurrency bug that has not been diagnosed yet.**

**Speed** — unit under 2 s, integration under 60 s. Slow suites stop being run.

**Never weaken a test to make it pass.** The most common way a suite stops protecting anything is a failing assertion getting relaxed instead of a bug getting fixed.

---

## 7. Coverage targets

| Area | Requirement |
|---|---|
| `shared/money.js`, pricing, booking state machine, **ledger** | **100% branch** |
| Authorization policies and kernel | **100% branch** |
| `config/environment.js` | **100% branch** (met today) |
| Route handlers | every error branch reached |
| Everything else | no target |

Measured with `node --experimental-test-coverage`. No new dependency.

---

## 8. Growth

| Phase | Cumulative |
|---|---|
| Today | 59 |
| I-05 (platform) | ~120 |
| I-08 (ledger) | ~200 |
| I-13 (booking) | ~290 |
| I-16 (realtime) | ~330 |
| I-21 (Gate 1) | **~380 + 8 E2E** |

Roughly 320 new tests. The distribution is deliberately integration-heavy: **Phase 0's P0 findings were overwhelmingly database-behaviour defects that a unit test cannot see.**
