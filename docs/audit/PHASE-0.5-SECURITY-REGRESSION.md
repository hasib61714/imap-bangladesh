# IMAP — Phase 0.5 Security Regression Report

**Date:** 2026-08-09 · **Branch:** `imap/phase-0.5-containment` · **Base:** `726cc87`
**Plan:** [`PHASE-0.5-CONTAINMENT-PLAN.md`](PHASE-0.5-CONTAINMENT-PLAN.md) · **Findings:** [`SECURITY-GAPS.md`](SECURITY-GAPS.md)

## Validation performed

| Check | Command | Result |
|---|---|---|
| P0 regression suite | `cd backend && npm test` | **31 passed / 0 failed** |
| Backend syntax | `node --check` on all backend `.js` (49 files) | **PASS** |
| Frontend build | `npx vite build` (to a scratch dir; repo `dist/` untouched) | **PASS** — 3,100 modules, 9.58 s |
| Migration applied against a live database | — | **NOT RUN** — no database credentials in this environment |
| Backend runtime start | — | **NOT RUN** — requires a live TiDB connection |

**Negative-control verification.** The suite was proved non-vacuous by re-introducing two original vulnerabilities and confirming the tests fail:

| Vulnerability re-introduced | Result |
|---|---|
| `auth.js` — skip `bcrypt.compare` when `password_hash` is NULL | 2 tests failed, then passed again after restoring the fix |
| `bookings.js` — unconditional status write, no state machine | 2 tests failed, then passed again after restoring the fix |

---

## P0 results

