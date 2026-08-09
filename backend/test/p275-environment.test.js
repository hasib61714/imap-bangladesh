/**
 * Phase 2.75 — environment safety guards (V-01)
 *
 * Phase 2.5 found `.env` declaring NODE_ENV=development while pointing at
 * the production TiDB cluster, which silently disabled every Phase 0.5
 * production control against real user data.
 *
 * These tests pin the behaviour that closes it. The negative controls
 * matter more than the positives: several of these assertions would have
 * passed against the old `NODE_ENV === "production"` guard, so each test
 * that specifically exercises the widened predicate is marked.
 */
const test   = require("node:test");
const assert = require("node:assert/strict");

const env = require("../config/environment");

const KEYS = [
  "APP_ENV", "NODE_ENV", "DATABASE_ENV",
  "DB_HOST", "DB_PORT", "DB_NAME",
  "PRODUCTION_DB_HOST", "IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION",
];

/** Run `fn` with exactly the given environment; restore everything after. */
function withEnv(vars, fn) {
  const saved = {};
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const PROD_DB   = { DB_HOST: "gateway01.ap-northeast-1.prod.aws.tidbcloud.com", DB_PORT: "4000", DB_NAME: "imap_db" };
const LOCAL_DB  = { DB_HOST: "127.0.0.1", DB_PORT: "3306", DB_NAME: "imap_dev" };

// ── The defect itself ─────────────────────────────────────────────

test("V-01: a development process on the production database behaves as production", () => {
  withEnv({ NODE_ENV: "development", ...PROD_DB }, () => {
    // The old guard — kept here as the negative control. It is what the
    // codebase used everywhere, and it is false, which is the bug.
    assert.equal(process.env.NODE_ENV === "production", false);

    assert.equal(env.declaredEnvironment(), "development");
    assert.equal(env.databaseEnvironment(), "production");
    assert.equal(env.isProduction(), true, "widened predicate must say production");
    assert.equal(env.allowsDevelopmentBehaviour(), false);
  });
});

test("V-01: db.js startup guard refuses a development process on production data", () => {
  withEnv({ NODE_ENV: "development", ...PROD_DB }, () => {
    assert.throws(() => env.assertEnvironmentIsCoherent(), (err) => {
      assert.equal(err.name, "EnvironmentSafetyError");
      assert.match(err.message, /Refusing to start/);
      return true;
    });
  });
});

test("a genuine development setup is unaffected", () => {
  withEnv({ NODE_ENV: "development", ...LOCAL_DB }, () => {
    assert.equal(env.databaseEnvironment(), "development");
    assert.equal(env.isProduction(), false);
    assert.equal(env.allowsDevelopmentBehaviour(), true);
    assert.doesNotThrow(() => env.assertEnvironmentIsCoherent());
  });
});

test("the test harness environment still allows development behaviour", () => {
  withEnv({ NODE_ENV: "test" }, () => {           // no DB_HOST at all → localhost
    assert.equal(env.databaseEnvironment(), "development");
    assert.equal(env.isProduction(), false);
  });
});

// ── Fail-closed defaults ──────────────────────────────────────────

test("fail closed: no APP_ENV and no NODE_ENV is treated as production", () => {
  withEnv({ ...LOCAL_DB }, () => {
    assert.equal(env.declaredEnvironment(), "production");
    assert.equal(env.isProduction(), true);
  });
});

test("fail closed: an unrecognised environment name is treated as production", () => {
  withEnv({ NODE_ENV: "qa-sandbox-2", ...LOCAL_DB }, () => {
    assert.equal(env.declaredEnvironment(), "production");
  });
});

test("fail closed: an unknown remote database host is treated as production data", () => {
  withEnv({ NODE_ENV: "development", DB_HOST: "db.some-vendor.example.com", DB_NAME: "imap" }, () => {
    assert.equal(env.databaseEnvironment(), "production");
    assert.equal(env.isProduction(), true);
  });
});

test("staging gets production behaviour — no demo seed, no OTP exposure", () => {
  withEnv({ APP_ENV: "staging", DATABASE_ENV: "staging", DB_HOST: "staging.example.com", DB_NAME: "imap_staging" }, () => {
    assert.equal(env.isProduction(), true);
    assert.equal(env.isProductionData(), false);
    // ...but a staging process on staging data is coherent and may start.
    assert.doesNotThrow(() => env.assertEnvironmentIsCoherent());
  });
});

// ── Explicit operator statements ──────────────────────────────────

test("APP_ENV wins over NODE_ENV", () => {
  withEnv({ APP_ENV: "development", NODE_ENV: "production", ...LOCAL_DB }, () => {
    assert.equal(env.declaredEnvironment(), "development");
  });
});

test("DATABASE_ENV overrides host inference in both directions", () => {
  withEnv({ NODE_ENV: "development", DATABASE_ENV: "development", DB_HOST: "db.prod.example.com", DB_NAME: "x" }, () => {
    assert.equal(env.databaseEnvironment(), "development", "a prod-shaped name can be declared non-production");
  });
  withEnv({ NODE_ENV: "development", DATABASE_ENV: "production", ...LOCAL_DB }, () => {
    assert.equal(env.databaseEnvironment(), "production", "a local host can be declared production");
    assert.throws(() => env.assertEnvironmentIsCoherent());
  });
});

test("PRODUCTION_DB_HOST marks a host that does not look production-shaped", () => {
  withEnv({ NODE_ENV: "development", PRODUCTION_DB_HOST: "db.internal.example.com", DB_HOST: "db.internal.example.com", DB_NAME: "imap" }, () => {
    assert.equal(env.databaseEnvironment(), "production");
  });
});

// ── The break-glass override ──────────────────────────────────────

test("the override must name the exact database", () => {
  withEnv({ NODE_ENV: "development", ...PROD_DB, IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION: "imap_db" }, () => {
    assert.equal(env.productionAccessAcknowledged(), true);
    assert.doesNotThrow(() => env.assertEnvironmentIsCoherent());
  });
});

test("a wrong or generic override value does not unlock anything", () => {
  for (const value of ["true", "yes", "1", "imap", "IMAP_DB", ""]) {
    withEnv({ NODE_ENV: "development", ...PROD_DB, IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION: value }, () => {
      assert.equal(env.productionAccessAcknowledged(), false, `"${value}" must not acknowledge`);
      assert.throws(() => env.assertEnvironmentIsCoherent());
    });
  }
});

test("the override never re-enables development behaviour", () => {
  withEnv({ NODE_ENV: "development", ...PROD_DB, IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION: "imap_db" }, () => {
    assert.equal(env.isProduction(), true, "acknowledging access does not make the data fake");
    assert.equal(env.allowsDevelopmentBehaviour(), false);
  });
});

// ── Script guards ─────────────────────────────────────────────────

test("requireProductionAcknowledgement blocks writes to production, permits development", () => {
  withEnv({ NODE_ENV: "development", ...PROD_DB }, () => {
    assert.throws(() => env.requireProductionAcknowledgement("database migration"), /Refusing to run/);
  });
  withEnv({ NODE_ENV: "development", ...PROD_DB, IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION: "imap_db" }, () => {
    assert.doesNotThrow(() => env.requireProductionAcknowledgement("database migration"));
  });
  withEnv({ NODE_ENV: "development", ...LOCAL_DB }, () => {
    assert.doesNotThrow(() => env.requireProductionAcknowledgement("database migration"));
  });
});

test("forbidInProduction has no override — demo seeding can never reach production", () => {
  withEnv({ NODE_ENV: "development", ...PROD_DB, IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION: "imap_db" }, () => {
    assert.throws(() => env.forbidInProduction("demo data seeding"), /cannot be overridden/);
  });
  withEnv({ APP_ENV: "staging", DATABASE_ENV: "staging", DB_HOST: "staging.example.com", DB_NAME: "s" }, () => {
    assert.throws(() => env.forbidInProduction("demo data seeding"), /cannot be overridden/);
  });
  withEnv({ NODE_ENV: "development", ...LOCAL_DB }, () => {
    assert.doesNotThrow(() => env.forbidInProduction("demo data seeding"));
  });
});

// ── Diagnostics must stay non-secret ──────────────────────────────

test("describe() exposes no credential", () => {
  withEnv({ NODE_ENV: "development", ...PROD_DB, DB_USER: "someuser.root", DB_PASSWORD: "s3cr3t" }, () => {
    const serialised = JSON.stringify(env.describe());
    assert.doesNotMatch(serialised, /s3cr3t/);
    assert.doesNotMatch(serialised, /someuser/);
    assert.doesNotMatch(serialised, /password|user/i);
  });
});

// ── I-02: DB_NAME no longer defaults to the production database name ──

test("I-02: an unset DB_NAME is visibly unnamed, not silently 'imap_db'", () => {
  // It used to default to "imap_db" — the production database name — so an
  // unset DB_NAME selected a production-named database on whatever host was
  // configured.
  withEnv({ NODE_ENV: "development", DB_HOST: "127.0.0.1" }, () => {
    assert.equal(env.databaseIdentity().name, "");
  });
});

test("I-02: an unnamed database cannot be acknowledged", () => {
  // Without the guard, an empty DB_NAME and an empty acknowledgement compare
  // equal, and the break-glass override satisfies itself.
  withEnv({
    NODE_ENV: "development",
    DB_HOST: "gateway01.ap-northeast-1.prod.aws.tidbcloud.com",
    IMAP_I_UNDERSTAND_THIS_IS_PRODUCTION: "",
  }, () => {
    assert.equal(env.productionAccessAcknowledged(), false);
    assert.throws(() => env.assertEnvironmentIsCoherent(), /Refusing to start/);
  });
});
