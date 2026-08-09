# IMAP 2.0 — Architecture Decision Records

**Status:** PROPOSED · **Phase:** 2 · **Date:** 2026-08-09
**Governed by:** `docs/product/PRODUCT-CONSTITUTION.md` and `docs/product/PRODUCT-DECISIONS.md`
**Evidence:** `docs/audit/`

Architecture decisions carry `AD-` numbers. Product decisions carry `D-` numbers and are **not** amendable here — if an AD conflicts with a D, the AD is wrong or the conflict is escalated (§ Conflicts, end of file).

---

## ⚠ Standing condition on this entire phase

`PRODUCT-DECISIONS.md` records that **D-006, D-010, D-011, D-012 and D-013 require owner sign-off before Phase 2 begins**, and all five are still `PROPOSED`. Phase 2 has been started without that sign-off.

The architecture is therefore designed so that each of those decisions is an **extension point rather than a baked-in assumption**, per the brief §56. Reversing any of them after legal or business review changes configuration and adds a module; it does not require re-architecting. Where that costs something, the cost is stated in the relevant AD.

---

## AD-001 — Modular monolith with enforced module boundaries

**Context.** One backend process, 18 route files, ~3,600 lines, SQL inline in HTTP handlers, no service layer, no domain layer. Team size is small. The product needs strong boundaries far more than it needs independent deployability.

**Options.**
1. Keep the flat route structure and add discipline.
2. **Modular monolith:** one deployable, modules with explicit public interfaces, cross-module calls only through those interfaces or events.
3. Microservices per domain.
4. Serverless functions per endpoint.

**Chosen: 2.**

**Why.** The audit's failures are boundary failures, not scale failures: authorization implemented three different ways, `utils/response.js` written and imported by nothing, the same provider-lookup query duplicated in eleven places, and no owner for any piece of state. Microservices would convert those into distributed boundary failures with network partitions attached, at a scale (`N-06`: ≥99% availability, one city) that does not justify them. A modular monolith gives the boundary enforcement without the operational tax.

**Trade-offs.** Boundary enforcement must be tooling-enforced (import linting, module-public-API files) or it decays — this is the known failure mode of the pattern and it is exactly what happened to the current codebase. One deployable means one blast radius and one scaling unit until AD-016 extracts workers.

**Future consequences.** Extraction candidates and their triggers are in `SYSTEM-ARCHITECTURE.md` §9. Nothing is extracted before its trigger fires.

---

## AD-002 — Stay on MySQL/TiDB; do not migrate to PostgreSQL

**Context.** Production is TiDB Serverless (MySQL 8 wire). The organisation's default stack names PostgreSQL + Prisma. The audit found no schema problem that PostgreSQL solves and several that migration would make worse.

**Options.**
1. **Stay on MySQL/TiDB**, fix the modelling.
2. Migrate to PostgreSQL now.
3. Migrate to PostgreSQL after the core loop lands.

**Chosen: 1**, with 3 held open and no commitment.

**Why.** Every defect the audit found — no ledger, no audit log, three conflicting taxonomies, enum mismatches, base64 blobs in `LONGTEXT`, a mutable balance column — is a *modelling* defect that reproduces identically on PostgreSQL. Migrating the engine while simultaneously building the Service Graph, the ledger and the AI layer means changing three variables at once and being unable to attribute a regression. TiDB additionally gives horizontal read scaling for free later.

**Trade-offs.** Lose PostgreSQL-specific features that would genuinely help: `jsonb` operators for context storage, `tsvector`/`pg_trgm` for search, exclusion constraints for availability overlap, and mature partial indexes. Each is worked around in the relevant document (`SERVICE-GRAPH.md` §6, `DATA-ARCHITECTURE.md` §7). TiDB's `CHECK` constraint support varies by version, so non-negative money constraints are enforced in the domain layer, not only the schema (`FINANCIAL-ARCHITECTURE.md` §4.4).

**Future consequences.** Revisit only if a concrete need appears — most likely semantic search (AD-005) or availability overlap constraints. Not before.

---

## AD-003 — Layered Express, not a framework migration

**Context.** Backend is Express 4 with CommonJS. The default stack names NestJS. The audit's finding was the absence of layering, not the absence of a framework.

