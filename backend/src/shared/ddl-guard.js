/**
 * Runtime DDL guard — IMAP
 *
 * I-02 §5's target is "Runtime DDL = 0".
 *
 * scripts/check-boundaries.js enforces that statically, and its limit was
 * measured rather than assumed. It now catches DDL split across lines, built
 * by string concatenation, RENAME, and database-level statements — but it
 * CANNOT see a fully dynamic verb:
 *
 *     const verb = "CRE" + "ATE";
 *     pool.query(`${verb} TABLE x (id INT)`);
 *
 * There is no keyword in the source to match. Verified against a fixture: the
 * hardened scanner detected zero. No static scanner can close that hole.
 *
 * This module closes it at execution time, where the statement is a concrete
 * string. It is the control that actually makes the target true; the scanner
 * is the one that makes a violation visible in review.
 *
 * Only SQL TEXT is inspected, never parameters. A message body containing the
 * words "DROP TABLE" travels as a bound parameter, is not SQL, and cannot
 * trip this.
 *
 * This file is the definition of the rule, so scripts/check-boundaries.js
 * exempts it from the rule — in the same way it exempts the migration runner.
 */
"use strict";

// Verb must precede object, within a window that may contain newlines, quotes
// and concatenation operators.
const PATTERN = new RegExp(
  [
    "\\b(?:CREATE|ALTER|DROP|RENAME|TRUNCATE)\\b[\\s\\S]{0,40}?\\b(?:TABLE|DATABASE|SCHEMA)\\b",
    "\\b(?:CREATE|DROP)\\b[\\s\\S]{0,20}?\\bINDEX\\b",
  ].join("|"),
  "i"
);

let allowed = false;

/**
 * Lift the guard for this process.
 *
 * Called ONLY by scripts/migrate.js. The
 * `no-ddl-enable-outside-migration-runner` boundary rule fails CI if anything
 * else calls it, so the exemption cannot spread quietly.
 */
function enableDdl() {
  allowed = true;
}

/** Test hook. Not used by application code. */
function __resetForTests() {
  allowed = false;
}

function isDdl(sqlText) {
  return typeof sqlText === "string" && PATTERN.test(sqlText);
}

class RuntimeDdlError extends Error {
  constructor(statement) {
    super(
      "Refusing to execute DDL at runtime.\n\n" +
      "  " + String(statement).replace(/\s+/g, " ").trim().slice(0, 160) + "\n\n" +
      "Schema changes belong in backend/migrations/. Runtime DDL made the\n" +
      "production schema depend on which module loaded first, and left\n" +
      "backend/schema.sql an incomplete description of the database.\n" +
      "If this is the migration runner, it must call enableDdl() first."
    );
    this.name = "RuntimeDdlError";
    this.code = "RUNTIME_DDL_REFUSED";
  }
}

/** @param {string|{sql?: string}} sql */
function assertNotDdl(sql) {
  if (allowed) return;
  const text = typeof sql === "string" ? sql : sql && sql.sql;
  if (isDdl(text)) throw new RuntimeDdlError(text);
}

/**
 * Wrap query/execute on a pool or a pooled connection, exactly once.
 * Pooled connections are reused, so each remembers that it is wrapped.
 */
function guard(target) {
  if (!target || target.__imapDdlGuarded) return target;
  for (const method of ["query", "execute"]) {
    if (typeof target[method] !== "function") continue;
    const original = target[method].bind(target);
    target[method] = function (sql, ...rest) {
      // REJECT, do not throw. mysql2/promise's query() always returns a
      // promise, and callers rely on it: a handler written as
      // `pool.query(...).catch(next)` would take an uncaught synchronous
      // throw instead of routing the error. Preserving the contract keeps the
      // guard from turning a schema mistake into a process crash.
      try {
        assertNotDdl(sql);
      } catch (err) {
        return Promise.reject(err);
      }
      return original(sql, ...rest);
    };
  }
  Object.defineProperty(target, "__imapDdlGuarded", { value: true, enumerable: false });
  return target;
}

module.exports = { enableDdl, assertNotDdl, isDdl, guard, RuntimeDdlError, __resetForTests };
