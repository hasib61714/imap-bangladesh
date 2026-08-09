# IMAP 2.0 — I-03 Identity Migration Map

**Status:** IMPLEMENTATION RECORD · **Phase:** 4 / I-03 · **Date:** 2026-08-09
**Required by:** I-03 §5, §7, §21, §23, §25 · **Governed by:** `AUTH-MIGRATION-PLAN.md`, `ENTITY-IMPLEMENTATION-MAP.md`

---

## 1. Field-by-field mapping (§5)

Every identity-related column in `users`, and where it goes. **No field is given a new meaning silently** — where the legacy semantics are ambiguous, §4 below says so and the migration declines to guess.

| `users` column | Target | Transformation | Notes |
|---|---|---|---|
| `id` | `principal.id` | **reused verbatim** | Lowest-risk mapping. Every existing `bookings.customer_id`, `providers.user_id`, `payments.user_id` keeps resolving through the dual-write window. Legacy ids are UUIDv4, new principals UUIDv7; `isTimeOrderedId()` distinguishes them |
| `is_active` | `principal.status` | `1 → active`, `0 → suspended` | **Never `closed`.** Closure is terminal and nothing in `users` records that the user asked for it |
| `joined_at` | `principal.created_at` | direct | |
| `name` | `account.display_name` | direct | Per account, not per principal — a provider account may later be renamed independently |
| `role` | `membership.role` | see §3 | **This is what retires `users.role`** |
| `password_hash` | `credential` (kind=`password`) | **only if bcrypt-shaped** | §2 |
| `social_id` + `login_method='google'` | `credential` (kind=`oauth`) | direct | Any other `login_method` carrying a `social_id` came from the disabled endpoint and is never verifiable |
| `phone` + `verified` + `login_method='otp'` | `contact_verification` | SHA-256 of normalised digits | §4 |
| `email`, `phone` | stay on `users` at I-03 | — | The login identifier surface does not move until the cutover |
| `avatar` | not migrated | — | Object storage, I-07 |
| `kyc_status` | not migrated | — | `verification_case`, I-07 |
| `balance`, `points` | **not identity** | — | Ledger, I-08. **Untouched by I-03** |
| `referral_code`, `referred_by` | not migrated | — | Referral is outside Gate 1 |
| `settings` | not migrated | — | Preferences, later |
| `nid_number` | not migrated | — | Identity document, I-07 |

**`refresh_tokens`** is replaced by `session`, not migrated: it is read and written by no code path.

---

## 2. Credential mapping — where P0-1 dies

| `users.password_hash` | Result | Consequence for the user |
|---|---|---|
| bcrypt-shaped (`$2a/$2b/$2y$NN$…`, 53 chars) | `credential(kind=password)` | Password login continues to work |
| `NULL` | **no row** | Cannot password-login. Uses OTP or Google — which is what they already do |
| `''` | **no row** | as above |
| Not bcrypt (md5, plaintext, truncated) | **no row**, flagged in the report | Must reset by OTP |

**The rule is absence, not a conditional.** A principal with no credential row cannot authenticate by password because there is nothing to look up. There is no branch left that could be written the wrong way round — which is precisely what P0-1 was.

Migration `002` nulled the compromised administrator's hash and the six demo providers'. Those principals therefore migrate **with no credential at all**: the accounts survive and simply cannot password-authenticate.

**Hashes carry over unchanged.** Re-hashing is impossible without the plaintext, and forcing a global reset punishes every user for a defect in seven accounts. `needsRehash()` marks cost-10 hashes for transparent upgrade to cost 12 on next successful login — the only moment the plaintext exists.

---

## 3. Role mapping (§7, §25, §26)

| `users.role` | Accounts created | Memberships | Notes |
|---|---|---|---|
| `customer` | 1 consumer | `customer` | |
| `provider` | 1 consumer **+ 1 provider** | `customer` + `provider` | The provider account is created **only where a `providers` row exists**. The legacy role alone is not evidence of a profile |
| `admin` | 1 consumer | `customer` **only** | §26 — see below |
| anything else / NULL | 1 consumer | `customer` | Fail closed |

### 3.1 No user is accidentally promoted (§7)

The mapping is deterministic and **downward**. There is no legacy value that produces a platform identity, so a malformed or unexpected `role` cannot yield `admin`, `platform_owner` or `provider`.

### 3.2 Legacy admins are demoted and listed (§26)

Every `role = 'admin'` row migrates as a **customer** membership and is reported for human review.

A role granted before there was an audit log is a role nobody can justify — there is no record of who granted it, when, or why. Platform roles are granted afterwards, deliberately, by a person, and that grant is itself audited.

The administrator created by `npm run admin:reset` after the credential incident is the only principal that should receive them.

### 3.3 A provider is also a customer

Two accounts, two memberships. Today a provider **cannot book a service without changing their own role**, because a single mutable column cannot express both. This is the concrete thing the account/membership model fixes.

**I-03 creates memberships and grants no permissions.** What a role may *do* is I-04.

---

## 4. Ambiguous legacy semantics — declared, not resolved (§5)

Three columns have meanings the data does not record. §5 says stop rather than assign a new meaning; the migration declines to guess and the report says so.

### `users.verified`

A boolean with no record of **what** was verified, **when**, or **how**.

| Case | Handling |
|---|---|
| `verified=1` and `login_method='otp'` | `contact_verification(channel=phone, method=otp_legacy)` — an OTP flow demonstrably ran |
| `verified=1`, any other login method | **no row.** Reported as "verified flag with no evidence" |
| `verified=0` | no row |

