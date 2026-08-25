/**
 * I-04 — the authorization kernel
 *
 * Structure follows §37's matrix: identity, roles, permissions, resources,
 * state, privilege escalation, separation of duties.
 *
 * NEGATIVE CONTROLS (§38)
 * ───────────────────────
 * Each block below names, in a comment, the line whose reversion must make it
 * fail. Those reversions were performed and the failures observed; the record
 * is in docs/implementation/I-04-AUTHORIZATION-MAP.md §8. A test that passes
 * against a broken implementation is worse than no test, and the Phase 0.5
 * suite found one of those in its own suite.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.APP_ENV = process.env.APP_ENV || "test";
process.env.DATABASE_ENV = process.env.DATABASE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const authz = require("../src/modules/platform/authorization");
const { ACTION, PERMISSIONS } = require("../src/modules/platform/authorization/actions");
const { ROLE, PLATFORM_ROLES, ALL_ROLES } = require("../src/modules/platform/authorization/roles");
const { DENY, toHttpStatus, publicResponse } = require("../src/modules/platform/authorization/decision");
const { makeActor, anonymousActor, systemActor } = require("../src/modules/platform/authorization/actor");
const { legacyActorFromUser } = require("../src/modules/platform/authorization/legacy");
const { authorize } = require("../src/modules/platform/authorization/kernel");

// ── fixtures ────────────────────────────────────────────────
const CUSTOMER_ID = "u-customer";
const PROVIDER_USER_ID = "u-provider";
const STRANGER_ID = "u-stranger";
const ADMIN_ID = "u-admin";
const BOOKING_ID = "b-1";

/**
 * A fake pool. Rows are chosen by matching the SQL, so the loaders' real
 * queries run — the shape of what a loader returns is under test too.
 */
function fakeDb(tables = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const flat = String(sql).replace(/\s+/g, " ").trim();
      calls.push({ sql: flat, params });
      for (const [needle, rows] of Object.entries(tables)) {
        if (flat.includes(needle)) {
          const out = typeof rows === "function" ? rows(params) : rows;
          return [out, []];
        }
      }
      return [[], []];
    },
  };
}

const bookingRow = (over = {}) => ({
  id: BOOKING_ID,
  customer_id: CUSTOMER_ID,
  provider_id: "p-1",
  provider_user_id: PROVIDER_USER_ID,
  status: "active",
  payment_status: "pending",
  ...over,
});

const dbWithBooking = (over = {}) => fakeDb({ "FROM bookings b": [bookingRow(over)] });

const customer = () => legacyActorFromUser({ id: CUSTOMER_ID, role: "customer", is_active: 1 }, { correlationId: "c" });
const provider = () => legacyActorFromUser({ id: PROVIDER_USER_ID, role: "provider", is_active: 1 }, { correlationId: "c" });
const stranger = () => legacyActorFromUser({ id: STRANGER_ID, role: "customer", is_active: 1 }, { correlationId: "c" });
const admin = () => legacyActorFromUser({ id: ADMIN_ID, role: "admin", is_active: 1 }, { correlationId: "c" });

