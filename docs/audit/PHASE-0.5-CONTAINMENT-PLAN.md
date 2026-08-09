# IMAP — Phase 0.5 Containment Plan

**Created:** 2026-08-09 · **Branch:** `imap/phase-0.5-containment` · **Base commit:** `726cc87`
**Source:** `docs/audit/BASELINE-AUDIT.md` and the Phase 0 audit set.

This is a **containment plan**, not an architecture plan. Every change below is scoped to removing an audited P0/P1 risk. Nothing here redesigns the product, the UI, the AI layer, the database engine, or the framework.

---

## 0. THE TRUTHFULNESS PRINCIPLE (binding from this phase onward)

> **IMAP MUST NEVER CLAIM AN EXTERNAL ACTION WAS COMPLETED UNLESS THE SERVER HAS VERIFIED IT.**

This applies without exception to:

| Claim | May only be returned when |
|---|---|
| "SOS sent" / "dispatched" | A dispatch integration returned success |
| "Payment completed" | The payment gateway confirmed and the server recorded a verified transaction |
| "Provider contacted" | A delivery channel returned success |
| "Refund processed" | The gateway or ledger recorded the reversal |
| "Loan disbursed" | The disbursement transaction committed |
| "Donor notified" | A notification channel returned success |
| "Booking confirmed" | The booking row reached `confirmed` |

When the backing capability does not exist, the API and UI must state the **actual** state — e.g. *"Emergency request received. Dispatch integration unavailable."* — never a fabricated success.

The same rule forbids presenting **fabricated data** as verified real-world information: seeded disaster alerts, seeded blood donors, invented provider inventory, or invented user-specific financial facts.

---

## 1. P0 containment matrix

