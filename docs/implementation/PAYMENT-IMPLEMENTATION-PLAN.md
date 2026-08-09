# IMAP 2.0 — Payment Implementation Plan (Gate 1)

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Governed by:** `FINANCIAL-ARCHITECTURE.md` · `LEDGER-IMPLEMENTATION-PLAN.md` · `STATE-MACHINE-IMPLEMENTATION-PLAN.md` §3

---

## 1. What survives from the current implementation

`backend/routes/payments.js` (325 L) and `utils/payment.js` (67 L) were rewritten in Phase 0.5. Assessed line by line:

| Behaviour | Verdict | Why |
|---|---|---|
| **IPN is the only crediting path** | **KEEP — foundational** | Redirect endpoints are public and unauthenticated |
| **Server-to-server validation before any state change** | **KEEP** | Callback content is not evidence |
| **Amount reconciliation; mismatch refuses** | **KEEP** | Never auto-adjust |
| **Unconfigured gateway in production ⇒ 503** | **KEEP** | P0-12 — an unconfigured gateway used to credit wallets for free |
| **Single-credit path**: guarded CAS on payment status + unique ledger ref | **KEEP — becomes the ledger primitive** | P0-5/P0-6 |
| `withTransaction` around crediting | **KEEP** | P0-11 |
| Deterministic `ref_id` (`booking:<id>:<kind>`) | **KEEP — becomes `ledger_transaction.reference`** | |
| Bounded money parsing at every entry | **KEEP → value object** | P0-4 |
| **Wallet crediting as the settlement destination** | **REPLACE** | D-010 — no customer stored value |
| `wallet_transactions` as the record | **REPLACE** | Cannot reconstruct a balance |
| No timeouts on gateway calls | **FIX** | An unbounded call holds a request thread |
| No refund path | **ADD** | R-608 |
| No payout path | **ADD** | R-904 |
| Cash settlement not modelled | **ADD** | R-606, O-02 |

**The Phase 0.5 payment code is closer to correct than any other money code in the repository.** The change is not its logic; it is where settlement lands — a double-entry ledger instead of a mutable balance column.

### 1.1 Financial history is preserved

| Data | Treatment |
|---|---|
| `payments` rows | Migrated to `payment` (M-29). **Nothing discarded** |
| `wallet_transactions` with a resolvable counterparty | Migrated to ledger transactions (M-24) |
| `wallet_transactions` without one | **Retained read-only**; absorbed into the opening balance as one stated number (M-25) |
| `bookings.payment_status` | Becomes a read model derived from `payment` (O-02) |
| Gateway references | Carried onto `payment.gateway_ref` — the link to the gateway's own record survives |

**No financial row is deleted at Gate 1.** The legacy tables go read-only and are dropped a full release cycle later, after 30 days of proven non-use (M-33).

---

## 2. Flow

```
quote ──► booking ──► payment ──► gateway ──► IPN ──► capture posting
                                                        │
                                       booking.completed│
                                                        ▼
                                          allocate: provider_payable
                                                    + commission_revenue
                                                        │
                                                        ▼
                                            payout_claim → payout
```

### 2.1 Quote — where P0-3 dies

`POST /quotes` takes `{service_id, provider_id, window}` and **no amount**. The server resolves the price (`provider_price` → `service` default → **fail closed 409**), itemises it into `quote_component`, sets `expires_at`, and returns a `quote_id`.

`POST /bookings` takes `{quote_id, address, note}`. **There is no field in which a client can send a price.** `booking.quote_id` is `NOT NULL`.

Fail-closed price resolution is already the Phase 0.5 behaviour in `utils/pricing.js`; the change is that it now issues an immutable quote instead of computing at booking time.

### 2.2 Initiation

`POST /payments {booking_id}` · `Idempotency-Key` **required**.

```
1. authorize payment.initiate — the booking's customer
2. load the FROZEN quote — never recompute
3. if gateway unconfigured AND isProduction() → 503        ← P0-12
4. create payment (state=initiated) + payment_attempt
5. gateway session, 10 s timeout
6. return the redirect URL
```

