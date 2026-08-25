# IMAP 2.0 — Target Repository Structure (Gate 1)

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Frozen by:** `GATE-1-ARCHITECTURE.md` (AD-026) · **Layer model:** `SYSTEM-ARCHITECTURE.md` §4

---

## 1. Two deviations from Phase 2, declared

`SYSTEM-ARCHITECTURE.md` §5–§6 specifies 14 backend modules, two applications and five workspace packages. Gate 1 does not build that, and the reasons are stated rather than absorbed.

### 1.1 Five backend modules, not fourteen

Already decided by AD-026. The 14-module tree stays as the Gate-2+ target; the module roots below are its coarser parent, so growing into it later is a directory move, not a redesign.

### 1.2 No npm workspace, no `packages/` — at Gate 1

**Phase 2 says** `apps/web` + `apps/admin` + `packages/{ui,api-client,domain-types,i18n,realtime-client}`.

**Gate 1 builds** a single Vite project with **two entry points** and a `src/shared/` directory reached by a path alias.

The requirement a workspace would satisfy is `UX-CONSTITUTION.md` §7: *Ant Design (~135 KB gz) is admin-only and must never enter a consumer route*. Two rollup inputs satisfy it completely — the admin entry is a separate HTML file with its own dependency graph, so Ant Design is unreachable from the consumer graph. A workspace adds a package manager layer, five `package.json` files, build ordering and version drift to buy the same guarantee.

**Promotion trigger — write it down now so it is not a judgement call later:** move to a workspace when *either* a second consumer of `shared/` appears (a native shell, a partner SDK, a second web app) *or* `shared/` exceeds ~3,000 lines. Until then the alias is enough.

**Verification that the boundary holds** is a CI check, not a convention: the consumer bundle is asserted to contain no `antd` module. A structure that relies on discipline is the failure mode `utils/response.js` already demonstrated.

---

## 2. Repository root

```
imap-app/
├── backend/
├── frontend/
├── docs/                    unchanged
├── .github/workflows/       ci.yml (new) · deploy.yml (gated on ci)
├── render.yaml
└── .gitignore
```

Directory names stay `backend/` and `frontend/`. Renaming to `apps/api` and `apps/web` costs every path in `render.yaml`, `deploy.yml`, the docs and every open branch, and buys nothing at Gate 1.

---

## 3. Backend

```
backend/
├── src/
│   ├── modules/
│   │   ├── identity/
│   │   ├── marketplace/
│   │   ├── booking/
│   │   ├── finance/
│   │   └── platform/
│   ├── transport/
│   │   ├── http/            express app, routers, error mapper, openapi
│   │   ├── realtime/        socket server, room authorization
│   │   └── jobs/            job runner, handler registry
│   ├── composition/
│   │   ├── container.js     wiring
│   │   ├── policies.js      policy registration + startup assertion
│   │   └── bootstrap.js     config validation, startup checks, shutdown
│   └── shared/
│       ├── money.js         value object (from utils/money.js)
│       ├── ids.js           UUIDv7
│       ├── result.js
│       ├── errors.js        one error taxonomy
│       └── clock.js         injectable — no ambient Date.now() in the domain
├── config/environment.js    unchanged (Phase 2.75)
├── migrations/
├── test/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   ├── security/
│   └── helpers/
├── openapi/imap.v1.yaml     authored; the contract artefact
├── scripts/
├── package.json
└── server.js                thin: require('./src/composition/bootstrap')
```

### 3.1 Module shape — identical for all five

```
modules/<module>/
├── index.js                 THE PUBLIC SURFACE — commands, queries, events, policies
├── domain/                  pure; no I/O, no imports from infra or transport
│   ├── entities/
│   ├── value-objects/
│   ├── state-machines/
│   ├── rules/
│   └── events/              event type definitions and payload builders
├── application/             one file per use case
│   ├── commands/            CreateBooking.js, ConfirmCompletion.js …
│   ├── queries/
│   └── subscribers/         handlers for events from other modules
├── infrastructure/
│   ├── repositories/        the only place SQL exists
│   └── adapters/            gateway, SMS, storage clients
├── transport/
│   ├── routes.js            HTTP binding
│   └── validators/          generated from openapi
└── policies.js              authorization policies this module registers
```

**Four rules, each enforced by a lint rule that fails CI — not by review:**

