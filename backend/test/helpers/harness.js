/**
 * Test harness — IMAP Phase 0.5
 *
 * Deliberately dependency-free: it uses Node's built-in test runner and
 * global fetch. No test framework was added to the project.
 *
 * Route handlers are exercised against a fake connection pool injected
 * into require.cache before the route module is loaded, so the security
 * behaviour of the real handler is tested without a live database.
 */
const path = require("path");
const http = require("http");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-not-used-in-production";

const DB_PATH = require.resolve("../../db.js");

/**
 * A minimal fake mysql2/promise pool.
 *
 * `handlers` is an ordered list of { match, rows } where `match` is a
 * substring or RegExp tested against the SQL. The first match wins.
 * Every executed query is recorded on `pool.queries` so a test can assert
 * that (for example) no balance update was issued.
 */
function makePool(handlers = []) {
  const queries = [];

  const run = async (sql, params = []) => {
    queries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), params });
    for (const h of handlers) {
      const m = h.match instanceof RegExp
        ? h.match.test(sql)
        : String(sql).replace(/\s+/g, " ").includes(h.match);
      if (m) {
        const value = typeof h.rows === "function" ? h.rows(params, queries) : h.rows;
        if (value && value.__throw) throw value.__throw;
        return [value ?? [], []];
      }
    }
    return [[], []];
  };

  const conn = {
    query: run,
    beginTransaction: async () => { queries.push({ sql: "BEGIN", params: [] }); },
    commit:           async () => { queries.push({ sql: "COMMIT", params: [] }); },
    rollback:         async () => { queries.push({ sql: "ROLLBACK", params: [] }); },
    release:          () => {},
  };

  const pool = {
    query: run,
    getConnection: async () => conn,
    end: async () => {},
    queries,
    /** true when any recorded query matches */
    ran(substr) {
      return queries.some(q => q.sql.includes(substr));
    },
    /** all recorded queries matching a substring */
    all(substr) {
      return queries.filter(q => q.sql.includes(substr));
    },
    reset() { queries.length = 0; },
  };

  // withTransaction is attached to the db module, so the fake needs it too.
  pool.withTransaction = async (fn) => {
    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      const r = await fn(c);
      await c.commit();
      return r;
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  };

  return pool;
}

/** Install the fake pool as the `../db` module for subsequently-loaded routes. */
function installFakeDb(pool) {
  require.cache[DB_PATH] = {
    id: DB_PATH,
    filename: DB_PATH,
    loaded: true,
    exports: pool,
  };
  return pool;
}

const APP_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Drop every cached application module so the next require() gets a fresh
 * copy bound to the fake pool installed for this test.
 *
 * This has to be a full sweep rather than a targeted delete: route files
 * capture `const pool = require("../db")` at load time, so a module left in
 * the cache keeps talking to a previous test's pool. Arguments are accepted
 * and ignored so existing call sites keep working.
 */
function resetModules() {
  for (const id of Object.keys(require.cache)) {
    if (!id.startsWith(APP_ROOT)) continue;
    if (id.includes(`${path.sep}node_modules${path.sep}`)) continue;
    if (id.startsWith(path.join(APP_ROOT, "test"))) continue;  // keep the harness itself
    delete require.cache[id];
  }
  delete require.cache[DB_PATH];
}

/**
 * Mount a router on a bare express app and start it on an ephemeral port.
 * Returns { url, close }.
 */
async function serve(router, { basePath = "/", middleware = [] } = {}) {
  const express = require("express");
  const app = express();
  app.use(express.json());
  // server.js sets this on every request and the audit writer requires it —
  // a record with no correlation id cannot be tied to anything. The harness
  // omitted it, so a route under test behaved differently from the same route
  // in production. I-04 found that when authorization denials began writing
  // audit rows and every one failed here and nowhere else.
  app.use((req, res, next) => {
    req.requestId = req.headers["x-request-id"] || `test-${Math.random().toString(36).slice(2, 10)}`;
    res.setHeader("X-Request-ID", req.requestId);
    next();
  });
  for (const mw of middleware) app.use(mw);
  app.use(basePath, router);
  app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
  // Keep handler errors quiet and shaped like the real app.
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Fetch helper returning { status, body }. */
async function call(url, method, pathname, body, headers = {}) {
  const res = await fetch(url + pathname, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { status: res.status, body: parsed ?? {} };
}

/** Middleware that injects a fixed authenticated user (bypasses real auth). */
function asUser(user) {
  return (req, _res, next) => { req.user = user; next(); };
}

module.exports = { makePool, installFakeDb, resetModules, serve, call, asUser, DB_PATH };