Users in the second bucket meet one OTP at their next in-home booking (R-410). The alternative — asserting a verification nobody can evidence — is the same class of error as the fabricated data Phase 0 found.

### `users.login_method`

Records the method of the *most recent or original* sign-in; the data does not say which. It is used only as **corroboration** for `verified` and `social_id`, never as the sole basis for anything.

### `users.is_active`

`0` covers "user deactivated", "admin suspended" and "never activated" — three different states. Mapped to `suspended`, the reversible one. Mapping to `closed` would make an administrative action irreversible on the strength of a boolean.

---

## 5. Duplicate analysis (§22)

Produced by `node scripts/backfill-identity.js` (dry run). It **must be run against a restored production copy and read before any write**, and it refuses to `--apply` while any blocker stands.

| Check | Why it can exist today |
|---|---|
| Normalised email collisions | `users` has UNIQUE on the **raw** column |
| Normalised phone collisions | Same — `01799-999999` and `01799999999` both pass |
| Duplicate Google subjects | No constraint exists today |
| Orphan `providers` rows | No FK from `providers.user_id` in some builds |
| Users with >1 `providers` row | No uniqueness on `providers.user_id` |

Each blocker reports the count, a sample, the options, and **the business consequence** — because every option costs somebody an account or a login route, and that is not an engineering decision.

### 5.1 A correction worth recording

The first attempt to exercise the email blocker asserted that the raw unique index would accept a case-only duplicate. **It does not.** `utf8mb4_unicode_ci` is case-insensitive, so the database rejected the insert and the blocker was never exercised. It was retested with a formatted-phone duplicate, which the raw index genuinely permits, and then fired correctly.

**Whether the email blocker is reachable on production is UNKNOWN**: it depends on the collation, and TiDB's default differs by version (`PHASE-2.75-DATABASE-REHEARSAL.md` §5).

---

## 6. What I-03 deliberately does not switch over (§32)

The tables exist and the mapping is proven. **Nothing is cut over.**

`users` remains authoritative. `users.role` remains the live authorization source. The application still authenticates through `routes/auth.js` against `users`.

The cutover is `AUTH-MIGRATION-PLAN.md` §7 steps 4–9, and it is an owner-coordinated event, not a code change:

| Step | Why it cannot be part of I-03 |
|---|---|
| Dual-write for 7 days | Needs elapsed calendar time and a nightly diff |
| Switch reads | Needs the diff to be clean first |
| **Rotate `JWT_SECRET`** | **Logs every user out simultaneously** — it is step 4 of `CREDENTIAL-INCIDENT.md` §3 and must be communicated beforehand |
| Truncate `refresh_tokens` | Same event |
| Drop superseded `users` columns | One release cycle later |

Building the model early is safe. Switching to it is not, and the two are not the same act.

---

## 7. Session model (§15–§18)

| Property | Today | Target (schema exists; not yet live) |
|---|---|---|
| Revocable | ✗ | ✓ `session.revoked_at` |
| Logout | client deletes a token | server revokes; a revoked session cannot refresh |
| Refresh | exchanges a valid JWT for a fresh 7-day one, **indefinitely** | rotates — a captured token is usable once and its reuse is detectable |
| Token at rest | n/a | **SHA-256 only.** A database read yields nothing usable |
| Access lifetime | 7 days | 15 minutes; the session carries duration |
| Algorithm | any HS\* accepted | **pinned HS256** — live now |
| Device visibility | ✗ | ✓ bounded user-agent and IP |

---

## 8. Open items

### Owner decisions

| # | Item | Blocks |
|---|---|---|
| 1 | Run the dry run against a restored production copy and resolve any blocker | the backfill |
| 2 | Decide the platform-role grants for the post-incident administrator (§26) | operations after cutover |
| 3 | Schedule the cutover, including the global logout | the switch |
| 4 | Confirm the production collation, which decides whether email normalisation can be made unique | §5.1 |

### Findings recorded, not acted on (§48)

| # | Finding | Phase |
|---|---|---|
| F-8 | `routes/payments.js` sends `01700000000` to the payment gateway as a placeholder when a user has no phone. Not a credential and not an auth path, but a fabricated value crossing a real integration boundary | I-14 |
| F-9 | OTP storage and rate limiting are in-process `Map`s. Both are per-instance, so they are ineffective the moment a second instance exists (R-1107) | I-05, Redis |
| F-10 | `/auth/refresh` extends a session indefinitely with no revocation. The schema now supports fixing it; the route is not switched over | cutover |
| F-11 | `users.email` and `users.phone` are unique on the **raw** value, so normalised duplicates are possible | I-06 |

---

## 9. Historical P0s — permanently covered (§3)

| P0 | Structural answer | Test |
|---|---|---|
| **P0-1** null hash → bypass | A credential cannot be constructed without a bcrypt hash; a DB CHECK refuses one; the backfill creates no row | 24 domain tests + 2 integration |
| **P0-2** social login spoofing | Endpoint returns `410`; only server-verified Google; `uniq_provider_subject` stops two principals claiming one subject | contract + integration |
| **P0-9** seeded admin credential | Hash nulled by `002` → no credential row → cannot authenticate. Bootstrap requires ≥12 chars and rejects a known-compromised denylist | login test over 4 known credentials |
| hidden admin login | Removed in Phase 0.5; §12 sweep found no code trace and no credential string in any built asset | repository sweep |
