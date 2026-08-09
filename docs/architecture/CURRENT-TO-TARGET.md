# IMAP 2.0 — Current → Target Mapping

**Status:** PROPOSED · **Phase:** 2 · **Date:** 2026-08-09
**Evidence:** `docs/audit/` · **Decisions:** `ARCHITECTURE-DECISIONS.md` · **Sequencing:** `MIGRATION-STRATEGY.md`

**Disposition vocabulary**

| Term | Meaning |
|---|---|
| **KEEP** | Correct as-is. Moves unchanged |
| **KEEP+REFACTOR** | Logic is sound; relocated into the layered structure |
| **WRAP** | Left running behind a new interface while callers migrate |
| **MIGRATE** | Data or behaviour moves to a new model |
| **REWRITE** | Design is wrong; rebuilt against the target |
| **REMOVE** | Deleted or disabled |

**Risk** is the risk of *changing* it, not of leaving it.

---

## 1. Frontend

| Current | Target | Disposition | Reason | Depends on | Risk |
|---|---|---|---|---|---|
| `App.jsx` (5,567 L, ~50 components, ~30 page keys, 10 static arrays) | `apps/web` with routes + feature modules (AD-012) | **REWRITE (incremental)** | 31% of the codebase in one file; no routing, so no deep links, no SEO, no analytics attribution, no continuity | Routing, design system | **High** — but decomposed route by route, not at once |
| `api.js` (408 L, JSDoc, 18 namespaces) | `packages/api-client`, generated from OpenAPI | **KEEP+REFACTOR → then generate** | The best-organised file in the frontend. Its structure becomes the generation target | OpenAPI contract | Low |
| `socket.js` + `hooks/useSocket.js` | `packages/realtime-client` | **REWRITE (merge)** | Two independent singletons both connect with the same token — duplicated connections per user | — | Low |
| `constants/data.js` (19 fake categories, 6 providers, 4 bookings, 5 notifications) | Deleted; data from the Service Graph API | **REMOVE** | Root cause of the fallback-to-fabricated-data defect. `SVCS` counts sum to 2,142 invented providers | Catalog API, empty states | **High** — every consumer needs a real empty state first |
| `constants/theme.js` (322 L token set) | `packages/ui` foundation | **KEEP** | A genuine, consistently-used token set. The best asset in the frontend | — | None |
| `constants/translations.js` (~108 keys) | `packages/i18n` | **KEEP+REFACTOR** | Structure is right; coverage is not — most strings are inline `lang==="en"?…:…` ternaries across every file | String extraction | Medium — mechanical but broad |
| `components/ui.jsx` (4 primitives) | `packages/ui` component library | **KEEP+EXPAND** | Correct direction, radically incomplete. A11y and perf must be fixable once, not in hundreds of inline styles | Design system decision | Low |
| `components/VoiceCommand.jsx` (Web Speech → keyword → navigate) | Voice input into the intent pipeline (R-102) | **WRAP → REWRITE at Phase E** | Works and is genuinely useful. The transcript must reach the model instead of a keyword table | AI layer | Low |
| `contexts/index.jsx` (seeds context with mock data) | Split contexts; no mock seeds | **REFACTOR** | `providers: PROVIDERS, bookings: MY_BOOKINGS, balance: 1545` as defaults | `data.js` removal | Low |
| `pages/AuthPage.jsx` | Auth feature module | **KEEP+REFACTOR** | Phase 0.5 removed the fabricated Facebook flow and the hidden `admin123` quick-login. What remains is sound | Identity API | Low |
| `pages/AdminPanel.jsx` (1,556 L, Ant Design, fake fallback rows) | `apps/admin`, separate build | **REWRITE** | Must never ship in the consumer bundle (~135 KB gz). Fixture rows still render when the API returns empty | Ops API, role model | Medium |
| `pages/ProviderPortal.jsx` (791 L) | Provider route group in `apps/web` | **KEEP+REFACTOR** | Functionally close to right; errors are swallowed and earnings lack a commission breakdown | Provider API | Low |
| `pages/KYCPage.jsx` (254 L) | Verification feature | **REFACTOR** | Must upload direct-to-storage instead of base64 (AD-011) | Storage | Medium |
| `pages/LandingPage.jsx` (973 L) | Marketing route | **REFACTOR** | Animation work is good and stays. Counters animating to 10,000 customers / 1,200 providers from constants must go | Real metrics | Low |
| `index.html` (schema.org `aggregateRating` 4.8 / 10,000 reviews) | Computed or absent | **REFACTOR** | Fabricated structured data published to search engines | Real review data | Low |
| `public/sw.js` (network-first) | Stale-while-revalidate for the shell | **KEEP+REFACTOR** | Works; suboptimal on slow networks | — | Low |
| `.vite/deps/` committed to git | Removed | **REMOVE** | Build cache in version control | — | None |

