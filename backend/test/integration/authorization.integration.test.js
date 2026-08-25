/**
 * I-04 — membership, account isolation and the audit columns, against a real engine
 *
 * §13, §14, §35. The kernel's unit tests use fake rows; these use MariaDB,
 * because the two things under test here are properties of the DATABASE:
 *
 *   - that a membership resolves to exactly the roles the tables say, with
 *     revocation and account status applied in SQL rather than in JavaScript
 *   - that migration 008's columns exist, default correctly, and are indexed,
 *     so "how often did one actor sit on both sides of a control" stays a
 *     single query
 *
 * Membership is NOT live. `users.role` remains the authorization source until
 * the cutover (I-03 §32), so nothing below runs on the request path. It is
 * built and proven now so the cutover is a switch rather than a rewrite.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const HOST = process.env.IMAP_TEST_DB_HOST;
const PORT = process.env.IMAP_TEST_DB_PORT || "3306";
const USER = process.env.IMAP_TEST_DB_USER || "root";
const PASS = process.env.IMAP_TEST_DB_PASSWORD || "";
const BACKEND = path.join(__dirname, "..", "..");
const SUITE = `imap_authz_${process.pid}`;
const configured = Boolean(HOST);

const LOCAL = new Set(["127.0.0.1", "localhost", "::1", "host.docker.internal"]);
if (configured && !LOCAL.has(String(HOST).toLowerCase())) {
  throw new Error(`IMAP_TEST_DB_HOST=${HOST} is not loopback; these tests create and drop databases.`);
}

async function connect(database) {
  const mysql = require("mysql2/promise");
  return mysql.createConnection({
    host: HOST, port: Number(PORT), user: USER, password: PASS, database, multipleStatements: true,
  });
}

const childEnv = () => ({
  ...process.env,
  APP_ENV: "test", DATABASE_ENV: "test",
  DB_HOST: HOST, DB_PORT: PORT, DB_USER: USER, DB_PASSWORD: PASS,
  DB_NAME: SUITE, DB_SSL: "false",
});

test("authorization against a real engine", { skip: configured ? false : "IMAP_TEST_DB_HOST not set" }, async (t) => {
  const admin = await connect(undefined);
  await admin.query(`DROP DATABASE IF EXISTS \`${SUITE}\``);
  await admin.query(`CREATE DATABASE \`${SUITE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  execFileSync(process.execPath, ["scripts/migrate.js"], { cwd: BACKEND, env: childEnv(), stdio: ["ignore", "pipe", "pipe"] });

  const db = await connect(SUITE);
  t.after(async () => {
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${SUITE}\``);
    await admin.end();
  });

  const { resolveActor } = require("../../src/modules/platform/authorization/membership");
  const { DENY } = require("../../src/modules/platform/authorization/decision");
  const { ROLE } = require("../../src/modules/platform/authorization/roles");
  const { writeAudit } = require("../../src/modules/platform/audit/writeAudit");

  const reset = async () => {
    await db.query("SET FOREIGN_KEY_CHECKS=0");
    for (const tbl of ["membership", "account", "principal", "audit_log"]) await db.query(`DELETE FROM ${tbl}`);
    await db.query("SET FOREIGN_KEY_CHECKS=1");
  };

  /** One principal, N accounts, N memberships. */
  async function seed({ principal = "active", accounts = [] } = {}) {
    await reset();
    await db.query("INSERT INTO principal (id, status) VALUES ('p1', ?)", [principal]);
    for (const a of accounts) {
      await db.query("INSERT INTO account (id, kind, display_name, status) VALUES (?,?,?,?)",
        [a.id, a.kind || "consumer", a.id, a.status || "active"]);
      await db.query(
        "INSERT INTO membership (id, principal_id, account_id, role, revoked_at) VALUES (?,?,?,?,?)",
        [`m-${a.id}`, "p1", a.id, a.role, a.revokedAt || null]
      );
    }
  }

  // ── §35: the migration landed ─────────────────────────────
  await t.test("migration 008 added both columns and the index", async () => {
    const [cols] = await db.query(
      `SELECT column_name, column_default, is_nullable, data_type
         FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'audit_log'
          AND column_name IN ('sod_bypass','deny_reason')
        ORDER BY column_name`
    );
    assert.equal(cols.length, 2, "008 did not apply");
    const by = Object.fromEntries(cols.map((c) => [c.COLUMN_NAME || c.column_name, c]));
    const sod = by.sod_bypass;
    assert.equal((sod.IS_NULLABLE || sod.is_nullable), "NO", "'no bypass' and 'not recorded' must differ");
    assert.equal(String(sod.COLUMN_DEFAULT ?? sod.column_default), "0");

    const [idx] = await db.query(
      `SELECT index_name FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'audit_log' AND index_name = 'idx_sod'`
    );
    assert.ok(idx.length >= 1, "counting the exception must not require a full scan");
  });

  await t.test("the separation-of-duties exception is one query away", async () => {
    await reset();
    const clock = { now: () => new Date("2026-08-09T10:00:00Z") };
    for (const [i, bypass] of [true, false, true].entries()) {
      await writeAudit(db, {
        actor: { correlationId: `c-${i}`, principalId: "p1", role: "admin", via: "http" },
        action: "verification.decide", resourceType: "kyc_document", resourceId: `k-${i}`,
        outcome: "permitted", sodBypass: bypass,
      }, clock);
    }
    const [[row]] = await db.query("SELECT COUNT(*) AS n FROM audit_log WHERE sod_bypass = 1");
    assert.equal(Number(row.n), 2, "the whole point of the column is that this is countable");
  });

  await t.test("a denial records the kernel's reason, and it survives the round trip", async () => {
    await reset();
    await writeAudit(db, {
      actor: { correlationId: "c-deny", principalId: "p1", role: "customer", via: "http" },
      action: "membership.grant", resourceType: "user", resourceId: "u-9",
      outcome: "denied", denyReason: DENY.MISSING_PERMISSION,
    });
    const [[row]] = await db.query("SELECT outcome, deny_reason, reason FROM audit_log LIMIT 1");
    assert.equal(row.outcome, "denied");
    assert.equal(row.deny_reason, "missing_permission");
    assert.equal(row.reason, null, "the operator's reason and the kernel's are different columns");
  });

  // ── §13: membership establishes the actor ─────────────────
  await t.test("a live membership resolves to exactly the role the table holds", async () => {
    await seed({ accounts: [{ id: "a1", role: ROLE.CUSTOMER }] });
    const r = await resolveActor(db, "p1");
    assert.equal(r.ok, true);
    assert.deepEqual([...r.actor.roles], [ROLE.CUSTOMER]);
    assert.equal(r.actor.accountId, "a1");
    assert.equal(r.actor.source, "membership");
  });

  await t.test("a principal with no membership holds nothing", async () => {
    await reset();
    await db.query("INSERT INTO principal (id, status) VALUES ('p1','active')");
    const r = await resolveActor(db, "p1");
    assert.equal(r.ok, false);
    assert.equal(r.reason, DENY.NO_MEMBERSHIP);
  });

  // NEGATIVE CONTROL: drop `AND m.revoked_at IS NULL` from the query in
  // membership.js and this returns a live actor.
  await t.test("a revoked membership grants nothing", async () => {
    // Revoked is not "held but inactive" — it is excluded in SQL, so the row
    // is never in memory to be used by mistake. A principal whose only
    // membership is revoked therefore holds nothing at all.
    await seed({ accounts: [{ id: "a1", role: ROLE.PLATFORM_OWNER, revokedAt: "2026-08-01 00:00:00" }] });
    const only = await resolveActor(db, "p1", "a1");
    assert.equal(only.ok, false);
    assert.equal(only.reason, DENY.NO_MEMBERSHIP);

    // And where they still hold another, the revoked one reads exactly like a
    // membership that never existed — neither grants, and the difference is
    // not something the caller can learn.
    await seed({
      accounts: [
        { id: "a1", role: ROLE.PLATFORM_OWNER, revokedAt: "2026-08-01 00:00:00" },
        { id: "a2", role: ROLE.CUSTOMER },
      ],
    });
    const revoked = await resolveActor(db, "p1", "a1");
    const neverHeld = await resolveActor(db, "p1", "a3-does-not-exist");
    assert.equal(revoked.ok, false);
    assert.equal(revoked.reason, DENY.WRONG_ACCOUNT);
    assert.deepEqual(revoked, neverHeld);
  });

  await t.test("a suspended account cannot be acted for", async () => {
    await seed({ accounts: [{ id: "a1", role: ROLE.PROVIDER, status: "suspended" }] });
    const r = await resolveActor(db, "p1", "a1");
    assert.equal(r.ok, false);
    assert.equal(r.reason, DENY.ACCOUNT_DISABLED);
  });

  await t.test("a suspended principal does not become active by acting for a live account", async () => {
    await seed({ principal: "suspended", accounts: [{ id: "a1", role: ROLE.CUSTOMER }] });
    const r = await resolveActor(db, "p1", "a1");
    assert.equal(r.ok, false);
    assert.equal(r.reason, DENY.ACCOUNT_DISABLED);
  });

  await t.test("a role the kernel does not know grants nothing", async () => {
    await seed({ accounts: [{ id: "a1", role: "superuser" }] });
    const r = await resolveActor(db, "p1", "a1");
    assert.equal(r.ok, false);
    assert.equal(r.reason, DENY.NO_MEMBERSHIP,
      "an unrecognised role stored in the table is a data defect, not a licence");
  });

  // ── §14: account isolation ────────────────────────────────
  await t.test("a member of account A cannot act for account B by asking to", async () => {
    await reset();
    await db.query("INSERT INTO principal (id, status) VALUES ('p1','active'),('p2','active')");
    await db.query(
      "INSERT INTO account (id, kind, display_name, status) VALUES ('A','provider','A','active'),('B','provider','B','active')"
    );
    await db.query("INSERT INTO membership (id, principal_id, account_id, role) VALUES ('m1','p1','A','provider')");
    await db.query("INSERT INTO membership (id, principal_id, account_id, role) VALUES ('m2','p2','B','provider')");

    const own = await resolveActor(db, "p1", "A");
    assert.equal(own.ok, true);
    assert.equal(own.actor.accountId, "A");

    // NEGATIVE CONTROL: change the `rows.find(...)` in membership.js to
    // `rows[0]` and this returns an actor for account B.
    const other = await resolveActor(db, "p1", "B");
    assert.equal(other.ok, false);
    assert.equal(other.reason, DENY.WRONG_ACCOUNT,
      "account_id in a request is a selector, never a claim");
  });

  await t.test("a principal with two accounts must say which, rather than being given the stronger", async () => {
    await seed({
      accounts: [
        { id: "consumer-a", kind: "consumer", role: ROLE.CUSTOMER },
        { id: "provider-a", kind: "provider", role: ROLE.PROVIDER },
      ],
    });
    const ambiguous = await resolveActor(db, "p1");
    assert.equal(ambiguous.ok, false);
    assert.equal(ambiguous.reason, DENY.WRONG_ACCOUNT,
      "the two implicit rules available are 'the first row' and 'the most capable'; " +
      "one is ordering-dependent and the other is privilege escalation with a friendly name");

    assert.deepEqual([...(await resolveActor(db, "p1", "consumer-a")).actor.roles], [ROLE.CUSTOMER]);
    assert.deepEqual([...(await resolveActor(db, "p1", "provider-a")).actor.roles], [ROLE.PROVIDER]);
  });

  await t.test("resolving an actor costs one query however many accounts they hold", async () => {
    await seed({
      accounts: [
        { id: "a1", role: ROLE.CUSTOMER },
        { id: "a2", kind: "provider", role: ROLE.PROVIDER },
        { id: "a3", kind: "organisation", role: ROLE.SUPPORT },
      ],
    });
    let n = 0;
    const counting = { query: (...args) => { n += 1; return db.query(...args); } };
    await resolveActor(counting, "p1", "a2");
    assert.equal(n, 1, "§36: no N+1 in the authorization path");
  });

  // ── the model the kernel will read after the cutover ──────
  await t.test("the six platform roles all store and resolve", async () => {
    for (const role of ["support", "finance", "trust_safety", "operations", "emergency_responder", "platform_owner"]) {
      await seed({ accounts: [{ id: "a1", role }] });
      const r = await resolveActor(db, "p1", "a1");
      assert.equal(r.ok, true, `${role} did not resolve`);
      assert.deepEqual([...r.actor.roles], [role]);
    }
  });

  await t.test("one principal cannot hold two memberships in the same account", async () => {
    await seed({ accounts: [{ id: "a1", role: ROLE.CUSTOMER }] });
    await assert.rejects(
      () => db.query("INSERT INTO membership (id, principal_id, account_id, role) VALUES ('m-dup','p1','a1','platform_owner')"),
      (err) => { assert.equal(err.code, "ER_DUP_ENTRY"); return true; },
      "a second membership row would be a second answer to 'what may this person do here'"
    );
  });
});
