# IMAP 2.0 — API Contract Blueprint (Gate 1)

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Governed by:** `API-ARCHITECTURE.md` (incl. Phase 2.75 amendment C1–C3) · AD-003, AD-008, AD-010, AD-014

**Base:** `/api/v1` · **Contract artefact:** `backend/openapi/imap.v1.yaml` — authored, not generated from code.
Types, validators, the frontend client and contract tests are generated **from** it. A handler whose response does not match fails CI.

---

## 1. Rules

| # | Rule | Consequence |
|---|---|---|
| 1 | No entity is exposed as a table row | `booking.otp_hash`, `credential.secret_hash` never leave the server |
| 2 | State transitions are **named commands** | `POST /bookings/{id}/confirm-completion`, never `PATCH {state}` |
| 3 | Money is `{amount_minor, currency}` | A bare number is never a money value |
| 4 | **The client never sends a price** — it sends a `quote_id` | Where P0-3 becomes impossible |
| 5 | Every mutating endpoint declares idempotency | Undeclared does not ship |
| 6 | Every endpoint declares an authorization action | A use case with no policy throws at startup |
| 7 | One error envelope everywhere | Four exist today |
| 8 | Cursor pagination, `limit` default 20, max 100 | The audit found unpaginated list endpoints |
| 9 | `snake_case` JSON, RFC 3339 UTC, UUIDv7 ids | |
| 10 | An async command returns `202` with a job handle, never a success claim | Amendment C1 |

---

## 2. Gate-1 endpoint map

`A` public · `U` authenticated · `P` provider · `O` ops · **Idem** = `Idempotency-Key` required.

### Discovery — public, SEO-critical

| Method | Path | Auth | Action | Idem | Notes |
|---|---|---|:--:|:--:|---|
| GET | `/services` | A | `discovery.search` | — | Catalogue tree, cacheable |
| GET | `/services/{slug}` | A | `discovery.search` | — | Scope, price range, provider count |
| GET | `/services/{slug}/related` | A | `discovery.search` | — | From the in-memory graph (AD-021) |
| GET | `/areas` | A | `discovery.search` | — | Bangladesh hierarchy |
| POST | `/needs` | A | `need.record` | — | Returns `need_id` (R-1108). **Anonymous permitted** |
| GET | `/providers` | A | `discovery.search` | — | Filters: `service_id`, `area_id`, `window`, `price_max`. **Filter state is the URL** |
| GET | `/providers/{id}` | A | `provider.observe` | — | Public profile. **No phone number** (P1-1) |
| GET | `/providers/{id}/availability` | A | `discovery.search` | — | Dated windows |

`GET /providers` returns the ranking basis with each result (R-302) rather than storing it — the reason `ranking_explanation` is deferred.

### Quote and booking

| Method | Path | Auth | Action | Idem | Notes |
|---|---|---|:--:|:--:|---|
| POST | `/quotes` | A | `quote.issue` | opt | Body: `{service_id, provider_id, window}`. **No amount** |
| GET | `/quotes/{id}` | A | `quote.observe` | — | Itemised components |
| POST | `/bookings` | U | `booking.request` | **✔** | Body: `{quote_id, address, note}`. 201 returns authoritative totals |
| GET | `/bookings` | U | `booking.observe` | — | Caller's bookings, cursor-paginated |
| GET | `/bookings/{id}` | U | `booking.observe` | — | Participants and ops. **`otp` to the customer only** |
| POST | `/bookings/{id}/accept` | P | `booking.accept` | ✔ | |
| POST | `/bookings/{id}/decline` | P | `booking.accept` | ✔ | |
| POST | `/bookings/{id}/start` | P | `booking.start` | ✔ | |
| POST | `/bookings/{id}/arrive` | P | `booking.arrive` | ✔ | |
| POST | `/bookings/{id}/report-done` | P | `booking.report_done` | ✔ | **Returns `auto_confirm_at`** |
| POST | `/bookings/{id}/confirm-completion` | U | `booking.confirm_completion` | **✔** | **Customer only** (R-505) |
| POST | `/bookings/{id}/cancel` | U/P/O | `booking.cancel` | **✔** | Returns the refund consequence |
| POST | `/bookings/{id}/disputes` | U/P | `dispute.raise` | ✔ | |
| GET/POST | `/bookings/{id}/messages` | U/P | `booking.observe` / `message.send` | POST ✔ | Participants only |
| POST | `/bookings/{id}/review` | U | `review.submit` | ✔ | Completed and unrated |

### Payments

| Method | Path | Auth | Action | Idem | Notes |
|---|---|---|:--:|:--:|---|
| POST | `/payments` | U | `payment.initiate` | **✔** | Body: `{booking_id}`. **Amount from the quote** |
| GET | `/payments/{id}` | U | `payment.observe` | — | |
| POST | `/payments/{id}/refunds` | O | `refund.approve` | **✔** | Reason required |
| POST | `/webhooks/payment/ipn` | gateway | `payment.callback` | provider-level | **The only crediting path.** Signature + server-to-server validation + amount reconciliation |
| GET | `/webhooks/payment/return` | A | — | — | **Redirect only. Cannot settle** |

