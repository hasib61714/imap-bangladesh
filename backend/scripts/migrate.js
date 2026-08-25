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

// I-02: db.js refuses DDL at runtime. The migration runner is the one place
// allowed to issue it, so it lifts the guard explicitly. A boundary rule
// fails CI if anything outside scripts/ calls this.
pool.enableDdl();

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

/**
 * Create the ledger, and reconcile one that another runner created.
 *
 * `CREATE TABLE IF NOT EXISTS` succeeds silently against a `schema_migrations`
 * that already exists with a DIFFERENT shape, and this repository contains a
 * second migrator (`database/migrator.js`) whose ledger has `name` and
 * `checksum` where this one has `statements`. Production was built by that
 * one. So the first `INSERT` here failed with
 *
 *     Unknown column 'statements' in 'INSERT INTO'
 *
 * — after nineteen statements of migration 001 had already been applied, and
 * with nothing recorded in the ledger to say so. The run is idempotent, so
 * that is recoverable; a runner that leaves a database mid-migration and
 * unable to record the fact is still not something to discover in production.
 *
 * Widening `version` matters for the same reason: the other ledger declares it
 * VARCHAR(20), and `003_formalise_runtime_tables` is 28 characters. That would
 * have failed six migrations later, at the point where truncation, not error,
 * is the plausible outcome on a server not in STRICT mode.
 *
 * Both are additive and safe to re-run. Neither touches an applied row: the
 * two ledgers use different version strings, so the five rows written by the
 * other runner stay exactly as they are and are simply not recognised as this
 * chain's — which is correct, because they are not.
 */
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    VARCHAR(64) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      statements INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB
  `);

  const [cols] = await pool.query(
    `SELECT column_name AS name, character_maximum_length AS len,
            is_nullable AS nul, column_default AS dflt, column_type AS ctype,
            extra AS extra
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'`
  );
  /**
   * Read one information_schema field, whatever case the server returned.
   *
   * MySQL 8 answers with UPPERCASE column names and MariaDB with lowercase,
   * so every read needs both. It must NOT be written `c.dflt ?? c.DFLT`:
   * `column_default` is legitimately NULL for a column that has no default,
   * and `null ?? undefined` is `undefined`, which is not `null` — so the one
   * case the check exists to detect is the one it silently misses. Key
   * presence, not nullishness.
   */
  const field = (c, key) => (key in c ? c[key] : c[key.toUpperCase()]);
  const by = new Map(cols.map((c) => [String(field(c, "name")).toLowerCase(), c]));

  if (!by.has("statements")) {
    console.log("· schema_migrations was created by another runner — adding `statements`");
    await pool.query("ALTER TABLE schema_migrations ADD COLUMN statements INT NOT NULL DEFAULT 0");
  }
  const version = by.get("version");
  const width = version ? Number(field(version, "len") || 0) : 0;
  if (width && width < 64) {
    console.log(`· schema_migrations.version is VARCHAR(${width}) — widening to 64`);
    await pool.query("ALTER TABLE schema_migrations MODIFY version VARCHAR(64) NOT NULL");
  }

  /**
   * Columns this runner does not write, that the other runner requires.
   *
   * The other ledger declares `name` and `checksum` NOT NULL with no default,
   * so this runner's three-column INSERT failed with
   *
   *     Field 'name' doesn't have a default value
   *
   * — again after a migration's statements had already been applied. Rather
   * than teach this runner about the other's columns (which is a coupling
   * that rots), any foreign NOT NULL column without a default is made
   * nullable. Nothing this runner records is lost, and rows the other runner
   * wrote keep their values: NULL is permitted going forward, not applied
   * backward.
   */
  const OURS = new Set(["version", "applied_at", "statements"]);
  for (const c of cols) {
    const name = String(field(c, "name")).toLowerCase();
    if (OURS.has(name)) continue;
    const nullable = String(field(c, "nul")).toUpperCase() === "YES";
    const hasDefault = field(c, "dflt") != null;
    const generated = /auto_increment|GENERATED/i.test(String(field(c, "extra") || ""));
    if (nullable || hasDefault || generated) continue;
    console.log(`· schema_migrations.${name} is required by another runner — making it nullable`);
    await pool.query(
      `ALTER TABLE schema_migrations MODIFY \`${name}\` ${field(c, "ctype")} NULL`
    );
  }
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
