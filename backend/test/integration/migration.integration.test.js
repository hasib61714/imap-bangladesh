/**
 * Phase 2.75 — migration tool integration tests
 *
 * These are the first tests in this repository that touch a real database
 * engine. They run ONLY against an explicitly nominated disposable
 * instance and skip otherwise, so `npm test` stays offline by default.
 *
 *   IMAP_TEST_DB_HOST=127.0.0.1 IMAP_TEST_DB_PORT=3399 \
 *   IMAP_TEST_DB_USER=root IMAP_TEST_DB_PASSWORD= \
 *   npm test
 *
 * Refusal to run against anything that is not development-class is
 * enforced below, not merely documented — see docs/engineering/
 * TESTING-STRATEGY.md §4 and ENVIRONMENT-ARCHITECTURE.md §6.
 */
const test   = require("node:test");
const assert = require("node:assert/strict");
const path   = require("node:path");
const { execFileSync } = require("node:child_process");

const HOST = process.env.IMAP_TEST_DB_HOST;
const PORT = process.env.IMAP_TEST_DB_PORT || "3306";
const USER = process.env.IMAP_TEST_DB_USER || "root";
const PASS = process.env.IMAP_TEST_DB_PASSWORD || "";

const BACKEND = path.join(__dirname, "..", "..");
const SUITE   = `imap_it_${process.pid}`;

const configured = Boolean(HOST);

/** Never let this suite point at anything but a local, disposable engine. */
const LOCAL = new Set(["127.0.0.1", "localhost", "::1", "host.docker.internal"]);
if (configured && !LOCAL.has(String(HOST).toLowerCase())) {
  throw new Error(
    `IMAP_TEST_DB_HOST=${HOST} is not a loopback address. ` +
    `Integration tests create and drop databases and must never address a shared server.`
  );
}

function childEnv(extra = {}) {
  return {
    ...process.env,
    APP_ENV: "test",
    DATABASE_ENV: "test",
    DB_HOST: HOST, DB_PORT: PORT, DB_USER: USER, DB_PASSWORD: PASS,
    DB_SSL: "false",
    DB_NAME: SUITE,
    ...extra,
  };
}

