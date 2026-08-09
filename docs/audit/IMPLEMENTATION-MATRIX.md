# IMAP — Implementation Matrix

> **STATUS UPDATE — 2026-08-09 (Phase 0.5).** The findings below are the
> Phase 0 baseline and are preserved unchanged for traceability. Many have
> since been contained on branch `imap/phase-0.5-containment`. For current
> status see [`PHASE-0.5-SECURITY-REGRESSION.md`](PHASE-0.5-SECURITY-REGRESSION.md)
> — **all 12 P0 findings fixed and verified; 19 P1 fixed.** Do not read the
> text below as a description of the code as it stands today.

**Audit date:** 2026-08-09 · **Commit:** `726cc87` · **Scope:** read-only.

Two tables:
1. **Capability matrix** (brief §28) — what exists, whether it is real, whether it is production-ready.
2. **Module disposition matrix** (brief §24) — KEEP / REFACTOR / REWRITE / REMOVE / ADD. **These are proposals for Phase 1 to ratify, not decisions taken here. No module was modified.**

Legend — *Real?*: **Yes** = genuine implementation · **Partial** = works but incomplete or falls back to fabricated data · **Rule-based** = deterministic logic presented as something else · **Mock** = fabricated · **No** = absent.

---

## 1. Capability matrix

### Identity & access

| Capability | Exists? | Real? | Production Ready? | Evidence | Gap | Priority |
|---|---|---|---|---|---|---|
| Email/password registration | Yes | Yes | **No** | `auth.js:35-89` | Accounts created without a password get `password_hash = NULL` → P0-1 | P0 |
| Email/password login | Yes | Yes | **No** | `auth.js:92-116` | Skips verification entirely when the hash is null | P0 |
| Phone OTP send/verify | Yes | Yes | **No** | `auth.js:145-184`, `utils/otp-store.js` | In-process store; lost on restart, breaks on 2 instances | P1 |
| Google sign-in | Yes | Yes | Partial | `auth.js:187-234` | Correct: verifies the ID token and audience. No refresh, no revocation. | P2 |
| Facebook / generic social login | Yes | **Mock** | **No** | `auth.js:119-142`, `AuthPage.jsx:122-138` | No token verification at all; client fabricates the `socialId` → P0-2 | P0 |
| JWT session | Yes | Yes | Partial | `auth.js:12-15`, `middleware/auth.js` | 7-day lifetime, no `jti`, no revocation; `refresh_tokens` table unused | P2 |
| Token refresh | Yes | Partial | No | `auth.js:244-257` | Re-signs an existing valid token indefinitely; no rotation | P2 |
| Role-based access | Yes | Yes | Partial | `middleware/auth.js:29-36` | Flat string match on 3 roles; no resource-ownership model | P1 |
| Attribute/resource authorization | **No** | — | **No** | Inline `if` per handler | No policy layer; `join_room` has none at all → P0-7 | P0 |
| Password reset | **No** | — | — | — | Endpoint does not exist | P1 |
| MFA | **No** | — | — | — | `users.settings.privacy_2fa` is written and never read | P3 |
| Account deletion / export | **No** | — | — | — | No GDPR/PDPA path despite collecting NID scans | P1 |

### Marketplace

| Capability | Exists? | Real? | Production Ready? | Evidence | Gap | Priority |
|---|---|---|---|---|---|---|
| Categories | Yes | Partial | No | `schema.sql:36-47`, `services.js` | Three conflicting taxonomies (12 DB / 8 seeder / 19 client); the UI shows the client's | P1 |
| Services (as an entity) | **No** | — | — | — | Free text on `providers.service_type_en` and `bookings.service_name_en` | **P0 for IMAP 2.0** |
| Service graph / relations | **No** | — | — | — | Brief §2.6 unimplementable | **P0 for IMAP 2.0** |
| Provider profile | Yes | Yes | Partial | `providers.js:189-235` | No multi-skill model; one free-text service string | P1 |
| Provider capabilities | **No** | — | — | — | — | P1 |
| Provider search | Yes | Partial | No | `providers.js:13-67` | `LIKE '%q%'` × 5 columns; no index can serve it; no ranking, no typo tolerance | P1 |
| Geo / nearby search | Partial | Partial | No | `App.jsx:4029-4054` | Client-side haversine over an already-fetched page. `providers.latitude/longitude` are never queried. | P1 |
| Provider availability | Partial | Partial | **No** | `schedule.js` | Free-text dateless slots; `POST /api/bookings` never consults them → double-booking is unpreventable | P1 |
| Provider verification gate | **No** | — | **No** | `providers.js:263-328` | Applicant is listed publicly and immediately while being told review takes 24–48 h → P1-7 | P0 |
| Provider onboarding (apply) | Yes | **Broken** | **No** | `providers.js:297-304` | INSERT omits the non-defaulted `VARCHAR(36)` primary key → P1-8 | P1 |

