# IMAP — Production Readiness Gaps

> **STATUS UPDATE — 2026-08-09 (Phase 0.5).** The findings below are the
> Phase 0 baseline and are preserved unchanged for traceability. Many have
> since been contained on branch `imap/phase-0.5-containment`. For current
> status see [`PHASE-0.5-SECURITY-REGRESSION.md`](PHASE-0.5-SECURITY-REGRESSION.md)
> — **all 12 P0 findings fixed and verified; 19 P1 fixed.** Do not read the
> text below as a description of the code as it stands today.

**Audit date:** 2026-08-09 · **Commit:** `726cc87` · **Scope:** read-only.

Status vocabulary: **VERIFIED** = I ran it and observed the result · **UNVERIFIED** = not executable in this environment · **BROKEN** = observed to be wrong · **MISSING** = does not exist.

---

## 1. Build, test, lint, types

| Check | Status | Evidence |
|---|---|---|
| Frontend build | **VERIFIED** | `npx vite build --outDir <scratch>` → `✓ 3100 modules transformed`, `✓ built in 24.28s`. Output ~1.85 MB raw / ~540 KB gzip across 8 chunks. Base path `/imap-bangladesh/` correctly applied. Built to a scratch directory; the repository's `dist/` was not modified. |
| Backend syntax | **VERIFIED** | `node --check` passes on all 43 backend `.js` files (Node v24.13.0). |
| Backend cold start | **UNVERIFIED** | Requires live TiDB credentials. Note `db.js:25-32` logs a connection failure and **continues** — the process starts and serves 500s rather than failing fast. |
| Unit tests | **MISSING** | No test file in the repository. `git ls-files | grep -iE "test|spec|__tests__"` → empty. |
| Integration tests | **MISSING** | — |
| API tests | **MISSING** | — |
| E2E tests | **MISSING** | No Playwright/Cypress config. |
| Test runner | **MISSING** | Neither `package.json` has a `test` script. `backend` has `start`, `dev`, `db:init`, `admin:reset`; `frontend` has `dev`, `build`, `preview`. |
| Linting | **MISSING** | No `.eslintrc*`, no `eslint.config.*`, no eslint dependency. |
| Formatting | **MISSING** | No Prettier config. |
| Type checking | **MISSING** | Plain `.js`/`.jsx`; no `tsconfig.json`, no `// @ts-check`. |
| Pre-commit hooks | **MISSING** | No `.husky/`, no `lint-staged`. |

**I did not run any test, because none exists.** Any claim that this codebase is tested would be false.

---

## 2. Test coverage audit (brief §22)

Critical flows and their test status:

| Flow | Unit | Integration | E2E | Notes |
|---|---|---|---|---|
| Signup | ❌ | ❌ | ❌ | |
| Login | ❌ | ❌ | ❌ | The null-`password_hash` bypass (P0-1) is exactly the case a single unit test would have caught |
| OTP send/verify | ❌ | ❌ | ❌ | `utils/otp-store.js` is pure and trivially testable |
| Google auth | ❌ | ❌ | ❌ | |
| KYC submit/review | ❌ | ❌ | ❌ | The enum mismatch (P1-9) would be caught by one integration test |
| Provider onboarding | ❌ | ❌ | ❌ | The missing-PK insert (P1-8) would be caught immediately |
| Search / provider list | ❌ | ❌ | ❌ | |
| AI matching | ❌ | ❌ | ❌ | `ai.js:336-352` is a pure function |
| Booking creation | ❌ | ❌ | ❌ | Negative `platform_fee` (P0-4) is a one-line property test |
| Payment initiate / IPN / redirect | ❌ | ❌ | ❌ | Highest-risk surface in the system, zero coverage |
| Wallet top-up / withdraw | ❌ | ❌ | ❌ | |
| Cancellation / refund | ❌ | ❌ | ❌ | |
| Booking completion + payout | ❌ | ❌ | ❌ | Repeat-completion (P0-5) is a two-call test |
| Review submission | ❌ | ❌ | ❌ | |
| Chat (REST + socket) | ❌ | ❌ | ❌ | |
| Realtime room authorization | ❌ | ❌ | ❌ | P0-7 |
| AI action safety | ❌ | ❌ | ❌ | No AI actions exist to test |
| Loan apply / disburse | ❌ | ❌ | ❌ | Non-idempotent disbursement (P0-6) |
| SOS | ❌ | ❌ | ❌ | |
| Admin actions | ❌ | ❌ | ❌ | The broken suspend (P1-11) has been shipped |

