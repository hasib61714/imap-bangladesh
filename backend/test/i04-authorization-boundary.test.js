/**
 * I-04 — the rule that keeps the second authorization implementation out
 *
 * `requireRole` is deleted. Deleting it removes the mechanism; it does not
 * stop the pattern coming back one route at a time, which is how three
 * implementations came to exist. The boundary rule is what stops that, and a
 * rule that has only ever reported zero is indistinguishable from a rule that
 * cannot report anything.
 *
 * Every pattern below is a VERBATIM COPY of code that was in this repository
 * before this phase. If the rule fails to fire on one of them, it would not
 * have caught the original.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CHECKER = path.join(__dirname, "..", "scripts", "check-boundaries.js");
const RULE = "no-adhoc-authorization";

function runAgainst(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "imap-authz-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
    }
    const res = spawnSync(process.execPath, [CHECKER, `--root=${root}`, "--json"], { encoding: "utf8" });
    return { ...JSON.parse(res.stdout), status: res.status };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const fired = (r) => r.errors.some((v) => v.rule === RULE);

// ── the patterns that were actually here ────────────────────
const HISTORICAL = {
  "requireRole, as admin.js had it": {
    "routes/admin.js":
      'const { authMiddleware, requireRole } = require("../middleware/auth");\n' +
      'const auth = [authMiddleware, requireRole("admin")];\n',
  },
  "the inline comparison kyc.js had": {
    "routes/kyc.js":
      'router.patch("/:id", authMiddleware, async (req, res) => {\n' +
      '  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });\n' +
      "});\n",
  },
  "the inline comparison chat.js had": {
    "routes/chat.js": 'const isAdmin = req.user.role === "admin";\n',
  },
  "the role hidden inside a WHERE clause, as payments.js had it": {
    "routes/payments.js":
      'const [rows] = await pool.query(\n' +
      '  "SELECT p.* FROM payments p WHERE p.id=? AND (p.user_id=? OR ?=\'admin\')",\n' +
      "  [req.params.id, req.user.id, req.user.role]\n" +
      ");\n",
  },
  "the same, in the UPDATE upload.js used": {
    "routes/upload.js":
      'await pool.query("UPDATE bookings SET completion_proof=? WHERE id=? AND (customer_id=? OR ?=\'admin\')", args);\n',
  },
  "the reversed comparison order": {
    "utils/thing.js": 'if ("platform_owner" === actor.role) allow();\n',
  },
  "a platform role invented in a route instead of a policy": {
    "routes/finance.js": 'if (req.user.role == "finance") { payout(); }\n',
  },
};

for (const [name, files] of Object.entries(HISTORICAL)) {
  test(`no-adhoc-authorization fires on ${name}`, () => {
    const r = runAgainst(files);
    assert.ok(fired(r), `${name} would have shipped`);
    assert.equal(r.status, 1, "the checker must exit non-zero so CI fails");
  });
}

// ── and does not fire where a role literal is legitimate ────
test("the authorization module itself is exempt — it is where roles are defined", () => {
  const r = runAgainst({
    "src/modules/platform/authorization/legacy.js":
      'const LEGACY_ROLE_GRANT = { admin: PLATFORM_ROLES };\n' +
      'if (legacyRole === "admin") return grantAll();\n',
  });
  assert.equal(fired(r), false);
});

test("customer and provider are deliberately unwatched", () => {
  // routes/auth.js creates a provider profile at registration. That is a
  // domain rule about what to insert, not a decision about who may act, and
  // a rule that flags it would collect exemptions until it meant nothing.
  const r = runAgainst({
    "routes/auth.js": 'if (role === "provider") {\n  await createProviderProfile(id);\n}\n',
  });
  assert.equal(fired(r), false);
});

test("the booking participant vocabulary is exempt, by name and for a reason", () => {
  // "customer" | "provider" | "admin" here means which SIDE of a booking an
  // actor is on. bookingState.js uses it to decide which transitions are
  // legal — the state machine's question, not the kernel's (§19).
  const r = runAgainst({
    "utils/bookingState.js": 'const TRANSITIONS = { active: { cancelled: ["admin"] } };\n' +
      'if (!allowed.includes(actorRole)) throw new TransitionError("no");\n',
    "realtime.js": 'if (socket.bookingRole !== "provider" && socket.bookingRole !== "admin") return;\n',
  });
  assert.equal(fired(r), false);
});

test("a role literal inside a comment does not fire", () => {
  const r = runAgainst({
    "routes/thing.js": '// I-04: `requireRole("admin")` is gone from this file.\n' +
      '/* the old code was: if (req.user.role === "admin") */\n' +
      'router.get("/", requireAuthorization(ACTION.STATS_READ), handler);\n',
  });
  assert.equal(fired(r), false, "the analyser blanks comments; a note about the defect is not the defect");
});

// ── the live tree ───────────────────────────────────────────
test("the repository has no ad-hoc authorization left", () => {
  const res = spawnSync(process.execPath, [CHECKER, "--json"], {
    encoding: "utf8", cwd: path.join(__dirname, ".."),
  });
  const report = JSON.parse(res.stdout);
  const hits = report.errors.filter((v) => v.rule === RULE);
  assert.deepEqual(hits, [], "an inline authorization check survived the migration");
});

test("requireRole is gone from middleware/auth.js, not merely unused", () => {
  // Read, do not require: middleware/auth.js pulls in db.js, which opens a
  // connection pool at import and holds the event loop open for the whole run.
  const src = fs.readFileSync(path.join(__dirname, "..", "middleware", "auth.js"), "utf8");
  assert.equal(/^\s*function requireRole/m.test(src), false, "the function is still defined");
  const exportLine = /module\.exports\s*=\s*\{([^}]*)\}/.exec(src);
  assert.ok(exportLine, "module.exports not found");
  assert.equal(/requireRole/.test(exportLine[1]), false,
    "leaving it exported leaves the old path available one route at a time");
});
