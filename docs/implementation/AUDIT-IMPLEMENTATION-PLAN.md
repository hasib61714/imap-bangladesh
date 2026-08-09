# IMAP 2.0 — Audit Implementation Plan

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Governed by:** `AUDIT-LOG-ARCHITECTURE.md` · AD-009 · R-1101, R-1103, R-705

**Built first — before identity, before the ledger, before anything.** `CREDENTIAL-INCIDENT.md` §2 has to answer "was the published credential used?" with **UNKNOWN**, and it will always say UNKNOWN for that period because the evidence was never collected. That is the argument for the ordering, and it is not theoretical.

---

## 1. The core rule

> **The audit record is written inside the same database transaction as the change it records.**

```
BEGIN
  state change
  audit record          ← same transaction
  outbox event          ← same transaction
COMMIT
```

Change, audit and event commit together or none do. Deriving audit asynchronously from the event stream fails for exactly the case that matters: a crashed consumer leaves a state change with no record, and the gap is discovered during an investigation.

---

## 2. Build order

| # | Step | Delivers | Exit criterion |
|---|---|---|---|
| **AU-1** | `audit_log` table, monthly partitions | schema + indexes | **the app role has `INSERT`/`SELECT` and nothing else** — a `DELETE` attempt fails |
| **AU-2** | `writeAudit(conn, record)` | requires a connection; throws without one | no path to an audit record outside a transaction |
| **AU-3** | Actor propagation | correlation id from transport → use case → audit | every record has a `correlation_id` |
| **AU-4** | Use-case integration | every mutating use case writes its record as it is built | a state change with no audit row fails the transaction |
| **AU-5** | Denial recording | authorization denials on sensitive actions | attempted access is visible |
| **AU-6** | Read auditing | Sealed reads audited **even though nothing changed** (V-07) | every identity-document read has a record with a reason |
| **AU-7** | Ops read surface | `GET /ops/audit`, scoped by record class | **the read is itself audited** |
| **AU-8** | Daily cold export | append-only object storage, partitioned by date | export verified restorable |

**AU-1's exit criterion is the whole design.** If the application can delete from the table, it is not an audit log. Assert the grant in a test; do not assume the DBA set it.

---

## 3. Record

```
id                UUIDv7
occurred_at       UTC
correlation_id    ties request → logs → events → jobs

actor_principal   null only for genuine system actions
actor_account     acting as (AD-017)
actor_role        role AT THE TIME — not looked up later
actor_via         http | ai | job | system | ops
on_behalf_of      set when support acts for a user

action            "booking.confirm_completion"
resource_type     "booking"
resource_id
resource_owner    denormalised for investigation queries

outcome           permitted | denied | failed
before_json       CHANGED FIELDS ONLY
after_json        CHANGED FIELDS ONLY
reason            required for overrides and punitive actions
```

### 3.1 Rules with teeth

| Rule | How it is enforced |
|---|---|
| **Changed fields only** | `writeAudit` computes the diff; passing a whole row throws. Prevents the log becoming a second uncontrolled copy of the database |
| **No Sensitive/Financial-detail/Emergency content in payloads** | A field denylist checked at write time, tested per privacy class |
| **Role recorded at the time** | The actor carries its role; the writer never re-queries |
| **`reason` mandatory** for punitive actions and overrides | Policy-driven (`AUTHORIZATION-IMPLEMENTATION-PLAN.md` §4); a missing reason denies before the change |
| **Denials recorded** for sensitive actions | Kernel writes on deny |
| **`correlation_id` always present** | Generated at transport; `requestLogger.js` already generates one and **never uses it** — wiring it is a one-line fix |

### 3.2 Recorded instead of the sensitive value

| Instead of | Record |
|---|---|
| Identity document contents | `document_accessed`, doc id, **reason** |
| Message body | `message_sent`, conversation id, length |
| Emergency description | `emergency_request_viewed`, request id, reason |
| Password / OTP | **never, in any form** |
| Precise coordinates | `location_released`, purpose, duration |
| Ledger amounts on non-financial actions | reference to the ledger transaction |

---

## 4. Audit points by module

