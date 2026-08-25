#!/usr/bin/env node
/**
 * Identity backfill — legacy `users` → principal / account / membership /
 * credential / contact_verification   (plan id M-11)
 *
 *   node scripts/backfill-identity.js              ANALYSE ONLY (default)
 *   node scripts/backfill-identity.js --apply      write
 *   node scripts/backfill-identity.js --json
 *
 * DRY RUN IS THE DEFAULT, AND THAT IS THE POINT.
 *
 * §22 requires a duplicate analysis before any unique constraint can affect
 * existing data, and requires a STOP if duplicates exist. The analysis is
 * this script's dry run, so the thing you must read before writing is
 * produced by the same code that would do the writing — it cannot drift from
 * it.
 *
 * WHY THIS IS NOT A MIGRATION
 *
 * `npm run db:migrate` is routine. This is a HIGH-risk data transformation
 * with preconditions, a stop condition, and a documented dual-write window
 * (AUTH-MIGRATION-PLAN.md §7). Putting it in the migration chain would make a
 * deliberate operation a side effect of a routine one.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not switch anything over. `users` stays authoritative; `users.role`
 * stays the live authorization source until the cutover, which is a separate
 * owner-coordinated event that includes rotating JWT_SECRET and therefore
 * logging every user out.
 *
 * It is IDEMPOTENT: every write is INSERT ... ON DUPLICATE KEY UPDATE or
 * INSERT IGNORE keyed on a deterministic id, so a re-run after a partial
 * failure converges rather than duplicating.
 */
"use strict";

require("dotenv").config();
const crypto = require("crypto");
const pool = require("../db");
const env = require("../config/environment");
const { newId } = require("../src/shared/ids");
const { isBcryptHash } = require("../src/modules/identity/domain/credential");

const APPLY = process.argv.includes("--apply");
const JSON_OUT = process.argv.includes("--json");

const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");

/** Normalisation must be identical here and in the application, or lookups miss. */
const normEmail = (e) => (e ? String(e).trim().toLowerCase() : null);
const normPhone = (p) => (p ? String(p).replace(/[^0-9]/g, "") : null);

const out = { analysis: {}, blockers: [], warnings: [], applied: null };
const say = (...a) => { if (!JSON_OUT) console.log(...a); };

