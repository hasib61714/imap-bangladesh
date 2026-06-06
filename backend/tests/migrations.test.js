// Architecture test for the migration set (no DB).
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const fs       = require("node:fs");
const path     = require("node:path");

const DIR = path.join(__dirname, "..", "database", "migrations");
const forward = () => fs.readdirSync(DIR).filter(f => /^\d+_.*\.sql$/.test(f) && !f.endsWith(".down.sql")).sort();

test("migration files follow the NNN_name.sql convention", () => {
  const files = forward();
  assert.ok(files.length >= 1, "at least one migration exists");
  for (const f of files) assert.match(f, /^\d{3}_[a-z0-9_]+\.sql$/);
});

test("migration versions are unique and sequential", () => {
  const versions = forward().map(f => parseInt(f.split("_")[0], 10));
  assert.deepEqual(versions, [...new Set(versions)], "no duplicate versions");
  for (let i = 1; i < versions.length; i++) {
    assert.ok(versions[i] > versions[i - 1], "versions strictly increase");
  }
});

test("every forward migration (except the baseline) has a rollback file", () => {
  for (const f of forward()) {
    if (f.startsWith("001_")) continue; // baseline rollback is intentionally manual
    const down = path.join(DIR, f.replace(/\.sql$/, ".down.sql"));
    assert.ok(fs.existsSync(down), `${f} should have a .down.sql`);
  }
});

test("the runner script exists and is wired to npm", () => {
  assert.ok(fs.existsSync(path.join(__dirname, "..", "scripts", "migrate.js")));
  const pkg = require("../package.json");
  assert.equal(pkg.scripts.migrate, "node scripts/migrate.js");
});
