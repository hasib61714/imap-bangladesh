/**
 * I-04 — what an authorization decision leaves behind
 *
 * §25 asks for purposeful audit, not an access log. These tests pin both
 * halves of that: the actions that MUST leave a record, and the ones that
 * must not, because a log that records every page view is a log nobody reads.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.APP_ENV = process.env.APP_ENV || "test";
process.env.DATABASE_ENV = process.env.DATABASE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const authz = require("../src/modules/platform/authorization");
const { ACTION } = require("../src/modules/platform/authorization/actions");
const { ROLE } = require("../src/modules/platform/authorization/roles");
const { DENY } = require("../src/modules/platform/authorization/decision");
const { makeActor } = require("../src/modules/platform/authorization/actor");
const { legacyActorFromUser } = require("../src/modules/platform/authorization/legacy");
const { authorize } = require("../src/modules/platform/authorization/kernel");
const { recordDecision, shouldRecord, ownerOf } =
  require("../src/modules/platform/authorization/authorizationAudit");
const { FORBIDDEN_FIELDS } = require("../src/modules/platform/audit/writeAudit");

const ADMIN_ID = "u-admin";
const SUBJECT_ID = "u-subject";
const BOOKING_ID = "b-1";

/** Records what was inserted, and lets a test read the bound parameters. */
function recordingPool(tables = {}) {
  const inserts = [];
  return {
    inserts,
    async query(sql, params = []) {
      const flat = String(sql).replace(/\s+/g, " ").trim();
      if (flat.startsWith("INSERT INTO audit_log")) {
        const cols = flat.slice(flat.indexOf("(") + 1, flat.indexOf(")")).split(",").map((c) => c.trim());
        inserts.push(Object.fromEntries(cols.map((c, i) => [c, params[i]])));
        return [{ affectedRows: 1 }, []];
      }
      for (const [needle, rows] of Object.entries(tables)) {
        if (flat.includes(needle)) return [typeof rows === "function" ? rows(params) : rows, []];
      }
      return [[], []];
    },
  };
}

const admin = () => legacyActorFromUser({ id: ADMIN_ID, role: "admin", is_active: 1 }, { correlationId: "corr-1" });

// ════════════════════════════════════════════════════════════
test("§25 what is recorded", async (t) => {
  await t.test("a permitted read of a booking is NOT recorded", async () => {
    const pool = recordingPool({ "FROM bookings b": [{ id: BOOKING_ID, customer_id: ADMIN_ID, provider_id: "p", provider_user_id: "pu", status: "active", payment_status: "pending" }] });
    const decision = await authorize(admin(), ACTION.BOOKING_OBSERVE, BOOKING_ID, { db: pool });
    assert.equal(decision.allowed, true);
    await recordDecision(pool, { actor: admin(), decision, action: ACTION.BOOKING_OBSERVE, resourceId: BOOKING_ID });
    assert.equal(pool.inserts.length, 0, "audit: none must mean none — this runs on every page view");
  });

  await t.test("a DENIED read of a booking is recorded only where the policy says so", () => {
    const observe = authz.getPolicy(ACTION.BOOKING_OBSERVE);
    assert.equal(shouldRecord(observe, { allowed: false, reason: DENY.NOT_OWNER, sodBypass: false, shadow: null }), false);
    const transition = authz.getPolicy(ACTION.BOOKING_TRANSITION);
    assert.equal(shouldRecord(transition, { allowed: false, reason: DENY.NOT_OWNER, sodBypass: false, shadow: null }), true);
    assert.equal(shouldRecord(transition, { allowed: true, sodBypass: false, shadow: null }), false);
  });

  await t.test("every Sealed read is recorded whether or not it changed anything (V-07)", async () => {
    const ts = makeActor({ principalId: ADMIN_ID, roles: [ROLE.TRUST_SAFETY], correlationId: "corr-1", source: "test" });
    const pool = recordingPool({ "FROM kyc_docs": [{ id: "k1", user_id: SUBJECT_ID, status: "pending", doc_type: "nid" }] });
    const decision = await authorize(ts, ACTION.VERIFICATION_READ_DOCUMENT, "k1", { db: pool });
    assert.equal(decision.allowed, true);
    await recordDecision(pool, { actor: ts, decision, action: ACTION.VERIFICATION_READ_DOCUMENT, resourceId: "k1" });
    assert.equal(pool.inserts.length, 1);
    assert.equal(pool.inserts[0].outcome, "permitted");
    assert.equal(pool.inserts[0].resource_type, "kyc_document");
    assert.equal(pool.inserts[0].resource_owner, SUBJECT_ID, "the owner comes from the loaded row");
  });

  await t.test("an unregistered action is always recorded", () => {
    assert.equal(shouldRecord(null, { allowed: false, reason: DENY.POLICY_DENIED, sodBypass: false, shadow: null }), true);
  });

  await t.test("a denial records the kernel's reason in its own column", async () => {
    const customer = legacyActorFromUser({ id: "u-x", role: "customer", is_active: 1 }, { correlationId: "corr-2" });
    const pool = recordingPool({ "FROM users": [{ id: SUBJECT_ID, role: "customer", is_active: 1 }] });
    const decision = await authorize(customer, ACTION.MEMBERSHIP_GRANT, SUBJECT_ID, { db: pool });
    assert.equal(decision.allowed, false);
    await recordDecision(pool, { actor: customer, decision, action: ACTION.MEMBERSHIP_GRANT, resourceId: SUBJECT_ID });
    assert.equal(pool.inserts.length, 1);
    assert.equal(pool.inserts[0].outcome, "denied");
    assert.equal(pool.inserts[0].deny_reason, DENY.MISSING_PERMISSION);
    assert.equal(pool.inserts[0].reason, null, "the operator's reason and the kernel's are different columns");
  });
});

