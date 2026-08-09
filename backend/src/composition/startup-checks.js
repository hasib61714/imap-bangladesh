/**
 * Startup checks — the composition root's fail-closed gate
 *
 * I-01. `SYSTEM-ARCHITECTURE.md` §4.2 requires several properties to be
 * asserted at startup rather than discovered per request:
 *
 *   - the process is not pointed at a database of the wrong class
 *   - required configuration is present
 *   - (I-03) every registered use case declares an authorization policy
 *   - (I-05) every registered job declares an idempotency property
 *
 * The last two do not exist yet. This module is the seam they plug into, so
 * they arrive as a registered check rather than as a new startup path.
 *
 * The reason these are startup errors and not request errors: a process that
 * cannot authorize correctly should not accept a request and then fail. It
 * should not accept the request.
 */
const env = require("../../config/environment");
const { StartupError } = require("../shared/errors");

/**
 * Configuration the process cannot function without.
 *
 * `fatalIn` decides where a missing value stops the process. `JWT_SECRET` is
 * fatal everywhere because without it every token operation throws per
 * request — an outage that presents as scattered 500s instead of a refusal
 * to start. The rest are fatal in production only, because a developer
 * running against a local database legitimately has no gateway credentials.
 */
const REQUIRED_CONFIG = [
  { key: "JWT_SECRET", fatalIn: "all",        why: "signs and verifies every session token" },
  { key: "DB_HOST",    fatalIn: "all",        why: "no database target" },
  { key: "DB_NAME",    fatalIn: "all",        why: "no database target" },
  { key: "DB_USER",    fatalIn: "all",        why: "no database credential" },
  { key: "FRONTEND_URL", fatalIn: "production", why: "CORS origin and payment redirect target" },
  { key: "BACKEND_URL",  fatalIn: "production", why: "payment callback target — a wrong value loses settlements" },
];

/** Checks registered by later phases. Each is `{ name, run() }`; run() throws to fail startup. */
const registered = [];

/**
 * @param {string} name
 * @param {() => void} run  throws StartupError to refuse startup
 */
function registerStartupCheck(name, run) {
  if (typeof run !== "function") throw new StartupError(`startup check "${name}" is not a function`);
  registered.push({ name, run });
}

function checkEnvironmentCoherence() {
  // Throws EnvironmentSafetyError when a non-production process is pointed at
  // a production database (Phase 2.75, V-01). db.js asserts this too; doing it
  // here means the refusal happens at the composition root, before anything
  // else is constructed, and does not depend on which module loads first.
  env.assertEnvironmentIsCoherent();
}

function checkRequiredConfig() {
  const isProd = env.isProductionEnvironment();
  const missing = [];
  const warnings = [];

  for (const { key, fatalIn, why } of REQUIRED_CONFIG) {
    const present = String(process.env[key] || "").trim().length > 0;
    if (present) continue;
    if (fatalIn === "all" || (fatalIn === "production" && isProd)) missing.push(`${key} — ${why}`);
    else warnings.push(`${key} — ${why}`);
  }

  if (missing.length) {
    throw new StartupError(
      ["Refusing to start — required configuration is missing:", "", ...missing.map((m) => `  • ${m}`), "",
       "See backend/.env.example."].join("\n")
    );
  }
  return warnings;
}

/**
 * Run every check. Throws on the first failure.
 * @returns {{ environment: object, warnings: string[] }}
 */
function runStartupChecks() {
  checkEnvironmentCoherence();
  const warnings = checkRequiredConfig();
  for (const { name, run } of registered) {
    try {
      run();
    } catch (err) {
      throw err instanceof StartupError ? err : new StartupError(`startup check "${name}" failed: ${err.message}`);
    }
  }
  return { environment: env.describe(), warnings };
}

module.exports = { runStartupChecks, registerStartupCheck, REQUIRED_CONFIG };
