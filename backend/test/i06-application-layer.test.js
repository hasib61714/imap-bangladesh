/**
 * I-06 — the application layer
 *
 * §25's four architecture claims, asserted rather than asserted-about:
 * a use case does not depend on Express, a repository does not depend on
 * transport, a protected use case denies by default, and a mandatory audit
 * record is atomic with the change it records.
 *
 * NEGATIVE CONTROLS (§25) are named at the tests that carry them. Each was
 * reverted, the failure observed, and the file restored — the record is in
 * docs/implementation/I-06-APPLICATION-ARCHITECTURE.md §10.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.APP_ENV = process.env.APP_ENV || "test";
process.env.DATABASE_ENV = process.env.DATABASE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { defineUseCase } = require("../src/application/useCase");
const registry = require("../src/application/registry");
const { execute } = require("../src/application/execute");
const { StartupError, ForbiddenError, NotFoundError, UnauthenticatedError, isAppError } =
  require("../src/shared/errors");
const platform = require("../src/modules/platform");
const { makeActor, anonymousActor } = platform.authorization;
const { ROLE } = platform.authorization;

// The composition root, once. Without it the marketplace policies and loaders
// are absent and every authorization call denies with `policy_denied` — which
// would make the denial tests below pass for entirely the wrong reason.
require("../src/composition/modules").composeModules();
const REAL_USE_CASES = registry.registeredUseCases();

/** Put the register back the way the composition root built it. */
function restoreRegister() {
  registry.__resetUseCaseRegistryForTests();
  delete require.cache[require.resolve("../src/modules/marketplace")];
  require("../src/modules/marketplace").installMarketplace();
}

const BACKEND = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(BACKEND, rel), "utf8");

/** A pool the executor can drive, recording everything it is asked to run. */
function fakeDb(tables = {}) {
  const queries = [];
  const run = async (sql, params = []) => {
    const flat = String(sql).replace(/\s+/g, " ").trim();
    queries.push({ sql: flat, params });
    for (const [needle, rows] of Object.entries(tables)) {
      if (flat.includes(needle)) {
        const v = typeof rows === "function" ? rows(params) : rows;
        if (v && v.__throw) throw v.__throw;
        return [v ?? [], []];
      }
    }
    return [[], []];
  };
  const conn = { query: run, __isConn: true };
  const db = {
    query: run,
    queries,
    ran: (s) => queries.some((q) => q.sql.includes(s)),
    all: (s) => queries.filter((q) => q.sql.includes(s)),
    async withTransaction(fn) {
      queries.push({ sql: "BEGIN", params: [] });
      try {
        const r = await fn(conn);
        queries.push({ sql: "COMMIT", params: [] });
        return r;
      } catch (e) {
        queries.push({ sql: "ROLLBACK", params: [] });
        throw e;
      }
    },
  };
  return db;
}

const customer = () => makeActor({ principalId: "u-1", roles: [ROLE.CUSTOMER], source: "test", correlationId: "c-1" });