// ════════════════════════════════════════════════════════════
test("§12 the separation-of-duties marker is queryable", async (t) => {
  await t.test("a same-actor decision writes sod_bypass = 1", async () => {
    const ts = makeActor({ principalId: ADMIN_ID, roles: [ROLE.TRUST_SAFETY], correlationId: "corr-3", source: "test" });
    const pool = recordingPool({ "FROM kyc_docs": [{ id: "k1", user_id: ADMIN_ID, status: "pending", doc_type: "nid" }] });
    const decision = await authorize(ts, ACTION.VERIFICATION_DECIDE, "k1", { db: pool });
    assert.equal(decision.sodBypass, true);
    await recordDecision(pool, { actor: ts, decision, action: ACTION.VERIFICATION_DECIDE, resourceId: "k1" });
    assert.equal(pool.inserts[0].sod_bypass, 1);
  });

  await t.test("a different-actor decision writes sod_bypass = 0, not NULL", async () => {
    const ts = makeActor({ principalId: ADMIN_ID, roles: [ROLE.TRUST_SAFETY], correlationId: "corr-4", source: "test" });
    const pool = recordingPool({ "FROM kyc_docs": [{ id: "k1", user_id: SUBJECT_ID, status: "pending", doc_type: "nid" }] });
    const decision = await authorize(ts, ACTION.VERIFICATION_DECIDE, "k1", { db: pool });
    await recordDecision(pool, { actor: ts, decision, action: ACTION.VERIFICATION_DECIDE, resourceId: "k1" });
    assert.equal(pool.inserts[0].sod_bypass, 0, "'no bypass' and 'not recorded' must be different values");
  });

  // A bypass on an action whose policy says audit: "none" must still be
  // recorded — it is a fact about the control, not about the request.
  await t.test("a bypass is recorded even when the policy would not record the decision", () => {
    const silent = { audit: "none" };
    assert.equal(shouldRecord(silent, { allowed: true, sodBypass: true, shadow: null }), true);
  });

  await t.test("a shadow mismatch is recorded even when the policy would not record the decision", () => {
    const silent = { audit: "none" };
    assert.equal(shouldRecord(silent, { allowed: true, sodBypass: false, shadow: { reason: "x" } }), true);
  });
});

