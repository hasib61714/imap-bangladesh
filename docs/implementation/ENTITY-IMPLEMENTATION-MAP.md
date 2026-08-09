# IMAP 2.0 — Entity Implementation Map (Gate 1)

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Authoritative scope:** `GATE-1-ARCHITECTURE.md` §4 — 38 entities. Entities in `DATA-ARCHITECTURE.md` §3 but absent here are **deferred, not deleted**.

**Conventions.** Ids are UUIDv7 `CHAR(36)`. Money is `BIGINT` minor units + `CHAR(3)` currency (AD-008). Time is UTC `DATETIME(3)`. Every table has `created_at`; mutable tables have `updated_at`. Privacy class per `DATA-ARCHITECTURE.md` §6.

---

## platform (6)

### `audit_record` → `audit_log`
| | |
|---|---|
| **Owner** | platform · **Privacy** Internal (no sensitive values) |
| **Fields** | `id` · `occurred_at` · `correlation_id` · `actor_principal_id` NULL · `actor_account_id` NULL · `actor_role` · `actor_via` ∈ http\|ai\|job\|system\|ops · `on_behalf_of` NULL · `action` · `resource_type` · `resource_id` · `resource_owner` · `outcome` ∈ permitted\|denied\|failed · `before_json` · `after_json` · `reason` NULL |
| **Constraints** | append-only. **DB grant: `INSERT`, `SELECT` only.** `reason` NOT NULL where `action` is punitive or an override — enforced in the domain |
| **Indexes** | `(resource_type, resource_id, occurred_at)` · `(actor_principal_id, occurred_at)` · `(correlation_id)` · `(action, occurred_at)` |
| **API** | `GET /ops/audit` (admin, itself audited) |
| **Events** | none |
| **Audit** | — (it is the audit) |
| **Migration source** | **none — new** |
| **Tests** | atomicity with the state change · no update/delete path · changed fields only · no Sensitive value in a payload |

### `outbox_event`
`id` · `aggregate_type` · `aggregate_id` · `type` · `payload_json` · `occurred_at` · `published_at` NULL · `attempts` · `last_error`.
Written in the state-change transaction. Index `(published_at, id)` for dispatch. New. Test: no event exists for an uncommitted change; dispatcher is at-least-once and consumers are idempotent.

### `job`
`id` · `kind` · `job_key` **UNIQUE(kind, job_key)** · `payload_json` · `run_after` · `attempts` · `state` ∈ pending\|running\|succeeded\|failed\|dead · `effect_token` · `result_json` · `last_error`.
AD-024: enqueuing a duplicate `(kind, job_key)` is a no-op returning the existing job. `effect_token` is derived from `job_key`, **never from the attempt** — otherwise every retry is a new request to the provider. New.

### `idempotency_key`
`key` · `scope` · `principal_id` · `request_hash` · `response_json` · `state` ∈ in_flight\|complete · `expires_at`. **UNIQUE(key, scope)**. TTL 24 h general, 7 days financial. New.

### `feature_flag`
`capability` · `state` ∈ available\|degraded\|unavailable · `message_bn` · `message_en` · `updated_by` · `updated_at`.
Feeds the nine-state vocabulary and the emergency capability statement (R-1002) as **data, not copy**. Migration source: `system_settings` (created at import time by `admin.js`).

### `schema_migration`
Exists (Phase 0.5). Unchanged.

---

## identity (8)

### `principal`
| | |
|---|---|
| **Owner** | identity · **Privacy** Identity |
| **Fields** | `id` · `status` ∈ registered\|active\|suspended\|closed · `created_at` · `updated_at` |
| **Constraints** | `closed` is terminal |
| **API** | `GET /me` |
| **Events** | `account.created` |
| **Migration source** | `users` — identity half |
| **Tests** | closed principal cannot authenticate |

### `credential`
`id` · `principal_id` FK · `kind` ∈ password\|oauth · `secret_hash` NULL · `provider` · `provider_subject` · `created_at` · `last_used_at`.
**UNIQUE(principal_id, kind, provider)**; UNIQUE(provider, provider_subject).
**The Phase 0.5 rule becomes structural: no row means no password login.** A NULL `secret_hash` is treated as no credential. Privacy: Identity — never returned by any query.
Migration source: `users.password_hash`, `users.social_id`. **Rows with a NULL hash produce no credential row** (`AUTH-MIGRATION-PLAN.md` §3).
Tests: matrix row 1 — no credential never authenticates; constant-time compare with a dummy hash.

