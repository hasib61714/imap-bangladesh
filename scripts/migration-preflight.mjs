/**
 * Migration preflight — can this database actually enforce migrations 011/012?
 *
 *   node scripts/migration-preflight.mjs
 *
 * Migrations 011 and 012 are verified on MariaDB 12.2.2 and, through CI, on
 * MySQL 8.0. Neither is TiDB, which is what production runs. TiDB has
 * historically PARSED `CHECK` constraints and then ignored them — so a
 * migration can apply cleanly and leave the constraint doing nothing, which
 * is the failure mode you least want to discover from data.
 *
 * This answers that question without applying anything. It creates one
 * scratch table with a random name, tries to violate each constraint, drops
 * the table, and reports what the engine actually did. It never reads,
 * writes or references an application table.
 *
 * Point it at a TiDB branch or a restored copy first if you can. Pointing it
 * at production is safe by construction, but "safe by construction" is worth
 * less than "tried it somewhere else first".
 *
 * Env: DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME DB_SSL
 */
import { createRequire } from "node:module";
import crypto from "node:crypto";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const mysql = require("mysql2/promise");

const cfg = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: String(process.env.DB_SSL).toLowerCase() === "true" ? { minVersion: "TLSv1.2" } : undefined,
};

for (const [k, v] of Object.entries({ DB_HOST: cfg.host, DB_USER: cfg.user, DB_NAME: cfg.database })) {
  if (!v) { console.error(`${k} is required`); process.exit(2); }
}