| # | Issue | Fixed | Test | Evidence | Remaining risk |
|---|---|---|---|---|---|
| **P0-1** | Null `password_hash` accepts any password | ✅ | `P0-1: login with a NULL password_hash is rejected` · `…does not leak that the account exists` · `…a correct password still logs in` | `routes/auth.js` — password login now requires a stored hash; a constant-time compare against a dummy hash keeps "no account", "no credential" and "wrong password" indistinguishable | Existing OTP/social users still cannot set a password — there is no password-reset flow. They sign in via OTP or Google, which works. **A reset flow is required before Phase 1.** |
| **P0-2** | `/auth/social-login` issues a JWT for any known `socialId` | ✅ | `P0-2: social-login cannot mint a session…` · `P0-2: register cannot bind a social identity chosen by the client` | Endpoint returns **410 Gone**; `register` no longer accepts `socialId`/`loginMethod`; `/auth/google` now requires `email_verified` before matching an existing account by email | **Facebook sign-in is disabled**, not fixed — it was never a real OAuth flow. Restoring it needs a server-side token exchange. Google sign-in is unaffected. |
| **P0-3** | Client-supplied booking price | ✅ | `P0-3: a client-supplied amount is ignored…` · `…fails closed when the server cannot determine a price` · `…an unapproved or unavailable provider cannot be booked` | New `utils/pricing.js`; `routes/bookings.js` no longer reads `amount`/`total_amount`/`platform_fee` from the body at all. Resolution order: `providers.hourly_rate` → `categories.base_price` → **409** | A provider with no rate and a category with no `base_price` cannot be booked. That is the intended fail-closed behaviour, but it will surface as booking failures on incomplete data. |
| **P0-4** | Negative `platform_fee` inflates the wallet | ✅ | `P0-4: a negative platform_fee cannot inflate the wallet` · `P0-4: the money validator rejects every unsafe numeric input` (16 hostile inputs) | New `utils/money.js` rejects negative, `NaN`, `Infinity`, `"1e999"`, `[]`, `{}`, booleans and over-cap values; applied to bookings, withdraw, top-up, loans, provider rates | No `CHECK (balance >= 0)` at the database level — application validation is the only guard. Deferred deliberately (TiDB CHECK support varies). |
| **P0-5** | `completed` repeatable, paying out each time | ✅ | `P0-5: the state machine forbids re-completing…` · `…already-completed booking pays out nothing` · `…a lost race pays out nothing` · `…a legitimate first completion pays out exactly once` | New `utils/bookingState.js` (explicit per-role transition table); conditional `UPDATE … WHERE status = ?` with `affectedRows` checked; ledger row keyed `booking:<id>:payout` under a unique index | The state machine is minimal by design. Richer workflow (disputes, partial completion, provider no-show) is Phase 1. |
| **P0-6** | Loan disbursement not idempotent | ✅ | `P0-6: disbursing an already-disbursed loan credits nothing` · `…illegal transition refused` · `…lost race credits nothing` · `…first disbursement credits exactly once` | `routes/loans.js` — loan transition table, `SELECT … FOR UPDATE`, guarded UPDATE, ledger ref `loan:<id>:disburse` | No repayment schedule or instalment tracking exists. Unchanged from the audit; out of scope. |
| **P0-7** | Socket room join has no authorization | ✅ | `P0-7: a non-participant cannot join…` · `…a participant can join, and only that booking` · `…a guest socket cannot join anything` · `…location_update from an unauthorized socket is dropped` · `…only the assigned provider may publish a location` | Socket handlers extracted to `realtime.js`; `join_room` now verifies participation via `utils/bookingAccess.js`; `socket.authorizedBookings` gates `typing`, `location_update` and `booking_status` | Booking-room membership is per-connection; a booking that changes provider mid-session keeps the old socket's authorization until it rejoins. Low impact, noted for Phase 1. |
| **P0-8** | SOS broadcast to every socket | ✅ | `P0-8: only a DB-verified admin joins the admin room` · `P0-8: an SOS alert goes to the admin room, never to all sockets` | `io.emit` → `io.to("role:admin")`; admin membership is re-read from the database on connect, not taken from the JWT claim | If no admin is connected, the alert is stored but nobody is paged. The API response now says so explicitly rather than implying dispatch. |
| **P0-9** | Seeded production credentials + bypassable seed endpoint | ✅ | Not unit-tested (no assertable runtime behaviour) — verified by inspection and a repo-wide credential sweep | Admin seed removed from `schema.sql`; `GET /api/admin/seed-demo` deleted; `scripts/resetAdmin.js` rewritten to require `ADMIN_BOOTSTRAP_*` or generate a password once; `seedDemo.js` refuses `NODE_ENV=production` and reads `DEMO_SEED_PASSWORD`; **a hidden "tap the logo 3×" admin quick-login that called `login("01700000000","admin123")` from the shipped JS bundle was also removed**; migration `002` nulls the seeded hashes | **Requires operator action.** Migration `002` disables the old credentials but does not create a replacement. `npm run admin:reset` must be run, or nobody can sign in as an administrator. The old `admin123` must be considered compromised wherever that database has ever run. |
| **P0-10** | Fabricated emergency / blood / disaster behaviour | ✅ | `P0-8` test also asserts the SOS response makes no call-centre claim | Seeds gated to non-production and flagged `is_demo`; production reads filter them out; `blood_requests` table added so requests are persisted; SOS, blood and disaster responses now describe the real state; client-side `ALERTS`, `SHELTERS`, `DONORS` arrays deleted; donor list requires auth and masks phone numbers behind an explicit `POST /blood/:id/contact`; the "Request sent to donors" banner now reports `donors_notified: 0` | **No dispatch capability was built** — the claims were made truthful, not fulfilled. `HOTLINES` (999, 10941, 16321) is retained as public reference data but is **unverified**; it should be checked against an official source. |
| **P0-11** | Zero database transactions | ✅ | `P0-11: booking creation runs inside a transaction and rolls back on failure` · `…insufficient balance blocks before anything is written` (plus rollback assertions in the P0-5/P0-6 tests) | `db.withTransaction()`; applied to the six boundaries in the plan: booking create, complete, cancel, verified-payment credit, loan disbursement, wallet withdraw | Transactions cover the money paths only. KYC review, admin actions and notification writes remain non-transactional (no financial exposure). |
| **P0-12** | Unconfigured gateway credits wallets for free | ✅ | `P0-12: production + unconfigured gateway refuses…` · `…IPN refuses to settle when unconfigured` · `…success redirect can no longer settle` · `…booking already settled cannot be charged again` | Production + unconfigured → **503**, nothing written; mock settlement only when `NODE_ENV !== "production"` and routed through the same single-credit path; IPN reconciles the gateway amount against the stored amount; `/success` redirects only | Dev-mode settlement still exists (by design). It is now unreachable in production and shares the production code path, so the two cannot diverge. |