| ID | Vulnerability | Current Evidence | Risk | Containment | Files | Validation |
|---|---|---|---|---|---|---|
| **P0-1** | Null `password_hash` accepts any password | `auth.js:105-108` skips `bcrypt.compare` when the hash is null; `auth.js:56` sets it null for OTP/social signups | Full account takeover from a known phone/email. Provider accounts included → wallet access | Fail closed: password login requires a non-empty stored hash. Constant-time compare against a dummy hash so response timing does not reveal account shape. Return a generic error. | `backend/routes/auth.js` | Test: login with a null-hash account → 401 |
| **P0-2** | `/auth/social-login` issues a JWT for any known `socialId` | `auth.js:119-142` — no provider token verification | Full account takeover; Google `sub` is not a secret | **Disable the endpoint (fail closed).** Return 410 Gone. Google sign-in via `/auth/google` (which verifies the ID token and audience) remains the only social path. Remove the client-side fabricated Facebook flow. | `backend/routes/auth.js`, `frontend/src/pages/AuthPage.jsx` | Test: POST with a valid `socialId` → 410, no token |
| **P0-3** | Booking price is client-supplied | `bookings.js:38,46,60-70`; client sends it at `App.jsx:546` | Any booking at ৳1; provider earnings, revenue and reporting all attacker-controlled | Server computes `amount`, `platform_fee`, `total` from `providers.hourly_rate` → `categories.base_price`. Client values ignored entirely. **Fail closed (409)** when no server price can be resolved. | `backend/utils/pricing.js` (new), `backend/routes/bookings.js` | Test: send `amount:1` → stored amount equals server price |
| **P0-4** | Negative `platform_fee` inflates the wallet | `bookings.js:10-20` has no rule for it; `:46,49` | Unbounded wallet creation and unbounded provider payout | Fee is never read from the client (P0-3). Additionally a shared money validator rejects negative / `NaN` / `Infinity` / non-finite / over-cap values at every financial entry point. | `backend/utils/money.js` (new), all financial routes | Test: `platform_fee:-100000` → balance unchanged |
| **P0-5** | `completed` is repeatable; each call pays out | `bookings.js:197,229-249`; any party may set any status (`:188-195`) | N calls → N payouts and N `total_jobs` increments | Explicit server-side state machine with per-role allowed transitions. Transition applied as a conditional `UPDATE … WHERE status = <from>`; `affectedRows === 0` ⇒ 409 and **no** financial side effect. Terminal states are final. | `backend/utils/bookingState.js` (new), `backend/routes/bookings.js` | Test: complete twice → second returns 409, one payout |
| **P0-6** | Loan disbursement repeatable | `loans.js:226-277` — no prior-status guard | Duplicate credit up to ৳100,000 per repeat | Conditional transition `WHERE id = ? AND status <> 'disbursed'`; disbursement inside a transaction; ledger row carries a unique `ref_id` enforced by a DB unique index. Repeat returns the existing result. | `backend/routes/loans.js`, migration `002` | Test: disburse twice → one credit |
| **P0-7** | Socket `join_room` has no participant check | `server.js:77-81` | Read any booking's private chat and live GPS; inject false coordinates | Async authorization on `join_room`: load the booking, require `socket.user.id ∈ {customer, provider}` or role `admin`. Server tracks authorized rooms per socket; `location_update` and `booking_status` require prior authorized membership. | `backend/server.js`, `backend/utils/bookingAccess.js` (new) | Test: non-participant `join_room` → denied, no room membership |
| **P0-8** | SOS broadcast to every socket incl. guests | `sos.js:29-42` `io.emit` | Victim name, phone, GPS and emergency type disclosed to anyone connected | Emit to an `admins` room only. Admin membership verified against the database on connect, not from the JWT claim. | `backend/server.js`, `backend/routes/sos.js` | Test: non-admin socket receives no `sos_alert` |
| **P0-9** | Seeded production credentials + bypassable seed endpoint | `schema.sql:353-356` (`admin123`), `server.js:231` (`demo1234`), `server.js:189-202` | Full administrative compromise | Remove the admin seed from `schema.sql`. Delete `/api/admin/seed-demo`. Rewrite `resetAdmin.js` to require `ADMIN_BOOTSTRAP_PASSWORD` or generate a random one and print it once. Gate `seedDemo.js` to non-production. Migration neutralises any existing `admin-001` seeded hash. | `backend/schema.sql`, `backend/server.js`, `backend/scripts/resetAdmin.js`, `backend/scripts/seedDemo.js`, migration `002` | Manual: seeded hash no longer accepted; grep shows no literal passwords |
| **P0-10** | Fabricated emergency/blood/disaster behaviour | `disaster.js:24-31`, `blood.js:33-44,131-145`, `sos.js:44`, `App.jsx:3547-3562,3780-3789` | Users act on fabricated alerts, call fabricated donors, believe help was dispatched | Demo seeds gated to non-production and flagged `is_demo`; production reads exclude them. Blood requests persisted to a real table and answered truthfully. SOS response states the real dispatch state. Fabricated client-side `ALERTS`, `SHELTERS`, `DONORS` removed. | `backend/routes/{disaster,blood,sos}.js`, `frontend/src/App.jsx`, migration `002` | Test: `blood/request` response contains no "sent to donors" claim |
| **P0-11** | Zero database transactions | grep: no `beginTransaction` in `backend/` | Partial application of money paths; balance unreconcilable | `withTransaction()` helper. Applied to the six critical boundaries in §2 only — not the whole app. | `backend/db.js`, `bookings.js`, `payments.js`, `loans.js`, `users.js` | Test: forced mid-path failure leaves balance unchanged |
| **P0-12** | Unconfigured gateway ⇒ free wallet credit | `payments.js:65,78-94`; selected by env-var absence, not `NODE_ENV` | Unlimited free balance | In production an unconfigured gateway returns **503** and credits nothing. Mock settlement only when `NODE_ENV !== "production"`. | `backend/routes/payments.js`, `backend/utils/payment.js` | Test: production + unconfigured → 503, balance unchanged |

---

## 2. Transaction boundaries (P0-11 scope)

Only these operations are wrapped. Everything else is left as-is.

| Operation | Queries involved | Atomic boundary | Failure behaviour | Rollback |
|---|---|---|---|---|
| **Create booking** | balance debit → booking insert → wallet ledger insert → loyalty points update → loyalty log insert | All five | Any error ⇒ 500, no booking, no debit | Full rollback; notification/push moved outside the boundary (best-effort, post-commit) |
| **Complete booking** | conditional status transition → `total_jobs` increment → provider balance credit → provider ledger insert | All four | `affectedRows === 0` ⇒ 409 before any credit | Full rollback |
| **Cancel booking** | conditional status transition → customer balance credit → customer ledger insert | All three | `affectedRows === 0` ⇒ 409 before any refund | Full rollback |
| **Wallet credit from verified payment** | payment status CAS → balance credit → ledger insert (unique `ref_id`) | All three | Duplicate `ref_id` ⇒ already processed, no second credit | Full rollback |
| **Loan disbursement** | conditional status transition → balance credit → ledger insert (unique `ref_id`) | All three | `affectedRows === 0` ⇒ returns the existing disbursed record | Full rollback |
| **Wallet withdraw** | conditional balance debit → ledger insert | Both | Insufficient balance ⇒ 400 before any ledger row | Full rollback |

