# IMAP 2.0 — Backup, Recovery & Disaster Response

**Status:** SPECIFICATION · **Phase:** 2.75 · **Date:** 2026-08-09
**Closes:** U-02 · **Related:** `docs/architecture/MIGRATION-STRATEGY.md`, `docs/engineering/OBSERVABILITY.md`

---

## 0. Assumptions, marked as such

This document does not invent vendor guarantees. Where a provider's behaviour has not been verified against its documentation or console, it is marked **[ASSUMPTION — VERIFY]** and must be confirmed before the numbers below are treated as commitments.

| # | Assumption | Status |
|---|---|---|
| A-1 | TiDB Serverless takes automatic backups on the current plan | **[ASSUMPTION — VERIFY]** in the TiDB Cloud console |
| A-2 | TiDB Serverless supports point-in-time restore, and for how long | **[ASSUMPTION — VERIFY]** |
| A-3 | Restore produces a *new* cluster rather than overwriting in place | **[ASSUMPTION — VERIFY]** — this determines whether restore is safe under load |
| A-4 | Cloudflare R2 object versioning is enabled on `imap-uploads` | **[ASSUMPTION — VERIFY]** — R2 versioning is opt-in |
| A-5 | Render redeploys from git and holds no state worth backing up | high confidence; `render.yaml` declares no disk |

**Until A-1…A-4 are verified, IMAP has no backup.** "The managed service probably handles it" is the belief that precedes data loss. Verification is item 1 of §9.

---

## 1. What must survive

| Data | Store | Recreatable? | Loss impact |
|---|---|---|---|
| Users, accounts, credentials | TiDB | no | catastrophic |
| Bookings and their state | TiDB | no | catastrophic — active jobs, obligations |
| Payments, wallet ledger | TiDB | no | **catastrophic and legally material** |
| KYC decisions | TiDB | no — re-verification needed | severe |
| Reviews, ratings | TiDB | no | severe — trust is cumulative |
| Provider profiles | TiDB | partially, by the provider | moderate |
| Identity documents | R2 | no | **severe** — re-collection of regulated personal data |
| Provider certificates | R2 | no | severe |
| Uploaded avatars | R2 | yes | trivial |
| Demo/seed data | TiDB | yes | none |

The ledger is the sharpest case. `AD-007` makes it append-only and makes every balance derived from it, which means the ledger *is* the money. There is no other copy to reconcile against — losing a day of ledger entries is losing a day of financial truth, not a day of records about it.

---

## 2. Objectives

| Class | RPO | RTO | Justification |
|---|---|---|---|
| Financial (ledger, payments) | **0** for committed transactions | 4 h | An acknowledged payment that vanishes is money owed to a real person |
| Core transactional (users, bookings) | **15 min** | 4 h | 15 minutes of bookings is recoverable by contacting the parties |
| Object storage (identity documents) | **24 h** | 24 h | Slow-changing; re-collection is possible but expensive and intrusive |
| Derived / cache | n/a | rebuild | By definition |

**RPO 0 for financial data is a claim about the design, not about the backup.** It holds only because every money mutation is a single committed database transaction (`withTransaction`, Phase 0.5) and because idempotency keys make replay safe. It is met by *durability of the commit*, not by backup frequency. Backups protect against corruption and deletion, not against a lost second.

Bangladesh operating hours concentrate demand roughly 08:00–22:00 BST. A 4-hour RTO during that window is a full working day of lost bookings and is the outer limit of acceptable, not a target.

---

## 3. Database

### 3.1 Layers

| Layer | Mechanism | Frequency | Retention | Location | Status |
|---|---|---|---|---|---|
| L1 | TiDB automatic backup | provider default | provider default | provider-managed | **[VERIFY A-1]** |
| L2 | TiDB point-in-time restore | continuous | provider window | provider-managed | **[VERIFY A-2]** |
| L3 | **Independent logical dump** | daily | 30 daily, 12 monthly | separate provider from TiDB | **not implemented** |
| L4 | Pre-migration snapshot | per migration | until the next one verifies | either | **procedure defined, §3.3** |

**L3 is not optional.** L1 and L2 live inside the same account as the thing they protect. They do not survive account compromise, account closure, a billing failure, or an operator error executed with valid credentials — which is precisely the failure mode Phase 2.5 found the environment configured for.

L3 specification:
* `mysqldump --single-transaction --routines --triggers` against a read replica or during low traffic;
* encrypted at rest with a key **not** stored beside the dump;
* written to a provider that is not TiDB and not the primary cloud account;
* daily, retained 30 days; the 1st of each month retained 12 months;
* **the job's success is monitored.** A backup job that silently stops is worse than none, because it is believed.

