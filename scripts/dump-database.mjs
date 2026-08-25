/**
 * A logical backup of every table, before a migration touches any of them.
 *
 *   node scripts/dump-database.mjs [outputPath]
 *
 * WHY THIS EXISTS RATHER THAN "TAKE A BACKUP FIRST"
 * ────────────────────────────────────────────────
 * `docs/DEPLOYING.md` says to take a backup, which is advice rather than a
 * backup. TiDB Cloud's own point-in-time restore is the real safety net and
 * this does not replace it — but it is in a different system, behind a
 * console this process cannot reach, and its existence is an assumption until
 * somebody checks. This produces a file you can look at.
 *
 * It writes plain `INSERT` statements plus each table's `SHOW CREATE TABLE`,
 * so restoring is `mysql < dump.sql` and inspecting is `less dump.sql`. For a
 * database of this size that is a better property than compactness.
 *
 * READ-ONLY against the source. Every statement is SHOW or SELECT.
 *
 * ⚠ THE OUTPUT CONTAINS PERSONAL DATA
 * ───────────────────────────────────
 * Names, emails, phone numbers, bcrypt password hashes, and whatever is in
 * `kyc_docs`. It is a copy of the database and must be treated as one: keep it
 * off shared drives, out of the repository, and delete it once the migration
 * it protects has succeeded. The default output path is outside the repo for
 * that reason, and the script refuses to write inside a git working tree.
 *
 * Env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const mysql = require("mysql2/promise");

const out = process.argv[2] || path.join(process.cwd(), "imap-backup.sql");

/**
 * Refuse to write a file full of password hashes into a git working tree.
 * A `.gitignore` entry is a promise; being outside the tree is a fact.
 */
for (let dir = path.resolve(path.dirname(out)); ; ) {
  if (fs.existsSync(path.join(dir, ".git"))) {
    console.error(`\n  Refusing to write inside a git working tree: ${dir}`);
    console.error(`  This file contains password hashes and personal data.`);
    console.error(`  Pass a path outside the repository.\n`);
    process.exit(1);
  }
  const up = path.dirname(dir);
  if (up === dir) break;
  dir = up;
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: String(process.env.DB_SSL).toLowerCase() === "true" ? { minVersion: "TLSv1.2" } : undefined,
});

/** SQL literal for one value. */
function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (Buffer.isBuffer(v)) return `X'${v.toString("hex")}'`;
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace("T", " ")}'`;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\0/g, "\\0")}'`;
}

const [[v]] = await conn.query("SELECT VERSION() AS v");
const [tables] = await conn.query(
  `SELECT table_name AS n FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`);

const stamp = (await conn.query("SELECT NOW() AS t"))[0][0].t;
const fd = fs.openSync(out, "w");
const w = (s) => fs.writeSync(fd, s);

w(`-- IMAP logical backup\n`);
w(`-- source   ${process.env.DB_HOST}/${process.env.DB_NAME}\n`);
w(`-- server   ${v.v}\n`);
w(`-- taken    ${stamp}\n`);
w(`-- tables   ${tables.length}\n--\n`);
w(`-- Restore:  mysql -h HOST -P PORT -u USER -p DBNAME < ${path.basename(out)}\n`);
w(`-- CONTAINS PERSONAL DATA AND PASSWORD HASHES. Delete when no longer needed.\n\n`);
w(`SET FOREIGN_KEY_CHECKS = 0;\n\n`);

let totalRows = 0;
for (const t of tables) {
  const name = t.n || t.N;
  const [[create]] = await conn.query(`SHOW CREATE TABLE \`${name}\``);
  const ddl = create["Create Table"] || create["Create View"];

  const [rows] = await conn.query(`SELECT * FROM \`${name}\``);
  totalRows += rows.length;

  w(`-- ─────────────────────────────────────────────────────\n`);
  w(`-- ${name}  (${rows.length} row${rows.length === 1 ? "" : "s"})\n`);
  w(`-- ─────────────────────────────────────────────────────\n`);
  w(`DROP TABLE IF EXISTS \`${name}\`;\n${ddl};\n\n`);

  if (rows.length) {
    const cols = Object.keys(rows[0]);
    const colList = cols.map((k) => `\`${k}\``).join(", ");
    // One statement per row: a corrupt row cannot take the whole table's
    // insert with it, and a diff of two dumps stays readable.
    for (const r of rows) {
      w(`INSERT INTO \`${name}\` (${colList}) VALUES (${cols.map((k) => lit(r[k])).join(", ")});\n`);
    }
    w("\n");
  }
  process.stdout.write(`  ${name.padEnd(28)} ${String(rows.length).padStart(6)} rows\n`);
}

w(`SET FOREIGN_KEY_CHECKS = 1;\n`);
fs.closeSync(fd);
await conn.end();

const bytes = fs.statSync(out).size;
console.log(`\n  ${tables.length} tables, ${totalRows} rows → ${out}`);
console.log(`  ${(bytes / 1024).toFixed(1)} KB\n`);
console.log(`  This file contains personal data and password hashes.`);
console.log(`  Delete it once the migration it protects has succeeded.\n`);