// ════════════════════════════════════════════════════════════
test("registry is sound and complete", async (t) => {
  await t.test("every registered policy names a resource and a known permission", () => {
    const policies = authz.allPolicies();
    assert.ok(policies.length >= 30, "the register should cover the migrated surface");
    for (const p of policies) {
      assert.ok(p.resource && typeof p.resource === "string", `${p.action} has no resource`);
      assert.ok(PERMISSIONS.includes(p.permission), `${p.action} has unknown permission ${p.permission}`);
      assert.ok(["A", "B", "C"].includes(p.tier), `${p.action} has no tier`);
    }
  });

  // NEGATIVE CONTROL for the rule that makes the audited defect impossible.
  // Reverting the `spec.resource` check in registry.js makes this pass a
  // resource-less policy, and this assertion fails.
  await t.test("a policy with no resource is rejected at registration", () => {
    assert.throws(
      () => authz.registerPolicy("test.no_resource", {
        permission: "read", roles: [ROLE.SUPPORT], cardinality: "collection",
        scope: () => ({ all: true }), tier: "A", audit: "none", why: "x",
      }),
      /names no resource/
    );
  });

  await t.test("an instance policy with no relationship is rejected", () => {
    assert.throws(
      () => authz.registerPolicy("test.no_relationship", {
        resource: "booking", permission: "read", roles: [ROLE.SUPPORT],
        cardinality: "instance", tier: "A", audit: "none", why: "x",
      }),
      /declares no relationship/
    );
  });

  await t.test("a collection policy with no scope is rejected", () => {
    assert.throws(
      () => authz.registerPolicy("test.no_scope", {
        resource: "booking", permission: "read", roles: [ROLE.SUPPORT],
        cardinality: "collection", tier: "A", audit: "none", why: "x",
      }),
      /declares no scope/
    );
  });

  await t.test("an unknown role in a policy is rejected", () => {
    assert.throws(
      () => authz.registerPolicy("test.bad_role", {
        resource: "booking", permission: "read", roles: ["superuser"],
        cardinality: "collection", scope: () => ({}), tier: "A", audit: "none", why: "x",
      }),
      /unknown role "superuser"/
    );
  });

  await t.test("a Tier-C policy cannot be unaudited", () => {
    authz.registerPolicy("test.tier_c_silent", {
      resource: "booking", permission: "read", roles: [ROLE.SUPPORT],
      cardinality: "collection", scope: () => ({ all: true }),
      tier: "C", audit: "none", why: "deliberately unsound",
    });
    assert.throws(() => authz.assertRegistryIsSound(), /Tier C and unaudited/);
  });

  await t.test("a shadow condition with no stated reason is rejected", () => {
    assert.throws(
      () => authz.registerPolicy("test.silent_shadow", {
        resource: "booking", permission: "read", roles: [ROLE.SUPPORT],
        cardinality: "collection", scope: () => ({ all: true }),
        shadowConditions: () => false,
        tier: "A", audit: "none", why: "x",
      }),
      /shadow condition with no reason/
    );
  });
});

// ════════════════════════════════════════════════════════════
test("§8 default deny", async (t) => {
  // NEGATIVE CONTROL: change kernel.js step 1 from `return deny(...)` to
  // `return permit(...)` and this fails.
  await t.test("an unregistered action is denied, not permitted", async () => {
    const d = await authorize(admin(), "nothing.registered", "x", { db: fakeDb() });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.POLICY_DENIED);
  });

  await t.test("a null actor is denied", async () => {
    const d = await authorize(null, ACTION.BOOKING_OBSERVE, BOOKING_ID, { db: dbWithBooking() });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.UNAUTHENTICATED);
  });

  await t.test("an actor-shaped object that is not an actor is denied", async () => {
    const d = await authorize({ principalId: ADMIN_ID, role: "admin" }, ACTION.BOOKING_OBSERVE, BOOKING_ID,
      { db: dbWithBooking() });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.UNAUTHENTICATED);
  });

  await t.test("an instance action with no resource id is denied", async () => {
    const d = await authorize(admin(), ACTION.BOOKING_OBSERVE, null, { db: dbWithBooking() });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.WRONG_RESOURCE);
  });

  await t.test("a loader that throws denies", async () => {
    const broken = { query: async () => { throw new Error("database is on fire"); } };
    const d = await authorize(admin(), ACTION.BOOKING_OBSERVE, BOOKING_ID, { db: broken });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.NOT_FOUND);
  });

  await t.test("a relationship predicate that throws denies", async () => {
    authz.registerPolicy("test.throwing_relationship", {
      resource: "booking", permission: "read", roles: [ROLE.SUPPORT], cardinality: "instance",
      relationship: () => { throw new Error("boom"); },
      tier: "A", audit: "none", why: "x",
    });
    const d = await authorize(admin(), "test.throwing_relationship", BOOKING_ID, { db: dbWithBooking() });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.POLICY_DENIED);
  });

  await t.test("a relationship that returns a truthy non-true value does not permit", async () => {
    authz.registerPolicy("test.truthy_relationship", {
      resource: "booking", permission: "read", roles: [ROLE.SUPPORT], cardinality: "instance",
      relationship: () => "yes please",
      tier: "A", audit: "none", why: "x",
    });
    const d = await authorize(admin(), "test.truthy_relationship", BOOKING_ID, { db: dbWithBooking() });
    assert.equal(d.allowed, false, "only an explicit `true` is an approval");
  });

  await t.test("a missing resource denies rather than skipping the relationship", async () => {
    const d = await authorize(customer(), ACTION.BOOKING_OBSERVE, "no-such-booking", { db: fakeDb() });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.NOT_FOUND);
  });
});