### `session`
`id` · `principal_id` · `account_id` (active) · `issued_at` · `expires_at` · `revoked_at` NULL · `device` · `refresh_token_hash`.
Replaces `refresh_tokens`, which is **never read or written today**. Rotating refresh. Index `(principal_id, revoked_at)`.
Migration source: none — all sessions are invalidated at cutover, deliberately (`CREDENTIAL-INCIDENT.md` §3 step 3).

### `account`
`id` · `kind` ∈ consumer\|provider\|organisation · `display_name` · `status` · `created_at`.
`organisation` is defined and unused at Gate 1 — the seam for the business workspace, so it is not a later migration.
Migration source: derived from `users` — one consumer account per user; one additional provider account per `providers` row.

### `membership`
`id` · `principal_id` · `account_id` · `role` · `granted_by` · `granted_at` · `revoked_at` NULL. **UNIQUE(principal_id, account_id)**.
**Replaces `users.role`** (AD-017). Gate-1 roles: `customer`, `provider`, `admin`; policies are written against the six platform roles (`GATE-1-IMPLEMENTATION-MAP.md` Module 5 deviation).
Tests: matrix row 2 — role cannot be set through registration or profile update.

### `contact_verification`
`id` · `principal_id` · `channel` ∈ phone\|email · `value_hash` · `verified_at` · `verified_by_method`.
Gates booking an in-home service (R-410). Privacy: Sensitive.
Migration source: `users.verified`, `users.phone`, `users.email` — **only where a verification actually happened**; an unverifiable legacy flag does not become a verification record (`AUTH-MIGRATION-PLAN.md` §5).

