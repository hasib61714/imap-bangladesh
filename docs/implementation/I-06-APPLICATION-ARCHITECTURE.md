# IMAP 2.0 — I-06 Application Architecture

**Status:** IMPLEMENTATION RECORD · **Phase:** 4 / I-06 · **Date:** 2026-08-09
**Required by:** I-06 §5, §8–§25, §32 · **Governed by:** `SYSTEM-ARCHITECTURE.md` §4, `TARGET-REPOSITORY-STRUCTURE.md` §3, AD-009, AD-010, AD-026

---

## 1. Before and after

```
BEFORE                              AFTER
──────                              ─────
routes/providers.js   376 L         transport/routes.js       186 L  adapter only
  ├─ validation                       ├─ application/queries/    5 use cases
  ├─ authorization (implicit)         ├─ application/commands/   3 use cases
  ├─ business rules                   ├─ domain/                 5 files, no I/O
  ├─ SQL × 14                         ├─ infrastructure/         3 repositories
  ├─ cache invalidation               ├─ policies.js             7 policies
  ├─ money validation                 └─ index.js                the public surface
  └─ response shaping
```

Nothing else moved. `services.js`, `schedule.js`, `bookings.js` and the rest keep their I-04 authorization and their existing shape — §5 asks for the application-layer *architecture*, and one module migrated completely proves it better than five migrated partly.

---

## 2. The layers, and what each may not do

`SYSTEM-ARCHITECTURE.md` §4.1, implemented:

| Layer | Owns | May not | Enforced by |
|---|---|---|---|
| **Transport** | parse, build the actor, call a use case, shape the result | business rules · SQL · authorization decisions | test + `sql-only-in-infrastructure` |
| **Application** | one use case per file · the transaction · the authorization call · idempotency declaration · the outbox seam | domain rules · HTTP, sockets, AI | **`application-layer-is-transport-free`** (error) |
| **Domain** | entities, value objects, invariants | I/O of any kind | test (no `async`, no I/O imports) |
| **Infrastructure** | SQL, adapters, caching | business rules · authorization decisions | `cross-module-via-index-only` (error) |

The application rule is new at I-06 and is at **error** severity because the layer is clean today. It forbids `express`, `socket.io`, `req.*`, `res.*`, `*.query(` and a literal HTTP status inside `src/application/` or `*/application/`.

That rule is what makes D-002 structural. `AUTHORIZATION-ARCHITECTURE.md` §5 requires an AI tool that creates a booking to call the **same** use case the HTTP controller calls — "there is no path to state that bypasses it". A use case holding a `res` is one only HTTP can reach.

---

## 3. The use-case contract

```js
defineUseCase("marketplace.UpdateOwnProviderProfile", {
  kind: "command",                       // command | query
  action: ACTION.PROVIDER_UPDATE_OWN,    // a policy in the I-04 register
  resource: (input, ctx) => ctx.actor.principalId,
  idempotency: "naturally_idempotent",
  audit: "required",
  why: "A profile change alters what customers are shown and what they are charged.",
  run: async (input, ctx) => { … },
});
```

`SYSTEM-ARCHITECTURE.md` §4.2's two assertions, in two halves:

| Assertion | Where | Catches |
|---|---|---|
| "Every use case declares its authorization policy" | `defineUseCase` | a use case shipping unguarded |
| …and that policy **exists** | `assertUseCaseRegistryIsSound` | a typo — `provider.updat_own` would deny every request in production and nowhere else |
| "Every mutating use case declares idempotency behaviour" | `defineUseCase` | a retried POST with no stated behaviour |

**There is no `public` escape hatch.** A genuinely public action is a policy with `roles: ["*"]`, which keeps "who may do this" in one register instead of two. `discovery.search` and `provider.read` are exactly that.

**`idempotency_key` is refused at registration.** AD-010 layer (a) is I-11; accepting the declaration now would be a promise with no mechanism behind it.

The registry also refuses: an instance policy with no `resource()`, a collection policy given one, and a query pointed at a mutating policy.

---

## 4. The executor (§11, §12, §13, §24)

```
authorize  →  BEGIN  →  run  →  write staged audit  →  COMMIT
```

