/**
 * I-01 — the import-boundary checker must actually catch things
 *
 * A checker that has only ever reported zero is indistinguishable from a
 * checker that cannot report anything. Phase 4 §33 requires test strength to
 * be demonstrated, so every error-severity rule is fired here against a
 * fixture tree written to a temp directory.
 *
 * These tests also pin the checker's exit code, which is what CI gates on.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CHECKER = path.join(__dirname, "..", "scripts", "check-boundaries.js");

/** Build a throwaway tree and run the checker against it. */
function runAgainst(files, extraArgs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "imap-bnd-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
    }
    const res = spawnSync(process.execPath, [CHECKER, `--root=${root}`, "--json", ...extraArgs], { encoding: "utf8" });
    return { ...JSON.parse(res.stdout), status: res.status };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const has = (list, rule) => list.some((v) => v.rule === rule);

// ── each error rule fires ─────────────────────────────────────

test("no-ddl-outside-migrations fires on DDL in a route module", () => {
  const r = runAgainst({
    "routes/thing.js": 'const pool = require("../db");\npool.query("CREATE TABLE IF NOT EXISTS thing (id INT)");\n',
  });
  assert.ok(has(r.errors, "no-ddl-outside-migrations"), "DDL in a route was not caught");
  assert.equal(r.status, 1, "checker must exit non-zero on an error");
});

test("no-ddl-outside-migrations does NOT fire inside migrations/ or scripts/", () => {
  const r = runAgainst({
    "scripts/migrate.js": 'pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (v VARCHAR(64))");\n',
  });
  assert.equal(has(r.errors, "no-ddl-outside-migrations"), false);
  assert.equal(r.status, 0);
});

test("no-ddl-outside-migrations does NOT fire on the word in a comment", () => {
  // This is the false positive that would make the rule unusable: every
  // module that explains why its DDL was removed mentions CREATE TABLE.
  const r = runAgainst({
    "routes/thing.js": "// I-01: the CREATE TABLE this used to run on import is now migration 003.\nmodule.exports = {};\n",
  });
  assert.equal(has(r.errors, "no-ddl-outside-migrations"), false, "comment text was treated as code");
  assert.equal(r.status, 0);
});

test("KNOWN LIMIT: DDL text in any string fires, even prose", () => {
  // A scanner cannot tell a query string from a prose string without parsing,
  // and it must see string contents or it cannot see real DDL at all — that
  // was the vacuous-rule bug this file caught.
  //
  // The trade is deliberate and in the correct direction: a false positive on
  // prose is a one-line fix (say it in a comment), a false negative on real
  // DDL is the defect the rule exists to prevent. Pinned here so the choice is
  // visible rather than rediscovered.
  const r = runAgainst({
    "routes/thing.js": 'const label = "we no longer ALTER TABLE users here";\nmodule.exports = { label };\n',
  });
  assert.ok(has(r.errors, "no-ddl-outside-migrations"), "the documented limitation has changed");

  // The documented way to write that sentence without tripping the rule:
  const ok = runAgainst({
    "routes/thing.js": "// we no longer ALTER TABLE users here\nmodule.exports = {};\n",
  });
  assert.equal(has(ok.errors, "no-ddl-outside-migrations"), false);
});

test("domain-imports-nothing-outward fires when domain reaches infrastructure", () => {
  const r = runAgainst({
    "src/modules/booking/domain/rules.js": 'const repo = require("../infrastructure/repositories/booking");\n',
  });
  assert.ok(has(r.errors, "domain-imports-nothing-outward"));
  assert.equal(r.status, 1);
});

test("domain-imports-nothing-outward fires when domain imports a driver", () => {
  const r = runAgainst({
    "src/modules/finance/domain/ledger.js": 'const mysql = require("mysql2/promise");\n',
  });
  assert.ok(has(r.errors, "domain-imports-nothing-outward"));
});

test("domain-imports-nothing-outward permits pure sibling imports", () => {
  const r = runAgainst({
    "src/modules/finance/domain/ledger.js": 'const { Money } = require("../../../shared/money");\nconst e = require("./entities/entry");\n',
  });
  assert.equal(has(r.errors, "domain-imports-nothing-outward"), false);
  assert.equal(r.status, 0);
});

test("cross-module-via-index-only fires when a module reaches into another's internals", () => {
  const r = runAgainst({
    "src/modules/booking/application/commands/Create.js":
      'const post = require("../../../finance/domain/ledger");\n',
  });
  assert.ok(has(r.errors, "cross-module-via-index-only"));
  assert.equal(r.status, 1);
});

test("cross-module-via-index-only permits the public surface", () => {
  const r = runAgainst({
    "src/modules/booking/application/commands/Create.js": 'const finance = require("../../../finance");\n',
    "src/modules/booking/application/commands/Other.js": 'const finance = require("../../../finance/index");\n',
  });
  assert.equal(has(r.errors, "cross-module-via-index-only"), false);
  assert.equal(r.status, 0);
});

test("cross-module-via-index-only permits a module reaching into ITSELF", () => {
  const r = runAgainst({
    "src/modules/booking/application/commands/Create.js": 'const sm = require("../../domain/state-machines/booking");\n',
  });
  assert.equal(has(r.errors, "cross-module-via-index-only"), false);
});

test("no-deferred-imports fires when active code imports frozen code", () => {
  const r = runAgainst({
    "routes/bookings.js": 'const score = require("../deferred/ai");\n',
  });
  assert.ok(has(r.errors, "no-deferred-imports"), "deferred code became a hidden dependency");
  assert.equal(r.status, 1);
});

// ── severity behaviour ────────────────────────────────────────

test("warn-level rules report but do not fail the build", () => {
  const r = runAgainst({
    "routes/thing.js": 'const express = require("express");\nconst pool = require("../db");\npool.query("SELECT 1");\n',
  });
  assert.ok(has(r.warns, "transport-libs-only-in-transport"));
  assert.ok(has(r.warns, "sql-only-in-infrastructure"));
  assert.equal(r.errors.length, 0);
  assert.equal(r.status, 0, "legacy-layout warnings must not fail the build yet");
});

test("--strict promotes warnings to failures", () => {
  const r = runAgainst(
    { "routes/thing.js": 'const express = require("express");\n' },
    ["--strict"]
  );
  assert.ok(has(r.warns, "transport-libs-only-in-transport"));
  assert.equal(r.status, 1);
});

test("a clean tree passes with exit 0", () => {
  const r = runAgainst({
    "src/shared/money.js": "module.exports = { parseAmount() {} };\n",
    "src/modules/booking/domain/rules.js": 'const { parseAmount } = require("../../../shared/money");\n',
  });
  assert.equal(r.errors.length, 0);
  assert.equal(r.warns.length, 0);
  assert.equal(r.status, 0);
});

// ── the real repository ───────────────────────────────────────

test("the repository has zero error-level violations", () => {
  const res = spawnSync(process.execPath, [CHECKER, "--json"], { encoding: "utf8" });
  const out = JSON.parse(res.stdout);
  assert.deepEqual(
    out.errors, [],
    `error-level boundary violations:\n${out.errors.map((e) => `  ${e.rule} ${e.file}:${e.line}`).join("\n")}`
  );
  assert.equal(res.status, 0);
});
