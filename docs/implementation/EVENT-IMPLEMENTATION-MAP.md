# IMAP 2.0 — Event Implementation Map (Gate 1)

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Governed by:** `EVENT-ARCHITECTURE.md` (incl. Phase 2.75 amendment B1–B3) · AD-006, AD-024

> **No event is published that has no consumer.**
> 16 events. 45 were designed; 8 had no consumer at all and are removed; 21 are deferred with their consumers.

---

## 1. Mechanism

**Transactional outbox** (AD-006). No message broker at Gate 1.

```
BEGIN
  state change
  audit record
  outbox_event  (published_at = NULL)
COMMIT
     ↓
dispatcher polls (published_at IS NULL) ORDER BY id
     ↓  at-least-once
consumer (idempotent)  →  mark published
```

| Property | Guarantee |
|---|---|
| Atomicity | An event exists only if its state change committed |
| Delivery | **At-least-once.** Every consumer is idempotent — this is not optional |
| Ordering | **Per aggregate** (`ORDER BY id` within `aggregate_id`), never global |
| Retry | Exponential backoff, bounded — except where noted below |
| DLQ | Terminal failures with full attempt history. **Never silently dropped** |
| Replay | Any event replayable from the outbox; consumers must tolerate it |

**In-process dispatcher at Gate 1**, running in the same node as the API. Single instance; a Redis lock prevents double dispatch when a second instance appears. Extraction trigger: dispatch lag exceeds 30 s at p95.

---

## 2. The 16 events

`INDEF` = retry indefinitely with backoff and alert. Used where dead-lettering would lose money or leave an unsafe state.

| # | Event | Producer | Transaction boundary | Consumer(s) | Payload | Ordering | Idempotency key | Failure | Observability |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `account.created` | identity | with principal insert | platform (audit) | `principal_id, account_id, kind` | none | `account_id` | retry → DLQ | count |
| 2 | `identity.verified` | identity | with case decision | marketplace (eligibility) | `principal_id, level, case_id` | per principal | `(principal_id, case_id)` | retry → DLQ | count, lag |
| 3 | `capability.verified` | identity | with case decision | marketplace (bookable flag) | `provider_id, capability_id, decision, case_id` | per provider | `(provider_id, capability_id, case_id)` | retry → DLQ | count |
| 4 | `provider.approved` | marketplace | with state change | booking, platform | `provider_id, account_id` | per provider | `(provider_id, event_id)` | retry → DLQ | count |
| 5 | `provider.suspended` | marketplace | with state change | booking (block new), platform | `provider_id, reason_code` | per provider | `(provider_id, event_id)` | **INDEF** | count, **alert on lag** |
| 6 | `booking.created` | booking | with booking insert | finance (freeze quote), marketplace (commit hold), notification | `booking_id, quote_id, provider_id, customer_account_id, window` | per booking | `booking_id` | retry → DLQ | count, lag |
| 7 | `booking.confirmed` | booking | with transition | finance, notification | `booking_id, provider_id` | per booking | `booking_id` | retry → DLQ | count |
| 8 | **`booking.completed`** | booking | with transition | **finance (allocate + accrue)**, marketplace (rating view), notification | `booking_id, amount_minor, fee_minor, currency, method` | per booking | `booking_id` | **INDEF** | count, lag, **alert** |
| 9 | `booking.cancelled` | booking | with transition | finance (void or refund), marketplace (release hold), notification | `booking_id, stage, cancelled_by, reason_code` | per booking | `booking_id` | **INDEF** | count |
| 10 | **`booking.disputed`** | booking | with dispute insert | **finance (hold funds)**, notification, ops | `booking_id, dispute_id, raised_by` | per booking | `dispute_id` | **INDEF** | count, **alert** |
| 11 | `dispute.resolved` | booking | with resolution | finance (release/reverse), notification | `dispute_id, booking_id, outcome, amount_minor?` | per dispute | `dispute_id` | **INDEF** | count |
| 12 | `payment.captured` | finance | with payment transition | **booking (read model)**, notification, platform | `payment_id, booking_id, amount_minor, currency` | per payment | `payment_id` | **INDEF** | count, lag |
| 13 | `payment.failed` | finance | with payment transition | booking (read model), notification | `payment_id, booking_id, reason_code` | per payment | `payment_id` | retry → DLQ | count |
| 14 | `refund.issued` | finance | with refund settlement | booking (read model), notification, platform | `refund_id, payment_id, booking_id, amount_minor` | per refund | `refund_id` | **INDEF** | count |
| 15 | `review.submitted` | booking | with review insert | marketplace (rating view) | `review_id, provider_id, rating` | per provider | `review_id` | retry → DLQ | count |
| 16 | **`emergency.raised`** | booking | with request insert | platform (admin notify) | `request_id, kind, severity, has_location, booking_id?` | none | `request_id` | **INDEF + alert** | count, **alert on any delay** |

### Two payload rules

**No Sealed or Sensitive content in a payload.** Event 16 carries `has_location: true`, never coordinates; the description never leaves the emergency context. Event 12 carries an amount because Finance is the consumer and the amount is the point; event 6 carries a `quote_id`, not a price breakdown.

**Payloads carry ids and the minimum a consumer needs to act.** A consumer that needs more reads it — synchronous reads across contexts are permitted (V-08); it is synchronous *writes* that are forbidden.

---

## 3. Why "retry indefinitely" on seven events