**Idempotency mechanism:** database-level, not in-process.
1. State transitions use conditional `UPDATE … WHERE status = <expected>` and check `affectedRows`. The row is the lock.
2. Ledger rows carry a deterministic `ref_id` (e.g. `booking:<id>:payout`, `loan:<id>:disburse`) protected by a `UNIQUE` index. A duplicate insert fails the transaction rather than double-crediting.

---

## 3. Schema changes (migration `002_phase05_containment.sql`)

A minimal migration runner is introduced because DB-level idempotency, the enum corrections, and neutralising the seeded credential all require versioned DDL. It is one table plus one script — not a migration framework.

| Change | Reason |
|---|---|
| `schema_migrations` table + runner | Replaces the swallowed runtime DDL for these specific changes (P1-18 partial) |
| `wallet_transactions.type` enum → add `topup`, `refund`, `payout`, `withdrawal` | P1-10 — `'topup'` inserts are currently rejected after the balance has already changed |
| `wallet_transactions.ref_id` `UNIQUE` index | Ledger-level idempotency (P0-5, P0-6, P0-12) |
| `kyc_docs.doc_type` enum → `nid, passport, birth_cert, driving_license` (+ existing values retained) | P1-9 — two of four accepted document types currently fail at insert |
| `push_subscriptions.user_id` `INT` → `VARCHAR(36)` | P1 — UUIDs coerce to 0, so push never delivers |
| `providers.is_approved TINYINT(1) DEFAULT 0`; existing rows set to 1 | P1-7 — new applicants are no longer publicly listed before review; existing providers grandfathered so the directory does not empty |
| `blood_donors.is_demo`, `disaster_reports.is_demo` | P0-10 — production reads exclude demo rows |
| `blood_requests` table | P0-10 — emergency requests must be persisted, not logged and discarded |
| Neutralise the seeded `admin-001` password hash | P0-9 — the hash and its plaintext are both published in the repository |
| `users.balance` default `500.00` → `0.00` | P0 §12 of the audit — free money at signup with no ledger entry |

---

## 4. P1 triage

Classification per brief §20. **Only the "FIX NOW" set is touched in this phase.**

### FIX NOW — security-critical and cheap, or directly enabling a P0

| ID | Issue | Rationale |
|---|---|---|
| P1-1 | Provider phone exposed on unauthenticated endpoints | Directly enables P0-1 (login by phone). Removing two `u.phone` selections. |
| P1-2 | Blood-donor phone + GPS exposed unauthenticated | Part of P0-10. Donor list requires auth, phone is masked, full contact moves to an explicit authorized endpoint. |
| P1-3 | Payment `/success` redirect performs crediting | Publicly POSTable. IPN becomes the sole crediting path; the redirect only redirects. |
| P1-4 | IPN has no amount reconciliation | 4-line check against the stored `payments.amount`. |
| P1-5 | Wallet debited at booking creation *and* charged via gateway | Mark the booking `paid` on wallet debit and refuse to re-charge a paid booking. |
| P1-8 | `providers` INSERT omits the primary key | Straight bug; provider onboarding is broken. |
| P1-9 | KYC `doc_type` enum mismatch | Migration `002`. |
| P1-10 | `wallet_transactions.type` enum mismatch | Migration `002` — currently loses ledger rows after a balance change. |
| P1-11 | Admin "suspend" writes `is_active = -1`, treated as active | Suspension does not work. Backend validates; frontend sends the correct value. |
| P1-12 (partial) | Admin KYC listing ships full base64 images | Stop selecting image columns in the list; add an explicit detail endpoint. Storage relocation deferred. |
| P1-15 | Phone/email changeable with no verification | Block identity-field changes on `PUT /users/profile`. |
| P1-16 | LLM proxy unauthenticated | Add `authMiddleware` to `/ai/chat` and `/ai/chat/stream`; key the limiter on the verified user. |
| P1-17 | Five env-var name mismatches | Includes the one that causes P0-12. Fix names in code and `.env.example`; read `SSL_IS_SANDBOX`. |
| — | Push subscription `user_id` type | Push silently never delivers; migration `002`. |
| — | Client-side fake payment OTP | Production-dangerous mock under brief §21 — claims payment verification. |

