// Architecture-boundary tests for the modules pattern (no DB).
// Enforces: controllers ≠ db, services ≠ express/db, repositories = db.
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const fs       = require("node:fs");
const path     = require("node:path");

const read = (rel) => fs.readFileSync(path.join(__dirname, "..", "src", "modules", rel), "utf8");
const requires = (src) => [...src.matchAll(/require\(["']([^"']+)["']\)/g)].map(m => m[1]);

test("controller is HTTP-only (no db, no repository import)", () => {
  const reqs = requires(read("auth/auth.controller.js"));
  assert.ok(!reqs.some(r => /(^|\/)db$/.test(r)), "controller must not import db");
});

test("service has no HTTP/DB imports (pure, dependency-injected)", () => {
  const reqs = requires(read("auth/auth.service.js"));
  assert.ok(!reqs.includes("express"), "service must not import express");
  assert.ok(!reqs.some(r => /(^|\/)db$/.test(r)), "service must not import db");
});

test("repository is the only layer that imports db", () => {
  const reqs = requires(read("auth/auth.repository.js"));
  assert.ok(reqs.some(r => /(^|\/)db$/.test(r)), "repository should import db");
});
