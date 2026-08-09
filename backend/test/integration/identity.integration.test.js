/**
 * I-03 — identity schema invariants, against a real engine
 *
 * The first test in this file is the one that matters most, and it exists
 * because the constraint it checks WAS BROKEN and review did not catch it:
 *
 *     UNIQUE KEY (principal_id, kind, provider)
 *
 * A password credential has provider IS NULL, and MySQL-family engines do not
 * collide NULLs in a unique index — so that constraint permitted unlimited
 * password credentials per principal. It was found by the backfill failing an
 * idempotency check, not by reading the DDL.
 *
 * §18: race-sensitive uniqueness belongs in the database. A constraint that
 * silently does not constrain is worse than none, because it is relied upon.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const HOST = process.env.IMAP_TEST_DB_HOST;
const PORT = process.env.IMAP_TEST_DB_PORT || "3306";
const USER = process.env.IMAP_TEST_DB_USER || "root";
const PASS = process.env.IMAP_TEST_DB_PASSWORD || "";
const BACKEND = path.join(__dirname, "..", "..");
const SUITE = `imap_identity_${process.pid}`;
const configured = Boolean(HOST);

const LOCAL = new Set(["127.0.0.1", "localhost", "::1", "host.docker.internal"]);
if (configured && !LOCAL.has(String(HOST).toLowerCase())) {
  throw new Error(`IMAP_TEST_DB_HOST=${HOST} is not loopback; these tests create and drop databases.`);
}

const BCRYPT = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

async function connect(database) {
  const mysql = require("mysql2/promise");
  return mysql.createConnection({ host: HOST, port: Number(PORT), user: USER, password: PASS, database, multipleStatements: true });
}

const childEnv = (extra = {}) => ({
  ...process.env,
  APP_ENV: "test", DATABASE_ENV: "test",
  DB_HOST: HOST, DB_PORT: PORT, DB_USER: USER, DB_PASSWORD: PASS,
  DB_NAME: SUITE, DB_SSL: "false", ...extra,
});

test("identity schema", { skip: configured ? false : "IMAP_TEST_DB_HOST not set" }, async (t) => {
  const admin = await connect(undefined);
  await admin.query(`DROP DATABASE IF EXISTS \`${SUITE}\``);
  await admin.query(`CREATE DATABASE \`${SUITE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  execFileSync(process.execPath, ["scripts/migrate.js"], { cwd: BACKEND, env: childEnv(), stdio: ["ignore", "pipe", "pipe"] });

  const db = await connect(SUITE);
  t.after(async () => { await db.end(); await admin.query(`DROP DATABASE IF EXISTS \`${SUITE}\``); await admin.end(); });

  const reset = async () => {
    await db.query("SET FOREIGN_KEY_CHECKS=0");
    for (const tbl of ["contact_verification", "credential", "session", "membership", "account", "principal", "providers", "users"]) {
      await db.query(`DELETE FROM ${tbl}`);
    }
    await db.query("SET FOREIGN_KEY_CHECKS=1");
  };

  // ── the constraint that was broken ──────────────────────────
  await t.test("a principal cannot hold two password credentials", async () => {
    await reset();
    await db.query("INSERT INTO principal (id,status) VALUES ('p1','active')");
    await db.query("INSERT INTO credential (id,principal_id,kind,secret_hash) VALUES ('c1','p1','password',?)", [BCRYPT]);
    await assert.rejects(
      () => db.query("INSERT INTO credential (id,principal_id,kind,secret_hash) VALUES ('c2','p1','password',?)", [BCRYPT]),
      (err) => { assert.equal(err.code, "ER_DUP_ENTRY"); return true; },
      "provider IS NULL on a password credential, and NULLs do not collide in a unique index — " +
      "the constraint must not depend on that"
    );
    const [rows] = await db.query("SELECT COUNT(*) c FROM credential WHERE principal_id='p1' AND kind='password'");
    assert.equal(rows[0].c, 1);
  });

  await t.test("a principal MAY hold several oauth providers", async () => {
    await reset();
    await db.query("INSERT INTO principal (id,status) VALUES ('p1','active')");
    await db.query("INSERT INTO credential (id,principal_id,kind,provider,provider_subject) VALUES ('c1','p1','oauth','google','g1')");
    await db.query("INSERT INTO credential (id,principal_id,kind,provider,provider_subject) VALUES ('c2','p1','oauth','apple','a1')");
    const [rows] = await db.query("SELECT COUNT(*) c FROM credential WHERE principal_id='p1'");
    assert.equal(rows[0].c, 2, "the fix must not over-constrain");
  });

  await t.test("one provider subject belongs to exactly one principal", async () => {
    await reset();
    await db.query("INSERT INTO principal (id,status) VALUES ('p1','active'),('p2','active')");
    await db.query("INSERT INTO credential (id,principal_id,kind,provider,provider_subject) VALUES ('c1','p1','oauth','google','shared')");
    await assert.rejects(
      () => db.query("INSERT INTO credential (id,principal_id,kind,provider,provider_subject) VALUES ('c2','p2','oauth','google','shared')"),
      (err) => { assert.equal(err.code, "ER_DUP_ENTRY"); return true; },
      "two principals claiming one Google account is an account-takeover shape"
    );
  });

  // ── §9 the null-hash rule at the database level ─────────────
  await t.test("a password credential cannot exist without a hash", async () => {
    await reset();
    await db.query("INSERT INTO principal (id,status) VALUES ('p1','active')");
    await assert.rejects(
      () => db.query("INSERT INTO credential (id,principal_id,kind,secret_hash) VALUES ('c1','p1','password',NULL)"),
      (err) => { assert.match(String(err.message), /chk_password_has_hash|CONSTRAINT/i); return true; }
    );
  });

  await t.test("an oauth credential cannot exist without a subject", async () => {
    await reset();
    await db.query("INSERT INTO principal (id,status) VALUES ('p1','active')");
    await assert.rejects(
      () => db.query("INSERT INTO credential (id,principal_id,kind) VALUES ('c1','p1','oauth')"),
      (err) => { assert.match(String(err.message), /chk_oauth_has_subject|CONSTRAINT/i); return true; }
    );
  });

  // ── membership and session ──────────────────────────────────
  await t.test("one membership per principal per account", async () => {
    await reset();
    await db.query("INSERT INTO principal (id,status) VALUES ('p1','active')");
    await db.query("INSERT INTO account (id,kind,display_name) VALUES ('a1','consumer','X')");
    await db.query("INSERT INTO membership (id,principal_id,account_id,role) VALUES ('m1','p1','a1','customer')");
    await assert.rejects(
      () => db.query("INSERT INTO membership (id,principal_id,account_id,role) VALUES ('m2','p1','a1','provider')"),
      (err) => { assert.equal(err.code, "ER_DUP_ENTRY"); return true; }
    );
  });

  await t.test("a refresh-token hash identifies exactly one session", async () => {
    await reset();
    await db.query("INSERT INTO principal (id,status) VALUES ('p1','active')");
    const hash = "a".repeat(64);
    await db.query("INSERT INTO session (id,principal_id,refresh_token_hash,expires_at) VALUES ('s1','p1',?,NOW())", [hash]);
    await assert.rejects(
      () => db.query("INSERT INTO session (id,principal_id,refresh_token_hash,expires_at) VALUES ('s2','p1',?,NOW())", [hash]),
      (err) => { assert.equal(err.code, "ER_DUP_ENTRY"); return true; }
    );
  });

  await t.test("deleting a principal removes its credentials and sessions", async () => {
    await reset();
    await db.query("INSERT INTO principal (id,status) VALUES ('p1','active')");
    await db.query("INSERT INTO credential (id,principal_id,kind,secret_hash) VALUES ('c1','p1','password',?)", [BCRYPT]);
    await db.query("INSERT INTO session (id,principal_id,refresh_token_hash,expires_at) VALUES ('s1','p1',?,NOW())", ["b".repeat(64)]);
    await db.query("DELETE FROM principal WHERE id='p1'");
    const [c] = await db.query("SELECT COUNT(*) n FROM credential WHERE principal_id='p1'");
    const [s] = await db.query("SELECT COUNT(*) n FROM session WHERE principal_id='p1'");
    assert.equal(c[0].n, 0, "an orphaned credential is a credential nobody owns");
    assert.equal(s[0].n, 0);
  });

  // ── the backfill ────────────────────────────────────────────
  const seed = async () => {
    await reset();
    await db.query(
      `INSERT INTO users (id,name,email,phone,password_hash,role,login_method,verified,is_active) VALUES
       ('u1','A','a@x.test','01711111111',?,'customer','email',0,1),
       ('u2','B',NULL,'01722222222',NULL,'provider','otp',1,1),
       ('u3','C','c@x.test',NULL,'not-bcrypt','customer','email',1,1),
       ('u4','D',NULL,'01744444444',?,'customer','otp',1,0),
       ('u5','E','e@x.test','01755555555',NULL,'admin','email',0,1)`, [BCRYPT, BCRYPT]);
    await db.query("INSERT INTO providers (id,user_id) VALUES ('pv1','u2')");
  };
  const backfill = (args = []) =>
    execFileSync(process.execPath, ["scripts/backfill-identity.js", ...args],
      { cwd: BACKEND, env: childEnv(), encoding: "utf8" });

  await t.test("the dry run writes nothing", async () => {
    await seed();
    backfill();
    const [rows] = await db.query("SELECT COUNT(*) c FROM principal");
    assert.equal(rows[0].c, 0, "the default must analyse, never write");
  });

  await t.test("the backfill is idempotent", async () => {
    await seed();
    const snapshot = async () => {
      const [r] = await db.query(
        "SELECT (SELECT COUNT(*) FROM principal) p, (SELECT COUNT(*) FROM membership) m, " +
        "(SELECT COUNT(*) FROM credential) c, (SELECT COUNT(*) FROM contact_verification) v");
      return r[0];
    };
    backfill(["--apply"]);
    const first = await snapshot();
    backfill(["--apply"]);
    backfill(["--apply"]);
    assert.deepEqual(await snapshot(), first, "a re-run after a partial failure must converge, not duplicate");
  });

  await t.test("no credential is created from a NULL or malformed hash", async () => {
    await seed();
    backfill(["--apply"]);
    // u2 and u5 have NULL; u3 has a non-bcrypt string. None may authenticate.
    for (const id of ["u2", "u3", "u5"]) {
      const [rows] = await db.query("SELECT COUNT(*) c FROM credential WHERE principal_id=? AND kind='password'", [id]);
      assert.equal(rows[0].c, 0, `${id} must have no password credential — P0-1 is absence, not a conditional`);
    }
    const [ok] = await db.query("SELECT COUNT(*) c FROM credential WHERE principal_id='u1' AND kind='password'");
    assert.equal(ok[0].c, 1);
  });

  await t.test("a deactivated user becomes suspended, never closed", async () => {
    await seed();
    backfill(["--apply"]);
    const [rows] = await db.query("SELECT status FROM principal WHERE id='u4'");
    // Closure is terminal and irreversible, and nothing in `users` records
    // that the user asked for it.
    assert.equal(rows[0].status, "suspended");
  });

  await t.test("§26: a legacy admin is NOT granted a platform role", async () => {
    await seed();
    backfill(["--apply"]);
    const [rows] = await db.query("SELECT role FROM membership WHERE principal_id='u5'");
    assert.deepEqual(rows.map((r) => r.role), ["customer"],
      "a role granted before there was an audit log is a role nobody can justify");
  });

  await t.test("a provider gets BOTH a consumer and a provider account", async () => {
    await seed();
    backfill(["--apply"]);
    const [rows] = await db.query(
      "SELECT a.kind FROM membership m JOIN account a ON a.id = m.account_id WHERE m.principal_id='u2' ORDER BY a.kind");
    assert.deepEqual(rows.map((r) => r.kind), ["consumer", "provider"],
      "today a provider cannot book a service without changing their own role");
  });

  await t.test("a contact verification is created only where one demonstrably happened", async () => {
    await seed();
    backfill(["--apply"]);
    // u2 and u4: verified=1 via otp -> evidence exists
    // u3: verified=1 via email -> a flag with no record of what was verified
    for (const id of ["u2", "u4"]) {
      const [r] = await db.query("SELECT COUNT(*) c FROM contact_verification WHERE principal_id=?", [id]);
      assert.equal(r[0].c, 1, `${id} should carry its OTP verification forward`);
    }
    const [none] = await db.query("SELECT COUNT(*) c FROM contact_verification WHERE principal_id='u3'");
    assert.equal(none[0].c, 0, "migrating an unevidenced flag would manufacture proof");
  });

  await t.test("§22: a normalised-duplicate phone STOPS the backfill and writes nothing", async () => {
    await reset();
    // Both pass the raw UNIQUE index; both normalise to the same digits.
    await db.query(
      `INSERT INTO users (id,name,phone,role,login_method,is_active) VALUES
       ('d1','Dash','01799-999999','customer','otp',1),
       ('d2','Plain','01799999999','customer','otp',1)`);
    let threw = false;
    try { backfill(["--apply"]); } catch (err) {
      threw = true;
      assert.match(String(err.stdout || "") + String(err.stderr || ""), /refusing to apply|BLOCKER/i);
    }
    assert.ok(threw, "the backfill must refuse, not proceed");
    const [rows] = await db.query("SELECT COUNT(*) c FROM principal");
    assert.equal(rows[0].c, 0, "nothing may be written while a duplicate is unresolved");
  });
});
