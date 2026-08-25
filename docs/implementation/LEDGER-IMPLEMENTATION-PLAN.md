# IMAP 2.0 — Ledger Implementation Plan

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Governed by:** `FINANCIAL-ARCHITECTURE.md` (incl. Phase 2.75 amendments A1–A4) · AD-007, AD-008, AD-010, AD-023

The ledger is built **third** — after audit and identity, before anything that depends on money. It is the hardest correctness problem in the system and the one thing that cannot be convincingly added later, because the ledger *is* the financial history.

---

## 1. Invariants

These are asserted in code, in the database where possible, and in tests. Violating one is a build failure, not a bug report.

| # | Invariant | Enforced by |
|---|---|---|
| **L1** | Every posted transaction balances: Σ debits = Σ credits, **per transaction**, in one currency | Domain check before write; integration test on all 8 flows |
| **L2** | No posted ledger entry is ever mutated | No `UPDATE`/`DELETE` repository method exists; DB grant restricted; test asserts absence |
| **L3** | Every financial command is idempotent | Deterministic `reference` under a UNIQUE index + guarded state transition + `Idempotency-Key` |
| **L4** | Every derived balance is reconcilable from entries alone | Nightly recompute; divergence alerts; projection is never a write target |
| **L5** | `amount_minor > 0`; direction carries the sign | Column check + domain value object |
| **L6** | The client never supplies an amount | Every money endpoint takes a `quote_id` or a server-resolved reference |
| **L7** | A transaction, its audit record and its outbox event commit together or not at all | One `withTransaction` scope |
| **L8** | `customer_liability` is never issued | No use case constructs it; startup assertion; test |

**L8 needs saying out loud.** `customer_liability` exists in the taxonomy so that a licensed stored-value product is later a data change rather than a redesign (AD-019). At Gate 1 it must have zero entries, and a test asserts that after the full flow suite. It must never be merged with `booking_clearing` (AD-023) — merging them means issuing customer stored value on every booking payment, which is exactly what D-010 withdraws pending legal review.

---

## 2. Build order

Each step is independently testable and leaves the system deployable.

| # | Step | Delivers | Exit criterion |
|---|---|---|---|
| **L-1** | Money value object | `shared/money.js` — minor units, currency, arithmetic that cannot silently mix currencies | Phase 0.5 `p0-money.test.js` ported and extended; no float in any money path |
| **L-2** | Accounts | `ledger_account` + the 10 kinds + resolution (`accountFor(owner, kind, currency)`) | all 10 exist; `customer_liability` is unreachable from any use case |
| **L-3** | Transactions and entries | `postTransaction(reference, kind, entries[])` — the **only** write path | L1, L2, L5 enforced; unbalanced input throws before any write |
| **L-4** | Idempotency | Deterministic references; unique-violation returns the prior transaction | replay posts once; concurrent replay posts once |
| **L-5** | Balance projection | Updated in the same transaction; `rebuildBalance(account)` from entries | L4; rebuild equals stored for every account |
| **L-6** | Reconciliation | Nightly job recomputing every projection | divergence produces an alert, never a silent correction |
| **L-7** | Commission | `commission_accrual` + digital and cash settlement modes | `PLATFORM_FEE_PCT=0` yields zero entries, not zero-amount entries |
| **L-8** | Provider earnings | `payout_claim`, accrual on completion, clearance | `GetEarnings` returns gross, commission, net, payout state (R-904) |
| **L-9** | Payment settlement | Capture → allocation on `booking.completed` | duplicate callback credits once; concurrent callbacks credit once |
| **L-10** | Refund | Two-transaction model (§5) | recognition precedes settlement; both references unique |
| **L-11** | Audit integration | Every financial action writes its audit record in the same transaction | no financial state change without an audit row |

**L-3 before L-9 is the point.** The posting primitive is built and proven against all eight worked flows before any gateway callback can reach it. Building settlement first and the ledger underneath it is how a system ends up with two ways to move money.

---

## 3. The single write path

```js
// modules/finance/domain/ledger.js  — pure, no I/O
function buildTransaction({ reference, kind, entries, currency }) {
  assert(entries.length >= 2);
  assert(entries.every(e => e.amountMinor > 0));         // L5
  assert(entries.every(e => e.currency === currency));   // L1
  const debits  = sum(entries.filter(e => e.direction === 'debit'));
  const credits = sum(entries.filter(e => e.direction === 'credit'));
  assert(debits === credits, 'unbalanced transaction');  // L1
  return { reference, kind, entries, currency };
}
```