**0 of 20 critical flows have any automated coverage.**

Of the 12 P0 findings, **9 would be caught by a single well-chosen test each** (P0-1, P0-3, P0-4, P0-5, P0-6, P0-7, P0-8, P0-11, P0-12). This is the highest-leverage investment available.

---

## 3. CI/CD

| Pipeline | Status | Evidence |
|---|---|---|
| Frontend | **PARTIAL** | `.github/workflows/deploy.yml` — on push to `main`: checkout → setup-node 20 → `npm ci` → `npm run build` (with `VITE_API_URL` injected) → `peaceiris/actions-gh-pages@v4`. Works. **No test step, no lint step, no type check.** |
| Backend | **MISSING** | No workflow. `render.yaml:9` `buildCommand: npm install`, `:10` `startCommand: node server.js`, `:112` `autoDeploy: true` — every push to `main` deploys the backend with no build, no test, no gate. |
| Database migrations | **MISSING** | No migration step in either pipeline. Schema changes happen via runtime DDL when the new code first imports the module (`DATABASE-GAPS.md §1`). |
| Rollback | **MISSING** | No tagged releases, no versioning, no documented rollback. Render's dashboard rollback exists but is not documented anywhere. |
| Environments | **MISSING** | One environment. No staging, no preview, no `NODE_ENV=staging` path. |
| Secret scanning | **MISSING** | Not enabled; the repository does contain hardcoded credentials (`admin123`, `demo1234`) that a scanner would flag. |
| Dependency scanning | **MISSING** | No Dependabot config, no `npm audit` step. |

**Node version drift:** CI uses Node 20 (`deploy.yml:19`); `render.yaml` pins no runtime version; the local environment is Node 24.13.0. Neither `package.json` declares an `engines` field.

---

## 4. Environment and configuration

`render.yaml` provisions 30 environment variables. **Five names do not match what the code reads** — each fails silently.

| Code reads | Provisioned as | File:line | Failure mode |
|---|---|---|---|
| `R2_BUCKET_NAME` / `S3_BUCKET_NAME` | `R2_BUCKET` / `AWS_S3_BUCKET` | `utils/storage.js:34` vs `render.yaml:88,101` | Bucket silently defaults to `"imap-media"`; uploads go to a bucket that may not exist |
| `BULKSMS_API_KEY` / `BULKSMS_SENDER_ID` | `BD_SMS_API_KEY` / `BD_SMS_SENDER_ID` | `utils/sms.js:43` vs `render.yaml:73,75` | `bulksmsbd` sends `api_key=undefined` |
| `TWILIO_PHONE` | `SMS_FROM` | `utils/sms.js:57` vs `render.yaml:63` | Twilio `From` is `undefined` |
| `SSL_IS_SANDBOX` | *(nothing reads it)* | `render.yaml:57` vs `utils/payment.js:15` | Sandbox mode is derived from `NODE_ENV` instead; the provisioned flag has no effect |
| `SSLCOMMERZ_STORE_ID/_PASSWORD` | ✓ matches `render.yaml:53-56` — but `.env.example:35-36` documents `SSL_STORE_ID`/`SSL_STORE_PASSWORD` | `utils/payment.js:13-14` | Anyone following `.env.example` runs in mock mode → **P0-12, free wallet credit** |

Additional configuration findings:

* **Secrets in the repository.** `schema.sql:353-356` seeds an admin whose password is documented as `admin123` in `scripts/resetAdmin.js:6-9`; `server.js:231` hashes `"demo1234"` for six seeded provider accounts. `render.yaml:16-20` also contains the live TiDB host and username in plaintext (password is `sync: false`).
* **`frontend/.env.production` is committed** (deliberately — `.gitignore:15` documents why) and contains only `VITE_API_URL`. Correct.
* **No config validation on boot.** Nothing checks that required variables are present. `JWT_SECRET` unset means `jwt.sign` throws on every login; `db.js` logs and continues on a failed connection.
* **CORS hardcodes a second allowed origin** beyond the env var (`server.js:146`).
* **`SEED_SECRET` is `generateValue: true`** (`render.yaml:106`) so a secret exists, but the seed endpoint has a fallback path that bypasses it (P0-9).

