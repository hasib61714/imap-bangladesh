# IMAP 2.0 — Testing Strategy

**Status:** SPECIFICATION · **Phase:** 2.75 · **Date:** 2026-08-09
**Closes:** U-03 · **Related:** `docs/ai/AI-EVALUATION.md`, `docs/architecture/CURRENT-TO-TARGET.md`

---

## 1. Where testing stands

| | |
|---|---|
| Runner | Node's built-in `node:test` — no dependency added |
| Unit / route tests | **49**, all passing |
| Integration tests | **10**, passing against a disposable engine; skipped when none is configured |
| Coverage measurement | none |
| CI execution | **none** — tests run only when someone runs them |
| E2E | none |

The 49 tests are not a general safety net. They were written in Phase 0.5 to pin twelve specific P0 defects, plus Phase 2.75's environment guards. They cover the paths that were broken, not the paths that exist.

### 1.1 The harness, and its expiry date

`backend/test/helpers/harness.js` injects a fake pool into the CommonJS require cache and sweeps that cache between tests. It works, it caught two real bugs during Phase 0.5, and `CURRENT-TO-TARGET.md` correctly calls it *"not a long-term seam"*.

It has three limits:

* it verifies which SQL string a route *would* send, not what a database *would do* with it;
* it breaks whenever a module's require graph changes;
* it cannot exercise transactions, constraints, isolation, or the guarded `UPDATE … WHERE status = ?` pattern that the whole financial design rests on.

**Direction:** as Phase 3 introduces the repository layer described in `SYSTEM-ARCHITECTURE.md`, unit tests move to injected repository fakes and the cache harness is retired. It is not retired before it is replaced — a working imperfect seam beats a gap.

---

## 2. Pyramid

```
        ╱ E2E ╲              ~8       critical journeys only, manual before Gate 1
      ╱ Contract ╲           ~25      every public endpoint's shape and status codes
    ╱  Integration ╲         ~80      real engine: transactions, constraints, concurrency
  ╱      Unit        ╲       ~250     pure rules: money, state, pricing, authorization
```

Two deliberate shape decisions:

**Integration is thicker than usual.** Most of what can go seriously wrong here is what the *database* does: a unique constraint that does not fire, an `UPDATE … WHERE status = ?` that matches when it should not, two concurrent callbacks that both credit. None of that is observable in a unit test. Phase 0's twelve P0 findings were overwhelmingly of this kind.

**E2E stays thin.** E2E over a hosted payment gateway and an SMS provider is slow and flaky. Contract tests cover endpoint shape; E2E covers only journeys where the *composition* is what can break.

---

## 3. Layers

### 3.1 Unit — business rules in isolation

No database, no network, no clock. Runs in milliseconds.

Subjects: `utils/money.js`, `utils/pricing.js`, `utils/bookingState.js`, `config/environment.js`, ledger entry construction, commission calculation, authorization predicates, validators, and the derived-balance projection.

Rules:
* every money function gets negative, zero, `NaN`, `Infinity`, string, object, array and over-cap inputs — Phase 0.5's `p0-money.test.js` is the template;
* every state machine gets a full legal/illegal transition matrix, not a happy path;
* **every security predicate gets a negative control.** A test that passes against the *broken* implementation proves nothing, and Phase 0.5 found one such test in its own suite.

### 3.2 Integration — the database is the point

Against a real MySQL-family engine, on loopback only.

| Subject | Why it cannot be a unit test |
|---|---|
| `withTransaction` rollback | rollback is a database behaviour |
| Guarded transitions | `affectedRows` is the assertion, and only the engine produces it |
| Ledger unique reference | `ER_DUP_ENTRY` is the mechanism |
| Concurrent double-credit | requires two real connections racing |
| Migrations | proven in Phase 2.75 — four defects were only visible when executed |
| Derived balance vs stored | requires committed rows |
| Cascades and orphans | referential behaviour |

