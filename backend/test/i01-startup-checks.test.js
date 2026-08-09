/**
 * I-01 — composition-root startup checks
 *
 * The property under test is that the process REFUSES TO START on a
 * misconfiguration, rather than starting and failing per request. A missing
 * JWT_SECRET is the clearest case: today it produces scattered 500s from
 * `jwt.verify` on every authenticated request, which presents as an outage
 * with no obvious cause instead of a refusal with a named reason.
 *
 * Negative control: revert the `missing.length` throw in
 * src/composition/startup-checks.js#checkRequiredConfig and tests 2, 3 and 5
 * must fail.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { runStartupChecks, registerStartupCheck, REQUIRED_CONFIG } = require("../src/composition/startup-checks");
const { StartupError } = require("../src/shared/errors");

const KEYS = [
  "APP_ENV", "NODE_ENV", "DATABASE_ENV", "DB_HOST", "DB_PORT", "DB_NAME",
  "DB_USER", "DB_PASSWORD", "JWT_SECRET", "FRONTEND_URL", "BACKEND_URL",
  "PRODUCTION_DB_HOST", "IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION",
];

function withEnv(vars, fn) {
  const saved = {};
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, vars);
  try { return fn(); }
  finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const DEV = {
  APP_ENV: "development", DATABASE_ENV: "development",
  DB_HOST: "127.0.0.1", DB_NAME: "imap_dev", DB_USER: "root",
  JWT_SECRET: "x".repeat(64),
};

const PROD = {
  APP_ENV: "production", DATABASE_ENV: "production",
  DB_HOST: "db.prod.example.com", DB_NAME: "imap_db", DB_USER: "svc",
  JWT_SECRET: "x".repeat(64),
  FRONTEND_URL: "https://example.com", BACKEND_URL: "https://api.example.com",
};

test("a complete development configuration starts", () => {
  withEnv(DEV, () => {
    const r = runStartupChecks();
    assert.equal(r.environment.databaseEnv, "development");
    assert.equal(r.environment.productionBehaviour, false);
  });
});

test("a missing JWT_SECRET refuses to start — in every environment", () => {
  for (const base of [DEV, PROD]) {
    const { JWT_SECRET, ...withoutSecret } = base;
    withEnv(withoutSecret, () => {
      assert.throws(() => runStartupChecks(), (err) => {
        assert.equal(err.name, "StartupError");
        assert.match(err.message, /JWT_SECRET/);
        assert.match(err.message, /Refusing to start/);
        return true;
      });
    });
  }
});

test("an empty-string config value counts as missing", () => {
  withEnv({ ...DEV, JWT_SECRET: "   " }, () => {
    assert.throws(() => runStartupChecks(), /JWT_SECRET/);
  });
});

test("production-only config is a warning in development, fatal in production", () => {
  // FRONTEND_URL and BACKEND_URL are absent from DEV by construction.
  withEnv(DEV, () => {
    const r = runStartupChecks();
    assert.equal(r.warnings.length, 2);
    assert.ok(r.warnings.some((w) => w.startsWith("FRONTEND_URL")));
    assert.ok(r.warnings.some((w) => w.startsWith("BACKEND_URL")));
  });

  const { BACKEND_URL, ...prodWithoutBackendUrl } = PROD;
  withEnv(prodWithoutBackendUrl, () => {
    assert.throws(() => runStartupChecks(), /BACKEND_URL/);
  });
});

test("V-01: a development process on a production database refuses to start", () => {
  withEnv({ ...DEV, DATABASE_ENV: "production" }, () => {
    assert.throws(() => runStartupChecks(), (err) => {
      assert.equal(err.name, "EnvironmentSafetyError");
      return true;
    });
  });
});

test("environment coherence is checked BEFORE configuration", () => {
  // Both are wrong. The environment failure must be the one reported, because
  // fixing a missing secret while still pointed at production would be the
  // wrong fix to make first.
  const { JWT_SECRET, ...noSecret } = DEV;
  withEnv({ ...noSecret, DATABASE_ENV: "production" }, () => {
    assert.throws(() => runStartupChecks(), (err) => {
      assert.equal(err.name, "EnvironmentSafetyError");
      return true;
    });
  });
});

test("a registered check can refuse startup", () => {
  registerStartupCheck("i01-test-check", () => {
    if (process.env.__I01_FAIL === "1") throw new StartupError("deliberate");
  });

  withEnv({ ...DEV }, () => {
    assert.doesNotThrow(() => runStartupChecks());
    process.env.__I01_FAIL = "1";
    try {
      assert.throws(() => runStartupChecks(), /deliberate/);
    } finally {
      delete process.env.__I01_FAIL;
    }
  });
});

test("a non-StartupError from a registered check is still fatal, and names the check", () => {
  registerStartupCheck("i01-throws-plain", () => {
    if (process.env.__I01_PLAIN === "1") throw new Error("plain failure");
  });
  withEnv({ ...DEV }, () => {
    process.env.__I01_PLAIN = "1";
    try {
      assert.throws(() => runStartupChecks(), (err) => {
        assert.equal(err.name, "StartupError");
        assert.match(err.message, /i01-throws-plain/);
        assert.match(err.message, /plain failure/);
        return true;
      });
    } finally {
      delete process.env.__I01_PLAIN;
    }
  });
});

test("every required-config entry states why it is required", () => {
  for (const c of REQUIRED_CONFIG) {
    assert.ok(c.why && c.why.length > 10, `${c.key} has no usable reason`);
    assert.ok(["all", "production"].includes(c.fatalIn), `${c.key} has an unknown fatalIn`);
  }
});