Dead-lettering events 5, 8, 9, 10, 11, 12, 14 and 16 means:

* a suspended provider stays listed and keeps receiving work;
* a completed booking never pays its provider;
* a cancelled booking never refunds;
* a dispute never holds the funds it exists to hold;
* an emergency request never reaches an admin.

These retry with exponential backoff to a ceiling, **alert on the first backoff escalation**, and do not give up. The queue growing is a visible operational problem; silent loss is not.

The other eight can dead-letter because their failure is recoverable by replay without a money or safety consequence.

---

## 4. Consumer implementation

```js
// modules/finance/application/subscribers/onBookingCompleted.js
module.exports = {
  event: 'booking.completed',
  idempotencyKey: (e) => `finance:allocate:${e.booking_id}`,
  async handle(conn, event) {
    if (await alreadyHandled(conn, this.idempotencyKey(event))) return;   // layer 1
    await accrueEarnings(conn, event);      // posts ledger; unique reference is layer 2
    await markHandled(conn, this.idempotencyKey(event));
  },
};
```

**Three layers of idempotency, deliberately redundant:** the consumer's handled-marker, the ledger's unique `reference`, and the guarded state transition. Any one would suffice; all three are cheap, and the combination is why a duplicated delivery cannot move money twice.

The handler receives a `conn` — its work and its handled-marker commit together.

---

## 5. Job idempotency (AD-024)

Every job declares one of two properties. **A job declaring neither throws at registration.**

| Declaration | Meaning | Permitted for |
|---|---|---|
| `idempotent: "key"` | Deterministic `job_key`; the external call carries an `effect_token` derived from it | Anything that moves money, sends a message, or changes external state |
| `idempotent: "at-least-once"` | An explicit, reviewed statement that repeating is harmless | Cache warming, projection rebuilds, metrics. **Never for an external side effect** |

| Concept | Rule |
|---|---|
| `job_key` | Derived only from inputs. `UNIQUE(kind, job_key)` — enqueuing a duplicate is a no-op returning the existing job |
| execution id | New on every attempt; correlates logs and audit |
| **effect token** | Derived from `job_key`, **never from the execution id** — otherwise every retry is a fresh request to the provider |
| Ambiguous outcome (timeout) | **Never marked failed.** Reconcile against the provider — the money may have moved |

### Gate-1 jobs

| Kind | Job key | Idempotency | Notes |
|---|---|---|---|
| `sms.send_otp` | `sms:otp:<phone>:<otp_window>` | key | Effect token = job key |
| `notification.dispatch` | `notif:<template>:<principal>:<resource>` | key | Suppression is a recorded outcome |
| `booking.auto_confirm` | `booking:<id>:auto_confirm` | key | Fires at `auto_confirm_at` |
| `booking.expire_hold` | `hold:<id>:expire` | key | Abandoned `pending` must not hold a slot forever |
| `payout.clearance` | `claim:<id>:clear` | key | Re-reads dispute state |
| `payout.execute` | `payout:<claim_id>:execute` | key | Effect token to the payment channel |
| `refund.execute` | `refund:<id>:execute` | key | |
| `payment.reconcile` | `payment:reconcile:<date>:<hour>` | key | Resolves `initiated` payments against the gateway |
| `ledger.reconcile` | `ledger:reconcile:<date>` | at-least-once | Read + compare + alert; no side effect |
| `audit.export` | `audit:export:<date>` | key | Cold storage |

---

## 6. Build order

| # | Step | Exit criterion |
|---|---|---|
| **E-1** | `outbox_event` + in-transaction writer | no event without a committed change; test proves rollback removes both |
| **E-2** | Dispatcher with per-aggregate ordering | events for one aggregate arrive in order |
| **E-3** | Consumer registry + handled-marker | duplicate delivery handled once |
| **E-4** | Retry, backoff, DLQ, INDEF class | a poisoned event does not block its aggregate's queue |
| **E-5** | Job queue with AD-024 declarations | a job with no declaration fails at registration |
| **E-6** | Per-event consumers, in module order | each event's consumer test passes before the next |
| **E-7** | Observability — count, lag, DLQ depth, alerts | dispatch lag visible; INDEF backoff alerts |

**E-1 through E-5 are platform work and land before any domain module publishes.** An event with no dispatcher is a row nobody reads.

---

## 7. Deferred and removed

**Removed — 8 events that had no consumer** in the Phase 2 design (S-05): `need.expressed`, `need.understood`, `search.performed`, `provider.viewed`, `quote.issued`, `message.read`, `notification.delivered`, `context.written`. Analytics can read the underlying tables; an event exists to *drive* something.

**Deferred — 21**, with their consumers: trust signals (6), AI task lifecycle (5), loyalty (3), promotion (2), referral (2), provider standing (2), context (1).

**Re-adding an event requires naming its consumer in the same change.** That is the rule, and it is the one that keeps the count honest.

---

## 8. Observability

| Metric | Alert |
|---|---|
| `outbox_pending_count` | > 100 for 5 min |
| `outbox_dispatch_lag_seconds` | p95 > 30 s |
| `event_handler_failures{event}` | any INDEF event failing |
| `dlq_depth` | > 0 |
| `job_dead_count` | > 0 |
| `event_replay_count` | informational — a spike means a consumer bug |

Every event carries the `correlation_id` of the request that produced it, so one user action is traceable across HTTP → state change → audit → event → consumer → job → external call.
