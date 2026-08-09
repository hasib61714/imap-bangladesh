# IMAP 2.0 — Authentication & Account Model Migration Plan

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Governed by:** AD-017 · `AUTHORIZATION-ARCHITECTURE.md` · `CREDENTIAL-INCIDENT.md`
**Migrations:** M-10 … M-13 in `DATABASE-IMPLEMENTATION-PLAN.md`

---

## 1. What exists now

One `users` table carrying identity, credential, role, wallet balance, loyalty points and an avatar.

| Column | Migrates to |
|---|---|
| `id`, `is_active`, `joined_at` | `principal` |
| `password_hash` | `credential` (**only where non-NULL**) |
| `social_id`, `login_method` | `credential` (oauth) |
| `role` | `membership.role` — **the enum is retired** (AD-017) |
| `phone`, `email`, `verified` | `contact_verification` (**only where actually verified**) |
| `name`, `avatar` | `account.display_name`, object storage |
| `balance`, `points` | ledger / deferred — **not identity** |
| `kyc_status` | `verification_case.state` |
| `referral_code`, `referred_by`, `settings` | deferred |

`refresh_tokens` exists and is **never read or written**. It is replaced by `session`, not migrated.

### 1.1 Legacy paths already closed — and which stay closed

| Path | Closed by | Structural in the target |
|---|---|---|
| Login with a NULL `password_hash` succeeded | Phase 0.5 (P0-1) | **No credential row exists** — absence, not a NULL check |
| `POST /auth/social-login` accepted a client-supplied `socialId` | Phase 0.5 (P0-2) | Endpoint returns `410 Gone`; only server-verified OAuth |
| Seeded `admin123` administrator | Phase 0.5 + migration `002` nulls the hash | No credential row for that principal |
| Six demo providers sharing `demo1234` | `002` nulls the hashes | No credential rows |
| Hidden `admin123` quick-login in the shipped bundle | Phase 0.5 removed it | Not carried into any feature module |
| Fabricated Facebook login | Phase 0.5 removed it | Only providers with a real configured client id appear |
| Dev "Demo OTP" shown on screen | Phase 0.5 | `env.allowsDevelopmentBehaviour()` — considers the database too (V-01) |

**No unsafe authentication behaviour is migrated forward.** Each one is closed by a structural property in the target, not by a conditional that could be reverted.

---

## 2. Target model (AD-017)

```
principal ──< membership >── account
    │                          │
    ├──< credential            └──< provider (when kind=provider)
    ├──< session
    ├──< contact_verification
    └──< verification_case ──< identity_document
```

A **principal** is a human. An **account** is a thing they act for. A **membership** grants a role in an account. One person with a consumer account and a provider account has one principal, two accounts, two memberships — which the current `users.role` enum cannot express at all.

`account.kind = organisation` is defined and unused at Gate 1: the business workspace is a membership grant later, not a data migration.

---

## 3. Credential migration — where the rule becomes structural

| Source | Result |
|---|---|
| `password_hash` non-NULL, bcrypt-shaped | `credential {kind: password, secret_hash}` |
| `password_hash` **NULL** | **no row** |
| `password_hash` present but not bcrypt-shaped | **no row** + flagged for review |
| `social_id` + `login_method='google'` | `credential {kind: oauth, provider: google, provider_subject}` |
| `social_id` with any other provider | **no row** — never verifiable |
| Both present | two rows |

Migration `002` deliberately nulled the compromised administrator hash and the six demo provider hashes. Those principals therefore migrate with **no credential row at all**: the accounts survive, they simply cannot password-authenticate. The Phase 0.5 fail-closed behaviour becomes a property of the schema rather than a check that must be remembered.

**Bcrypt hashes carry over unchanged.** Re-hashing is impossible without the plaintext, and forcing a global reset punishes every user for a defect in six accounts. The `$2a$10$` cost factor is raised on next successful login, transparently.

---

## 4. Sessions — everyone is logged out, deliberately

`refresh_tokens` is never read; there is nothing to migrate. The access tokens in circulation are JWTs signed with the current `JWT_SECRET`.

**At cutover, `JWT_SECRET` is rotated and every live token becomes invalid.** This is not a side effect — it is step 4 of `CREDENTIAL-INCIDENT.md` §3, and it invalidates any token minted by someone who reached the administrator account during the exposure window.

| Property | Old | New |
|---|---|---|
| Revocable | ✗ | ✓ — `session.revoked_at` |
| Rotating refresh | ✗ | ✓ |
| Device visible to the user | ✗ | ✓ |
| Role in the token | ✓ (**never trusted**) | not present — read from the database |
| Lifetime | 7 d access | 15 min access + 30 d rotating refresh |

Roles are read from the database on every request today, which is correct, and the target keeps it: a revoked membership takes effect immediately rather than on token expiry.

**Communicated before the release, not discovered after.** A silent global logout on a marketplace is indistinguishable from an outage.

---

## 5. Contact verification — no flag becomes a fact

`users.verified` is a boolean with no record of what was verified, when, or how. Migrating it into `contact_verification` as a verified phone would be **manufacturing evidence**.

| Source | Result |
|---|---|
| `verified = 1` **and** `login_method = 'otp'` | `contact_verification {channel: phone, verified_at: joined_at, method: otp_legacy}` |
| `verified = 1`, other login method | **no row** — re-verify on next booking |
| `verified = 0` | no row |
| `email` present, OAuth-derived with `email_verified` | `contact_verification {channel: email, method: oauth}` |

