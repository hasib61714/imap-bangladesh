# IMAP 2.0 — Current System Inventory

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Verified against the repository on this date.** Where this differs from `CURRENT-TO-TARGET.md`, the difference is marked **[VERIFIED-DIFF]** and this document is correct.
**Disposition vocabulary:** KEEP · KEEP+REFACTOR · WRAP · MIGRATE · REWRITE · REMOVE

---

## 0. Measured shape

| | Files | Lines |
|---|---:|---:|
| Backend source (`.js`, excl. tests) | 43 | **7,283** |
| Backend tests | 6 | 1,239 |
| Backend SQL (schema + migrations) | 3 | 503 |
| Frontend source | 16 | **11,332** |
| Documentation | 44 | ~14,900 |

**`frontend/src/App.jsx` is 5,567 lines — 49% of all frontend source and 31% of the codebase.** It contains 43 top-level components, 208 `useState` calls and 32 `useEffect` calls in one module.

**18 route modules, 109 HTTP endpoints, 18 mounted paths.** Backend tests: 59 passing (49 unit/route + 10 integration).

### 0.1 Two corrections to earlier phases

**[VERIFIED-DIFF]** `CURRENT-TO-TARGET.md` §1 records `AdminPanel.jsx` as 1,556 lines and `api.js` as 408; the files are **1,600** and **416**. Both grew in the animation commits after Phase 2. Immaterial, corrected for accuracy.

**[VERIFIED-DIFF]** `CURRENT-TO-TARGET.md` §2 records `server.js` as 428 lines; it is **249**. The Phase 0.5 extraction of `realtime.js` (131 lines) accounts for the difference. `server.js` is smaller and better-separated than the Phase 2 document assumes.

---

## 1. Frontend

| File | L | Purpose | Depends on | Used by | Risk | Gate-1 | Disposition |
|---|---:|---|---|---|:--:|:--:|---|
| `App.jsx` | 5567 | Shell + 43 components + ~30 page keys + 10 static data arrays | everything | `main.jsx` | **High** | **Core** | **REWRITE (incremental)** |
| `pages/AdminPanel.jsx` | 1600 | Admin console, Ant Design | `api.js` | `App.jsx` (lazy) | Med | Core | **REWRITE** — separate entry |
| `pages/LandingPage.jsx` | 973 | Marketing + animations | theme | `App.jsx` (lazy) | Low | Support | **KEEP+REFACTOR** |
| `pages/ProviderPortal.jsx` | 791 | Provider jobs, earnings, schedule | `api.js` | `App.jsx` (lazy) | Low | **Core** | **KEEP+REFACTOR** |
| `pages/AuthPage.jsx` | 466 | Login, register, OTP | `api.js` | `App.jsx` (lazy) | Low | **Core** | **KEEP+REFACTOR** |
| `api.js` | 416 | 18 API namespaces, one `fetch` wrapper | — | all | Low | **Core** | **KEEP+REFACTOR → generate** |
| `components/VoiceCommand.jsx` | 342 | Web Speech → keyword → navigate | — | `App.jsx` | Low | Defer | **WRAP** (Gate 2 rewrite) |
| `constants/theme.js` | 322 | Design tokens, light + dark | — | all | None | **Core** | **KEEP** |
| `pages/KYCPage.jsx` | 254 | Document capture, Tesseract OCR | `api.js` | `App.jsx` (lazy) | Med | **Core** | **REFACTOR** |
| `constants/data.js` | 120 | 19 fake categories, 6 fake providers, 4 fake bookings, 5 fake notifications | — | `contexts`, `App.jsx` | **High** | — | **REMOVE** |
| `socket.js` | 112 | Socket singleton | — | `App.jsx` | Low | **Core** | **REWRITE (merge)** |
| `constants/translations.js` | 111 | ~108 i18n keys | — | all | Low | **Core** | **KEEP+REFACTOR** |
| `components/ui.jsx` | 82 | 4 primitives | theme | `App.jsx` | Low | **Core** | **KEEP+EXPAND** |
| `public/sw.js` | 77 | Network-first service worker | — | browser | Low | Support | **KEEP+REFACTOR** |
| `main.jsx` | 71 | Mount + error boundary + auto-reload | `App.jsx` | — | Low | **Core** | **KEEP+REFACTOR** |
| `hooks/useSocket.js` | 73 | Second socket connection | — | `App.jsx` | Low | **Core** | **REWRITE (merge)** |
| `vite.config.js` | 46 | Build config, base path | — | build | Low | **Core** | **REFACTOR** |
| `contexts/index.jsx` | 26 | 5 contexts, **seeded with mock data** | `data.js` | `App.jsx` | Med | **Core** | **REFACTOR** |

