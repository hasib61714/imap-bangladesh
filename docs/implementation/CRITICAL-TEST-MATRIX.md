# IMAP 2.0 — Critical Test Matrix

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Companion to:** `TEST-IMPLEMENTATION-MAP.md`

Every row: **requirement → test → layer → expected result → what happens if it is absent.**
The last column is the point. A test whose absence has no consequence does not belong here.

`E` exists and passes today · `N` new.

---

## 1. Authentication

| # | Requirement | Test | Layer | Expected | If absent |
|---|---|---|---|---|---|
| 1 | P0-1 | A principal with **no credential row** never authenticates | unit | 401 | **Anyone logs in as anyone with a blank password** | E |
| 2 | P0-1 | Wrong password and unknown user are timing-indistinguishable | unit | equal timing, dummy hash compared | User enumeration | E |
| 3 | P0-2 | `POST /auth/social-login` returns `410` | contract | 410 | **A client-supplied id becomes an identity** | E |
| 4 | R-410 | Google login requires a server-verified token, checked audience, `email_verified` | integration | 401 otherwise | Forged identity | N |
| 5 | AD-017 | Role cannot be set via registration, profile update or mass assignment | security | role ignored | **Self-promotion to admin** | N |
| 6 | — | Role read from the database, not the token | integration | revoked role denies now | A revoked admin stays admin until expiry | N |
| 7 | — | Revoked session rejected immediately | integration | 401 | Revocation is cosmetic | N |
| 8 | — | Refresh rotation invalidates the used token | integration | 401 on reuse | Replayable refresh | N |
| 9 | V-01 | OTP never in a response outside development-like environments | security | absent | **OTPs leak for real users** | E |
| 10 | — | OTP rate-limited per phone **and** per IP | integration | 429 | SMS-cost attack; account harassment | N |
| 11 | — | Every authentication attempt writes an audit record | integration | row exists | **`CREDENTIAL-INCIDENT.md` §2 stays unanswerable** | N |

---

## 2. Authorization

| # | Requirement | Test | Layer | Expected | If absent |
|---|---|---|---|---|---|
| 12 | §3 | Every policy: permit · deny-by-role · deny-by-relationship · deny-by-condition | unit | 4 outcomes | Policies asserted, never exercised | N |
| 13 | §2 | **A use case with no policy fails at startup** | unit | boot throws | **An unguarded endpoint ships** | N |
| 14 | §3 | **A policy with no resource is rejected at registration** | unit | throws | The audited role-only check returns | N |
| 15 | §8 | Non-owner denied on every action of every resource type | security | 403/404 | Cross-tenant read | N |
| 16 | §8 | `404` and `403` byte-identical for unauthorised vs non-existent | contract | identical | **Id enumeration** | N |
| 17 | §5 | Denied over HTTP ⇒ denied over socket | security | parity | A transport bypasses the kernel | N |
| 18 | §7 | Same-actor approve-then-execute writes `sod_bypass` | integration | flag present | The exception becomes invisible | N |
| 19 | — | Denials on sensitive actions audited | integration | row exists | Attempted access unobservable | N |

---

## 3. Money authority

| # | Requirement | Test | Layer | Expected | If absent |
|---|---|---|---|---|---|
| 20 | P0-3, R-601 | **Client-supplied amount ignored at every money endpoint** | contract | server value used | **A customer sets their own price** | E→ext |
| 21 | R-304 | Booking without a resolvable price fails closed | integration | 409 | Bookings with no price | E |
| 22 | — | Expired quote refused | integration | 422 | Stale prices honoured indefinitely | N |
| 23 | P0-4, R-602 | Negative · NaN · Infinity · `"1e999"` · array · object · over-cap rejected | unit | 422 | Negative payments credit the payer | E |
| 24 | AD-008 | Currency mixing throws | unit | throws | Silent cross-currency arithmetic | N |
| 25 | D-009 | `PLATFORM_FEE_PCT=0` produces no commission entries | unit | none | Phantom zero-amount rows | N |

---

## 4. Ledger invariants

| # | Requirement | Test | Layer | Expected | If absent |
|---|---|---|---|---|---|
| 26 | L1 | Unbalanced transaction throws **before any write** | unit | throws | **A half-applied money movement can exist** | N |
| 27 | L1 | All 8 worked flows balance | integration | Σdr=Σcr | The architecture is unimplementable as written | N |
| 28 | L3, P0-5 | Duplicate reference posts once | integration | 1 transaction | **Double payout** | E→ext |
| 29 | L3 | **Two concurrent identical postings: exactly one wins** | integration | 1 transaction | Double credit under load — invisible to manual testing | N |
| 30 | L2 | No `UPDATE`/`DELETE` path on `ledger_entry` | unit + grant | absent | It is a log, not a ledger | N |
| 31 | L4 | Derived balance equals stored after every operation | integration | equal | `users.balance` unreconcilable, again | N |
| 32 | L4 | Rebuild from entries reproduces the projection exactly | integration | equal | The projection has become authoritative | N |
| 33 | L8, D-010 | **`customer_liability` has zero entries after the full suite** | integration | 0 | **A legally gated capability is silently live** | N |
| 34 | V-04 | Refund recognition precedes settlement | integration | order | An approved refund is an invisible liability | N |
| 35 | — | Refund exceeding captured amount refused | integration | 422 | Over-refund | N |

