# IMAP — Documentation Inventory

> **STATUS UPDATE — 2026-08-09 (Phase 0.5).** The findings below are the
> Phase 0 baseline and are preserved unchanged for traceability. Many have
> since been contained on branch `imap/phase-0.5-containment`. For current
> status see [`PHASE-0.5-SECURITY-REGRESSION.md`](PHASE-0.5-SECURITY-REGRESSION.md)
> — **all 12 P0 findings fixed and verified; 19 P1 fixed.** Do not read the
> text below as a description of the code as it stands today.

**Audit date:** 2026-08-09 · **Commit:** `726cc87` · **Scope:** read-only.

---

## 1. Search performed

Searched the full working tree (excluding `node_modules`, `.git`, `dist`) for `README`, `SRS`, `PRD`, `MRD`, `BRD`, `architecture`, `design`, `spec`, `requirements`, `API`, `database`, `schema`, `ERD`, `UX`, `UI`, `security`, `deployment`, `runbook`, `ADR`, `decision`, `roadmap`, `blueprint`, `AI`, `agent`, `prompt`, `business`, `product`, and for `*.md`, `*.mdx`, `*.txt`, `*.pdf`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`.

**Result: exactly one Markdown file exists in the repository — `README.md`.** There is no `docs/` directory (this audit created `docs/audit/` and nothing else), no `.txt` documentation, no PDF, no ADR, no `CONTRIBUTING.md`, no `AGENTS.md`, no repository-level `CLAUDE.md`, no `LICENSE`.

Requirements-bearing artifacts that exist **outside** Markdown:

| Artifact | What it specifies | Authority |
|---|---|---|
| `backend/schema.sql` (356 L) | Data model, enums, constraints, seed data | **De-facto source of truth for the schema**, but contradicted by runtime DDL in 9 modules |
| `render.yaml` (112 L) | Backend deployment topology, 30 env vars | **De-facto source of truth for deployment** |
| `backend/.env.example` (77 L) | Environment contract | **Contradicts the code** for `SSL_STORE_ID`/`SSL_STORE_PASSWORD` (P0-12) |
| `frontend/.env.example` (17 L) | Frontend environment contract | Current |
| `frontend/src/api.js` (408 L, JSDoc) | The only per-endpoint documentation that exists | **De-facto API contract**, client-side only |
| `.github/workflows/deploy.yml` | Frontend CI/CD | Current |
| `frontend/public/manifest.json` | PWA identity | Current |
| `frontend/index.html:27-70` | schema.org LocalBusiness/WebSite JSON-LD | **Contains fabricated data** (`aggregateRating 4.8 / 10000`) |
| `backend/routes/ai.js:2-12` | AI endpoint list (header comment) | Current but incomplete — omits `/chat/stream` and `/debug` |
| `backend/routes/payments.js:3-13` | Payment endpoint list (header comment) | Current |
| `backend/routes/loans.js:2-9` | Loan endpoint list (header comment) | Current |
| `backend/scripts/resetAdmin.js:2-9` | Admin credentials | **Publishes `admin123`** (P0-9) |
| Git history (91 commits) | Change rationale | Commit messages are descriptive and useful; the only decision record that exists |

---

## 2. Existing documents

| Document | Exists | Location | Current? | Source of Truth? | Conflicts | Action |
|---|---|---|---|---|---|---|
| README | ✅ | `README.md` | **Yes (corrected in Phase 0.5)** | For local setup, yes | Resolved — the inaccurate security checklist was replaced with a pointer to `docs/audit/`, and the admin-bootstrap step no longer leaves a published credential in place | Split deployment into `docs/engineering/DEPLOYMENT.md` in Phase 1 |
| Phase 0.5 containment plan | ✅ | `docs/audit/PHASE-0.5-CONTAINMENT-PLAN.md` | Yes | Yes, for containment scope | — | Keep |
| Phase 0.5 regression report | ✅ | `docs/audit/PHASE-0.5-SECURITY-REGRESSION.md` | Yes | **Yes — current security status** | Supersedes the status (not the findings) in `SECURITY-GAPS.md` | Keep |

**At the time of the Phase 0 audit this was one document.** Phase 0.5 added the
two above, plus executable documentation in the form of `backend/test/` (31 P0
regression tests) and `backend/migrations/` (versioned schema changes).

### README assessment

Accurate and useful:
* Local setup for backend and frontend (`README.md:97-131`)
* Project structure diagram (`:74-93`) — matches reality
* Tech stack (`:55-71`) — matches reality
* Deployed infrastructure table (`:217-224`) — matches `render.yaml`
* The Render cold-start note (`:225`) — correct and non-obvious

Inaccurate:
* `:213` `[x] Admin-only auth on AI analytics endpoints` — true for `/forecast`, `/churn`, `/heatmap`, `/debug`, and **false as an overall impression**: `/ai/chat`, `/ai/chat/stream`, `/ai/match`, `/ai/dynamic-price`, `/ai/fraud-check`, `/ai/review-check`, `/ai/bundle-suggest` are all unauthenticated.
* `:205` `[x] JWT authentication on all protected routes` — the claim is circular, and materially misleading given P0-1 (any password works for password-less accounts) and P0-2 (unverified social login).
* `:129-131` "Create Admin Account → `node scripts/initDb.js`" — `initDb.js` runs `schema.sql`, which seeds an admin with the published password `admin123`. The README does not say to change it.
* `:104-107` `mysql -u root -p < backend/schema.sql` — works locally, but the production database is TiDB and there is no documented migration path for schema changes after the first run.
* `:69-71` "Database: MySQL 8+" — production is TiDB Serverless; the difference matters for strict mode and DDL behaviour.

Absent from the README:
* Nothing about the demo/seed data that ships with the schema
* Nothing about `/api/admin/seed-demo`
* No API reference
* No environment-variable reference (defers to `.env.example`, which is wrong for SSLCommerz)
* No testing section (there are no tests)
* No contribution or code-style guidance

---

## 3. Documents that SHOULD exist and do not

Assessed against brief §5. Status: **MISSING** unless noted.

### Product

| Document | Status | Why it matters here |
|---|---|---|
| `PRODUCT-CONSTITUTION.md` | MISSING | The IMAP 2.0 direction exists only in the audit brief, not in the repository |
| `PRD.md` | MISSING | 19 feature domains shipped with no written requirement for any of them |
| `MISSION.md` / Product Principles | MISSING | |
| `PERSONAS.md` | MISSING | Bengali-first, elderly mode, and rural/agro categories imply personas that are undocumented |
| `USER-JOURNEYS.md` | MISSING | Journeys are implicit in a 5,538-line file |
| `BUSINESS-MODEL.md` | MISSING | No revenue mechanism is implemented (`BASELINE-AUDIT.md §16`); nothing states what it should be |
| `MONETIZATION.md` | MISSING | `platform_fee` exists, defaults to 0, and is client-supplied |
| `ROADMAP.md` | MISSING | |
| `KPI.md` / North Star | MISSING | Brief §2.10 asks for "Successful Needs Resolved"; nothing measures it |
| `NON-GOALS.md` | MISSING | The absence shows: microloans and disaster reporting received the same investment as booking |

### UX

| Document | Status | Why it matters here |
|---|---|---|
| `UX-CONSTITUTION.md` | MISSING | |
| `INFORMATION-ARCHITECTURE.md` | MISSING | No URL routes exist, so the IA cannot be reverse-engineered from a route table |
| `NAVIGATION-ARCHITECTURE.md` | MISSING | ~30 page keys in `App.jsx` state |
| `USER-FLOWS.md` | MISSING | |
| `INTERACTION-PRINCIPLES.md` | MISSING | |
| `BEHAVIORAL-DESIGN.md` | MISSING | Brief §2.3 is entirely unaddressed in writing |
| `DESIGN-SYSTEM.md` | **PARTIAL (code only)** | `constants/theme.js` is a real token set; `components/ui.jsx` has 4 primitives. Ant Design is a second, undocumented system used in admin. No written spec. |
| `ACCESSIBILITY.md` | MISSING | |
| `MOBILE-UX.md` | MISSING | |
| Empty / loading / error state spec | MISSING | Directly related to the fallback-to-fake-data defect (`UX-GAPS.md §2`) |

### Engineering

| Document | Status | Why it matters here |
|---|---|---|
| `SYSTEM-ARCHITECTURE.md` | MISSING | First rendering of the real architecture is in `BASELINE-AUDIT.md §5` |
| `DOMAIN-ARCHITECTURE.md` | MISSING | No domains exist to document (`ARCHITECTURE-GAPS.md §2`) |
| `API-ARCHITECTURE.md` | MISSING | Four different response envelopes; `utils/response.js` written and unused |
| OpenAPI / contract | MISSING | `frontend/src/api.js` JSDoc is the only endpoint documentation |
| `DATA-ARCHITECTURE.md` / ERD | **PARTIAL** | `schema.sql` is readable and commented, but 5 tables are created outside it |
| `EVENT-ARCHITECTURE.md` | MISSING | No events exist |
| `REALTIME-ARCHITECTURE.md` | MISSING | Socket contract is implicit in `server.js:72-118` + two client files |
| `CACHING-STRATEGY.md` | MISSING | 60+ literal cache keys across 9 files, manually invalidated and provably incomplete |
| `SEARCH-ARCHITECTURE.md` | MISSING | `LIKE '%q%'` across 5 columns |
| `STORAGE-ARCHITECTURE.md` | MISSING | R2/S3 with a base64-into-DB fallback and a broken bucket-name variable |
| `NOTIFICATION-ARCHITECTURE.md` | MISSING | DB rows + web-push, no channel abstraction |
| `DEPLOYMENT.md` | **PARTIAL** | `README.md:135-197` documents an nginx + PM2 deployment that **is not how this is deployed**; the real topology is `render.yaml` + GitHub Pages |
| `DEVELOPMENT.md` | **PARTIAL** | `README.md:97-131` |
| `TESTING.md` | MISSING | No tests |
| `OBSERVABILITY.md` | MISSING | |
| `PERFORMANCE.md` | MISSING | |
| ADRs / decision log | MISSING | Git commit messages are the only record |
| `RUNBOOK.md` | MISSING | No incident, rollback, or restore procedure |

### AI

| Document | Status |
|---|---|
| `AI-CONSTITUTION.md` | MISSING — and the fallback strings in `ai.js:92-142` show why this is urgent |
| `AI-ARCHITECTURE.md` | MISSING |
| `AGENT-ARCHITECTURE.md` | MISSING — no agents exist |
| `TOOL-CATALOG.md` | MISSING — **the single highest-value document to write first** (`AI-GAPS.md §9`) |
| `MEMORY-ARCHITECTURE.md` | MISSING |
| `CONTEXT-ARCHITECTURE.md` | MISSING |
| `RECOMMENDATION-ARCHITECTURE.md` | MISSING |
| `MATCHING-ARCHITECTURE.md` | MISSING — the scorer at `ai.js:336-352` is undocumented and scores a non-existent column |
| `AI-SAFETY.md` | MISSING |
| `AI-EVALUATION.md` | MISSING |
| `AI-OBSERVABILITY.md` | MISSING |
| Model/provider abstraction spec | MISSING |
| Prompt registry / versioning | MISSING — 4 system prompts inlined at `ai.js:26-28, 77-79, 239-241` |

### Security

| Document | Status |
|---|---|
| `SECURITY-ARCHITECTURE.md` | MISSING — `README.md:201-213` is a 10-item checklist, two items of which are inaccurate |
| `THREAT-MODEL.md` | MISSING |
| `AUTHENTICATION.md` | MISSING |
| `AUTHORIZATION.md` / RBAC-ABAC | MISSING — no policy layer exists to document |
| `SECRETS-MANAGEMENT.md` | MISSING — and secrets are in the repository |
| `KYC-SECURITY.md` | MISSING — ID images are base64 in the primary DB |
| `PAYMENT-SECURITY.md` | MISSING |
| `PRIVACY.md` / data protection | MISSING — no privacy policy, no consent, no retention, no deletion path, despite collecting NID scans, selfies, phone numbers, GPS, and blood group |
| `AUDIT-LOGGING.md` | MISSING — no audit log exists |
| `RATE-LIMITING.md` | MISSING |
| `ABUSE-PREVENTION.md` | MISSING |
| `TRUST-SAFETY.md` | MISSING |
| `INCIDENT-RESPONSE.md` | MISSING |

### Business domains

| Document | Status | Implementation state |
|---|---|---|
| `MARKETPLACE.md` | MISSING | Implemented |
| `CATEGORIES.md` | MISSING | Implemented — with three conflicting taxonomies |
| `SERVICES.md` | MISSING | **No service entity exists** |
| `PROVIDERS.md` | MISSING | Implemented, no verification gate |
| `BOOKING.md` | MISSING | Implemented, no state machine |
| `PAYMENTS.md` | MISSING | Implemented, unsafe |
| `WALLET.md` | MISSING | Implemented, not a ledger |
| `REVIEWS.md` | MISSING | Implemented correctly |
| `KYC.md` | MISSING | Implemented, enum mismatch |
| `EMERGENCY.md` | MISSING | Implemented, PII broadcast |
| `BLOOD.md` | MISSING | Implemented, seeded fake |
| `DISASTER.md` | MISSING | Implemented, seeded fake |
| `LOANS.md` | MISSING | Implemented, non-idempotent disbursement |
| `NOTIFICATIONS.md` | MISSING | Implemented |
| `PROMOTIONS.md` | MISSING | Implemented, never applied to a price |
| `LOYALTY.md` | MISSING | Implemented |
| `BUSINESS-SME.md` | MISSING | **Not implemented** |
| `PROVIDER-BUSINESS-OS.md` | MISSING | **Not implemented** |

---

## 4. Source-of-truth analysis (brief §6)

| Concern | Current source of truth | Confidence | Notes |
|---|---|---|---|
| Product requirements | **None** | — | No document; the code is the only statement of intent |
| Database schema | `backend/schema.sql` | **Low** | 5 tables and 4 columns are created elsewhere at runtime; 3 code↔schema conflicts exist (`DATABASE-GAPS.md §3`) |
| API contract | `frontend/src/api.js` | **Medium** | Client-side JSDoc; the server accepts more field-name variants than the client sends (`bookings.js:28-41`) |
| UI behaviour | `frontend/src/App.jsx` | **Low** | 5,538 lines, ~50 components, no route table |
| Business rules | Individual route handlers | **Low** | Duplicated, inconsistent, no shared layer |
| Pricing | **Conflicting** | — | `categories.base_price` (unused) vs `providers.hourly_rate` (unused) vs `ai.js:374-380` BASE map (returned to the client) vs `req.body.amount` (actually charged) |
| Booking states | **Conflicting** | — | `schema.sql:105` vs `bookings.js:180` vs `server.js:108` |
| Payment states | `schema.sql:307` | Medium | `ENUM('pending','success','failed','refunded','cancelled')`; `refunded`/`cancelled` are never written |
| Authentication | `backend/middleware/auth.js` + `routes/auth.js` | **Low** | Two bypasses (P0-1, P0-2) |
| Authorization | Inline `if` statements | **Very low** | No policy layer; the same check is implemented three different ways |
| AI behaviour | `backend/routes/ai.js` | Medium | Prompts inlined; fallback content is a hardcoded table that fabricates facts |
| Deployment | `render.yaml` + `deploy.yml` | **High** | Both are accurate |
| Environment contract | **Conflicting** | — | `.env.example` vs `render.yaml` vs the code — 5 mismatches (`PRODUCTION-GAPS.md §4`) |

### Declared conflicts

```
CONFLICT — Stack
SOURCE A: user-level CLAUDE.md default stack — Next.js / NestJS / PostgreSQL / Prisma / Redis
SOURCE B: README.md:55-71 — React+Vite / Node+Express / MySQL 8
CURRENT CODE: React 18 + Vite 7 + Ant Design 6; Express 4 CommonJS; TiDB; no ORM; no Redis
Resolution: DEFERRED to Phase 1.
```

```
CONFLICT — Deployment
SOURCE A: README.md:160-197 — nginx reverse proxy + PM2 + certbot on a VPS
SOURCE B: render.yaml + .github/workflows/deploy.yml — Render + GitHub Pages
CURRENT CODE: matches SOURCE B; nothing in the repo supports SOURCE A
Resolution: DEFERRED. README section is stale guidance, not a plan.
```

```
CONFLICT — Payment environment variables
SOURCE A: backend/.env.example:35-36 — SSL_STORE_ID / SSL_STORE_PASSWORD
SOURCE B: render.yaml:53-56 — SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD
CURRENT CODE: utils/payment.js:13-14 reads SSLCOMMERZ_*
Resolution: DEFERRED. Note that following SOURCE A produces P0-12 (free wallet credit).
```

```
CONFLICT — Category taxonomy (three-way)
SOURCE A: schema.sql:267-279 — 12 categories, INT ids, slugs 'electrician','plumber',…
SOURCE B: server.js:211-220 + scripts/seedDemo.js:26-35 — 8 categories, STRING ids, slugs 'electrical','plumbing',…
SOURCE C: frontend/src/constants/data.js:1-96 — 19 categories, numeric ids 1-19, third naming again
CURRENT CODE: A is what the DB holds; B fails to insert (PK type mismatch, error swallowed);
              C is what the user actually sees on the Services page
