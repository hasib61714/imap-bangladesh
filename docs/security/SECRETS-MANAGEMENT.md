# IMAP 2.0 — Secrets Management

**Status:** SPECIFICATION · **Phase:** 2.75 · **Date:** 2026-08-09
**Closes:** U-06 · **Related:** `docs/engineering/ENVIRONMENT-ARCHITECTURE.md`, `docs/security/CREDENTIAL-INCIDENT.md`

No secret value appears in this document.

---

## 1. Where secrets live today

| Location | Contents | Tracked in git | Assessment |
|---|---|---|---|
| `backend/.env` | 30 keys — DB, JWT, SMS, payment, R2, VAPID, AI | **no** (gitignored) | **the problem** — a full production credential set on a developer workstation |
| `render.yaml` | non-secret config; secrets declared `sync: false` | yes | correct — placeholders only |
| Render dashboard | the actual production secret values | n/a | correct location |
| `.github/workflows/deploy.yml` | `secrets.GITHUB_TOKEN` only | yes | correct — GitHub-provided, scoped, rotating |
| `backend/.env.example` | key names and placeholders | yes | correct |
| `frontend/.env.production` | `VITE_API_URL` only | yes | correct — public by construction |

**A repository-wide scan of every tracked file found no live credential.** The `admin123` / `demo1234` strings that appear in tracked files are remediation commentary, a weak-password denylist in `scripts/resetAdmin.js`, and the migration that nulls the compromised hash. Verified 2026-08-09 across all tracked files.

### 1.1 The finding

`backend/.env` holds **production** values for the database, JWT signing, SMS, the payment gateway, object storage and AI providers, on a workstation, alongside a `NODE_ENV=development` declaration. That is not a gitignore failure — the file is correctly ignored. It is a *separation* failure: production credentials should not exist in a development environment at all.

Blast radius if that workstation is compromised: full read/write on the production database; ability to mint valid session tokens for any account (JWT secret); ability to send SMS as IMAP; ability to read and write the object store containing identity documents.

---

## 2. Classification

| Class | Examples | Rotation | Where it may exist |
|---|---|---|---|
| **A — catastrophic** | `DB_PASSWORD`, `JWT_SECRET`, `R2_SECRET_ACCESS_KEY`, `AWS_SECRET_ACCESS_KEY` | 90 days, and on any suspicion | production secret store only |
| **B — costly** | `SSLCOMMERZ_STORE_PASSWORD`, `TWILIO_AUTH_TOKEN`, `BD_SMS_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` | 180 days | production secret store; sandbox equivalents may exist in dev |
| **C — identifying** | `SSLCOMMERZ_STORE_ID`, `R2_ACCOUNT_ID`, `GOOGLE_CLIENT_ID`, `VAPID_PUBLIC_KEY` | on demand | anywhere |
| **D — public** | `VITE_API_URL`, `FRONTEND_URL`, `BACKEND_URL` | n/a | committed |

`JWT_SECRET` is class A and deserves a note: it is not a password, it is the ability to *become* any user. Rotating it invalidates every session, which is the intended behaviour during an incident.

---

## 3. Rules

1. **No secret in git.** Enforced by `.gitignore` (§5) and by review.
2. **No class-A production secret on a developer machine.** Development uses its own database, its own JWT secret, sandbox gateway credentials and a development bucket.
3. **`.env.example` carries key names and placeholders only** — never a value that works.
4. **Secrets reach production through the platform's secret store** (Render environment variables marked `sync: false`), never through a committed file.
5. **Never logged.** `env.describe()` returns host, port, database name and environment class, and is tested to contain no user or password. Connection strings are never logged whole.
6. **Never in an error message** returned to a client. `server.js` already suppresses error detail when `isProduction()`.
7. **Every environment gets its own value of every class-A secret.** A shared secret makes rotation an outage.

---

## 4. Rotation

### 4.1 Scheduled

