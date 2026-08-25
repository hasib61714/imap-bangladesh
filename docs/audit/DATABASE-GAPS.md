# IMAP — Database Gaps

> **STATUS UPDATE — 2026-08-09 (Phase 0.5).** The findings below are the
> Phase 0 baseline and are preserved unchanged for traceability. Many have
> since been contained on branch `imap/phase-0.5-containment`. For current
> status see [`PHASE-0.5-SECURITY-REGRESSION.md`](PHASE-0.5-SECURITY-REGRESSION.md)
> — **all 12 P0 findings fixed and verified; 19 P1 fixed.** Do not read the
> text below as a description of the code as it stands today.

**Audit date:** 2026-08-09 · **Commit:** `726cc87` · **Engine:** TiDB Serverless (MySQL 8 wire, InnoDB, utf8mb4) · **Scope:** read-only. No schema or migration was created or changed.

---

## 1. Actual schema inventory

### Declared in `backend/schema.sql` (16 tables)

| Table | PK | Rows seeded | Notes |
|---|---|---|---|
| `users` | `VARCHAR(36)` | 1 (admin) | `balance DECIMAL(12,2) DEFAULT 500.00`, `avatar LONGTEXT`, `settings JSON` |
| `categories` | `INT AUTO_INCREMENT` | 12 | `base_price DECIMAL(10,2) DEFAULT 300.00` — never read by any route |
| `providers` | `VARCHAR(36)` | 0 | FK → users, FK → categories |
| `provider_schedule` | `INT AI` | 0 | Seeded lazily per provider on first GET |
| `bookings` | `VARCHAR(36)` | 0 | FK → users, FK → providers |
| `reviews` | `INT AI` | 0 | FK → bookings, users, providers |
| `kyc_docs` | `VARCHAR(36)` | 0 | 4 × `LONGTEXT` image columns |
| `wallet_transactions` | `INT AI` | 0 | `type ENUM('credit','debit')` |
| `notifications` | `INT AI` | 0 | |
| `promos` | `INT AI` | 0 in schema, 6 at runtime | |
| `loyalty_log` | `INT AI` | 0 | Also created again in `server.js:379` |
| `blood_donors` | `INT AI` | 0 in schema, 8 at runtime | Also created again in `blood.js:9` |
| `complaints` | `INT AI` | 0 | |
| `refresh_tokens` | `INT AI` | 0 | **Never read or written by any code** |
| `sos_alerts` | `INT AI` | 0 | |
| `payments` | `VARCHAR(36)` | 0 | |
| `microloans` | `VARCHAR(36)` | 0 | Also created again in `loans.js:19` |

### Created at runtime from application code (5 more)

| Table | Created in | Trigger |
|---|---|---|
| `referrals` | `server.js:388-396` | On server boot |
| `chat_messages` | `chat.js:9-19` | On module import |
| `disaster_reports` | `disaster.js:9-21` | On module import, then seeded with 4 rows |
| `push_subscriptions` | `users.js:349-358` | On first `/push-subscribe` call |
| `system_settings` | `admin.js:392-399` | On module import, then seeded with 6 rows |

### Columns added at runtime by `ALTER TABLE`

| Column | Added in |
|---|---|
| `users.nid_number VARCHAR(30)` | `providers.js:261` — runs on every boot |
| `promos.category`, `promos.tag`, `promos.max_discount` | `promos.js:9-11` |
| `blood_donors.last_donated`, `.latitude`, `.longitude` | `blood.js:28-30` |
| `bookings.completion_proof`, `kyc_docs.certificate_image` | `schema.sql:349-350` |

**Total live surface: 21 tables**, of which 5 exist only if the relevant module was imported, and the DDL for 3 is duplicated in two places with different definitions.

---

## 2. MISSING

Tables required by the audit brief §9 that do not exist in any form:

| Required | Status | Consequence |
|---|---|---|
| `services` (distinct from category) | **MISSING** | A "service" is a free-text string on `providers.service_type_en` and again on `bookings.service_name_en`. There is no canonical service entity, so nothing can be priced, related, or reasoned about. |
| Related-services / service graph edges | **MISSING** | Brief §2.6 is unimplementable. `/ai/bundle-suggest` substitutes a hardcoded map (`ai.js:731-737`). |
| `provider_services` / capabilities | **MISSING** | A provider offers exactly one free-text service and optionally one `category_id`. Multi-skill providers cannot be modelled. |
| `provider_coverage_areas` | **MISSING** | Area is free text (`area_bn`, `area_en`). `providers.latitude/longitude` exist and are **never queried** — no geo search exists despite a "Nearby" UI page. |
| `availability` / bookable slots | **PARTIAL → effectively MISSING** | `provider_schedule` stores free-text day + slot strings (`'সকাল ৯টা / 9:00 AM'`). It has no date, no capacity, no booking link, and `POST /api/bookings` never consults it. Double-booking is unpreventable. |
| `businesses` / SME accounts | **MISSING** | `users.role ENUM('customer','provider','admin')` |
| Financial ledger (double-entry) | **MISSING** | `users.balance` is the sole source of truth, mutated in place. `wallet_transactions` is a best-effort side log written outside any transaction. |
| `settlements` / payouts | **MISSING** | Provider earnings land in `users.balance`; withdrawal (`users.js:125-150`) debits the balance and writes a log row. Nothing records that money left the platform. |
| `refunds` | **MISSING** | `payments.refunded_at`, `.refund_reason` columns exist; nothing writes them. Cancellation credits the wallet directly (`bookings.js:270-279`). |
| `audit_logs` | **MISSING** | Verified: `grep -rn "audit_log" backend frontend/src` → no matches. No admin action, KYC decision, role change, or money movement is auditable. |
| AI context / memory / conversation | **MISSING** | Chat history lives only in browser state. Brief §2.5 is unimplementable. |
| Recommendations / personalisation | **MISSING** | |
| Analytics events | **MISSING** | All "analytics" are aggregate queries over `bookings` computed on read. |
| `disputes` beyond a status field | **PARTIAL** | `complaints` has `status`, `priority`, `assigned_to`, `resolved_note` — no SLA, no timeline, no evidence attachments, no link to a refund. |
| Idempotency keys | **MISSING** | Directly enables P0-5, P0-6 and the double-charge in P1-5. |
| Soft delete / retention | **MISSING** | No `deleted_at` anywhere. "Delete user" in the admin panel writes `is_active = -1` (`AdminPanel.jsx:157`), which the auth middleware treats as active (P1-11). |

---

## 3. INCONSISTENT — code ↔ schema conflicts

Each of these is a live defect, not a style issue.

```
Finding:  KYC document type enum mismatch.
Evidence: backend/routes/kyc.js:10-12
            body("doc_type").isIn(["nid","passport","birth_cert","driving_license"])
          backend/routes/upload.js:80
            const VALID_DOC_TYPES = ["nid","passport","birth_cert","driving_license"];
          backend/schema.sql:139
            doc_type ENUM('nid','driving','passport','birth') NOT NULL
Behavior: 'birth_cert' and 'driving_license' pass validation and then fail at INSERT.
Impact:   Two of four advertised document types cannot be submitted. Under strict mode
          the handler returns 500 "Server error"; the user sees no explanation.
Severity: P1
```

```
Finding:  Wallet transaction type enum mismatch.
Evidence: backend/schema.sql:158  type ENUM('credit','debit') NOT NULL
          backend/routes/payments.js:85,126,161  INSERT ... VALUES (?, 'topup', ...)
Behavior: Every wallet top-up ledger row is rejected. In payments.js:78-94 (mock mode)
          and :117-130 (IPN) the balance credit happens BEFORE this insert, so the
          balance changes and the ledger row is lost.
Impact:   Unlogged balance credits — the exact case reconciliation would need to catch.
Severity: P1
```

