#!/usr/bin/env node
/**
 * OpenAPI contract checker — IMAP
 *
 *   node scripts/check-openapi.js              validate the contract
 *   node scripts/check-openapi.js --json
 *   node scripts/check-openapi.js --spec=FILE  validate a fixture (tests)
 *
 * `API-ARCHITECTURE.md` §8: the spec is the artefact. This enforces the
 * properties that make it usable as one, and the two that Phase 2 declared
 * must fail the build rather than be reviewed for:
 *
 *   - every endpoint declares an authorization action
 *   - every mutating endpoint declares idempotency behaviour
 *
 * Not a full OpenAPI 3.1 validator. It checks structure, the conventions
 * IMAP adds on top, and internal $ref integrity. A complete schema validator
 * arrives with the generator at I-05; this is the gate that keeps the
 * contract honest while it is being authored.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const specArg = process.argv.find((a) => a.startsWith("--spec="));
const SPEC = specArg
  ? path.resolve(specArg.slice("--spec=".length))
  : path.join(__dirname, "..", "openapi", "imap.v1.yaml");
const JSON_OUT = process.argv.includes("--json");

const MUTATING = new Set(["post", "put", "patch", "delete"]);
const IDEMPOTENCY_VALUES = new Set(["required", "optional", "none", "provider"]);
const METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

const errors = [];
const fail = (where, msg) => errors.push({ where, message: msg });

// ── parse ─────────────────────────────────────────────────────
let doc;
try {
  doc = yaml.load(fs.readFileSync(SPEC, "utf8"));
} catch (err) {
  const out = { spec: SPEC, errors: [{ where: "document", message: "does not parse: " + err.message }] };
  console.log(JSON_OUT ? JSON.stringify(out, null, 2) : "✖ " + SPEC + "\n  does not parse: " + err.message);
  process.exit(1);
}

if (!doc || typeof doc !== "object") {
  const out = { spec: SPEC, errors: [{ where: "document", message: "is empty or not a mapping" }] };
  console.log(JSON_OUT ? JSON.stringify(out, null, 2) : "✖ empty or not a mapping");
  process.exit(1);
}

// ── document level ────────────────────────────────────────────
if (!/^3\.[01]\./.test(String(doc.openapi || ""))) {
  fail("document", 'openapi must be a 3.0.x or 3.1.x version string, got "' + doc.openapi + '"');
}
if (!doc.info || !doc.info.title) fail("info", "title is required");
if (!doc.info || !doc.info.version) fail("info", "version is required");
if (!Array.isArray(doc.servers) || doc.servers.length === 0) fail("servers", "at least one server is required");
if (!doc.components || !doc.components.schemas || !doc.components.schemas.Error) {
  fail("components.schemas.Error", "the single error envelope must be defined");
}
if (!doc.components || !doc.components.securitySchemes) {
  fail("components.securitySchemes", "at least one security scheme is required");
}

// ── operations ────────────────────────────────────────────────
const operationIds = new Map();
const paths = doc.paths || {};
let operationCount = 0;

for (const [route, item] of Object.entries(paths)) {
  if (!route.startsWith("/")) fail("paths", 'path "' + route + '" must start with /');
  for (const [method, op] of Object.entries(item || {})) {
    if (!METHODS.has(method)) continue;
    operationCount++;
    const where = method.toUpperCase() + " " + route;

    if (!op || typeof op !== "object") { fail(where, "operation is not a mapping"); continue; }

    if (!op.operationId) fail(where, "operationId is required — it names the generated client method");
    else if (operationIds.has(op.operationId)) {
      fail(where, 'operationId "' + op.operationId + '" is already used by ' + operationIds.get(op.operationId));
    } else operationIds.set(op.operationId, where);

    if (!op.summary) fail(where, "summary is required");

    // The two IMAP conventions. Both are build failures by design.
    if (!op["x-imap-action"]) {
      fail(where, "x-imap-action is required — an endpoint with no authorization action cannot be wired to the kernel");
    }
    if (MUTATING.has(method)) {
      const idem = op["x-imap-idempotency"];
      if (!idem) fail(where, "x-imap-idempotency is required on a mutating operation — undeclared does not ship");
      else if (!IDEMPOTENCY_VALUES.has(idem)) {
        fail(where, 'x-imap-idempotency must be one of ' + [...IDEMPOTENCY_VALUES].join(" | ") + ', got "' + idem + '"');
      }
    }

    if (!op.responses || Object.keys(op.responses).length === 0) fail(where, "at least one response is required");

    // A 2xx that returns nothing is usually an oversight; a 204 is explicit.
    const codes = Object.keys(op.responses || {});
    const success = codes.filter((c) => /^2\d\d$/.test(c));
    if (success.length === 0) fail(where, "no success response declared");
  }
}

// ── $ref integrity ────────────────────────────────────────────
// A dangling $ref generates a broken client, and the failure surfaces far
// from the typo. Resolved here instead.
(function checkRefs(node, trail) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((v, i) => checkRefs(v, trail + "[" + i + "]")); return; }
  for (const [k, v] of Object.entries(node)) {
    if (k === "$ref" && typeof v === "string") {
      if (!v.startsWith("#/")) { fail(trail, "external $ref is not permitted: " + v); continue; }
      const segments = v.slice(2).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
      let cur = doc;
      for (const seg of segments) {
        if (cur && typeof cur === "object" && seg in cur) cur = cur[seg];
        else { fail(trail, "dangling $ref: " + v); cur = undefined; break; }
      }
    } else checkRefs(v, trail + "." + k);
  }
})(doc, "$");

// ── report ────────────────────────────────────────────────────
const summary = {
  spec: path.relative(process.cwd(), SPEC).split(path.sep).join("/"),
  openapi: doc.openapi,
  operations: operationCount,
  schemas: Object.keys((doc.components && doc.components.schemas) || {}).length,
  errors,
};

if (JSON_OUT) {
  console.log(JSON.stringify(summary, null, 2));
} else if (errors.length === 0) {
  console.log("✔ " + summary.spec);
  console.log("  openapi " + doc.openapi + " · " + operationCount + " operation(s) · " + summary.schemas + " schema(s)");
  console.log("  every operation declares x-imap-action; every mutating operation declares x-imap-idempotency");
} else {
  console.log("✖ " + summary.spec + "\n");
  for (const e of errors) console.log("  " + e.where + "\n    " + e.message);
  console.log("\n" + errors.length + " error(s)");
}

process.exit(errors.length > 0 ? 1 : 0);
