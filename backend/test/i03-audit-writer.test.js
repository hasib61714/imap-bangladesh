/**
 * I-03 — the audit writer
 *
 * §35 permits the minimum writer needed for authentication events. Two rules
 * from AUDIT-LOG-ARCHITECTURE are enforced from the first record rather than
 * added later, because both get harder to retrofit once the log has volume:
 *
 *   changed fields only    a whole-row payload turns the log into an
 *                          uncontrolled second copy of the database
 *   no sensitive values    the log is widely readable within operations
 *
 * NEGATIVE CONTROLS:
 *   1. make diffChangedFields return {before, after} unchanged
 *      -> "records only what changed" fails
 *   2. delete the FORBIDDEN_FIELDS throw in assertNoForbiddenFields
 *      -> every "refuses a payload containing X" test fails
 *   3. remove the `!conn` guard in writeAudit
 *      -> "writeAudit requires a transaction" fails
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  writeAudit, writeAuditOutOfBand, diffChangedFields,
  assertNoForbiddenFields, AuditError,
} = require("../src/modules/platform/audit/writeAudit");
const { auditActorFromRequest } = require("../src/modules/platform/audit/auditActor");
const { fixedClock } = require("../src/shared/clock");

const clock = () => fixedClock(new Date("2026-08-09T12:00:00Z"));

function fakeConn() {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return [[], []]; } };
}

const ACTOR = { correlationId: "corr-1", principalId: "p1", role: "customer", via: "http" };
const BASE = { actor: ACTOR, action: "session.authenticate", resourceType: "principal" };

// ── in-transaction requirement (AD-009) ───────────────────────

test("writeAudit requires a transaction connection", async () => {
  await assert.rejects(() => writeAudit(null, BASE, clock()), (err) => {
    assert.equal(err.name, "AuditError");
    assert.match(err.message, /requires a transaction connection/);
    assert.match(err.message, /writeAuditOutOfBand/, "the message must name the deliberate alternative");
    return true;
  });
  await assert.rejects(() => writeAudit({}, BASE, clock()), /requires a transaction connection/);
});

test("writeAudit writes through the caller's connection, so it shares the transaction", async () => {
  const conn = fakeConn();
  await writeAudit(conn, BASE, clock());
  assert.equal(conn.calls.length, 1);
  assert.match(conn.calls[0].sql, /INSERT INTO audit_log/);
});

test("writeAuditOutOfBand never throws into the caller", async () => {
  // An audit failure must not turn a successful authentication into a 500 —
  // but it must be loud, which is why the implementation logs at error.
  const exploding = { query: async () => { throw new Error("database is gone"); } };
  const ok = await writeAuditOutOfBand(exploding, BASE, clock());
  assert.equal(ok, false, "it must report failure, not raise it");
});

// ── changed fields only ───────────────────────────────────────

test("records only what changed, not the whole row", () => {
  const before = { id: "b1", state: "pending", amount: 100, note: "same" };
  const after = { id: "b1", state: "confirmed", amount: 100, note: "same" };
  const diff = diffChangedFields(before, after);
  assert.deepEqual(diff.before, { state: "pending" });
  assert.deepEqual(diff.after, { state: "confirmed" });
  assert.equal("id" in diff.after, false, "unchanged fields must not be copied");
  assert.equal("amount" in diff.after, false);
});

test("an action that changed nothing carries no payload", () => {
  const row = { id: "b1", state: "pending" };
  const diff = diffChangedFields(row, { ...row });
  assert.equal(diff.before, null);
  assert.equal(diff.after, null);
});

test("creation and deletion are expressed as one-sided diffs", () => {
  const created = diffChangedFields(null, { id: "x", state: "new" });
  assert.equal(created.before, null);
  assert.deepEqual(created.after, { id: "x", state: "new" });

  const deleted = diffChangedFields({ id: "x", state: "new" }, null);
  assert.deepEqual(deleted.before, { id: "x", state: "new" });
  assert.equal(deleted.after, null);
});

// ── no sensitive values ───────────────────────────────────────

const FORBIDDEN = [
  "password", "password_hash", "secret_hash", "token", "refresh_token",
  "otp", "otp_code", "front_image", "selfie_image", "card_number", "cvv",
];

for (const field of FORBIDDEN) {
  test(`refuses a payload containing "${field}"`, async () => {
    const conn = fakeConn();
    await assert.rejects(
      () => writeAudit(conn, { ...BASE, before: null, after: { [field]: "value" } }, clock()),
      (err) => {
        assert.equal(err.name, "AuditError");
        assert.match(err.message, new RegExp(field, "i"));
        return true;
      }
    );
    assert.equal(conn.calls.length, 0, "nothing may be written when the payload is refused");
  });
}

test("the forbidden-field check is case-insensitive", () => {
  assert.throws(() => assertNoForbiddenFields({ Password: "x" }, "a"), /forbidden field/);
  assert.throws(() => assertNoForbiddenFields({ OTP_CODE: "1" }, "a"), /forbidden field/);
});

test("ordinary fields pass", () => {
  assert.doesNotThrow(() => assertNoForbiddenFields({ state: "confirmed", amount_minor: 100 }, "a"));
});

// ── record shape ──────────────────────────────────────────────

test("a record without a correlation id is refused", async () => {
  const conn = fakeConn();
  await assert.rejects(
    () => writeAudit(conn, { ...BASE, actor: { ...ACTOR, correlationId: null } }, clock()),
    /requires a correlation id/
  );
});

test("action, resourceType, outcome and via are all validated", async () => {
  const conn = fakeConn();
  await assert.rejects(() => writeAudit(conn, { ...BASE, action: null }, clock()), /requires an action/);
  await assert.rejects(() => writeAudit(conn, { ...BASE, resourceType: null }, clock()), /requires a resourceType/);
  await assert.rejects(() => writeAudit(conn, { ...BASE, outcome: "maybe" }, clock()), /unknown audit outcome/);
  await assert.rejects(
    () => writeAudit(conn, { ...BASE, actor: { ...ACTOR, via: "telepathy" } }, clock()),
    /unknown actor_via/
  );
});

test("an unauthenticated actor is recorded as anonymous, not as missing", async () => {
  const conn = fakeConn();
  await writeAudit(conn, { ...BASE, actor: { correlationId: "c1" } }, clock());
  const params = conn.calls[0].params;
  assert.equal(params[3], null, "principal is genuinely absent");
  assert.equal(params[5], "anonymous", "role is a fact about the actor, not a gap");
  assert.equal(params[6], "system");
});

test("ip and user agent are bounded", async () => {
  const conn = fakeConn();
  await writeAudit(conn, { ...BASE, ip: "9".repeat(200), userAgent: "U".repeat(2000) }, clock());
  const params = conn.calls[0].params;
  assert.equal(params[16].length, 45);
  assert.equal(params[17].length, 255);
});

// ── the actor helper ──────────────────────────────────────────

test("auditActorFromRequest reads the correlation id server.js already generates", () => {
  const actor = auditActorFromRequest({ requestId: "req-9", user: { id: "u1", role: "provider" }, headers: {} });
  assert.equal(actor.correlationId, "req-9");
  assert.equal(actor.principalId, "u1");
  assert.equal(actor.role, "provider");
  assert.equal(actor.via, "http");
});

test("auditActorFromRequest describes an unauthenticated request as anonymous", () => {
  const actor = auditActorFromRequest({ requestId: "req-9", headers: {} });
  assert.equal(actor.principalId, null);
  assert.equal(actor.role, "anonymous");
});

test("an override names the subject of a FAILED authentication", () => {
  // A failed login has no req.user, but the investigation needs to know which
  // account was attempted.
  const actor = auditActorFromRequest({ requestId: "r", headers: {} }, { principalId: "u-target", role: "admin" });
  assert.equal(actor.principalId, "u-target");
  assert.equal(actor.role, "admin");
});
