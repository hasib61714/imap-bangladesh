# IMAP 2.0 — State Machine Implementation Plan

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Governed by:** `STATE-MACHINES.md` · `GATE-1-ARCHITECTURE.md` §5

---

## 1. The one pattern

Every transition, in every machine, is the same shape. Generalised from Phase 0.5's `bookingState.js`, which already does this correctly for bookings.

```js
async function transition(conn, { machine, id, from, to, actor, reason, ctx }) {
  const rule = machine.transitions[from]?.[to];
  if (!rule) throw new IllegalTransition(machine.name, from, to);
  if (!rule.actors.includes(actorRelation(actor, ctx.resource)))
    throw new Forbidden(`${machine.name}.${to}`);
  if (rule.reasonRequired && !reason) throw new ReasonRequired();
  if (rule.guard && !rule.guard(ctx)) throw new PreconditionFailed();

  const [res] = await conn.query(
    `UPDATE ${machine.table} SET state = ?, updated_at = NOW(3)
      WHERE id = ? AND state = ?`, [to, id, from]);

  if (res.affectedRows === 0) throw new ConcurrentTransition(from, to);  // ← lost the race

  await rule.sideEffects?.(conn, ctx);          // same transaction
  await writeAudit(conn, {...});                // same transaction
  await publishEvent(conn, rule.event, ctx);    // same transaction, via outbox
}
```

| Property | Why it matters |
|---|---|
| `UPDATE … WHERE state = ?` + `affectedRows` check | Two concurrent transitions: exactly one wins. This is what makes P0-5 (repeat completion moving money twice) impossible |
| Side effects, audit and event **inside** the caller's transaction | Partial application cannot exist |
| The transition table is data | Legal transitions are enumerable, testable and reviewable — not scattered through `if` statements |
| `actorRelation`, not a global role | "the provider **of this booking**", not "a provider" |

**Illegal transitions are not defended by comments.** Each one has a test.

---

## 2. Machine #1 — Booking

Central machine. States: `pending · confirmed · active · arrived · awaiting_confirmation · completed · disputed · cancelled`.

| From → To | Actor | Auth action | Validation | Side effects (same transaction) | Audit | Event | Notification |
|---|---|---|---|---|---|---|---|
| — → `pending` | customer | `booking.request` | valid unexpired quote; provider listed; **customer phone-verified**; slot hold acquired | hold committed to this booking; payment intent created | create | `booking.created` | provider: new request |
| `pending` → `confirmed` | provider | `booking.accept` | state | slot confirmed | ✔ | `booking.confirmed` | customer |
| `pending` → `cancelled` | customer, provider, system(expiry) | `booking.cancel` | reason | slot released; **nothing captured** | ✔ + reason | `booking.cancelled` | other party |
| `confirmed` → `active` | provider | `booking.start` | state | location window opens | ✔ | — | customer |
| `confirmed` → `cancelled` | customer, provider, admin | `booking.cancel` | reason; policy evaluated | slot released; refund per policy | ✔ + reason | `booking.cancelled` | other party |
| `active` → `arrived` | provider | `booking.arrive` | state | — | ✔ | — | customer |
| `arrived` → `awaiting_confirmation` | provider | `booking.report_done` | state | **`auto_confirm_at` set and returned now** | ✔ | — | customer, with the deadline |
| `awaiting_confirmation` → `completed` | **customer**, admin(reason), system(deadline) | `booking.confirm_completion` | customer confirmation **or** elapsed window | earnings accrued; commission accrued; location closed; review eligibility | ✔ | **`booking.completed`** | both |
| `awaiting_confirmation` → `disputed` | customer, provider | `dispute.raise` | reason | dispute created | ✔ + reason | **`booking.disputed`** | both + admin |
| `disputed` → `completed`/`cancelled` | trust_safety | `dispute.resolve` | resolution record | funds released or refunded | ✔ + reason | `dispute.resolved` | both |
| `active`/`arrived` → `cancelled` | **admin only** | `booking.cancel` | reason mandatory | manual settlement decision | ✔ + reason | `booking.cancelled` | both |

### Forbidden — each is a test

| Forbidden | Test asserts |
|---|---|
| `completed → *`, `cancelled → *` | terminal; repeat completion was P0-5 |
| **provider → `completed` directly** | R-505 — only the customer confirms |
| customer → `confirmed`/`active`/`arrived` | not the customer's states to assert |
| `pending → active` | acceptance must be explicit and recorded |
| any AI transition | Gate 1 has no AI; Gate 2 is Tier B proposal + confirmation |

### Invariants

1. **Exactly-once financial effects** — guarded transition **and** deterministic ledger reference under a unique index. Two independent mechanisms; either would suffice.
2. **`auto_confirm_at` is disclosed when the window starts**, never applied retroactively.
3. **A cancelled booking never settles.** Before capture: void. After capture: refund.
4. **Slot holds expire.** An abandoned `pending` booking must not hold a slot forever — a job releases it.