```
Finding:  providers INSERT omits a non-defaulted primary key.
Evidence: backend/schema.sql:51   id VARCHAR(36) PRIMARY KEY        (no default)
          backend/routes/providers.js:297-304
            INSERT INTO providers (user_id, service_type_bn, ..., experience_yrs)
            VALUES (?,?,?,?,?,?,?,?,?)
          (contrast: routes/auth.js:69-76 correctly supplies uuidv4() for the same table)
Behavior: Strict mode → "Field 'id' doesn't have a default value" → 500.
          Permissive mode → first row gets '', second row collides on the PK.
Impact:   POST /api/providers/apply is broken for users who do not already have a
          providers row — i.e. the entire "existing customer becomes a provider" path.
Severity: P1
```

```
Finding:  Category seed inserts string ids into an INT AUTO_INCREMENT primary key.
Evidence: backend/schema.sql:37   id INT AUTO_INCREMENT PRIMARY KEY
          backend/server.js:211-227 and backend/scripts/seedDemo.js:26-42
            { id: "cat-electric", ... }
            INSERT INTO categories (id, name_bn, name_en, slug, icon) VALUES (?,?,?,?,?)
            ... .catch(() => {});
Behavior: Every category insert fails and the error is discarded. The seeder reports
          "Categories: 8 upserted" (server.js:228) regardless.
Impact:   The seed endpoint's category step is a silent no-op; providers are then linked
          to whichever category slug happens to exist from schema.sql, and the two
          taxonomies use different slugs ('electrician' vs 'electrical'), so
          providers.category_id ends up NULL for most seeded providers.
Severity: P2 (data quality) — but it makes the seeded state undiagnosable.
```

```
Finding:  Booking status vocabulary differs across three definitions.
Evidence: backend/schema.sql:105   ENUM('pending','confirmed','active','completed','cancelled')
          backend/routes/bookings.js:180  ["pending","confirmed","active","completed","cancelled"]
          backend/server.js:108           ["pending","confirmed","ongoing","completed","cancelled"]
Behavior: A socket client emitting booking_status:"ongoing" passes the socket guard and
          broadcasts a status the database cannot hold; "active" is rejected by the socket
          guard but is the real DB value.
Severity: P2
```

```
Finding:  push_subscriptions.user_id typed INT while users.id is VARCHAR(36) UUID.
Evidence: backend/routes/users.js:351  user_id INT NOT NULL
          backend/schema.sql:11        id VARCHAR(36) PRIMARY KEY
Behavior: Inserting a UUID into an INT column coerces to 0 (or errors under strict mode).
Impact:   Web Push subscriptions are attributed to user 0; utils/push.js:26-29 then finds
          no subscriptions for the real user, so push silently never delivers.
Severity: P1
```

---

## 4. DUPLICATED

| Duplication | Locations | Risk |
|---|---|---|
| `microloans` DDL | `schema.sql:326-346` and `loans.js:19-39` | Definitions match today; nothing enforces that |
| `blood_donors` DDL | `schema.sql:218-233` and `blood.js:10-26` | `schema.sql` version has no `last_donated DATE NULL` default handling; `blood.js:28-30` patches it with `ALTER` |
| `loyalty_log` DDL | `schema.sql:206-215` and `server.js:379-387` | `schema.sql` version has `FOREIGN KEY (user_id) … ON DELETE CASCADE`; the `server.js` version **has no FK** — whichever runs first wins |
| Demo seeding | `server.js:189-338` (HTTP route) and `scripts/seedDemo.js` (CLI) | Two copies of the same 6-provider dataset, already drifting |
| Category taxonomy | `schema.sql:267-279` (12, INT ids), `server.js:211-220` (8, string ids), `constants/data.js:1-96` (19, numeric ids) | Three incompatible taxonomies; see `ARCHITECTURE-GAPS.md §10` |
| Provider→user lookup | `bookings.js:79,189`, `chat.js:30,66`, `reviews.js:47`, `schedule.js:46,74`, `loans.js:134`, `providers.js:198,241,339` | Same query, 11 sites, no shared function |