### Identity

| Method | Path | Auth | Action | Notes |
|---|---|---|:--:|---|
| POST | `/auth/otp/request` | A | `session.authenticate` | Rate-limited per phone **and** per IP |
| POST | `/auth/otp/verify` | A | `session.authenticate` | Returns a session |
| POST | `/auth/password/login` | A | `session.authenticate` | **Fails closed with no credential row** (P0-1) |
| POST | `/auth/oauth/google` | A | `session.authenticate` | Server-verified id token, audience checked, `email_verified` required |
| POST | `/auth/sessions/refresh` | U | `session.refresh` | Rotating |
| DELETE | `/auth/sessions/{id}` | U | `session.revoke` | |
| GET | `/me` | U | `identity.observe` | Principal, accounts, memberships, active account |
| POST | `/me/accounts/{id}/activate` | U | `identity.activate` | Switch acting account (AD-017) |
| POST | `/me/verifications` | U | `verification.submit` | KYC |
| GET | `/me/verifications` | U | `verification.observe` | Status only — **never document contents** |

**`POST /auth/social-login` returns `410 Gone`.** A client-supplied `socialId` was never proof of identity (P0-2).

### Provider

| Method | Path | Auth | Action | Notes |
|---|---|---|:--:|---|
| POST | `/provider/applications` | U | `provider.apply` | |
| PUT | `/provider/profile` | P | `provider.update` | Own profile only |
| PUT | `/provider/capabilities` | P | `provider.declare_capability` | Certification-gated ones need evidence and **cannot be self-verified** |
| PUT | `/provider/coverage` | P | `provider.set_coverage` | |
| PUT | `/provider/prices` | P | `provider.set_price` | Per service |
| PUT | `/provider/availability` | P | `availability.publish` | Dated windows |
| POST | `/provider/listing/pause` · `/resume` | P | `provider.pause` | **Cannot self-approve** (D-005) |
| GET | `/provider/jobs` | P | `booking.observe` | Today first |
| GET | `/provider/earnings` | P | `ledger.read` | **Gross, commission, net, payout state** (R-904) |
| POST | `/provider/payouts` | P | `payout.request` | Identity verified |

### Emergency — isolated

| Method | Path | Auth | Action | Notes |
|---|---|---|:--:|---|
| GET | `/emergency/capabilities` | A | — | **What IMAP can and cannot do — data, not copy** (R-1002) |
| GET | `/emergency/hotlines` | A | — | **Verified sources only** (R-1009) |
| POST | `/emergency/requests` | U | `emergency.raise` | Response states real state; **`admins_reachable` is a number**; no `dispatched` |
| POST/DELETE | `/emergency/blood/consent` | U | `donor.consent` | Opt-in; revocation immediate |
| GET | `/emergency/blood/donors` | U | `donor.list` | **Masked contact** |
| POST | `/emergency/blood/donors/{id}/contact` | U | `donor.release_contact` | Releases one number; **logged** (D-013) |
| GET | `/emergency/sources` | A | — | Signposting (D-012) |

### Operations

`/ops/*` — each with a distinct action, each mutation requiring a `reason`, all audited.

| Method | Path | Action | Notes |
|---|---|---|---|
| GET | `/ops/providers/pending` | `provider.approve` | Queue |
| POST | `/ops/providers/{id}/approve` · `/reject` · `/suspend` | `provider.*` | **Reason required** |
| GET | `/ops/verifications` | `verification.decide` | Queue |
| POST | `/ops/verifications/{id}/decide` | `verification.decide` | Reason required |
| GET | `/ops/verifications/{id}/documents/{docId}` | `verification.read_document` | **Per record**, short-lived signed URL, **never inline in a list** (P1-12). **Audited** |
| GET | `/ops/disputes` · POST `/ops/disputes/{id}/resolve` | `dispute.resolve` | Reason required |
| GET | `/ops/emergency` · POST `/ops/emergency/{id}/acknowledge` | `emergency.respond` | |
| GET | `/ops/audit` | `audit.read` | Scoped by class; **the read is itself audited** |
| GET | `/ops/search` | varies | Find a user, provider, booking or payment |

### Platform

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | A | Exists; kept |
| GET | `/jobs/{id}` | U | `{status, effect, attempts, last_error?}` — amendment C3 |
| GET | `/features` | A | Capability availability for the nine-state vocabulary |

**Gate-1 total: ~62 endpoints**, down from 109 today — because 25 are deferred (AI, promos, loyalty, referral) and 16 are removed (loans, wallet top-up, seed).

---

## 3. Error contract

One shape, everywhere.

```json
{ "error": {
    "code": "BOOKING_SLOT_UNAVAILABLE",
    "message": "That time is no longer available.",
    "user_message": { "bn": "এই সময়টি আর খালি নেই।", "en": "That time is no longer available." },
    "retryable": false,
    "correlation_id": "01J8Z...",
    "fields": [{ "field": "scheduled_start", "code": "UNAVAILABLE" }],
    "details": { "alternatives": ["2026-08-10T09:00:00Z"] } } }
```

