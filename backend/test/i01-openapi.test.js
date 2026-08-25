/**
 * I-01 — the OpenAPI checker must actually catch things
 *
 * Same reasoning as the boundary checker: a validator that has only ever
 * reported "valid" is indistinguishable from one that cannot report anything.
 * Each rule is fired against a fixture spec.
 *
 * The two rules that matter most are the IMAP conventions, because they are
 * what the later CI gates hang off:
 *   - x-imap-action       feeds "every use case declares a policy" (I-03)
 *   - x-imap-idempotency  feeds "undeclared does not ship" (I-05)
 *
 * Negative control: delete either `fail(...)` call in scripts/check-openapi.js
 * and the corresponding test must fail.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CHECKER = path.join(__dirname, "..", "scripts", "check-openapi.js");
const REAL_SPEC = path.join(__dirname, "..", "openapi", "imap.v1.yaml");

function validate(yamlText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "imap-oas-"));
  const file = path.join(dir, "spec.yaml");
  try {
    fs.writeFileSync(file, yamlText, "utf8");
    const res = spawnSync(process.execPath, [CHECKER, "--spec=" + file, "--json"], { encoding: "utf8" });
    return { ...JSON.parse(res.stdout), status: res.status };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const said = (r, fragment) => r.errors.some((e) => e.message.includes(fragment));

const MINIMAL = [
  "openapi: 3.1.0",
  "info: { title: T, version: 1 }",
  "servers: [{ url: /api/v1 }]",
  "components:",
  "  securitySchemes: { bearerAuth: { type: http, scheme: bearer } }",
  "  schemas:",
  "    Error: { type: object }",
  "paths:",
].join("\n");

function withOperation(lines) {
  return MINIMAL + "\n" + lines.map((l) => "  " + l).join("\n") + "\n";
}

// ── the two IMAP conventions ──────────────────────────────────

test("an operation with no x-imap-action is rejected", () => {
  const r = validate(withOperation([
    "/things:",
    "  get:",
    "    operationId: listThings",
    "    summary: List",
    "    responses: { '200': { description: ok } }",
  ]));
  assert.ok(said(r, "x-imap-action is required"), "an unguardable endpoint was accepted");
  assert.equal(r.status, 1);
});

test("a mutating operation with no x-imap-idempotency is rejected", () => {
  const r = validate(withOperation([
    "/things:",
    "  post:",
    "    operationId: createThing",
    "    summary: Create",
    "    x-imap-action: thing.create",
    "    responses: { '201': { description: created } }",
  ]));
  assert.ok(said(r, "x-imap-idempotency is required"), "an undeclared mutating endpoint was accepted");
  assert.equal(r.status, 1);
});

test("a GET does NOT need x-imap-idempotency", () => {
  const r = validate(withOperation([
    "/things:",
    "  get:",
    "    operationId: listThings",
    "    summary: List",
    "    x-imap-action: thing.observe",
    "    responses: { '200': { description: ok } }",
  ]));
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.status, 0);
});

test("an unknown x-imap-idempotency value is rejected", () => {
  const r = validate(withOperation([
    "/things:",
    "  post:",
    "    operationId: createThing",
    "    summary: Create",
    "    x-imap-action: thing.create",
    "    x-imap-idempotency: maybe",
    "    responses: { '201': { description: created } }",
  ]));
  assert.ok(said(r, "must be one of"));
  assert.equal(r.status, 1);
});

// ── structural rules ──────────────────────────────────────────

test("a duplicate operationId is rejected", () => {
  const r = validate(withOperation([
    "/a:",
    "  get:",
    "    operationId: dup",
    "    summary: A",
    "    x-imap-action: a.observe",
    "    responses: { '200': { description: ok } }",
    "/b:",
    "  get:",
    "    operationId: dup",
    "    summary: B",
    "    x-imap-action: b.observe",
    "    responses: { '200': { description: ok } }",
  ]));
  assert.ok(said(r, "is already used by"));
  assert.equal(r.status, 1);
});

test("an operation with no success response is rejected", () => {
  const r = validate(withOperation([
    "/things:",
    "  get:",
    "    operationId: listThings",
    "    summary: List",
    "    x-imap-action: thing.observe",
    "    responses: { '404': { description: gone } }",
  ]));
  assert.ok(said(r, "no success response"));
});

test("a dangling $ref is rejected", () => {
  const r = validate(withOperation([
    "/things:",
    "  get:",
    "    operationId: listThings",
    "    summary: List",
    "    x-imap-action: thing.observe",
    "    responses:",
    "      '200':",
    "        description: ok",
    "        content:",
    "          application/json:",
    "            schema: { $ref: '#/components/schemas/DoesNotExist' }",
  ]));
  assert.ok(said(r, "dangling $ref"), "a broken client would have been generated");
  assert.equal(r.status, 1);
});

test("an external $ref is rejected", () => {
  const r = validate(withOperation([
    "/things:",
    "  get:",
    "    operationId: listThings",
    "    summary: List",
    "    x-imap-action: thing.observe",
    "    responses:",
    "      '200':",
    "        description: ok",
    "        content:",
    "          application/json:",
    "            schema: { $ref: 'https://example.com/x.yaml#/S' }",
  ]));
  assert.ok(said(r, "external $ref is not permitted"));
});

test("a missing error envelope is rejected", () => {
  const r = validate([
    "openapi: 3.1.0",
    "info: { title: T, version: 1 }",
    "servers: [{ url: /api/v1 }]",
    "components: { securitySchemes: { bearerAuth: { type: http, scheme: bearer } }, schemas: {} }",
    "paths: {}",
  ].join("\n"));
  assert.ok(said(r, "single error envelope"));
});

test("a malformed document is rejected, not thrown", () => {
  const r = validate("openapi: 3.1.0\ninfo: {{{\n");
  assert.ok(said(r, "does not parse"));
  assert.equal(r.status, 1);
});

// ── the real contract ─────────────────────────────────────────

test("the shipped contract validates", () => {
  const res = spawnSync(process.execPath, [CHECKER, "--json"], { encoding: "utf8" });
  const out = JSON.parse(res.stdout);
  assert.deepEqual(out.errors, [], JSON.stringify(out.errors, null, 2));
  assert.equal(res.status, 0);
});

test("the shipped contract defines the conventions later operations inherit", () => {
  const yaml = require("js-yaml");
  const doc = yaml.load(fs.readFileSync(REAL_SPEC, "utf8"));
  const schemas = doc.components.schemas;

  // Money must be an object with minor units — never a bare number. This is
  // the schema-level expression of "a bare number is never a money value".
  assert.equal(schemas.Money.type, "object");
  assert.ok(schemas.Money.required.includes("amount_minor"));
  assert.ok(schemas.Money.required.includes("currency"));
  assert.equal(schemas.Money.properties.amount_minor.type, "integer");

  // All nine states, and no tenth.
  assert.deepEqual(schemas.Status.enum, [
    "Suggested", "Available", "Requested", "Pending",
    "Confirmed", "Completed", "Failed", "Unavailable", "Unknown",
  ]);

  // An async command may not claim the effect happened.
  assert.equal(schemas.JobAccepted.properties.status.enum[0], "accepted");

  // The error envelope always carries a correlation id.
  assert.ok(schemas.Error.properties.error.required.includes("correlation_id"));
});
