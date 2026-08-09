# IMAP 2.0 — API Architecture

**Status:** PROPOSED · **Phase:** 2 · **Date:** 2026-08-09
**Decisions:** AD-003, AD-008, AD-010, AD-014

---

## 1. Principles

| # | Principle | Consequence |
|---|---|---|
| **1** | The API contract is a product surface, not a database projection | No entity is exposed as a table row. `booking.otp_hash` never leaves the server |
| **2** | Commands and queries are named for what they do | `POST /bookings/{id}/confirm-completion`, not `PATCH {status:"completed"}` |
| **3** | Money is always `{amount_minor, currency}` (AD-008) | A bare number is never a money value |
| **4** | The client never sends a price | It sends a `quoteId`. This is where P0-3 becomes impossible |
| **5** | Every mutating endpoint declares idempotency behaviour (AD-010) | Undeclared = does not ship |
| **6** | Every endpoint declares an authorization policy | A use case with no policy throws at startup |
| **7** | One error contract everywhere | Four response envelopes exist today |
| **8** | Contract-first | OpenAPI is authored, types and the client are generated (AD-014) |

---

## 2. Shape

**REST with named command endpoints.** Not pure REST, not RPC — resources for reading, named commands for state transitions, because a booking transition is a domain operation with rules, not a field assignment.

```
Base: https://api.imap.com.bd/v1
```

| Convention | Rule |
|---|---|
| Version | Path-based `/v1`. One major version live at a time; the previous is supported for a stated window |
| Resources | Plural nouns: `/bookings`, `/providers`, `/services` |
| Commands | `POST /{resource}/{id}/{verb-phrase}` |
| Ids | UUIDv7 strings; never sequential integers in a URL |
| Casing | `snake_case` in JSON — matches the domain vocabulary and avoids per-field translation |
| Time | RFC 3339 UTC with offset |
| Locale | `Accept-Language`; every user-facing string is returned in the requested locale |

---

## 3. Endpoint map

Derived from `INFORMATION-ARCHITECTURE.md` and `USER-FLOWS.md`. `A` public · `U` authenticated · `P` provider · `O` operations role.

### Discovery — public

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/services` | A | Catalogue tree. Cacheable |
| `GET` | `/services/{slug}` | A | Scope, price range, provider count. SEO surface |
| `GET` | `/services/{slug}/related` | A | From the graph projection |
| `POST` | `/needs` | A | Record a need; returns `need_id` (R-1108). Anonymous permitted |
| `POST` | `/needs/{id}/understand` | A | Text → candidate services. Returns **Suggested**, never Confirmed |
| `GET` | `/providers` | A | Filters: `service_id`, `area_id`, `window`, `price_max`. Filter state is the URL |
| `GET` | `/providers/{id}` | A | Public profile. **No phone number** (P1-1) |
| `GET` | `/providers/{id}/availability` | A | Windows in a range |
| `GET` | `/areas` | A | Location hierarchy |

### Quote and booking

| Method | Path | Auth | Idempotency | Notes |
|---|---|---|---|---|
| `POST` | `/quotes` | A | Key optional | Server-issued price. Body: service, provider, window. **No amount** |
| `GET` | `/quotes/{id}` | A | — | Itemised components |
| `POST` | `/bookings` | U | **Required** | Body: `{quote_id, address, note}`. 201 returns the authoritative totals |
| `GET` | `/bookings` | U | — | The caller's bookings; cursor-paginated |
| `GET` | `/bookings/{id}` | U | — | Participants and admins. `otp_code` returned only to the customer |
| `POST` | `/bookings/{id}/accept` | P | Required | Provider |
| `POST` | `/bookings/{id}/decline` | P | Required | |
| `POST` | `/bookings/{id}/start` | P | Required | |
| `POST` | `/bookings/{id}/arrive` | P | Required | |
| `POST` | `/bookings/{id}/report-done` | P | Required | Sets and returns `auto_confirm_at` |
| `POST` | `/bookings/{id}/confirm-completion` | U | **Required** | **Customer only** (R-505) |
| `POST` | `/bookings/{id}/cancel` | U/P/O | **Required** | Returns the refund consequence |
| `POST` | `/bookings/{id}/reschedule` | U/P | Required | |
| `POST` | `/bookings/{id}/disputes` | U/P | Required | |
| `GET`/`POST` | `/bookings/{id}/messages` | U/P | Post: required | Participants only |

### Payments

| Method | Path | Auth | Idempotency | Notes |
|---|---|---|---|---|
| `POST` | `/payments` | U | **Required** | Body: `{booking_id}`. Amount from the quote, never the request |
| `GET` | `/payments/{id}` | U | — | |
| `POST` | `/payments/{id}/refunds` | U/O | **Required** | |
| `POST` | `/webhooks/payment/ipn` | Gateway | Provider-level | **The only crediting path.** Signature + server-to-server validation + amount reconciliation |
| `POST` | `/webhooks/payment/return` | A | — | **Redirect only.** Cannot settle |

### Identity

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/auth/otp/request` | A | Rate-limited per phone and per IP |
| `POST` | `/auth/otp/verify` | A | Returns a session |
| `POST` | `/auth/password/login` | A | **Fails closed with no stored credential** (P0-1) |
| `POST` | `/auth/oauth/google` | A | Server-verified ID token, audience checked, `email_verified` required |
| `POST` | `/auth/sessions/refresh` | U | Rotating |
| `DELETE` | `/auth/sessions/{id}` | U | |
| `GET` | `/me` | U | Principal, accounts, memberships, active account |
| `POST` | `/me/accounts/{id}/activate` | U | Switch acting account (AD-017) |

