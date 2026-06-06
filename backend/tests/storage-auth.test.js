// Regression test for the storage/perf hardening (no DB):
// the per-request auth lookup must NOT fetch the avatar blob.
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const fs       = require("node:fs");

const src = fs.readFileSync(require.resolve("../middleware/auth.js"), "utf8");

test("authMiddleware does not SELECT avatar on every request", () => {
  // Match the actual SQL literal (case-sensitive "SELECT id" to avoid prose like "selected").
  const m = src.match(/SELECT id,[\s\S]*?FROM users WHERE id/);
  assert.ok(m, "auth user SELECT statement should exist");
  const select = m[0];
  assert.ok(!/\bavatar\b/.test(select), "avatar (LONGTEXT blob) must not be selected per request");
  // sanity: it still fetches the fields needed for authz
  assert.ok(/\brole\b/.test(select));
  assert.ok(/\bis_active\b/.test(select));
});
