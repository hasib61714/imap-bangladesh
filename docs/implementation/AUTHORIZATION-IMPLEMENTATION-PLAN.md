# IMAP 2.0 — Authorization Implementation Plan

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Governed by:** `AUTHORIZATION-ARCHITECTURE.md` · AD-017 · Constitution §4, D-002

---

## 1. Starting position

Three independent authorization implementations exist today:

| Mechanism | Where | Weakness |
|---|---|---|
| `requireRole()` | `middleware/auth.js`, ~30 endpoints | Role without a resource — the audited defect |
| Inline `if` blocks | inside handlers across 18 route files | No single place to answer "who may do what" |
| `utils/bookingAccess.js` | booking + socket (Phase 0.5) | Correct, but one resource only |

The target is **one kernel with one entry point**, called from four transports.

```
authorize(actor, action, resourceRef) → permit | deny(reason)
```

---

## 2. Build order

| # | Step | Delivers | Exit criterion |
|---|---|---|---|
| **A-1** | Actor construction | `{principal_id, account_id, role, via, session_id, correlation_id}` from HTTP, socket, job, (later) tool | every request carries an actor; anonymous is an actor with `role: anonymous`, not `null` |
| **A-2** | Policy registry + **startup assertion** | `registerPolicy()`; boot fails if any registered use case lacks a policy, or any policy lacks a resource | the process refuses to start on a violation — proven by a test that registers a bad policy |
| **A-3** | Kernel | role → relationship → conditions, in that order | permit/deny with a **safe** reason |
| **A-4** | Resource loaders | one per resource type; loads attributes the conditions need | ownership is **loaded from the resource**, never inferred from the request |
| **A-5** | HTTP enforcement | every endpoint maps to exactly one action | contract test: no endpoint without an action |
| **A-6** | Socket enforcement | `join_room` + every data-carrying event | transport-parity test |
| **A-7** | Job enforcement | `via: "system"` with a **narrow, named** system actor | no wildcard system actor exists |
| **A-8** | Denial audit | denials on sensitive actions recorded | attempted access is as visible as successful access |
| **A-9** | Tier tags | every policy carries A/B/C | Tier-C actions have no tool and no AI path (Gate 2 prerequisite) |

**A-2 before A-3.** The registry with its startup assertion is what makes "nothing ships unguarded" structural. Building the kernel first and the registry later means a window in which unguarded use cases are possible — and that window never closes on its own.

---

## 3. The kernel

```js
// modules/platform/authorization/kernel.js
async function authorize(actor, action, resourceRef, ctx) {
  const policy = registry.get(action);
  if (!policy) throw new Error(`unregistered action: ${action}`);  // startup should have caught this

  if (!policy.roles.includes(actor.role) && !policy.roles.includes('*'))
    return deny('role');                                  // cheap first

  const resource = resourceRef ? await loaders[policy.resource](resourceRef, ctx) : null;
  if (policy.resource && !resource) return deny('not_found');   // 404/403 indistinguishable

  if (policy.relationship && !policy.relationship(actor, resource))
    return deny('relationship');

  if (policy.conditions && !policy.conditions(actor, resource, ctx))
    return deny('condition');

  if (policy.reasonRequired && !ctx.reason) return deny('reason_required');

  return permit(policy);
}
```

| Property | Reason |
|---|---|
| Role checked first | Cheap; the resource loads only if the role could plausibly permit |
| Missing resource denies as `not_found` | `404` and `403` are deliberately indistinguishable — prevents id enumeration |
| Deny reasons are categories, not details | Never "this booking belongs to principal X" |
| `reason` is a policy requirement | An admin override without a stated reason is unappealable (R-1103) |

---

## 4. Policy shape

```js
registerPolicy('booking.confirm_completion', {
  resource:       'booking',
  roles:          ['customer', 'support', 'platform_owner'],
  relationship:   (actor, b) => actor.account_id === b.customer_account_id
                                || isPlatformRole(actor.role),
  conditions:     (actor, b) => b.state === 'awaiting_confirmation',
  tier:           'B',                    // AI may propose, never commit
  audit:          'required',
  reasonRequired: (actor) => isPlatformRole(actor.role),
});
```

