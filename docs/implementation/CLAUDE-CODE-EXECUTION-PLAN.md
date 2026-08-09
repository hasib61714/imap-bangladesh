# IMAP 2.0 — Claude Code Execution Plan

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**How Phase 4 is executed.** Governs every implementation session.

---

## 1. The loop

```
READ  →  PLAN  →  IMPLEMENT  →  TEST  →  VERIFY  →  REPORT  →  STOP
```

Never:

```
PLAN  →  IMPLEMENT EVERYTHING  →  HOPE
```

| Stage | Action | Must produce |
|---|---|---|
| **READ** | The task's named documents **and the actual files it will touch** | A statement of what is currently true, from the repository — not from memory or from a document |
| **PLAN** | Files to change, tests to write first, migration if any | A file list. If it exceeds the allowed set, **stop and report** |
| **IMPLEMENT** | Tests first where §1.1 requires it; then the smallest change that passes them | — |
| **TEST** | Full suite, not only the new tests | Actual output, pasted |
| **VERIFY** | Acceptance criteria, one at a time | Each one marked met or not met |
| **REPORT** | What changed, what passed, what is out of scope, what is still open | The §5 block |
| **STOP** | End the session | No unrequested next task |

### 1.1 Test-first is mandatory for

Security · financial · state transitions · idempotency · audit atomicity. Everywhere else, tests alongside.

The reason is specific: a test written after the implementation tends to assert what the implementation does. Phase 0.5 found one such test in its own suite, passing against the broken code.

---

## 2. Task size

A task must be reviewable in one sitting. If a diff cannot be read in one pass, it is too big.

| Too large | Correct |
|---|---|
| "Rewrite the backend" | "Add the booking repository" |
| "Implement payments" | "Add the payment initiation use case" |
| "Build the ledger" | "Add `postTransaction` with balance validation" |
| "Migrate App.jsx" | "Extract `features/auth` from App.jsx" |
| "Add authorization" | "Add the policy registry and its startup assertion" |

**Practical bounds:** ≤ 8 files, ≤ 400 lines changed, one migration, one module. A task exceeding any of these is split **before** it starts, not abandoned halfway.

Each task is independently testable and independently committable.

---

## 3. Every implementation prompt

An implementation session does not begin without all ten fields.

```markdown
## TASK  I-nn.k — <name>

**Scope**             one sentence
**Allowed files**     explicit list or glob
**Forbidden files**   everything else; name the tempting ones
**Dependencies**      completed tasks required
**Acceptance criteria**  numbered, individually verifiable
**Tests required**    named, with layer, and whether test-first
**Security**          policy, audit, transaction requirements
**Database**          migration id or NONE
**Rollback**          how to undo
**STOP condition**    when to stop and report instead of continuing
```

### 3.1 Worked example

```markdown
## TASK  I-08.3 — Ledger transaction posting

**Scope**  Implement postTransaction() with balance validation and
           idempotent reference handling.

**Allowed files**
  backend/src/modules/finance/domain/ledger.js                 (new)
  backend/src/modules/finance/infrastructure/repositories/ledger.js (new)
  backend/test/unit/finance/ledger.test.js                     (new)
  backend/test/integration/finance/ledger.integration.test.js  (new)

**Forbidden**
  Any route file. Any other module. Any migration.
  Do NOT wire this into payments — that is I-14.

**Dependencies**  I-08.1 (money value object), I-08.2 (accounts + migration M-23)

**Acceptance criteria**
  1. buildTransaction() throws on unbalanced entries BEFORE any write
  2. buildTransaction() throws on mixed currencies
  3. buildTransaction() throws on amount_minor <= 0
  4. postTransaction() requires a connection; throws without one
  5. Duplicate reference returns the existing transaction, posted:false
  6. Balance projection updates in the SAME transaction
  7. No update or delete method exists on the entry repository

**Tests required**  (TEST-FIRST — financial)
  unit:        ledger.test.js — criteria 1,2,3,7
  integration: ledger.integration.test.js — criteria 4,5,6
               + two concurrent identical postings: exactly one wins

**Security**  No authorization here — this is a domain primitive called by
              use cases that authorize. Audit is written by the caller.

**Database**  NONE. M-23 was applied in I-08.2.

**Rollback**  Revert the commit. Nothing calls this yet.

**STOP if**   Any acceptance criterion cannot be met without touching a
              forbidden file. Report and stop.
```

---

## 4. Out-of-scope findings

Finding a problem outside the current task is expected and is **not** a licence to fix it.

```markdown
### OUT OF SCOPE FINDING
**What**            observed, with file:line
**Why it matters**  concrete consequence
**Suggested task**  I-nn.k or NEW
**Risk if left**    LOW | MEDIUM | HIGH
**Blocks this task?**  YES → stop  |  NO → continue
```

| Situation | Action |
|---|---|
| Blocks the current task | **STOP.** Report. Wait |
| Security defect, does not block | Report **immediately**, at the top of the report; continue only if genuinely unaffected |
| Unrelated improvement | Record; **do not implement** |
| A test fails for an unrelated reason | **STOP.** A pre-existing failure is not this task's to absorb |

The rule that matters: **discovering a better way to do something already decided is not a reason to do it differently.** It is a finding, and the decision is the owner's.

---

## 5. Report format