async function analyse() {
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM users");

  // ── §22 duplicate analysis ────────────────────────────────
  // Adding UNIQUE on a normalised identifier is only safe if the normalised
  // form is already unique. `users` has UNIQUE on the RAW columns, so
  // "user@x.com" and "User@X.com" coexist today and would collide.
  const [dupEmail] = await pool.query(`
    SELECT LOWER(TRIM(email)) AS value, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
      FROM users WHERE email IS NOT NULL AND TRIM(email) <> ''
     GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1`);
  const [dupPhone] = await pool.query(`
    SELECT REGEXP_REPLACE(phone,'[^0-9]','') AS value, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
      FROM users WHERE phone IS NOT NULL AND TRIM(phone) <> ''
     GROUP BY REGEXP_REPLACE(phone,'[^0-9]','') HAVING COUNT(*) > 1`);

  // ── credential shape ──────────────────────────────────────
  const [[{ withHash }]] = await pool.query(
    "SELECT COUNT(*) AS withHash FROM users WHERE password_hash IS NOT NULL AND password_hash <> ''");
  const [badHashes] = await pool.query(
    "SELECT id, password_hash FROM users WHERE password_hash IS NOT NULL AND password_hash <> ''");
  const malformed = badHashes.filter((r) => !isBcryptHash(r.password_hash));

  const [[{ nulled }]] = await pool.query(
    "SELECT COUNT(*) AS nulled FROM users WHERE password_hash IS NULL OR password_hash = ''");

  // ── roles ─────────────────────────────────────────────────
  const [roles] = await pool.query("SELECT role, COUNT(*) AS n FROM users GROUP BY role");
  const [admins] = await pool.query(
    "SELECT id, name, phone, email, joined_at FROM users WHERE role = 'admin' ORDER BY joined_at");

  // ── providers ─────────────────────────────────────────────
  const [orphanProviders] = await pool.query(`
    SELECT p.id, p.user_id FROM providers p
      LEFT JOIN users u ON u.id = p.user_id WHERE u.id IS NULL`);
  const [dupProviders] = await pool.query(`
    SELECT user_id, COUNT(*) AS n FROM providers GROUP BY user_id HAVING COUNT(*) > 1`);

  // ── verification ──────────────────────────────────────────
  const [[{ verifiedOtp }]] = await pool.query(
    "SELECT COUNT(*) AS verifiedOtp FROM users WHERE verified = 1 AND login_method = 'otp'");
  const [[{ verifiedOther }]] = await pool.query(
    "SELECT COUNT(*) AS verifiedOther FROM users WHERE verified = 1 AND (login_method <> 'otp' OR login_method IS NULL)");

  // ── social ────────────────────────────────────────────────
  const [socials] = await pool.query(
    "SELECT login_method, COUNT(*) AS n FROM users WHERE social_id IS NOT NULL AND social_id <> '' GROUP BY login_method");
  const [dupSocial] = await pool.query(`
    SELECT social_id, COUNT(*) AS n FROM users
     WHERE social_id IS NOT NULL AND social_id <> '' GROUP BY social_id HAVING COUNT(*) > 1`);

  out.analysis = {
    users: total,
    duplicateNormalisedEmail: dupEmail.length,
    duplicateNormalisedPhone: dupPhone.length,
    passwordCredentialsToCreate: withHash - malformed.length,
    malformedHashes: malformed.length,
    principalsWithNoPasswordCredential: nulled + malformed.length,
    roles: Object.fromEntries(roles.map((r) => [r.role || "(null)", r.n])),
    legacyAdmins: admins.length,
    orphanProviderRows: orphanProviders.length,
    duplicateProviderRows: dupProviders.length,
    contactVerificationsToCreate: verifiedOtp,
    verifiedFlagWithoutEvidence: verifiedOther,
    socialIdentities: Object.fromEntries(socials.map((s) => [s.login_method || "(null)", s.n])),
    duplicateSocialIds: dupSocial.length,
  };

  // ── §22 stop conditions ───────────────────────────────────
  if (dupEmail.length) {
    out.blockers.push({
      what: "duplicate normalised email addresses",
      count: dupEmail.length,
      sample: dupEmail.slice(0, 10).map((d) => ({ value: d.value, ids: String(d.ids).split(",") })),
      why: "`users` has UNIQUE on the raw column, so addresses differing only by case coexist. " +
           "A normalised unique constraint would reject one of them.",
      options: [
        "merge the accounts — requires deciding which bookings, payments and reviews survive",
        "keep both and do not normalise email for uniqueness — weaker, and lets a near-duplicate register",
        "contact the users",
      ],
      consequence: "Whichever is chosen, someone loses an account or a login route. It is not an engineering call.",
    });
  }
  if (dupPhone.length) {
    out.blockers.push({
      what: "duplicate normalised phone numbers",
      count: dupPhone.length,
      sample: dupPhone.slice(0, 10).map((d) => ({ value: d.value, ids: String(d.ids).split(",") })),
      why: "Phone is the primary login identifier. Two principals normalising to one number cannot both own it.",
      options: ["merge", "contact the users", "keep raw uniqueness"],
      consequence: "One of the two loses OTP sign-in.",
    });
  }
  if (dupSocial.length) {
    out.blockers.push({
      what: "one Google subject claimed by several users",
      count: dupSocial.length,
      why: "uniq_provider_subject would reject all but one.",
      options: ["merge", "unlink the later ones"],
      consequence: "Google sign-in stops working for the unlinked accounts.",
    });
  }
  if (orphanProviders.length) {
    out.blockers.push({
      what: "provider rows whose user no longer exists",
      count: orphanProviders.length,
      sample: orphanProviders.slice(0, 10),
      why: "There is no principal to attach the provider account to, and guessing one would invent an owner.",
      options: ["identify the intended owner from bookings", "archive the provider row"],
      consequence: "A provider profile with no owner cannot be migrated deterministically (§23).",
    });
  }
  if (dupProviders.length) {
    out.blockers.push({
      what: "users with more than one provider row",
      count: dupProviders.length,
      why: "account(kind=provider) is one per principal; UNIQUE(account_id) on the target provider table.",
      options: ["merge the rows", "choose the one with bookings"],
      consequence: "Choosing wrongly hides a provider's history.",
    });
  }

  if (malformed.length) {
    out.warnings.push({
      what: "password hashes that are not bcrypt",
      count: malformed.length,
      ids: malformed.slice(0, 20).map((r) => r.id),
      handling: "NO credential row is created. The account survives and must reset by OTP. " +
                "Creating a credential from an unverifiable hash would carry a broken login forward.",
    });
  }
  if (verifiedOther) {
    out.warnings.push({
      what: "users.verified = 1 with no evidence of how",
      count: verifiedOther,
      handling: "NO contact_verification row is created. `users.verified` is a boolean with no record " +
                "of what was verified, when, or how; migrating it wholesale would manufacture evidence. " +
                "These users meet one OTP at their next in-home booking (R-410).",
    });
  }
  if (admins.length > 1) {
    out.warnings.push({
      what: "more than one legacy admin",
      count: admins.length,
      admins: admins.map((a) => ({ id: a.id, phone: a.phone, joined_at: a.joined_at })),
      handling: "§26: every legacy admin is migrated as a CUSTOMER membership and listed for review. " +
                "A role granted before there was an audit log is a role nobody can justify. " +
                "Platform roles are granted deliberately, by a person, afterwards.",
    });
  }
}