### 1.1 The finding that changes the frontend plan

`App.jsx` contains **ten hardcoded data arrays that are rendered as if they were product data**:

| Constant | Renders as | Line |
|---|---|---:|
| `AN_DATA`, `AN_MONTHS`, `AN_SERVICES`, `AN_ACTIVITY` | Customer analytics charts and activity feed | 2286 |
| `LOYALTY_REWARDS`, `LEVELS`, `LY_HISTORY` | Loyalty tiers and points history | 2605 |
| `RF_FRIENDS`, `RF_STEPS` | Referral list with named people and earnings | 2719 |
| `PF_PROVIDERS` | Portfolio profiles with ratings and job counts | 2814 |
| `PA_MONTHS`, `PA_EARNINGS`, `PA_REVIEWS` | Provider earnings chart and named reviews | 2979 |
| `SC_COURSES` | Skill certifications, some marked "issued" | 3053 |
| `COUPONS` | Promotional coupons | 3134 |
| `TRANSACTIONS` | Wallet transaction history | 3273 |
| `CAL_SLOTS`, `pseudoBooked()` | Calendar availability — **a deterministic hash presented as booking data** | 2118 |
| `ALERTS`, `SHELTERS`, `DONORS` | Emergency data — **already emptied in Phase 0.5** | 3523 |

**This is not a styling problem. Nine of the app's ~30 destinations are fully fabricated** — they have no backend, no API namespace and no table. `pseudoBooked()` is the clearest case: it hashes a provider id and date into a boolean and shows the result as whether a slot is taken.

**Consequence for the plan.** These surfaces cannot be "migrated" — there is nothing behind them. Every one of them is out of Gate-1 scope (`INFORMATION-ARCHITECTURE.md` §3.3 "Not routes"). The migration disposition for all ten is **REMOVE**, not REWRITE, and removing them deletes roughly **1,900 lines of `App.jsx` (34%)** before any decomposition work begins. That is the cheapest and highest-value first move in the frontend, and Phase 2 did not identify it.

### 1.2 Frontend disposition summary

| Disposition | Count | Lines affected |
|---|---:|---:|
| KEEP | 1 | 322 |
| KEEP+REFACTOR / EXPAND | 7 | 2,010 |
| REFACTOR | 2 | 280 |
| WRAP | 1 | 342 |
| REWRITE | 4 | 7,352 |
| REMOVE | 1 file + ~1,900 lines inside `App.jsx` | ~2,020 |

---

## 2. Backend — platform and utilities

