/**
 * I-02 — the runtime DDL guard
 *
 * §5's target is "Runtime DDL = 0", and it says the verification must be
 * "genuinely capable of detecting DDL", including dynamically constructed SQL.
 *
 * The static checker was measured against five evasions and caught NONE of
 * them at I-01. Hardened, it catches four; the fifth — a fully dynamic verb —
 * is not statically detectable by anything. This guard is what closes it,
 * because at execution time the statement is a concrete string.
 *
 * Negative control: delete the `if (isDdl(text)) throw` line in
 * src/shared/ddl-guard.js#assertNotDdl and every "refuses" test here fails.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const guard = require("../src/shared/ddl-guard");

function fakePool() {
  const seen = [];
  const target = {
    query: async (sql) => { seen.push(sql); return [[], []]; },
    execute: async (sql) => { seen.push(sql); return [[], []]; },
    seen,
  };
  return guard.guard(target);
}

test.beforeEach(() => guard.__resetForTests());

// ── refuses every form of DDL ─────────────────────────────────

const DDL_FORMS = {
  "plain CREATE TABLE": "CREATE TABLE x (id INT)",
  "IF NOT EXISTS": "CREATE TABLE IF NOT EXISTS x (id INT)",
  "split across lines": "CREATE\n  TABLE\n  x (id INT)",
  "built by concatenation": "CRE" + "ATE" + " TABLE x (id INT)",
  "ALTER": "ALTER TABLE users ADD COLUMN sneaky INT",
  "DROP TABLE": "DROP TABLE users",
  "RENAME TABLE": "RENAME TABLE users TO users_old",
  "TRUNCATE": "TRUNCATE TABLE audit_log",
  "CREATE INDEX": "CREATE UNIQUE INDEX ix ON users (email)",
  "DROP INDEX": "DROP INDEX ix ON users",
  "CREATE DATABASE": "CREATE DATABASE imap_db",
  "DROP DATABASE": "DROP DATABASE imap_db",
  "lowercase": "create table x (id int)",
  "leading whitespace and comment": "  /* c */ CREATE TABLE x (id INT)",
};

for (const [name, sql] of Object.entries(DDL_FORMS)) {
  test(`refuses DDL — ${name}`, async () => {
    const pool = fakePool();
    await assert.rejects(() => pool.query(sql), (err) => {
      assert.equal(err.name, "RuntimeDdlError");
      assert.equal(err.code, "RUNTIME_DDL_REFUSED");
      return true;
    });
    assert.equal(pool.seen.length, 0, "the statement reached the driver");
  });
}

test("refuses DDL through execute() as well as query()", async () => {
  const pool = fakePool();
  await assert.rejects(() => pool.execute("CREATE TABLE x (id INT)"), /Refusing to execute DDL/);
  assert.equal(pool.seen.length, 0);
});

test("refuses DDL passed as an options object", async () => {
  const pool = fakePool();
  await assert.rejects(() => pool.query({ sql: "DROP TABLE users" }), /Refusing to execute DDL/);
});

// ── permits everything else ───────────────────────────────────

const ALLOWED = {
  select: "SELECT * FROM users WHERE id = ?",
  insert: "INSERT INTO bookings (id, quote_id) VALUES (?, ?)",
  update: "UPDATE bookings SET state = ? WHERE id = ? AND state = ?",
  delete: "DELETE FROM refresh_tokens WHERE expires_at < NOW()",
  "information_schema probe": "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()",
  "a column named like a verb": "SELECT created_at, dropped_at FROM t WHERE table_ref = ?",
  transaction: "START TRANSACTION",
};

for (const [name, sql] of Object.entries(ALLOWED)) {
  test(`permits ordinary SQL — ${name}`, async () => {
    const pool = fakePool();
    await pool.query(sql);
    assert.equal(pool.seen.length, 1);
  });
}

test("DDL text in a PARAMETER is not DDL", async () => {
  // The defect this avoids: a message body or a search term containing the
  // words "DROP TABLE" must not break the application. Parameters are not SQL.
  const pool = fakePool();
  await pool.query("INSERT INTO messages (body) VALUES (?)", ["please DROP TABLE users"]);
  assert.equal(pool.seen.length, 1);
});

// ── the exemption ─────────────────────────────────────────────

test("enableDdl() lifts the guard — this is how the migration runner works", async () => {
  const pool = fakePool();
  await assert.rejects(() => pool.query("CREATE TABLE x (id INT)"));
  guard.enableDdl();
  await pool.query("CREATE TABLE x (id INT)");
  assert.equal(pool.seen.length, 1);
});

test("guarding the same target twice does not double-wrap", async () => {
  const pool = fakePool();
  guard.guard(pool);
  guard.guard(pool);
  await assert.rejects(() => pool.query("CREATE TABLE x (id INT)"), /Refusing to execute DDL/);
  guard.enableDdl();
  await pool.query("SELECT 1");
  assert.equal(pool.seen.length, 1, "a double wrap would push the statement twice");
});

// ── the error is useful ───────────────────────────────────────

test("the refusal names the statement and says where schema changes belong", async () => {
  const pool = fakePool();
  await assert.rejects(() => pool.query("CREATE TABLE sneaky (id INT)"), (err) => {
    assert.match(err.message, /CREATE TABLE sneaky/);
    assert.match(err.message, /backend\/migrations/);
    assert.match(err.message, /enableDdl/);
    return true;
  });
});

test("isDdl() is exported and agrees with the guard", () => {
  assert.equal(guard.isDdl("CREATE TABLE x (id INT)"), true);
  assert.equal(guard.isDdl("SELECT 1"), false);
  assert.equal(guard.isDdl(undefined), false);
  assert.equal(guard.isDdl(null), false);
  assert.equal(guard.isDdl(42), false);
});