// ════════════════════════════════════════════════════════════
test("§37 identity", async (t) => {
  await t.test("anonymous is an actor, and it is denied", async () => {
    const a = anonymousActor({ correlationId: "c" });
    assert.equal(a.authenticated, false);
    assert.deepEqual([...a.roles], [ROLE.ANONYMOUS]);
    const d = await authorize(a, ACTION.BOOKING_OBSERVE, BOOKING_ID, { db: dbWithBooking() });
    assert.equal(d.reason, DENY.UNAUTHENTICATED);
  });

  await t.test("every authenticated action denies anonymous", async () => {
    const a = anonymousActor({ correlationId: "c" });
    const db = fakeDb({
      "FROM bookings b": [bookingRow()],
      "FROM kyc_docs": [{ id: "k1", user_id: CUSTOMER_ID, status: "pending", doc_type: "nid" }],
      "FROM payments": [{ id: "pay1", user_id: CUSTOMER_ID, booking_id: BOOKING_ID, status: "success" }],
      "FROM users": [{ id: CUSTOMER_ID, role: "customer", is_active: 1 }],
      "FROM complaints": [{ id: 1, user_id: CUSTOMER_ID, status: "open", assigned_to: null }],
      "FROM sos_alerts": [{ id: 1, user_id: CUSTOMER_ID, status: "open" }],
      "FROM microloans": [{ id: 1, user_id: CUSTOMER_ID, status: "pending" }],
      "FROM categories": [{ id: 1, slug: "plumbing", is_active: 1 }],
      "FROM promos": [{ id: 1, code: "X", is_active: 1 }],
    });
    for (const action of authz.registeredActions()) {
      if (action.startsWith("test.")) continue;
      const d = await authorize(a, action, "1", { db });
      assert.equal(d.allowed, false, `${action} permitted an anonymous actor`);
    }
  });

  await t.test("a named system actor is required; a wildcard one throws", () => {
    assert.throws(() => systemActor(""), /must be named/);
    const s = systemActor("payout-reconciliation");
    assert.equal(s.primaryRole, ROLE.SYSTEM);
    assert.equal(s.via, "system");
  });

  await t.test("`system` cannot arrive from a request", () => {
    // legacy.js maps three enum values; none of them produces `system`.
    const a = legacyActorFromUser({ id: "x", role: "system", is_active: 1 });
    assert.equal(a.roles.includes(ROLE.SYSTEM), false);
    assert.deepEqual([...a.roles], []);
  });
});

// ════════════════════════════════════════════════════════════
test("§37 roles and the legacy mapping", async (t) => {
  await t.test("the six platform roles exist and `admin` is not one of them", () => {
    assert.equal(PLATFORM_ROLES.length, 6);
    assert.equal(ALL_ROLES.includes("admin"), false);
  });

  await t.test("legacy customer holds exactly customer", () => {
    assert.deepEqual([...customer().roles], [ROLE.CUSTOMER]);
  });

  // A legacy provider must NOT also receive `customer`: the account model
  // gives one person both, but granting it here would widen live access.
  await t.test("legacy provider does not silently gain customer", () => {
    assert.deepEqual([...provider().roles], [ROLE.PROVIDER]);
  });

  await t.test("legacy admin holds all six platform roles, and its audit role stays `admin`", () => {
    const a = admin();
    assert.deepEqual([...a.roles].sort(), [...PLATFORM_ROLES].sort());
    assert.equal(a.primaryRole, "admin", "the audit log records the role as it was held");
  });

  // NEGATIVE CONTROL: make the `granted` fallback in legacy.js return
  // [ROLE.CUSTOMER] and this fails.
  await t.test("an unknown legacy role grants nothing — it does not become customer, and never admin", () => {
    for (const role of ["superuser", "Admin", "ADMIN", "", null, undefined, 0, {}]) {
      const a = legacyActorFromUser({ id: "u1", role, is_active: 1 });
      assert.deepEqual([...a.roles], [], `role ${JSON.stringify(role)} granted something`);
      assert.equal(a.authenticated, false);
    }
  });

  await t.test("an inactive user is not an actor, even with role=admin", () => {
    for (const flag of [0, -1, false, "0", null]) {
      const a = legacyActorFromUser({ id: ADMIN_ID, role: "admin", is_active: flag });
      assert.equal(a.authenticated, false, `is_active=${JSON.stringify(flag)} still authenticated`);
      assert.deepEqual([...a.roles], [ROLE.ANONYMOUS]);
    }
  });

  await t.test("makeActor drops a role the catalogue does not know", () => {
    const a = makeActor({ principalId: "u", roles: [ROLE.CUSTOMER, "wizard"], source: "test" });
    assert.deepEqual([...a.roles], [ROLE.CUSTOMER]);
  });
});