---

## 5. Observability

| Capability | Status | Evidence |
|---|---|---|
| Structured logging | **VERIFIED (code)** | `utils/logger.js` — Winston, JSON in production, colourised in dev, `exitOnError: false`, `LOG_LEVEL` configurable |
| Request logging | **VERIFIED (code)** | `middleware/requestLogger.js` — method, url, status, duration, ip, userId; level by status class |
| Request correlation | **PARTIAL** | `server.js:128-134` generates `X-Request-ID` and echoes a client-supplied one, but `req.requestId` is **never used** by `requestLogger` or any handler, so logs cannot be correlated |
| Health check | **VERIFIED (code)** | `GET /api/health` (`server.js:341-361`) — DB status + latency, uptime, heap/RSS, socket client count. Wired to `render.yaml:110`. Genuinely good. |
| Metrics | **MISSING** | No Prometheus, StatsD, or equivalent |
| Tracing | **MISSING** | No OpenTelemetry |
| Error tracking | **MISSING** | No Sentry/Rollbar. Unhandled errors go to stdout via `server.js:367-370`. |
| Alerting | **MISSING** | Nothing pages on error rate, latency, or failed payments |
| Dashboards | **MISSING** | |
| Uptime monitoring | **MISSING** | No external checker configured in-repo |
| Log retention / shipping | **MISSING** | Console only; Render's default retention applies |
| PII redaction in logs | **MISSING** | `requestLogger` logs `userId` and IP for every request; `ai.js` logs Gemini error bodies (`:53-54`); `blood.js:139` logs requester name and message. No redaction layer. |
| Business metrics | **MISSING** | No funnel, no conversion, no "needs resolved" (brief §2.10) |

**Graceful shutdown is implemented well** (`server.js:400-428`): SIGTERM/SIGINT close the HTTP server, drain the DB pool, and force-exit after 10 s. `uncaughtException` triggers shutdown; `unhandledRejection` logs only.

---

## 6. Reliability and resilience

| Concern | Status |
|---|---|
| Single point of failure | The entire API is one Render process. In-process cache (`utils/cache.js:12`) and OTP store (`utils/otp-store.js:5`) make a second instance actively incorrect, so it cannot be scaled out without change. |
| Cold starts | Render free tier sleeps on idle. Mitigated client-side by `wakeBackend()` (`api.js:15-17`) and a 1-second retry (`:45-52`) — a workaround, not a fix. |
| Outbound timeouts | **MISSING** on every external call: Gemini (`ai.js:41`), OpenAI (`:67`), Google tokeninfo (`auth.js:193`), SMS (`utils/sms.js:12,32`), SSLCommerz (`utils/payment.js:37,43`). A hung upstream holds a request open indefinitely. |
| Retries / circuit breakers | **MISSING** on all outbound calls |
| Backpressure | Rate limits only; no queue, so a spike hits the DB directly |
| DB connection limit | `connectionLimit: 20`, `queueLimit: 0` (unbounded queue) — `db.js:17-18`. An unbounded queue turns a slow DB into unbounded memory growth. |
| Idempotency | **MISSING** everywhere (`SECURITY-GAPS.md` P2-7) |
| Backups | **UNVERIFIED** — delegated to TiDB Cloud. No documented RPO/RTO, no restore drill, no export job. |
| Disaster recovery | **MISSING** — no runbook, no documented recovery procedure |

---

## 7. DEMO-TO-PRODUCTION GAP LIST (brief §20)