### Booking & execution

| Capability | Exists? | Real? | Production Ready? | Evidence | Gap | Priority |
|---|---|---|---|---|---|---|
| Create booking | Yes | Yes | **No** | `bookings.js:23-115` | Client-supplied price and fee; no transaction; negative fee mints balance → P0-3, P0-4, P0-11 | P0 |
| Server-authoritative pricing | **No** | — | **No** | `bookings.js:38` | `categories.base_price` and `providers.hourly_rate` exist and are never read | P0 |
| Booking state machine | **No** | — | **No** | `bookings.js:177-197` | Any party may set any status; repeatable `completed` pays out each time → P0-5 | P0 |
| Booking list / detail | Yes | Yes | Partial | `bookings.js:118-174` | `GET /:id` restricted to the customer — the provider cannot read their own booking | P2 |
| Cancellation | Yes | Partial | No | `bookings.js:268-295` | Wallet credit only; no gateway refund; no time window despite the AI claiming "1 hour, no charge" | P1 |
| Live tracking | Yes | Yes | **No** | `server.js:99-105` | No room authorization; coordinates can be injected into another booking → P0-7 | P0 |
| Booking chat (REST) | Yes | Yes | **Yes** | `chat.js:24-110` | Participation correctly verified on both GET and POST. One of the best-implemented surfaces. | — |
| Booking chat (socket) | Yes | Yes | **No** | `server.js:77-81` | Room join bypasses the REST participation check → P0-7 | P0 |
| Completion proof upload | Yes | Partial | No | `upload.js:118-132` | Only the customer or an admin may upload; the provider cannot. Not linked to status. | P2 |
| Reviews | Yes | **Yes** | **Yes** | `reviews.js:16-67` | Correctly gated on completed + own + unrated; recalculates the provider average | — |
| Fake-review detection | Yes | Rule-based | **No** | `ai.js:474-525` | Never invoked on the write path | P2 |

### Money

| Capability | Exists? | Real? | Production Ready? | Evidence | Gap | Priority |
|---|---|---|---|---|---|---|
| Wallet balance | Yes | Partial | **No** | `schema.sql:22` | Mutable column, `DEFAULT 500.00` (free money at signup), 7 write paths, no transactions | P0 |
| Wallet ledger | Partial | **No** | **No** | `wallet_transactions` | Best-effort side log outside transactions; `'topup'` rejected by the enum → P1-10; cannot reconstruct `balance` | P0 |
| Top-up via gateway | Yes | Yes | **No** | `payments.js:29-42, 65-76` | Falls back to mock mode when creds are unset → free balance → P0-12 | P0 |
| Top-up self-service | Yes | Yes | Partial | `users.js:96-122` | Correctly refuses when the gateway is configured | — |
| Withdrawal | Yes | Partial | No | `users.js:125-150` | Atomic deduction is correct; but nothing records that money left the platform, no payout integration | P1 |
| Payment initiate | Yes | Yes | **No** | `payments.js:23-99` | Charges the gateway for a booking already debited from the wallet → P1-5 | P1 |
| Payment IPN | Yes | Yes | **No** | `payments.js:102-141` | No source authentication, no amount reconciliation → P1-4. The CAS on status is correct. | P1 |
| Payment redirects | Yes | Partial | **No** | `payments.js:144-174` | Publicly POSTable with a body-supplied `tran_id` → P1-3 | P1 |
| Refunds | **No** | — | **No** | `payments.refunded_at` never written | No gateway refund, no partial refund, no `refunds` table | P1 |
| Platform fee / take rate | **No** | — | **No** | `schema.sql:102` DEFAULT 0.00, client-supplied | Revenue is zero by construction | P0 |
| Settlement / payouts | **No** | — | — | — | Provider earnings land in a mutable balance column | P1 |
| Reconciliation | **No** | — | — | — | No mechanism to detect or repair balance drift | P0 |
| Promo application | Partial | Partial | **No** | `promos.js:57-84` | Codes validate; **no booking code reads a promo**. Discounts are never applied. | P1 |
| Loyalty points | Yes | Yes | Partial | `users.js:200-216, 290-315` | Atomic redemption is correct. Points earned from a client-supplied amount → exploitable with P0-4. | P1 |
| Referrals | Partial | **No** | No | `users.js:219-249` | `referrals` table created at boot; **nothing ever writes to it** | P2 |
| Microloan scoring | Yes | Rule-based | Partial | `loans.js:44-81` | Reasonable heuristic; server-side; interest rate correctly fixed at `:116` | P2 |
| Microloan apply | Yes | Yes | Partial | `loans.js:102-173` | Duplicate-active guard is correct. Cache-bust runs after `res.json` (dead code path on some errors). | P2 |
| Microloan disbursement | Yes | Yes | **No** | `loans.js:226-277` | No prior-status guard; every call credits again → P0-6 | P0 |
| Loan repayment | **No** | — | — | — | No schedule, no instalments, no ledger | P2 |
| Idempotency | **No** | — | **No** | repo-wide | Root cause of P0-5, P0-6, P1-5 | P0 |

