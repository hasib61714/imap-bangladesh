/**
 * What is in the target database, before anything changes it.
 *
 *   node scripts/production-inventory.mjs
 *
 * WHY
 * ───
 * `migrations/000_reconcile_foreign_schema.sql` renames the existing
 * `audit_log` aside. The rename is instant at any size and the table is not
 * modified, so it is reversible exactly — but "reversible" is only reassuring
 * if someone wrote down what was there first. This writes it down.
 *
 * It also answers the two questions `docs/DEPLOYING.md` leaves open until it
 * is run against production rather than a replica: how many providers would
 * stop being listed, and how much data the migration has to move.
 *
 * STRICTLY READ-ONLY
 * ──────────────────
 * Every statement is a SELECT. There is no code path here that writes, and
 * the connection is opened without the production acknowledgement that
 * `scripts/migrate.js` requires precisely because this one cannot change
 * anything. Safe to run against production at any time, including while it is
 * serving traffic.
 *
 * Env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const mysql = require("mysql2/promise");

const c = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: String(process.env.DB_SSL).toLowerCase() === "true" ? { minVersion: "TLSv1.2" } : undefined,
});

/** One row, first column. Returns null where the table does not exist. */
async function scalar(sql, params = []) {
  try {
    const [rows] = await conn.query(sql, params);
    if (!rows.length) return null;
    return Object.values(rows[0])[0];
  } catch (err) {
    // A missing table OR a missing column both mean "this database does not
    // have that yet", which is the ordinary answer here rather than a fault:
    // production predates several of the columns this chain adds. Production
    // has no `providers.is_approved` at all — that arrives with 002.
    if (err.code === "ER_NO_SUCH_TABLE" || err.code === "ER_BAD_FIELD_ERROR") return null;
    throw err;
  }
}

const [[version]] = await conn.query("SELECT VERSION() AS v");
console.log(`\n  ${c.b}${process.env.DB_HOST}/${process.env.DB_NAME}${c.x}  ${c.d}(${version.v})${c.x}`);
console.log(`  ${c.d}read-only — every statement below is a SELECT${c.x}\n`);

// ── The ledger ───────────────────────────────────────────────
console.log(`  ${c.b}MIGRATION LEDGER${c.x}`);
try {
  const [led] = await conn.query("SELECT * FROM schema_migrations ORDER BY version");
  if (!led.length) console.log(`    ${c.y}empty${c.x}`);
  for (const row of led) {
    const label = row.name || row.version;
    console.log(`    ${row.version.toString().padEnd(34)} ${String(label).slice(0, 30)}`);
  }
  const [cols] = await conn.query(
    `SELECT column_name AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'
      ORDER BY ordinal_position`);
  console.log(`    ${c.d}columns: ${cols.map((x) => x.n || x.N).join(", ")}${c.x}`);
} catch {
  console.log(`    ${c.y}no schema_migrations — nothing has ever been applied${c.x}`);
}

// ── audit_log, the table migration 000 moves ─────────────────
console.log(`\n  ${c.b}AUDIT_LOG${c.x}  ${c.d}(migration 000 renames this to audit_log_pre_i03)${c.x}`);
const [auditCols] = await conn.query(
  `SELECT column_name AS n, column_type AS t FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'audit_log' ORDER BY ordinal_position`);
if (!auditCols.length) {
  console.log(`    ${c.g}no audit_log — nothing to move${c.x}`);
} else {
  const names = auditCols.map((x) => x.n || x.N);
  const isForeign = !names.includes("occurred_at");
  console.log(`    columns   ${names.join(", ")}`);
  console.log(`    ROW COUNT ${c.b}${await scalar("SELECT COUNT(*) FROM audit_log")}${c.x}`);
  console.log(`    oldest    ${await scalar("SELECT MIN(created_at) FROM audit_log").catch(() => "—")}`);
  console.log(`    shape     ${isForeign
    ? c.y + "the OTHER chain's — migration 000 will move it aside" + c.x
    : c.g + "this chain's — migration 000 is a no-op" + c.x}`);
  const already = await scalar(
    `SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'audit_log_pre_i03'`);
  if (already) console.log(`    ${c.y}audit_log_pre_i03 already exists — 000 has run before${c.x}`);
}

