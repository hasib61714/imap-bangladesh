#!/usr/bin/env node
/**
 * Securely create (or promote) an admin account.
 *
 *   ADMIN_EMAIL=ops@imap.bd ADMIN_PASSWORD='S0me-Strong-Pass!' npm run create-admin
 *
 * - Reads ADMIN_EMAIL / ADMIN_PASSWORD from the environment ONLY.
 * - Enforces the password strength policy.
 * - bcrypt-hashes the password (cost 12); the plaintext is never logged.
 * - Writes an ADMIN_CREATED entry to the audit_log.
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const pool = require("../db");
const { validatePasswordStrength } = require("../utils/password");
const { audit } = require("../utils/audit");

function fail(msg) { console.error(`❌ ${msg}`); process.exit(1); }

(async () => {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const name = (process.env.ADMIN_NAME || "Administrator").trim();

  if (!email)    fail("ADMIN_EMAIL env var is required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("ADMIN_EMAIL is not a valid email.");
  if (!password) fail("ADMIN_PASSWORD env var is required.");

  const strength = validatePasswordStrength(password);
  if (!strength.ok) fail(`ADMIN_PASSWORD too weak — needs: ${strength.errors.join(", ")}.`);

  try {
    const hash = await bcrypt.hash(password, 12);
    const [existing] = await pool.query("SELECT id, role FROM users WHERE email = ?", [email]);

    let id, action;
    if (existing.length) {
      id = existing[0].id;
      await pool.query(
        "UPDATE users SET password_hash = ?, role = 'admin', is_active = 1, kyc_status = 'verified', verified = 1 WHERE id = ?",
        [hash, id]
      );
      action = "ADMIN_UPDATED";
      console.log(`✅ Existing user promoted to admin: ${email}`);
    } else {
      id = uuidv4();
      const refCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      await pool.query(
        `INSERT INTO users (id, name, email, password_hash, role, kyc_status, verified, is_active, balance, points, referral_code)
         VALUES (?,?,?,?,'admin','verified',1,1,0,0,?)`,
        [id, name, email, hash, refCode]
      );
      action = "ADMIN_CREATED";
      console.log(`✅ Admin created: ${email}`);
    }

    await audit({ actor_id: id, actor_role: "admin", action, target_type: "user", target_id: id, meta: { email } });
    console.log("🔒 Password stored as a bcrypt hash (never logged).");
    process.exit(0);
  } catch (err) {
    fail(`Failed to create admin: ${err.message}`);
  }
})();