**Why one executor.** Every step already existed and no two route files did them the same way: `bookings.js` opens a transaction and checks `affectedRows`, `users.js` opens one for the wallet and not for the profile, `admin.js` had none until I-04, and the audit writer had three call sites with three shapes. That is not a discipline problem — it is what happens when the composition is hand-written at each call site.

### 4.1 AD-009, made structural

> "Every state change writes its audit record inside the same transaction, and a state change without one fails."

A use case declaring `audit: "required"` that returns without calling `ctx.recordAudit(...)` **does not commit**. The transaction rolls back and the caller gets a 500 — deliberately: the alternative is a state change nobody can account for, which is the exposure `CREDENTIAL-INCIDENT.md` §2 still cannot answer.

The record is staged, not written, by the use case. The executor writes it on the transaction's connection, so a use case cannot forget the connection and cannot produce a record that survives a rollback.

### 4.2 Authorization runs inside the transaction

The kernel is given the transaction's connection, so the row it decided against is the row the use case then mutates. The I-04 middleware authorizes before the handler opens its own transaction, which leaves a window. Both call the same kernel — there is still exactly one place that decides, and the middleware remains correct for the routes that have not migrated.

A **denial** is recorded out of band on the pool: a record written on the transaction would be lost to the rollback that follows it.

### 4.3 The event boundary (§22)

`ctx.tx` is the seam. AD-006 appends an outbox event inside the same transaction as the state change and its audit record, and that transaction is the one the executor opens.

**No `outbox_event` table is created and no event is declared.** GATE-1 §6's binding rule is that no event is published without a consumer; the sixteen Gate-1 events all belong to modules that do not exist yet, and a `publishes: []` field nothing sets would be dead machinery. The boundary is the parameter; the writer and the dispatcher are the events phase.

---

## 5. Internal and external providers (§16, §20)

Migration `010` adds `providers.provider_source ENUM('internal','external') NOT NULL DEFAULT 'external'`.

**Why a column and not a derived value.** "Everything is external until we build employees" is an assumption living in a mapping function, and it survives long after it stops being true. A column is a fact the row asserts about itself, and the day IMAP hires a technician the record says so without a migration.

**Why `external` is not a guess.** Every existing row arrived through `POST /api/providers/apply` or `scripts/seedDemo.js`. Both are independent providers by construction; IMAP has no internal workforce records. The default states what is already true.

**One shape, not two.** Both sources produce an identical `FulfillmentCandidate` and a test asserts the key sets match — two shapes is how two workforces become two booking architectures. `isCommissionEligible(source)` returns a boolean and never a rate: D-009 is unset and `PLATFORM_FEE_PCT` stays at 0 until somebody with the authority changes it.

**Not implemented (§20):** payout rules, employment compensation, commission rates, permissions, scheduling, performance, reporting. None are decided.

---

## 6. Need, location, affordability

| Boundary | What exists at I-06 | What is deliberately absent |
|---|---|---|
| **Need** (§17) | a value object — text (verbatim, bounded), category, area, price ceiling, quality floor — and `needOutcome()`, the shape a future `booking_event` row carries. `GET /api/providers` takes one | AI understanding, intent classification, embeddings, synonym expansion. **No table**: GATE-1 §4.1 collapsed `need_understanding` into `booking_event`, which is I-11, and creating one would expand Gate 1 |
| **Location** (§18) | a `ServiceArea` value object: labels normalised and bounded, coordinates **validated** (both halves or neither; range-checked), `isLocatable` stated as a property | GPS tracking, radius queries, distance, geospatial ranking, location history, live position. Migration 005's `area` hierarchy is still empty — no official source for Bangladesh's divisions has been agreed |
| **Affordability** (§19) | `maxPrice` is a need input and a repository filter; the provider's rate is money and is validated as money (P0-4) | any ranking. §19 forbids "cheapest wins", and the weighting across quality, distance, availability, reliability, verification, price and preference is a product decision nobody has made. **A candidate carries the inputs and produces no order** |

Nothing here invents a threshold, a weight or a band.

---

## 7. Invariants that left the route handlers (§10)

