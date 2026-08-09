/**
 * Environment identity and fail-closed safety guards — IMAP
 *
 * Phase 2.75, closing finding V-01 from docs/audit/PHASE-2.5-GATE-REPORT.md.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * Every production safety control added in Phase 0.5 — demo seeding,
 * mock payment settlement, self-service wallet top-up, OTP-in-response,
 * demo-row filtering — was keyed on a single string:
 *
 *     process.env.NODE_ENV === "production"
 *
 * Phase 2.5 found `backend/.env` setting NODE_ENV=development while
 * pointing DB_HOST at the production TiDB cluster. Every one of those
 * controls was therefore disabled *while connected to production data*.
 * The code was correct; the discriminator was not.
 *
 * The rule this module establishes:
 *
 *     If the database holds production data, the process behaves as
 *     production — whatever NODE_ENV happens to say.
 *
 * and, in the other direction:
 *
 *     A process that declares itself development/test/staging refuses
 *     to start against a production database at all.
 *
 * FAIL CLOSED
 * ───────────
 * Where the environment cannot be determined, this module answers
 * "production". Unknown means dangerous: an unrecognised remote host is
 * treated as production data, an unset APP_ENV/NODE_ENV is treated as a
 * production process. The cost of being wrong in that direction is a
 * developer seeing stricter behaviour; the cost of being wrong in the
 * other direction is what Phase 2.5 found.
 *
 * See docs/engineering/ENVIRONMENT-ARCHITECTURE.md for the full matrix.
 */

const ENVIRONMENTS = ["development", "test", "staging", "production"];

const ALIASES = { dev: "development", prod: "production", stage: "staging" };

/** Hosts that cannot, by construction, be a shared production cluster. */
const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "host.docker.internal",
]);

/**
 * Hostname shapes that indicate production. Deliberately broad: this is
 * the last line of defence, and a false positive only means someone has
 * to name their environment explicitly with DATABASE_ENV.
 */
const PRODUCTION_HOST_PATTERN = /(^|[.\-_])(prod|production|live)([.\-_]|$)/i;

class EnvironmentSafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = "EnvironmentSafetyError";
  }
}

function normalise(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  if (ALIASES[v]) return ALIASES[v];
  return ENVIRONMENTS.includes(v) ? v : null;
}

/**
 * What this *process* claims to be. APP_ENV is authoritative because
 * NODE_ENV is overloaded — build tools, hosting platforms and libraries
 * all write to it for their own reasons.
 *
 * Unset or unrecognised → "production" (fail closed).
 */
function declaredEnvironment() {
  return normalise(process.env.APP_ENV) || normalise(process.env.NODE_ENV) || "production";
}

/** Non-secret database identity. Never includes user or password. */
function databaseIdentity() {
  return {
    host: String(process.env.DB_HOST || "localhost").trim().toLowerCase(),
    port: String(process.env.DB_PORT || "3306").trim(),
    name: String(process.env.DB_NAME || "imap_db").trim(),
  };
}

/**
 * What class of data the configured database holds.
 *
 * Resolution order — first match wins:
 *   1. DATABASE_ENV, if set. The operator's explicit statement always
 *      beats inference, in both directions.
 *   2. Host equals PRODUCTION_DB_HOST → production.
 *   3. Loopback / container-local host → development.
 *   4. Hostname looks production-shaped → production.
 *   5. Anything else — a remote host of unknown class → production.
 *
 * Rule 5 is the fail-closed default and the reason this function exists.
 * A staging cluster therefore has to say so with DATABASE_ENV=staging;
 * silence is never read as "safe".
 */
function databaseEnvironment() {
  const explicit = normalise(process.env.DATABASE_ENV);
  if (explicit) return explicit;

  const { host } = databaseIdentity();
  const known = String(process.env.PRODUCTION_DB_HOST || "").trim().toLowerCase();

  if (known && host === known) return "production";
  if (LOCAL_HOSTS.has(host)) return "development";
  if (PRODUCTION_HOST_PATTERN.test(host)) return "production";
  return "production";
}

/** True when the *process* declares itself production. */
function isProductionEnvironment() {
  return declaredEnvironment() === "production";
}

/** True when the *database* holds production data. */
function isProductionData() {
  return databaseEnvironment() === "production";
}

/**
 * Environments in which development conveniences are permitted.
 * Staging is deliberately excluded: it is internet-reachable and is
 * populated from scrubbed restores, not from the demo seeder.
 */
const DEVELOPMENT_LIKE = new Set(["development", "test"]);