### Trust, safety, compliance

| Capability | Exists? | Real? | Production Ready? | Evidence | Gap | Priority |
|---|---|---|---|---|---|---|
| KYC submission | Yes | Yes | **No** | `kyc.js:43-90`, `upload.js:56-115` | Base64 ID scans in the primary DB; two of four doc types fail the enum → P1-9, P1-12 | P1 |
| KYC review | Yes | Yes | Partial | `kyc.js:93-136`, `admin.js:197-226` | Two independent implementations of the same review action | P2 |
| Trust score | Partial | **No** | No | `providers.trust_score` | Written in exactly one place (`kyc.js:117`, +30); read nowhere; no definition | P2 |
| Fraud detection | Yes | Rule-based | **No** | `ai.js:428-467` | Advisory only; client-invoked; user-dismissable ("Proceed Anyway", `App.jsx:603`) | P1 |
| Abuse prevention | **No** | — | — | — | Rate limits only | P1 |
| Complaints / disputes | Yes | Yes | Partial | `users.js:252-272`, `admin.js:229-276` | No SLA, no evidence, no refund linkage, no user-visible timeline | P2 |
| SOS alerts | Yes | Yes | **No** | `sos.js` | Broadcast to every socket including guests → P0-8; false "call center" claim → P0-10 | P0 |
| Audit logging | **No** | — | **No** | grep: no matches | No admin, KYC, role, or money action is auditable | P0 |
| Privacy / consent / retention | **No** | — | **No** | — | NID scans, selfies, GPS, blood group collected with no policy, consent, or deletion path | P1 |

### AI

| Capability | Exists? | Real? | Production Ready? | Evidence | Gap | Priority |
|---|---|---|---|---|---|---|
| LLM chat | Yes | **Yes** | **No** | `ai.js:174-200` | Unauthenticated → quota abuse (P1-16); no timeout; no logging | P1 |
| Streaming chat | Yes | Yes | No | `ai.js:208-299` | Uses a *different* Gemini model than non-streaming; simulates streaming when unconfigured | P2 |
| AI fallback answers | Yes | **Mock** | **No** | `ai.js:92-142` | Asserts a fabricated credit score, provider counts, and refund/cancellation policies → P0 AI safety | P0 |
| Provider matching | Yes | Rule-based | Partial | `ai.js:306-360` | Scores `p.last_active`, a column that does not exist → that term is always 0 | P2 |
| Dynamic pricing | Yes | Rule-based | **No** | `ai.js:367-421` | Output round-trips through the client and is not authoritative | P1 |
| Bundle suggestions | Yes | Partial | Partial | `ai.js:713-749` | Static fallback map below 3 co-bookings | P3 |
| Demand forecast | Yes | Rule-based | Partial | `ai.js:531-603` | Two-point linear extrapolation; admin-gated (correct) | P3 |
| Churn risk | Yes | Rule-based | Partial | `ai.js:609-660` | Admin-gated (correct) | P3 |
| Demand heatmap | Yes | Rule-based | No | `ai.js:666-706` | Groups by raw free-text `bookings.address` — every address is its own "area" | P2 |
| AI tools / actions | **No** | — | **No** | — | Every link of `AI → Tool → Authz → Rules → Transaction → DB` is missing | **P0 for IMAP 2.0** |
| AI memory | **No** | — | — | — | History capped at 20 client-sent messages, lost on reload | P1 |
| AI context | **No** | — | — | — | Only `lang` is passed; `/ai/chat` doesn't know who is asking | P1 |
| Retrieval / RAG | **No** | — | — | — | — | P2 |
| Model abstraction | **No** | — | — | `ai.js:41,67,254` | Three inline `fetch` calls, hardcoded URLs and model names | P1 |
| AI evaluation | **No** | — | — | — | — | P1 |
| AI observability | **No** | — | — | — | No traces, latency, cost, or success rate | P1 |
| Voice | Yes | Rule-based | Partial | `VoiceCommand.jsx` | Web Speech → keyword → navigate. Transcript never reaches a model. | P2 |
| Multimodal input | **No** | — | — | — | Client-side OCR for one field only | P1 |