**Options.**
1. **Introduce layers inside Express:** transport → application → domain → infrastructure, with a composition root.
2. Migrate to NestJS.
3. Rewrite in TypeScript + NestJS.

**Chosen: 1**, with TypeScript adopted incrementally (AD-014).

**Why.** NestJS would supply DI and module conventions IMAP can get with ~200 lines of composition root. A framework migration during Phase B–D would rewrite every handler at the same time as introducing the audit log, the ledger and the authorization layer — the highest-risk possible sequencing, on a codebase with 31 tests. Express's weakness is that it *permits* SQL in handlers; that is fixed by a lint rule forbidding `pool.query` outside `infrastructure/`, not by a new framework.

**Trade-offs.** Manual DI wiring. No framework-provided module graph, so AD-001's boundaries need explicit tooling. Diverges from the stated default stack — recorded here rather than silently.

**Future consequences.** Revisit at Phase G. If the team grows past ~6 backend engineers, framework conventions start paying for themselves.

---

## AD-004 — Service Graph as relational tables with a materialised adjacency projection

**Context.** D-003 makes the Service Graph the highest-leverage asset. Queries needed: "services related to X", "providers with capability for service X in area Y available on date Z", "services implied by goal G".

**Options.**
1. **Relational tables + a materialised `service_edge` closure/adjacency table, rebuilt on catalogue change.**
2. Native graph database (Neo4j).
3. Adjacency in the relational DB, traversed recursively at query time.
4. Graph projected into a search index.

**Chosen: 1.**

**Why.** The graph is *small and slow-changing* — order 10² services and 10³ edges at MVP, edited by staff, not by users. It is not a social graph. Traversals are depth ≤2 in practice (service → related, goal → services). A materialised adjacency table answers every query with one indexed join and rebuilds in milliseconds. A graph database would add an operational component, a second consistency domain and a second backup story to solve a problem a join already solves.

**Trade-offs.** Deep or variable-depth traversal is awkward — accepted, because no product requirement needs it. Rebuild-on-write must be transactional with the catalogue edit or the projection drifts.

**Future consequences.** Revisit if goal decomposition (LATER) needs multi-hop weighted paths. Even then, an in-memory graph built from the same tables is likelier than a graph database.

---

## AD-005 — No dedicated search infrastructure at MVP

**Context.** Discovery today is `LIKE '%q%'` across five columns, which no index can serve. The temptation is OpenSearch.

**Options.**
1. **Relational discovery**: structured filters (service, area, availability) + a normalised keyword table, ranked in the application layer.
2. OpenSearch / Elasticsearch from the start.
3. MySQL/TiDB full-text.
4. Vector search from the start.

**Chosen: 1.**

**Why.** MVP is 5–8 categories in 3–5 areas of one city. The candidate set after structured filtering is tens to low hundreds of providers. At that size, ranking in application code is *faster* than a network hop to a search cluster, fully inspectable (R-302 requires the ranking basis be shown to the user), and needs no second data store to keep in sync. Bangla full-text with typo tolerance is genuinely hard, and it is also mostly unnecessary: after the intent layer maps a need to a `service_id` (Phase E), free-text search is a fallback path, not the primary one.

**Trade-offs.** Free-text search quality is weak until the intent layer lands. Bangla stemming and typo tolerance are absent. Accepted as a stated MVP limitation, mitigated by service-name synonyms held in the catalogue.

**Future consequences.** Trigger for revisiting: >5,000 active providers, or >3 cities, or measured search-abandonment (`KPI.md` §2 `intent_failed`) above threshold. Semantic/vector retrieval is a Phase I concern and is where AD-002 might also be revisited.

---

## AD-006 — Transactional outbox for events; no message broker at MVP

**Context.** Realtime is currently a side effect of HTTP handlers (`req.app.get("io")` inside route code). There are no domain events, so nothing else can subscribe — notifications, analytics, the trust graph and AI context all need to.

**Options.**
1. **Transactional outbox**: events written to an `outbox` table *in the same transaction* as the state change; a dispatcher polls and publishes; in-process handlers plus a Redis pub/sub fan-out for realtime.
2. Kafka / RabbitMQ / SQS.
3. In-process event emitter only.
4. Dual-write to a broker inside the transaction.