function migrate(args = [], extra = {}) {
  return execFileSync(process.execPath, ["scripts/migrate.js", ...args], {
    cwd: BACKEND, env: childEnv(extra), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
}

async function connect(database) {
  const mysql = require("mysql2/promise");
  return mysql.createConnection({
    host: HOST, port: Number(PORT), user: USER, password: PASS,
    database, multipleStatements: true,
  });
}

test("migration tool", { skip: configured ? false : "IMAP_TEST_DB_HOST not set" }, async (t) => {
  const admin = await connect(undefined);
  await admin.query(`DROP DATABASE IF EXISTS \`${SUITE}\``);
  await admin.query(`CREATE DATABASE \`${SUITE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  const fs = require("node:fs");
  const schema = fs.readFileSync(path.join(BACKEND, "schema.sql"), "utf8");

  // Baseline for the `USE imap_db` regression below. The engine may
  // legitimately already hold a database of that name; what must not
  // happen is schema.sql adding to it.
  const countIn = async (name) => {
    const [r] = await admin.query(
      "SELECT COUNT(*) c FROM information_schema.tables WHERE table_schema = ?", [name]
    );
    return r[0].c;
  };
  const imapDbTablesBefore = await countIn("imap_db");

  const db = await connect(SUITE);
  await db.query(schema);

  t.after(async () => {
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${SUITE}\``);
    await admin.end();
  });

  const tableExists = async (name) => {
    const [r] = await db.query(
      "SELECT COUNT(*) c FROM information_schema.tables WHERE table_schema = ? AND table_name = ?",
      [SUITE, name]
    );
    return r[0].c > 0;
  };

  await t.test("schema.sql applies to the database the connection selected", async () => {
    assert.equal(await tableExists("users"), true);
    // Regression: schema.sql used to open with `USE imap_db`, so it wrote
    // to imap_db no matter which database you selected.
    assert.equal(
      await countIn("imap_db"), imapDbTablesBefore,
      "schema.sql must not create or write to a hardcoded imap_db"
    );
  });

  await t.test("--status is read-only and does not create schema_migrations", async () => {
    assert.equal(await tableExists("schema_migrations"), false);
    const out = migrate(["--status"]);
    assert.match(out, /schema_migrations does not exist/);
    assert.match(out, /· pending {2}002_phase05_containment/);
    assert.equal(await tableExists("schema_migrations"), false, "--status wrote DDL");
  });

  await t.test("applying migrations reaches the expected schema", async () => {
    const out = migrate();
    assert.match(out, /002_phase05_containment applied/);

    const col = async (table, column) => {
      const [r] = await db.query(
        "SELECT COLUMN_TYPE t FROM information_schema.columns WHERE table_schema=? AND table_name=? AND column_name=?",
        [SUITE, table, column]
      );
      return r[0]?.t;
    };
    assert.match(await col("wallet_transactions", "type"), /'withdrawal'/);
    assert.match(await col("kyc_docs", "doc_type"), /'driving_license'/);
    assert.equal(await col("push_subscriptions", "user_id"), "varchar(36)");
    assert.equal(await col("providers", "is_approved"), "tinyint(1)");
    assert.equal(await tableExists("blood_requests"), true);
    assert.equal(await tableExists("disaster_reports"), true);

    const [idx] = await db.query(
      "SELECT non_unique FROM information_schema.statistics WHERE table_schema=? AND table_name='wallet_transactions' AND index_name='uniq_wallet_ref'",
      [SUITE]
    );
    assert.equal(idx[0]?.non_unique, 0, "ledger idempotency index must be UNIQUE");
  });

  await t.test("re-running an already-applied migration is safe", async () => {
    await db.query("DELETE FROM schema_migrations WHERE version='002_phase05_containment'");
    const out = migrate();
    assert.match(out, /already applied \(ER_DUP_KEYNAME\)/);
    assert.match(out, /already applied \(ER_DUP_FIELDNAME\)/);
    assert.match(out, /002_phase05_containment applied/);
  });

  await t.test("duplicate ledger references abort the migration instead of losing them", async () => {
    const dupDb = `${SUITE}_dup`;
    await admin.query(`DROP DATABASE IF EXISTS \`${dupDb}\``);
    await admin.query(`CREATE DATABASE \`${dupDb}\``);
    const d = await connect(dupDb);
    await d.query(schema);
    await d.query("INSERT INTO users (id,name,phone) VALUES ('u1','A','01799999999')");
    await d.query(
      "INSERT INTO wallet_transactions (user_id,type,amount,ref_id) VALUES ('u1','credit',10,'booking:1:payout'),('u1','credit',10,'booking:1:payout')"
    );

    assert.throws(
      () => migrate([], { DB_NAME: dupDb }),
      (err) => {
        const output = String(err.stdout || "") + String(err.stderr || "");
        assert.match(output, /failed at statement 2/);
        return true;
      },
      "the unique index must not be created by discarding rows"
    );

    const [r] = await d.query("SELECT COUNT(*) c FROM wallet_transactions");
    assert.equal(r[0].c, 2, "no ledger row may be destroyed by a failed migration");

    await d.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${dupDb}\``);
  });

  await t.test("many NULL references are permitted — legacy rows do not block the index", async () => {
    const nullDb = `${SUITE}_null`;
    await admin.query(`DROP DATABASE IF EXISTS \`${nullDb}\``);
    await admin.query(`CREATE DATABASE \`${nullDb}\``);
    const d = await connect(nullDb);
    await d.query(schema);
    await d.query("INSERT INTO users (id,name,phone) VALUES ('u1','A','01799999998')");
    await d.query("INSERT INTO wallet_transactions (user_id,type,amount,ref_id) VALUES ('u1','credit',5,NULL),('u1','credit',5,NULL),('u1','credit',5,NULL)");

    const out = migrate([], { DB_NAME: nullDb });
    assert.match(out, /002_phase05_containment applied/);

    await d.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${nullDb}\``);
  });

  await t.test("layer 1 — a non-production process cannot even open a production database", async () => {
    assert.throws(
      () => migrate([], { DATABASE_ENV: "production" }),
      (err) => {
        // db.js refuses at require time, before migrate.js runs at all.
        assert.match(String(err.stdout || "") + String(err.stderr || ""), /Refusing to start/);
        return true;
      }
    );
  });

  await t.test("layer 2 — a production process must still acknowledge the target", async () => {
    const prod = { APP_ENV: "production", DATABASE_ENV: "production" };
    assert.throws(
      () => migrate([], prod),
      (err) => {
        assert.match(String(err.stdout || "") + String(err.stderr || ""), /Refusing to run "database migration"/);
        return true;
      }
    );
    // ...and permitted once the exact database name is typed out.
    const out = migrate([], { ...prod, IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION: SUITE });
    assert.match(out, /Nothing to migrate|applied/);
  });

  await t.test("--status stays read-only even against a production target", async () => {
    const out = migrate(["--status"], { APP_ENV: "production", DATABASE_ENV: "production" });
    assert.match(out, /✔ applied {2}002_phase05_containment/);
  });
});
