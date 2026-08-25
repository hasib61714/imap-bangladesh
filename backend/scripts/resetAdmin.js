/**
 * Administrator bootstrap / password rotation — IMAP
 *
 *   node scripts/resetAdmin.js
 *
 * Phase 0.5 (P0-9). This script used to set every administrator's
 * password to the literal string `admin123`, which was printed in its
 * own header comment and committed to the repository. That credential
 * must be treated as compromised on any database it ever touched.
 *
 * It now refuses to use any hardcoded value:
 *
 *   ADMIN_BOOTSTRAP_EMAIL     required (or ADMIN_BOOTSTRAP_PHONE)
 *   ADMIN_BOOTSTRAP_PHONE     required (or ADMIN_BOOTSTRAP_EMAIL)
 *   ADMIN_BOOTSTRAP_NAME      optional, defaults to "IMAP Administrator"
 *   ADMIN_BOOTSTRAP_PASSWORD  optional; if unset a 24-char password is
 *                             generated and printed ONCE to stdout
 *
 * The generated password is never written to a file or a log.
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const pool = require("../db");
const env = require("../config/environment");

const MIN_PASSWORD_LENGTH = 12;

/** URL-safe, unambiguous alphabet; ~142 bits of entropy at 24 chars. */
function generatePassword(length = 24) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function main() {
  // Phase 2.75: bootstrapping an administrator against production is a
  // legitimate operation, but never an accidental one.
  env.requireProductionAcknowledgement("administrator bootstrap");

  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || "").trim() || null;
  const phone = (process.env.ADMIN_BOOTSTRAP_PHONE || "").trim() || null;
  const name  = (process.env.ADMIN_BOOTSTRAP_NAME  || "").trim() || "IMAP Administrator";

  if (!email && !phone) {
    throw new Error(
      "Set ADMIN_BOOTSTRAP_EMAIL and/or ADMIN_BOOTSTRAP_PHONE before running this script.\n" +
      "   No default administrator identity is provided — that was the vulnerability."
    );
  }
  if (phone && !/^01[0-9]{9}$/.test(phone)) {
    throw new Error("ADMIN_BOOTSTRAP_PHONE must be 11 digits starting with 01");
  }

  const supplied = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  let generated = false;
  let password;

  if (supplied) {
    if (supplied.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`ADMIN_BOOTSTRAP_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const weak = ["admin123", "password", "demo1234", "changeme", "admin1234"];
    if (weak.includes(supplied.toLowerCase())) {
      throw new Error("ADMIN_BOOTSTRAP_PASSWORD is a known-compromised value. Choose another.");
    }
    password = supplied;
  } else {
    password = generatePassword();
    generated = true;
  }

  const hash = await bcrypt.hash(password, 12);

  // Locate an existing administrator by the supplied identity.
  const [existing] = await pool.query(
    `SELECT id, role FROM users
      WHERE (? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?)
      LIMIT 1`,
    [email, email, phone, phone]
  );

  let userId;
  let action;

  if (existing.length) {
    userId = existing[0].id;
    await pool.query(
      "UPDATE users SET password_hash = ?, role = 'admin', is_active = 1, verified = 1, name = ? WHERE id = ?",
      [hash, name, userId]
    );
    action = "rotated";
  } else {
    userId = uuidv4();
    const refCode = crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 8);
    await pool.query(
      `INSERT INTO users (id, name, email, phone, password_hash, role, kyc_status, verified, is_active, balance, points, referral_code)
       VALUES (?, ?, ?, ?, ?, 'admin', 'verified', 1, 1, 0, 0, ?)`,
      [userId, name, email, phone, hash, refCode]
    );
    action = "created";
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ Administrator ${action}`);
  console.log(`   id    : ${userId}`);
  if (email) console.log(`   email : ${email}`);
  if (phone) console.log(`   phone : ${phone}`);
  if (generated) {
    console.log("");
    console.log("   Generated password (shown once, not stored anywhere):");
    console.log(`   ${password}`);
    console.log("");
    console.log("   Copy it to your password manager now.");
  } else {
    console.log("   password : (taken from ADMIN_BOOTSTRAP_PASSWORD)");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(`❌ ${err.message}`);
    pool.end().finally(() => process.exit(1));
  });