**Chosen: 1.**

**Why.** The outbox gives exactly-once *production* semantics with no extra infrastructure: if the transaction commits, the event exists; if it rolls back, it does not. Option 4 is the classic dual-write bug and would reproduce the audit's "balance credited, ledger row rejected" defect class in a new place. A broker adds an operational component for a volume that a polled table handles trivially.

**Trade-offs.** Publish latency is the poll interval (target ≤1 s, satisfying `N-05` ≤3 s p95). Consumers must be idempotent because delivery is at-least-once. Outbox table needs pruning.

**Future consequences.** The dispatcher is the natural first extraction (AD-001). Swapping the transport to a broker later changes the dispatcher only — producers and consumers are unaffected, which is the point of the pattern.

---

## AD-007 — Double-entry, append-only ledger; balances are derived

**Context.** `users.balance` is a mutable `DECIMAL` column written from seven code paths, with `wallet_transactions` as a best-effort side log that cannot reconstruct it. The audit found free ৳500 at signup with no ledger entry, unlogged credits from an enum mismatch, and double-charging.

**Options.**
1. **Double-entry ledger**, append-only, with a maintained balance projection.
2. Single-entry transaction log + mutable balance.
3. Keep the mutable balance, add better logging.

**Chosen: 1.**

**Why.** Double-entry is the only model where "does this balance make sense?" is a question the system can answer. Every movement has a debit and a credit that must sum to zero, so an incomplete write is structurally detectable rather than silently absorbed. The audit's central money finding — that `users.balance` is unreconcilable — is unfixable without it.

**Trade-offs.** More rows, more concepts, more up-front modelling. Reads need a balance projection, which is derived state and must be rebuildable from entries alone (`FINANCIAL-ARCHITECTURE.md` §5).

**Future consequences.** Makes provider payouts, commission accrual on cash bookings (`BUSINESS-MODEL.md` §3.2) and dispute holds expressible. Also makes D-010 reversible: if stored value is ever licensed, it is a new account type, not a new architecture.

---

## AD-008 — Money as integer minor units with an explicit currency

**Context.** Money is `DECIMAL(10,2)`/`DECIMAL(12,2)` with `৳` hardcoded in ~100 template literals and `payments.currency` defaulting to `'BDT'` and never read.

**Options.**
1. **Integer minor units (poisha) + ISO currency code on every monetary value.**
2. Keep `DECIMAL`.
3. Floating point. *(Listed only to be rejected — it is how rounding losses enter a ledger.)*

**Chosen: 1.**

**Why.** Integers remove an entire class of rounding and comparison error, make ledger balancing exact, and make `I-01` (i18n) satisfiable without a data migration later. `DECIMAL` is safe arithmetically but invites implicit currency assumptions, which is precisely what happened.

**Trade-offs.** A migration of existing amounts, and a display layer that must never be bypassed. Every API money field becomes `{ amount: 85000, currency: "BDT" }` rather than `850.00` — more verbose, and unambiguous.

---

## AD-009 — Audit log written inside the state-change transaction

**Context.** No audit log exists. It is the largest single gap carried from Phase 0 and blocks the trust model (D-004), disputes, AI action traceability (D-002) and most of `KPI.md`.

**Options.**
1. **Append-only `audit_log` table in the primary database, written in the same transaction as the change it records.**
2. Asynchronous logging via the event stream.
3. External log aggregation only.

**Chosen: 1**, with async export to cold storage for retention.

**Why.** An audit record that can be lost when the state change succeeds is not an audit record. Same-transaction writing makes the record and the change atomic. The alternative — deriving audit from domain events — sounds elegant and fails for the exact case that matters: an event consumer that crashes leaves a change with no record, and that gap is discovered during an investigation.

**Trade-offs.** Write amplification on every mutation, and the audit table becomes one of the largest in the system. Mitigated by partitioning and by keeping payloads small — diffs of changed fields, never whole rows, and never sensitive values (`AUDIT-LOG-ARCHITECTURE.md` §4).

**Future consequences.** Once this exists, several current "we can't know" answers become computable, including whether the compromised `admin123` credential was ever used — which today is unanswerable.

---

## AD-010 — Application-level idempotency keys plus deterministic domain references