---

## 3. Machine #2 — Payment (including refund sub-states)

**Scope decision, declared.** `STATE-MACHINES.md` §6 defines a standalone Refund machine; `GATE-1-ARCHITECTURE.md` §5 freezes six machines and Refund is not among them. Refunds are required at Gate 1 (R-608, dispute outcomes).

**Resolution:** refund states are implemented **inside the Payment aggregate**, on a `refund` row, sharing Payment's transaction boundary. It is not promoted to a seventh machine, and no capability is lost. The standalone machine with its own approval workflow is the Gate-2 elaboration.

States: `initiated · authorised · captured · settled · failed · voided · refund_pending · refunded · refund_failed`.

| From → To | Actor | Validation | Side effects | Event |
|---|---|---|---|---|
| — → `initiated` | customer | booking not already paid | gateway session created | — |
| `initiated` → `authorised`+`captured` | **system (IPN)** | **signature verified + server-to-server validation + amount reconciled** | capture posting | `payment.captured` |
| `initiated` → `failed` | system | gateway decline / timeout / abandonment | none | `payment.failed` |
| `authorised` → `voided` | system | booking cancelled before capture | none | — |
| `captured` → `settled` | system | gateway settlement confirmed | settlement posting | — |
| `captured`/`settled` → `refund_pending` | finance | reason; amount ≤ captured | **refund recognition posting** | — |
| `refund_pending` → `refunded` | system | gateway confirms | **refund settlement posting** | `refund.issued` |
| `refund_pending` → `refund_failed` | system | gateway rejects | none | — |
| `refund_failed` → `refund_pending` | finance | bounded retry | none | — |

| Rule | Detail |
|---|---|
| **Only a verified callback advances state** | Server-to-server validation before any change |
| **Amount mismatch ⇒ refuse, alert, no ledger movement** | Never auto-adjust |
| **Redirect endpoints cannot settle** | They are public and unauthenticated; they redirect |
| **Unconfigured gateway in production ⇒ 503** | Never a mock settlement (P0-12) |
| **Timeout is not failure** | Stays `initiated`; reconciliation resolves it against the gateway. The money may have moved |
| **Cash bookings do not enter this machine** | They produce a `payment` row with `method = cash`, state `captured`, at completion (O-02) |

Refund recognition precedes settlement (V-04) — two ledger references, because approval and execution fail independently.

---

## 4. Machine #3 — PayoutClaim

States: `accrued · payable · held · requested · processing · paid_out · failed · reversed`.