// ════════════════════════════════════════════════════════════
test("§37 permissions", async (t) => {
  await t.test("a role the policy does not list is denied", async () => {
    const d = await authorize(customer(), ACTION.SERVICE_UPDATE, "1",
      { db: fakeDb({ "FROM categories": [{ id: 1, slug: "s", is_active: 1 }] }) });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.MISSING_PERMISSION);
  });

  await t.test("the role gate runs before the resource is loaded", async () => {
    const db = fakeDb({ "FROM categories": [{ id: 1, slug: "s", is_active: 1 }] });
    await authorize(customer(), ACTION.SERVICE_UPDATE, "1", { db });
    assert.equal(db.calls.length, 0, "a denied role must not cost a database round trip");
  });

  await t.test("only trust_safety may read a sealed identity document", async () => {
    const db = fakeDb({ "FROM kyc_docs": [{ id: "k1", user_id: CUSTOMER_ID, status: "pending", doc_type: "nid" }] });
    for (const role of PLATFORM_ROLES) {
      const a = makeActor({ principalId: "op-" + role, roles: [role], source: "test" });
      const d = await authorize(a, ACTION.VERIFICATION_READ_DOCUMENT, "k1", { db });
      assert.equal(d.allowed, role === ROLE.TRUST_SAFETY,
        `${role} ${d.allowed ? "could" : "could not"} read Sealed evidence`);
    }
  });

  await t.test("only platform_owner may change a role", async () => {
    const db = fakeDb({ "FROM users": [{ id: STRANGER_ID, role: "customer", is_active: 1 }] });
    for (const role of PLATFORM_ROLES) {
      const a = makeActor({ principalId: "op-" + role, roles: [role], source: "test" });
      const d = await authorize(a, ACTION.MEMBERSHIP_GRANT, STRANGER_ID, { db });
      assert.equal(d.allowed, role === ROLE.PLATFORM_OWNER, `${role} on membership.grant`);
    }
  });

  await t.test("today's administrator still passes every migrated action", async () => {
    // Equivalence with `requireRole("admin")`: the six-role grant must not
    // have removed a capability the live operator has.
    const db = fakeDb({
      "FROM bookings b": [bookingRow()],
      "FROM kyc_docs": [{ id: "k1", user_id: CUSTOMER_ID, status: "pending", doc_type: "nid" }],
      "FROM payments": [{ id: "pay1", user_id: CUSTOMER_ID, booking_id: BOOKING_ID, status: "success" }],
      "FROM users": [{ id: STRANGER_ID, role: "customer", is_active: 1 }],
      "FROM complaints": [{ id: 1, user_id: STRANGER_ID, status: "open", assigned_to: null }],
      "FROM sos_alerts": [{ id: 1, user_id: STRANGER_ID, status: "open" }],
      "FROM microloans": [{ id: 1, user_id: STRANGER_ID, status: "pending" }],
      "FROM categories": [{ id: 1, slug: "plumbing", is_active: 1 }],
      "FROM promos": [{ id: 1, code: "X", is_active: 1 }],
    });
    const a = admin();
    const denied = [];
    for (const action of authz.registeredActions()) {
      if (action.startsWith("test.")) continue;
      const policy = authz.getPolicy(action);
      const id = policy.cardinality === "instance" ? "1" : null;
      const d = await authorize(a, action, id, { db, reason: "operator note" });
      if (!d.allowed) denied.push(`${action}: ${d.reason}`);
    }
    assert.deepEqual(denied, [], "the Gate-1 administrator lost a capability");
  });
});