**Context.** Phase 0.5 introduced deterministic ledger refs (`booking:<id>:payout`) under a unique index, which fixed repeat payouts. That covers domain-internal repeats; it does not cover a client retrying a POST.

**Options.**
1. **Two layers:** (a) client-supplied `Idempotency-Key` on mutating endpoints, stored with the response for replay; (b) deterministic domain references under unique constraints for internal effects.
2. Deterministic refs only.
3. Client keys only.

**Chosen: 1.**

**Why.** They defend different failures. Deterministic refs stop double payouts even if the caller is buggy. Client keys stop double *bookings* from a retried request, where the domain has no natural key to deduplicate on. Both are needed; neither subsumes the other.

**Trade-offs.** An `idempotency_key` table with TTL, a conflict semantic (same key + different body = 409), and a discipline that every mutating endpoint declares its behaviour.

---

## AD-011 — Object storage with signed URLs; no binary data in the primary database

**Context.** KYC images are base64 `LONGTEXT` up to ~5 MB each, four per document; avatars up to ~2 MB. The admin KYC list selected `k.*` and shipped whole documents until Phase 0.5.

**Options.**
1. **Private object storage (Cloudflare R2), short-lived signed URLs, access logged.**
2. Keep base64 in the database.
3. Public bucket with unguessable keys.

**Chosen: 1.**

**Why.** Identity documents in the primary database mean they are in every backup, every replica and potentially every log line, with row-level access control as the only barrier. Option 3 is security by URL secrecy, which fails the moment a URL is shared or logged. `D-02` and `D-03` require exactly option 1.

**Trade-offs.** A storage dependency on the read path for media; signed-URL expiry needs care in poor-connectivity conditions. The Phase 0.5 finding that `R2_BUCKET_NAME` vs `R2_BUCKET` silently mis-targeted the bucket shows this path needs boot-time configuration validation, not runtime discovery.

---

## AD-012 — Frontend: two builds sharing packages, not four applications

**Context.** One 5,567-line `App.jsx`, no routing, ~30 page keys in React state, Ant Design (~135 KB gzip) in the same bundle as the consumer app. Four audiences: consumer, provider, business (LATER), admin.

**Options.**
1. **`apps/web` (consumer + provider, route-split) + `apps/admin` (separate build), sharing `packages/*`.**
2. One app for everything.
3. Four separate applications.
4. Micro-frontends.

**Chosen: 1.**

**Why.** The real problem is bundle contamination and the absence of boundaries, not the number of deployables. Consumer and provider share authentication, the design system, the API client and the domain types; splitting them into separate apps duplicates all four for two audiences that overlap (a provider is also a consumer). Admin is genuinely different — different design system, different users, different risk — and must never ship to a consumer. Business (LATER) becomes a route group inside `apps/web` when it exists.

**Trade-offs.** `apps/web` must enforce that provider routes lazy-load, or the consumer bundle grows. Workspace tooling is added.

---

## AD-013 — Realtime stays Socket.io; Redis adapter for horizontal scale

**Context.** Socket.io works. Phase 0.5 extracted handlers to `realtime.js` and added participation-verified room joins. In-process `Map`s for cache and OTP currently prevent a second instance.

**Options.**
1. **Keep Socket.io; add the Redis adapter; move cache and OTP to Redis.**
2. Replace with raw WebSockets.
3. Server-Sent Events for status, WebSockets only for chat.
4. A managed realtime service.

**Chosen: 1.**

**Why.** The transport is not the problem; the authorization was, and it is fixed. Socket.io provides reconnection, fallback transport (which matters on Bangladeshi mobile networks) and room semantics that would otherwise be rebuilt. The Redis adapter is the standard, minimal path to multi-instance.

**Trade-offs.** Socket.io's payload overhead over raw WebSockets. A Redis dependency — which AD-006 and `R-1107` require anyway.

---

## AD-014 — TypeScript adopted incrementally, shared types first

**Context.** The entire codebase is plain JavaScript. No type checking anywhere. The most valuable types are the ones crossing the client/server boundary — exactly where the audit found the API accepting `amount`/`total_amount`/`service_name_en`/`service_type` interchangeably to tolerate three different callers.