| # | Feature | File | Current behavior | Why it is not production | Production requirement | Priority |
|---|---|---|---|---|---|---|
| 1 | Seeded admin account | `backend/schema.sql:353-356`, `scripts/resetAdmin.js:25` | `admin@imap.bd` / `admin123`, role `admin`, seeded on every `initDb` run | Credential is published in the repository | Remove from schema; provision the first admin out-of-band with a generated password; rotate the live one | **P0** |
| 2 | Seeded provider accounts | `backend/server.js:231-269` | 6 accounts, password `demo1234`, `nid_verified=1`, `trust_score=90`, ratings 4.6–4.9, `total_jobs` up to 847 | Known credentials with wallets; fake providers indistinguishable from real in the public directory | Remove from `server.js`; keep seeding in `scripts/` gated to non-production | **P0** |
| 3 | Public seed endpoint | `backend/server.js:189-202` | `GET /api/admin/seed-demo` runs without a secret when fewer than 4 providers have a service type | Unauthenticated write to production data | Require `SEED_SECRET` unconditionally; 404 when `NODE_ENV=production` | **P0** |
| 4 | Payment mock mode | `backend/routes/payments.js:78-94` | If gateway creds are unset, marks payment `success` and credits the wallet | Unlimited free balance; selected by env-var absence, not by `NODE_ENV` | Hard-fail in production when unconfigured | **P0** |
| 5 | Seeded disaster alerts | `backend/routes/disaster.js:24-31` | 4 fabricated alerts incl. "cyclone / critical / Cox's Bazar", served publicly | Fabricated emergency information; physical-safety risk | Remove; source from a verified feed or disable the feature | **P0** |
| 6 | Seeded blood donors | `backend/routes/blood.js:33-44` | 8 fabricated donors with phone numbers and GPS | Users may call fabricated numbers in a medical emergency | Remove; real donors only, with consent | **P0** |
| 7 | Hardcoded disaster alerts (client) | `frontend/src/App.jsx:3547-3562` | `ALERTS`, `SHELTERS`, `HOTLINES` with evacuation instructions | Same as #5, rendered even when the API is reachable | Remove; render only verified server data | **P0** |
| 8 | Hardcoded blood donors (client) | `frontend/src/App.jsx:3780-3789` | 8 more fabricated donors | Same as #6 | Remove | **P0** |
| 9 | Blood request is a log line | `backend/routes/blood.js:131-145` | Responds "Request sent to available donors"; writes `logger.info` | The user believes help was dispatched | Implement dispatch, or state plainly that the feature is unavailable | **P0** |
| 10 | SOS "call center" claim | `backend/routes/sos.js:44` | Responds "sent to admin & call center"; broadcasts to all sockets | No call centre exists; PII broadcast | Route to an admin room; make the message describe what happened | **P0** |
| 11 | Fake payment OTP | `frontend/src/App.jsx:501-588` | Generates a 6-digit code and a fake phone number in the browser, displays both, labels it "Demo OTP" | Teaches users to trust an on-screen code as payment confirmation | Remove; real gateway 2FA or nothing | **P0** |
| 12 | Free ৳500 on signup | `backend/schema.sql:22` | `balance DECIMAL(12,2) DEFAULT 500.00` | Every account is created with spendable money and no ledger entry | Default 0; any promotional credit must be an explicit, logged grant | **P0** |
| 13 | Admin panel fallback rows | `frontend/src/pages/AdminPanel.jsx:118-133` + loaders at `:296,320,340,361` | Fake KYC applications and support tickets remain visible when the API returns empty | Admin cannot distinguish real work from fixtures | Remove initial fixtures; render empty states | **P1** |
| 14 | Customer app fallback data | `frontend/src/constants/data.js`, `App.jsx:4371-4377`, `contexts/index.jsx:16-18` | Providers, bookings, notifications fall back to fabricated arrays | Failure is invisible; the product appears populated when it is not | Remove; real empty and error states | **P1** |
| 15 | Landing statistics | `frontend/src/pages/LandingPage.jsx:112`, `:698-706` | Animated counters to 500 / 10,000 / 1,200 / 4.8 | Fabricated marketing claims | Serve from `/api/admin/stats` equivalents, or remove | **P1** |
| 16 | "LIVE ACTIVITY TICKER" | `frontend/src/pages/LandingPage.jsx:715-737` | CSS marquee over a static array, presented as live | Fabricated social proof | Real feed or remove the "live" framing | **P1** |
| 17 | schema.org aggregateRating | `frontend/index.html:55-59` | `4.8` over `10000` reviews in structured data | Fabricated data published to search engines | Compute from `reviews`, or remove the block | **P1** |
| 18 | Seeded promo redemption counts | `backend/routes/promos.js:14-23` | `used_count` up to 1,890 seeded | Fabricated scarcity/popularity signals | Seed at 0 or not at all | **P1** |
| 19 | Hardcoded coupons (client) | `frontend/src/App.jsx:3166-3173` | 6 coupons with fabricated counts | Same | Remove | **P1** |
| 20 | Fabricated wallet transactions | `frontend/src/App.jsx:3305-3314` | 8 fake transactions incl. bKash/Nagad payments | User sees financial history that never happened | Remove | **P1** |
| 21 | AI fallback fabricates facts | `backend/routes/ai.js:92-142` | Asserts credit score 82/100, "45+ electricians", refund and cancellation policies | The assistant states false facts about the user's account and platform policy | Rewrite to acknowledge uncertainty; ground in real data | **P0** |
| 22 | Simulated AI streaming | `backend/routes/ai.js:229-236` | Replays a static string 3 characters at a time with a 22 ms delay | Presents a canned answer as live generation | Return the fallback in one response, clearly marked | **P2** |
| 23 | Provider "views" metric | `backend/routes/providers.js:174` | `views: total_jobs * 4` | Invented analytics shown to providers | Track real views or remove the tile | **P2** |
| 24 | Blood-donor distance | `backend/routes/blood.js:61-65` | Haversine from Dhaka city centre, not the user | Displayed as the user's distance to the donor | Compute from the requester's location or omit | **P2** |
| 25 | Auto-seeded welcome notifications | `backend/routes/users.js:162-177` | A GET inserts 3 notifications incl. a promo claim | Read endpoint mutates state; the promo may not exist | Move to a signup event | **P2** |
| 26 | Auto-seeded schedule slots | `backend/routes/schedule.js:8-39` | A GET inserts 14 slots | Same pattern; the slots are never honoured by booking | Move to provider onboarding | **P2** |
| 27 | Static service catalogue | `frontend/src/constants/data.js:1-96` | 19 categories with counts summing to 2,142, rendered as "2,142+ providers available" | The DB has 12 categories and far fewer providers | Serve from `/api/services` | **P1** |
| 28 | `PF_PROVIDERS` portfolio | `frontend/src/App.jsx:2846` | 2 hardcoded providers with emoji galleries | Fabricated portfolios | Real media or remove the page | **P2** |
| 29 | Facebook "social login" | `frontend/src/pages/AuthPage.jsx:122-138` | Generates a random `socialId` client-side and calls `/auth/social-login` with `mockEmails.facebook = "user@facebook.com"` | Not a real OAuth flow; creates unverified identities | Real OAuth or remove the button | **P1** |