### platform
Feature-flag change (reason) · job dead-lettered · **every audit read**.

### identity
Registration · authentication **success and failure** · session revocation · membership grant/revoke (reason) · verification submission · **verification decision (reason)** · **document access (reason)** · capability decision (reason) · account closure.

Authentication failure is the record that would have answered `CREDENTIAL-INCIDENT.md` §2. It costs one row per failed attempt and it is the difference between knowing and guessing.

### marketplace
Provider application · approval (reason) · rejection (reason) · **suspension (reason)** · listing/pause/resume · price change · availability publication · service create/publish/deprecate · edge change.

### booking
**Every state transition**, with actor and reason · dispute raise/resolve (reason) · message sent (metadata only) · review submission · emergency request creation, acknowledgement, **view** · donor contact release.

### finance
**Every** payment, capture, refund approval, refund execution, payout, commission accrual, ledger transaction and adjustment. Financial actions are audited without exception — including ones that fail.

### Not audited
Reads of public data · ordinary list queries · health checks · static assets. Auditing everything makes the log unusable, which is its own failure mode.

---

## 5. The write helper

```js
// modules/platform/audit/writeAudit.js
async function writeAudit(conn, {
  actor, action, resourceType, resourceId, resourceOwner,
  outcome = 'permitted', before, after, reason,
}) {
  if (!conn) throw new Error('writeAudit requires a transaction connection');
  const diff = diffChangedFields(before, after);        // §3.1
  assertNoForbiddenFields(diff, action);                // privacy denylist
  if (policyRequiresReason(action) && !reason)
    throw new Error(`audit reason required for ${action}`);
  await conn.query(INSERT_AUDIT, { ...actor, action, resourceType, resourceId,
                                   resourceOwner, outcome, diff, reason,
                                   correlationId: actor.correlation_id });
}
```

Three deliberate properties: **`conn` is required**, the diff is computed rather than trusted, and a missing reason throws **before** the state change rather than after.

---

## 6. Verifying that nothing escapes

Coverage is not left to review.

| Check | Mechanism |
|---|---|
| Every mutating use case writes an audit record | Test harness wraps each use case, asserts ≥1 audit row per invocation. **A use case with no audit row fails its own test** |
| Every state transition writes one | The state-machine helper writes it; a transition cannot be applied without one |
| No sensitive field reaches a payload | Denylist test per privacy class |
| The log is append-only | Grant test + absence-of-repository-method test |
| Audit reads are audited | Integration test |

---

## 7. Storage

| Stage | Behaviour |
|---|---|
| Write | Primary database, in-transaction |
| Hot | 90 days, partitioned monthly, indexed for investigation |
| Warm | Daily export to append-only object storage |
| Cold | Compressed; financial class follows statutory retention |
| Pruning | Partition drop, never a mass `DELETE` |

**Indexes:** `(resource_type, resource_id, occurred_at)` · `(actor_principal_id, occurred_at)` · `(correlation_id)` · `(action, occurred_at)`.

**Growth is monitored.** A spike almost always means someone started logging whole rows.

---

## 8. Stated honestly

An audit log inside the same database as the data it audits is compromised by full database compromise. Hash-chaining over ordered batches, anchored in cold storage, gives **tamper evidence, not tamper prevention** — it detects modification; it does not stop a database administrator with direct access.

That residual risk is named, not hidden. Mitigation is the daily export (AU-8), not a claim that the primary log is immutable against everything.

---

## 9. What the audit log makes answerable

| Question | Today | After AU-4 |
|---|---|---|
| Was the published `admin123` credential used? | **UNKNOWN, permanently** | answerable from this point on |
| Who changed this provider's standing, and why? | unanswerable | actor, reason, before/after |
| What happened to this booking? | inferred from `updated_at` | full timeline |
| Who read this identity document? | unanswerable | actor, time, reason |
| Did this refund get approved and executed by the same person? | unanswerable | `sod_bypass` flag |
| How many resolved needs this month? | not computable | state-change counts as ground truth |

**Exit criterion for the phase** (`AUDIT-LOG-ARCHITECTURE.md` §11): every booking, payment, verification and admin state change appears in the audit log with actor and before/after.
