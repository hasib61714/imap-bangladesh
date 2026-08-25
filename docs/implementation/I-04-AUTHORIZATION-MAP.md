# IMAP 2.0 — I-04 Authorization Map

**Status:** IMPLEMENTATION RECORD · **Phase:** 4 / I-04 · **Date:** 2026-08-09
**Required by:** I-04 §5, §9, §10, §22, §23, §37, §38 · **Governed by:** `AUTHORIZATION-ARCHITECTURE.md`, `AUTHORIZATION-IMPLEMENTATION-PLAN.md`, AD-017

---

## 1. What replaced what

Three authorization implementations existed. There is one.

| Was | Where | Now |
|---|---|---|
| `requireRole("admin")` | `middleware/auth.js`, 13 call sites in 6 route files | **deleted**; each endpoint declares an action |
| Inline `if (req.user.role === "admin")` | `kyc.js`, `chat.js` ×2 | **deleted**; the kernel decides |
| `?='admin'` inside a WHERE clause | `payments.js`, `upload.js` | **deleted**; ownership is loaded, not filtered |
| `utils/bookingAccess.js` | booking + socket | **kept as the socket adapter**, now asking the kernel |

`scripts/check-boundaries.js` gained `no-adhoc-authorization` at **error** severity, so none of the first three can return. Its seven fixtures are verbatim copies of the code above.

---

## 2. The kernel

```
authorize(actor, action, resourceRef, ctx) → permit | deny(reason)
```

| # | Step | On failure |
|---|---|---|
| 1 | policy for the action | `policy_denied` |
| 2 | the actor is an actor | `unauthenticated` / `no_membership` |
| 3 | role could plausibly permit | `missing_permission` |
| 4 | resource **loaded from the database** | `not_found` |
| 5 | relationship to *this row* | `not_owner` / `wrong_account` |
| 6 | conditions — state, time, verification | `invalid_state` |
| 7 | a stated reason, where required | `reason_required` |

**Every exit above the final line is a deny.** Not by intention — structurally: there is no `return permit` anywhere else in the function, so no early return can accidentally allow. A missing policy, a loader that throws, a relationship predicate that throws: all land on deny.

Role before resource, because it is cheap and the resource loads only if the role could plausibly permit. A test asserts the database is not touched when the role gate closes.

### 2.1 `authorizeLoaded` — the second question about one row

Reading a booking and reading its completion OTP are two decisions about the same row. Loading it twice is the N+1 §36 warns about.

`authorizeLoaded(actor, action, resource, ctx)` re-authorizes against a row the caller already holds. It would be a hole if any object could be passed to it — the request body would be back inside the decision — so the row must carry a **non-enumerable symbol that only `loadResource` stamps**, and its `type` must match the policy's. A forged object is denied; a real row that has been through `JSON.parse(JSON.stringify(...))` is denied. Three tests hold that shut.

---

## 3. Roles

**Ten actor roles. `admin` is not one of them.**

| Kind | Roles |
|---|---|
| Not grantable | `anonymous`, `system` |
| Account | `customer`, `provider` |
| **Platform (the six)** | `support`, `finance`, `trust_safety`, `operations`, `emergency_responder`, `platform_owner` |

Deferred: `org_member` / `org_approver` / `org_admin` — marked LATER in `AUTHORIZATION-ARCHITECTURE.md` §7 and **not** created (§10: do not invent roles the architecture defers).

`system` cannot arrive from a request. The legacy adapter maps three enum values and none produces it; a test asserts that.

---

## 4. The legacy boundary (§22)

`users.role` is interpreted in **exactly one file**: `src/modules/platform/authorization/legacy.js`. A boundary rule fails the build if a platform-role literal is compared anywhere else.