// ════════════════════════════════════════════════════════════
test("§30 resource ownership and IDOR", async (t) => {
  await t.test("the customer of this booking may observe it", async () => {
    const d = await authorize(customer(), ACTION.BOOKING_OBSERVE, BOOKING_ID, { db: dbWithBooking() });
    assert.equal(d.allowed, true);
    assert.equal(d.resource.id, BOOKING_ID);
  });

  await t.test("the assigned provider may observe it", async () => {
    const d = await authorize(provider(), ACTION.BOOKING_OBSERVE, BOOKING_ID, { db: dbWithBooking() });
    assert.equal(d.allowed, true);
  });

  // NEGATIVE CONTROL: make bookingParticipantOrPlatform return `true`
  // unconditionally and this fails. It is P0-7 as a kernel test.
  await t.test("an unrelated authenticated user may not — resource A allow, resource B deny", async () => {
    const mine = await authorize(stranger(), ACTION.BOOKING_OBSERVE, BOOKING_ID,
      { db: dbWithBooking({ customer_id: STRANGER_ID }) });
    assert.equal(mine.allowed, true);

    const theirs = await authorize(stranger(), ACTION.BOOKING_OBSERVE, BOOKING_ID, { db: dbWithBooking() });
    assert.equal(theirs.allowed, false);
    assert.equal(theirs.reason, DENY.NOT_OWNER);
  });

  await t.test("ownership comes from the row, not from anything the caller sends", async () => {
    // Everything an attacker could put in a request, offered as context.
    const d = await authorize(stranger(), ACTION.BOOKING_OBSERVE, BOOKING_ID, {
      db: dbWithBooking(),
      customer_id: STRANGER_ID,
      customerId: STRANGER_ID,
      owner_id: STRANGER_ID,
      user_id: STRANGER_ID,
      account_id: "a-anything",
      role: "admin",
    });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.NOT_OWNER);
  });

  await t.test("an anonymous actor does not match a null provider_user_id", async () => {
    // A booking whose provider row is missing has provider_user_id = null.
    // `null === null` would have made every unassigned booking public.
    const db = dbWithBooking({ provider_user_id: null, customer_id: CUSTOMER_ID });
    const d = await authorize(anonymousActor({}), ACTION.BOOKING_OBSERVE, BOOKING_ID, { db });
    assert.equal(d.allowed, false);
  });

  await t.test("the provider may read the booking but not the completion OTP", async () => {
    const observe = await authorize(provider(), ACTION.BOOKING_OBSERVE, BOOKING_ID, { db: dbWithBooking() });
    assert.equal(observe.allowed, true);
    const otp = await authorize(provider(), ACTION.BOOKING_READ_COMPLETION_OTP, BOOKING_ID, { db: dbWithBooking() });
    assert.equal(otp.allowed, false, "the provider must not read the customer's proof of delivery");
    const custOtp = await authorize(customer(), ACTION.BOOKING_READ_COMPLETION_OTP, BOOKING_ID, { db: dbWithBooking() });
    assert.equal(custOtp.allowed, true);
  });

  await t.test("a payment is readable by its payer and by finance, and by nobody else", async () => {
    const db = fakeDb({ "FROM payments": [{ id: "pay1", user_id: CUSTOMER_ID, booking_id: BOOKING_ID, status: "success" }] });
    assert.equal((await authorize(customer(), ACTION.PAYMENT_OBSERVE, "pay1", { db })).allowed, true);
    assert.equal((await authorize(stranger(), ACTION.PAYMENT_OBSERVE, "pay1", { db })).allowed, false);
    const fin = makeActor({ principalId: "op", roles: [ROLE.FINANCE], source: "test" });
    assert.equal((await authorize(fin, ACTION.PAYMENT_OBSERVE, "pay1", { db })).allowed, true);
  });
});