**Removed:** `/auth/social-login` — returns `410 Gone`. A client-supplied `socialId` was never proof of identity (P0-2).

### Provider

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/provider/applications` | U | Starts onboarding |
| `PUT` | `/provider/profile` | P | Own profile only |
| `PUT` | `/provider/capabilities` | P | From the catalogue; certification-gated ones need evidence |
| `PUT` | `/provider/coverage` | P | |
| `PUT` | `/provider/prices` | P | Per service |
| `PUT` | `/provider/availability` | P | Dated windows |
| `POST` | `/provider/listing/pause`·`/resume` | P | **Cannot self-approve** (D-005) |
| `GET` | `/provider/jobs` | P | Today first |
| `GET` | `/provider/earnings` | P | Gross, commission, net, payout state (R-904) |
| `POST` | `/provider/payouts` | P | Request a payout |
| `GET` | `/provider/standing` | P | Own standing and what changes it (R-406) |

### Emergency — isolated

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/emergency/capabilities` | A | **What IMAP can and cannot do — data, not copy** (R-1002) |
| `GET` | `/emergency/hotlines` | A | Verified sources only (R-1009) |
| `POST` | `/emergency/requests` | U | Response states real state; **no `dispatched`** |
| `POST` | `/emergency/blood/consent` | U | Opt-in; revocable |
| `DELETE` | `/emergency/blood/consent` | U | Immediate |
| `GET` | `/emergency/blood/donors` | U | **Masked contact** |
| `POST` | `/emergency/blood/donors/{id}/contact` | U | Releases one number; **logged** (D-013) |
| `GET` | `/emergency/sources` | A | Signposting (D-012) |