| `users.role` | Grant | Note |
|---|---|---|
| `customer` | `[customer]` | |
| `provider` | `[provider]` | **Not** also `customer`. The account model gives one person both; granting it here would widen live access, which is a cutover |
| `admin` | **all six platform roles** | The Gate-1 grant |
| NULL / anything else | `[]` | Fails closed. Not downgraded to `customer`, never `admin` |
| `is_active ≠ 1` | anonymous | P1-11: `-1` is truthy, so only a strict `1` is active |

### 4.1 The mapping is total, and it is not a guess

`migrations/001_baseline.sql` declares `role ENUM('customer','provider','admin')` — verified, not assumed. Three values plus NULL, and the mapping covers all four. §10 requires a STOP on an ambiguous legacy role; there is none to stop on, because the database has been refusing anything else since the schema was created.

### 4.2 Why `admin` becomes all six

Not "admin means everything". Each of the six is exercised by an endpoint `requireRole("admin")` guarded:

| Role | Endpoints that needed it |
|---|---|
| `support` | `/admin/complaints`, `/admin/bookings` |
| `finance` | `/payments/admin/all`, `/admin/revenue`, `/loans/admin` |
| `trust_safety` | `/admin/kyc`, `/kyc/:id` |
| `operations` | `/services`, `/admin/providers`, `/admin/promos` |
| `emergency_responder` | `/sos` |
| `platform_owner` | `/admin/users/:id` role change, `/admin/settings` |

Granting fewer breaks operations today. Granting one opaque `admin` is the anti-pattern. Granting all six, **named**, means the day a second operator exists the tightening is a membership change and this file does not move.

### 4.3 Fail-closed has a cost, and it is stated

An authenticated user whose `users.role` is NULL or unrecognised now holds **nothing** and is refused. Before, participation checks were role-independent and such a user could read their own booking.

`users.role` is nullable, its default is `customer`, and no code path writes NULL — `auth.js`, `resetAdmin.js` and `seedDemo.js` all pass a value. So this should affect no live row. It is recorded rather than assumed because "should" is not "does", and the only way to know is to look at production, which I-04 may not do. **Owner check.**

### 4.4 The audit log records `admin`, not one of the six

`actor_role` is the role **as held**. For a Gate-1 administrator that is the legacy string, and the mismatch between it and the six-role grant, visible in every record, *is* the limitation.

---

## 5. The register — 37 policies

Every one names a resource, a permission verb from the twelve, a cardinality, a tier and an audit rule. A policy with no resource is **rejected at registration**; an instance policy with no relationship and a collection policy with no scope are rejected too, because naming a resource and never comparing the actor to it is the same defect wearing a resource type.

### identity

| Action | Roles | Card. | Tier | Audit | Notes |
|---|---|:--:|:--:|---|---|
| `user.list` | support, operations, trust_safety, platform_owner | coll | B | on_deny | |
| `membership.grant` | **platform_owner** | inst | C | required | **SOD**, reason required when self-directed |
| `account.set_status` | trust_safety, platform_owner | inst | C | required | **SOD**, condition: no self-suspension |
| `verification.list` | trust_safety, operations | coll | B | on_deny | metadata only; no images |
| `verification.read_document` | **trust_safety** | inst | C | **required** | Sealed; V-07 — every read is a record |
| `verification.decide` | **trust_safety** | inst | C | required | **SOD**; see §5.1 |

### booking

| Action | Roles | Card. | Tier | Audit | Notes |
|---|---|:--:|:--:|---|---|
| `booking.observe` | customer, provider, support | inst | A | none | participant |
| `booking.read_completion_otp` | customer, support | inst | A | none | **customer only** — see §9 |
| `booking.transition` | customer, provider, support | inst | B | on_deny | no state condition — §6 |
| `booking.attach_proof` | customer, provider, support | inst | B | on_deny | condition: active or completed |
| `message.read` | customer, provider, support | inst | A | none | |
| `message.send` | customer, provider, support | inst | B | on_deny | **shadow condition** — §7 |
| `booking.list_all` | support, operations, platform_owner | coll | B | on_deny | |

### marketplace · finance · platform