**Options.**
1. **New code in TypeScript; `packages/domain-types` shared by both sides; existing files converted only when substantially changed.**
2. Big-bang conversion.
3. Stay on JavaScript with JSDoc checking.
4. Stay on JavaScript.

**Chosen: 1.**

**Why. **A big-bang conversion produces a large untested diff across a codebase with 31 tests. Incremental adoption puts types exactly where the defects were: money values, state enums, API contracts, tool schemas. AI tool definitions (`TOOL-CATALOG.md`) need machine-readable schemas regardless, and generating them from types is the honest way to keep them in sync.

**Trade-offs.** Mixed-language codebase for a long period. Build complexity.

---

## AD-015 — AI provider abstraction with policy-driven model routing

**Context.** Three inline `fetch` calls with hardcoded URLs and model names, two *different* Gemini models for the same conversation depending on streaming, no timeouts, no retries, no cost accounting, API key interpolated into the URL query string.

**Options.**
1. **`LLMClient` port with per-provider adapters; a routing policy that selects model tier by task class; capability declarations (tools, streaming, JSON mode).**
2. Direct SDK calls with a thin wrapper.
3. A third-party gateway product.

**Chosen: 1.**

**Why.** D-002 requires tool calling, which Gemini and OpenAI express differently — that alone forces an abstraction. Task-based routing is also the primary cost lever (`AI-ARCHITECTURE.md` §9): intent classification is a cheap-model task, plan synthesis is not, and hardcoding one model for both is the expensive mistake.

**Trade-offs.** The abstraction must not become lowest-common-denominator. Capability flags rather than a uniform interface; a task requiring native tool calling declares it and cannot route to a model without it.

---

## AD-016 — Async work in a queue with visible retry, not fire-and-forget

**Context.** Notifications, push, SMS and cache invalidation are fired with `.catch(() => {})` inside request handlers — the audit counted 20+ such sites. A failed notification is invisible.

**Options.**
1. **A durable job table (same database) consumed by a worker process, with attempts, backoff and a dead-letter state.**
2. A hosted queue (SQS, Cloud Tasks).
3. Keep in-process fire-and-forget.

**Chosen: 1**, sharing the outbox mechanism from AD-006.

**Why.** Reusing the outbox pattern for jobs keeps one durable-work concept instead of two. Failures become visible and retryable rather than silently discarded, which the audit shows is the current behaviour for every notification in the system.

**Trade-offs.** Polling latency; a second process to operate. The worker is the first AD-001 extraction candidate.

---

## AD-017 — Accounts, memberships and roles; retire the `users.role` enum

**Context.** `users.role ENUM('customer','provider','admin')` with a flat `requireRole()` check. `PERSONAS.md` requires business/SME organisations (LATER), provider teams (P3, LATER), and distinct admin functions (§60: platform owner, admin, support, finance, trust & safety, operations).

**Options.**
1. **`principal` (authenticated identity) + `account` (consumer / provider / organisation) + `membership` (principal ↔ account with a role) + resource-scoped permissions.**
2. Add more values to the role enum.
3. Full ABAC policy engine.

**Chosen: 1**, with authorization as RBAC + resource ownership rules (`AUTHORIZATION-ARCHITECTURE.md`).

**Why.** A single user is legitimately a customer *and* a provider *and* a member of a business — the current enum cannot express that, and every workaround pushes role assumptions deeper into domain code. Option 3 is more power than the product needs and is hard to reason about at review time; a policy engine also makes "who can do what" harder to audit, not easier.

**Trade-offs.** More joins on the authorization path — mitigated by caching the principal's memberships per request. Migration must preserve every existing role.

---

## AD-018 — AI context in relational storage, tiered; no vector database at MVP

**Context.** No context store exists. Constitution §5.3 defines Open / Guarded / Sealed tiers with different access rules; `R-803`, `R-804`, `R-805` require user-visible, deletable memory.

**Options.**
1. **Relational context tables with an explicit `tier` column, purpose-scoped access, TTL, and a user-facing view.**
2. A vector database from the start.
3. Model-provider-hosted memory.
4. Documents in object storage.

**Chosen: 1.**

**Why.** The MVP's memory needs are structured, not semantic: preferences, saved providers, active tasks, recent services. "What do you remember about me?" (R-804) must render as a plain-language *list*, which requires structure. Option 3 puts personal data in a third party's retention policy and makes deletion unverifiable — incompatible with `D-08` and Constitution §5.3 rule 3.

