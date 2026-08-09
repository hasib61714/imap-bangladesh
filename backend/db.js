const mysql = require("mysql2/promise");
require("dotenv").config();
const env = require("./config/environment");

// Phase 2.75 (V-01): before a single connection is opened, refuse to run
// a non-production process against a production database. Every Phase 0.5
// safety control depends on that separation holding.
env.assertEnvironmentIsCoherent();

// TiDB Cloud requires SSL; standard Node.js CA bundle covers TiDB's certificate
const sslConfig = process.env.DB_SSL === "true"
  ? { rejectUnauthorized: true, minVersion: "TLSv1.2" }
  : false;

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || "localhost",
  port:               parseInt(process.env.DB_PORT || "3306"),
  user:               process.env.DB_USER     || "root",
  password:           process.env.DB_PASSWORD || "",
  database:           process.env.DB_NAME     || "imap_db",
  charset:            "utf8mb4",
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  timezone:           "+06:00",   // Bangladesh Standard Time
  decimalNumbers:     true,
  ssl:                sslConfig || undefined,
});

// ── Runtime DDL guard (I-02) ────────────────────────────────
// §5's target is "Runtime DDL = 0". The static checker cannot see a fully
// dynamic verb, so the guard also runs at execution time where the statement
// is a concrete string. See src/shared/ddl-guard.js for what each control can
// and cannot catch.
const ddlGuard = require("./src/shared/ddl-guard");

ddlGuard.guard(pool);

// Pooled connections are reused, so each is wrapped once and remembers it.
const rawGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async function () {
  return ddlGuard.guard(await rawGetConnection());
};

// Test connection on startup
pool.getConnection()
  .then(conn => {
    const d = env.describe();
    console.log(
      `✅ MySQL connected — db=${d.dbName} host=${d.dbHost} ` +
      `process=${d.processEnv} data=${d.databaseEnv}` +
      (d.acknowledgedOverride ? "  ⚠ PRODUCTION OVERRIDE ACKNOWLEDGED" : "")
    );
    conn.release();
  })
  .catch(err => {
    console.error("❌ MySQL connection failed:", err.message);
  });

/**
 * Run `fn` inside a single database transaction.
 *
 * Phase 0.5 containment for P0-11: before this, every money path was a
 * sequence of independent autocommit statements, so a failure between
 * them left a balance debited with no booking (or credited with no
 * ledger row) and no way to detect the drift.
 *
 * Scope is deliberately narrow — only the critical financial boundaries
 * listed in docs/audit/PHASE-0.5-CONTAINMENT-PLAN.md §2 use this.
 *
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<any>} fn
 * @returns {Promise<any>} whatever `fn` resolves to
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* connection already gone */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = pool;
module.exports.withTransaction = withTransaction;
module.exports.enableDdl = ddlGuard.enableDdl;
module.exports.RuntimeDdlError = ddlGuard.RuntimeDdlError;