### Platform

| Capability | Exists? | Real? | Production Ready? | Evidence | Gap | Priority |
|---|---|---|---|---|---|---|
| Realtime transport | Yes | Yes | Partial | `server.js:44-118` | Works. JWT optional → tokenless guests connect. Two client singletons. | P1 |
| Notifications (in-app) | Yes | Yes | Partial | `notifications` table | Auto-seeded on a GET; no preference enforcement | P2 |
| Web Push | Yes | Partial | **No** | `utils/push.js`, `users.js:349` | `push_subscriptions.user_id INT` vs `users.id VARCHAR(36)` → subscriptions attributed to user 0, push never delivers | P1 |
| SMS | Yes | Partial | **No** | `utils/sms.js` | Default `mock`; two provider integrations read env-var names that are not provisioned → P1-17 | P1 |
| File storage | Yes | Partial | **No** | `utils/storage.js` | Reads `R2_BUCKET_NAME`; `render.yaml` provisions `R2_BUCKET` → wrong bucket. Falls back to base64-in-DB. | P1 |
| Caching | Yes | Partial | **No** | `utils/cache.js` | In-process `Map`; 60+ literal keys manually invalidated across 9 files; incomplete | P1 |
| Search infrastructure | **No** | — | — | — | `LIKE '%q%'` only | P1 |
| Event bus / outbox | **No** | — | — | — | Realtime is a side effect of HTTP handlers | P1 |
| Background workers | **No** | — | — | — | — | P1 |
| Migrations | **No** | — | **No** | 9 modules run DDL at import | No versioning, no rollback, errors swallowed | P0 |
| Tests | **No** | — | **No** | — | 0 of 20 critical flows covered | P0 |
| CI (frontend) | Yes | Yes | Partial | `deploy.yml` | No test/lint/type step | P1 |
| CI (backend) | **No** | — | **No** | `render.yaml:112` autoDeploy | Untested code deploys on every push | P0 |
| Observability | Partial | Partial | No | `utils/logger.js`, `/api/health` | Logging + health only; no metrics, tracing, error tracking, or alerting. `X-Request-ID` generated and never used. | P1 |
| i18n | Yes | Partial | Partial | `constants/translations.js` | ~108 keys; most strings are inline ternaries across every file | P2 |
| PWA | Yes | Yes | Partial | `sw.js`, `manifest.json` | Network-first for everything; no offline strategy for API data | P3 |

---

## 2. Module disposition matrix

**Proposals for Phase 1. Nothing here was executed.**

### Backend