**Trade-offs.** No semantic recall over past conversations. Accepted: conversational recall is not an MVP requirement and is a Phase I concern.

---

## AD-019 — Legally-gated capabilities are extension points, not disabled code paths

**Context.** D-010 (customer stored value) and D-011 (microloans) are withdrawn pending legal review and are unsigned.

**Options.**
1. **Model the ledger with account types general enough to express a customer liability account, but issue none; keep lending entirely outside the domain model, with a documented integration seam for a licensed partner.**
2. Delete all traces.
3. Keep the features behind a feature flag.

**Chosen: 1.**

**Why.** Option 3 is the dangerous one — a flag implies the code is safe to switch on, and the audit shows that flags in this codebase (`isConfigured()` selecting mock payment settlement) were the mechanism by which unsafe behaviour reached production. Option 2 loses genuinely useful modelling: a double-entry ledger with a proper account-type taxonomy costs nothing extra and makes future licensed activation a data change rather than a redesign. **No customer liability account is issuable in code; the account type simply exists in the taxonomy.**

**Trade-offs.** A reader may mistake the extension point for intent. Mitigated by explicit statements in `FINANCIAL-ARCHITECTURE.md` §3 and this record.

---

## AD-020 — Emergency is a separate bounded context with a stricter contract

**Context.** Emergency data is Sealed (`R-1005`), IMAP has no dispatch capability, and the audit found fabricated alerts and donors served as real.

**Options.**
1. **A separate bounded context with its own storage, its own access rules, no AI context access, and a `verified_source` requirement on anything presented as information.**
2. Treat it as another marketplace domain.
3. Remove it.

**Chosen: 1.**

**Why.** Emergency has a different harm profile from every other domain — the cost of a wrong answer is physical. Separating the context makes the stricter rules enforceable at the boundary rather than remembered by developers. It also keeps `R-1010` (provider in-booking emergency, a Gate-1 requirement) implementable without loosening anything in the marketplace.

**Trade-offs.** Some duplication of user/booking reference data across the boundary. Accepted deliberately: the boundary is the point.

---

## Decision index

| ID | Decision | Reverses cleanly? | Trigger to revisit |
|---|---|---|---|
| AD-001 | Modular monolith | Yes — extraction is planned | Scale/ownership triggers in `SYSTEM-ARCHITECTURE.md` §9 |
| AD-002 | Stay MySQL/TiDB | Expensive | Semantic search, availability constraints |
| AD-003 | Layered Express | Moderate | Team >6 backend engineers |
| AD-004 | Relational service graph | Yes | Multi-hop weighted traversal |
| AD-005 | No search infrastructure | Yes | >5k providers, >3 cities, search abandonment |
| AD-006 | Transactional outbox | Yes — transport-only change | Cross-service consumers |
| AD-007 | Double-entry ledger | No — foundational | — |
| AD-008 | Integer minor units | No — foundational | — |
| AD-009 | In-transaction audit log | No — foundational | — |
| AD-010 | Two-layer idempotency | Yes | — |
| AD-011 | Object storage + signed URLs | Yes | — |
| AD-012 | Two frontend builds | Yes | Business workspace scale |
| AD-013 | Socket.io + Redis adapter | Yes | Connection volume |
| AD-014 | Incremental TypeScript | Yes | — |
| AD-015 | LLM provider abstraction | No — required by D-002 | — |
| AD-016 | Durable job queue | Yes | Job volume |
| AD-017 | Accounts + memberships | No — foundational | — |
| AD-018 | Relational AI context | Yes | Semantic recall requirement |
| AD-019 | Legally-gated extension points | Yes | Legal sign-off on D-010/D-011 |
| AD-020 | Emergency as its own context | Yes | — |

---

## Conflicts with Phase 1 found during Phase 2

Recorded rather than silently resolved, per the phase rule.

