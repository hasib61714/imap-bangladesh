/**
 * Schema diff — what does the target have, and what do the migrations expect?
 *
 *   node scripts/schema-diff.mjs
 *
 * WHY
 * ───
 * Production's `schema_migrations` ledger records a DIFFERENT migration
 * lineage from the one in this repository:
 *
 *   ledger : 001_initial.sql, 002_security.sql, 003_refresh_tokens.sql, …
 *   repo   : 001_baseline.sql, 002_phase05_containment.sql, …
 *
 * So `migrate.js` considers all twelve pending and would try to apply the
 * baseline to a live database that already has data in it. Before anyone can
 * decide what to do about that, they need to know what is actually
 * different — which is what this prints.
 *
 * READ-ONLY against the target. It builds a reference schema in a LOCAL
 * throwaway database by running the migration chain, then compares.
 *
 * Env: DB_*            the target (read-only)
 *      REF_DB_*        a local database it may create and drop
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const mysql = require("mysql2/promise");
// fileURLToPath, not manual URL surgery — a Windows path out of a file://
// URL is percent-encoded and drive-prefixed, and hand-rolling it produced a
// cwd that did not exist, which surfaced as a misleading ENOENT on node.exe.
const BACKEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "backend");

const target = {
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: String(process.env.DB_SSL).toLowerCase() === "true" ? { minVersion: "TLSv1.2" } : undefined,
};
const ref = {
  host: process.env.REF_DB_HOST || "127.0.0.1", port: Number(process.env.REF_DB_PORT || 3306),
  user: process.env.REF_DB_USER || "root", password: process.env.REF_DB_PASSWORD || "",
};
const REF_NAME = `imap_schemaref_${crypto.randomBytes(3).toString("hex")}`;

const c = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", x: "\x1b[0m" };

/** Tables → columns → index names, normalised so two engines compare cleanly. */
async function readSchema(conn, dbName) {
  const [cols] = await conn.query(
    `SELECT LOWER(table_name) t, LOWER(column_name) col, LOWER(column_type) type, is_nullable nul
       FROM information_schema.columns WHERE table_schema = ? ORDER BY t, col`, [dbName]);
  const [idx] = await conn.query(
    `SELECT LOWER(table_name) t, LOWER(index_name) i
       FROM information_schema.statistics WHERE table_schema = ? GROUP BY t, i`, [dbName]);

  /**
   * Display widths are noise, not difference.
   *
   * MariaDB reports `int(11)` and `tinyint(4)`; MySQL 8 and TiDB dropped the
   * display width and report `int` and `tinyint`. The reference schema is
   * built on whatever is local, so without this every integer column in
   * every table reads as a difference and buries the real ones.
   */
  const normalise = (t) => String(t || "")
    .replace(/(int|tinyint|smallint|mediumint|bigint)\(\d+\)/g, "$1")
    .replace(/\s+/g, " ").trim();

  const schema = new Map();
  for (const r of cols) {
    const t = r.t || r.T, col = r.col || r.COL;
    if (!schema.has(t)) schema.set(t, { columns: new Map(), indexes: new Set() });
    schema.get(t).columns.set(col, { type: normalise(r.type || r.TYPE), nullable: r.nul || r.NUL });
  }
  for (const r of idx) {
    const t = r.t || r.T, i = r.i || r.I;
    if (schema.has(t)) schema.get(t).indexes.add(i);
  }
  return schema;
}

const refAdmin = await mysql.createConnection(ref);
await refAdmin.query(`DROP DATABASE IF EXISTS \`${REF_NAME}\``);
await refAdmin.query(`CREATE DATABASE \`${REF_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

try {
  console.log(`\n  building the reference schema from the migration chain…`);
  execFileSync(process.execPath, ["scripts/migrate.js"], {
    cwd: BACKEND, stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env, APP_ENV: "test", DATABASE_ENV: "test",
      DB_HOST: ref.host, DB_PORT: String(ref.port), DB_USER: ref.user,
      DB_PASSWORD: ref.password, DB_NAME: REF_NAME, DB_SSL: "false",
    },
  });

  const refConn = await mysql.createConnection({ ...ref, database: REF_NAME });
  const expected = await readSchema(refConn, REF_NAME);
  await refConn.end();

  const tgtConn = await mysql.createConnection(target);
  const [[v]] = await tgtConn.query("SELECT VERSION() AS v");
  const actual = await readSchema(tgtConn, target.database);
  await tgtConn.end();

  console.log(`  target : ${target.host}/${target.database}  (${v.v})`);
  console.log(`  expected ${expected.size} tables, target has ${actual.size}\n`);

  const missingTables = [], extraTables = [], changed = [];

  for (const [t, def] of expected) {
    if (!actual.has(t)) { missingTables.push(t); continue; }
    const have = actual.get(t);
    const missingCols = [...def.columns.keys()].filter((k) => !have.columns.has(k));
    const missingIdx = [...def.indexes].filter((i) => !have.indexes.has(i));
    const typeDiff = [...def.columns.entries()]
      .filter(([k, d]) => have.columns.has(k) && have.columns.get(k).type !== d.type)
      .map(([k, d]) => `${k}: expected ${d.type}, has ${have.columns.get(k).type}`);
    if (missingCols.length || missingIdx.length || typeDiff.length) {
      changed.push({ t, missingCols, missingIdx, typeDiff });
    }
  }
  for (const t of actual.keys()) if (!expected.has(t)) extraTables.push(t);

  if (missingTables.length) {
    console.log(`${c.r}  TABLES THE MIGRATIONS CREATE THAT THE TARGET DOES NOT HAVE (${missingTables.length})${c.x}`);
    for (const t of missingTables) console.log(`    − ${t}`);
    console.log();
  }
  if (changed.length) {
    console.log(`${c.y}  TABLES THAT EXIST BUT DIFFER (${changed.length})${c.x}`);
    for (const ch of changed) {
      console.log(`    ~ ${ch.t}`);
      for (const m of ch.missingCols) console.log(`        missing column  ${m}`);
      for (const i of ch.missingIdx)  console.log(`        missing index   ${i}`);
      for (const d of ch.typeDiff)    console.log(`        ${c.d}type differs    ${d}${c.x}`);
    }
    console.log();
  }
  if (extraTables.length) {
    console.log(`${c.d}  TABLES THE TARGET HAS THAT THE MIGRATIONS DO NOT CREATE (${extraTables.length})${c.x}`);
    console.log(`    ${extraTables.join(", ")}\n`);
  }

  const clean = !missingTables.length && !changed.length;
  console.log(clean
    ? `${c.g}  The target already matches the migration chain.${c.x}\n`
    : `${c.y}  The target is behind the migration chain. Nothing here has been changed.${c.x}\n`);
} finally {
  await refAdmin.query(`DROP DATABASE IF EXISTS \`${REF_NAME}\``);
  await refAdmin.end();
}