---

## 2. Backend — platform

| Current | Target | Disposition | Reason | Risk |
|---|---|---|---|---|
| `db.js` (mysql2 pool + `withTransaction` from Phase 0.5) | Infrastructure layer, plus a connection-pool config fix | **KEEP+REFACTOR** | `withTransaction` is exactly right. Fix: fail fast on connection error rather than logging and continuing; bound `queueLimit` (currently `0` = unbounded); move `timezone: "+06:00"` out of the pool (AD: UTC storage) | Low |
| `server.js` (428 L: app + io + health + shutdown) | `app.ts`, `realtime.ts`, `bootstrap.ts`, `composition/` | **REFACTOR (split)** | Mixed concerns. Graceful shutdown and the health check are good and stay | Low |
| `realtime.js` (extracted in Phase 0.5) | `transport/realtime/` | **KEEP+REFACTOR** | Participation-verified rooms and DB-verified admin membership are the target design already | Low |
| `middleware/auth.js` | Identity + authorization kernel | **KEEP+REFACTOR** | Re-reading the user from the database per request is correct (role changes take effect immediately). Must return a *principal with memberships* (AD-017), not a user row | Medium |
| `middleware/validate.js` | Transport validation, generated from OpenAPI | **KEEP → then generate** | Clean wrapper, under-applied | Low |
| `middleware/requestLogger.js` | Observability | **KEEP+FIX** | Wire in `req.requestId` — generated at `server.js:129` and never used. Add PII redaction | Low |
| `utils/logger.js` (Winston, JSON in prod) | Observability | **KEEP** | Correct | None |
| `utils/response.js` (written, imported by nothing) | One error/response contract | **REWRITE as the contract** | The standardisation already exists in the file; it was never adopted. The target is generated from OpenAPI | Low |
| `utils/cache.js` (in-process `Map`) | Redis | **REWRITE** | Blocks horizontal scaling (R-1107); 60+ literal cache keys invalidated by hand across 9 files, provably incompletely | Medium |
| `utils/otp-store.js` (in-process `Map`) | Redis | **REWRITE (port logic)** | TTL, attempt limiting and resend throttling are good — port them | Low |
| `utils/money.js` (Phase 0.5) | Domain value object, minor units | **KEEP+MIGRATE** | The validation rules are exactly right. Representation changes to `BIGINT` minor units (AD-008) | Medium |
| `utils/pricing.js` (Phase 0.5) | Pricing domain + Quote entity | **KEEP+REWRITE** | The fail-closed principle is the target. Must grow into three price models and issue quotes | Medium |
| `utils/bookingState.js` (Phase 0.5) | Booking domain state machine | **KEEP+EXTEND** | Correct design. Add `arrived`, `awaiting_confirmation`, `disputed` | Low |
| `utils/bookingAccess.js` (Phase 0.5) | Authorization policy | **KEEP+REFACTOR** | Becomes one policy in the kernel rather than a standalone helper | Low |
| `utils/payment.js` | `PaymentGateway` port + SSLCommerz adapter | **KEEP+REFACTOR** | Add timeouts (none today), retries, and the amount-reconciliation contract | Medium |
| `utils/sms.js`, `utils/push.js`, `utils/storage.js` | Notification and storage adapters | **KEEP+REFACTOR** | Env-var names fixed in Phase 0.5. Add timeouts; move sends to jobs (AD-016) | Low |
| `scripts/migrate.js` + `migrations/` (Phase 0.5) | Same | **KEEP** | Correct and already in use | None |
| `scripts/initDb.js` (splits `schema.sql` on `;`) | Removed | **REMOVE** | Superseded by migrations. The naive split also breaks on any `;` in a string literal | None |
| `scripts/resetAdmin.js` (Phase 0.5) | Same | **KEEP** | Generates or requires a real password; no literal credential | None |
| `scripts/seedDemo.js` | Dev-only fixtures | **KEEP+REFACTOR** | Gated to non-production in Phase 0.5. Category inserts still fail silently (string ids into an INT PK) | Low |
| `schema.sql` | Superseded by migrations | **MIGRATE → archive** | Keep as history; it is no longer the source of truth | Low |
| `test/` (31 P0 regression tests) | Extended suite | **KEEP+EXTEND** | Genuinely valuable and negative-control verified. The module-cache injection harness is workable but not a long-term seam | Low |