// ════════════════════════════════════════════════════════════
test("§18 state-aware authorization", async (t) => {
  await t.test("proof may be attached to an active booking", async () => {
    const d = await authorize(provider(), ACTION.BOOKING_ATTACH_PROOF, BOOKING_ID,
      { db: dbWithBooking({ status: "active" }) });
    assert.equal(d.allowed, true);
  });

  // NEGATIVE CONTROL: delete the `conditions` line on BOOKING_ATTACH_PROOF
  // and this passes when it should not.
  await t.test("permission is not authorization — the same actor is denied on a cancelled booking", async () => {
    const d = await authorize(provider(), ACTION.BOOKING_ATTACH_PROOF, BOOKING_ID,
      { db: dbWithBooking({ status: "cancelled" }) });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.INVALID_STATE);
  });

  await t.test("the kernel does not duplicate the booking state machine", () => {
    // §19. `booking.transition` carries no state condition: which transitions
    // are legal, and for whom, is utils/bookingState.js and stays there.
    const policy = authz.getPolicy(ACTION.BOOKING_TRANSITION);
    assert.equal(policy.conditions, null,
      "a state table in two places drifts; the machine is the authority on transitions");
  });

  await t.test("a condition that throws denies", async () => {
    authz.registerPolicy("test.throwing_condition", {
      resource: "booking", permission: "read", roles: [ROLE.SUPPORT], cardinality: "instance",
      relationship: () => true,
      conditions: () => { throw new Error("boom"); },
      tier: "A", audit: "none", why: "x",
    });
    const d = await authorize(admin(), "test.throwing_condition", BOOKING_ID, { db: dbWithBooking() });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.POLICY_DENIED);
  });
});

// ════════════════════════════════════════════════════════════
test("§28 privilege escalation", async (t) => {
  const escalations = [
    ["role injection in context", { role: "admin", roles: ["platform_owner"] }],
    ["account injection", { account_id: "a-1", accountId: "a-1" }],
    ["owner injection", { owner_id: STRANGER_ID, ownerId: STRANGER_ID }],
    ["permission injection", { permission: "manage_membership", permissions: ["*"] }],
    ["membership injection", { membership_id: "m-1", is_admin: true, isAdmin: true }],
  ];

  for (const [name, injected] of escalations) {
    // NEGATIVE CONTROL: have the kernel read any role from `ctx` and every
    // one of these passes.
    await t.test(`${name} does not elevate`, async () => {
      const db = fakeDb({ "FROM users": [{ id: STRANGER_ID, role: "customer", is_active: 1 }] });
      const d = await authorize(customer(), ACTION.MEMBERSHIP_GRANT, STRANGER_ID, { db, ...injected });
      assert.equal(d.allowed, false, `${name} produced a permit`);
      assert.equal(d.reason, DENY.MISSING_PERMISSION);
    });
  }

  await t.test("a customer cannot suspend an account", async () => {
    const db = fakeDb({ "FROM users": [{ id: STRANGER_ID, role: "customer", is_active: 1 }] });
    const d = await authorize(customer(), ACTION.ACCOUNT_SET_STATUS, STRANGER_ID, { db, targetStatus: "suspended" });
    assert.equal(d.allowed, false);
  });

  await t.test("a provider cannot reach a platform action by acting on their own id", async () => {
    const db = fakeDb({ "FROM users": [{ id: PROVIDER_USER_ID, role: "provider", is_active: 1 }] });
    const d = await authorize(provider(), ACTION.MEMBERSHIP_GRANT, PROVIDER_USER_ID, { db, reason: "please" });
    assert.equal(d.allowed, false);
  });

  await t.test("an operator may not suspend themselves", async () => {
    const ts = makeActor({ principalId: ADMIN_ID, roles: [ROLE.TRUST_SAFETY], source: "test" });
    const db = fakeDb({ "FROM users": [{ id: ADMIN_ID, role: "admin", is_active: 1 }] });
    const self = await authorize(ts, ACTION.ACCOUNT_SET_STATUS, ADMIN_ID, { db, targetStatus: "suspended" });
    assert.equal(self.allowed, false);
    assert.equal(self.reason, DENY.INVALID_STATE);

    const other = await authorize(ts, ACTION.ACCOUNT_SET_STATUS, STRANGER_ID,
      { db: fakeDb({ "FROM users": [{ id: STRANGER_ID, role: "customer", is_active: 1 }] }), targetStatus: "suspended" });
    assert.equal(other.allowed, true);
  });

  await t.test("changing your own role requires a written reason", async () => {
    const owner = makeActor({ principalId: ADMIN_ID, roles: [ROLE.PLATFORM_OWNER], source: "test" });
    const db = fakeDb({ "FROM users": [{ id: ADMIN_ID, role: "admin", is_active: 1 }] });

    const bare = await authorize(owner, ACTION.MEMBERSHIP_GRANT, ADMIN_ID, { db });
    assert.equal(bare.allowed, false);
    assert.equal(bare.reason, DENY.REASON_REQUIRED);

    const withReason = await authorize(owner, ACTION.MEMBERSHIP_GRANT, ADMIN_ID, { db, reason: "post-incident recovery" });
    assert.equal(withReason.allowed, true);
    assert.equal(withReason.sodBypass, true, "a self-directed role change is the SOD exception");
  });
});

