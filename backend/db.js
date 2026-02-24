const mysql = require("mysql2/promise");
require("dotenv").config();

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

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log("✅ MySQL connected — DB:", process.env.DB_NAME);
    conn.release();
  })
  .catch(err => {
    console.error("❌ MySQL connection failed:", err.message);
  });

module.exports = pool;