---

## 5. Idempotency

| # | Requirement | Test | Layer | Expected | If absent |
|---|---|---|---|---|---|
| 36 | AD-010 | Replayed key returns the stored response, no second effect | contract | identical | Double booking, double charge | N |
| 37 | AD-010 | Replay with a different body ⇒ 409 | contract | 409 | Key reuse silently succeeds | N |
| 38 | AD-024 | **A job with no idempotency declaration throws at registration** | unit | throws | **A retried job repeats an external side effect** | N |
| 39 | AD-024 | Duplicate enqueue is a no-op returning the existing job | integration | same id | Duplicate SMS, duplicate payout | N |
| 40 | AD-024 | Retry reuses the **effect token** | integration | same token | Every retry is a fresh request to the provider | N |
| 41 | AD-024 | Timeout never marked failed | integration | stays pending | **A paying customer marked unpaid** | N |
| 42 | B1 | Consumer handles a duplicate event once | integration | 1 effect | At-least-once delivery becomes at-least-twice effect | N |

---

## 6. Booking state transitions

| # | Requirement | Test | Layer | Expected | If absent |
|---|---|---|---|---|---|
| 43 | §4.1 | Every legal transition succeeds with the right actor | unit | ok | — | E→ext |
| 44 | §4.2 | **Every illegal transition refused** — full matrix | unit | throws | **Bookings advance through unguarded updates** (the audited defect) | E→ext |
| 45 | §4.2 | Terminal states are terminal | unit | throws | P0-5 returns | E |
| 46 | **R-505** | **Provider cannot reach `completed`** | integration | 403 | **A provider marks their own work done and is paid** | N |
| 47 | §4.3 | Two concurrent transitions: exactly one wins | integration | 1 winner | Double financial effect | N |
| 48 | §4.3 | `auto_confirm_at` set at `report_done` and never changes | integration | immutable | A deadline applied retroactively | N |
| 49 | AD-009 | Side effects, audit and event roll back together | integration | atomic | A state change with no record | N |
| 50 | R-207 | **Two concurrent slot holds: exactly one succeeds** | integration | 1 winner | **Double-booking — currently unpreventable** | N |

---

## 7. Audit atomicity

| # | Requirement | Test | Layer | Expected | If absent |
|---|---|---|---|---|---|
| 51 | AD-009 | **A state change with no audit record fails the transaction** | integration | rollback | Silent state changes | N |
| 52 | AD-009 | Audit rolls back with its change | integration | neither | Audit records for changes that never happened | N |
| 53 | §3.1 | `before`/`after` contain changed fields only | unit | diff only | The log becomes a second copy of the database | N |
| 54 | §3.1 | No Sensitive/Financial/Emergency value in a payload | unit | absent | Sensitive data spreads to every ops reader | N |
| 55 | §6 | No `UPDATE`/`DELETE` path — repository and grant | unit + grant | fails | **Not an audit log** | N |
| 56 | R-1103 | `reason` required for punitive actions, **before** the change | integration | 403 | Unappealable decisions | N |
| 57 | §8 | Reading the audit log writes an audit record | integration | row | The most sensitive read is the only unrecorded one | N |
| 58 | V-07 | Every Sealed document read is audited **though nothing changed** | integration | row | Undetectable identity-document access | N |

---

## 8. Realtime authorization

| # | Requirement | Test | Layer | Expected | If absent |
|---|---|---|---|---|---|
| 59 | P0-7 | Non-participant cannot join a booking room | integration | denied | **Any user watches any booking** | E |
| 60 | P0-7 | Participant joins only their own booking | integration | denied | — | E |
| 61 | P0-7 | Tokenless socket joins nothing | integration | 0 rooms | Anonymous surveillance | E |
| 62 | P0-7 | `location_update` from an unauthorized socket dropped | integration | dropped | Location spoofing | E |
| 63 | P0-7 | Only the assigned provider may publish a location | integration | dropped | Location spoofing | E |
| 64 | P0-8 | Only a DB-verified admin joins the ops room | integration | denied | **Emergency data to any client** | E |
| 65 | P0-8 | SOS goes to the ops room, never to all sockets | integration | 1 room | **Emergency broadcast to every connection** | E |
| 66 | — | Location outside `active`/`arrived` dropped | integration | dropped | Location shared beyond its purpose | N |
| 67 | — | Terminal state evicts every socket | integration | empty | Live channel on a closed booking | N |
| 68 | — | Reconnect re-authorizes | integration | denied | A suspended provider keeps access | N |
| 69 | — | No emission for a rolled-back transaction | integration | none | Clients told about changes that did not happen | N |
| 70 | — | One connection per user | frontend | 1 | Doubled connection cost — **two exist today** | N |

