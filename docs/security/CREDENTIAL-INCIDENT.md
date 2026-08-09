# IMAP 2.0 — Credential Exposure Record

**Status:** OPEN — awaiting owner action · **Phase:** 2.75 · **Date:** 2026-08-09
**Related:** `docs/audit/SECURITY-GAPS.md` (P0-9), `docs/audit/PHASE-0.5-SECURITY-REGRESSION.md`, `docs/security/SECRETS-MANAGEMENT.md`

This record states what is known, what is not known, and what must be done. Where evidence does not exist it says so; nothing here is inferred from the absence of evidence.

---

## 1. Exposures

### E-1 — Seeded administrator credential `admin123`

| | |
|---|---|
| **What** | `schema.sql` seeded a user `admin-001` with a bcrypt hash of `admin123`. Both the plaintext and the hash were committed. |
| **Found** | Phase 0 (P0-9) |
| **Exposure window** | From the commit that introduced the seed until migration `002` is applied to production. **Migration `002` has not been applied to production.** |
| **Reach** | Anyone with repository access, plus anyone who guessed a common default |
| **Current status** | Code fixed; **production state unknown** |

### E-2 — Hidden admin quick-login in the shipped frontend

| | |
|---|---|
| **What** | `AuthPage.jsx` contained a panel revealed by tapping the logo three times which called `authApi.login("01700000000", "admin123")`. |
| **Found** | Phase 0.5, during the credential sweep — **Phase 0 missed it** |
| **Reach** | **Public.** It was compiled into the production JavaScript bundle served from GitHub Pages. Anyone who opened the bundle, or tapped the logo three times, had it. |
| **Current status** | Removed in Phase 0.5. Still present in any cached or archived copy of the old bundle. |

E-2 is materially worse than E-1. E-1 required repository access; E-2 required curiosity.

### E-3 — Demo provider accounts sharing `demo1234`

| | |
|---|---|
| **What** | `seedDemo.js` created six provider accounts with one shared password, and `GET /api/admin/seed-demo` invoked it over HTTP without authentication whenever the database had fewer than four providers. |
| **Found** | Phase 0 (P0-9) |
| **Current status** | Endpoint removed; the password is no longer a literal; migration `002` nulls the six hashes. **Not applied to production.** |

### E-4 — Production credential set on a developer workstation

| | |
|---|---|
| **What** | `backend/.env` holds production values for the database, JWT signing, SMS, payment gateway, object storage and AI providers. |
| **Found** | Phase 2.5 (V-01) |
| **Reach** | Anyone with access to that workstation, its backups, or its sync targets |
| **Current status** | Not remediated. The application now refuses to start in that configuration, which prevents *accidental use* — it does not un-expose the credentials. |

---

## 2. Has any of this been exploited?

# UNKNOWN

Not "no". **Unknown**, and it will remain unknown, because the evidence needed to answer it was never collected.

| Evidence needed | Available? |
|---|---|
| Authentication attempt log | **No** — no `auth_attempt` table exists; failures were not recorded |
| Successful-login audit trail | **No** — `docs/security/AUDIT-LOG-ARCHITECTURE.md` specifies one; it is not implemented |
| Admin action audit trail | **No** |
| Session issuance history | **Partial** — `refresh_tokens` holds live tokens, with no issuance history |
| Application logs from the exposure window | **No** — Render's free-tier retention is short and the window is long |
| Database access logs | **Unknown** — TiDB Serverless audit logging has not been checked |
| Frontend bundle access logs | **No** — GitHub Pages provides none |

**Do not write "no evidence of compromise" anywhere.** With no authentication log, that sentence describes the logging, not the security. The honest statement is: *no monitoring existed that would have detected use of these credentials.*

### 2.1 What can still be checked

Read-only, by the owner, against production:

```sql
-- E-1: does the compromised hash still authenticate?
SELECT id, phone, email, role,
       (password_hash IS NULL)                    AS neutralised,
       (password_hash = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
                                                  AS still_the_published_hash
  FROM users WHERE role = 'admin';

-- E-3: do the seeded demo accounts exist in production?
SELECT id, phone, role, joined_at, (password_hash IS NULL) AS neutralised
  FROM users
 WHERE phone IN ('01700000001','01700000002','01700000003',
                 '01700000004','01700000005','01700000006');

-- Accounts that gained privilege, or acted, in the exposure window
SELECT id, name, phone, role, joined_at FROM users WHERE role = 'admin' ORDER BY joined_at;
SELECT COUNT(*) AS live_sessions FROM refresh_tokens;

-- Financial anomalies reachable with an admin session
SELECT type, COUNT(*) n, SUM(amount) total
  FROM wallet_transactions WHERE ref_id IS NULL GROUP BY type;
```

Also check, outside the database:
* the TiDB Cloud console for enabled audit logging and any available connection history;
* the SSLCommerz merchant dashboard for transactions with no matching `payments` row;
* the SMS provider dashboard for unexplained volume.

---

## 3. Required actions

Ordered. Nothing here has been performed — Phase 2.75 does not touch production.

| # | Action | Why | Owner |
|---|---|---|---|
| 1 | Apply migration `002` to production | It is what nulls the compromised hashes. Rehearsed successfully in Phase 2.75; see `PHASE-2.75-DATABASE-REHEARSAL.md` | owner |
| 2 | Run `npm run admin:reset` with a fresh generated password | Re-establish administrator access on a credential that was never published | owner |
| 3 | `DELETE FROM refresh_tokens` | Invalidate every live session, including any obtained with a published credential | owner |
| 4 | Rotate `JWT_SECRET` | Invalidate every access token, including any minted by someone who reached the admin account | owner |
| 5 | Rotate `DB_PASSWORD` | E-4 — the credential has lived on a workstation | owner |
| 6 | Rotate SSLCommerz, SMS, R2/AWS and AI keys | E-4 — same exposure | owner |
| 7 | Run the queries in §2.1 and record the answers **in this file** | Convert UNKNOWN into a finding, in either direction | owner |
| 8 | Repoint `backend/.env` at a development database | Stop the exposure recurring | owner |

Steps 3 and 4 log every user out. That is the intended effect.

---

## 4. Why it stayed invisible

| Control | Status |
|---|---|
| Authentication attempts recorded | **absent** — specified in `AUDIT-LOG-ARCHITECTURE.md`, not built |
| Privileged actions recorded | **absent** — same |
| Alert on administrator login | **absent** |
| Alert on privilege change | **absent** |
| Secret scanning in CI | **absent** |
| Log retention covering an incident window | **absent** |

Every one of these is specified in the Phase 2 architecture. None is implemented. This is the strongest single argument for the Phase 3 ordering in `GATE-1-ARCHITECTURE.md`: the audit log is foundational infrastructure, not a compliance feature to add later. Its absence is the reason section 2 of this document has to say UNKNOWN.

---

## 5. Recurrence prevention

| Vector | Control | Status |
|---|---|---|
| Credential committed in source | `.gitignore` covers all `.env` variants, keys, certificates | **done** (2.75) |
| Credential in a shipped bundle | quick-login removed | **done** (0.5) |
| Seeded credential in the schema | seed removed; `002` nulls existing hashes | **done in code**, pending in production |
| Weak bootstrap password | `resetAdmin.js` rejects a denylist and requires ≥12 characters | **done** (0.5) |
| Demo seeder reaching production | `forbidInProduction()` — considers the database, no override | **done** (2.75) |
| Production credentials in development | `assertEnvironmentIsCoherent()` refuses to start | **done** (2.75) |
| Undetected use of a credential | authentication and admin audit log | **Phase 3** |
| Secret reaching a commit | pre-commit and CI secret scanning | **Phase 3** |

---

## 6. Status

**OPEN.** It closes when steps 1–8 in §3 are complete and §2 has been answered with evidence rather than absence.