---

## 3. Backend — routes

| Current route | Target module | Disposition | Reason |
|---|---|---|---|
| `auth.js` (258 L) | `identity` | **KEEP+REWRITE** | Phase 0.5 closed both takeover paths. Model changes to principal/credential/session and accounts+memberships (AD-017) |
| `users.js` (418 L — profile, wallet, notifications, loyalty, referral, complaints, settings, push) | Split across `identity`, `finance`, `notification`, `loyalty` | **REWRITE (split)** | Seven unrelated concerns behind one path prefix |
| `providers.js` (352 L) | `provider` + `discovery` | **REWRITE** | Free-text service string → capabilities; free-text area → coverage areas; `LIKE '%q%'` → structured discovery |
| `bookings.js` (Phase 0.5 rewrite) | `booking` | **KEEP+EXTEND** | Server pricing, state machine, transactions and idempotent payout are the target design. Add quotes, holds, `arrived`, customer-confirmed completion |
| `payments.js` (Phase 0.5 rewrite) | `finance` | **KEEP+EXTEND** | IPN-only crediting, amount reconciliation and fail-closed 503 are correct. Add the ledger, refunds and payouts |
| `kyc.js` (138 L) | `identity/verification` | **REFACTOR** | Enum aligned in Phase 0.5. Images must move to object storage (AD-011) |
| `reviews.js` (89 L) | `trust/review` | **KEEP** | **The best-implemented flow in the codebase.** Eligibility correctly enforced |
| `chat.js` (112 L) | `messaging` | **KEEP+REFACTOR** | Participation checks are correct on both GET and POST. Move DDL to a migration |
| `services.js` (87 L) | `catalog` | **REWRITE** | Thin CRUD over a flat 12-row table. Becomes the Service Graph API |
| `schedule.js` (111 L) | `availability` | **REWRITE** | Free-text dateless slots that booking never reads. Double-booking is currently unpreventable |
| `admin.js` (471 L) | `administration` + ops API | **REFACTOR** | Correct role gating; no audit log, one flat admin permission, duplicate KYC review with `kyc.js` |
| `ai.js` (751 L) | **Split three ways** | **SPLIT** | Chat → `ai` module behind the tool layer. The 8 rule-based scorers → `discovery/ranking` and `trust/risk`, running server-side on the write path, and **stop being called AI**. Fabricating fallback strings were removed in Phase 0.5 |
| `promos.js` (86 L) | `pricing/promotion` | **FREEZE → REWRITE** | Validated but never applied to any price. Rebuild when discounting is a real requirement |
| `sos.js` (97 L) | `emergency` | **KEEP+EXTEND** | Admin-room routing and truthful responses are correct. Add R-1010 provider in-booking emergency |
| `blood.js` (148 L) | `emergency/blood` | **KEEP (frozen)** | Consent model, masking and per-release logging are the target design (D-013) |
| `disaster.js` (73 L) | `emergency/sources` | **REWRITE (reduce)** | Becomes signposting over `verified_source` (D-012) |
| `loans.js` (296 L) | — | **REMOVE (disable)** | D-011. Requires a licence. No lending entities in the target model |
| `upload.js` (140 L) | Storage adapter | **REFACTOR** | Add magic-byte validation; allow provider proof upload; signed URLs |

---

## 4. Database

