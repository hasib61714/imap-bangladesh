/**
 * Every module the server mounts must actually load.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `routes/admin.js` builds its SQL in a template literal, and a comment
 * inside that literal was written with backticks around an identifier —
 * which ends the literal. The file became a syntax error and the server
 * refused to start. Nothing in the suite noticed, because no test required
 * that file: the route tests stub the database and load a router directly,
 * and the ones that do load `admin.js` were not run in the same pass.
 *
 * A syntax error in a mounted route is total: the process does not start, so
 * every endpoint is down, not just that one. It is also the cheapest possible
 * thing to check.
 *
 * This is deliberately dumb. It requires each file and asserts it produced
 * something. It is not testing behaviour — the rest of the suite does that —
 * it is testing that the file is loadable at all, which is the failure mode
 * a stubbed unit test cannot see.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.APP_ENV = process.env.APP_ENV || "test";
process.env.DATABASE_ENV = process.env.DATABASE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.DB_NAME = process.env.DB_NAME || "imap_test";

const BACKEND = path.join(__dirname, "..");

/** Every file server.js mounts, read from server.js rather than guessed. */
function mountedRouterPaths() {
  const server = fs.readFileSync(path.join(BACKEND, "server.js"), "utf8");
  const paths = new Set();
  for (const m of server.matchAll(/app\.use\(\s*"[^"]*"\s*,[^)]*require\("(\.[^"]+)"\)/g)) {
    paths.add(m[1]);
  }
  return [...paths];
}

test("every mounted router parses and exports a router", async (t) => {
  const mounted = mountedRouterPaths();

  await t.test("server.js mounts a plausible number of routers", () => {
    // If this drops to nearly nothing the regex above stopped matching and
    // the rest of this file would pass by testing an empty list.
    assert.ok(mounted.length >= 15, `only found ${mounted.length} mounted routers`);
  });

  for (const rel of mounted) {
    await t.test(`${rel} loads`, () => {
      let mod;
      assert.doesNotThrow(() => { mod = require(path.join(BACKEND, rel)); },
        `${rel} could not be loaded — the server would not start`);
      // An express Router is a function with a `stack`.
      assert.ok(typeof mod === "function" || typeof mod === "object",
        `${rel} exported ${typeof mod}`);
    });
  }
});

test("every module composition root loads", async (t) => {
  for (const rel of [
    "./src/composition/modules",
    "./src/composition/platform",
    "./src/modules/identity",
    "./src/modules/marketplace",
    "./src/modules/platform",
    "./src/application/execute",
  ]) {
    await t.test(`${rel} loads`, () => {
      assert.doesNotThrow(() => require(path.join(BACKEND, rel)), `${rel} could not be loaded`);
    });
  }
});

/**
 * A backtick inside a template literal ends it. In a file that builds SQL
 * this turns a comment into a syntax error, and the failure is a server that
 * will not start rather than a query that misbehaves.
 *
 * The loader tests above already catch it. This names the specific mistake so
 * the next person reading a failure knows what to look for.
 */
test("no SQL template literal contains a stray backtick comment", () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(full); }
      else if (e.name.endsWith(".js")) files.push(full);
    }
  };
  walk(path.join(BACKEND, "routes"));
  walk(path.join(BACKEND, "src"));

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    // A SQL line comment inside a template literal that also contains a
    // backtick. MySQL identifier quoting is legitimate in SQL and fatal in
    // JS, so it has to be written without the quotes here.
    for (const line of src.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("--") && trimmed.includes("`")) {
        assert.fail(`${path.relative(BACKEND, file)}: SQL comment contains a backtick, ` +
          `which ends the template literal:\n    ${trimmed}`);
      }
    }
  }
});