```js
// modules/finance/infrastructure/repositories/ledger.js
async function postTransaction(conn, tx) {          // conn is REQUIRED
  try {
    const id = await insertTransaction(conn, tx);   // UNIQUE(reference)
    await insertEntries(conn, id, tx.entries);
    await applyProjections(conn, tx.entries);       // same transaction — L4
    return { id, posted: true };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {              // L3
      return { id: await findByReference(conn, tx.reference), posted: false };
    }
    throw err;
  }
}
```

Three properties, deliberate:

* **`conn` is required.** There is no way to post outside a caller's transaction, so L7 holds by construction rather than by remembering.
* **Duplicate reference is not an error.** It returns the original transaction and `posted: false`. Idempotency is the normal path, not the exception path.
* **The projection updates inside the same transaction.** A projection updated afterwards can diverge in the window between; that window is precisely how `users.balance` became unreconcilable.

### Reference vocabulary

Deterministic, derived only from domain identity — never from a request id, a timestamp or a retry count.

| Operation | Reference |
|---|---|
| Payment captured | `booking:<id>:capture` |
| Booking allocation | `booking:<id>:allocate` |
| Commission accrual | `booking:<id>:commission` |
| Cash settlement | `booking:<id>:cash` |
| Payout | `payout:<claim_id>:execute` |
| Payout reversal | `payout:<claim_id>:reverse` |
| Refund recognition | `booking:<id>:refund:<seq>:recognition` |
| Refund settlement | `booking:<id>:refund:<seq>:settlement` |
| Dispute hold / release | `dispute:<id>:hold` / `dispute:<id>:release` |
| Opening balance | `opening:<account_id>` |

---

## 4. Chart of accounts

| Kind | Owner | Normal | Purpose |
|---|---|---|---|
| `customer_receivable` | account | debit | Owed by a customer (unpaid cash booking) |
| **`booking_clearing`** | platform | **credit** | Captured for a specific booking, not yet allocated (AD-023) |
| `gateway_clearing` | platform | debit | With the gateway, not yet settled |
| `platform_cash` | platform | debit | Settled platform funds |
| `provider_payable` | account | credit | **Earnings owed to a provider** — what `users.balance` becomes |
| `provider_receivable` | account | debit | Commission owed *by* a provider on a cash booking |
| `commission_revenue` | platform | credit | Platform revenue (D-009) |
| `refund_liability` | platform | credit | Refunds recognised, not yet executed |
| `promotional_expense` | platform | debit | Platform-funded discounts |
| `customer_liability` | — | credit | **Defined, non-issuable** (AD-019, D-010) |
| `platform_opening_equity` | platform | credit | **Migration only** — the counterparty for opening balances |

`platform_opening_equity` is added by this plan and used by exactly one migration (M-25). It makes the migrated position visible as a single number rather than hidden inside operational accounts — which is what the person signing off on it needs to see.

---

## 5. Worked flows, as implemented

**Digital booking, 800.00 service, 10% commission** (amounts in minor units):

```
capture      DR gateway_clearing    88000    ref booking:B:capture
             CR booking_clearing    88000
allocate     DR booking_clearing    88000    ref booking:B:allocate   ← on booking.completed
             CR provider_payable    80000
             CR commission_revenue   8000
settle       DR platform_cash       88000    ref booking:B:settle
             CR gateway_clearing    88000
payout       DR provider_payable    80000    ref payout:C:execute
             CR platform_cash       80000
```

**Cash on completion:**

```
accrue       DR provider_receivable  8000    ref booking:B:commission
             CR commission_revenue   8000
cash record  (payment row, method=cash, state=captured — O-02; no ledger movement)
netting      DR provider_payable     8000    ref payout:C:net
             CR provider_receivable  8000
```

**Refund — two transactions, recognition first** (V-04 correction):

```
1. approve   DR provider_payable    36000    ref booking:B:refund:1:recognition
             DR commission_revenue   4000
             CR refund_liability    40000
2. execute   DR refund_liability    40000    ref booking:B:refund:1:settlement
             CR gateway_clearing    40000
```

Two references, because approval and execution happen at different times and fail independently. **A refund approved but not yet executed is a real, reportable liability**, and with one reference it was invisible.

**Dispute hold.** No ledger movement — the hold is a `payout_claim` state change (`held`) plus an audit record. Money that has not moved is not a ledger event.

---

## 6. Where the ledger is called from