// ── What the trust gate will hide ────────────────────────────
console.log(`\n  ${c.b}PROVIDER LISTING${c.x}  ${c.d}(TRUST-ARCHITECTURE §5)${c.x}`);
const providers = await scalar("SELECT COUNT(*) FROM providers");
if (providers === null) {
  console.log(`    ${c.d}no providers table${c.x}`);
} else {
  console.log(`    total            ${providers}`);
  const approved = await scalar("SELECT COUNT(*) FROM providers WHERE is_approved = 1");
  if (approved === null) {
    // Production predates the column. Migration 002 adds it, and its DEFAULT
    // decides whether these providers stay listed — which is the whole
    // de-listing question, answered by the migration rather than by the data.
    console.log(`    ${c.y}no is_approved column — this database predates migration 002${c.x}`);
  } else {
    console.log(`    is_approved = 1  ${approved}`);
  }
  const hasCases = await scalar(
    `SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'verification_case'`);
  if (!hasCases) {
    // Before migration 011 there are no cases, so the count that matters is
    // how many approved providers have no legacy KYC either — those are the
    // ones the backfill cannot carry forward on evidence.
    const noKyc = await scalar(
      `SELECT COUNT(*) FROM providers p WHERE p.is_approved = 1
         AND NOT EXISTS (SELECT 1 FROM kyc_docs k WHERE k.user_id = p.user_id)`);
    console.log(`    approved with no KYC row at all   ${c.y}${noKyc}${c.x}`);
    console.log(`    ${c.d}migration 011 carries migration 002's grandfathering into${c.x}`);
    console.log(`    ${c.d}listing_state, so these keep their listing. Re-run this${c.x}`);
    console.log(`    ${c.d}after 011 to see the real post-migration answer.${c.x}`);
  } else {
    console.log(`    would be de-listed ${await scalar(
      `SELECT COUNT(*) FROM providers p WHERE p.is_approved = 1
         AND NOT EXISTS (SELECT 1 FROM verification_case v
                          WHERE v.principal_id = p.user_id
                            AND v.kind = 'identity' AND v.state = 'verified')`)}`);
  }
}

// ── Who the providers actually are ───────────────────────────
//
// The public directory requires a verified `verification_case`. Migration 011
// backfills those from `kyc_docs`, so where `kyc_docs` is empty every provider
// stops being listed the moment the new backend deploys. Whether that is a
// catastrophe or a correction depends entirely on who these rows are, which
// is why this prints them.
console.log(`\n  ${c.b}THE PROVIDERS THEMSELVES${c.x}`);
try {
  const [rows] = await conn.query(
    `SELECT p.id, u.name, u.email, u.phone, u.joined_at,
            (SELECT COUNT(*) FROM bookings b WHERE b.provider_id = p.id) AS bookings,
            (SELECT COUNT(*) FROM kyc_docs k WHERE k.user_id = p.user_id) AS kyc
       FROM providers p LEFT JOIN users u ON u.id = p.user_id
      ORDER BY u.joined_at`);
  for (const r of rows) {
    const demo = /^(01[3-9]\d{8})$/.test(String(r.phone || "")) ? "" : " ";
    console.log(`    ${String(r.name || "(no user)").padEnd(24)} ` +
                `${String(r.email || "—").padEnd(28)} ` +
                `bookings=${r.bookings}  kyc=${r.kyc}${demo}`);
  }
  const real = rows.filter((r) => Number(r.bookings) > 0 || Number(r.kyc) > 0).length;
  console.log(`    ${c.d}${rows.length} provider(s); ${real} with a booking or a KYC record${c.x}`);
} catch (err) {
  console.log(`    ${c.d}unavailable: ${err.code}${c.x}`);
}

// ── How much data the migration touches ──────────────────────
console.log(`\n  ${c.b}DATA VOLUME${c.x}`);
const TABLES = ["users", "providers", "bookings", "kyc_docs", "payments",
                "wallet_transactions", "notifications", "reviews", "media_assets"];
for (const t of TABLES) {
  const n = await scalar(`SELECT COUNT(*) FROM \`${t}\``);
  console.log(`    ${t.padEnd(22)} ${n === null ? c.d + "—" + c.x : n}`);
}
const tables = await scalar(
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()");
console.log(`    ${"(tables in schema)".padEnd(22)} ${tables}`);

console.log(`\n  ${c.d}Nothing above changed anything.${c.x}\n`);
await conn.end();