| File | L | Purpose | Depends on | Used by | Risk | Gate-1 | Disposition |
|---|---:|---|---|---|:--:|:--:|---|
| `config/environment.js` | 284 | Two-axis env identity, 4 guards (Phase 2.75) | — | `db.js`, 5 routes, 5 scripts | None | **Core** | **KEEP** |
| `db.js` | 75 | Pool + `withTransaction` + coherence guard | `config/environment` | everything | Low | **Core** | **KEEP+REFACTOR** |
| `server.js` | 249 | App, io, limiters, CORS, health, shutdown | 18 routes | entry | Low | **Core** | **REFACTOR (split)** |
| `realtime.js` | 131 | Socket handlers, room authorization (Phase 0.5) | `bookingAccess` | `server.js` | Low | **Core** | **KEEP+REFACTOR** |
| `middleware/auth.js` | 38 | JWT verify + DB re-read | `db` | all routes | Med | **Core** | **KEEP+REWRITE** |
| `middleware/validate.js` | 32 | express-validator wrapper | — | `auth.js` only | Low | **Core** | **KEEP → generate** |
| `middleware/requestLogger.js` | 30 | Request logging | `logger` | `server.js` | Low | **Core** | **KEEP+FIX** |
| `utils/money.js` | 82 | Bounded money parsing (Phase 0.5) | — | 4 routes | Low | **Core** | **KEEP+MIGRATE** |
| `utils/pricing.js` | 107 | Server price resolution, fail-closed (0.5) | `db` | `bookings` | Med | **Core** | **KEEP+REWRITE** |
| `utils/bookingState.js` | 105 | Transition table, ledger refs (0.5) | — | `bookings`, tests | Low | **Core** | **KEEP+EXTEND** |
| `utils/bookingAccess.js` | 72 | Participation lookup (0.5) | `db` | `bookings`, `realtime` | Low | **Core** | **KEEP+REFACTOR** |
| `utils/payment.js` | 67 | SSLCommerz adapter | `config/environment` | `payments` | Med | **Core** | **KEEP+REFACTOR** |
| `utils/cache.js` | 57 | **In-process `Map`** | — | 9 modules | Med | **Core** | **REWRITE** |
| `utils/otp-store.js` | 41 | **In-process `Map`**, TTL + throttle | — | `auth` | Low | **Core** | **REWRITE (port logic)** |
| `utils/logger.js` | 42 | Winston, JSON in production | `config/environment` | all | None | **Core** | **KEEP** |
| `utils/response.js` | 53 | Response helpers — **imported by zero route files** | — | **nothing** | None | **Core** | **REWRITE as the contract** |
| `utils/sms.js` | 83 | Twilio / BulkSMS / mock | `config` | `auth` | Low | **Core** | **KEEP+REFACTOR** |
| `utils/storage.js` | 76 | R2 / S3 / **base64 fallback** | — | `upload`, `kyc` | Med | **Core** | **REFACTOR** |
| `utils/push.js` | 53 | Web push | — | `users` | Low | Defer | **KEEP** |
| `scripts/migrate.js` | 183 | Migration runner (0.5 + 2.75) | `db`, `config` | ops | None | **Core** | **KEEP** |
| `scripts/resetAdmin.js` | 129 | Admin bootstrap (0.5 + 2.75) | `db` | ops | None | **Core** | **KEEP** |
| `scripts/seedDemo.js` | 239 | Dev fixtures, `forbidInProduction` | — | dev | Low | Support | **KEEP+REFACTOR** |
| `scripts/initDb.js` | 62 | Splits `schema.sql` on `;` | — | — | None | — | **REMOVE** |
| `scripts/checkLogin.js` | 31 | Bulk user dump (guarded 2.75) | `db` | debug | Low | — | **REMOVE** |
| `schema.sql` | 374 | 17 tables | — | `initDb` | Low | — | **MIGRATE → archive** |
| `migrations/` | 129 | 2 migrations | — | runner | None | **Core** | **KEEP** |
| `test/` | 1239 | 59 tests | harness | CI | Low | **Core** | **KEEP+EXTEND** |

### 2.1 `utils/response.js` — written, never adopted

53 lines defining a standard response envelope, imported by **zero** files. Every route hand-rolls its own shape. This is the concrete evidence for `SYSTEM-ARCHITECTURE.md` §4.2: *boundaries decay without tooling*. The target is generated from the OpenAPI contract; the file is a design that was never enforced, not a design that was wrong.

---

## 3. Backend — routes

109 endpoints across 18 modules.

| Route | L | Eps | Target module | Gate-1 | Disposition | Note |
|---|---:|---:|---|:--:|---|---|
| `admin.js` | 521 | 19 | platform/ops | **Core** | **REWRITE** | One flat role; no audit; duplicates KYC review |
| `ai.js` | 748 | 11 | — | **Defer** | **SPLIT + FREEZE** | 8 rule-based scorers are not AI; chat is Gate 2 |
| `users.js` | 466 | 17 | identity + finance + notification | **Core** | **REWRITE (split)** | Seven concerns behind one prefix |
| `bookings.js` | 378 | 4 | booking | **Core** | **KEEP+EXTEND** | Phase 0.5 rewrite; target-shaped |
| `providers.js` | 376 | 8 | marketplace | **Core** | **REWRITE** | Free-text service; `LIKE '%q%'` |
| `loans.js` | 350 | 5 | — | — | **REMOVE (disable)** | D-011 |
| `payments.js` | 325 | 8 | finance | **Core** | **KEEP+EXTEND** | IPN-only; add ledger, refunds |
| `auth.js` | 305 | 8 | identity | **Core** | **KEEP+REWRITE** | Both takeover paths closed in 0.5 |
| `blood.js` | 254 | 4 | booking/emergency | **Core** | **KEEP (frozen)** | D-013; consent model is the target |
| `upload.js` | 140 | 4 | platform/storage | **Core** | **REFACTOR** | Add magic-byte validation |
| `kyc.js` | 138 | 3 | identity/verification | **Core** | **REFACTOR** | Base64 → object storage |
| `sos.js` | 123 | 3 | booking/emergency | **Core** | **KEEP+EXTEND** | Add R-1010 |
| `chat.js` | 112 | 2 | booking/messaging | **Core** | **KEEP+REFACTOR** | Participation correct; move DDL |
| `schedule.js` | 111 | 3 | marketplace/availability | **Core** | **REWRITE** | Dateless slots booking never reads |
| `disaster.js` | 97 | 2 | booking/emergency | **Core** | **REWRITE (reduce)** | D-012 signposting |
| `reviews.js` | 89 | 2 | booking/review | **Core** | **KEEP** | Best-implemented flow in the codebase |
| `services.js` | 87 | 4 | marketplace/catalog | **Core** | **REWRITE** | Becomes the Service Graph API |
| `promos.js` | 86 | 2 | — | **Defer** | **FREEZE** | Validated, never applied to a price |