| Rule | Why |
|---|---|
| `pool.query` appears only under `*/infrastructure/` | The audited defect was SQL in 18 route files |
| `domain/` imports nothing from `infrastructure/`, `transport/` or another module | Keeps the domain testable without a database |
| Cross-module imports resolve only to `modules/*/index.js` | Stops the five modules becoming one |
| No module imports `express`, `socket.io` or `mysql2` outside `transport/` and `infrastructure/` | Transport independence is what makes the job runner and the future AI tool layer call the same use cases |

### 3.2 What `modules/platform/` owns

Audit, authorization kernel, outbox, jobs, idempotency, feature flags, correlation, notification dispatch. It has no domain of its own; it is the substrate the other four stand on, and it is built first (`IMPLEMENTATION-DEPENDENCY-GRAPH.md`).

### 3.3 Language

**JavaScript at Gate 1, JSDoc types, `checkJs` in CI.** AD-014 adopts TypeScript incrementally, shared types first. Converting 7,283 lines of working, tested backend to TypeScript *during* a structural migration means two simultaneous rewrites and one confounded failure mode.

The seam is prepared: `openapi/imap.v1.yaml` generates `.d.ts` for request/response types from day one, so the shared-types half of AD-014 lands at Gate 1 and the source conversion follows module by module after it.

---

## 4. Frontend

```
frontend/
├── index.html               consumer entry
├── admin.html               admin entry  ← separate rollup input
├── vite.config.js           two inputs; bundle-budget plugin
└── src/
    ├── main.jsx             consumer mount
    ├── admin.jsx            admin mount — the ONLY file importing antd
    ├── app/
    │   ├── router.jsx       routes → INFORMATION-ARCHITECTURE.md §3.3
    │   ├── shell/           layout, nav, error boundary, offline banner
    │   └── providers.jsx    context composition
    ├── features/
    │   ├── auth/
    │   ├── discovery/       services, service detail, results, profile
    │   ├── booking/         flow, approval surface, detail, tracking
    │   ├── activity/
    │   ├── account/
    │   ├── emergency/
    │   └── provider/        jobs, schedule, earnings, profile, onboarding
    ├── admin/               admin features; antd allowed here only
    └── shared/
        ├── ui/              design system (from constants/theme.js)
        ├── api/             generated client + fetch transport
        ├── realtime/        ONE socket client
        ├── i18n/            bn/en catalogues
        ├── money/           {amount_minor, currency} formatting
        ├── state/           query cache, auth context, flow-state persistence
        └── types/           generated from openapi
```

### 4.1 Feature module shape — identical for all seven

```
features/<feature>/
├── index.js           route entries + public API only
├── routes/            page components
├── components/
├── hooks/
├── api/               endpoints this feature calls
├── state/
└── __tests__/
```

A feature may import `shared/`. **A feature may not import another feature** — it goes through `shared/` or through the router. This is the rule whose absence produced `App.jsx`.

### 4.2 The four state kinds, physically separated

`SYSTEM-ARCHITECTURE.md` §6.2 names four kinds; the current app conflates all four in `useState`, which is why a network failure renders as fabricated data.

| Kind | Where | Rule |
|---|---|---|
| Server state | `shared/state/query.js` | Explicit `loading` / `error` / `empty`. **No fallback constant, ever** |
| Session state | `shared/state/session.jsx` | Hydrated from `/me`; server is authoritative |
| Flow state | `shared/state/flow.js` | Persisted and server-mirrored; survives reload (R-801) |
| Ephemeral UI | component-local `useState` | Never persisted |

**Enforcement:** a lint rule forbids importing `constants/data.js` (deleted) and forbids any module under `features/` exporting an array of objects with an `id` field — the shape every fabricated dataset in `App.jsx` has.

### 4.3 Bundle budgets, enforced at build

| Entry | Budget (gzip) | Contains |
|---|---:|---|
| consumer initial | **≤150 KB** | shell, router, home, ask |
| discovery route | ≤60 KB | |
| booking route | ≤60 KB | |
| provider group | ≤80 KB | lazy |
| admin entry | ungoverned | separate build; Ant Design |

The Vite config fails the build when an entry exceeds its budget. `UX-CONSTITUTION.md` §7: *a route that exceeds its budget does not ship* — as a build step, not an aspiration.

---

## 5. Where each current file lands