R-410 requires phone verification before booking an in-home service. Users in the second bucket meet a one-time OTP at their next booking — a small friction, and the alternative is asserting a verification nobody can evidence.

---

## 6. Account and membership derivation

| Source | Accounts | Memberships |
|---|---|---|
| `users.role = 'customer'` | 1 consumer | 1 × `customer` |
| `users.role = 'provider'` | 1 consumer **+ 1 provider** | `customer` + `provider` |
| `users.role = 'admin'` | 1 consumer | `customer` + `admin` |
| A `providers` row with no matching user | **none — flagged** | orphan; reviewed, never guessed |

Providers get both accounts because a provider is also a customer, which today's single-role enum cannot express — a provider literally cannot book a service without changing their own role.

**No business accounts exist.** `account.kind = organisation` is defined and unused; the business workspace is `ROADMAP.md` Phase H.

### 6.1 Role reconciliation

Legacy `admin` is granted **all six platform roles** at Gate 1 (`AUTHORIZATION-IMPLEMENTATION-PLAN.md` §6). Policies are written against the six from the first commit, so splitting them later is a membership change, not a code change.

The administrator created by `npm run admin:reset` after the incident is the **only** principal that receives them. Any other legacy `admin` row is migrated to `customer` and listed for human review — a role granted before there was an audit log is a role nobody can justify.

---

## 7. Sequence

| Step | Action | Verification | Rollback |
|---|---|---|---|
| 1 | **M-10** — create the six tables | empty, constraints present | drop |
| 2 | **M-11** — backfill | counts match; **no credential row for any NULL hash**; every role maps to exactly one membership; orphan providers listed | truncate |
| 3 | Reconcile orphans and non-bcrypt hashes **by hand** | list empty or explicitly accepted | — |
| 4 | **M-12** — dual-write for 7 days | nightly diff empty | stop dual-write |
| 5 | Ship the new auth endpoints behind `/api/v1`, old ones live | both work | unmount |
| 6 | Frontend switches to `/v1` | login, register, OTP, OAuth pass | revert |
| 7 | **M-13** — switch reads; `users` read-only | full auth suite; smoke test | switch back |
| 8 | **Rotate `JWT_SECRET`; truncate `refresh_tokens`** | everyone re-authenticates | — (intended) |
| 9 | 30 days later — drop superseded `users` columns (M-34) | no reads | snapshot only |

Steps 4–7 are the safety margin: for a week the old and new models are both written and compared before anything reads the new one.

---

## 8. Tests

| # | Test | Layer | Failure consequence |
|---|---|---|---|
| 1 | A principal with **no credential row** never authenticates | unit | P0-1 returns — anyone logs in as anyone |
| 2 | Wrong password and unknown user are **timing-indistinguishable** | unit | User enumeration |
| 3 | `POST /auth/social-login` returns `410` | contract | P0-2 returns |
| 4 | Google login requires a server-verified token with a checked audience and `email_verified` | integration | Forged identity |
| 5 | Role cannot be set via registration, profile update, or any mass-assignment path | security | Privilege escalation |
| 6 | Role is read from the database, not from the token | integration | A revoked admin stays admin |
| 7 | Revoked session is rejected immediately | integration | Revocation is cosmetic |
| 8 | Refresh rotation invalidates the used token | integration | Replayable refresh |
| 9 | Booking an in-home service requires phone verification | integration | R-410 |
| 10 | A provider principal has two accounts and can book as a customer | integration | The provider-cannot-book defect persists |
| 11 | OTP is never returned in a response outside development-like environments | security | V-01 class |
| 12 | Rate limits engage per phone **and** per IP | integration | OTP flooding |
| 13 | Migration produces no credential row for a NULL hash | migration | The compromised admin can log in again |
| 14 | Every authentication attempt, success or failure, writes an audit record | integration | `CREDENTIAL-INCIDENT.md` §2 stays unanswerable |

Test 13 is the migration's most important assertion, and test 14 is the reason this module is built early: without it, the next incident is as unanswerable as the last one.

---

## 9. Frontend

| Current | Target |
|---|---|
| `AuthPage.jsx` (466 L) | `features/auth/` — sound since Phase 0.5, refactored not rewritten |
| Token in `localStorage` | Access token in memory; refresh in an httpOnly cookie |
| `getToken`/`setToken`/`clearToken` in `api.js` | `shared/state/session.jsx` |
| Role from the decoded token | `/me` — principal, accounts, memberships, active account |
| No account switching | Account switcher when a principal has more than one |

Moving the refresh token out of `localStorage` removes an XSS token-theft path. The access token stays in memory and dies with the tab, which is the point.

---

## 10. Risks

| Risk | Probability | Impact | Mitigation | Detection |
|---|:--:|:--:|---|---|
| Migration loses a principal | Low | **Critical** | Count assertions; dual-write week; verified snapshot | Nightly diff |
| A user cannot log in after cutover | Med | High | Credential rules tested against production-shaped data in rehearsal | Login success rate |
| Global logout reads as an outage | **High** | Med | **Communicate before the release** | Support volume |
| Orphan provider rows | Med | Med | Flagged, reviewed by hand, never guessed | Migration report |
| Legacy admin roles that nobody can justify | Med | High | All demoted to `customer` except the post-incident admin | Review list |
| Non-bcrypt hashes | Low | Med | No credential row; user resets by OTP | Migration report |
| Re-verification friction (§5) | Med | Low | One OTP at next booking | Booking abandonment |