| Trigger | Use case | Transaction |
|---|---|---|
| Gateway IPN validated | `RecordGatewayCallback` | payment state → captured · capture posting · audit · outbox `payment.captured` |
| `booking.completed` consumed | `AccrueEarnings` | allocate posting · `payout_claim` created · commission accrual · audit |
| `booking.cancelled` consumed | `ApproveRefund` | refund recognition · audit · outbox |
| Refund executed by gateway | `ExecuteRefund` | refund settlement · payment state · audit |
| `booking.disputed` consumed | `HoldFunds` | claim → `held` · audit (**no posting**) |
| `dispute.resolved` consumed | `ReleaseFunds` | claim → payable or reversed · posting if reversed |
| Clearance job | `MarkPayable` | claim → payable (**no posting**) |
| Admin executes payout | `ExecutePayout` | payout posting · claim → paid_out · audit |
| Completion of a cash booking | `SettleCashPayment` | payment row · commission accrual · audit |

**Every entry point is an event consumer or a named command. There is no `POST /ledger`.**

---

## 7. Migration interface

`DATABASE-IMPLEMENTATION-PLAN.md` M-23…M-26. Three rules the code must support:

1. **Opening transactions use `kind = 'opening'` and reference `opening:<account_id>`.** They are ordinary ledger transactions and obey L1 — no special-cased path that skips balancing.
2. **`users.balance` is read-only for a full release cycle** and reconciled daily against the derived projection. A divergence stops the cutover.
3. **The unresolvable portion is one number, stated once**, posted against `platform_opening_equity` — not distributed across accounts to make the arithmetic look tidier.

**M-25 is blocked on a business decision** about the free 500.00 signup credit (`DATABASE-IMPLEMENTATION-PLAN.md` §7). Engineering computes the number; it does not choose the treatment.

---

## 8. Tests, before implementation

| # | Test | Layer | Fails if |
|---|---|---|---|
| 1 | Unbalanced input throws before any write | unit | a partial transaction can exist |
| 2 | All 8 worked flows balance | integration | any flow is mis-specified |
| 3 | Duplicate reference posts once | integration | double payout returns (P0-5) |
| 4 | **Two concurrent identical postings: one wins** | integration | the unique index is not the guard we think it is |
| 5 | No `UPDATE`/`DELETE` path on `ledger_entry` | unit + grant | L2 |
| 6 | Derived balance equals stored, after every operation | integration | L4 |
| 7 | Rebuild from entries reproduces the projection exactly | integration | the projection has become authoritative |
| 8 | Negative, NaN, Infinity, string, object, over-cap amounts rejected | unit | P0-4 returns |
| 9 | Client-supplied amount ignored at every money endpoint | contract | P0-3 returns |
| 10 | `PLATFORM_FEE_PCT=0` produces **no** commission entries | unit | zero-amount rows pollute the ledger |
| 11 | `customer_liability` has zero entries after the full suite | integration | L8 — stored value has been silently issued |
| 12 | Refund recognition precedes settlement | integration | V-04 returns |
| 13 | Currency mixing throws | unit | L1 |
| 14 | A financial state change with no audit row fails the transaction | integration | L7 |

Tests 4, 11 and 14 are the ones most likely to be skipped and the ones worth most. Test 11 in particular is the only automated check that a legally gated capability has not been quietly enabled.

---

## 9. What is not built at Gate 1

| Deferred | Why |
|---|---|
| `payout_batch` | S-10 — a claim carries its own state; batching is a query until volume needs it |
| Multi-currency settlement | BDT only; the model carries currency so it is not blocked (I-01) |
| Instant payouts | Requires working capital and a fraud model |
| Tax / VAT computation | **Legal review outstanding** — not assumed |
| Chargeback handling | Needs a defined process before card volume grows |
| Promotional credit | Same legal review as D-010 |
| Provider invoicing | R-909, FUTURE |
| Customer stored value | **D-011/D-010 — the account kind exists and is non-issuable** |

---

## 10. The reason this ordering matters

Phase 0 found a mutable `balance` column, a best-effort transaction log that could not reconstruct it, and money paths that were sequences of independent autocommit statements. Phase 0.5 contained the immediate bleeding — transactions, bounded amounts, deterministic references under a unique index.

None of that produced a ledger. It produced a safer version of the wrong model.

Building L-1 through L-6 before any payment code runs against them is what converts the containment into a design. The alternative — settlement first, ledger underneath later — is how a system acquires two ways to move money and no way to prove which one was right.