function report() {
  if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); return; }
  const a = out.analysis;
  say("\nIDENTITY BACKFILL — ANALYSIS");
  say("─".repeat(66));
  say(`  users                              ${a.users}`);
  say(`  password credentials to create     ${a.passwordCredentialsToCreate}`);
  say(`  principals with NO password cred   ${a.principalsWithNoPasswordCredential}   <- cannot password-login, by design`);
  say(`  contact verifications to create    ${a.contactVerificationsToCreate}`);
  say(`  verified=1 with no evidence        ${a.verifiedFlagWithoutEvidence}   <- no row created`);
  say(`  roles                              ${JSON.stringify(a.roles)}`);
  say(`  legacy admins                      ${a.legacyAdmins}`);
  say(`  social identities                  ${JSON.stringify(a.socialIdentities)}`);
  say("");
  say("  §22 duplicate analysis");
  say(`    normalised email collisions      ${a.duplicateNormalisedEmail}`);
  say(`    normalised phone collisions      ${a.duplicateNormalisedPhone}`);
  say(`    duplicate google subjects        ${a.duplicateSocialIds}`);
  say(`    orphan provider rows             ${a.orphanProviderRows}`);
  say(`    users with >1 provider row       ${a.duplicateProviderRows}`);

  for (const w of out.warnings) {
    say(`\n  ⚠ ${w.what} — ${w.count}`);
    say(`    ${w.handling}`);
  }
  for (const b of out.blockers) {
    say(`\n  ✖ BLOCKER: ${b.what} — ${b.count}`);
    say(`    ${b.why}`);
    say(`    options: ${b.options.join(" | ")}`);
    say(`    ${b.consequence}`);
  }

  say("");
  if (out.blockers.length) {
    say("  STOP — §22. Duplicates must be resolved by a person before any write.");
    say("  Nothing has been written.");
  } else if (!APPLY) {
    say("  No blockers. Re-run with --apply to write.");
    say("  Nothing has been written.");
  }
}

/**
 * Deterministic ids so a re-run converges instead of duplicating.
 * principal.id reuses users.id — the mapping is the identity itself.
 */
const accountIdFor = (userId, kind) => `acc-${kind}-${userId}`.slice(0, 36);