| Action | Roles | Card. | Tier |
|---|---|:--:|:--:|
| `provider.list_all` | operations, trust_safety, platform_owner | coll | B |
| `service.create` / `.update` / `.delete` | operations | coll / inst / inst | C |
| `payment.observe` | customer, provider, finance | inst | A |
| `payment.read_all` · `revenue.read` | finance (+platform_owner) | coll | C / B |
| `loan.read_all` · `loan.decide` | finance | coll / inst | C |
| `emergency.list` · `emergency.update` | emergency_responder | coll / inst | C |
| `complaint.list` · `complaint.resolve` | support, trust_safety | coll / inst | B |
| `promo.list` / `.create` / `.update` / `.delete` | operations (+finance on list) | | B / C |
| `notification.broadcast` · `announcement.list` | operations, platform_owner (+support) | coll | C / A |
| `setting.read` · `setting.update` | platform_owner (+operations on read) | coll | B / C |
| `stats.read` | support, operations, finance, platform_owner | coll | A |
| `analytics.read` · `diagnostic.read` | operations+platform_owner / platform_owner | coll | B / C |

### 5.1 A documented conflict, registered narrow — **OWNER DECISION**

| Source | Who may decide a verification case |
|---|---|
| `AUTHORIZATION-ARCHITECTURE.md` §3.1 | trust&safety, **operations** |
| `AUTHORIZATION-IMPLEMENTATION-PLAN.md` §5 | trust_safety, **operations** |
| `DOMAIN-ARCHITECTURE.md` §6 | operations "**may not** make verification decisions" |

§46 makes this an owner decision, so it is **not resolved here**. It is registered at the narrower reading — `trust_safety` only — which changes nothing live, because the Gate-1 administrator holds both. Fail closed while the question is open.

### 5.2 Why the register is 37 and not 84

The plan's §5 register covers Gate 1 in full. Most of those actions name use cases that do not exist: `booking.confirm_completion` has no `awaiting_confirmation` state to condition on, `payout.execute` has no payout. **Registering a policy for a use case that cannot be called produces a register that looks complete and guards nothing**, and it would make the startup completeness assertion meaningless. Every one of the 37 has a live call site today.

---

## 6. Authorization is not the state machine (§19)

`booking.transition` carries **no state condition**, and a test asserts `policy.conditions === null`.

| Question | Answered by |
|---|---|
| May this actor attempt a transition on this booking? | the kernel |
| Is `active → completed` legal, and may this side make it? | `utils/bookingState.js` |

Both are enforced. A test drives a customer through `active → completed`: the kernel permits (they are a participant, the transaction opens) and the machine refuses (403), and no money moves. Copying the transition table into a policy would create two answers that drift.

`booking.attach_proof` **does** carry a state condition, because attaching a photo is not a transition and no machine covers it — and evidence attached to a cancelled booking is evidence for an event that did not happen.

---

## 7. Shadow evaluation (§23, §24)

**Whole-policy shadow mode: NOT REQUIRED.** `AUTHORIZATION-IMPLEMENTATION-PLAN.md` §8 prescribes direct replacement — "deleting the old check in the same commit… never two live checks for one action" — because the legacy adapter makes the kernel's decision provably equivalent. Dual-read belongs to the *identity* cutover (I-03), not here.

**Condition-level shadow: IMPLEMENTED, one policy.**

| | |
|---|---|
| Policy | `message.send` |
| Architecture says | plan §5: conditioned on the booking not being terminal |
| Live system does | allows messaging in every state |
| Effective decision | **legacy — permit** |
| Recorded | a mismatch, in the log and in `audit_log` |

It is structurally incapable of denying: `evaluateShadow` is called on an already-constructed permit and its return value is attached to it. There is no path from that function to a `deny`. A test walks all five booking states and asserts a permit every time.

Switching it on would stop people messaging about a job that has just finished — a product change, not an authorization fix. **Owner decision.**

---

## 8. Negative controls (§38) — 15 of 15 detected