| # | Phase 1 statement | Architectural finding | Resolution |
|---|---|---|---|
| **C-01** | `PRD.md` §4.6 names provider-earnings states `accrued → payable → paid_out`, `held`, `reversed` | These are states of a **payout claim**, not of a ledger entry. A double-entry ledger entry (AD-007) is immutable and has no lifecycle. | **Documentation clarification, not a product change.** `STATE-MACHINES.md` §8 models the machine as `PayoutClaim` and states this explicitly. The product intent is unchanged. |
| **C-02** | `PRD.md` §4.5 payment states `initiated → authorised → captured → settled` | SSLCommerz does not expose an authorise/capture split; it is a single hosted-checkout settlement. Modelling four states implies control IMAP does not have. | **Documentation clarification.** `STATE-MACHINES.md` §5 keeps the four states as the *domain* model, marks `authorised` and `captured` as coincident for SSLCommerz, and notes that separating them requires a different gateway. No product decision changed. |
| **C-03** | D-010 removes customer stored value; `PRD.md` R-611 converts loyalty points to a per-booking discount at NEXT | A discount applied at booking time is a **pricing** concern, not a wallet concern; the Phase 1 documents leave its owner ambiguous. | `DOMAIN-ARCHITECTURE.md` assigns discounts to the **Pricing** domain and loyalty accrual to a **Loyalty** domain that owns points only. Ambiguity resolved without changing the decision. |
| **C-04** | Five product decisions require sign-off "before Phase 2 begins"; Phase 2 was begun without it | — | Architecture treats all five as extension points (AD-019, AD-020). **Escalated, not resolved.** Listed in the final report. |
| **C-05** | `PRD.md` §4.4 gives booking states `pending → confirmed → active → [arrived] → completed`, plus `cancelled` | R-505 requires the **customer** to confirm completion, and R-1102 requires a dispute to hold funds. Neither is expressible without an intermediate state between "provider says done" and "completed", and a `disputed` state. | **Elaboration, declared not silent.** `STATE-MACHINES.md` §4 adds `awaiting_confirmation` and `disputed`. This makes R-505 and R-1102 implementable and changes no product decision — but it is a change to the state list Phase 1 published, so it is recorded here rather than absorbed. |

No Phase 1 product decision has been changed by this phase.

---

# Phase 2.75 amendment — decisions AD-021 … AD-026

**Date:** 2026-08-09 · **Basis:** `docs/audit/PHASE-2.5-GATE-REPORT.md`, `docs/audit/PHASE-2.75-DATABASE-REHEARSAL.md`

Six decisions, of which two **correct** earlier ADs. Corrections are recorded as new
decisions rather than as edits, so the reasoning that produced the original stays visible.

## AD-021 — Defer the service-graph closure table (corrects AD-004)

**Context.** AD-004 materialises `service_edge_closure` while justifying the relational
choice on the grounds that the graph is "small and slow-changing". Phase 2.5 (S-01)
found the decision contradicted by its own reasoning: a few hundred slow-changing nodes
do not need a materialised transitive closure, and the table brings a rebuild path, a
drift class and a consistency question with it.

**Decision.** Gate 1 holds the service graph in memory and rebuilds on change. The
closure table is designed and not built.

**Revisit when** the graph exceeds roughly 5,000 nodes, changes frequently enough that
in-memory rebuild is disruptive, or multi-hop weighted traversal is required.

**Cost of reversal.** Low — adding the table later is additive.

## AD-022 — Defer the discovery projection (adopts S-03)

**Context.** A dedicated read projection costs one table and eight event handlers, and
introduced ownership defect O-04. Gate-1 discovery is a filtered join over four tables
at a few hundred providers.

**Decision.** Query the relational model directly at Gate 1. Introduce the projection
when measured query latency requires it.

**Revisit when** p95 discovery latency exceeds the budget in `PERFORMANCE.md` under real
load. Measured, not assumed.

## AD-023 — `booking_clearing` as a distinct account kind (closes V-03)

**Context.** The worked ledger flows post to `customer_settlement`, which is not in the
account taxonomy. Five existing kinds were tested as substitutes and all failed;
`customer_liability` failed *dangerously*, because routing booking payments through it
means issuing customer stored value on every transaction — the regulated activity D-010
withdraws pending legal sign-off.

**Decision.** Add `booking_clearing` (Platform, credit balance), distinct from and never
merged with `customer_liability`. Reasoning and constraints in
`FINANCIAL-ARCHITECTURE.md` Phase 2.75 amendment A1.