Isolation: each run creates its own database (`imap_it_<pid>`), applies `schema.sql`, migrates, and drops it in teardown. No shared fixture state between files.

**A guard, not a convention:** `test/integration/` throws at module load if `IMAP_TEST_DB_HOST` is not loopback. Integration tests create and drop databases; they must never be able to address a shared server.

### 3.3 Contract — the API's shape

For every endpoint: success shape, error shape, status codes, required/optional fields, rejection of unexpected fields, and pagination bounds. Derived from `docs/architecture/API-ARCHITECTURE.md`; a divergence is a bug in whichever is wrong, and the test names which.

### 3.4 Security — the tests that must fail loudly

Highest value per line in this repository, because these are the ones Phase 0 found missing.

| Class | Assertion |
|---|---|
| Authentication | a NULL password hash never authenticates; timing does not distinguish unknown user from wrong password |
| Authorization | every endpoint, from every role, including "no role" — the matrix, not the diagonal |
| Ownership | a participant of booking A cannot read booking B |
| Realtime | a non-participant cannot join a room; only a DB-verified admin joins the admin room |
| Privilege escalation | role cannot be set through registration, profile update, or any mass-assignment path |
| Input authority | client-supplied price, fee, status or user id is never trusted |
| Rate limiting | the limiter engages and is keyed on identity, not only IP |
| Secret exposure | no response, log line or error contains a secret |

Every security test carries a **negative control**: a comment naming the code that, if reverted, must make this test fail. A security test that cannot fail is decoration.

### 3.5 Financial — where correctness is not optional

| Property | Test |
|---|---|
| Every flow balances | debits = credits for all eight worked flows in `FINANCIAL-ARCHITECTURE.md` |
| Balance is derived | derived value equals stored value after every operation; drift is a failure |
| No negative balance | overdraw is refused, never allowed and corrected |
| Idempotent settlement | the same callback twice credits once |
| Concurrent settlement | two simultaneous callbacks credit once |
| Refund correctness | recognition reverses before settlement moves |
| Commission | server-computed; a client-supplied fee is ignored |
| Rounding | integer minor units; no float appears in a money path |
| Server authority | client price is never used, at any endpoint |

Failure here is a build failure. There is no "flaky financial test" — a nondeterministic money test is a concurrency bug that has not been diagnosed yet.

### 3.6 State machine

For each of the six Gate-1 machines: every legal transition succeeds, **every illegal transition is refused**, terminal states are terminal, role-restricted transitions reject other roles, and concurrent transitions produce exactly one winner.

The illegal-transition tests are the ones that matter. Phase 0 found bookings advancing through unguarded `UPDATE`s.

### 3.7 Realtime

Room authorization is derived from the database, not from a client claim; a socket without a token joins nothing; location updates from an unauthorised socket are dropped; disconnect cleans up. Covered today by `p0-realtime-sos.test.js`; extended in Phase 3.

### 3.8 AI — Gate 2 only

Governed by `docs/ai/AI-EVALUATION.md`. Gate 1 has no AI tools, so no AI tests. What Gate 2 adds:

* **Truthfulness** — the nine-state vocabulary; the model may never report `Confirmed` for something the server has not confirmed;
* **Tool authorization** — a Tier-C tool is unreachable without the corresponding human decision;
* **Containment** — no prompt causes a direct database write, a money movement, or a Sealed-data read;
* **Proposal-then-confirm** — no state change occurs without explicit confirmation.

These are adversarial by nature and belong in a separate suite that may be slow and may call a real model.

### 3.9 E2E — eight journeys

Manual before Gate 1; automated (Playwright) in Phase 4 if the journeys stabilise.

1. Register → verify phone → complete profile
2. Search → view provider → book → pay (sandbox) → complete → review
3. Provider: apply → KYC → approval → appear in directory
4. Provider: accept → arrive → complete → earnings visible
5. Cash-on-completion end to end
6. Refund end to end
7. Emergency: SOS raised → admin sees it → hotline shown on failure
8. Admin: approve a provider; the directory changes