// ════════════════════════════════════════════════════════════
test("§12 separation of duties", async (t) => {
  await t.test("deciding someone else's verification case is not a bypass", async () => {
    const ts = makeActor({ principalId: ADMIN_ID, roles: [ROLE.TRUST_SAFETY], source: "test" });
    const db = fakeDb({ "FROM kyc_docs": [{ id: "k1", user_id: CUSTOMER_ID, status: "pending", doc_type: "nid" }] });
    const d = await authorize(ts, ACTION.VERIFICATION_DECIDE, "k1", { db });
    assert.equal(d.allowed, true);
    assert.equal(d.sodBypass, false);
  });

  // NEGATIVE CONTROL: remove the `sameActor` line on VERIFICATION_DECIDE and
  // this fails — the exception happens and is not counted.
  await t.test("deciding your OWN verification case is permitted and marked", async () => {
    const ts = makeActor({ principalId: ADMIN_ID, roles: [ROLE.TRUST_SAFETY], source: "test" });
    const db = fakeDb({ "FROM kyc_docs": [{ id: "k1", user_id: ADMIN_ID, status: "pending", doc_type: "nid" }] });
    const d = await authorize(ts, ACTION.VERIFICATION_DECIDE, "k1", { db });
    assert.equal(d.allowed, true, "Gate 1 has one operator; enforcing SOD would stop operations");
    assert.equal(d.sodBypass, true, "and the exception is recorded rather than hidden");
  });

  await t.test("resolving a complaint you raised is marked", async () => {
    const sup = makeActor({ principalId: ADMIN_ID, roles: [ROLE.SUPPORT], source: "test" });
    const own = fakeDb({ "FROM complaints": [{ id: 1, user_id: ADMIN_ID, status: "open", assigned_to: null }] });
    assert.equal((await authorize(sup, ACTION.COMPLAINT_RESOLVE, "1", { db: own })).sodBypass, true);
    const other = fakeDb({ "FROM complaints": [{ id: 1, user_id: CUSTOMER_ID, status: "open", assigned_to: null }] });
    assert.equal((await authorize(sup, ACTION.COMPLAINT_RESOLVE, "1", { db: other })).sodBypass, false);
  });

  await t.test("an unevaluatable separation of duties is recorded as bypassed, never as satisfied", async () => {
    authz.registerPolicy("test.sod_throws", {
      resource: "booking", permission: "read", roles: [ROLE.SUPPORT], cardinality: "instance",
      relationship: () => true,
      sameActor: () => { throw new Error("boom"); },
      tier: "B", audit: "required", why: "x",
    });
    const d = await authorize(admin(), "test.sod_throws", BOOKING_ID, { db: dbWithBooking() });
    assert.equal(d.allowed, true);
    assert.equal(d.sodBypass, true);
  });

  await t.test("every same-actor policy is audited", () => {
    for (const p of authz.allPolicies()) {
      if (!p.sameActor || p.action.startsWith("test.")) continue;
      assert.notEqual(p.audit, "none", `${p.action} can bypass SOD and writes no record`);
    }
  });
});