| From → To | Actor | Validation | Side effects | Event |
|---|---|---|---|---|
| — → `accrued` | system (`booking.completed`) | — | allocation posting | — |
| `accrued` → `payable` | system (clearance job) | clearance elapsed **and no open dispute** | none | — |
| `accrued`/`payable` → `held` | system (`booking.disputed`) | — | none (no money moved) | — |
| `held` → `payable` | system (`dispute.resolved`, provider's favour) | — | none | — |
| `held` → `reversed` | system (`dispute.resolved`, against) | — | **reversing posting** | — |
| `payable` → `requested` | provider | identity verified | none | — |
| `requested` → `processing` | finance | **re-reads dispute state** (O-03) | none | — |
| `processing` → `paid_out` | system | transfer confirmed | payout posting | — |
| `processing` → `failed` | system | transfer rejected | none | — |
| `failed` → `payable` | system | bounded retry | none | — |

**Deviation from `STATE-MACHINES.md` §8, declared.** That document's `processing` means *included in a payout batch*; `payout_batch` is deferred (S-10). At Gate 1 a payout executes individually and **`processing` means "transfer submitted to the provider's channel"**. No state is removed; only its trigger differs. When batching arrives, `payout_batch` becomes the trigger and no state changes.

**`requested → processing` re-reads dispute state at execution time** rather than trusting the claim's `held` flag — the belt-and-braces guard from O-03. `reversed` posts a reversing transaction; it never deletes the accrual.

---

## 5. Machine #4 — VerificationCase

States: `not_submitted · submitted · under_review · verified · rejected · more_info · expired · revoked`.

| From → To | Actor | Validation | Side effects | Event |
|---|---|---|---|---|
| → `submitted` | subject | ≥1 document uploaded to object storage | — | — |
| `submitted` → `under_review` | trust_safety | assignment | — | — |
| `under_review` → `verified` | trust_safety | **reason recorded** | contact/capability level raised | `identity.verified` / `capability.verified` |
| `under_review` → `rejected` | trust_safety | **reason mandatory** (R-1103) | — | — |
| `under_review` → `more_info` | trust_safety | what is needed and why | — | — |
| `verified` → `expired` | system | validity elapsed | eligibility recomputed | — |
| `verified` → `revoked` | trust_safety | **reason mandatory** | listing suspended | `capability.verified` (revocation) |

| Rule | Detail |
|---|---|
| **Decisions are Tier C** | Human only. AI may never decide, at any tier |
| **Sealed** | Documents never enter AI context (R-706) |
| **Every document read is audited with a reason** | Even though nothing changes (V-07) |
| Expiry is not a penalty | It is a re-verification prompt |

---

## 6. Machine #5 — Dispute

States: `raised · evidence · under_review · resolved · closed`. Outcomes: `refund_full · refund_partial · no_action · provider_penalty`.

| From → To | Actor | Validation | Side effects | Event |
|---|---|---|---|---|
| → `raised` | customer, provider | reason; booking in a disputable state | **`booking.disputed` published — Finance holds the funds** | `booking.disputed` |
| `raised` → `evidence` | system | both parties invited; SLA set | — | — |
| `evidence` → `under_review` | system | SLA elapsed or both submitted | — | — |
| `under_review` → `resolved` | trust_safety | **decision + reason** | outcome executed: refund or release | `dispute.resolved` |
| `resolved` → `closed` | system | appeal window elapsed | — | — |

**Funds are held from `raised`, and Booking does not write the hold.** Booking owns the dispute and publishes; Finance owns the hold and applies it on the event (O-03). At Gate 1 this is a manual admin process writing to these same records — the workflow is real even though the tooling is minimal. Appeals are Gate 2.

---

## 7. Machine #6 — EmergencyRequest

States: `received · acknowledged · in_progress · resolved · closed`.

| From → To | Actor | Side effects | Event |
|---|---|---|---|
| → `received` | any authenticated | **`admins_reachable` computed and returned**; admin room notified | `emergency.raised` |
| `received` → `acknowledged` | emergency_responder | `emergency_ack` row — **who actually saw it** | — |
| `acknowledged` → `in_progress` | emergency_responder | — | — |
| → `resolved` / `closed` | emergency_responder | outcome recorded | — |

| Rule | Detail |
|---|---|
| **There is no `dispatched` state** | IMAP has no dispatch capability. Adding it would put a lie in the schema (D-012, D-013) |
| **The response reports how many admins were reachable** | Not a generic acknowledgement |
| **On any failure the hotline is surfaced** | The single most important behaviour in the product |
| Sealed | Never in AI context (R-1005) |
| A provider may raise one mid-booking | R-1010 — booking reference and location attached |

---

## 8. Guarded enums — the same discipline, no machine

Ten states use the same guarded-update pattern without a machine abstraction, because they have no side effects beyond the update and no role-differentiated transitions worth tabulating.

`provider.state`¹ · `availability_hold.state` · `review.state` · `message` delivery · `job.state` · `outbox_event.state` · `identity_document` type · `contact_verification` level · `notification.state` · `emergency severity`.

¹ **Provider listing is the exception worth naming.** `STATE-MACHINES.md` §2 models nine states and D-005 makes `applied → listed` the audited defect. It is implemented as a **guarded enum with a transition table and the same `affectedRows` check** — the discipline of a machine without the abstraction. `applied → listed` is a test, not a comment.

---

## 9. Cross-machine consistency

| Rule | Enforced where |
|---|---|
| A booking cannot complete while its payment is `refund_pending` | guard in `ConfirmCompletion` |
| A payout claim cannot be `payable` while its booking is disputed | guard in the clearance job **and** re-read at execution |
| A provider cannot be `listed` while verification is `rejected` or `revoked` | `capability.verified` consumer in marketplace |
| A review cannot exist without a completed booking by that customer | already enforced today; test carried forward |
| An emergency request never blocks or alters a booking transition | contexts isolated; test |
| **Every terminal transition emits exactly one event** | outbox, in-transaction |
| **Every guarded transition checks `affectedRows`** | the shared `transition()` helper — there is no other way to change a state |

---

## 10. Tests

| Class | Requirement |
|---|---|
| **Legal transitions** | Every one succeeds with the right actor in the right state |
| **Illegal transitions** | **Every one is refused.** The full matrix, not a sample |
| **Terminal states** | No transition out of `completed`, `cancelled`, `paid_out`, `resolved` |
| **Actor restriction** | Each transition rejects every other actor relation — especially provider → `completed` |
| **Concurrency** | Two simultaneous identical transitions: exactly one succeeds, one raises `ConcurrentTransition` |
| **Atomicity** | Side effects, audit and event all roll back with a failed transition |
| **Reason enforcement** | Transitions requiring a reason fail without one, **before** any state change |
| **Auto-confirm disclosure** | `auto_confirm_at` is returned by `report_done` and never changes afterwards |

The illegal-transition matrix is the highest-value test set in the plan. Phase 0 found bookings advancing through unguarded `UPDATE`s, and that is a category of defect that only a full matrix catches.
