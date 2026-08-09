#!/usr/bin/env node
/**
 * Import-boundary checker — IMAP
 *
 *   node scripts/check-boundaries.js             report; exit 1 on any error-level violation
 *   node scripts/check-boundaries.js --strict    warnings are errors too
 *   node scripts/check-boundaries.js --json      machine-readable
 *   node scripts/check-boundaries.js --root=DIR  check a fixture tree (tests)
 *
 * `SYSTEM-ARCHITECTURE.md` §4.2: "Boundaries decay without tooling — that is
 * precisely what happened to the current codebase, where utils/response.js was
 * written to standardise responses and imported by zero route files."
 *
 * Zero dependencies, deliberately. The repository already chose node:test over
 * a test framework for the same reason: a rule that needs a toolchain to run is
 * a rule that stops running.
 *
 * TWO SEVERITIES, and the split is principled:
 *
 *   error  — rules the code satisfies TODAY. Enforced immediately, so they
 *            cannot regress. A new violation fails CI.
 *   warn   — rules the legacy layout violates by construction (SQL in route
 *            files, express imported outside a transport directory). Counted,
 *            not failed, so the number can only go down as modules migrate.
 *            Each becomes an error when its last violation is gone
 *            (TARGET-REPOSITORY-STRUCTURE.md §8 steps 2 and 9).
 *
 * LIMITS, stated rather than discovered:
 *
 *   - This is a scanner with a comment and string analyser, not a parser. It
 *     does not resolve dynamic requires, computed paths or aliases.
 *   - The DDL rule fires on DDL text in ANY string, including prose. It has
 *     to see string contents or it cannot see real DDL at all, and it cannot
 *     tell a query string from a sentence. The trade is deliberate and in the
 *     correct direction: a false positive is a one-line fix (write it in a
 *     comment), a false negative is the defect the rule exists to prevent.
 *     Pinned by a test so the choice stays visible.
 */
"use strict";

const fs = require("fs");
const path = require("path");

// --root lets the test suite point the checker at a fixture tree, which is how
// the error rules are proven to fire rather than merely to pass (Phase 4 §33).
const rootArg = process.argv.find((a) => a.startsWith("--root="));
const ROOT = rootArg ? path.resolve(rootArg.slice("--root=".length)) : path.join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "coverage", "dist", "deferred"]);

const args = process.argv.slice(2);
const STRICT = args.includes("--strict");
const JSON_OUT = args.includes("--json");

// ──────────────────────────────────────────────────────────────
// Source analysis
// ──────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

/**
 * One pass, two outputs, because the rules need opposite things:
 *
 *   code          comments blanked, STRINGS INTACT, same length as the input
 *                 so indices map 1:1. DDL detection needs string contents —
 *                 every real CREATE TABLE lives inside a query string.
 *   stringRanges  where the string bodies are, so import detection can reject
 *                 a require() that is itself inside a string literal.
 *
 * Getting this backwards made the DDL rule vacuous: it reported zero not
 * because the repository was clean but because it could never fire. That was
 * caught by test/i01-boundaries.test.js, which is the reason that file exists.
 */
function analyse(src) {
  const NEWLINE = String.fromCharCode(10);
  const BACKSLASH = String.fromCharCode(92);
  let out = "";
  const stringRanges = [];
  let i = 0;
  const n = src.length;
  let inLine = false;
  let inBlock = false;
  let quote = null;
  let quoteStart = -1;

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    if (inLine) {
      if (c === NEWLINE) { inLine = false; out += c; } else { out += " "; }
      i++; continue;
    }
    if (inBlock) {
      if (c === "*" && c2 === "/") { inBlock = false; out += "  "; i += 2; }
      else { out += c === NEWLINE ? c : " "; i++; }
      continue;
    }
    if (quote) {
      if (c === BACKSLASH) { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === quote) { stringRanges.push([quoteStart, i]); quote = null; out += c; i++; continue; }
      out += c; i++; continue;                      // string body preserved verbatim
    }
    if (c === "/" && c2 === "/") { inLine = true; out += "  "; i += 2; continue; }
    if (c === "/" && c2 === "*") { inBlock = true; out += "  "; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; quoteStart = i + 1; out += c; i++; continue; }
    out += c; i++;
  }
  if (quote) stringRanges.push([quoteStart, n]);    // unterminated: treat the rest as string
  return { code: out, stringRanges };
}