**P0 fixed: 12 / 12.** Ten are covered by automated tests; P0-9 and the seeding half of P0-10 are structural removals verified by inspection and a credential sweep.

---

## P1 results (FIX-NOW set)

| ID | Issue | Fixed | Evidence |
|---|---|---|---|
| P1-1 | Provider phone numbers on unauthenticated endpoints | ✅ | `u.phone` removed from `GET /api/providers` and `GET /api/providers/:id` |
| P1-2 | Blood-donor phone + GPS exposed unauthenticated | ✅ | List requires auth, phone masked, coordinates removed; `POST /api/blood/:id/contact` releases one number and logs who asked |
| P1-3 | Payment `/success` redirect performed crediting | ✅ | Covered by test; the redirect now only redirects |
| P1-4 | IPN had no amount reconciliation | ✅ | `settlePayment()` compares the gateway's validated amount to `payments.amount` and refuses on mismatch |
| P1-5 | Wallet debited at creation *and* charged via gateway | ✅ | Covered by test; wallet settlement marks the booking `paid`, and `/payments/initiate` returns 409 `ALREADY_PAID` |
| P1-7 | Provider listed publicly with no review | ✅ (minimal) | `providers.is_approved` added, defaults 0, filters the public list; existing providers grandfathered to 1 by migration `002` |
| P1-8 | `providers` INSERT omitted the primary key | ✅ | `uuidv4()` supplied; provider onboarding no longer 500s |
| P1-9 | KYC `doc_type` enum mismatch | ✅ | Migration `002` widens the enum to include `birth_cert`, `driving_license` |
| P1-10 | `wallet_transactions.type` enum mismatch | ✅ | Migration `002` adds `topup`, `refund`, `payout`, `withdrawal` |
| P1-11 | Admin "suspend" wrote `is_active = -1` (treated as active) | ✅ | Backend accepts only strict 0/1 and refuses admin self-deactivation; the panel sends the real target state and only updates the UI after the server confirms |
| P1-12 (partial) | Admin KYC list shipped full base64 ID scans | ✅ | List returns `has_front`/`has_back`/`has_selfie` flags; images load per document via `GET /api/admin/kyc/:id`, and that access is logged |
| P1-15 | Phone/email changeable with no verification | ✅ | `PUT /api/users/profile` refuses identity changes (`IDENTITY_CHANGE_REQUIRES_VERIFICATION`); display name still editable |
| P1-16 | LLM proxy unauthenticated | ✅ | `authMiddleware` added to `/api/ai/chat` and `/api/ai/chat/stream` |
| P1-17 | Five env-var name mismatches | ✅ | Code accepts both spellings for SSLCommerz / R2 bucket / BulkSMS / Twilio-From; `SSL_IS_SANDBOX` is now read; `.env.example` and `render.yaml` corrected |
| — | `push_subscriptions.user_id INT` vs UUID | ✅ | Migration `002` retypes to `VARCHAR(36)` and purges rows attributed to user 0 — web push had never delivered |
| — | AI fallback asserted a fabricated credit score and policies | ✅ | `routes/ai.js` fallback rewritten; it now says what it cannot know and points at the screen that holds the real value |
| — | Client-side fake payment "Demo OTP" | ✅ | Removed from `BookModal`; the confirmation screen shows the server's actual charged total |
| — | `users.balance DEFAULT 500.00` (free money at signup) | ✅ | Default changed to `0.00` in `schema.sql` and migration `002` |
| — | Raw `err.message` returned from AI routes | ✅ | Replaced with a generic error |