Each lever was reverted, the failure observed, and the file restored and verified byte-identical.

| # | Reverted | Result |
|---|---|---|
| NC-1 | the `spec.resource` check in `registry.js` | 2 failing |
| NC-2 | unregistered action denies → permits | 2 failing |
| NC-3 | `bookingParticipantOrPlatform` returns `true` (P0-7) | 8 failing |
| NC-4 | OTP relationship → participant | 2 failing |
| NC-5 | the state condition on `booking.attach_proof` | 2 failing |
| NC-6 | `sameActor` on `verification.decide` | 2 failing |
| NC-7 | unknown legacy role → `[customer]` | 4 failing |
| NC-8 | `membership.grant` roles → all six | 2 failing |
| NC-9 | `AND m.revoked_at IS NULL` | 2 failing |
| NC-10 | `rows.find(byAccount)` → `rows[0]` | 4 failing |
| NC-11 | the loaded-from-database check in `authorizeLoaded` | 4 failing |
| NC-12 | the `when` predicate on `membership.grant` | 6 failing |
| NC-13 | deny message keyed by reason instead of status | 2 failing |
| NC-14 | shadow evaluation made able to throw | 3 failing |
| NC-15 | the privilege-change audit moved outside its transaction | 20 failing |

### 8.1 What NC-4 found

`booking.read_completion_otp` lists `roles: [customer, support]` **and** requires the customer relationship. The relationship's removal initially failed nothing, which looked like redundancy.

It is not. `POST /api/providers/apply` creates a `providers` row and **never touches `users.role`** — so a person who signed up as a customer and later applied is a provider whose legacy role is `customer`. They pass the role gate. Only the relationship stops them reading the completion OTP for their own job, which is the customer's proof that the work was delivered.

That case now has a test. The control found a real gap in coverage, which is what it is for.

---

## 9. Behaviour changes, all in the same direction

Nobody gains or loses access: the Gate-1 administrator holds all six roles, so every endpoint that answered them still does, and every endpoint that refused a customer still refuses. What changed:

| Endpoint | Was | Now | Why |
|---|---|---|---|
| `PATCH /admin/users/<no such id>` | `200 {success:true}` | `404` | the UPDATE matched zero rows; an operator could believe they had suspended an account they had not |
| `PUT /services/<no such id>` | `200 {success:true}` | `404` | same |
| `DELETE /admin/promos/<no such id>` | `200 {success:true}` | `404` | same |
| `PATCH /admin/users/:id` self-deactivation | `400` | `409` + same message | a state conflict per API-ARCHITECTURE §4.1; the message is preserved |
| `PATCH /admin/users/:id` self-role-change | permitted, unrecorded | requires a written `reason`; flagged `sod_bypass` | R-1103 |
| **`POST /upload/proof` as the assigned provider** | `200`, wrote nothing | `200`, **writes** | see §9.1 |
| `POST /upload/proof` unauthorized | `200`, wrote nothing | `403` | it said it worked |
| `POST /upload/proof` on a cancelled booking | `200` | `409` | §18 |
| an authenticated user with no recognisable role | treated as a participant | `403` | §4.3 |

### 9.1 An authorization check that did not work, and said it did

```sql
UPDATE bookings SET completion_proof=? WHERE id=? AND (customer_id=? OR ?='admin')
```

The assigned **provider** is the person who takes a completion photo, and that clause excludes them. The UPDATE matched zero rows and the endpoint answered `200` with the uploaded URL — so the provider saw success and the booking carried no proof. An unauthorized caller got the identical answer, so neither case was visible from outside.

Verified against the route, not inferred.

---

## 10. Response safety (§34)

Deny reasons are a fixed enum, recorded internally and never returned. Messages are keyed by **status**, not by reason:

> Keying them by reason was the first attempt, and it reintroduced the oracle it was meant to close. `not_owner` and `not_found` both answered 404 — but one said "Access denied" and the other "Not found", so the body distinguished exactly what the status was chosen not to.

