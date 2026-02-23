/**
 * Reset admin password
 * Usage: node scripts/resetAdmin.js
 * Default credentials after running:
 *   Email   : admin@imap.bd
 *   Phone   : 01700000000
 *   Password: admin123
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const mysql  = require("mysql2/promise");

async function resetAdmin() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || "localhost",
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME     || "imap_db",
    charset:  "utf8mb4",
  });

  const password = "admin123";
  const hash     = await bcrypt.hash(password, 10);

  // Upsert admin user
  await conn.query(`
    INSERT INTO users (id, name, email, phone, password_hash, role, kyc_status, verified, balance, points, referral_code)
    VALUES ('admin-001', 'Admin User', 'admin@imap.bd', '01700000000', ?, 'admin', 'verified', 1, 0, 0, 'ADMIN001')
    ON DUPLICATE KEY UPDATE password_hash = ?, name = 'Admin User', role = 'admin', verified = 1
  `, [hash, hash]);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Admin password reset successfully!");
  console.log("📧 Email   : admin@imap.bd");
  console.log("📱 Phone   : 01700000000");
  console.log("🔑 Password: admin123");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  await conn.end();
}

resetAdmin().catch(err => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