---

## 9. Emergency truthfulness

| # | Requirement | Test | Layer | Expected | If absent |
|---|---|---|---|---|---|
| 71 | R-1003 | **No emergency outcome claimed without server evidence** | integration | truthful | **Someone in danger believes help is coming** | E |
| 72 | R-1002 | Capability statement served as data, before any input | contract | present | Copy and behaviour drift apart | N |
| 73 | §11 | **No `dispatched` state exists anywhere** | unit | absent | A lie in the schema | N |
| 74 | — | Response reports **actual** admin reachability | integration | real count | A generic acknowledgement implying a response | N |
| 75 | R-1001 | **Failure surfaces the hotline** | E2E | 999 shown | **The worst outcome this system can produce** | N |
| 76 | D-013 | Donor contact release is authenticated, one at a time, logged | integration | row | Bulk harvesting of volunteer numbers | E |
| 77 | R-1009 | Only verified hotlines are served | integration | verified only | Someone calls a number that belongs to nobody | N |
| 78 | R-1010 | A provider can raise an emergency mid-booking with context | integration | attached | Two-sided safety gap | N |

---

## 10. Payment

| # | Requirement | Test | Layer | Expected | If absent |
|---|---|---|---|---|---|
| 79 | P0-12 | **Unconfigured gateway in production ⇒ 503, never settlement** | integration | 503 | **Free wallet credit** | E |
| 80 | P0-5 | Duplicate IPN credits once | integration | 1 credit | Double credit | E |
| 81 | — | **Two concurrent IPNs credit once** | integration | 1 credit | Double credit under load | N |
| 82 | §5 | Amount mismatch refuses, no ledger movement | integration | refused | Underpayment accepted as full | E |
| 83 | §5 | Redirect endpoint cannot settle | contract | no change | **Anyone with the URL settles a payment** | E |
| 84 | §5 | Timeout leaves `initiated` | integration | pending | A paying customer marked unpaid | N |
| 85 | O-02 | Cash completion creates a `payment` row | integration | exists | Two authorities for payment status | N |
| 86 | O-03 | Disputed claim cannot be paid out | integration | blocked | **Disputed funds leave the platform** | N |
| 87 | O-03 | Clearance re-reads dispute state at execution | integration | blocked | Race between dispute and payout | N |

---

## 11. Frontend truthfulness

| # | Requirement | Test | Layer | Expected | If absent |
|---|---|---|---|---|---|
| 88 | U1 | **No component imports a fabricated constant** | lint + unit | none | **The defining defect returns** | N |
| 89 | U1 | Every list surface renders a real empty state | component | empty state | Empty renders as fabricated rows | N |
| 90 | U1 | Skeletons do not resemble content | visual | distinct | Placeholder mistaken for data | N |
| 91 | AD-008 | Money renders from `{amount_minor, currency}` | unit | throws on a bare number | The currency assumption returns | N |
| 92 | D-008 | `StatusBadge` without evidence throws | unit | throws | Unevidenced state claims | N |
| 93 | A-07 | Modals trap and restore focus | unit | trapped | Keyboard users lost | N |
| 94 | A-01 | Core loop keyboard-completable | E2E | complete | Excluded users | N |
| 95 | §7 | Bundle budget per entry | CI | within | The 150 KB budget is aspirational | N |
| 96 | §7 | **Consumer bundle contains no `antd`** | CI | absent | 135 KB in every consumer load | N |

---

## 12. Coverage

| Class | Rows | Exist | New |
|---|---:|---:|---:|
| Authentication | 11 | 4 | 7 |
| Authorization | 8 | 0 | 8 |
| Money authority | 6 | 3 | 3 |
| Ledger | 10 | 1 | 9 |
| Idempotency | 7 | 0 | 7 |
| State transitions | 8 | 3 | 5 |
| Audit | 8 | 0 | 8 |
| Realtime | 12 | 7 | 5 |
| Emergency | 8 | 3 | 5 |
| Payment | 9 | 5 | 4 |
| Frontend | 9 | 0 | 9 |
| **Total** | **96** | **26** | **70** |

**Every one of the 12 Phase 0 P0 findings, and every Phase 2.5 defect (V-01, V-03, V-04, V-05, O-01, O-02, O-03), appears in at least one row.**

The three rows most likely to be skipped and most valuable: **29** (concurrent ledger postings), **33** (`customer_liability` has no entries — the only automated check that a legally gated capability has not been quietly enabled), and **51** (a state change with no audit record fails).