Journey 7's assertion is the emergency truthfulness rule: when dispatch fails, the user is shown the failure **and the hotline** — not a reassuring message.

---

## 4. Environment

| Layer | Database | Where | Speed |
|---|---|---|---|
| Unit | none | anywhere | < 2 s total |
| Integration | disposable, loopback | local; CI service container | < 60 s |
| Contract | disposable | with integration | included |
| E2E | staging | manual | minutes |

```bash
npm test               # unit + integration; integration skips silently when unconfigured
npm run test:unit      # unit only
npm run test:integration

IMAP_TEST_DB_HOST=127.0.0.1 IMAP_TEST_DB_PORT=3399 \
IMAP_TEST_DB_USER=root IMAP_TEST_DB_PASSWORD= npm test
```

`npm test` stays offline by default and prints a skip reason rather than failing — a contributor without a database gets a green unit run and an explicit note about what did not execute. Silence would be worse than either.

---

## 5. Critical test matrix

`Ph` — the phase in which the test must exist. `Gate 1` means before the core-loop release; `Gate 2` before the AI release.

| # | Area | Type | Owner | Ph | Acceptance criterion |
|---|---|---|---|---|---|
| 1 | Authentication | unit + security | backend | **exists** | NULL hash never authenticates; constant-time compare |
| 2 | Authorization | integration + security | backend | Gate 1 | full role × endpoint matrix, including anonymous |
| 3 | Ownership | integration | backend | Gate 1 | cross-booking read denied |
| 4 | Booking creation | integration | backend | Gate 1 | server-computed price; client price ignored |
| 5 | Booking transitions | unit + integration | backend | Gate 1 | every illegal transition refused |
| 6 | Concurrent transition | integration | backend | Gate 1 | exactly one of two racing transitions wins |
| 7 | Pricing | unit | backend | **exists** | fails closed with 409 when no rate resolves |
| 8 | Payment initiation | integration | backend | Gate 1 | unconfigured gateway → 503, never settlement |
| 9 | Payment settlement | integration | backend | **exists** | duplicate callback credits once |
| 10 | Concurrent settlement | integration | backend | Gate 1 | two simultaneous callbacks credit once |
| 11 | Ledger balance | integration | backend | Gate 1 | derived equals stored after every operation |
| 12 | Ledger immutability | integration | backend | Gate 1 | no UPDATE or DELETE path exists |
| 13 | Refund | integration | backend | Gate 1 | balances; ordering per `FINANCIAL-ARCHITECTURE.md` |
| 14 | Commission | unit | backend | Gate 1 | server-computed; `PLATFORM_FEE_PCT=0` yields zero |
| 15 | Idempotency — API | integration | backend | Gate 1 | replayed key returns the original result |
| 16 | Idempotency — jobs | integration | backend | Gate 1 | replayed job produces no second side effect (V-05) |
| 17 | Money parsing | unit | backend | **exists** | negative, NaN, Infinity, object, array, over-cap rejected |
| 18 | Provider approval | integration | backend | Gate 1 | unapproved provider is not listed |
| 19 | Capability verification | integration | backend | Gate 1 | self-asserted regulated capability is not `verified` (O-01) |
| 20 | Realtime room auth | integration | backend | **exists** | non-participant cannot join |
| 21 | Admin room | integration | backend | **exists** | DB-verified admin only |
| 22 | SOS routing | integration | backend | **exists** | admin room only, never broadcast |
| 23 | Emergency truthfulness | integration + E2E | backend | Gate 1 | failure shows the hotline, never a false success |
| 24 | Audit coverage | integration | backend | Gate 1 | every state change writes an audit row in the same transaction |
| 25 | KYC access | integration + security | backend | Gate 1 | Sealed documents unreachable without a verification role |
| 26 | Environment guards | unit | backend | **exists** | dev process + production database → production behaviour |
| 27 | Migration safety | integration | backend | **exists** | `--status` writes nothing; production needs acknowledgement |
| 28 | Rate limiting | integration | backend | Gate 1 | limiter engages; keyed on identity |
| 29 | Input validation | contract | backend | Gate 1 | over-length, wrong-type and unexpected fields rejected |
| 30 | AI tool authorization | AI eval | backend | **Gate 2** | Tier-C tool unreachable without human decision |
| 31 | AI truthfulness | AI eval | backend | **Gate 2** | no `Confirmed` without server confirmation |
| 32 | AI containment | AI eval + security | backend | **Gate 2** | no prompt reaches the database, money or Sealed data |