### AI

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/ai/conversations` | U | |
| `POST` | `/ai/conversations/{id}/messages` | U | SSE stream. **Authenticated** (P1-16) |
| `GET` | `/ai/tasks/{id}` | U | Task state (`STATE-MACHINES.md` §13) |
| `POST` | `/ai/tasks/{id}/confirm` | U | **Required.** Executes a Tier B proposal |
| `POST` | `/ai/tasks/{id}/abandon` | U | |
| `GET` | `/me/context` | U | What IMAP remembers, in plain language (R-804) |
| `DELETE` | `/me/context/{id}` | U | (R-805) |

**No AI endpoint writes domain state.** `/ai/tasks/{id}/confirm` invokes the same use case as the equivalent HTTP command.

### Operations

`/ops/*`, each with a distinct permission (`DOMAIN-ARCHITECTURE.md` §6), each mutation requiring a `reason`, all audited. Identity documents load **per record** through `/ops/verifications/{id}/documents/{docId}` returning a short-lived signed URL, never inline in a list (P1-12).

---

## 4. Error contract

One shape everywhere.

```json
{
  "error": {
    "code": "BOOKING_SLOT_UNAVAILABLE",
    "message": "That time is no longer available.",
    "user_message": {
      "bn": "এই সময়টি আর খালি নেই।",
      "en": "That time is no longer available."
    },
    "retryable": false,
    "correlation_id": "01J8Z...",
    "fields": [
      { "field": "scheduled_start", "code": "UNAVAILABLE", "message": "..." }
    ],
    "details": { "alternatives": ["2026-08-10T09:00:00Z"] }
  }
}
```

| Field | Rule |
|---|---|
| `code` | Stable, machine-readable. Clients switch on this, never on `message` |
| `message` | Developer-facing English |
| `user_message` | Both locales, safe to display, **maps to the nine-state vocabulary** (D-008) |
| `retryable` | Whether the same request may be retried |
| `correlation_id` | Always present; appears in logs, events and support tickets |
| `fields` | Per-field validation errors |
| `details` | Actionable extras — e.g. alternative slots |

**Never returned:** stack traces, SQL, internal ids, secrets, upstream error bodies. Phase 0.5 removed raw `err.message` from AI routes; this makes it a contract.

### 4.1 Status usage

| Status | Meaning | Example |
|---|---|---|
| 400 | Malformed | Bad JSON |
| 401 | Not authenticated | Missing/expired session |
| 403 | Authenticated, not permitted | Non-participant reading a booking |
| 404 | Not found **or** not visible | Deliberately indistinguishable — prevents enumeration |
| 409 | State conflict | Already completed; slot taken; idempotency key reused |
| 410 | Permanently gone | `/auth/social-login` |
| 422 | Semantically invalid | Negative amount; expired quote |
| 429 | Rate limited | `Retry-After` required |
| 503 | Capability unavailable | Payment gateway unconfigured in production (P0-12) |

### 4.2 Money errors

Every rejection from the money validator returns `422` with `code: "INVALID_AMOUNT"` and the offending field. Negative, `NaN`, `Infinity`, `"1e999"`, arrays and objects are all rejected at the boundary.

---

## 5. Idempotency contract (AD-010)

```
Idempotency-Key: 01J8Z4K2...
```

| Case | Response |
|---|---|
| First use | Processed; response stored |
| Replay, same body | **Stored response returned**; no side effects repeated |
| Replay, different body | `409 IDEMPOTENCY_KEY_REUSED` |
| In flight | `409 REQUEST_IN_PROGRESS` |
| Missing where required | `400 IDEMPOTENCY_KEY_REQUIRED` |

Scoped per `(key, endpoint, principal)`. TTL 24 h general, 7 days financial.

---

## 6. Pagination, filtering, sorting

**Cursor-based.** Offset pagination on a growing table produces duplicates and skips.

```
GET /bookings?limit=20&cursor=eyJ...&state=confirmed
→ { "data": [...], "page": { "next_cursor": "eyJ...", "has_more": true } }
```

| Rule | Detail |
|---|---|
| `limit` default 20, max 100 | The audit found unpaginated `GET /providers/me/jobs` and `GET /reviews/provider/:id` |
| Filters are explicit named parameters | Never arbitrary query passthrough |
| Sort from an allow-list | Prevents SQL injection via order clauses |
| Total counts are opt-in (`include_total=true`) | Counting is expensive and usually unused |

---

## 7. Authentication and authorization

| Aspect | Design |
|---|---|
| Transport | Bearer token, `Authorization` header |
| Session | Short-lived access token + rotating refresh; `session` rows revocable (replaces the unused `refresh_tokens` table) |
| Acting account | `X-IMAP-Account` selects among the principal's memberships; defaults to the active account |
| Authorization | Every endpoint maps to one policy in the kernel (`AUTHORIZATION-ARCHITECTURE.md`) |
| Resource ownership | Checked on the resource, never inferred from role |
| Rate limits | Per principal, per IP, and per sensitive endpoint class |

---

## 8. Contract-first workflow

```
OpenAPI spec (authored)
  ├─→ packages/domain-types      (generated)
  ├─→ packages/api-client        (generated)
  ├─→ request/response validators (generated)
  ├─→ AI tool schemas             (derived — TOOL-CATALOG.md)
  └─→ contract tests in CI
```

The spec is the artefact. A handler whose responses do not match it fails CI. This is the structural answer to the audit's finding that `frontend/src/api.js` JSDoc was the only endpoint documentation and the server accepted more field-name variants than the client ever sent.

---

## 9. Versioning and deprecation

| Change | Treatment |
|---|---|
| Add an optional field / new endpoint | Non-breaking; no version change |
| Add an enum value | Non-breaking — **clients must tolerate unknown values** |
| Remove or rename a field, change a type, tighten validation | Breaking → new major version |
| Deprecation | `Deprecation` and `Sunset` headers; announced window; usage measured before removal |

---

## 10. Anti-patterns forbidden

| Anti-pattern | Why |
|---|---|
| Exposing database rows as responses | Couples the contract to storage |
| `PATCH` with a status field | State transitions have rules; they are named commands |
| Client-supplied amounts | P0-3 |
| Multiple response envelopes | Four exist today |
| Raw error messages | Leaks internals |
| Offset pagination on growing tables | Duplicates and skips |
| Unbounded list endpoints | Present today |
| An endpoint with no declared authorization | Fails at startup |
| A mutating endpoint with no declared idempotency | Fails at startup |
| Accepting equivalent field-name variants | The audited `amount`/`total_amount` tolerance |
| Returning PII on public endpoints | P1-1, P1-2 |
| 404-vs-403 leakage | Enables enumeration |