---

## 5. UNSAFE

### 5.1 No transactions

`grep -rn "beginTransaction|COMMIT|ROLLBACK" backend/` → **no matches**. Seven money paths run as independent autocommit statements; see `SECURITY-GAPS.md` P0-11 for the full table.

### 5.2 Mutable balance as financial truth

`users.balance DECIMAL(12,2) DEFAULT 500.00` (`schema.sql:22`) is:
* **Defaulted to 500.00** — every new account is created with ৳500 of spendable balance. `POST /api/auth/register` (`auth.js:59-63`) does not override it. This is free money at signup, with no ledger row and no cost recorded.
* Mutated by seven different code paths (`bookings.js:49,239,271`, `users.js:109,134,298`, `payments.js:81,122,158`, `loans.js:266`).
* Not reconstructable from `wallet_transactions`, because that table (a) is written outside transactions, (b) rejects the `'topup'` type (§3), and (c) has no row at all for the ৳500 default, for `bookings.js:239` provider credits (which do write a row but with no `balance_after`), or for any partially-applied path.

**Impact:** There is no way to answer "is this balance correct?" for any user.

### 5.3 Missing constraints

| Missing | Where | Consequence |
|---|---|---|
| `CHECK (balance >= 0)` | `users.balance` | Negative `platform_fee` (P0-4) or a race can drive it negative |
| Non-negative check on `bookings.amount`, `platform_fee` | `bookings` | Directly enables P0-4 |
| `UNIQUE (user_id)` on `providers` | `providers` | Duplicate provider profiles per user are possible; every lookup uses `LIMIT 1` or takes `[0]` |
| `UNIQUE (booking_id)` on `reviews` | `reviews` | Guarded only by the application's `bookings.rated` flag |
| FK on `bookings.category_id` → `categories` | `bookings` | Present on `providers.category_id`, absent here |
| FK on `sos_alerts.booking_id`, `complaints.booking_id`, `loyalty_log.booking_id`, `microloans.provider_id` | several | Dangling references |
| FK on `blood_donors.user_id`, `disaster_reports.user_id`, `chat_messages.*`, `push_subscriptions.user_id`, `promos.category_id` | runtime tables | Runtime-created tables have **no foreign keys at all** |
| `NOT NULL` on `payments.amount` currency pairing | `payments` | `currency VARCHAR(5) DEFAULT 'BDT'` with no constraint |

### 5.4 Large binary data in the primary database

| Column | Type | Cap enforced | Where |
|---|---|---|---|
| `users.avatar` | `LONGTEXT` | 2,700,000 chars (~2 MB) | `users.js:65`, `auth.js:42` |
| `kyc_docs.front_image` / `back_image` / `selfie_image` / `certificate_image` | `LONGTEXT` × 4 | 7,168,000 chars each (~5 MB) | `kyc.js:53-56` |
| `bookings.completion_proof` | `TEXT` | none | `upload.js:129` |

Default path when R2/S3 is unconfigured is base64-into-DB (`upload.js:46,73,127`). A single KYC submission can add ~20 MB to a row. `GET /api/admin/kyc` selects `k.*` (`admin.js:176`) with `LIMIT 30` — a single admin page load can transfer hundreds of megabytes and is additionally cached in-process for 15 s (`admin.js:187`), holding it in the API process heap.

### 5.5 Indexing

Present and sensible: `users(role, phone, email)`, `providers(category_id, is_available, rating)`, `bookings(customer_id, provider_id, status)`, `reviews(provider_id)`, `kyc_docs(user_id, status)`, `payments(user_id, booking_id, status, gateway_tran_id)`, `microloans(user_id, status)`, `sos_alerts(status, user_id)`.