| Invariant | Was | Is |
|---|---|---|
| Only approved providers are listed (P1-7, D-005) | three conditions in a WHERE clause | the **scope** of `discovery.search`; the repository applies what the policy gives it |
| A provider may not set their own standing | absent — the handler picked fields by hand | the writable **shape** excludes `is_approved`, `rating`, `trust_score`, `nid_verified`, `provider_source`. Mass assignment answered by a shape that does not contain the fields, not by a denylist |
| Field lengths | duplicated in two handlers that already disagreed | `domain/providerProfile.js`, one table |
| The rate is money (P0-4) | `parseOptionalAmount` in two places | `offeredRate()` |
| Availability is strictly 0/1 (P1-11) | one handler | `availabilityFlag()` |
| A provider owns their profile | `WHERE user_id = ?` | a policy **relationship**, decided by the kernel against a loaded row |

---

## 8. Behaviour changes, both stated

| Endpoint | Was | Is | Why |
|---|---|---|---|
| `GET /api/providers/:id` on an **unapproved** provider | `200` to anyone | **`404`** | D-005 makes listing trust-granted. A profile page reachable by anyone who knows the id is listing by another route, and "this id exists but is unapproved" hands out the applicant list one id at a time |
| `GET /api/providers/me/analytics` | `stats.views = total_jobs * 4` | **field removed** | There is no view counter anywhere. The number was invented from the job count and shown to providers as a measurement |
| `POST /api/providers/apply` | "reviewed within 24–48 hours" | "Application submitted for review" | **F-12**: no endpoint can approve an application at all. Repeating the promise would be repeating a falsehood |
| errors on migrated routes | `{ error: "message" }` | same, plus `code`, `retryable`, `correlation_id`, `fields` | §23 |

---

## 9. The error contract — a deviation with a trigger

`API-ARCHITECTURE.md` §4 specifies a **nested** envelope: `{ error: { code, message, user_message, retryable, correlation_id, fields } }`.

`frontend/src/api.js:65` reads `new Error(data.error || "Request failed")`. Handed an object, that produces the string `"[object Object]"` — so shipping the nested shape now turns every error message in the app into that, and §27 forbids the frontend migration that would fix it.

The fields are therefore emitted **flat**, with `error` remaining the human-readable string the client already reads. Every field §4 requires is present and machine-readable; only the nesting waits.

**Trigger:** the frontend's shared API client (`APP-JSX-MIGRATION.md`, `shared/api/`). One reader, one change.

---

## 10. Negative controls (§25) — 12 of 12 detected

Each lever reverted, the failure observed, the file restored and verified byte-identical.

| # | Reverted | Result |
|---|---|---|
| NC-1 | the "must name an action" check | 2 failing |
| NC-2 | the "must declare idempotency" check | 2 failing |
| NC-3 | the startup assertion's missing-policy branch | 2 failing |
| NC-4 | **AD-009 — the staged-record check** | 2 failing |
| NC-5 | the denial short-circuit (authorization ordering) | 3 failing |
| NC-6 | the writable-shape exclusion (mass assignment) | 2 failing |
| NC-7 | provider-source fail-closed | 3 failing |
| NC-8 | D-005 offerability | 2 failing |
| NC-9 | **P1-7 — the public discovery scope** | 2 failing |
| NC-10 | the repository applying that scope | 2 failing |
| NC-11 | money validation on the rate (P0-4) | 4 failing |
| NC-12 | the strict availability flag (P1-11) | 4 failing |

### 10.1 Two defects the tests found in themselves

The first draft of `i06-application-layer.test.js` did not call the composition root, so **no marketplace policy was registered** and every authorization call denied with `policy_denied`. The denial tests passed for entirely the wrong reason. A test that passes against an empty register is the same class of defect as one that passes against a broken implementation.

The second: `assert.equal(db.ran("INSERT"), false)` after a denial failed — correctly. The denial **is** recorded, out of band on the pool, so it survives the rollback. The assertion now says what it meant and adds the one it should have had.

---

## 11. Environment and database