| Module | Current state | Disposition | Reason | Priority | Dependencies |
|---|---|---|---|---|---|
| `middleware/auth.js` | Works; DB round-trip per request | **KEEP + EXTEND** | Correct design (role/`is_active` changes take effect immediately). Needs a resource-ownership/policy layer beside it. | P0 | Policy module (ADD) |
| `middleware/validate.js` | express-validator wrapper | **KEEP** | Clean and correct. Under-applied — extend coverage, don't replace. | — | — |
| `middleware/requestLogger.js` | Winston-backed | **KEEP + FIX** | Wire in `req.requestId` (generated at `server.js:129` and unused); add PII redaction. | P1 | — |
| `utils/logger.js` | Winston, JSON in prod | **KEEP** | Correct. | — | — |
| `utils/response.js` | Written, imported by nothing | **KEEP + ADOPT** | The standardisation already exists; adopt it repo-wide instead of writing a fourth envelope. | P1 | All routes |
| `utils/cache.js` | In-process `Map` | **REWRITE** | Blocks horizontal scaling and produces divergent views. Replace with Redis and a key-namespace convention that makes invalidation derivable. | P1 | Redis (ADD) |
| `utils/otp-store.js` | In-process `Map` | **REWRITE** | Same. Logic (TTL, attempts, resend throttle) is good — port it. | P1 | Redis (ADD) |
| `utils/payment.js` | SSLCommerz direct import | **REFACTOR** | Extract a `PaymentGateway` interface; forbid mock mode in production; read `SSL_IS_SANDBOX`; add timeouts. | P0 | — |
| `utils/sms.js` | 4 providers, hand-rolled HTTP | **REFACTOR** | Fix the three env-var name mismatches; add timeouts; add a provider interface. | P1 | — |
| `utils/storage.js` | R2/S3 + base64 fallback | **REFACTOR** | Fix the bucket env-var name; remove the base64 fallback in production; add signed URLs. | P1 | — |
| `utils/push.js` | web-push | **KEEP + FIX** | Fix `push_subscriptions.user_id` type — push currently never delivers. | P1 | Migration |
| `db.js` | mysql2 pool | **KEEP + FIX** | Fail fast on connection error instead of logging and continuing; bound `queueLimit`. | P1 | — |
| `server.js` — app/io setup | Mixed concerns | **REFACTOR** | Split into `app.js`, `realtime.js`, `bootstrap.js`. | P1 | — |
| `server.js` — seed endpoint (`:189-338`) | 150-line seeder as an HTTP route | **REMOVE** | Duplicates `scripts/seedDemo.js`; reachable without a secret; seeds known credentials. | **P0** | — |
| `server.js` — runtime DDL (`:379-396`) | `CREATE TABLE` on boot | **REMOVE** | Replace with migrations. | P0 | Migration tool (ADD) |
| `routes/auth.js` | Two auth bypasses | **REWRITE** | P0-1 and P0-2 are design faults, not bugs. Rebuild around explicit credential types with a verified factor per type. | **P0** | — |
| `routes/bookings.js` | No transaction, no state machine, client pricing | **REWRITE** | P0-3, P0-4, P0-5, P0-11 all originate here. Needs a state machine, server pricing, transactions, idempotency. | **P0** | Pricing service, ledger, migrations |
| `routes/payments.js` | CAS is good; everything around it is not | **REFACTOR** | Keep the compare-and-swap. Add IPN authentication, amount reconciliation, refunds, and remove mock mode in production. | **P0** | Ledger, `utils/payment.js` |
| `routes/loans.js` | Non-idempotent disbursement | **REFACTOR** | Add a status guard and a transaction. Scoring logic is sound — keep it. | **P0** | Ledger |
| `routes/users.js` | 7 unrelated concerns in one file | **REWRITE (split)** | Split into `profile`, `wallet`, `notifications`, `loyalty`, `referral`, `complaints`, `push`. Wallet moves onto the ledger. | P1 | Ledger |
| `routes/providers.js` | Broken INSERT; no verification gate; PII exposure | **REFACTOR** | Fix the missing PK; add an approval state; remove `u.phone` from public responses; add the capability model later. | **P0** | Migration, service graph |
| `routes/sos.js` | Global PII broadcast; false claim | **REFACTOR** | Emit to an admin room; make the response describe reality. Small change, P0 impact. | **P0** | Realtime authz |
| `routes/chat.js` | REST authz correct | **KEEP + MOVE DDL** | Best-implemented access control in the codebase. Move the `CREATE TABLE` to a migration. | P2 | Migration |
| `routes/reviews.js` | Correctly gated | **KEEP** | Wire in `review-check` on the write path later. | — | — |
| `routes/kyc.js` | Enum mismatch; base64 blobs | **REFACTOR** | Align the enum; move images to object storage; add an audit record for each decision. | P1 | Migration, storage |
| `routes/admin.js` | Broad, correct role gating, no audit | **REFACTOR** | Add audit logging to every mutating action; fix the KYC-review duplication with `kyc.js`; move DDL out. | P1 | Audit log (ADD) |
| `routes/ai.js` | 2 real endpoints + 8 rule-based scorers + fabricating fallback | **SPLIT: REWRITE + RELOCATE** | Fallback strings → **REMOVE** (P0 safety). Chat → **REWRITE** behind an `LLMClient` with auth. Scorers → **KEEP but RELOCATE** into `ranking`/`risk`/`analytics` services invoked server-side, and stop calling them "AI". | **P0** | `LLMClient` (ADD) |
| `routes/services.js` | Thin CRUD over `categories` | **REWRITE** | Becomes the service-graph API in IMAP 2.0. | P1 | Service graph schema |
| `routes/schedule.js` | Free-text slots, never consulted | **REWRITE** | Real dated availability with capacity, honoured by booking. | P1 | Service graph schema |
| `routes/promos.js` | Validates but never applies; seeds fake counts | **REFACTOR** | Remove the seed; wire promo application into server-side pricing. | P1 | Pricing service |
| `routes/blood.js` | Seeded fake donors; PII exposed; false confirmation | **REWRITE** | Remove the seed, authenticate the donor list, implement or disable dispatch. Emergency feature — cannot ship as-is. | **P0** | — |
| `routes/disaster.js` | Seeded fake alerts | **REWRITE or REMOVE** | Fabricated emergency information. Either source from a verified feed or remove the feature. | **P0** | Product decision |
| `routes/upload.js` | Works; MIME trusted | **REFACTOR** | Magic-byte validation; allow the provider to upload completion proof; signed URLs. | P2 | Storage |
| `scripts/initDb.js` | Splits `schema.sql` on `;` | **REMOVE** | Replaced by the migration tool. (The naive split also breaks on any `;` inside a string literal.) | P1 | Migration tool |
| `scripts/resetAdmin.js` | Publishes `admin123` | **REWRITE** | Generate a random password and print it once. | **P0** | — |
| `scripts/seedDemo.js` | Category insert fails silently (PK type) | **REFACTOR** | Fix the ids; gate to non-production; make it the single seeding path. | P1 | — |
| `scripts/checkLogin.js` | Ad-hoc diagnostic | **KEEP** | Harmless and useful. | — | — |
| `schema.sql` | 16 tables, seeds an admin with a known password | **REFACTOR → migrations** | Convert to an initial migration; strip all seed data. | **P0** | Migration tool |