**A policy with no `resource` is rejected at registration.** That single rule is what makes the audited role-only check impossible to reintroduce.

---

## 5. Gate-1 policy register

59 commands + 25 queries = **84 actions**. Representative set; the full list is generated from the module `policies.js` files and asserted complete at startup.

### identity

| Action | Roles | Relationship | Conditions | Tier |
|---|---|---|---|:--:|
| `identity.register` | anonymous | — | — | A |
| `session.authenticate` | anonymous | — | credential exists | A |
| `session.revoke` | any | own session | — | A |
| `contact.verify` | any | self | — | A |
| `verification.submit` | any | self | — | A |
| `verification.decide` | trust_safety, operations | — | reason required | **C** |
| `verification.read_document` | trust_safety | assigned to the case | reason required; **audited on every read** | **C** |
| `capability.decide` | trust_safety | — | reason required | **C** |
| `membership.grant` | platform_owner | — | reason required | **C** |

### marketplace

| Action | Roles | Relationship | Conditions | Tier |
|---|---|---|---|:--:|
| `provider.apply` | customer | self | — | A |
| `provider.approve` | operations, trust_safety | — | identity verified; reason | **C** |
| `provider.suspend` | trust_safety | — | reason required | **C** |
| `provider.list` | provider | own profile | **state = approved**; ≥1 capability, coverage, price | A |
| `provider.set_price` | provider | own profile | — | B |
| `availability.publish` | provider | own profile | — | A |
| `catalog.publish` | operations | — | — | **C** |
| `discovery.search` | `*` | — | — | A |

### booking

| Action | Roles | Relationship | Conditions | Tier |
|---|---|---|---|:--:|
| `booking.observe` | customer, provider, support | **participant** | — | A |
| `booking.request` | customer | owns the quote | quote unexpired; provider listed; **customer phone-verified** (R-410) | B |
| `booking.accept` | provider | assigned provider | state = pending | B |
| `booking.start` / `.arrive` / `.report_done` | provider | assigned provider | state precondition per machine | B |
| `booking.confirm_completion` | **customer**, support | booking's customer | state = awaiting_confirmation | B |
| `booking.cancel` | customer, provider, support | participant | state ∈ {pending, confirmed}; **from `active` → platform role only** | B |
| `dispute.raise` | customer, provider | participant | state ∈ {awaiting_confirmation, completed} | B |
| `dispute.resolve` | trust_safety, support | — | reason required | **C** |
| `message.send` | customer, provider | participant | booking not terminal | B |
| `review.submit` | customer | booking's customer | completed **and unrated** | B |
| `emergency.raise` | any authenticated | — | — | A |
| `emergency.respond` | emergency_responder | — | — | **C** |
| `donor.release_contact` | any authenticated | — | **consent active**; logged | A |

### finance

| Action | Roles | Relationship | Conditions | Tier |
|---|---|---|---|:--:|
| `quote.issue` | `*` | — | provider listed; price resolvable | A |
| `payment.initiate` | customer | booking's customer | booking not already paid | B |
| `payment.callback` | **system** | — | gateway signature + amount reconciled | — |
| `refund.approve` | finance, support | — | reason required | **C** |
| `refund.execute` | finance | — | **not the approver** (§6) | **C** |
| `payout.request` | provider | own account | identity verified | B |
| `payout.execute` | finance | — | **not the approver of the same claim** (§6) | **C** |
| `ledger.read` | any | owning account | — | A |
| `ledger.read_all` | finance | — | — | **C** |

### platform

| Action | Roles | Notes |
|---|---|---|
| `audit.read` | trust_safety, finance, support, platform_owner | **scoped by record class**; the read is itself audited |
| `audit.write` | **nobody** | Tier C — the log is never authored |
| `feature.set` | platform_owner | reason required |
| `job.read` | owner, platform_owner | |