"exists" = written and passing as of 2026-08-09 (59 tests total).

---

## 6. Conventions

**Naming** — say what must be true, not what is exercised: `"a NULL password hash never authenticates"`, not `"test login"`. A failing test name should read as a bug report.

**Negative controls** — every security and financial test states, in a comment, which line of production code must be reverted for it to fail.

**Fixtures** — builders, not shared JSON. Each test creates what it needs and asserts on what it created. No test depends on another's residue.

**Test data** — never real personal data, never production-derived. Reserved phone numbers `017000000xx` are demo-only and are neutralised by migration `002`.

**Determinism** — no `Math.random()`, no wall-clock dependence, no sleeps. A flaky test is a bug in the system or the test; it is never "just flaky".

**Speed** — unit under 2 s total; integration under 60 s. Slow suites stop being run.

---

## 7. CI

Not configured. Required for Gate 1:

| Trigger | Runs | Blocks merge |
|---|---|---|
| push, PR | unit | yes |
| push, PR | integration against a service container | yes |
| push, PR | contract | yes |
| PR | secret scan (`gitleaks`) | yes |
| PR | dependency audit | warn |
| pre-release | E2E on staging | yes |

The `.github/workflows/` directory currently contains a deploy workflow only. **Deploying without testing is the configuration IMAP has today** and is a Phase 3 prerequisite to fix.

---

## 8. Coverage

Line coverage is a poor target and a useful signal. Rather than a global percentage:

| Area | Requirement |
|---|---|
| `utils/money.js`, `utils/pricing.js`, `utils/bookingState.js`, ledger | **100% branch** — no exceptions |
| Authorization predicates | **100% branch** |
| `config/environment.js` | **100% branch** |
| Route handlers | every error branch reached at least once |
| Everything else | no target |

Measured with `node --experimental-test-coverage`; no new dependency.

---

## 9. Definition of done, for a Phase 3 change

A change is done when:

1. it has unit tests for its rules;
2. it has an integration test if it touches the database;
3. it has a security test if it touches authorization, money or personal data — with a negative control;
4. every state transition it introduces has legal **and** illegal cases;
5. `npm test` passes with an integration database configured;
6. no test was weakened to make it pass.

Point 6 needs saying. The most common way a suite stops protecting anything is that a failing assertion gets relaxed instead of a bug getting fixed.

---

## 10. Prerequisites before Phase 3

| # | Item | Status |
|---|---|---|
| 1 | Test runner defined | **done** — `node:test` |
| 2 | Unit strategy | **done** — §3.1 |
| 3 | Integration strategy | **done** — §3.2, 10 tests running |
| 4 | Isolated test database available | **done** — loopback engine, guarded |
| 5 | Financial test plan | **done** — §3.5, matrix rows 8–17 |
| 6 | Security test plan | **done** — §3.4, matrix rows 1–3, 19, 25, 28 |
| 7 | CI running the suite | **not done** — Gate 1 prerequisite |
| 8 | Coverage on financial and authorization code | **not done** — Gate 1 prerequisite |

Items 1–6 are the Phase 3 gate and are met. Items 7–8 are Gate 1 release gates, not Phase 3 entry gates.