### 3.1 Endpoint disposition

| | Endpoints |
|---|---:|
| Carried into Gate 1 largely as-is | 21 |
| Rewritten into Gate-1 commands | 47 |
| Deferred (AI, promos, loyalty, referral) | 25 |
| Removed (loans, wallet top-up, seed) | 16 |

---

## 4. Database

17 tables in `schema.sql`, **plus 6 created at import time by route modules** — a genuine drift risk, because a table's shape then depends on which module loaded first.

| Table | Cols | Gate-1 target | Disposition | Risk |
|---|---:|---|---|:--:|
| `users` | 19 | `principal` + `account` + `membership` + `contact_verification` | **MIGRATE (split)** | **High** |
| `providers` | 21 | `provider` + `provider_capability` + `provider_coverage` + `provider_price` | **MIGRATE** | High |
| `categories` | 10 | `service_category` + `service` + `service_edge` + `capability` | **REWRITE** | High |
| `bookings` | 19 | `booking` + `quote` + `booking_event` | **MIGRATE** | High |
| `payments` | 16 | `payment` + ledger | **MIGRATE** | High |
| `wallet_transactions` | 10 | `ledger_transaction` + `ledger_entry` | **MIGRATE** | **Highest** |
| `kyc_docs` | 12 | `verification_case` + `identity_document` | **MIGRATE** | Med |
| `provider_schedule` | 6 | `availability_window` + `availability_hold` | **REWRITE** | Low — no data worth keeping |
| `reviews` | 8 | `review` | **KEEP** | Low |
| `sos_alerts` | 11 | `emergency_request` | **KEEP+REFACTOR** | Low |
| `blood_donors` | 14 | donor consent + release | **MIGRATE** | Low |
| `complaints` | 11 | `dispute` | **MIGRATE** | Low |
| `notifications` | 10 | `notification` | **KEEP+EXTEND** | Low |
| `microloans` | 16 | — | **REMOVE (disable, retain data)** | Low |
| `promos` | 14 | — | **DEFER (freeze)** | Low |
| `loyalty_log` | 7 | — | **DEFER (freeze)** | Low |
| `refresh_tokens` | 5 | `session` | **REMOVE → replace** | None — never read or written |
| `push_subscriptions`¹ | 5 | keep | **KEEP** | Low |
| `disaster_reports`¹ | 10 | `verified_source` | **MIGRATE** | Low |
| `blood_requests`¹ | 10 | keep | **KEEP** | Low |
| `chat_messages`² | — | `message` | **MIGRATE** | Low |
| `system_settings`² | — | `feature_flag` | **REFACTOR** | Low |
| `schema_migrations`¹ | 3 | keep | **KEEP** | None |
| **absent** | — | `audit_log` | **ADD** | — |
| **absent** | — | `outbox_event` | **ADD** | — |
| **absent** | — | `job` | **ADD** | — |
| **absent** | — | `idempotency_key` | **ADD** | — |
| **absent** | — | `authorization_policy` (registry) | **ADD** | — |

¹ created by migration `002` · ² created at import time by a route module

### 4.1 Runtime DDL — 8 sites to retire

**Corrected during I-01.** This section originally listed six sites in route
modules. Executing the retirement found **two more in `server.js` itself**, and
one of the tables they create is declared nowhere else in the repository.