| Current | Target |
|---|---|
| `backend/routes/auth.js` | `modules/identity/{application/commands, transport/routes.js}` |
| `backend/routes/bookings.js` | `modules/booking/…` |
| `backend/routes/payments.js` | `modules/finance/…` |
| `backend/routes/providers.js`, `services.js`, `schedule.js` | `modules/marketplace/…` |
| `backend/routes/users.js` | split: identity · finance · platform/notification |
| `backend/routes/admin.js` | `modules/platform/transport/ops-routes.js` + module commands |
| `backend/routes/kyc.js`, `upload.js` | `modules/identity/…` + `modules/platform/infrastructure/adapters/storage.js` |
| `backend/routes/chat.js`, `reviews.js`, `sos.js`, `blood.js`, `disaster.js` | `modules/booking/…` |
| `backend/routes/ai.js`, `promos.js`, `loans.js` | **not carried into Gate 1** — see §6 |
| `backend/utils/money.js` | `src/shared/money.js` |
| `backend/utils/pricing.js` | `modules/finance/domain/rules/pricing.js` |
| `backend/utils/bookingState.js` | `modules/booking/domain/state-machines/booking.js` |
| `backend/utils/bookingAccess.js` | `modules/booking/policies.js` |
| `backend/utils/payment.js` | `modules/finance/infrastructure/adapters/sslcommerz.js` |
| `backend/utils/cache.js`, `otp-store.js` | `modules/platform/infrastructure/redis/` |
| `backend/realtime.js` | `src/transport/realtime/` |
| `backend/db.js` | `modules/platform/infrastructure/database.js` |
| `frontend/src/App.jsx` | dissolved — `APP-JSX-MIGRATION.md` |
| `frontend/src/constants/theme.js` | `src/shared/ui/tokens.js` |
| `frontend/src/constants/data.js` | **deleted** |
| `frontend/src/api.js` | `src/shared/api/` (generated) |
| `frontend/src/socket.js` + `hooks/useSocket.js` | `src/shared/realtime/` (merged) |
| `frontend/src/pages/AdminPanel.jsx` | `src/admin/` |
| `frontend/src/pages/ProviderPortal.jsx` | `src/features/provider/` |

---

## 6. Deferred code — frozen, not deleted

`ai.js` (748 L), `promos.js` (86 L) and `loans.js` (350 L) are not in Gate 1. They are **not deleted in Phase 4** either.

```
backend/deferred/
├── README.md          why each is here, what unfreezes it, who decides
├── ai.js
├── promos.js
└── loans.js
```

Unmounted from the router, excluded from the build, retained in git. Rationale: `loans.js` is blocked on a legal decision (D-011) that may reverse; `promos.js` is a working validator waiting for a real discounting requirement; `ai.js` contains eight rule-based scorers that Phase 2 correctly identified as belonging in `marketplace/ranking` and `booking/risk` — **that logic is harvested into Gate 1, and the file itself is frozen.**

Deleting them would make a reversed legal decision an archaeology exercise. `README.md` is mandatory: a frozen directory with no explanation becomes a graveyard nobody dares touch.

---

## 7. What this structure deliberately does not have

| Not built | Why |
|---|---|
| `services/`, microservices | AD-001 — modular monolith; extraction triggers are in `SYSTEM-ARCHITECTURE.md` §9.1 |
| `packages/`, npm workspace | §1.2 — with a written promotion trigger |
| `agents/`, AI tool directory | Gate 1 has 0 AI tools (AD-026, brief §44) |
| A separate `apps/admin` build pipeline | A second rollup input achieves the isolation |
| A `domain/` shared across modules | Shared domain becomes a god module; `shared/` holds primitives only |
| An ORM | AD-002/AD-003; repositories own SQL, tested against a real engine |
| A DI framework | `composition/container.js` is plain construction |
| TypeScript source | §3.3 — types generated at Gate 1, source conversion after |

---

## 8. Migration order for the structure itself

The structure is not created empty and then filled — that produces a half-migrated tree for months.

| Step | Action | Verification |
|---|---|---|
| 1 | Create `src/`, `shared/`, `composition/`; move `db.js`, `money.js`, `logger.js` | 59 tests still pass |
| 2 | Add the four import-boundary lint rules, initially warning-only | CI reports violations |
| 3 | Build `modules/platform/` — audit, policies, outbox, jobs | New tests; existing 59 pass |
| 4–8 | One module at a time: identity → finance → marketplace → booking → ops. Each module's old route file is deleted **in the same commit** as its replacement mounts | Contract tests for that module's endpoints |
| 9 | Lint rules become errors | CI fails on any violation |
| 10 | Frontend: `shared/` then feature by feature | `APP-JSX-MIGRATION.md` |

**Rule for every step: the application is deployable at the end of it.** No step leaves two live implementations of the same endpoint — the old route is unmounted in the commit that mounts the new one, so there is never a question about which one served a request.