`code` is stable and machine-readable — clients switch on it, never on `message`. `user_message` carries both locales and **maps to the nine-state vocabulary**. `details` carries actionable extras: alternative slots, the refund consequence, what was and was not done.

**Never returned:** stack traces, SQL, internal ids, secrets, upstream error bodies.

| Status | Use |
|---|---|
| 400 | Malformed |
| 401 | Not authenticated |
| 403 | Authenticated, not permitted |
| 404 | Not found **or not visible** — deliberately indistinguishable |
| 409 | State conflict; slot taken; idempotency key reused |
| 410 | Permanently gone (`/auth/social-login`) |
| 422 | Semantically invalid — negative amount, expired quote |
| 429 | Rate limited; `Retry-After` required |
| 503 | Capability unavailable — **gateway unconfigured in production** (P0-12) |

---

## 4. Idempotency

| Case | Response |
|---|---|
| First use | Processed; response stored |
| Replay, same body | **Stored response returned**; no side effect repeated |
| Replay, different body | `409 IDEMPOTENCY_KEY_REUSED` |
| In flight | `409 REQUEST_IN_PROGRESS` |
| Missing where required | `400 IDEMPOTENCY_KEY_REQUIRED` |

Scoped per `(key, endpoint, principal)`. TTL 24 h general, **7 days financial**.

**API key ≠ job key ≠ effect token** (amendment C2). A replayed request returns the original response *including the original `job_id`* and does not enqueue a second job. The job key derives from the **domain reference** (`booking:<id>`), never from the HTTP key — so the guarantee survives a client that forgets to send one.

---

## 5. Async commands

```
202 Accepted
{ "status": "accepted", "job_id": "01J8...", "effect": "Requested" }
```

`effect` may be `Requested` or `Pending`. **It may not be `Confirmed` or `Completed` until the server has observed the effect.** The emergency-surface rule, applied to every asynchronous command.

Gate-1 async commands: OTP send, notification dispatch, payout execution, refund execution, cold-storage export.

---

## 6. Versioning

| Change | Treatment |
|---|---|
| New optional field, new endpoint | Non-breaking |
| New enum value | Non-breaking — **clients must tolerate unknown values** |
| Remove/rename a field, change a type, tighten validation | **Breaking → new major version** |
| Deprecation | `Deprecation` + `Sunset` headers; usage measured before removal |

**Path-based `/v1`. One major version live at a time.** No content negotiation, no header versioning — with one client and one team, the complexity has no payer.

### 6.1 Migration from the current unversioned API

Today's routes are mounted at `/api/*` with no version.

| Step | Action |
|---|---|
| 1 | Mount `/api/v1/*` alongside `/api/*`; both hit the same handlers |
| 2 | Frontend switches to `/api/v1` in one commit |
| 3 | `/api/*` responds with a `Deprecation` header, still functional |
| 4 | Measure usage for 30 days |
| 5 | `/api/*` returns `410 Gone` |

Steps 3–5 exist because the PWA service worker may serve a cached bundle pointing at old paths for days after deploy. Removing `/api/*` at step 2 breaks users who have not reloaded — which is a real population on a network-first service worker.

**Removed endpoints do not 404. They return `410 Gone`** with a `code` explaining why — `/auth/social-login`, wallet top-up, loans. A 404 tells a client to retry; a 410 tells it to stop.

---

## 7. Contract-first workflow

```
openapi/imap.v1.yaml   (authored)
  ├→ backend/src/**/validators/    generated request validators
  ├→ backend/types/                generated .d.ts (AD-014 shared-types half, at Gate 1)
  ├→ frontend/src/shared/api/      generated client — replaces api.js by hand
  ├→ frontend/src/shared/types/    generated
  └→ test/contract/                generated response-shape assertions
```

This is the structural answer to the audit finding that `frontend/src/api.js` JSDoc was the only endpoint documentation, and the server accepted more field-name variants than the client ever sent.

**CI gates:** the spec is valid; every route has a spec entry and every entry a route; every response matches its schema; every mutating endpoint declares idempotency; every endpoint declares an authorization action. **Any of these failing fails the build.**

---

## 8. Forbidden

| Anti-pattern | Why |
|---|---|
| Database rows as responses | Couples the contract to storage |
| `PATCH` with a status field | Transitions have rules; they are named commands |
| Client-supplied amounts | P0-3 |
| Multiple response envelopes | Four exist today |
| Raw error messages | Leaks internals |
| Offset pagination on growing tables | Duplicates and skips |
| Unbounded list endpoints | Present today |
| An endpoint with no declared authorization | Fails at startup |
| A mutating endpoint with no declared idempotency | Fails at startup |
| Accepting equivalent field-name variants | The audited `amount`/`total_amount` tolerance |
| PII on public endpoints | P1-1, P1-2 |
| 404-vs-403 leakage | Enables enumeration |
| An endpoint for a future feature | Gate-1 scope is frozen |