One exception, and only for `invalid_state`: a policy may declare a `conditionMessage`. A *relationship* denial must stay opaque, because saying "this belongs to someone else" confirms the resource exists. A *condition* denial names a state the actor already knows — "You cannot deactivate your own account" tells an operator nothing they did not just type.

### 10.1 The enumeration oracle on `/api/*` — **NOT CLOSED**

`CRITICAL-TEST-MATRIX` row 16 wants 404 and 403 byte-identical. `/api/*` answers **403** when a resource exists and the caller may not see it, and **404** when it does not. That is an oracle for booking, kyc, complaint, promo, service, loan and emergency ids.

Closing it changes responses the current frontend and the existing P0-7/P0-8 tests both depend on. That is a product decision with an owner, not a side effect of building a kernel.

The mechanism exists and is tested: `statusMode: "indistinguishable"` collapses everything to 404. **36 policies are pinned to `legacy`, one — `payment.observe` — uses the target mapping**, because that endpoint already answered 404 for both cases. A test asserts the exact membership of both lists, so adding a policy to the exception requires editing the test. **Owner decision.**

---

## 11. Audit (§25, §26, §27)

Purposeful, not an access log.

| Policy says | Recorded |
|---|---|
| `required` | every decision — Sealed reads, privilege changes, money decisions |
| `on_deny` | denials only |
| `none` | neither — `booking.observe` runs on every page view |

Two things are recorded **regardless of the policy**, because both are facts about the controls rather than about the request: a separation-of-duties bypass, and a shadow mismatch.

Migration `008` adds `sod_bypass TINYINT(1) NOT NULL DEFAULT 0` with `idx_sod`, and `deny_reason VARCHAR(40)`.

> "Counting the exception is the point. An unenforceable control that is invisible is worse than one that is enforced later, because nobody knows how often it mattered." — plan §6

Counting requires a predicate. A marker buried in `reason` — which is free text a human supplies under R-1103 — would make both unqueryable. `NOT NULL DEFAULT 0` so that "no bypass" and "not recorded" are different values.

**§27, atomicity.** A denial changes no state, so there is no transaction to join and none is invented. The two live state changes that must be atomic with their record — a role grant and a verification decision — call `writeAudit(conn, …)` inside their own transaction. A test reads the query order and asserts `BEGIN < UPDATE < INSERT INTO audit_log < COMMIT`.

The socket layer's speculative admin-room check is **deliberately not audited**: it runs on every connection, and recording each denial would write a row every time an ordinary user opens the app. Nobody attempted anything.

---

## 12. Membership and account isolation (§13, §14) — built, not live

`users.role` remains the authorization source. `membership` is populated by `scripts/backfill-identity.js`, which has not been applied, so `resolveActor()` is called by nothing on the request path.

Fifteen tests against MariaDB 12.2.2 prove the model, because these are properties of the database:

| Case | Result |
|---|---|
| live membership | the role the table holds, and only that |
| no membership | `no_membership` |
| revoked membership | excluded **in SQL**, so the row is never in memory to be used by mistake |
| revoked vs never-held | byte-identical results |
| suspended account | `account_disabled` |
| suspended principal | `account_disabled` — acting for a live account does not revive them |
| unknown role string | `no_membership` — a data defect, not a licence |
| **member of A asking for B** | `wrong_account` |
| two accounts, none named | **`wrong_account`** — see below |
| three accounts | one query (§36) |

**Ambiguity denies rather than choosing.** The two implicit rules available are "the first row", which is ordering-dependent, and "the most capable", which is privilege escalation with a friendly name.

---

## 13. Transport parity (row 17)

`utils/bookingAccess.js` keeps its name and its return shape and now asks the kernel. `realtime.js` is untouched (§42) and follows automatically, so "denied over HTTP implies denied over socket" is structural rather than two implementations that agree until one is edited. A test walks four actor kinds through both paths and compares.