/**
 * Development behaviour requires BOTH the process and the database to
 * be development-like. This conjunction is what closes V-01: a
 * development process wired to the production database no longer
 * unlocks anything.
 */
function allowsDevelopmentBehaviour() {
  return DEVELOPMENT_LIKE.has(declaredEnvironment()) && DEVELOPMENT_LIKE.has(databaseEnvironment());
}

/**
 * The predicate that replaces every `NODE_ENV === "production"` guard
 * protecting real users or real money. Anything that is not provably
 * development-like is treated as production.
 */
function isProduction() {
  return !allowsDevelopmentBehaviour();
}

/**
 * Break-glass acknowledgement for a process that must legitimately run
 * against production while declaring another environment. Requires the
 * exact database name to be typed out, so it cannot be set once in a
 * shell profile and forgotten.
 */
function productionAccessAcknowledged() {
  const { name } = databaseIdentity();
  return String(process.env.IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION || "").trim() === name;
}

/**
 * Startup guard. Called by db.js before the pool is created.
 *
 * Refuses to continue when a non-production process is pointed at a
 * production database. This is the control that would have prevented
 * V-01 outright.
 *
 * @throws {EnvironmentSafetyError}
 */
function assertEnvironmentIsCoherent() {
  if (!isProductionData()) return;
  if (isProductionEnvironment()) return;
  if (productionAccessAcknowledged()) return;

  const { host, port, name } = databaseIdentity();
  throw new EnvironmentSafetyError(
    [
      "Refusing to start.",
      "",
      `  process environment : ${declaredEnvironment()}  (APP_ENV / NODE_ENV)`,
      `  database class      : production`,
      `  database target     : ${host}:${port}/${name}`,
      "",
      "A non-production process must not connect to a production database.",
      "Phase 2.5 finding V-01: this configuration silently disables demo-seed,",
      "mock-settlement, wallet-top-up and OTP-exposure protections against real",
      "user data.",
      "",
      "Fix one of the following:",
      "  • point DB_HOST at a development database (correct answer), or",
      "  • set DATABASE_ENV=development if this host is genuinely not production, or",
      `  • set IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION=${name} to override deliberately.`,
    ].join("\n")
  );
}

/**
 * Guard for scripts that write to the database: migrations, seeding,
 * administrator bootstrap. Production is permitted only with the typed
 * acknowledgement.
 *
 * @param {string} operation human-readable operation name, used in the message
 * @throws {EnvironmentSafetyError}
 */
function requireProductionAcknowledgement(operation) {
  if (!isProductionData()) return;
  if (productionAccessAcknowledged()) return;

  const { host, port, name } = databaseIdentity();
  throw new EnvironmentSafetyError(
    [
      `Refusing to run "${operation}" against a production database.`,
      "",
      `  target : ${host}:${port}/${name}`,
      "",
      "If this is intended, acknowledge it explicitly for this invocation:",
      `  IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION=${name} <command>`,
      "",
      "Take a verified backup first — see docs/engineering/BACKUP-RECOVERY.md.",
    ].join("\n")
  );
}

/**
 * Guard for operations that have no legitimate production use at all —
 * demo seeding is the only current member. No override exists.
 *
 * @throws {EnvironmentSafetyError}
 */
function forbidInProduction(operation) {
  if (!isProduction()) return;
  const { host, port, name } = databaseIdentity();
  throw new EnvironmentSafetyError(
    [
      `Refusing to run "${operation}".`,
      "",
      `  process environment : ${declaredEnvironment()}`,
      `  database class      : ${databaseEnvironment()}`,
      `  database target     : ${host}:${port}/${name}`,
      "",
      "This operation has no safe production use and cannot be overridden.",
    ].join("\n")
  );
}

/** Non-secret summary, safe to log. Contains no user, password or key. */
function describe() {
  const { host, port, name } = databaseIdentity();
  return {
    processEnv: declaredEnvironment(),
    databaseEnv: databaseEnvironment(),
    dbHost: host,
    dbPort: port,
    dbName: name,
    productionBehaviour: isProduction(),
    acknowledgedOverride: !isProductionEnvironment() && isProductionData() && productionAccessAcknowledged(),
  };
}

module.exports = {
  ENVIRONMENTS,
  EnvironmentSafetyError,
  declaredEnvironment,
  databaseEnvironment,
  databaseIdentity,
  isProductionEnvironment,
  isProductionData,
  isProduction,
  allowsDevelopmentBehaviour,
  productionAccessAcknowledged,
  assertEnvironmentIsCoherent,
  requireProductionAcknowledgement,
  forbidInProduction,
  describe,
};