async function apply() {
  const [users] = await pool.query(
    "SELECT id, name, email, phone, password_hash, role, social_id, login_method, verified, is_active, joined_at FROM users");
  const [providers] = await pool.query("SELECT id, user_id FROM providers");
  const providerUserIds = new Set(providers.map((p) => p.user_id));

  const counts = { principals: 0, accounts: 0, memberships: 0, credentials: 0, verifications: 0, adminsDemoted: 0 };

  for (const u of users) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // principal — status derived from is_active. Legacy has no suspended
      // state, so a deactivated account becomes 'suspended', never 'closed':
      // closure is terminal and irreversible, and nothing in `users` records
      // that a user asked for it.
      await conn.query(
        `INSERT INTO principal (id, status, created_at) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE status = VALUES(status)`,
        [u.id, u.is_active ? "active" : "suspended", u.joined_at || new Date()]
      );
      counts.principals++;

      // consumer account — every principal has one. A provider is also a
      // customer; today they cannot book without changing their own role.
      const consumerId = accountIdFor(u.id, "c");
      await conn.query(
        `INSERT INTO account (id, kind, display_name, status) VALUES (?,'consumer',?,?)
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
        [consumerId, u.name || "IMAP user", u.is_active ? "active" : "suspended"]
      );
      await conn.query(
        `INSERT INTO membership (id, principal_id, account_id, role, granted_by)
         VALUES (?,?,?, 'customer', NULL)
         ON DUPLICATE KEY UPDATE role = VALUES(role)`,
        [newId(), u.id, consumerId]
      );
      counts.accounts++; counts.memberships++;

      // provider account — only where a provider row actually exists. The
      // legacy role alone is not evidence of a provider profile.
      if (providerUserIds.has(u.id)) {
        const providerAccId = accountIdFor(u.id, "p");
        await conn.query(
          `INSERT INTO account (id, kind, display_name, status) VALUES (?,'provider',?,?)
           ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
          [providerAccId, u.name || "IMAP provider", u.is_active ? "active" : "suspended"]
        );
        await conn.query(
          `INSERT INTO membership (id, principal_id, account_id, role, granted_by)
           VALUES (?,?,?, 'provider', NULL)
           ON DUPLICATE KEY UPDATE role = VALUES(role)`,
          [newId(), u.id, providerAccId]
        );
        counts.accounts++; counts.memberships++;
      }

      // §26: a legacy admin is NOT converted into a platform identity. It is
      // counted and left as a customer. Platform roles are granted by a
      // person, deliberately, afterwards.
      if (u.role === "admin") counts.adminsDemoted++;

      // credential — ONLY where the hash is a real bcrypt hash. NULL, empty
      // and malformed all produce NO ROW, which is the null-hash rule made
      // structural: absence, not a conditional.
      if (isBcryptHash(u.password_hash)) {
        await conn.query(
          `INSERT INTO credential (id, principal_id, kind, secret_hash) VALUES (?,?, 'password', ?)
           ON DUPLICATE KEY UPDATE secret_hash = VALUES(secret_hash)`,
          [newId(), u.id, u.password_hash]
        );
        counts.credentials++;
      }

      // oauth credential — only for google, the one provider with a
      // server-verified flow. Any other login_method carrying a social_id is
      // from the disabled endpoint and is never verifiable.
      if (u.social_id && u.login_method === "google") {
        await conn.query(
          `INSERT IGNORE INTO credential (id, principal_id, kind, provider, provider_subject)
           VALUES (?,?, 'oauth', 'google', ?)`,
          [newId(), u.id, u.social_id]
        );
        counts.credentials++;
      }

      // contact_verification — only where a verification demonstrably
      // happened. `verified = 1` with any other login_method is a flag with
      // no evidence, and migrating it would manufacture proof.
      if (u.verified === 1 && u.login_method === "otp" && u.phone) {
        await conn.query(
          `INSERT IGNORE INTO contact_verification (id, principal_id, channel, value_hash, method, verified_at)
           VALUES (?,?, 'phone', ?, 'otp_legacy', ?)`,
          [newId(), u.id, sha256(normPhone(u.phone)), u.joined_at || new Date()]
        );
        counts.verifications++;
      }

      await conn.commit();
    } catch (err) {
      try { await conn.rollback(); } catch { /* connection already gone */ }
      throw new Error(`backfill failed for user ${u.id}: ${err.message}`);
    } finally {
      conn.release();
    }
  }

  out.applied = counts;
  say("\nAPPLIED");
  say("─".repeat(66));
  for (const [k, v] of Object.entries(counts)) say(`  ${k.padEnd(34)} ${v}`);
  say("");
  say("  `users` remains authoritative. Nothing is switched over.");
  say(`  ${counts.adminsDemoted} legacy admin(s) were migrated as CUSTOMER and must be`);
  say("  granted platform roles deliberately (§26).");
}

async function main() {
  const t = env.describe();
  say(`target: ${t.dbHost}:${t.dbPort}/${t.dbName}  (process=${t.processEnv}, data=${t.databaseEnv})`);

  await analyse();

  if (APPLY) {
    // A data transformation against production is a deliberate act.
    env.requireProductionAcknowledgement("identity backfill");
    if (out.blockers.length) {
      report();
      throw new Error("refusing to apply: unresolved duplicates (§22)");
    }
    await apply();
  }
  report();
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(`\n❌ ${err.message}`);
    pool.end().finally(() => process.exit(1));
  });
