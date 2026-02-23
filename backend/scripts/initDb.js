require("dotenv").config();
const fs    = require("fs");
const path  = require("path");
const mysql = require("mysql2/promise");

async function initDb() {
  // Connect without selecting a DB first
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || "localhost",
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
    charset: "utf8mb4",
  });

  console.log("✅ Connected to MySQL");

  const dbName = process.env.DB_NAME || "imap_db";
  const sql    = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");

  // Create DB if not exists, then switch to it
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${dbName}\``);

  console.log(`📦 Using database: ${dbName}`);

  // Execute schema SQL (strip empty statements)
  const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
  let done = 0, skipped = 0;
  for (const stmt of statements) {
    try {
      await conn.query(stmt);
      done++;
    } catch (e) {
      // Duplicate entry or already-exists errors are expected on re-run
      if (e.code === "ER_DUP_ENTRY" || e.code === "ER_TABLE_EXISTS_ERROR") {
        skipped++;
      } else {
        console.warn("⚠️  Skipped statement:", e.message.substring(0, 80));
        skipped++;
      }
    }
  }

  console.log(`✅ Schema executed: ${done} stmts OK, ${skipped} skipped`);
  await conn.end();
  console.log("🎉 Database initialised successfully!");
}

initDb().catch(err => {
  console.error("❌ initDb failed:", err.message);
  process.exit(1);
});