Missing or unusable:
* No index can serve `providers.js:25-27` (`LIKE '%q%'` across five columns).
* `bookings(created_at)` — required by `/ai/forecast`, `/churn`, `/heatmap`, `/dynamic-price`, and `admin/stats` (`DATE(created_at) = CURDATE()`), all of which currently scan.
* `notifications(user_id, created_at)` — the query orders by `created_at DESC` with only `idx_user`.
* `wallet_transactions(user_id, created_at)` — same.
* `chat_messages` has `idx_booking` only; the query orders by `created_at`.
* No composite `bookings(provider_id, status)` for the completed-earnings subquery in `admin.js:56-57`, which runs per provider row.

### 5.6 Timestamps and audit fields

`created_at`/`updated_at` are present on the main entities. Missing entirely: `created_by`, `updated_by`, `deleted_at`, and any version/etag column. `kyc_docs` and `microloans` carry `reviewed_by`/`reviewed_at`, which is the only actor attribution anywhere in the schema.

---

## 6. Coverage against the brief's §9 checklist

| Entity | Status |
|---|---|
| Users | ✅ `users` |
| Providers | ⚠️ `providers` — no verification state, no capability model, no unique constraint |
| Businesses | ❌ MISSING |
| Categories | ⚠️ `categories` — flat, three conflicting taxonomies |
| Services | ❌ MISSING (free text only) |
| Provider capabilities | ❌ MISSING |
| Availability | ⚠️ `provider_schedule` — free-text, dateless, not consulted by booking |
| Bookings | ✅ `bookings` — no state machine, no idempotency |
| Payments | ⚠️ `payments` — no reconciliation, no refund records |
| Wallet | ⚠️ mutable column + best-effort log; not a ledger |
| Reviews | ✅ `reviews` |
| KYC | ⚠️ `kyc_docs` — base64 blobs in DB, enum mismatch |
| Notifications | ✅ `notifications` |
| Chat | ⚠️ `chat_messages` — runtime-created, no FKs |
| Emergency (SOS) | ✅ `sos_alerts` |
| Blood | ⚠️ `blood_donors` — seeded with fabricated records |
| Disaster | ⚠️ `disaster_reports` — runtime-created, seeded with fabricated alerts |
| Loans | ⚠️ `microloans` — no repayment schedule, no instalments, no ledger |
| Promotions | ⚠️ `promos` — never applied to a price |
| Loyalty | ⚠️ `loyalty_log` — duplicated DDL, one version has no FK |
| AI context | ❌ MISSING |
| AI memory | ❌ MISSING |
| Recommendations | ❌ MISSING |
| Analytics | ❌ MISSING (computed on read) |
| Audit logs | ❌ MISSING |

**14 of 25 required entities are missing or materially incomplete.**

---

## 7. Recommended sequence for Phase 1 (proposal, not executed)

1. **Adopt a migration tool** and freeze all runtime DDL. Everything else is unsafe until schema changes are versioned and reversible.
2. **Fix the three code↔schema conflicts** (§3) — they are silent data loss today.
3. **Introduce an append-only ledger** and derive `balance`; remove the `DEFAULT 500.00`.
4. **Move binary media out of the DB** and make R2/S3 mandatory in production.
5. **Add `audit_logs`** — prerequisite for trust & safety, admin accountability, and any AI action layer.
6. **Design the service graph** (`services`, `service_relations`, `provider_services`, `coverage_areas`, real `availability`) — this is the schema foundation for IMAP 2.0 §2.4/2.6/2.7 and nothing in the current schema anticipates it.
7. **Add idempotency keys** and non-negative money constraints.
8. **Decide the engine.** The brief's default stack is PostgreSQL + Prisma; the code is MySQL/TiDB with raw SQL. This is a Phase 1 decision, and items 1 and 6 are the natural point to make it.