**Cost of reversal.** None — it is a required account, not an optimisation.

## AD-024 — Every job declares an idempotency property (completes AD-010, AD-016)

**Context.** AD-010 covers API idempotency; event consumers were specified. Jobs were
not — and jobs are what call SMS, push and payment providers. A retried job with no
identity repeats an external side effect.

**Decision.** Every job declares `idempotent: "key"` (deterministic job key plus an
effect token presented to the external system) or `idempotent: "at-least-once"` (an
explicit statement that repetition is harmless — **not permitted for external side
effects**). A job that declares neither fails at startup, exactly as a use case with no
authorization policy does. Full contract in `EVENT-ARCHITECTURE.md` amendment B1.

**Consequence.** AD-010 and AD-016 move from PROVISIONAL to LOCKED.

## AD-025 — Fail-closed environment identity (closes V-01)

**Context.** Seven production safety controls keyed on `NODE_ENV === "production"` while
`.env` declared development against the production database, disabling all seven against
real user data.

**Decision.** Environment is resolved on two independent axes — what the process is
(`APP_ENV`, then `NODE_ENV`, unset → production) and what the data is (`DATABASE_ENV`,
then host inference, unknown → production). Development behaviour requires **both** to be
development-like. A non-production process refuses to open a production database. Scripts
that write to production require a typed acknowledgement naming the exact database.
Demo seeding has no override at all.

**Implemented**, not merely specified: `backend/config/environment.js`, 14 call sites,
18 tests. Specification in `ENVIRONMENT-ARCHITECTURE.md`.

**Cost of reversal.** n/a — this is a safety property, not a trade-off.

## AD-026 — Gate 1 is the implementation boundary (closes V-06)

**Context.** Phase 1 defines two release gates; Phase 2 classified everything against a
single "MVP", producing an architecture roughly twice the size of the first release.

**Decision.** `GATE-1-ARCHITECTURE.md` is the binding scope for Phase 3: 5 modules,
~38 entities, 16 events, 6 state machines, 0 AI tools, 4 bounded contexts plus Platform.
Anything specified in Phase 2 and absent from that document is **deferred, not deleted**
— it stays designed, and it is not built at Gate 1.

**Revisit when** Gate 1 ships. Gate 2 scope is then re-derived from what Gate 1 learned,
not assumed from Phase 2.

---

## Decision index — Phase 2.75 additions

| ID | Decision | Reverses cleanly? | Trigger to revisit |
|---|---|---|---|
| AD-021 | Defer closure table | Yes — additive | Graph size, traversal depth |
| AD-022 | Defer discovery projection | Yes — additive | Measured p95 latency |
| AD-023 | `booking_clearing` account | No — required | — |
| AD-024 | Job idempotency declaration | No — foundational | — |
| AD-025 | Fail-closed environment identity | No — safety property | — |
| AD-026 | Gate 1 as implementation boundary | Yes | Gate 1 ships |

## Status after Phase 2.75

| Was | Now | Why |
|---|---|---|
| AD-004 REQUIRES RESEARCH | **LOCKED as amended by AD-021** | Contradiction resolved by deferring the table |
| AD-010 PROVISIONAL | **LOCKED** | Job layer specified (AD-024) |
| AD-016 PROVISIONAL | **LOCKED** | Same |
| AD-002 PROVISIONAL | **PROVISIONAL** | TiDB verification still outstanding — `PHASE-2.75-DATABASE-REHEARSAL.md` §5 |
| AD-003 PROVISIONAL | **PROVISIONAL** | Unchanged; revisit at team scale |
| AD-018 PROVISIONAL | **PROVISIONAL** | Gate 2 concern; untouched by this phase |
| AD-019, AD-020 BLOCKED BY SIGN-OFF | **BLOCKED BY SIGN-OFF** | D-010, D-011, D-012, D-013 unresolved. **No approval has been invented** |

**16 LOCKED · 4 PROVISIONAL · 0 REQUIRES RESEARCH · 2 BLOCKED BY SIGN-OFF · 6 new.**

## Conflicts with Phase 1 — status

C-01 … C-05 are unchanged and remain recorded rather than resolved. C-04 (five product
decisions requiring sign-off) is still open and is listed in `PHASE-3-READINESS.md` §7.