`realtime.js` lost its one inline comparison: admission to the emergency room is now the same question as `GET /api/sos`.

The `role` returned by `getParticipation` is the **participant** role — which side of a booking an actor is on. It shares the word `admin` with the legacy column and is not an authorization role; `bookingState.js` and `realtime.js` are exempt from the boundary rule by name for that reason.

---

## 14. What I-04 deliberately did not do

| | |
|---|---|
| Production cutover | not performed. `users.role` remains authoritative |
| Dual-write week · `JWT_SECRET` rotation · global logout | owner-coordinated (I-03 §32) |
| Business logic | none. No booking completion, payment, refund, payout, ledger or earnings |
| Realtime rebuild | `realtime.js` handlers unchanged (§42) |
| AI | none. Gate 1 remains 0 AI tools |
| Legal features | none (§44) |
| Production database | not touched. `require('./db')` against the real `.env` still throws `EnvironmentSafetyError` |

---

## 15. Open items

### Owner decisions

| # | Item | Blocks |
|---|---|---|
| 1 | **`verification.decide`: may `operations` decide a case?** Three documents, two answers (§5.1). Registered narrow | tightening after a second operator exists |
| 2 | **Close the `/api/*` enumeration oracle?** 403/404 are distinguishable; the mechanism exists and is off (§10.1) | frontend contract |
| 3 | **Enforce `message.send` on terminal bookings?** Recorded as a mismatch, not applied (§7) | product |
| 4 | Confirm no production row has a NULL or unrecognised `users.role` (§4.3) | nothing, if the assumption holds |
| 5 | Platform-role grants for the post-incident administrator | carried from I-03 |
| 6 | Schedule the cutover, including the global logout | carried from I-03 |

### Findings recorded, not acted on

| # | Finding | Phase |
|---|---|---|
| **F-12** | **There is no provider-approval endpoint.** `providers.is_approved` is written by exactly one file in the repository — `scripts/seedDemo.js`. It gates the public directory (`providers.js:26`) and booking itself (`pricing.js:71` throws 409). So `POST /api/providers/apply` succeeds, tells the applicant review takes 24–48 hours, and there is no code path that can ever approve them: **a genuine provider cannot be listed or booked.** Only the demo seed's providers can. Verified by enumerating every occurrence, not inferred | I-10 |
| **F-13** | `GET /api/bookings` and the other own-scoped list endpoints scope by `WHERE customer_id = ?` rather than through a collection policy. Correct today, and outside the ad-hoc-authorization rule because it compares an id rather than a role | I-11 |
| **F-14** | `middleware/authorize.js` is a transport adapter, not a use case. Plan §7 wants authorization inside the use case; that layer arrives with the domain modules. The **decision** is already in the kernel, so the warning it guards against does not apply | I-06 |
| **F-15** | `audit_log` immutability still rests on the absence of an UPDATE/DELETE path rather than on a grant. The `REVOKE`/`GRANT` in migration `006` §Grants remains an operator action | carried from I-02 |

---

## 16. Historical defects — permanently covered

| Defect | Structural answer | Test |
|---|---|---|
| **Role check with no resource** | a policy without a resource is rejected at registration; an instance policy without a relationship is too | NC-1, registry tests |
| **P0-7** booking-room IDOR | participation is a kernel relationship, and both transports ask it | NC-3, transport parity |
| **Client-controlled ownership** | loaders take an id and return a row; `authorizeLoaded` requires a loader's symbol | NC-11, injection tests |
| **Role injection** | five injection shapes, none reaches the decision | §28 tests |
| **Multiple implementations** | `no-adhoc-authorization` at error severity, seven historical fixtures | boundary tests |
| **Trusting a role claim in a token** | roles are re-read from the database per request and per socket connection | realtime + middleware |
| **One flat `admin`** | six named roles from the first commit; the grant is a membership fact | role tests |
| **SOS PII broadcast (P0-8)** | unchanged; admin-room admission is now a kernel decision | P0-8 tests |