---

## 6. Separation of duties at Gate 1 — stated, not pretended

`AUTHORIZATION-ARCHITECTURE.md` §7 requires the approver of a refund not to be the executor of the payout. `GATE-1-ARCHITECTURE.md` §8 defines four roles, one of which is `admin`, and in practice one person holds it.

**Separation of duties cannot be enforced at Gate 1.** The resolution:

| | |
|---|---|
| **Policies** | written against the six platform roles from the first commit |
| **Gate-1 grant** | the single `admin` membership satisfies all six checks |
| **Tightening** | a membership change, **not a code change** |
| **Same-actor approve-then-execute** | permitted, and writes an audit record flagged `sod_bypass` |
| **Enforcement switches on** | when a second operator exists — a launch decision with an owner |

Counting the exception is the point. An unenforceable control that is invisible is worse than one that is enforced later, because nobody knows how often it mattered. Recorded as **R-11** in `IMPLEMENTATION-RISK-REGISTER.md`.

---

## 7. Enforcement points — one kernel, four callers

| Transport | Call site | Actor `via` |
|---|---|---|
| HTTP | inside the use case, not the middleware | `http` |
| Socket | `join_room` and every data-carrying event; **membership recorded only after a permit** (the P0-7 fix, generalised) | `http` |
| Jobs | before any state change; narrow named system actor | `system` |
| AI tools (Gate 2) | at proposal **and** again at execution | `ai` |

**Authorization lives in the use case, not the middleware.** Middleware-only authorization is bypassed by every other transport — which is exactly how the socket layer ended up with no check at all.

---

## 8. Migration from the three current implementations

| Step | Action | Verification |
|---|---|---|
| 1 | Kernel + registry alongside the existing checks | 59 tests still pass |
| 2 | Per module, replace `requireRole` and inline `if`s with `authorize()`, **deleting the old check in the same commit** | that module's authorization tests |
| 3 | `bookingAccess.js` becomes `modules/booking/policies.js` | P0-7 and P0-8 tests unchanged and passing |
| 4 | Delete `requireRole` from `middleware/auth.js` | no import remains |
| 5 | Enable the startup assertion as fatal | boot fails on any unguarded use case |

**Never two live checks for one action.** The old check is removed in the commit that adds the new one, so there is never a question about which one decided.

---

## 9. Tests

| Class | Requirement |
|---|---|
| **Policy unit** | Every policy: one permit, one deny-by-role, one deny-by-relationship, one deny-by-condition |
| **Registration** | Every action has a policy; every policy names a resource. **Fails the build otherwise** |
| **Cross-actor** | For every resource type, a non-owner is denied on **every** action |
| **Transport parity** | An action denied over HTTP is denied over socket and (Gate 2) over a tool |
| **Enumeration** | A non-existent id and an unauthorised id return **identical** responses |
| **Separation of duties** | Same-actor approve-and-execute writes the `sod_bypass` audit record |
| **Tier** | No Tier-C action is reachable from any non-human path |
| **Anonymous** | Every authenticated action denies `role: anonymous` |

Every one carries a **negative control**: a comment naming the line whose reversion must make it fail. The Phase 0.5 suite found a test in its own suite that passed against the broken implementation.

---

## 10. Anti-patterns, and the check that catches each

| Anti-pattern | Caught by |
|---|---|
| Role check with no resource | Registration assertion |
| A second authorization implementation | Lint: `authorize(` is the only permitted entry point |
| Trusting a role claim in a token | Roles read from the database per request; test |
| Transport-layer-only authorization | Transport-parity test |
| Ownership inferred from the request body | Resource loaders take an id and load attributes |
| A use case with no policy | Startup assertion |
| Deny reasons leaking resource detail | Deny reasons are a fixed enum |
| One flat `admin` permission | Policies name six platform roles from day one |
| Skipping re-authorization at AI execution | Gate 2; the double-check is in the tool runtime contract |
| Hardcoded role strings in domain code | Lint: role literals permitted only in `policies.js` files |