| Current | Target | Disposition | Risk |
|---|---|---|---|
| `users` (identity + role + balance + points + avatar) | `principal` + `account` + `membership` + `contact_verification`; balance → ledger; avatar → object storage | **MIGRATE (split)** | **High** — the most referenced table |
| `providers` (one free-text service string) | `provider_profile` + `provider_capability` + `coverage_area` + `provider_price` | **MIGRATE** | High — needs human capability mapping |
| `categories` (12 rows, flat) | `category` + `service` + `service_edge` + `capability` | **REWRITE** | High — three conflicting taxonomies to reconcile |
| `provider_schedule` (free-text, dateless) | `availability_window` + `slot_hold` | **REWRITE** | Medium — no useful data to preserve |
| `bookings` | `booking` + `quote` + `booking_event` | **MIGRATE** | High — live data |
| `payments` | `payment` + `payment_attempt` + ledger | **MIGRATE** | High — financial |
| `wallet_transactions` (best-effort log) | `ledger_transaction` + `ledger_entry` | **MIGRATE** | **Highest** — the existing log cannot reconstruct `users.balance`; opening balances must be established by a documented, reviewed exercise, not inferred |
| `reviews` | `review` | **KEEP** | Low |
| `kyc_docs` (4 × `LONGTEXT` base64) | `verification_case` + `verification_document` (object refs) | **MIGRATE** | Medium — bytes move out of the database |
| `notifications` | `notification` + `notification_preference` | **KEEP+EXTEND** | Low |
| `complaints` | `dispute` | **MIGRATE** | Low |
| `refresh_tokens` (**never read or written**) | `session` | **REMOVE → replace** | None |
| `microloans` | — | **REMOVE** | D-011. Wind-down owned by the business |
| `blood_donors` | `donor_consent` + `contact_release` | **MIGRATE** | Low |
| `disaster_reports` | `verified_source` (+ community reports, unstyled) | **MIGRATE** | Low |
| `sos_alerts` | `emergency_request` | **KEEP+REFACTOR** | Low |
| `promos`, `loyalty_log`, `referrals` | `promotion`, `loyalty_ledger`, `referral` | **DEFER** | Low — post-MVP |
| `system_settings` | Config + `feature_availability` | **REFACTOR** | Low |
| `push_subscriptions` (`user_id INT` vs UUID — fixed in 0.5) | Same | **KEEP** | Low |
| Runtime DDL in 9 modules | Migrations only | **REMOVE** | Medium — each import-time `CREATE TABLE` must be replaced by a migration |
| **Absent: audit log** | `audit_log` | **ADD** | — |
| **Absent: outbox** | `outbox_event` | **ADD** | — |
| **Absent: need** | `need` + `need_understanding` + `need_outcome` | **ADD** | — |
| **Absent: idempotency** | `idempotency_key` | **ADD** | — |

---

## 5. Cross-cutting

| Area | Current | Target | Disposition |
|---|---|---|---|
| **Authentication** | JWT, DB-checked; two takeover paths closed in 0.5 | Sessions with rotation and revocation; principal + memberships | **KEEP+REFACTOR** |
| **Authorization** | Three implementations: `requireRole`, inline `if`s, `bookingAccess.js` | One kernel, `(actor, action, resource)` | **REWRITE** |
| **Payment** | SSLCommerz, IPN-only, reconciled (0.5) | Same + ledger + refunds + payouts | **KEEP+EXTEND** |
| **Realtime** | Socket.io, participation-verified (0.5) | Same + Redis adapter + outbox-driven | **KEEP+EXTEND** |
| **AI** | Chat proxy + 8 rule-based scorers | Tool layer on the authorization chain | **REWRITE** |
| **Admin** | One `admin` role, no audit | Six roles, full audit, reason required | **REWRITE** |
| **Provider** | Functional portal | Same + capabilities, real availability, earnings breakdown | **KEEP+EXTEND** |
| **Emergency** | Truthful since 0.5 | Isolated context + capability declaration as data | **KEEP+EXTEND** |
| **Observability** | Winston + `/api/health` | Correlation, metrics, traces, error tracking, AI telemetry | **ADD** |
| **CI** | Frontend build only | Backend tests gate deploy; contract tests; bundle budget; AI eval | **ADD** |

---

## 6. Summary

| Disposition | Count | Notable |
|---|---:|---|
| **KEEP** | 8 | `theme.js`, `reviews.js`, `logger.js`, migration runner, Phase 0.5 state machine, graceful shutdown, health check, test suite |
| **KEEP+REFACTOR / EXTEND** | 24 | Most of the Phase 0.5 work is target-shaped already |
| **WRAP** | 1 | `VoiceCommand.jsx` |
| **MIGRATE** | 12 | Mostly data |
| **REWRITE** | 17 | `App.jsx`, catalog, availability, cache, authorization, AI, admin |
| **REMOVE** | 7 | `constants/data.js`, `loans.js`, `initDb.js`, `refresh_tokens`, `microloans`, runtime DDL, committed build cache |

**The headline:** Phase 0.5 already moved the money, auth, state-machine and realtime code toward the target. The genuinely new work is the Service Graph, the ledger, the audit log, the authorization kernel and the AI tool layer — plus decomposing `App.jsx`, which is the single largest item and the one most likely to be underestimated.