---

## 8. Deployment topology

```
GitHub main ──push──> Actions (build only) ──> gh-pages ──> GitHub Pages (frontend)
            └─push──> Render autoDeploy (no build/test) ──> single Node process
                                                              └──> TiDB Serverless (ap-northeast-1)
```

| Concern | Finding |
|---|---|
| Frontend and backend are on unrelated platforms with no shared release | A breaking API change ships to Render before or after the frontend, with no coordination |
| Region | TiDB in `ap-northeast-1` (Tokyo); Render region unspecified in `render.yaml`; users are in Bangladesh. Latency is unmeasured. |
| CDN | GitHub Pages fronts the SPA. User media (base64 in DB) is served through the API with no CDN. |
| TLS | Terminated by GitHub Pages and Render. |
| Scaling | `render.yaml` declares no instance count or plan. In-process state prevents horizontal scaling regardless. |
| Zero-downtime | Render performs a rolling replace; combined with runtime DDL (`DATABASE-GAPS.md §1`), a deploy can run `CREATE TABLE`/`ALTER TABLE` concurrently on two instances. |

---

## 9. Summary

| Category | VERIFIED | UNVERIFIED | BROKEN | MISSING |
|---|---|---|---|---|
| Build | frontend build, backend syntax | backend runtime start | — | — |
| Tests | — | — | — | unit, integration, API, DB, E2E, security, AI eval, payment, realtime |
| Quality gates | — | — | — | lint, format, types, hooks |
| Migrations | — | — | runtime DDL with swallowed errors | migration tool, versioning, rollback |
| Config | health check, graceful shutdown, structured logging | backups | 5 env-var name mismatches | boot-time validation, staging environment |
| CI/CD | frontend deploy | — | backend deploys untested | backend pipeline, migration step, rollback procedure, secret/dependency scanning |
| Observability | logging, request logging, health | — | request-id generated but unused | metrics, tracing, error tracking, alerting, dashboards, PII redaction |
| Resilience | graceful shutdown | backups/DR | in-process state blocks scale-out | timeouts, retries, circuit breakers, idempotency, runbooks |

**Nothing in this document was fixed.** The frontend build and backend syntax check are the only two claims here that were executed; every other status is derived from reading the code.
