// ─────────────────────────────────────────────────────────────
//  IMAP – Migration engine (single source of truth for schema).
//
//  Applies the numbered `NNN_name.sql` files in database/migrations in order,
//  tracking applied versions in `schema_migrations`. Used by BOTH the CLI
//  (scripts/migrate.js) and the server at startup (server.js) — so the schema
//  is defined in exactly one place and no ad-hoc DDL lives in the boot path.
//
//  Idempotency: statements are executed individually and "already exists"
//  errors (table/column/index/foreign-key already present) are treated as
//  no-ops. This makes the whole chain safe to run:
//    • from an empty DB (fresh install),
//    • on an existing prod DB that was built by the old boot-time DDL
//      (migrations just get recorded), and
//    • repeatedly (re-running never fails).
//  It also keeps bare `CREATE INDEX` (no portable IF NOT EXISTS in MySQL)
//  from breaking a re-run.
// ─────────────────────────────────────────────────────────────
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");
const mysql  = require("mysql2/promise");

const DIR = path.join(__dirname, "migrations");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const versionOf = (file) => file.split("_")[0];

// MySQL/MariaDB/TiDB error numbers that mean "object already exists / already
// gone" — i.e. the migration statement is a no-op on this DB.
const IDEMPOTENT_ERRNO = new Set([
  1050, // ER_TABLE_EXISTS_ERROR
  1060, // ER_DUP_FIELDNAME (column already exists)
  1061, // ER_DUP_KEYNAME (index already exists)
  1091, // ER_CANT_DROP_FIELD_OR_KEY (dropping something absent)
  1826, // ER_FK_DUP_NAME (duplicate foreign key)
]);

function listMigrations() {
  return fs.readdirSync(DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort();
}

// Split a migration file into individual statements. These files are plain DDL
// with no stored routines or `;` inside literals, so a simple split is safe.
function splitStatements(sql) {
  return sql
    .split("\n").filter((line) => !/^\s*--/.test(line)).join("\n") // strip line comments
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function defaultConnect() {
  return mysql.createConnection({
    host:     process.env.DB_HOST || "localhost",
    port:     parseInt(process.env.DB_PORT || "3306"),
    user:     process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "imap_db",
    ssl:      process.env.DB_SSL === "true" ? { rejectUnauthorized: true, minVersion: "TLSv1.2" } : undefined,
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
  return new Set(rows.map((r) => r.version));
}

async function applyFile(conn, file, log) {
  const sql = fs.readFileSync(path.join(DIR, file), "utf8");
  for (const stmt of splitStatements(sql)) {
    try {
      await conn.query(stmt);
    } catch (e) {
      if (IDEMPOTENT_ERRNO.has(e.errno)) continue; // object already present — no-op
      throw Object.assign(e, { migration: file });
    }
  }
  await conn.query(
    "INSERT INTO schema_migrations (version, name, checksum) VALUES (?,?,?)",
    [versionOf(file), file, sha(sql)]
  );
}

/**
 * Apply all pending migrations. Options:
 *   connect  → () => Promise<connection>  (defaults to env-based mysql2)
 *   log      → (msg) => void
 *   dry      → boolean (list without applying)
 * Returns { applied: string[] }.
 */
async function runMigrations({ connect = defaultConnect, log = () => {}, dry = false } = {}) {
  const conn = await connect();
  try {
    await ensureHistory(conn);
    const applied = await appliedSet(conn);
    const pending = listMigrations().filter((f) => !applied.has(versionOf(f)));
    if (!pending.length) { log("up to date — no pending migrations"); return { applied: [] }; }
    const done = [];
    for (const file of pending) {
      log(`${dry ? "[dry-run] would apply" : "applying"} ${file}`);
      if (dry) continue;
      await applyFile(conn, file, log);
      done.push(file);
    }
    if (!dry) log(`applied ${done.length} migration(s)`);
    return { applied: done };
  } finally {
    await conn.end().catch(() => {});
  }
}

async function status({ connect = defaultConnect, log = console.log } = {}) {
  const conn = await connect();
  try {
    await ensureHistory(conn);
    const applied = await appliedSet(conn);
    log("Migration status:");
    for (const f of listMigrations()) log(`  [${applied.has(versionOf(f)) ? "x" : " "}] ${f}`);
  } finally {
    await conn.end().catch(() => {});
  }
}

async function rollback({ connect = defaultConnect, log = console.log, dry = false } = {}) {
  const conn = await connect();
  try {
    await ensureHistory(conn);
    const [rows] = await conn.query("SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1");
    if (!rows.length) { log("nothing to roll back"); return; }
    const { version, name } = rows[0];
    const downFile = name.replace(/\.sql$/, ".down.sql");
    const p = path.join(DIR, downFile);
    if (!fs.existsSync(p)) { log(`no rollback file (${downFile}); refusing to drop blindly`); return; }
    log(`${dry ? "[dry-run] would roll back" : "rolling back"} ${name}`);
    if (dry) return;
    for (const stmt of splitStatements(fs.readFileSync(p, "utf8"))) {
      try { await conn.query(stmt); } catch (e) { if (!IDEMPOTENT_ERRNO.has(e.errno)) throw e; }
    }
    await conn.query("DELETE FROM schema_migrations WHERE version = ?", [version]);
    log(`rolled back ${name}`);
  } finally {
    await conn.end().catch(() => {});
  }
}

module.exports = { runMigrations, status, rollback, listMigrations, splitStatements };