const REQUIRE_RE = /(?:require\(\s*|from\s+)["']([^"']+)["']/g;

/**
 * Imports in `code`, excluding any match that begins inside a string literal.
 * A fixture containing the text of a require() call is data, not a dependency —
 * without this the checker reports its own tests as violations.
 */
function importsOf(code, stringRanges) {
  const inString = (idx) => stringRanges.some((range) => idx >= range[0] && idx < range[1]);
  const found = [];
  let m;
  REQUIRE_RE.lastIndex = 0;
  while ((m = REQUIRE_RE.exec(code)) !== null) {
    if (inString(m.index)) continue;
    found.push({ spec: m[1], index: m.index });
  }
  return found;
}

const lineOf = (src, index) => src.slice(0, index).split(String.fromCharCode(10)).length;

// ──────────────────────────────────────────────────────────────
// Rules
// ──────────────────────────────────────────────────────────────
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

const inSrcModules = (r) => r.startsWith("src/modules/");
const moduleOf = (r) => (inSrcModules(r) ? r.split("/")[2] : null);
const layerOf = (r) => (inSrcModules(r) ? r.split("/")[3] : null);

// Multiline and concatenation aware. The I-01 version matched a single line
// and therefore caught NONE of these, which was verified rather than assumed:
//
//   pool.query(`CREATE⏎  TABLE x (...)`)   split across lines
//   pool.query("CREATE " + "TABLE x")      built by concatenation
//   pool.query("RENAME TABLE a TO b")      a verb it never mentioned
//   pool.query("DROP DATABASE x")          database level
//
// The verb must precede the object within a short window that may contain
// newlines, quotes and concatenation operators.
//
// STILL UNDETECTABLE, stated rather than left to be discovered: a fully
// dynamic verb — pool.query(`${verb} TABLE x`) — contains no DDL keyword to
// match, and no static scanner can see it. That is why db.js also refuses DDL
// at execution time; assertNotDdl() there catches what this cannot.
const DDL_RE = /\b(?:CREATE|ALTER|DROP|RENAME|TRUNCATE)\b[\s\S]{0,60}?\b(?:TABLE|DATABASE|SCHEMA)\b|\b(?:CREATE|DROP)\b[\s\S]{0,30}?\bINDEX\b/i;

/** Where DDL is legitimate: migrations, the runner, and test fixtures. */
// The guard module is the definition of the rule, so it is exempt from it —
// the same reason the migration runner is.
const DDL_ALLOWED = [/^scripts\//, /^migrations\//, /^test\//, /^src\/shared\/ddl-guard\.js$/];

const LINES = (s) => s.split(String.fromCharCode(10));

const RULES = [
  {
    id: "no-ddl-outside-migrations",
    severity: "error",
    why: "Runtime DDL made the schema depend on module load order (I-01.1). Migrations are the only authority.",
    check(file, r, code) {
      if (DDL_ALLOWED.some((p) => p.test(r))) return [];
      const hits = [];
      const re = new RegExp(DDL_RE.source, "gi");
      let m;
      while ((m = re.exec(code)) !== null) {
        hits.push({
          line: lineOf(code, m.index),
          detail: m[0].replace(/\s+/g, " ").trim().slice(0, 72),
        });
      }
      return hits;
    },
  },
  {
    id: "no-ddl-enable-outside-migration-runner",
    severity: "error",
    why: "enableDdl() lifts the runtime DDL guard in db.js. Only the migration runner may call it.",
    check(file, r, code) {
      // Exempt: the migration runner (the one legitimate caller), the tests
      // that prove the guard fires, db.js which re-exports it, and the guard
      // module itself which defines it.
      if (/^scripts\//.test(r) || /^test\//.test(r)) return [];
      if (r === "db.js" || r === "src/shared/ddl-guard.js") return [];
      const hits = [];
      LINES(code).forEach((line, i) => {
        if (/\benableDdl\s*\(/.test(line)) hits.push({ line: i + 1, detail: line.trim().slice(0, 72) });
      });
      return hits;
    },
  },
  {
    id: "domain-imports-nothing-outward",
    severity: "error",
    why: "domain/ must stay pure so it is testable without a database (SYSTEM-ARCHITECTURE §4.1).",
    check(file, r, code, imports) {
      if (layerOf(r) !== "domain") return [];
      return imports
        .filter(({ spec }) =>
          /(^|\/)(infrastructure|transport|application)(\/|$)/.test(spec) ||
          /^(express|socket\.io|mysql2)/.test(spec))
        .map(({ spec, index }) => ({ line: lineOf(code, index), detail: 'domain/ imports "' + spec + '"' }));
    },
  },
  {
    id: "cross-module-via-index-only",
    severity: "error",
    why: "A module's internals are private; crossing into them is how five modules become one.",
    check(file, r, code, imports) {
      const mine = moduleOf(r);
      if (!mine) return [];
      const hits = [];
      for (const { spec, index } of imports) {
        if (!spec.startsWith(".")) continue;
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(r), spec));
        if (!target.startsWith("src/modules/")) continue;
        const theirs = target.split("/")[2];
        if (theirs === mine) continue;
        const isIndex = target === "src/modules/" + theirs || /\/index(\.js)?$/.test(target);
        if (!isIndex) {
          hits.push({ line: lineOf(code, index), detail: mine + " reaches into " + theirs + ' internals: "' + spec + '"' });
        }
      }
      return hits;
    },
  },
  {
    id: "no-deferred-imports",
    severity: "error",
    why: "Deferred code must not become a hidden dependency of an active Gate-1 flow (Phase 4 §42).",
    check(file, r, code, imports) {
      return imports
        .filter(({ spec }) => /(^|\/)deferred\//.test(spec))
        .map(({ spec, index }) => ({ line: lineOf(code, index), detail: 'imports deferred code "' + spec + '"' }));
    },
  },
  {
    id: "sql-only-in-infrastructure",
    severity: "warn",
    why: "SQL lives in repositories. 18 route files currently issue it directly; each clears as its module migrates.",
    check(file, r, code) {
      if (/^src\/modules\/[^/]+\/infrastructure\//.test(r)) return [];
      if (/^(migrations|scripts|test)\//.test(r) || r === "db.js") return [];
      const hits = [];
      LINES(code).forEach((line, i) => {
        if (/\b(?:pool|conn|connection|db)\s*\.\s*(?:query|execute)\s*\(/.test(line)) {
          hits.push({ line: i + 1, detail: line.trim().slice(0, 72) });
        }
      });
      return hits;
    },
  },
  {
    id: "transport-libs-only-in-transport",
    severity: "warn",
    why: "express/socket.io outside transport/ couples a use case to one protocol; the job runner and the future tool layer call the same use cases.",
    check(file, r, code, imports) {
      if (/^(src\/transport|test|scripts)\//.test(r) || r === "server.js" || r === "realtime.js") return [];
      if (/^src\/modules\/[^/]+\/transport\//.test(r)) return [];
      return imports
        .filter(({ spec }) => /^(express|socket\.io)(\/|$)/.test(spec))
        .map(({ spec, index }) => ({ line: lineOf(code, index), detail: 'imports "' + spec + '"' }));
    },
  },
];

// ──────────────────────────────────────────────────────────────
// Run
// ──────────────────────────────────────────────────────────────
const files = [
  ...["src", "routes", "utils", "middleware", "config", "scripts", "test"]
    .filter((d) => fs.existsSync(path.join(ROOT, d)))
    .flatMap((d) => walk(path.join(ROOT, d))),
  ...["server.js", "realtime.js", "db.js"].map((f) => path.join(ROOT, f)).filter(fs.existsSync),
];

const violations = [];
for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const r = rel(file);
  const { code, stringRanges } = analyse(raw);
  const imports = importsOf(code, stringRanges);
  for (const rule of RULES) {
    for (const hit of rule.check(file, r, code, imports)) {
      violations.push({ rule: rule.id, severity: rule.severity, file: r, line: hit.line, detail: hit.detail });
    }
  }
}

const errors = violations.filter((v) => v.severity === "error");
const warns = violations.filter((v) => v.severity === "warn");

if (JSON_OUT) {
  console.log(JSON.stringify({ files: files.length, errors, warns }, null, 2));
} else {
  console.log("import boundaries — " + files.length + " files\n");
  for (const rule of RULES) {
    const hits = violations.filter((v) => v.rule === rule.id);
    const mark = hits.length === 0 ? "✔" : rule.severity === "error" ? "✖" : "⚠";
    console.log(mark + " " + rule.id + "  [" + rule.severity + "]  " + hits.length + " violation(s)");
    if (hits.length === 0) continue;
    console.log("    " + rule.why);
    for (const h of hits.slice(0, 8)) console.log("    " + h.file + ":" + h.line + "  " + h.detail);
    if (hits.length > 8) console.log("    … and " + (hits.length - 8) + " more");
  }
  console.log("\n" + errors.length + " error(s), " + warns.length + " warning(s)");
  if (warns.length && !STRICT) {
    console.log("Warnings are legacy-layout violations that clear as modules migrate; they do not fail the build yet.");
  }
}

process.exit(errors.length > 0 || (STRICT && warns.length > 0) ? 1 : 0);