// ════════════════════════════════════════════════════════════
test("§25 the layers are what they claim to be", async (t) => {
  const applicationFiles = [
    "src/application/useCase.js",
    "src/application/registry.js",
    "src/application/execute.js",
    "src/modules/marketplace/application/queries/SearchFulfillmentCandidates.js",
    "src/modules/marketplace/application/queries/ReadProviderProfile.js",
    "src/modules/marketplace/application/queries/ReadOwnProviderProfile.js",
    "src/modules/marketplace/application/queries/ReadOwnEarnings.js",
    "src/modules/marketplace/application/queries/ReadOwnJobs.js",
    "src/modules/marketplace/application/commands/ApplyAsProvider.js",
    "src/modules/marketplace/application/commands/UpdateOwnProviderProfile.js",
    "src/modules/marketplace/application/commands/SetOwnAvailability.js",
  ];

  // NEGATIVE CONTROL: add `const express = require("express")` to any use case
  // and the boundary rule fails the build; this asserts the same property at
  // the file level so the reason is visible where the code is.
  await t.test("no use case knows about Express", () => {
    for (const f of applicationFiles) {
      const src = read(f);
      assert.equal(/require\(\s*["']express["']\s*\)/.test(src), false, `${f} imports express`);
      assert.equal(/\breq\s*\.\s*(?:body|params|query|headers)\b/.test(src), false, `${f} reads a request`);
      assert.equal(/\bres\s*\.\s*(?:status|json|send)\b/.test(src), false, `${f} writes a response`);
    }
  });

  await t.test("no use case writes SQL", () => {
    for (const f of applicationFiles) {
      assert.equal(/\b(?:pool|conn|db|tx)\s*\.\s*(?:query|execute)\s*\(/.test(read(f)), false,
        `${f} queries the database directly`);
    }
  });

  await t.test("no use case decides an HTTP status", () => {
    for (const f of applicationFiles) {
      assert.equal(/\bstatus\s*:\s*(?:200|201|400|401|403|404|409|422|500)\b/.test(read(f)), false,
        `${f} names an HTTP status`);
    }
  });

  await t.test("no repository knows about transport", () => {
    const repos = [
      "src/modules/marketplace/infrastructure/repositories/providerRepository.js",
      "src/modules/marketplace/infrastructure/repositories/providerActivityRepository.js",
      "src/modules/marketplace/infrastructure/repositories/scheduleRepository.js",
    ];
    for (const f of repos) {
      const src = read(f);
      assert.equal(/require\(\s*["'](?:express|socket\.io)["']\s*\)/.test(src), false, `${f} imports a transport`);
      assert.equal(/\bres\s*\.\s*(?:status|json)\b/.test(src), false, `${f} writes a response`);
      // §14: a repository executes persistence; it does not decide who may.
      assert.equal(/\bauthorize\s*\(/.test(src), false, `${f} makes an authorization decision`);
    }
  });

  await t.test("the domain performs no I/O at all", () => {
    const domain = fs.readdirSync(path.join(BACKEND, "src/modules/marketplace/domain"));
    assert.ok(domain.length >= 5);
    for (const file of domain) {
      const src = read(`src/modules/marketplace/domain/${file}`);
      assert.equal(/require\(\s*["'][^"']*(?:db|repositor|express|mysql)[^"']*["']\s*\)/i.test(src), false,
        `domain/${file} reaches for I/O`);
      assert.equal(/\basync\s+function\b/.test(src), false,
        `domain/${file} is async, which at this layer means it is doing I/O`);
    }
  });

  await t.test("the route file is a transport adapter and nothing else", () => {
    const src = read("src/modules/marketplace/transport/routes.js");
    assert.equal(/\b(?:pool|conn|db)\s*\.\s*query\s*\(/.test(src), false, "the route issues SQL");
    assert.equal(/\bwithTransaction\b/.test(src), false, "the route opens a transaction");
    assert.equal(/\bwriteAudit\b/.test(src), false, "the route writes an audit record");
    assert.equal(/\bauthorize\s*\(/.test(src), false, "the route decides authorization");
    // Every handler reaches the domain through the executor.
    const executes = (src.match(/execute\(/g) || []).length;
    assert.equal(executes, 8, `expected one execute() per handler, found ${executes}`);
  });
});

// ════════════════════════════════════════════════════════════
test("§9 the use-case contract refuses an incomplete declaration", async (t) => {
  const ok = { kind: "query", action: "provider.read", idempotency: "read_only", audit: "none", why: "x", run: async () => null };

  // NEGATIVE CONTROL: remove the `spec.action` check in useCase.js and the
  // first of these passes — which is a use case shipping unguarded.
  await t.test("a use case with no authorization action is refused", () => {
    assert.throws(() => defineUseCase("test.NoAction", { ...ok, action: undefined }), /declares no authorization action/);
    assert.throws(() => defineUseCase("test.BlankAction", { ...ok, action: "  " }), /declares no authorization action/);
  });

  await t.test("a mutating use case with no idempotency declaration is refused", () => {
    assert.throws(
      () => defineUseCase("test.NoIdem", { ...ok, kind: "command", idempotency: undefined, audit: "none" }),
      /must declare idempotency/
    );
    assert.throws(
      () => defineUseCase("test.BadIdem", { ...ok, kind: "command", idempotency: "probably_fine" }),
      /must declare idempotency/
    );
  });

  await t.test("a command cannot claim to be read-only, and a query cannot claim otherwise", () => {
    assert.throws(() => defineUseCase("test.LyingCommand", { ...ok, kind: "command" }), /cannot be "read_only"/);
    assert.throws(
      () => defineUseCase("test.LyingQuery", { ...ok, idempotency: "naturally_idempotent" }),
      /must declare idempotency "read_only"/
    );
  });

  await t.test("`idempotency_key` is refused while the key table does not exist", () => {
    // AD-010 layer (a) is I-11. Accepting the declaration would be a promise
    // with no mechanism behind it.
    assert.throws(
      () => defineUseCase("test.Keyed", { ...ok, kind: "command", idempotency: "idempotency_key" }),
      /the key table does not exist yet/
    );
  });

  await t.test("an audited read must say so deliberately (V-07)", () => {
    assert.throws(() => defineUseCase("test.QuietRead", { ...ok, audit: "required" }), /auditedRead: true/);
    assert.doesNotThrow(() => defineUseCase("test.SealedRead", { ...ok, audit: "required", auditedRead: true }));
  });

  await t.test("a use case with no name shape, no run and no why is refused", () => {
    assert.throws(() => defineUseCase("badname", ok), /module\.VerbNoun/);
    assert.throws(() => defineUseCase("test.NoRun", { ...ok, run: undefined }), /no run function/);
    assert.throws(() => defineUseCase("test.NoWhy", { ...ok, why: "" }), /no "why"/);
  });
});

// ════════════════════════════════════════════════════════════
test("§9 the startup assertion", async (t) => {
  t.afterEach(() => registry.__resetUseCaseRegistryForTests());
  t.after(() => restoreRegister());

  const policies = {
    "provider.read": { cardinality: "instance", resource: "provider_profile", permission: "read" },
    "discovery.search": { cardinality: "collection", resource: "provider_profile", permission: "read" },
    "provider.update_own": { cardinality: "instance", resource: "own_provider_profile", permission: "update" },
  };
  const deps = { getPolicy: (a) => policies[a] || null };

  // NEGATIVE CONTROL: make assertUseCaseRegistryIsSound return without
  // checking and every case below passes.
  await t.test("an action no policy registers refuses startup", () => {
    registry.registerUseCase(defineUseCase("test.Ghost", {
      kind: "query", action: "provider.reed", idempotency: "read_only", audit: "none",
      resource: (i) => i.id, why: "a typo nobody would see until production",
      run: async () => null,
    }));
    assert.throws(() => registry.assertUseCaseRegistryIsSound(deps), /which no policy registers/);
  });

  await t.test("an instance policy with no resource() refuses startup", () => {
    registry.registerUseCase(defineUseCase("test.NoResource", {
      kind: "query", action: "provider.read", idempotency: "read_only", audit: "none",
      why: "x", run: async () => null,
    }));
    assert.throws(() => registry.assertUseCaseRegistryIsSound(deps), /declares no resource/);
  });

  await t.test("a collection policy given a resource() refuses startup", () => {
    registry.registerUseCase(defineUseCase("test.ExtraResource", {
      kind: "query", action: "discovery.search", idempotency: "read_only", audit: "none",
      resource: (i) => i.id, why: "x", run: async () => null,
    }));
    assert.throws(() => registry.assertUseCaseRegistryIsSound(deps), /is a collection policy/);
  });

  await t.test("a query pointed at a mutating policy refuses startup", () => {
    registry.registerUseCase(defineUseCase("test.QueryOnUpdate", {
      kind: "query", action: "provider.update_own", idempotency: "read_only", audit: "none",
      resource: (i, c) => c.actor.principalId, why: "x", run: async () => null,
    }));
    assert.throws(() => registry.assertUseCaseRegistryIsSound(deps), /carries permission "update"/);
  });

  await t.test("a sound register is accepted", () => {
    registry.registerUseCase(defineUseCase("test.Fine", {
      kind: "query", action: "discovery.search", idempotency: "read_only", audit: "none",
      why: "x", run: async () => null,
    }));
    assert.deepEqual(registry.assertUseCaseRegistryIsSound(deps), { useCases: 1 });
  });

  await t.test("the same use case cannot be registered twice", () => {
    const uc = defineUseCase("test.Twice", {
      kind: "query", action: "discovery.search", idempotency: "read_only", audit: "none",
      why: "x", run: async () => null,
    });
    registry.registerUseCase(uc);
    assert.throws(() => registry.registerUseCase(uc), /already registered/);
  });
});

// ════════════════════════════════════════════════════════════
test("§11, §13, §12 the executor composes authorization, the transaction and the audit", async (t) => {

  await t.test("a denial never reaches the use case, and never opens a write", async () => {
    const db = fakeDb({ "FROM providers p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id": [] });
    let ran = false;
    const uc = defineUseCase("test.Denied", {
      kind: "command", action: "provider.update_own",
      resource: (i, c) => c.actor.principalId,
      idempotency: "naturally_idempotent", audit: "required", why: "x",
      run: async () => { ran = true; },
    });
    registry.registerUseCase(uc);

    await assert.rejects(
      () => execute("test.Denied", {}, { actor: customer(), db, repositories: {}, correlationId: "c-1" }),
      (err) => { assert.ok(isAppError(err)); return true; }
    );
    assert.equal(ran, false, "the use case must not run on a denial");
    assert.equal(db.ran("UPDATE providers"), false, "no state changed");
    assert.equal(db.ran("INSERT INTO providers"), false, "no state changed");
    // The denial IS written, out of band on the pool: a record on the
    // transaction would be lost to the rollback that follows it.
    await new Promise((r) => setImmediate(r));
    assert.equal(db.ran("INSERT INTO audit_log"), true, "an audited denial must survive the rollback");
  });

  await t.test("an anonymous actor is refused before anything else", async () => {
    const db = fakeDb();
    await assert.rejects(
      () => execute("test.Denied", {}, { actor: anonymousActor({ correlationId: "c-2" }), db, repositories: {}, correlationId: "c-2" }),
      (err) => { assert.ok(err instanceof UnauthenticatedError || err instanceof ForbiddenError || err instanceof NotFoundError); return true; }
    );
  });

  // NEGATIVE CONTROL: delete the `staged.length === 0` check in execute.js and
  // this commits a state change with no audit record — AD-009 undone.
  await t.test("a command that stages no record does not commit", async () => {
    const db = fakeDb({
      "FROM providers p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id":
        [{ id: "p-1", user_id: "u-1", is_approved: 1, is_available: 1, provider_source: "external", account_active: 1 }],
    });
    registry.registerUseCase(defineUseCase("test.ForgetsAudit", {
      kind: "command", action: "provider.update_own",
      resource: (i, c) => c.actor.principalId,
      idempotency: "naturally_idempotent", audit: "required", why: "x",
      run: async (input, ctx) => { await ctx.repositories.noop(ctx.tx); },
    }));

    const repositories = { noop: async (tx) => tx.query("UPDATE providers SET rating = 5") };
    await assert.rejects(
      () => execute("test.ForgetsAudit", {}, { actor: customer(), db, repositories, correlationId: "c-1" }),
      (err) => { assert.ok(err instanceof StartupError); assert.match(err.message, /staged no record/); return true; }
    );
    assert.equal(db.ran("ROLLBACK"), true, "the state change must not survive a missing audit record");
    assert.equal(db.ran("COMMIT"), false);
  });

  await t.test("a staged record is written inside the transaction, before the commit", async () => {
    const db = fakeDb({
      "FROM providers p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id":
        [{ id: "p-1", user_id: "u-1", is_approved: 1, is_available: 1, provider_source: "external", account_active: 1 }],
      "INSERT INTO audit_log": { affectedRows: 1 },
      "UPDATE providers": { affectedRows: 1 },
    });
    registry.registerUseCase(defineUseCase("test.Audits", {
      kind: "command", action: "provider.update_own",
      resource: (i, c) => c.actor.principalId,
      idempotency: "naturally_idempotent", audit: "required", why: "x",
      run: async (input, ctx) => {
        await ctx.tx.query("UPDATE providers SET hourly_rate = 500");
        ctx.recordAudit({
          resourceType: "provider_profile", resourceId: "p-1", resourceOwner: "u-1",
          before: { hourly_rate: 400 }, after: { hourly_rate: 500 },
        });
        return { ok: true };
      },
    }));

    const out = await execute("test.Audits", {}, { actor: customer(), db, repositories: {}, correlationId: "c-1" });
    assert.deepEqual(out, { ok: true });

    const order = db.queries.map((q) => q.sql.split(" ").slice(0, 3).join(" "));
    const begin = order.indexOf("BEGIN");
    const update = order.findIndex((s) => s.startsWith("UPDATE providers"));
    const audit = order.findIndex((s) => s.startsWith("INSERT INTO audit_log"));
    const commit = order.indexOf("COMMIT");
    assert.ok(begin >= 0 && commit > begin);
    assert.ok(update > begin && update < commit, "the change is inside the transaction");
    assert.ok(audit > begin && audit < commit, "so is the record");
  });

  await t.test("a query opens no transaction", async () => {
    const db = fakeDb({ "FROM providers p": [] });
    registry.registerUseCase(defineUseCase("test.JustReads", {
      kind: "query", action: "discovery.search", idempotency: "read_only", audit: "none",
      why: "x", run: async () => ({ candidates: [] }),
    }));
    await execute("test.JustReads", {}, { actor: anonymousActor({}), db, repositories: {} });
    assert.equal(db.ran("BEGIN"), false);
  });

  await t.test("authorization runs on the transaction's own connection", async () => {
    // The row the kernel decided against is the row the use case then mutates.
    let sawConn = null;
    const db = fakeDb({
      "FROM providers p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id":
        [{ id: "p-1", user_id: "u-1", is_approved: 1, is_available: 1, provider_source: "external", account_active: 1 }],
      "INSERT INTO audit_log": { affectedRows: 1 },
    });
    registry.registerUseCase(defineUseCase("test.SeesConn", {
      kind: "command", action: "provider.update_own",
      resource: (i, c) => c.actor.principalId,
      idempotency: "naturally_idempotent", audit: "required", why: "x",
      run: async (input, ctx) => {
        sawConn = ctx.tx;
        ctx.recordAudit({ resourceType: "provider_profile", resourceId: "p-1", after: { x: 1 } });
      },
    }));
    await execute("test.SeesConn", {}, { actor: customer(), db, repositories: {}, correlationId: "c-1" });
    assert.equal(sawConn.__isConn, true, "the use case is handed the transaction, not the pool");
  });

  await t.test("an unregistered name is a programming error, not a denial", async () => {
    await assert.rejects(
      () => execute("test.NeverRegistered", {}, { actor: customer(), db: fakeDb(), repositories: {} }),
      (err) => { assert.ok(err instanceof StartupError); assert.equal(isAppError(err), false); return true; }
    );
  });

  t.after(() => {
    // Leave the register exactly as the composition root built it — a test
    // that pollutes it would make the next file's failures inexplicable.
    restoreRegister();
    assert.deepEqual(registry.registeredUseCases(), REAL_USE_CASES);
  });
});