### `verification_case`
`id` · `principal_id` · `kind` ∈ identity\|capability · `state` (machine #4) · `submitted_at` · `decided_by` · `decided_at` · `decision_reason` · `expires_at`.
**Privacy: Highly sensitive — Sealed. Never enters AI context** (R-706).
`decision_reason` NOT NULL when state ∈ {rejected, revoked} — R-1103.
Migration source: `kyc_docs` (status + reviewer fields).

### `identity_document`
`id` · `case_id` FK · `doc_type` · `object_key` · `mime` · `bytes` · `uploaded_at` · `deleted_at` NULL.
**Reference only — no bytes in the database** (AD-011). Today: four `LONGTEXT` base64 columns up to ~5 MB each.
Every read goes through `GetIdentityDocumentUrl`, returns a short-lived signed URL, and **writes an audit record even though nothing changed** (V-07).
Migration: base64 → object storage, then the source columns are nulled. Irreversible once nulled — see `DATABASE-IMPLEMENTATION-PLAN.md` M-14.

---

## marketplace (9)

### `service`
`id` · `category_id` · `slug` UNIQUE · `name_bn` · `name_en` · `description_bn` · `description_en` · `price_model` ∈ fixed\|from\|inspection_quote · `state` ∈ draft\|active\|deprecated\|retired · `sort`.
**The entity that does not exist today.** Three conflicting taxonomies (12 DB categories / 8 code constants / 19 frontend constants) reconcile into one, server-owned (R-202).
Deletion is forbidden — history must stay readable.
Migration source: `categories` + `providers.service_type_*` + `frontend/src/constants/data.js` — **a human mapping exercise**, `MIGRATION-STRATEGY.md` G2.

### `service_category`
`id` · `slug` UNIQUE · `name_bn` · `name_en` · `icon` · `sort` · `is_active`. Migration source: `categories`.

### `service_edge`
`from_service_id` · `to_service_id` · `kind` ∈ related\|precedes\|alternative_to\|part_of · `weight`. **UNIQUE(from, to, kind)**; CHECK `from ≠ to`.
Held in memory at Gate 1 and rebuilt on change. **No closure table** (AD-021). New.

### `capability` and `service_capability_req`
`capability`: `id` · `slug` UNIQUE · `name_bn` · `name_en` · `requires_certification`.
`service_capability_req`: `service_id` · `capability_id`. UNIQUE pair.
`requires_certification = 1` is what makes a capability un-self-assertable (R-205, O-01). New.

### `provider`
`id` · `account_id` **UNIQUE** · `state` ∈ applied\|under_review\|approved\|listed\|paused\|suspended\|rejected · `bio_bn` · `bio_en` · `experience_years` · `rating_avg` (derived) · `completed_count` (derived).
**`is_approved` becomes a state, and `applied → listed` is impossible** (D-005). UNIQUE(account_id) prevents the duplicate provider rows possible today.
Migration source: `providers`. Every existing provider is grandfathered to `listed` — the same decision migration `002` already made, carried forward explicitly rather than by accident.

### `provider_capability`
`provider_id` · `capability_id` · `declared_at` · `verified` (**projection of the identity decision — not independently writable**, O-01) · `verification_case_id` NULL. UNIQUE pair.
Replaces one free-text string. Test: matrix row 19 — a self-asserted regulated capability is never `verified`.

### `provider_coverage`
`provider_id` · `area_id`. UNIQUE pair. Replaces free-text areas; enables geographic filtering. Supporting `area` table is the Bangladesh hierarchy (`DATA-ARCHITECTURE.md` §8): Division → District → Upazila → Area.
Coverage is a **set of areas, not a radius** — that is how providers actually describe where they work.

### `provider_price`
`provider_id` · `service_id` · `model` · `amount_minor` · `currency` · `updated_at`. UNIQUE(provider_id, service_id).
Server-authoritative price **input**. The price a customer sees comes from `quote`, never from here directly.
Migration source: `providers.hourly_rate` → a `from` price per mapped service; `categories.base_price` is the fallback. Where neither resolves, **the provider is not listable for that service** — fail closed, the Phase 0.5 rule.

### `availability_window` and `availability_hold`
`availability_window`: `id` · `provider_id` · `starts_at` · `ends_at` · `capacity` · `recurrence_id` NULL.
`availability_hold`: `id` · `window_id` · `booking_id` NULL · `held_until` · `state` ∈ held\|committed\|released.
**UNIQUE partial index on `window_id` while `state ∈ (held, committed)`** — this single constraint is what makes double-booking impossible (R-207).
`provider_schedule` (free-text, dateless, never read by booking) is **rewritten, not migrated**: there is no data worth preserving, and preserving it would preserve the defect.
Test: matrix row 6 — two concurrent bookings for one slot; exactly one succeeds, the other gets alternatives.

---

## booking (8)

### `booking`
| | |
|---|---|
| **Owner** | booking · **Privacy** Private |
| **Fields** | `id` · `quote_id` **NOT NULL** · `need_id` NULL · `customer_account_id` · `provider_id` · `service_id` · `state` (machine #1) · `scheduled_start` · `scheduled_end` · `address_json` · `landmark_text` · `otp_hash` · `auto_confirm_at` NULL · `payment_status` (**read model**, O-02) · `created_at` · `updated_at` |
| **Constraints** | `quote_id` NOT NULL — **a booking cannot exist without a server-issued price.** `otp_hash`, never plaintext |
| **Indexes** | `(customer_account_id, state, created_at)` · `(provider_id, state, scheduled_start)` |
| **API** | `POST /bookings` + 8 named commands |
| **Events** | 8 produced |
| **Audit** | every transition, with actor and reason |
| **Migration source** | `bookings` — live data, **High risk** |
| **Tests** | rows 4, 5, 6 — client price ignored; every illegal transition refused; concurrent transition has one winner |

`bookings.otp_code` is plaintext today. Migration hashes it and drops the column; in-flight bookings keep working because the hash is computed from the existing value.

### `booking_participant`
`booking_id` · `principal_id` · `role` ∈ customer\|provider. UNIQUE pair.
Makes participation a **row**, not a join computed in three places. It is what `bookingAccess.js` and the socket layer authorize against — one lookup, one truth.

### `booking_event`
`id` · `booking_id` · `from_state` · `to_state` · `actor_principal_id` · `reason` · `at`. Append-only.
Serves the customer timeline **and** the funnel. Collapses `need_understanding` + `need_outcome` (S-02).

### `dispute`
`id` · `booking_id` UNIQUE · `raised_by` · `state` (machine #5) · `reason` · `outcome` ∈ refund_full\|refund_partial\|no_action\|provider_penalty · `resolved_by` · `resolution_reason` · `sla_due_at`.
**Raising it holds funds** — via `booking.disputed`, consumed by finance (O-03). Booking never writes the hold.
Migration source: `complaints`.

### `conversation` and `message`
`conversation`: `id` · `booking_id` UNIQUE.
`message`: `id` · `conversation_id` · `sender_principal_id` · `body` · `sent_at` · `read_at`.
Privacy: Sensitive — **body never appears in an audit payload or a log line**; the audit records `message_sent`, conversation id and length.
Migration source: `chat_messages` (created at import time by `chat.js`).

### `review`
`id` · `booking_id` **UNIQUE** · `customer_account_id` · `provider_id` · `rating` 1–5 · `comment` · `tags_json` · `state` ∈ published\|flagged\|removed · `created_at`.
**Eligibility is already correctly enforced today** — only the paying customer of a completed, unrated booking. It is the best-implemented flow in the codebase and migrates unchanged. Moderation states are Gate 2.
Migration source: `reviews` — direct.

### `emergency_request`
`id` · `principal_id` · `kind` · `description` · `location_json` NULL · `booking_id` NULL · `state` ∈ received\|acknowledged\|in_progress\|resolved\|closed · `admins_reachable` · `created_at`.
**Privacy: Emergency — Sealed, never in AI context** (R-1005).
**There is no `dispatched` state.** Adding one would put a lie in the schema (D-012, D-013).
`admins_reachable` records how many admins were **actually** reachable — the field that makes the response truthful rather than generic.
`booking_id` supports R-1010: a provider raising an emergency mid-booking.
Migration source: `sos_alerts`.

Supporting: `emergency_ack`, `donor_consent`, `contact_release` (every release logged — D-013), `verified_source`, `hotline` (R-1009 — **currently unverified, an open risk**).

---

## finance (7)

### `quote`
`id` · `need_id` NULL · `service_id` · `provider_id` · `customer_account_id` · `amount_minor` · `fee_minor` · `total_minor` · `currency` · `price_model` · `expires_at` **NOT NULL** · `state` ∈ issued\|consumed\|expired.
**Immutable.** `quote_component` (`quote_id` · `kind` ∈ base\|area\|time\|promo\|commission · `amount_minor`) makes the price explainable rather than a single opaque number.
**This entity is where P0-3 becomes impossible**: a booking request carries a `quote_id` and no amount. New.

### `payment`
`id` · `booking_id` NULL · `account_id` · `amount_minor` · `currency` · `method` ∈ card\|mfs\|**cash** · `state` (machine #2) · `gateway_ref` · `captured_at` · `settled_at`.
**Cash produces a `Payment` row with `method = cash`, state `captured`, at completion** (O-02) — so there is one payment concept and one owner, not two paths.
Supporting: `payment_attempt` (gateway payloads **referenced, not stored wholesale**), `refund`.
Migration source: `payments` — **High risk, financial**.

### `ledger_account`
`id` · `owner_type` ∈ platform\|account · `owner_id` NULL · `kind` (10 kinds) · `currency`. UNIQUE(owner_type, owner_id, kind, currency).
The ten kinds, per AD-023: `customer_receivable` · **`booking_clearing`** · `gateway_clearing` · `platform_cash` · `provider_payable` · `provider_receivable` · `commission_revenue` · `refund_liability` · `promotional_expense` · `customer_liability`.
**`customer_liability` is defined and non-issuable** (AD-019, D-010) and **must never be merged with `booking_clearing`** — merging them means issuing customer stored value on every booking payment. New.

### `ledger_transaction`
`id` · `reference` **UNIQUE** · `kind` ∈ capture\|payout\|commission\|refund\|adjustment\|reversal\|opening · `occurred_at` · `correlation_id`.
`reference` is deterministic — `booking:<id>:payout` — and its unique index is the idempotency backbone (P0-5, P0-6).
Migration source: `wallet_transactions` (partially) + **an opening-balance exercise that cannot be derived from data** — `MIGRATION-STRATEGY.md` G3.

### `ledger_entry`
`id` · `transaction_id` · `account_id` · `direction` ∈ debit\|credit · `amount_minor` **> 0** · `currency`.
**Immutable. No `UPDATE`, no `DELETE` — no use case, no endpoint, no repository method.** Per transaction, Σ debits = Σ credits, enforced in the domain before the write.
`amount_minor > 0` with direction carrying the sign removes the negative-amount ambiguity of P0-4.
Index `(account_id, id)` for balance rebuild.

### `balance_projection`
`account_id` PK · `balance_minor` · `as_of_entry_id` · `updated_at`.
**Derived, never authoritative. Rebuildable from `ledger_entry` alone.** Updated in the same transaction as the entries; reconciled nightly, and a divergence alerts — the check `users.balance` could never pass.
Migration source: computed, never migrated.

### `payout_claim`
`id` · `provider_account_id` · `booking_id` · `amount_minor` · `state` (machine #3) · `clearance_at` · `held_reason` NULL · `paid_at`.
`payout_batch` is deferred (S-10): at Gate 1 a payout executes individually and `processing` means *transfer submitted*, not *included in a batch* — see the deviation note in `STATE-MACHINE-IMPLEMENTATION-PLAN.md` §4.
Supporting: `commission_accrual` (`booking_id` · `amount_minor` · `settlement_mode` ∈ digital\|cash) — cash accrues as a provider debit.

---

## Removed, collapsed, deferred — with the reason

| | Entity | Disposition |
|---|---|---|
| **removed** | `task` | Never distinct from `booking` |
| **removed** | standalone `price` | A price is a field on `quote` |
| **removed** | `ai_memory` | No AI at Gate 1 |
| **collapsed** | `need_understanding` + `need_outcome` → `booking_event` + `need` | One append-only row; the funnel is a query (S-02) |
| **deferred** | `service_edge_closure` | AD-021 |
| **deferred** | discovery projection | AD-022 |
| **deferred** | `payout_batch` | S-10 |
| **deferred** | `trust_signal`, `provider_standing` | `GATE-1-ARCHITECTURE.md` §3.1 — every *safety* capability survives; only scoring defers |
| **deferred** | `ranking_explanation` | R-302 is served by returning the basis with the result, not storing it |
| **deferred** | `notification_preference` | Written and never read today; Gate 1 has one channel policy |
| **deferred** | all AI entities (7) | Gate 2 |
| **deferred** | promotion, loyalty, referral | Post-Gate-1 |
| **rejected** | `wallet_account` | D-010 |
| **rejected** | `loan`, `loan_schedule`, `loan_repayment` | D-011 — **no lending entities at all**, deliberately, so nobody can wire one up |
| **rejected** | `disaster_alert` (first-party) | D-012 — replaced by `verified_source` |
| **rejected** | `donor_notification` | D-013 |
| **rejected** | `feed_item` | D-006 |

### One entity kept that Phase 2.5 proposed deferring

**`need`** (`id` · `principal_id` NULL · `raw_text` · `locale` · `channel` · `area_id` · `created_at`) is retained at Gate 1 despite the AI layer being deferred.

R-1108 makes it the link from expression → understanding → booking → outcome, and **the North Star metric ("Resolved Needs") is not computable without it**. It costs one table and one insert on the discovery path. Retro-fitting it after launch means the funnel has no history for the period that mattered most — the launch.

---

## Privacy classification summary

| Class | Entities | Consequence |
|---|---|---|
| **Public** | `service`, `service_category`, `service_edge`, `capability`, `review` (published), `hotline`, `verified_source` | Cacheable; no auth |
| **Internal** | `audit_record`, `feature_flag`, `job`, `outbox_event` | Ops roles only |
| **Private** | `booking`, `booking_event`, `need`, `notification`, `provider_*` | Own data; ids only in logs |
| **Sensitive** | `message`, `contact_verification`, `provider_coverage` + precise location, `payment.method` | Purpose-scoped; **never in an audit payload** |
| **Highly sensitive** | `verification_case`, `identity_document`, `dispute` | Object storage; **every read audited**; Sealed |
| **Financial** | all 7 finance entities | Restricted role; statutory retention |
| **Emergency** | `emergency_request`, `donor_consent`, `contact_release` | Sealed; short retention; revocation immediate |
| **Identity** | `credential`, `session` | Hashed; **never returned by any query** |

---

## Coverage check

Every Gate-1 entity has: an owning module · a table · a privacy class · a migration source (or "new") · at least one command or query · a test requirement.

**Gaps deliberately accepted, and named:**
* `area` has no command — Bangladesh's administrative hierarchy is reference data loaded by migration, not user-editable.
* `balance_projection` has no migration source — it is computed, and migrating it would create a second authority for a derived value, which is the defect this whole design exists to remove.
