// Unit tests for the migration engine — hermetic, uses a fake connection
// (no DB). Proves ordering, recording, idempotency tolerance, and that real
// errors still surface.
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { runMigrations, splitStatements, listMigrations } = require("../database/migrator");

// A fake mysql2 connection. Records executed statements; optionally throws a
// given errno for statements matching `failOn`.
function fakeConn({ failOn = null, failErrno = null } = {}) {
  const applied = [];
  const stmts   = [];
  return {
    async query(sql, params) {
      if (/^SELECT version FROM schema_migrations/i.test(sql)) return [applied.map(v => ({ version: v })), []];
      if (/^INSERT INTO schema_migrations/i.test(sql)) { applied.push(params[0]); return [{}, []]; }
      if (/^CREATE TABLE IF NOT EXISTS schema_migrations/i.test(sql)) return [{}, []];
      stmts.push(sql);
      if (failOn && failOn.test(sql)) { const e = new Error("simulated"); e.errno = failErrno; throw e; }
      return [{}, []];
    },
    async end() {},
    _applied: applied,
    _stmts: stmts,
  };
}

test("splitStatements strips comments and splits on semicolons", () => {
  const out = splitStatements("-- a comment\nCREATE TABLE x (id INT);\n-- another\nALTER TABLE x ADD y INT;");
  assert.deepEqual(out, ["CREATE TABLE x (id INT)", "ALTER TABLE x ADD y INT"]);
});

test("runMigrations applies every migration in order and records each", async () => {
  const conn = fakeConn();
  const res = await runMigrations({ connect: async () => conn, log: () => {} });
  const versions = listMigrations().map(f => f.split("_")[0]);
  assert.deepEqual(conn._applied, versions, "all migrations recorded, in order");
  assert.equal(res.applied.length, versions.length);
});

test("idempotency errors (dup index/column/table) are skipped, not fatal", async () => {
  // Simulate the bare `CREATE INDEX` in 003 hitting an already-existing index.
  const conn = fakeConn({ failOn: /CREATE INDEX/i, failErrno: 1061 });
  const res = await runMigrations({ connect: async () => conn, log: () => {} });
  assert.equal(res.applied.length, listMigrations().length, "chain completes despite dup-index errors");
});

test("a real (non-idempotent) error aborts the run", async () => {
  const conn = fakeConn({ failOn: /CREATE TABLE IF NOT EXISTS referrals|referrals/i, failErrno: 1064 }); // syntax error
  await assert.rejects(() => runMigrations({ connect: async () => conn, log: () => {} }));
});

test("already-applied migrations are not re-run (idempotent scheduling)", async () => {
  const conn = fakeConn();
  await runMigrations({ connect: async () => conn, log: () => {} });
  const firstCount = conn._stmts.length;
  await runMigrations({ connect: async () => conn, log: () => {} }); // second run
  assert.equal(conn._stmts.length, firstCount, "no DDL re-executed on a second run");
});