| Module | Statement | When |
|---|---|---|
| `routes/admin.js` | `CREATE TABLE system_settings` | import |
| `routes/blood.js` | `CREATE TABLE blood_donors` + 3 × `ALTER TABLE` | import |
| `routes/chat.js` | `CREATE TABLE chat_messages` | import |
| `routes/disaster.js` | `CREATE TABLE disaster_reports` | import |
| `routes/loans.js` | `CREATE TABLE microloans` | import |
| `routes/promos.js` | 3 × `ALTER TABLE promos` | import |
| `routes/providers.js` | `ALTER TABLE users ADD nid_number` | import, unconditional |
| `routes/users.js` | `CREATE TABLE push_subscriptions` | **first use** |
| **`server.js`** | **`CREATE TABLE loyalty_log`** | **`listen()` callback** |
| **`server.js`** | **`CREATE TABLE referrals`** | **`listen()` callback** |

Two findings that only executing the change surfaced:

* **`referrals` is declared nowhere else** — not in `schema.sql`, not in any
  migration. It existed only as a string inside a startup callback whose error
  was logged and swallowed, so a database where that call failed has no
  `referrals` table and no record of why.
* **`routes/users.js` created `push_subscriptions` with `user_id INT NOT NULL`
  and an unquoted `keys` column** — the exact P1 defect migration `002`
  corrected. Because it ran on first use rather than on import, it would have
  **recreated the broken shape** on any database where the table did not yet
  exist, including a fresh one.

All ten are migrations `003` and `004` as of I-01, and the DDL is deleted from
every module. Until that landed, the production schema depended on module load
order — and `schema.sql` was not a complete description of the database.

---

## 5. Cross-cutting

| Area | Current | Gate-1 target | Disposition |
|---|---|---|---|
| Environment | Two-axis, fail-closed, tested (2.75) | unchanged | **KEEP** |
| Migrations | Runner + 2 migrations, rehearsed (2.75) | unchanged | **KEEP** |
| Authentication | JWT + per-request DB read; both takeover paths closed | Sessions, rotation, revocation, principal + memberships | **KEEP+REWRITE** |
| Authorization | **Three implementations** — `requireRole`, inline `if`, `bookingAccess` | One kernel | **REWRITE** |
| Audit | **None** | `audit_log`, in-transaction | **ADD** |
| Events | **None** | Outbox, 16 events | **ADD** |
| Jobs | **None** | Durable queue with idempotency | **ADD** |
| Money | Bounded parsing; `DECIMAL(12,2)`; mutable balance | `BIGINT` minor units; derived balance | **KEEP+MIGRATE** |
| Payment | SSLCommerz, IPN-only, reconciled | + ledger, refunds, payouts | **KEEP+EXTEND** |
| Realtime | Socket.io, participation-verified | + outbox-driven, Redis adapter | **KEEP+EXTEND** |
| Caching | In-process `Map`, 60+ literal keys | Redis | **REWRITE** |
| Testing | 59 tests, no CI | CI-gated, layered | **KEEP+EXTEND** |
| Observability | Winston + `/api/health` | + correlation, metrics, error tracking | **ADD** |
| CI | **Frontend deploy only** | Tests gate deploy | **ADD** |

---

## 6. What Phase 0.5 and 2.75 already made target-shaped

Worth naming, because it changes the size of the job:

`config/environment.js` · `db.withTransaction` · `utils/money.js` · `utils/pricing.js` (fail-closed) · `utils/bookingState.js` (guarded transitions) · `utils/bookingAccess.js` · `realtime.js` (participation-verified rooms, DB-verified admin) · deterministic ledger references under a unique index · IPN-only crediting with amount reconciliation · migration runner · the 59-test suite.

**These are not rewrites. They are relocations into the layered structure**, and they cover most of the money and state-transition surface. The genuinely new construction is: the authorization kernel, the audit log, the outbox, the job queue, the Service Graph, the double-entry ledger, and the frontend decomposition.

---

## 7. Disposition summary

| Disposition | Backend | Frontend | Database | Total |
|---|---:|---:|---:|---:|
| KEEP | 8 | 1 | 4 | 13 |
| KEEP+REFACTOR / EXTEND | 15 | 7 | 2 | 24 |
| REFACTOR | 3 | 2 | 1 | 6 |
| WRAP | 0 | 1 | 0 | 1 |
| MIGRATE | 1 | 0 | 8 | 9 |
| REWRITE | 9 | 4 | 3 | 16 |
| REMOVE / DEFER / FREEZE | 6 | 1 | 4 | 11 |
| ADD | 6 | 0 | 5 | 11 |

**The two largest single items remain `App.jsx` (5,567 lines) and the ledger migration.** The inventory finding in §1.1 makes the first materially smaller than Phase 2 assumed: a third of `App.jsx` is fabricated surfaces that are deleted, not migrated.
