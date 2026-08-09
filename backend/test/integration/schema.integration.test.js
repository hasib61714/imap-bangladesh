/**
 * I-02 — database invariants
 *
 * §40: these assert what the schema must be, against a real engine. A
 * migration that exits 0 has not been verified; §37 is explicit about that.
 *
 * Skips when no isolated database is configured, and refuses any non-loopback
 * host at module load — these tests create and drop databases.
 *
 * Negative controls are scripted rather than automated: dropping an index or a
 * column to prove a test fails, then restoring it, is done against the
 * disposable instance and recorded in the I-02 report.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const HOST = process.env.IMAP_TEST_DB_HOST;
const PORT = process.env.IMAP_TEST_DB_PORT || "3306";
const USER = process.env.IMAP_TEST_DB_USER || "root";
const PASS = process.env.IMAP_TEST_DB_PASSWORD || "";
const BACKEND = path.join(__dirname, "..", "..");
const SUITE = `imap_schema_${process.pid}`;
const configured = Boolean(HOST);

const LOCAL = new Set(["127.0.0.1", "localhost", "::1", "host.docker.internal"]);
if (configured && !LOCAL.has(String(HOST).toLowerCase())) {
  throw new Error(
    `IMAP_TEST_DB_HOST=${HOST} is not a loopback address. ` +
    "These tests create and drop databases and must never address a shared server."
  );
}

async function connect(database) {
  const mysql = require("mysql2/promise");
  return mysql.createConnection({
    host: HOST, port: Number(PORT), user: USER, password: PASS,
    database, multipleStatements: true,
  });
}

test("database invariants", { skip: configured ? false : "IMAP_TEST_DB_HOST not set" }, async (t) => {
  const admin = await connect(undefined);
  await admin.query(`DROP DATABASE IF EXISTS \`${SUITE}\``);
  await admin.query(`CREATE DATABASE \`${SUITE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  // Built by the migration chain alone. If this needs schema.sql, §13 failed.
  execFileSync(process.execPath, ["scripts/migrate.js"], {
    cwd: BACKEND,
    env: {
      ...process.env,
      APP_ENV: "test", DATABASE_ENV: "test",
      DB_HOST: HOST, DB_PORT: PORT, DB_USER: USER, DB_PASSWORD: PASS,
      DB_NAME: SUITE, DB_SSL: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const db = await connect(SUITE);
  t.after(async () => {
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${SUITE}\``);
    await admin.end();
  });

  const columns = async (table) => {
    const [r] = await db.query(
      "SELECT column_name, column_type, is_nullable, column_default, column_key " +
      "FROM information_schema.columns WHERE table_schema=? AND table_name=?", [SUITE, table]
    );
    return Object.fromEntries(r.map((c) => [c.COLUMN_NAME || c.column_name, c]));
  };
  const indexes = async (table) => {
    const [r] = await db.query(
      "SELECT index_name, non_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index) cols " +
      "FROM information_schema.statistics WHERE table_schema=? AND table_name=? GROUP BY index_name, non_unique",
      [SUITE, table]
    );
    return Object.fromEntries(r.map((i) => [i.INDEX_NAME || i.index_name, i]));
  };

  // ── the chain builds everything ─────────────────────────────
  await t.test("every table the application reads exists", async () => {
    const [r] = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema=?", [SUITE]
    );
    const present = new Set(r.map((x) => x.TABLE_NAME || x.table_name));
    const required = [
      // baseline (001)
      "users", "categories", "providers", "provider_schedule", "bookings", "reviews",
      "kyc_docs", "wallet_transactions", "notifications", "promos", "loyalty_log",
      "blood_donors", "complaints", "refresh_tokens", "sos_alerts", "payments", "microloans",
      // 002
      "disaster_reports", "blood_requests", "push_subscriptions",
      // 003
      "system_settings", "chat_messages", "referrals",
      // 005, 006
      "area", "audit_log",
      // the runner's own
      "schema_migrations",
    ];
    const missing = required.filter((name) => !present.has(name));
    assert.deepEqual(missing, [], `missing tables: ${missing.join(", ")}`);
  });

  // ── audit_log — the I-02 deliverable ────────────────────────
  await t.test("audit_log carries every field the record specification requires", async () => {
    const c = await columns("audit_log");
    for (const f of [
      "id", "occurred_at", "correlation_id",
      "actor_principal_id", "actor_account_id", "actor_role", "actor_via", "on_behalf_of",
      "action", "resource_type", "resource_id", "resource_owner",
      "outcome", "before_json", "after_json", "reason", "ip", "user_agent",
    ]) {
      assert.ok(c[f], `audit_log.${f} is missing`);
    }
    // Identity of the actor may be absent (a genuine system action); what
    // happened may not.
    assert.equal(c.action.IS_NULLABLE ?? c.action.is_nullable, "NO");
    assert.equal(c.outcome.IS_NULLABLE ?? c.outcome.is_nullable, "NO");
    assert.equal(c.correlation_id.IS_NULLABLE ?? c.correlation_id.is_nullable, "NO");
    assert.equal(c.actor_role.IS_NULLABLE ?? c.actor_role.is_nullable, "NO");
    assert.equal(c.actor_principal_id.IS_NULLABLE ?? c.actor_principal_id.is_nullable, "YES");
  });

  await t.test("audit_log has the investigation indexes", async () => {
    const ix = await indexes("audit_log");
    for (const name of ["idx_resource", "idx_actor", "idx_correlation", "idx_action", "idx_owner"]) {
      assert.ok(ix[name], `audit_log index ${name} is missing`);
    }
    const pk = ix.PRIMARY;
    assert.ok(pk, "audit_log has no primary key");
    // occurred_at is in the PK so monthly partitioning stays available without
    // rebuilding the key of what will be one of the largest tables.
    assert.equal((pk.cols || pk.COLS).toLowerCase(), "id,occurred_at");
  });

  await t.test("audit_log has NO foreign keys — deliberately", async () => {
    const [r] = await db.query(
      "SELECT COUNT(*) c FROM information_schema.referential_constraints " +
      "WHERE constraint_schema=? AND table_name='audit_log'", [SUITE]
    );
    // CASCADE would let the subject of an investigation erase the evidence;
    // RESTRICT would make the right to erasure unimplementable.
    assert.equal(r[0].c, 0, "an FK on audit_log forces one of two wrong answers");
  });

  await t.test("an audit record survives the deletion of the principal it names", async () => {
    await db.query("INSERT INTO users (id,name,phone) VALUES ('audit-subject','A','01766000001')");
    await db.query(
      "INSERT INTO audit_log (id,occurred_at,correlation_id,actor_principal_id,actor_role,actor_via," +
      "action,resource_type,resource_id,outcome) VALUES (?,NOW(3),?,?,?,?,?,?,?,?)",
      ["a1", "c1", "audit-subject", "customer", "http", "session.authenticate", "principal", "audit-subject", "permitted"]
    );
    await db.query("DELETE FROM users WHERE id='audit-subject'");
    const [rows] = await db.query("SELECT actor_principal_id FROM audit_log WHERE id='a1'");
    assert.equal(rows.length, 1, "the audit record was erased with its subject");
    assert.equal(rows[0].actor_principal_id, "audit-subject", "the actor reference was nulled");
  });

  // ── financial invariants carried from Phase 0.5 ─────────────
  await t.test("the ledger idempotency index is UNIQUE", async () => {
    const ix = await indexes("wallet_transactions");
    assert.ok(ix.uniq_wallet_ref, "uniq_wallet_ref is missing");
    assert.equal(Number(ix.uniq_wallet_ref.non_unique ?? ix.uniq_wallet_ref.NON_UNIQUE), 0);
  });

  await t.test("a duplicate ledger reference is refused by the database, not the application", async () => {
    await db.query("INSERT INTO users (id,name,phone) VALUES ('led-1','L','01766000002')");
    await db.query("INSERT INTO wallet_transactions (user_id,type,amount,ref_id) VALUES ('led-1','credit',10,'booking:X:payout')");
    await assert.rejects(
      () => db.query("INSERT INTO wallet_transactions (user_id,type,amount,ref_id) VALUES ('led-1','credit',10,'booking:X:payout')"),
      (err) => { assert.equal(err.code, "ER_DUP_ENTRY"); return true; },
      "double payout is prevented by a constraint, not by a check that can race"
    );
  });

  await t.test("no account is created with spendable money", async () => {
    const c = await columns("users");
    // Phase 0.5: this defaulted to 500.00 and every account began with money
    // and no ledger entry behind it.
    assert.equal(String(c.balance.COLUMN_DEFAULT ?? c.balance.column_default), "0.00");
  });

  await t.test("a provider is not listed until approved", async () => {
    const c = await columns("providers");
    assert.equal(String(c.is_approved.COLUMN_DEFAULT ?? c.is_approved.column_default), "0");
  });

  await t.test("push_subscriptions.user_id matches users.id, and is not INT", async () => {
    const c = await columns("push_subscriptions");
    assert.equal((c.user_id.COLUMN_TYPE ?? c.user_id.column_type), "varchar(36)");
  });

  // ── §17 foreign-key behaviour is deliberate, not incidental ──
  await t.test("deleting a user CASCADES to their KYC documents", async () => {
    await db.query("INSERT INTO users (id,name,phone) VALUES ('fk-1','F','01766000003')");
    // id is VARCHAR(36) with no default on these legacy tables — the
    // application supplies a UUID. Worth knowing: there is no auto-increment
    // to fall back on.
    await db.query("INSERT INTO kyc_docs (id,user_id,doc_type,doc_number) VALUES ('kyc-fk-1','fk-1','nid','X')");
    await db.query("DELETE FROM users WHERE id='fk-1'");
    const [rows] = await db.query("SELECT COUNT(*) c FROM kyc_docs WHERE user_id='fk-1'");
    assert.equal(rows[0].c, 0);
  });

  await t.test("deleting a user with a booking is REFUSED, not cascaded", async () => {
    await db.query("INSERT INTO users (id,name,phone) VALUES ('fk-2','G','01766000004')");
    await db.query("INSERT INTO users (id,name,phone) VALUES ('fk-2p','P','01766000005')");
    await db.query("INSERT INTO providers (id,user_id) VALUES ('pv-fk','fk-2p')");
    await db.query(
      "INSERT INTO bookings (id,customer_id,provider_id,service_name_en,address,amount) " +
      "VALUES ('bk-fk','fk-2','pv-fk','x','y',100)"
    );
    await assert.rejects(
      () => db.query("DELETE FROM users WHERE id='fk-2'"),
      (err) => { assert.match(err.code, /ROW_IS_REFERENCED/); return true; },
      "booking history must not vanish with the customer record"
    );
  });

  // ── the runtime guard, against a REAL pool ──────────────────
  await t.test("the real connection pool refuses DDL", async () => {
    const out = execFileSync(process.execPath, ["-e", `
      const pool = require(${JSON.stringify(path.join(BACKEND, "db.js"))});
      pool.query("CREATE TABLE runtime_ddl_probe (id INT)")
        .then(() => { console.log("ALLOWED"); return pool.end(); })
        .catch((e) => { console.log(e.name); return pool.end(); });
    `], {
      cwd: BACKEND,
      env: {
        ...process.env,
        APP_ENV: "test", DATABASE_ENV: "test",
        DB_HOST: HOST, DB_PORT: PORT, DB_USER: USER, DB_PASSWORD: PASS,
        DB_NAME: SUITE, DB_SSL: "false",
      },
      encoding: "utf8",
    });
    assert.match(out, /RuntimeDdlError/, "the application pool executed DDL");

    const [rows] = await db.query(
      "SELECT COUNT(*) c FROM information_schema.tables WHERE table_schema=? AND table_name='runtime_ddl_probe'",
      [SUITE]
    );
    assert.equal(rows[0].c, 0, "the probe table was created — runtime DDL is not 0");
  });

  await t.test("the migration runner is still allowed to issue DDL", async () => {
    // The guard must not have broken the one legitimate caller.
    const out = execFileSync(process.execPath, ["scripts/migrate.js", "--status"], {
      cwd: BACKEND,
      env: {
        ...process.env,
        APP_ENV: "test", DATABASE_ENV: "test",
        DB_HOST: HOST, DB_PORT: PORT, DB_USER: USER, DB_PASSWORD: PASS,
        DB_NAME: SUITE, DB_SSL: "false",
      },
      encoding: "utf8",
    });
    assert.match(out, /006_audit_log/);
  });
});
