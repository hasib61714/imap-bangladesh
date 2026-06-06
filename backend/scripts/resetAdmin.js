/**
 * Reset an admin password — SECURE.
 *
 * The old hardcoded `admin123` reset has been removed. Provide credentials via
 * the environment; the password must satisfy the strength policy and is stored
 * as a bcrypt hash (never printed). This delegates to the same code path as
 * `npm run create-admin`, which promotes/updates an existing user safely.
 *
 *   ADMIN_EMAIL=ops@imap.bd ADMIN_PASSWORD='S0me-Strong-Pass!' node scripts/resetAdmin.js
 */
require("./createAdmin.js");