Step 3 uses `env.isProduction()` (Phase 2.75), which considers the **database**, not only `NODE_ENV`. A development process pointed at production data cannot reach mock settlement.

Step 5's timeout does not exist today. A gateway that stops responding currently holds request threads until the platform's own timeout — the first symptom is the whole API slowing down.

### 2.3 Settlement — the only crediting path

`POST /webhooks/payment/ipn`

```
1. verify the gateway signature
2. server-to-server validation (independent of the callback body)   ← evidence
3. reconcile the amount against payment.amount_minor
   ├─ mismatch → refuse, alert, NO ledger movement, audit outcome=failed
   └─ match    → continue
4. BEGIN
     UPDATE payment SET state='captured' WHERE id=? AND state='initiated'
     if affectedRows = 0 → already captured; return the prior result   ← idempotent
     postTransaction(booking:<id>:capture)
     writeAudit(...)
     outbox: payment.captured
   COMMIT
5. 200 to the gateway
```

Four independent mechanisms make double-crediting impossible: gateway-side idempotency, the guarded CAS on payment state, the unique ledger `reference`, and the consumer handled-marker. Any one would suffice.

**A timeout is not a failure.** The payment stays `initiated`; the reconciliation job resolves it against the gateway. Marking it failed on timeout is how a customer who paid ends up unpaid.

### 2.4 Allocation on completion

`booking.completed` → finance consumer → `booking:<id>:allocate`:

```
DR booking_clearing   88000
CR provider_payable   80000
CR commission_revenue  8000
```

Allocation happens on **completion**, not capture. Between capture and completion the money sits in `booking_clearing` — a platform holding account, not customer stored value (AD-023). A cancellation in that window refunds without ever having recognised revenue.

### 2.5 Cash on completion

Cash never enters the gateway machine. At completion:

* a `payment` row with `method = cash`, `state = captured` — **so Booking has one payment concept to derive from** (O-02);
* commission accrues as a **provider debit**: `DR provider_receivable / CR commission_revenue`;
* netting against the provider's next payout.

Three operational requirements, from `FINANCIAL-ARCHITECTURE.md` §4.2, that are product decisions rather than code:

1. an accrued-debt cap per provider — exceeding it pauses new **cash** bookings, not the listing;
2. a settlement path for providers who only ever take cash;
3. the provider's earnings surface shows accrued commission explicitly (R-904) — **never an unexplained deduction**.

### 2.6 Refund

Two transactions (`LEDGER-IMPLEMENTATION-PLAN.md` §5): recognition on approval, settlement on gateway confirmation. **Refunds go to the original payment method** (D-010) — never to a balance.

Approval requires a reason and is audited. Execution is a job with a deterministic effect token; a timeout leaves `refund_pending` and reconciles.

### 2.7 Payout

Accrual on completion → clearance (elapsed **and** no open dispute) → provider requests → execute. `processing` means *transfer submitted* at Gate 1; `payout_batch` is deferred (S-10).

Clearance **re-reads dispute state at execution time** rather than trusting the claim's flag (O-03).

---

## 3. Gateway adapter

```
modules/finance/
├── domain/ports/PaymentGateway.js      interface
└── infrastructure/adapters/
    ├── sslcommerz.js                   the only Gate-1 implementation
    └── unconfigured.js                 throws GatewayUnavailable — never settles
```

| Method | Timeout | Retry |
|---|---|---|
| `createSession` | 10 s | none — the user is waiting |
| `validate(val_id)` | 15 s | 3, exponential — must succeed before crediting |
| `refund` | 30 s | job-driven, bounded, effect-token guarded |
| `queryStatus` | 15 s | reconciliation job |

`unconfigured.js` is the adapter selected when credentials are absent. It **throws**, and the route maps that to `503`. There is no mock adapter in the production dependency graph — a mock reachable in production is how P0-12 happened.

---

## 4. Reconciliation