| | |
|---|---|
| Production contacted | **NO** — `require('./db')` against the real `.env` throws `EnvironmentSafetyError` |
| `backend/.env` | untouched, untracked, zero commits |
| Disposable database | MariaDB 12.2.2, `127.0.0.1:3409`, own datadir, provisioned and destroyed. The machine's own service on 3306 untouched |
| **TiDB verification** | **BLOCKED**, unchanged. `ALTER TABLE … ADD COLUMN … ENUM` and `ADD INDEX` are portable, and `010` is verified on MariaDB **only** |
| Migration `010` | applied, column `NOT NULL DEFAULT 'external'`, `idx_source` present |
| Runtime DDL | **0** |

### 11.1 §30 — the I-03 backfill

**Not run.** Verified on the disposable database rather than asserted:

```
users 0 · principals 0 · sessions 0
INSERT INTO session (…, principal_id='no-such-principal', …)
  → ERROR 1452: FOREIGN KEY (`principal_id`) REFERENCES `principal` (`id`)
```

So I-05's session repository remains blocked exactly as recorded: a session row cannot be written for a live user until `principal` is populated. No rehearsal was performed against production and none is implied.

---

## 12. Open items

### Owner decisions

| # | Item | Blocks |
|---|---|---|
| 1 | **Ranking policy.** §19 forbids "cheapest wins"; the weighting across quality, distance, availability, reliability, verification, price and preference is undecided. A candidate carries the inputs and produces no order | matching (I-10+) |
| 2 | **Provider approval** — F-12. `is_approved` is written by `seedDemo.js` alone, so a genuine provider can never be listed or booked | I-10 |
| 3 | **Internal workforce.** The column exists and nothing sets it to `internal`. What an internal provider IS operationally — employment, scheduling, compensation — is undecided | finance / operations |
| 4 | **The `area` hierarchy** is still empty; no official source for Bangladesh's administrative divisions has been agreed | I-18 location |
| 5 | Carried: the I-03 cutover, D-009, retention periods, the `audit_log` grant, the production collation | — |

### Findings recorded, not acted on

| # | Finding | Phase |
|---|---|---|
| **F-21** | `providerActivityRepository` and `scheduleRepository` read `bookings`, `reviews` and `provider_schedule` — booking-module data and a table `routes/schedule.js` also writes. `TARGET-REPOSITORY-STRUCTURE.md` §5 puts these endpoints in marketplace, so the crossing is expected; the correct end state is a read model booking maintains. One named file, so there is one place to change | I-11/I-12 |
| **F-22** | `services.js`, `schedule.js` and 15 other route files still hold business logic. Their I-04 authorization is intact and their behaviour is unchanged; each clears as its module migrates (`TARGET-REPOSITORY-STRUCTURE.md` §8 steps 4–8) | I-07+ |
| **F-23** | The nested error envelope of API-ARCHITECTURE §4 is not emitted — §9 above, with its trigger | frontend |
| **F-24** | `utils/cache.js` invalidation moved into the repositories, which is where it belongs, but it is still an in-process `Map` (I-05 F-18). Cross-instance staleness is bounded by TTL and cannot grant access | scale |
| **F-25** | The `own_provider_profile` resource type exists because `/providers/me` carries no id. It is a second loader over one table; if a third "my own X" endpoint appears the pattern should become a first-class "resolve the actor's own resource" step in the kernel rather than a type per table | I-07+ |
| **F-12**, **F-16**–**F-20** | carried unchanged from I-04 and I-05 | — |

---

## 13. What I-06 deliberately did not do

| | |
|---|---|
| The other four modules | not migrated. §5 asks for the architecture; one complete module proves it |
| Booking, payment, ledger, provider approval | none |
| Realtime | `realtime.js` untouched |
| AI | none. Gate 1 remains 0 AI tools |
| Frontend | unchanged. Every migrated endpoint returns the wire shape it returned before, mapped by presenters that are the only snake_case in the module |
| Gate-1 scope | unchanged: 5 modules, ~38 entities, 16 events, 6 state machines, 0 AI tools. No entity, event or state machine was added |
| The outbox table | not created — §4.3 |
| The `Idempotency-Key` table | not created — AD-010 layer (a) is I-11, and the declaration is refused until it exists |
| Production migration or cutover | none |