// ════════════════════════════════════════════════════════════
test("§26 what must never reach the log", async (t) => {
  await t.test("a decision record carries no before/after payload at all", async () => {
    const ts = makeActor({ principalId: ADMIN_ID, roles: [ROLE.TRUST_SAFETY], correlationId: "corr-5", source: "test" });
    const pool = recordingPool({ "FROM kyc_docs": [{ id: "k1", user_id: SUBJECT_ID, status: "pending", doc_type: "nid" }] });
    const decision = await authorize(ts, ACTION.VERIFICATION_READ_DOCUMENT, "k1", { db: pool });
    await recordDecision(pool, { actor: ts, decision, action: ACTION.VERIFICATION_READ_DOCUMENT, resourceId: "k1" });
    assert.equal(pool.inserts[0].before_json, null);
    assert.equal(pool.inserts[0].after_json, null);
  });

  await t.test("the loader for Sealed evidence never selects the images", async () => {
    const seen = [];
    const pool = {
      async query(sql) { seen.push(String(sql).replace(/\s+/g, " ")); return [[{ id: "k1", user_id: SUBJECT_ID, status: "pending", doc_type: "nid" }], []]; },
    };
    const ts = makeActor({ principalId: ADMIN_ID, roles: [ROLE.TRUST_SAFETY], source: "test" });
    await authorize(ts, ACTION.VERIFICATION_READ_DOCUMENT, "k1", { db: pool });
    for (const sql of seen) {
      for (const col of ["front_image", "back_image", "selfie_image", "certificate_image", "SELECT *"]) {
        assert.equal(sql.includes(col), false, `the authorization loader selected ${col}`);
      }
    }
  });

  await t.test("the writer's denylist still refuses a credential field", () => {
    for (const field of ["password", "password_hash", "otp", "refresh_token", "front_image"]) {
      assert.ok(FORBIDDEN_FIELDS.has(field), `${field} must stay on the denylist`);
    }
  });

  await t.test("a failed audit write does not fail the decision", async () => {
    const exploding = { async query() { throw new Error("audit table is gone"); } };
    const decision = { allowed: false, reason: DENY.NOT_OWNER, sodBypass: false, shadow: null, resource: null, policy: authz.getPolicy(ACTION.BOOKING_TRANSITION) };
    const wrote = await recordDecision(exploding, { actor: admin(), decision, action: ACTION.BOOKING_TRANSITION, resourceId: BOOKING_ID });
    assert.equal(wrote, false, "it reports failure rather than throwing into the request path");
  });
});

// ════════════════════════════════════════════════════════════
test("the record describes the actor as they actually were", async (t) => {
  await t.test("a Gate-1 administrator is logged as `admin`, not as one of the six", async () => {
    const pool = recordingPool({ "FROM users": [{ id: SUBJECT_ID, role: "customer", is_active: 1 }] });
    const a = admin();
    const decision = await authorize(a, ACTION.MEMBERSHIP_GRANT, SUBJECT_ID, { db: pool });
    assert.equal(decision.allowed, true);
    await recordDecision(pool, { actor: a, decision, action: ACTION.MEMBERSHIP_GRANT, resourceId: SUBJECT_ID, reason: "promotion" });
    assert.equal(pool.inserts[0].actor_role, "admin",
      "the log records the role AS HELD; the six-role grant is a translation, not a fact about the row");
    assert.equal(pool.inserts[0].actor_principal_id, ADMIN_ID);
    assert.equal(pool.inserts[0].correlation_id, "corr-1");
    assert.equal(pool.inserts[0].reason, "promotion");
  });

  await t.test("ownerOf reads the loaded resource and nothing else", () => {
    assert.equal(ownerOf(null), null);
    assert.equal(ownerOf({ type: "booking", customerId: "c1" }), "c1");
    assert.equal(ownerOf({ type: "kyc_document", subjectUserId: "s1" }), "s1");
    assert.equal(ownerOf({ type: "payment", payerUserId: "p1" }), "p1");
    assert.equal(ownerOf({ type: "complaint", raisedByUserId: "r1" }), "r1");
    assert.equal(ownerOf({ type: "loan", applicantUserId: "a1" }), "a1");
    assert.equal(ownerOf({ type: "user", id: "u1" }), "u1");
    assert.equal(ownerOf({ type: "service", id: "1" }), null, "an ownerless resource has no owner");
  });
});