**P1 fixed: 19** (14 from the FIX-NOW list plus 5 related items found during the work).

---

## Not fixed — deliberately deferred

| ID | Issue | Classification | Why |
|---|---|---|---|
| P1-6 | Full booking workflow (disputes, no-show, partial completion) | ARCHITECTURE REWRITE | A minimal safe state machine is in place; the full workflow is a Phase 1 product decision |
| P1-7 (full) | Provider verification lifecycle | ARCHITECTURE REWRITE | Only an `is_approved` gate was added. There is no reviewer queue, SLA, or re-verification |
| P1-12 (full) | KYC images as base64 in the primary DB | BLOCKS PHASE 1 | Needs the storage decision plus a data migration |
| P1-13 | Content-Security-Policy disabled | ARCHITECTURE REWRITE | Enabling it requires auditing inline styles, Ant Design, Google GSI and Google Translate. A wrong CSP breaks the app; guessing is worse than the current state |
| P1-14 | In-process OTP store and cache | BLOCKS PHASE 1 | Requires Redis. Blocks horizontal scaling; the app is single-instance today so the risk is contained |
| P1-18 | Runtime DDL in route modules | BLOCKS PHASE 1 | The migration runner now exists and owns the containment changes; migrating the remaining nine modules is Phase 1 |
| P2 set (11) | Body-size limit, unpaginated lists, `Math.random()` ids, JWT `jti`/revocation | LOW-RISK TEMPORARY | No direct account, money or safety loss |
| — | Remaining misleading client fallbacks (`PROVIDERS`, `MY_BOOKINGS`, `NOTIFS_DATA`, `TRANSACTIONS`, `COUPONS`, landing-page counters, schema.org `aggregateRating`) | LOW-RISK TEMPORARY | Misleading, not dangerous. Removing them requires designing real empty states — Phase 1 UX work. **Still present.** |

---

## Remaining risks, ranked

1. **An administrator must be bootstrapped before the next deploy.** Migration `002` nulls the seeded hashes, so nobody can sign in as an admin until `npm run admin:reset` runs. This is intentional fail-closed behaviour, but it is a deploy-ordering hazard.
2. **The old `admin123` credential is compromised** on any database this code has run against. Nulling the hash prevents future use; it does not undo past use. There is no audit log, so prior misuse cannot be detected.
3. **No audit log still.** Admin actions, KYC decisions and money movements remain untraceable. This was the largest single gap in the Phase 0 audit and it is unchanged.
4. **Migration `002` has not been executed against a real database.** It is written to be re-runnable and the runner tolerates only an enumerated set of "already exists" codes, but it is unverified against TiDB. Run `npm run db:migrate:status` first, and take a backup.
5. **Users with no password and no social binding may be locked out** if they cannot receive OTP. There is no password-reset flow.
6. **Provider directory may appear empty** on databases where `is_approved` did not get grandfathered (i.e. if migration `002` is skipped but the code is deployed).
7. **`HOTLINES` numbers are unverified.** They are plausible Bangladeshi public emergency numbers but were never checked against an official source.
8. **Bookings fail closed when pricing data is incomplete.** Providers without an `hourly_rate` whose category has no `base_price` cannot be booked at all.
9. **Dev-mode payment settlement still exists.** Unreachable in production, but it depends on `NODE_ENV` being set correctly — `render.yaml` does set it.

---

## Deployment order (required)

```
1. Back up the database.
2. cd backend && npm run db:migrate:status     # confirm 002 is pending
3. npm run db:migrate                          # applies 002
4. ADMIN_BOOTSTRAP_EMAIL=... npm run admin:reset   # create an administrator
5. Confirm SSLCOMMERZ_STORE_ID / _PASSWORD are set in Render,
   otherwise payments return 503 in production (by design).
6. Deploy backend, then frontend.
```

Applying the code without step 3 will break KYC submission (`doc_type` enum), wallet top-up ledger writes (`type` enum) and the provider directory (`is_approved` column missing).