// ════════════════════════════════════════════════════════════
test("§24 shadow evaluation", async (t) => {
  await t.test("a shadow condition records a mismatch and does not deny", async () => {
    const d = await authorize(customer(), ACTION.MESSAGE_SEND, BOOKING_ID,
      { db: dbWithBooking({ status: "completed" }) });
    assert.equal(d.allowed, true, "shadow logic must never become authoritative");
    assert.ok(d.shadow, "the disagreement must be recorded");
    assert.equal(d.shadow.legacy, "permit");
    assert.equal(d.shadow.kernel, "deny");
  });

  await t.test("no mismatch is recorded when the rules agree", async () => {
    const d = await authorize(customer(), ACTION.MESSAGE_SEND, BOOKING_ID,
      { db: dbWithBooking({ status: "active" }) });
    assert.equal(d.allowed, true);
    assert.equal(d.shadow, null);
  });

  await t.test("a shadow rule never turns a permit into a deny for any state", async () => {
    for (const status of ["pending", "confirmed", "active", "completed", "cancelled"]) {
      const d = await authorize(customer(), ACTION.MESSAGE_SEND, BOOKING_ID, { db: dbWithBooking({ status }) });
      assert.equal(d.allowed, true, `shadow denied on status=${status}`);
    }
  });

  await t.test("exactly one policy carries a shadow rule, and it says why", () => {
    const shadowed = authz.allPolicies().filter((p) => p.shadowConditions && !p.action.startsWith("test."));
    assert.deepEqual(shadowed.map((p) => p.action), [ACTION.MESSAGE_SEND]);
    assert.match(shadowed[0].shadowConditionsReason, /owner decision/);
  });
});

// ════════════════════════════════════════════════════════════
test("§34 response safety", async (t) => {
  await t.test("a denial never carries the reason outward", () => {
    for (const reason of Object.values(DENY)) {
      const { body } = publicResponse({ reason, allowed: false }, "legacy");
      assert.equal(typeof body.error, "string");
      assert.equal(body.error.includes(reason), false, `${reason} leaked into the response`);
      assert.equal(Object.keys(body).length, 1, "a denial body carries one field");
    }
  });

  await t.test("indistinguishable mode gives 404 for both 'not yours' and 'no such thing'", () => {
    assert.equal(toHttpStatus(DENY.NOT_OWNER, "indistinguishable"), 404);
    assert.equal(toHttpStatus(DENY.NOT_FOUND, "indistinguishable"), 404);
    assert.equal(toHttpStatus(DENY.WRONG_ACCOUNT, "indistinguishable"), 404);
  });

  await t.test("legacy mode preserves what /api/* answers today", () => {
    assert.equal(toHttpStatus(DENY.NOT_OWNER, "legacy"), 403);
    assert.equal(toHttpStatus(DENY.MISSING_PERMISSION, "legacy"), 403);
    assert.equal(toHttpStatus(DENY.NOT_FOUND, "legacy"), 404);
    assert.equal(toHttpStatus(DENY.UNAUTHENTICATED, "legacy"), 401);
  });

  await t.test("the legacy status exception is counted, not assumed", () => {
    const legacy = authz.allPolicies()
      .filter((p) => p.statusMode === "legacy" && !p.action.startsWith("test."))
      .map((p) => p.action);
    const indistinguishable = authz.allPolicies()
      .filter((p) => p.statusMode === "indistinguishable" && !p.action.startsWith("test."))
      .map((p) => p.action);
    // Adding a policy to the exception list must require editing this test.
    assert.deepEqual(indistinguishable, [ACTION.PAYMENT_OBSERVE]);
    assert.equal(legacy.length + indistinguishable.length, authz.allPolicies().filter((p) => !p.action.startsWith("test.")).length);
  });

  await t.test("an unknown deny reason cannot be constructed", () => {
    const { deny } = require("../src/modules/platform/authorization/decision");
    assert.throws(() => deny("because I said so"), /unknown deny reason/);
  });
});