const c = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", x: "\x1b[0m" };
const TABLE = `_imap_preflight_${crypto.randomBytes(4).toString("hex")}`;

let pass = 0, fail = 0, warn = 0;
const check = (ok, name, detail) => {
  if (ok === "warn") { warn++; console.log(`${c.y}!${c.x} ${name}\n    ${c.d}${detail}${c.x}`); return; }
  if (ok) { pass++; console.log(`${c.g}✔${c.x} ${name}`); }
  else { fail++; console.log(`${c.r}✖${c.x} ${name}\n    ${c.r}${detail}${c.x}`); }
};

/** Did the engine REFUSE this statement? That is what we are testing for. */
async function refuses(conn, sql, params = []) {
  try { await conn.query(sql, params); return null; }
  catch (err) { return err; }
}

const conn = await mysql.createConnection(cfg);

try {
  const [[ver]] = await conn.query("SELECT VERSION() AS v");
  const isTiDB = /tidb/i.test(ver.v);
  console.log(`\n  target : ${cfg.host}:${cfg.port}/${cfg.database}`);
  console.log(`  engine : ${ver.v}${isTiDB ? "  (TiDB)" : ""}\n`);

  // ── 1. Does the engine accept the DDL at all? ─────────────
  const ddlErr = await refuses(conn, `
    CREATE TABLE ${TABLE} (
      pk          VARCHAR(36) PRIMARY KEY,
      case_id     VARCHAR(36) NOT NULL,
      state       ENUM('submitted','verified','rejected') NOT NULL,
      reason      VARCHAR(500) NULL,
      deleted_at  DATETIME(3) NULL,
      live_slot   CHAR(1) NULL,
      -- identity_document's shape: the UNIQUE spans the case and the slot,
      -- NOT the primary key. That is what lets many retired rows coexist.
      UNIQUE KEY uniq_live (case_id, live_slot),
      CONSTRAINT chk_reason CHECK (state <> 'rejected' OR reason IS NOT NULL),
      CONSTRAINT chk_slot CHECK (
        (deleted_at IS NULL     AND live_slot <=> '1') OR
        (deleted_at IS NOT NULL AND live_slot IS NULL)
      )
    ) ENGINE=InnoDB`);
  check(!ddlErr, "the DDL is accepted (CHECK constraints, <=> inside one)",
    ddlErr && ddlErr.message);

  if (ddlErr) {
    console.log(`\n${c.r}  Migration 011 will not apply to this engine as written.${c.x}\n`);
    process.exit(1);
  }

  // ── 2. Is chk_reason ENFORCED, or only parsed? ────────────
  const e1 = await refuses(conn,
    `INSERT INTO ${TABLE} (pk, case_id, state, live_slot) VALUES ('a','case-a','rejected','1')`);
  check(!!e1, "a refusal with no reason is REFUSED (chk_reason_when_refused)",
    "the row was ACCEPTED — this engine parses CHECK constraints and does not enforce them. " +
    "R-1103 then rests on the domain and the repository alone.");

  // ── 3. Is the null-safe slot constraint enforced? ─────────
  const e2 = await refuses(conn,
    `INSERT INTO ${TABLE} (pk, case_id, state, deleted_at, live_slot) VALUES ('b','case-b','submitted',NULL,NULL)`);
  check(!!e2, "a live row with no slot is REFUSED (chk_live_slot, the <=> case)",
    "the row was ACCEPTED — two live documents of one kind could then coexist, " +
    "because the UNIQUE index does not collide on NULLs either.");

  // ── 4. Does the UNIQUE index behave the way 011 relies on? ─
  await refuses(conn, `INSERT INTO ${TABLE} (pk, case_id, state, live_slot) VALUES ('c1','case-c','submitted','1')`);
  // A DIFFERENT row claiming the same live slot on the same case.
  const dup = await refuses(conn,
    `INSERT INTO ${TABLE} (pk, case_id, state, live_slot) VALUES ('c2','case-c','submitted','1')`);
  check(!!dup && /duplicate/i.test(dup.message), "a duplicate live slot is REFUSED (uniq_live_document)",
    dup ? dup.message : "the duplicate was ACCEPTED");

  // NULLs must NOT collide — that is what lets many deleted rows coexist.
  await refuses(conn, `INSERT INTO ${TABLE} (pk, case_id, state, deleted_at, live_slot) VALUES ('d1','case-d','submitted',NOW(3),NULL)`);
  const nullDup = await refuses(conn,
    `INSERT INTO ${TABLE} (pk, case_id, state, deleted_at, live_slot) VALUES ('d2','case-d','submitted',NOW(3),NULL)`);
  check(!nullDup, "NULL slots do NOT collide (many retired rows per case)",
    nullDup && nullDup.message);

  // ── 5. Can migration 012 replace a constraint in place? ───
  const dropErr = await refuses(conn, `ALTER TABLE ${TABLE} DROP CONSTRAINT chk_reason`);
  if (dropErr) {
    check("warn", "ALTER TABLE … DROP CONSTRAINT is not supported",
      `${dropErr.message}\n    Migration 012 replaces migration 009's constraint this way. ` +
      "It will need rewriting for this engine — most likely as a table rebuild.");
  } else {
    const addErr = await refuses(conn,
      `ALTER TABLE ${TABLE} ADD CONSTRAINT chk_reason CHECK (state <> 'rejected' OR reason IS NOT NULL)`);
    check(!addErr, "a constraint can be dropped and re-added (migration 012)", addErr && addErr.message);
  }

  // ── 6. The queue index, on an empty table — plan shape only.
  const [plan] = await conn.query(`EXPLAIN SELECT pk FROM ${TABLE} WHERE state = 'submitted' ORDER BY pk LIMIT 30`);
  check(Array.isArray(plan) && plan.length > 0, "EXPLAIN is available for reviewing the queue plan",
    "could not read a query plan");

} finally {
  await conn.query(`DROP TABLE IF EXISTS ${TABLE}`).catch(() => {});
  await conn.end();
}

console.log(`\n  ${c.g}${pass} passed${c.x}   ${fail ? c.r : c.d}${fail} failed${c.x}   ${warn ? c.y : c.d}${warn} to review${c.x}`);
if (fail) {
  console.log(`\n  ${c.r}Do not treat the CHECK constraints as controls on this engine.${c.x}`);
  console.log(`  ${c.d}The migrations still apply; the domain and the repository remain the`);
  console.log(`  primary controls, which is the posture migration 009 already recorded.${c.x}\n`);
} else {
  console.log(`\n  ${c.g}This engine enforces everything migrations 011 and 012 rely on.${c.x}\n`);
}
process.exit(fail ? 1 : 0);