### 3.2 Restore procedure

```
1.  Declare the incident. Record start time.
2.  Determine the target point in time.
3.  Restore to a NEW cluster or a NEW database name — never over the live one.
4.  Verify the restore before switching anything:
      row counts        users, bookings, payments, wallet_transactions
      ledger integrity  SUM(credits) - SUM(debits) per user vs users.balance
      referential       bookings with no user; payments with no booking
      recency           MAX(created_at) per table vs the target point
5.  Put the application in maintenance mode.
6.  Repoint DB_HOST / DB_NAME at the restored database.
7.  Smoke test: login, create a booking, initiate a payment (sandbox), read a ledger balance.
8.  Leave maintenance mode.
9.  Reconcile the gap: every payment the gateway shows as settled inside
    [restore point, incident end] that has no local record.
10. Record RPO and RTO actually achieved in the incident log.
```

Step 9 is the one people forget. SSLCommerz has its own record of every settlement; after a restore, that record is the authority for the gap window, and reconciling it is how a customer who paid does not end up unpaid.

### 3.3 Pre-migration snapshot

Mandatory before any migration classified MEDIUM or above in `MIGRATION-STRATEGY.md`:

```
1. Take the snapshot. Record its identifier in the migration log.
2. Verify it is restorable — not merely that the call returned success.
3. Apply the migration.
4. Verify against the migration's stated success criteria.
5. Keep the snapshot until the next migration has itself been verified.
```

Step 2 is the whole point. An unverified backup is a hypothesis.

---

## 4. Object storage

`AD-011` puts identity documents, provider certificates and avatars in Cloudflare R2 behind signed URLs. This is the most sensitive data IMAP holds and the least protected today.

| Control | Required | Status |
|---|---|---|
| Versioning on `imap-uploads` | yes — protects against overwrite and delete | **[VERIFY A-4]** — R2 versioning is opt-in |
| Lifecycle: retain non-current versions | 90 days | not configured |
| Cross-provider copy of identity documents | weekly | not configured |
| Encryption at rest | provider-side minimum; application-side for identity documents at Gate 2 | provider-side assumed |
| Public-access audit | no object publicly readable except avatars | **not verified** |
| Deletion is soft first | 30-day tombstone before hard delete | not implemented |

### 4.1 Retention and deletion

Per `docs/security/SECURITY-ARCHITECTURE.md`, identity documents are Sealed and retained only as long as the verification decision requires. Backups must not silently defeat that: a document deleted for retention must also age out of backups.

**Rule:** the backup retention period for Sealed objects is the bound on how long a deleted document can persist anywhere. Set it to 90 days and state it. A backup retained for seven years is a seven-year retention policy for identity documents, whatever the policy document says.

### 4.2 Recovery

| Failure | Response |
|---|---|
| Single object deleted | restore the previous version |
| Bucket deleted | restore from the cross-provider copy; re-issue signed URLs |
| Credential compromised | rotate, audit access logs, assume every object was read |
| Provider outage | uploads fail closed with a retryable error; **never** fall back to base64-in-database |

The last row matters: `utils/storage.js` has a base64 fallback for development. It must never engage in production — putting identity documents into the primary database defeats AD-011 and puts Sealed data in every database backup.

---

## 5. Disaster response by failure mode

For each: how it is detected, what the user sees, what happens to data, and what is audited.

### 5.1 Database unavailable

| | |
|---|---|
| **Detection** | `/api/health` fails; connection errors in logs |
| **Fallback** | none — the database is the system of record |
| **User sees** | maintenance page; explicit "your booking was not created" — **never** an optimistic acknowledgement |
| **Data integrity** | preserved: uncommitted transactions roll back |
| **Recovery** | wait out a provider incident; restore (§3.2) for data loss |
| **Audit** | nothing written — the audit log is in the same database |

The last line is a real limitation, stated rather than hidden: `AD-009` writes audit records inside the state-change transaction, so an unavailable database means no audit of the outage. Acceptable, because nothing changed.

### 5.2 Object storage unavailable

| | |
|---|---|
| **Detection** | upload error rate |
| **Fallback** | **none by design** — fail closed. No base64 fallback in production |
| **User sees** | "Document upload is temporarily unavailable. Your application is saved; add the document later." |
| **Data integrity** | KYC stays `pending`; no state advances on a missing document |
| **Recovery** | provider recovery; retry |

### 5.3 Payment provider unavailable