Resolution: DEFERRED to Phase 1 (this is the service-graph decision).
```

```
CONFLICT — Provider verification
SOURCE A: index.html:9 and LandingPage copy — "KYC-verified providers"
SOURCE B: routes/providers.js:316-318 — "Your provider application will be reviewed within 24-48 hours"
CURRENT CODE: routes/providers.js:263-328 lists the provider publicly and immediately;
              schema.sql:61 is_available DEFAULT 1; no approval state exists
Resolution: DEFERRED — but note this is a consumer-protection claim, not a preference.
```

```
CONFLICT — Security posture
SOURCE A: README.md:201-213 security checklist, 10/10 items checked
CURRENT CODE: 12 P0 and 18 P1 findings (SECURITY-GAPS.md)
Resolution: The README checklist is not a false claim about the items it lists
            (helmet, rate limiting, bcrypt, parameterised queries are all real),
            but its completeness implies a posture the code does not have.
```

---

## 5. Proposed canonical documentation tree

Based on what exists and what the audit found, not on the template. **Priority** reflects what unblocks the most work; **P1 items should be written before any IMAP 2.0 implementation begins.**

```
docs/
├── audit/                              # ✅ created by this audit — 9 files
│   ├── BASELINE-AUDIT.md
│   ├── ARCHITECTURE-GAPS.md
│   ├── DATABASE-GAPS.md
│   ├── SECURITY-GAPS.md
│   ├── UX-GAPS.md
│   ├── AI-GAPS.md
│   ├── PRODUCTION-GAPS.md
│   ├── DOCUMENTATION-INVENTORY.md
│   └── IMPLEMENTATION-MATRIX.md
│
├── product/
│   ├── PRODUCT-CONSTITUTION.md         # P1 — nothing states what IMAP is for
│   ├── PRD.md                          # P2
│   ├── PERSONAS.md                     # P2
│   ├── USER-JOURNEYS.md                # P2
│   ├── BUSINESS-MODEL.md               # P1 — revenue is currently zero by construction
│   ├── ROADMAP.md                      # P2
│   ├── KPI.md                          # P1 — needed to define "needs resolved"
│   └── NON-GOALS.md                    # P1 — 19 shallow domains is the cost of not having this
│
├── architecture/
│   ├── SYSTEM-ARCHITECTURE.md          # P1
│   ├── DOMAIN-ARCHITECTURE.md          # P1 — the service graph decision lives here
│   ├── DATA-ARCHITECTURE.md            # P1
│   ├── API-ARCHITECTURE.md             # P2 (+ generated OpenAPI)
│   ├── EVENT-ARCHITECTURE.md           # P2
│   ├── REALTIME-ARCHITECTURE.md        # P2
│   └── decisions/ADR-000x-*.md         # P1 — start now; the stack question is ADR-0001
│
├── security/
│   ├── SECURITY-ARCHITECTURE.md        # P1
│   ├── THREAT-MODEL.md                 # P1
│   ├── AUTHORIZATION.md                # P1 — no policy layer exists; write the model first
│   ├── PRIVACY.md                      # P1 — NID scans, selfies, GPS, blood group, zero policy
│   └── TRUST-SAFETY.md                 # P2
│
├── ai/
│   ├── AI-CONSTITUTION.md              # P1 — ai.js:92-142 is why
│   ├── TOOL-CATALOG.md                 # P1 — highest-leverage single document
│   ├── AI-ARCHITECTURE.md              # P2
│   ├── AGENT-ARCHITECTURE.md           # P2
│   ├── MEMORY-ARCHITECTURE.md          # P2
│   ├── CONTEXT-ARCHITECTURE.md         # P2
│   └── AI-EVALUATION.md                # P2
│
├── ux/
│   ├── UX-CONSTITUTION.md              # P2
│   ├── INFORMATION-ARCHITECTURE.md     # P1 — required before any routing work
│   ├── USER-FLOWS.md                   # P2
│   ├── BEHAVIORAL-DESIGN.md            # P2
│   └── DESIGN-SYSTEM.md                # P2 — two systems today, pick one
│
├── domains/                            # P3 — write as each domain is refactored,
│   └── BOOKING.md · PAYMENTS.md · …    #      not upfront
│
└── engineering/
    ├── DEVELOPMENT.md                  # P2 — move from README
    ├── DEPLOYMENT.md                   # P1 — the README's nginx/PM2 guide is wrong
    ├── TESTING.md                      # P1 — zero tests exist
    ├── OBSERVABILITY.md                # P2
    ├── PERFORMANCE.md                  # P3
    └── RUNBOOK.md                      # P1 — no incident or rollback procedure exists
```

**Do not create empty placeholder files.** Twelve documents are marked P1; the rest should be written when the work they describe is actually undertaken.

### Immediate correction to an existing document

`README.md` should be corrected in Phase 0.5 alongside the P0 fixes:
* Replace the security checklist with a pointer to `docs/security/`
* Remove or annotate the "Create Admin Account" step so it does not leave `admin123` in place
* Replace `:135-197` (nginx/PM2) with a pointer to the real deployment
* Add a section stating which data is seeded and how to disable it