| Job | Cadence | Action |
|---|---|---|
| `payment.reconcile` | hourly | `initiated` payments older than 30 min → query the gateway → resolve |
| `ledger.reconcile` | nightly | Recompute every projection from entries; **alert on divergence, never auto-correct** |
| `gateway.settlement` | daily | Compare the gateway's settled list with local `captured` payments; **report both directions** |

The third catches the case a restore would create (`BACKUP-RECOVERY.md` §3.2 step 9): a payment the gateway shows as settled with no local record. **The gateway is the authority for that window**, and reconciling it is how a customer who paid does not end up unpaid.

---

## 5. Security

| Control | Rule |
|---|---|
| Client authority | **None.** A request carries a `quote_id`, never an amount |
| Validation | Every money input parsed as a bounded non-negative integer; `NaN`, `Infinity`, negatives, over-cap rejected at the boundary |
| Authorization | Every financial use case declares a policy; separation of duties is written now, granted broadly at Gate 1, counted when bypassed (`AUTHORIZATION-IMPLEMENTATION-PLAN.md` §6) |
| Audit | Every financial operation, in the same transaction (AD-009) |
| Rate limiting | Payment initiation limited **per principal**, independently of the general limiter |
| Secrets | Gateway credentials from the secret store; never logged; never in an error body |
| Webhook | Signature verified **and** server-to-server validated. Signature alone is not evidence |
| AI | Tier B may prepare a proposal; **never commits**. Moving platform funds is Tier C — no tool exists |

---

## 6. Build order

| # | Step | Exit criterion |
|---|---|---|
| **P-1** | Money value object + quote issuance | no endpoint accepts an amount |
| **P-2** | `PaymentGateway` port + SSLCommerz adapter with timeouts | timeouts asserted |
| **P-3** | Initiation + fail-closed 503 | unconfigured gateway in production returns 503, never settles |
| **P-4** | IPN: signature, validation, reconciliation, capture posting | duplicate callback credits once; concurrent callbacks credit once |
| **P-5** | Allocation on `booking.completed` | flows balance; `booking_clearing` returns to zero |
| **P-6** | Cash settlement | every completed cash booking has a `payment` row |
| **P-7** | Refund — recognition then settlement | ordering asserted; both references unique |
| **P-8** | Payout claims, clearance, execution | disputed claim cannot be paid |
| **P-9** | Reconciliation jobs | divergence alerts, never auto-corrects |
| **P-10** | Provider earnings surface | gross, commission, net, payout state (R-904) |

---

## 7. Tests

| # | Test | Consequence of failure |
|---|---|---|
| 1 | Client-supplied amount ignored at every endpoint | P0-3 returns — a customer sets their own price |
| 2 | Expired quote refused | Stale prices honoured |
| 3 | Unconfigured gateway in production ⇒ 503, no settlement | P0-12 — free money |
| 4 | Duplicate IPN credits once | P0-5 — double credit |
| 5 | **Two concurrent IPNs credit once** | Double credit under load |
| 6 | Amount mismatch refuses, no ledger movement | Underpayment accepted as full |
| 7 | Redirect endpoint cannot settle | Anyone with a URL settles a payment |
| 8 | Timeout leaves `initiated`, never `failed` | A paying customer marked unpaid |
| 9 | Refund recognition precedes settlement | V-04 |
| 10 | Refund exceeding captured amount refused | Over-refund |
| 11 | Cash completion creates a `payment` row | O-02 — two authorities for payment status |
| 12 | Disputed claim cannot be paid out | Disputed funds leave the platform |
| 13 | Clearance re-reads dispute state at execution | O-03 race |
| 14 | Every financial action writes an audit row in the same transaction | Unreconstructable money movement |
| 15 | `PLATFORM_FEE_PCT=0` yields no commission entries | Phantom zero-amount rows |

Tests 5, 8 and 13 are the ones that only fail under conditions a manual test will not reproduce, and they are the ones worth the integration harness.

---

## 8. Not built at Gate 1

Card storage (the gateway holds it) · multi-gateway routing · instant payouts · chargebacks · promotional credit · installments · **customer wallet — D-010** · **VAT/tax computation — legal review outstanding, not assumed**.