| Secret | Interval | Procedure |
|---|---|---|
| `DB_PASSWORD` | 90 days | create a second TiDB user → update Render → verify → drop the old user |
| `JWT_SECRET` | 90 days | see §4.2 — has user-visible impact |
| Payment, SMS, AI, storage keys | 180 days | issue new key at provider → update Render → verify → revoke old |
| `VAPID_*` | on compromise only | rotating invalidates every push subscription |

### 4.2 `JWT_SECRET` rotation without logging everyone out

The current implementation verifies against one secret, so rotation is a forced global logout. That is acceptable during an incident and unacceptable as routine.

**Target (Phase 3, one line in `docs/architecture/API-ARCHITECTURE.md`):** verify against a list — current plus previous — and sign with current only. Set both, wait one token lifetime (`JWT_EXPIRES_IN`, currently 7d), then drop the previous. Until that exists, scheduled rotation logs everyone out and must be scheduled accordingly.

### 4.3 Emergency rotation

Triggered by: a secret in a commit, a lost or compromised device, a departing person with access, unexplained access in provider logs, or an incident like the one in `CREDENTIAL-INCIDENT.md`.

```
1. Rotate at the provider first    — the old value stops working
2. Update the production secret store
3. Restart / redeploy
4. Verify the service is healthy
5. Rotate JWT_SECRET if account access could have been obtained
6. Revoke every refresh token           (DELETE FROM refresh_tokens)
7. Search provider logs for use of the old credential
8. Record what happened in docs/security/CREDENTIAL-INCIDENT.md
```

Order matters. Rotating at the provider first means an attacker holding the old value loses it immediately, at the cost of a brief outage. The reverse order leaves a window.

---

## 5. Repository hygiene

`.gitignore` previously enumerated three suffixes — `.env`, `.env.local`, `.env.staging` — so `backend/.env.production` or `.env.development` would have been committed silently. It now ignores every variant and allows back only the documented templates:

```
.env
.env.*
**/.env
**/.env.*
!.env.example
!**/.env.example
!frontend/.env.production      # public VITE_API_URL only

*.pem  *.key  *.p12  *.pfx  *.jks  *.keystore
id_rsa  id_rsa.*  id_ed25519  id_ed25519.*
*service-account*.json  *credentials*.json
```

Verified: `backend/.env`, `backend/.env.development`, `frontend/.env.local` and `backend/tls.pem` are ignored; the three template files remain tracked; **no previously-tracked file became ignored** by the change.

### 5.1 Not yet in place

| Control | Status | Note |
|---|---|---|
| Pre-commit secret scan | **absent** | `gitleaks` or equivalent — Phase 3 |
| CI secret scan on push | **absent** | Phase 3 |
| Git history scan for historically-committed secrets | **not performed** | see §6 |
| Secret store with audit trail (Vault / Doppler / SSM) | **absent** | Render environment variables are adequate at current scale |

---

## 6. Git history

**Not audited.** This phase read the working tree, not the history.

Two things are already known to be in history and cannot be un-published by any future action: the `admin123` plaintext and its bcrypt hash (P0-9), and the demo password `demo1234`. Both are neutralised in the current schema — the hash is nulled by migration `002`, and Phase 0.5 made a NULL hash unable to authenticate at all.

**Recommended before any public release:** run a history scan (`gitleaks detect --log-opts="--all"`) and treat every hit as compromised regardless of age. If the repository has ever been public, treat every secret ever committed as public.

---

## 7. Ownership

| Secret | Owner |
|---|---|
| Database, JWT, object storage | project owner |
| Payment gateway | project owner (business relationship with SSLCommerz) |
| SMS provider | project owner |
| AI provider keys | project owner |
| CI tokens | GitHub-provided; not human-managed |

At current team size the project owner holds everything. That is workable and should be recorded as a single point of failure rather than pretended otherwise: there is no second person who can rotate a credential during an incident.