| | |
|---|---|
| **Detection** | initiation and callback failure rates |
| **Fallback** | cash-on-completion remains available; wallet balance remains spendable |
| **User sees** | "Online payment is temporarily unavailable. You can pay in cash on completion." |
| **Data integrity** | **critical** — a payment whose callback never arrives is `pending`, never `failed`. Reconcile against the gateway before deciding |
| **Recovery** | reconciliation job compares local `payments` with the gateway's settled list |
| **Audit** | every reconciliation-driven state change is audited with the gateway reference |

Phase 0.5 already established the rule this depends on: an unconfigured or unreachable gateway **refuses**; it never settles. Timeout is not failure — the money may have moved.

### 5.4 AI provider unavailable

| | |
|---|---|
| **Detection** | provider error rate; latency |
| **Fallback** | secondary provider (`AD-015`), then keyword search |
| **User sees** | ordinary search and browse. No degraded-AI banner unless the user was mid-conversation |
| **Data integrity** | none at risk — AI owns nothing (`AI-ARCHITECTURE.md`) |
| **Recovery** | automatic |

This is why Gate 1 excludes AI: nothing in the core loop depends on it.

### 5.5 Realtime unavailable

| | |
|---|---|
| **Detection** | socket connection failure rate |
| **Fallback** | polling; realtime is an enhancement, never the only channel |
| **User sees** | slower updates; no message loss — messages are persisted, not merely broadcast |
| **Data integrity** | preserved: `REALTIME-ARCHITECTURE.md` requires persist-then-emit |
| **Recovery** | reconnect with replay from persisted state |

### 5.6 Notification / SMS unavailable

| | |
|---|---|
| **Detection** | provider error rate; OTP verification failures |
| **Fallback** | email where an address exists; in-app notification always |
| **User sees** | for OTP login — "SMS is delayed, try email or password". **Never** an OTP in the response |
| **Data integrity** | notifications are at-least-once; duplicates preferred to loss |
| **Recovery** | queue drains on provider recovery |

### 5.7 Application unavailable

| | |
|---|---|
| **Detection** | Render health check on `/api/health` |
| **Fallback** | the frontend is static on GitHub Pages and stays up — it must degrade honestly, not appear functional |
| **User sees** | "IMAP is temporarily unavailable" |
| **Recovery** | Render restarts; roll back the deploy if the new build is at fault |

### 5.8 Emergency-path failure — the special case

`EMERGENCY-ARCHITECTURE.md` sets the rule that governs every row above: **IMAP must never claim an external action was completed unless the server verified it.**

If SOS dispatch, blood-request routing or disaster reporting cannot complete, the user must be shown the failure *and the direct hotline number*, immediately. A person in an emergency acting on a false "help is on the way" is the worst outcome this system can produce, and it is worse than showing an error.

---

## 6. Backup verification

A backup is unverified until restored.

| Test | Frequency | Success criterion |
|---|---|---|
| Restore to a scratch database | **monthly** | completes; row counts within expected drift |
| Ledger integrity on the restored copy | monthly | derived balances match `users.balance` for every account |
| Restore timing | monthly | measured RTO within objective |
| Object-storage version restore | quarterly | an object restored to a prior version |
| Full drill: restore + repoint + smoke test | **before Gate 1 launch, then quarterly** | the §3.2 procedure completes end to end |

The first full drill is a Phase 3 prerequisite. Until it has been run once, the RTO in §2 is an estimate.

---

## 7. What is explicitly not covered

| Gap | Consequence | When |
|---|---|---|
| No multi-region failover | a TiDB regional outage is a full outage | not justified at current scale |
| No hot standby | RTO is restore-bound | as above |
| No automated failover | recovery is manual | as above |
| Git history not scanned for secrets | historic secrets may be recoverable from backups | `SECRETS-MANAGEMENT.md` §6 |
| No runbook rehearsal by a second person | single point of failure — one person can execute recovery | organisational, not technical |

The last one is the most serious and the least technical. Every procedure here assumes the project owner is available.

---

## 8. Prerequisites before Phase 3

| # | Action | Blocks |
|---|---|---|
| 1 | Verify A-1…A-4 in the TiDB and Cloudflare consoles; replace the assumptions with facts | everything below |
| 2 | Implement L3 independent logical backup with monitored success | protection against account-level loss |
| 3 | Enable R2 versioning and a non-current-version lifecycle rule | identity-document protection |
| 4 | Run one full restore drill and record actual RPO/RTO | validates §2 |
| 5 | Confirm the base64 storage fallback cannot engage in production | Sealed data in database backups |

Item 4 is the one that turns this document from a plan into a capability.