```markdown
## TASK I-nn.k — COMPLETE | BLOCKED | PARTIAL

**Files changed**    path — what and why
**Files created**
**Migration**        id, or NONE

**Tests**
  npm test  → N passed, 0 failed        ← actual output, pasted
  new: <names>

**Acceptance criteria**
  1. ✔ met — how verified
  2. ✔ met — how verified
  3. ✖ NOT MET — why

**Security**   policies registered · audit points · transaction boundaries
**Database**   applied where, verified how
**Out of scope findings**   §4 blocks, or NONE
**Not done**   and why
**Git**        author verified · commit hash · NOT PUSHED
```

**"Tests pass" is not a report.** Paste the output. A claim of green with no evidence is exactly what Phase 0's rule — *never claim a test passed unless you actually ran it* — exists to prevent.

---

## 6. Quality gates

Every task, before it is called complete:

| Gate | Check |
|---|---|
| **Build** | Backend starts; frontend builds |
| **Tests** | **Full suite** green, not just the new tests |
| **Security** | Policies registered; audit written in-transaction; no secret logged |
| **Database** | Migration rehearsed on the disposable instance first; **never fixed forward on production** |
| **Regression** | The 59 existing tests still pass |
| **Scope** | No file outside the allowed list changed |
| **Git** | Author is the project owner; **no AI attribution**; not pushed |
| **Lint** | Import boundaries clean |
| **Budget** | Frontend tasks within their bundle budget |

Any gate failing means the task is **not complete**, however close it looks.

---

## 7. Git

**Author:** `Md. Hasibul Hasan <mh.hasan14200@gmail.com>` — always, permanently.

**Claude Code must never appear as author, co-author or contributor.** No `Co-authored-by:`, no `Generated-by:`, no `Generated with`, no "AI-generated".

```bash
# before every commit
git config user.name && git config user.email && git status

# after every commit
git log -1 --format=fuller
git show -s --format='%an <%ae>%n%cn <%ce>%n%B' HEAD
```

If the identity is not the project owner: **STOP. Do not commit. Do not push.**

### 7.1 Branches

```
main                              deployable
imap/phase-4-<module>             one per implementation phase
imap/phase-4-<module>/<task>      only when a phase spans many sessions
```

| Rule | |
|---|---|
| Phase branch merges to `main` | when the phase's exit gate passes |
| Task branches | only where a phase spans multiple sessions; otherwise commit to the phase branch |
| No long-lived `develop` | With one developer it is an extra merge with no reviewer |
| Rollback | revert the merge commit; data rollback per `IMPLEMENTATION-DEPENDENCY-GRAPH.md` §8 |

### 7.2 Commits

Small · logical · reviewable · buildable · test-backed. Conventional prefixes scoped by module:

```
feat(identity):  add account membership model
test(identity):  cover membership authorization
feat(authz):     add resource authorization kernel
test(authz):     cover booking ownership denial
fix(finance):    reject unbalanced ledger transaction before write
chore(ci):       gate deploy on the backend test suite
```

One logical change per commit. **A commit that changes two modules is two commits** unless the change is genuinely atomic across them.

### 7.3 Push

**Never automatic.** The project owner decides when to push, every time.

---

## 8. Database rules

| Rule | |
|---|---|
| No production database operation without explicit instruction | |
| No migration against production without a **verified** snapshot | Verified means restorable, not "the call returned success" |
| Rehearse on the disposable loopback instance first | `ENVIRONMENT-ARCHITECTURE.md` §7 |
| `--status` before every run | Genuinely read-only since Phase 2.75 |
| `IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION=<db>` per invocation | Not exported in a profile |
| **Never fix forward on production** | Stop, rehearse the fix, re-run |
| Record every production run | duration, rows, anomalies |

---

## 9. Environment rules

Never run development, test, demo or mock behaviour against production data. Production fails closed.

The guards are implemented and tested (`config/environment.js`, 18 tests). **Do not weaken them.** If a guard blocks a task, that is the guard working — report it; do not add an exception.

---

## 10. Scope rules for Phase 4

| Rule | |
|---|---|
| **Gate-1 scope is frozen.** Not in `GATE-1-ARCHITECTURE.md` → **DEFER** | |
| **0 AI tools.** No AI action tooling at Gate 1 | Not "a little AI to make the MVP look impressive" |
| **Legally gated features stay unimplemented**: customer stored value, microloans, unverified disaster alerts, blood dispatch, short-form feed | Extension points remain |
| No new dependency without stating what it replaces and its bundle cost | |
| No refactor outside the task's allowed files | |
| No "while I'm here" improvements | Record as an out-of-scope finding |

---

## 11. Definition of done

A task is **not** done because the code compiles. It is done when **all** of:

```
Implementation  +  Tests  +  Security  +  State validation
+  Audit  +  Error handling  +  Documentation  +  Acceptance criteria
```

are satisfied for its stated scope.

| Not done | Because |
|---|---|
| "It works" | No tests |
| "Tests pass" | No authorization policy |
| "Policy added" | No audit record |
| "Audit added" | The error path is unhandled |
| "Errors handled" | Empty and loading states missing (frontend) |
| "All states done" | An acceptance criterion is unmet |

---

## 12. Session opening

Every implementation session begins by re-establishing ground truth, because a document can be stale and the repository cannot:

1. `git status` · `git log --oneline -5` · current branch
2. `npm test` — **know the starting state before changing anything**
3. Read the task's named documents
4. Read the actual files to be touched
5. Confirm the dependencies are complete
6. State the plan
7. **Then** begin

Step 2 is the one that gets skipped and the one that matters: a pre-existing failure absorbed into a task's diff is a defect with no owner.
