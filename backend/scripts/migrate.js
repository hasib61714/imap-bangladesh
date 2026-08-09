/**
 * Minimal forward-only migration runner — IMAP
 *
 *   node scripts/migrate.js            apply pending migrations
 *   node scripts/migrate.js --status   list applied / pending
 *   node scripts/migrate.js --stamp N  record N as applied without running it
 *
 * Introduced in Phase 0.5 because database-level idempotency, the
 * column-type corrections and neutralising the seeded credential all
 * require versioned, reviewable DDL. It deliberately does NOT try to be
 * a migration framework: forward-only, no down migrations, one table.
 *
 * Unlike the runtime DDL it replaces, this runner never swallows an
 * error silently. A small enumerated set of "object already exists"
 * codes is tolerated so a partially-migrated database can be brought
 * forward, and every tolerated statement is printed.
 *
 * Phase 2.75 corrects two safety defects found by Phase 2.5:
 *
 *  1. `--status` used to call ensureTable() before branching, so the
 *     documented read-only command executed CREATE TABLE. It was
 *     therefore unusable for inspecting a database you did not intend
 *     to write to — including production. It is now genuinely read-only
 *     and reports an uninitialised database instead of initialising it.
 *
 *  2. Nothing distinguished a production target from any other. Applying
 *     and stamping now require an explicit typed acknowledgement when
 *     the configured database is production.
 */
require("dotenv").config();
const fs   = require("fs");
const path = require("path");
const pool = require("../db");
const env  = require("../config/environment");

const DIR = path.join(__dirname, "..", "migrations");

// Re-run tolerance: these mean "this statement's effect already exists".
// Anything else aborts the migration.
const TOLERATED = new Set([
  "ER_DUP_FIELDNAME",      // ADD COLUMN that already exists
  "ER_DUP_KEYNAME",        // CREATE INDEX that already exists
  "ER_TABLE_EXISTS_ERROR", // CREATE TABLE without IF NOT EXISTS
  "ER_CANT_DROP_FIELD_OR_KEY",
]);

/** Strip full-line comments, then split on statement-terminating semicolons. */
function parseStatements(sql) {
  return sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n")
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Read-only existence probe. Used by --status so that inspecting a
 * database never writes to it.
 */
async function migrationsTableExists() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name   = 'schema_migrations'`
  );
  return rows[0].c > 0;
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    VARCHAR(64) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      statements INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB
  `);
}

async function appliedVersions() {
  const [rows] = await pool.query("SELECT version FROM schema_migrations");
  return new Set(rows.map((r) => r.version));
}

function allMigrations() {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ version: f.replace(/\.sql$/, ""), file: path.join(DIR, f) }));
}

async function runOne({ version, file }) {
  const statements = parseStatements(fs.readFileSync(file, "utf8"));
  console.log(`\n▶ ${version}  (${statements.length} statements)`);

  let tolerated = 0;
  for (const [i, stmt] of statements.entries()) {
    const label = `  [${String(i + 1).padStart(2, "0")}] ${stmt.split("\n")[0].slice(0, 72)}`;
    try {
      const [res] = await pool.query(stmt);
      const affected = res && typeof res.affectedRows === "number" ? ` — ${res.affectedRows} row(s)` : "";
      console.log(`${label} ✓${affected}`);
    } catch (err) {
      if (TOLERATED.has(err.code)) {
        tolerated++;
        console.log(`${label} ↷ already applied (${err.code})`);
        continue;
      }
      console.error(`${label} ✗`);
      console.error(`       ${err.code || "ERROR"}: ${err.message}`);
      throw new Error(`Migration ${version} failed at statement ${i + 1}`);
    }
  }

  await pool.query(
    "INSERT INTO schema_migrations (version, statements) VALUES (?, ?)",
    [version, statements.length]
  );
  console.log(`✔ ${version} applied${tolerated ? ` (${tolerated} statement(s) already present)` : ""}`);
}

async function main() {
  const arg = process.argv[2];
  const migrations = allMigrations();
  const target = env.describe();

  console.log(
    `target: ${target.dbHost}:${target.dbPort}/${target.dbName}  ` +
    `(process=${target.processEnv}, data=${target.databaseEnv})`
  );

  // ── Read-only path. Touches nothing, creates nothing. ──────────
  if (arg === "--status") {
    if (!(await migrationsTableExists())) {
      console.log("\nschema_migrations does not exist — no migration has ever been applied.");
      console.log("(--status is read-only and will not create it; run without arguments to apply.)\n");
      for (const m of migrations) console.log(`· pending  ${m.version}`);
      return;
    }
    const applied = await appliedVersions();
    for (const m of migrations) {
      console.log(`${applied.has(m.version) ? "✔ applied" : "· pending"}  ${m.version}`);
    }
    return;
  }

  // ── Everything below this line writes. ─────────────────────────
  env.requireProductionAcknowledgement(arg === "--stamp" ? "migration stamp" : "database migration");

  await ensureTable();
  const applied = await appliedVersions();

  if (arg === "--stamp") {
    const v = process.argv[3];
    if (!v) throw new Error("--stamp requires a version");
    await pool.query(
      "INSERT IGNORE INTO schema_migrations (version, statements) VALUES (?, 0)",
      [v]
    );
    console.log(`✔ stamped ${v} as applied (not executed)`);
    return;
  }

  const pending = migrations.filter((m) => !applied.has(m.version));
  if (!pending.length) {
    console.log("Nothing to migrate — schema is up to date.");
    return;
  }
  console.log(`${pending.length} pending migration(s).`);
  for (const m of pending) await runOne(m);
  console.log("\n🎉 Migrations complete.");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(`\n❌ ${err.message}`);
    pool.end().finally(() => process.exit(1));
  });