### Frontend

| Module | Current state | Disposition | Reason | Priority | Dependencies |
|---|---|---|---|---|---|
| `App.jsx` (5,538 L) | ~50 components, routing, state, 10 static data arrays | **REWRITE (decompose)** | The single largest maintainability blocker. Split by domain; introduce URL routing; remove static fallbacks. Whether this is an in-place decomposition or a Next.js rebuild is a Phase 1 decision. | P1 | Routing decision, component library |
| `api.js` | Clean, typed, JSDoc'd, 18 namespaces | **KEEP** | The best-organised file in the frontend. Regenerate from OpenAPI later if a contract is adopted. | — | — |
| `socket.js` + `hooks/useSocket.js` | Two independent singletons | **REWRITE (merge)** | One connection, one API, typed events. | P1 | — |
| `constants/data.js` | 19 fake categories, 6 fake providers, 4 fake bookings, 5 fake notifications | **REMOVE** | Root cause of the silent-fallback-to-fabricated-data pattern. | **P0** | Empty states |
| `constants/theme.js` | Real light/dark token set | **KEEP** | Genuine design tokens, consistently used. Foundation for the component library. | — | — |
| `constants/translations.js` | ~108 keys | **REFACTOR** | Extract the inline ternaries scattered across every file into this (or a real i18n library). | P2 | — |
| `contexts/index.jsx` | Seeds shared context with mock data | **REFACTOR** | Remove the mock seeds (`:16-18`); split contexts. | P1 | `data.js` removal |
| `components/ui.jsx` | 4 primitives | **KEEP + EXPAND** | Grow into a real component library so accessibility can be fixed once. | P1 | Design system decision |
| `components/VoiceCommand.jsx` | Web Speech → keyword → navigate | **KEEP for now, REPLACE later** | Works and is genuinely useful. In IMAP 2.0 the transcript should reach the AI layer instead of a keyword table. | P2 | AI tool layer |
| `pages/AuthPage.jsx` | Fabricates a Facebook `socialId` client-side | **REFACTOR** | Remove the mock social login; keep the Google flow. | **P0** | `routes/auth.js` |
| `pages/AdminPanel.jsx` (1,556 L) | Ant Design; fake fallback rows; broken suspend | **REFACTOR** | Remove fixture data; fix `is_active:-1`; add real empty states. Decide whether Ant Design stays as a second design system. | P1 | Design system decision |
| `pages/ProviderPortal.jsx` | Functional; errors swallowed | **REFACTOR** | Surface errors; add earnings statements; consume real availability. | P2 | Schedule rewrite |
| `pages/KYCPage.jsx` | Works | **KEEP + REFACTOR** | Switch to direct-to-storage upload instead of base64. | P1 | Storage |
| `pages/LandingPage.jsx` | Polished; fabricated statistics and "live" ticker | **REFACTOR** | Serve statistics from real endpoints or remove them. The animation work is good — keep it. | P1 | — |
| `public/sw.js` | Network-first | **KEEP + REFACTOR** | Add stale-while-revalidate for the shell. | P3 | — |
| `index.html` | Fabricated `aggregateRating` in JSON-LD | **REFACTOR** | Compute the rating from `reviews` or remove the block. Fix `<html lang>` on language switch. | P1 | — |
| `.vite/deps/` committed | Build cache in git | **REMOVE** | — | P3 | — |