### BLOCKS PHASE 1 — must be resolved before architecture work, not in this phase

| ID | Issue | Why deferred |
|---|---|---|
| P1-14 | In-process OTP store and cache | Requires Redis. Infrastructure decision belongs to Phase 1. |
| P1-18 | Runtime DDL in 9 modules | Migration runner introduced here covers only the containment changes; full removal is a Phase 1 task. |
| P1-12 (full) | KYC images as base64 in the primary DB | Requires the storage decision and a data migration. |

### ARCHITECTURE REWRITE REQUIRED

| ID | Issue |
|---|---|
| P1-6 | Full booking state machine with role-specific workflows (a minimal safe subset is implemented here) |
| P1-7 (full) | Provider verification lifecycle (a minimal `is_approved` gate is implemented here) |
| P1-13 | Content Security Policy — enabling it needs an inline-style and third-party-script audit; a wrong CSP breaks the app |

### LOW-RISK TEMPORARY — accepted for this phase

| ID | Issue | Accepted because |
|---|---|---|
| P2 set | Body-size limit, unpaginated lists, `Math.random()` ids, raw error messages in AI routes, JWT `jti` | No direct account, money, or safety loss; several are addressed incidentally |
| HOTLINES constant | `App.jsx:3557` national emergency numbers (999, 10941, 16321) | Public reference data, not fabricated user data. Removing emergency numbers carries its own risk. Flagged as unverified in the regression report. |

---

## 5. Mock / demo classification (brief §21)

| Mock | Class | Action |
|---|---|---|
| Seeded admin `admin123` | **PRODUCTION-DANGEROUS** (authenticates users) | Removed + neutralised in DB |
| Seeded providers `demo1234` | **PRODUCTION-DANGEROUS** (authenticates users, fabricates providers) | Seeder gated to non-production; endpoint deleted |
| `/api/admin/seed-demo` | **PRODUCTION-DANGEROUS** | Deleted |
| Payment mock settlement | **PRODUCTION-DANGEROUS** (creates money) | Non-production only; 503 in production |
| Self-service wallet top-up | **PRODUCTION-DANGEROUS** (creates money) | Already gated on gateway config; additionally gated on `NODE_ENV` |
| Seeded blood donors | **PRODUCTION-DANGEROUS** (fabricates donors, exposes PII) | Non-production only + `is_demo` filter |
| Seeded disaster alerts | **PRODUCTION-DANGEROUS** (fabricates emergency info) | Non-production only + `is_demo` filter |
| Client `DONORS`, `ALERTS`, `SHELTERS` arrays | **PRODUCTION-DANGEROUS** | Removed |
| Client fake payment OTP | **PRODUCTION-DANGEROUS** (claims payment success) | Removed |
| Client fabricated Facebook social login | **PRODUCTION-DANGEROUS** (authenticates users) | Removed |
| AI keyword fallback asserting credit score / inventory / refund policy | **PRODUCTION-DANGEROUS** (fabricates user-specific financial facts) | Rewritten to acknowledge uncertainty |
| Seeded promo `used_count` | Production-safe *(cosmetic)* | Left; noted as remaining risk |
| Client `PROVIDERS`/`MY_BOOKINGS`/`NOTIFS_DATA`/`TRANSACTIONS`/`COUPONS` fallbacks | Production-**misleading**, not dangerous | Left for Phase 1 UX work; noted as remaining risk |
| Mock SMS provider | Development-only | Already gated (`auth.js:156` correctly hides the OTP in production) |

---

## 6. Out of scope for this phase (explicitly)

Framework changes · database engine migration · frontend rewrite · UI redesign · AI architecture · recommendation engine · service graph · new marketplace features · microservices · Redis · full test suite · CSP · observability stack · removing all remaining mock data.

---

## 7. Execution order

1. Migration runner + migration `002` *(unblocks the enum and idempotency work)*
2. Shared safety utilities: `money.js`, `pricing.js`, `bookingState.js`, `bookingAccess.js`, `withTransaction`
3. Authentication (P0-1, P0-2) and credentials (P0-9)
4. Financial authority (P0-3, P0-4), booking state + transactions (P0-5, P0-11)
5. Loans (P0-6), payments (P0-12, P1-3/4/5)
6. Realtime (P0-7, P0-8)
7. Emergency truthfulness (P0-10)
8. FIX-NOW P1 set
9. Minimal P0 regression tests
10. Validation + `PHASE-0.5-SECURITY-REGRESSION.md`
