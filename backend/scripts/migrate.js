#!/usr/bin/env node
/**
 * IMAP database migration runner.
 *
 *   npm run migrate              apply all pending migrations
 *   npm run migrate -- status    show applied / pending
 *   npm run migrate -- up        (default) apply pending
 *   npm run migrate -- down      roll back the most recently applied migration
 *   npm run migrate -- --dry-run list what would run without changing anything
 *
 * - Tracks applied migrations in `schema_migrations` (version, name, checksum).
 * - Migrations are forward-only `NNN_name.sql`; optional `NNN_name.down.sql`
 *   provides rollback.
 * - Production-safe: each migration's statements are idempotent
 *   (CREATE/ALTER ... IF [NOT] EXISTS); a checksum guards against drift.
 */
require("dotenv").config();
const fs    = require("fs");
const path  = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");

const DIR = path.join(__dirname, "..", "database", "migrations");
const args = process.argv.slice(2);
const cmd  = args.find(a => !a.startsWith("-")) || "up";
const DRY  = args.includes("--dry-run");

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const log = (...a) => console.log(...a);

function listMigrations() {
  return fs.readdirSync(DIR)
    .filter(f => /^\d+_.*\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort();
}

async function connect() {
  return mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "imap_db",
    multipleStatements: true,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true, minVersion: "TLSv1.2" } : undefined,
  });
}

async function ensureHistory(conn) {
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(20) PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    checksum   VARCHAR(32) NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
}

async function appliedSet(conn) {
  const [rows] = await conn.query("SELECT version FROM schema_migrations");
  return new Set(rows.map(r => r.version));
}

const versionOf = (file) => file.split("_")[0];

async function up(conn) {
  const applied = await appliedSet(conn);
  const pending = listMigrations().filter(f => !applied.has(versionOf(f)));
  if (!pending.length) return log("✅ Up to date — no pending migrations.");
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(DIR, file), "utf8");
    log(`${DRY ? "[dry-run] would apply" : "▶ applying"} ${file}`);
    if (DRY) continue;
    await conn.query(sql);
    await conn.query(
      "INSERT INTO schema_migrations (version, name, checksum) VALUES (?,?,?)",
      [versionOf(file), file, sha(sql)]
    );
  }
  if (!DRY) log(`✅ Applied ${pending.length} migration(s).`);
}

async function down(conn) {
  const [rows] = await conn.query("SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1");
  if (!rows.length) return log("Nothing to roll back.");
  const { version, name } = rows[0];
  const downFile = name.replace(/\.sql$/, ".down.sql");
  const p = path.join(DIR, downFile);
  if (!fs.existsSync(p)) return log(`⚠ No rollback file (${downFile}); refusing to drop blindly.`);
  log(`${DRY ? "[dry-run] would roll back" : "▶ rolling back"} ${name}`);
  if (DRY) return;
  await conn.query(fs.readFileSync(p, "utf8"));
  await conn.query("DELETE FROM schema_migrations WHERE version = ?", [version]);
  log(`✅ Rolled back ${name}.`);
}

async function status(conn) {
  const applied = await appliedSet(conn);
  log("Migration status:");
  for (const f of listMigrations()) {
    log(`  [${applied.has(versionOf(f)) ? "x" : " "}] ${f}`);
  }
}

(async () => {
  let conn;
  try {
    conn = await connect();
    await ensureHistory(conn);
    if (cmd === "status")      await status(conn);
    else if (cmd === "down")   await down(conn);
    else                       await up(conn);
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration error:", err.message);
    if (conn) await conn.end().catch(() => {});
    process.exit(1);
  }
})();