### To ADD

| Addition | Reason | Priority | Blocks |
|---|---|---|---|
| **Migration tool + initial migration** | 9 modules currently run DDL with swallowed errors; nothing else in the schema plan is safe until this exists | **P0** | All schema work |
| **Test harness + tests for the 12 P0 paths** | 9 of 12 P0s would be caught by one test each | **P0** | All refactoring confidence |
| **Financial ledger (append-only)** | `users.balance` is unreconcilable today | **P0** | Payments, wallet, loans, payouts |
| **`audit_logs` table + write path** | No admin, KYC, role, or money action is traceable | **P0** | Trust & safety, AI actions, compliance |
| **Authorization policy module** | Authorization is inline `if`s, implemented three different ways | **P0** | AI tools, realtime authz |
| **Server-side pricing service** | Removes the client from the money path | **P0** | Booking, promos, AI pricing |
| **Idempotency keys** | Root cause of P0-5, P0-6, P1-5 | **P0** | Booking, payments, loans |
| **Backend CI pipeline** | Untested code autodeploys on every push | **P0** | — |
| **Redis** | Unblocks horizontal scaling; replaces two in-process `Map`s | P1 | Cache, OTP, rate limiting |
| **`LLMClient` abstraction** | Prerequisite for tool calling | P1 | AI tools |
| **AI tool catalog + dispatcher** | Every link of the required chain is missing | P1 | Policy module, ledger, audit log, transactions |
| **Service graph schema** | `services`, `service_relations`, `provider_services`, `coverage_areas`, real `availability` | P1 | Goal-based UX, provider AI, matching |
| **Domain events / outbox** | Realtime is currently a side effect of HTTP handlers | P1 | Notifications, analytics, AI context |
| **AI memory + context store** | Brief §2.5 | P2 | Service graph |
| **Search infrastructure** | Replaces `LIKE '%q%'` | P2 | Service graph |
| **Error tracking + metrics + tracing** | None exist | P1 | — |
| **Component library + accessibility pass** | So a11y is fixed once, not in hundreds of inline styles | P1 | Design system decision |
| **URL routing** | Prerequisite for deep links, SEO, and social/short-form discovery | P1 | `App.jsx` decomposition |
| **Privacy, consent, retention, deletion** | NID scans, selfies, GPS, blood group collected with no policy | P1 | — |
| **Background workers / queue** | Nothing async exists | P2 | Redis |

---

## 3. Suggested sequencing

**Phase 0.5 — Containment.** Everything marked **P0** in the disposition matrix that does not require new infrastructure: `routes/auth.js`, `routes/bookings.js`, `routes/sos.js`, the seed endpoint, `scripts/resetAdmin.js`, `schema.sql` seed data, the AI fallback strings, `constants/data.js`, mock payment mode, and the realtime room check. These are containment, not architecture, and most are small.

**Phase 1 — Decide and lay foundations.** The four ADD items that everything else depends on — migrations, tests, ledger, audit log — plus the authorization policy module and the server-side pricing service. In parallel, ratify the open architecture decisions (stack, frontend rebuild vs decompose, service-graph model) and write the twelve P1 documents in `DOCUMENTATION-INVENTORY.md §5`.

**Phase 2 — Build IMAP 2.0 substrate.** Service graph, AI tool layer, memory and context, events, search.

The ordering constraint that matters: **the AI tool catalog cannot be built before the policy module, the ledger, the audit log, and transactions exist** — and all four are independently required anyway. That is why they come first.
