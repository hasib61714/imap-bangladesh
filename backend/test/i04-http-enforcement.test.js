/**
 * I-04 — the migrated HTTP surfaces
 *
 * §21, §31, §32. `requireRole("admin")` is gone from every route file. These
 * tests exercise the endpoints through express, so they cover the thing the
 * unit tests cannot: that the route actually calls the kernel, and that what
 * the kernel decided is what the caller experiences.
 *
 * WHAT CHANGED, AND WHAT DELIBERATELY DID NOT
 * ───────────────────────────────────────────
 * Nobody gains or loses access. The Gate-1 administrator holds all six
 * platform roles, so every endpoint that answered them before answers them
 * now, and every endpoint that refused a customer still refuses.
 *
 * Three behaviours DID change, all in the same direction — an operation that
 * silently did nothing now says so:
 *
 *   PATCH /admin/users/<no such id>   200 {success:true} → 404
 *   PUT   /services/<no such id>      200 {success:true} → 404
 *   PATCH /admin/promos/<no such id>  200 {success:true} → 404
 *
 * Each of those used to run an UPDATE that matched zero rows and report
 * success, so an operator could believe they had suspended an account they
 * had not.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { makePool, installFakeDb, resetModules, serve, call, asUser } = require("./helpers/harness");

process.env.APP_ENV = process.env.APP_ENV || "test";
process.env.DATABASE_ENV = process.env.DATABASE_ENV || "test";

const ADMIN = { id: "admin-1", name: "Ops", role: "admin", is_active: 1 };
const CUSTOMER = { id: "cust-1", name: "Rina", role: "customer", is_active: 1 };
const PROVIDER = { id: "prov-user-1", name: "Karim", role: "provider", is_active: 1 };
const ROLELESS = { id: "ghost-1", name: "Ghost", role: null, is_active: 1 };

function stubAuth(user) {
  const authMw = require.resolve("../middleware/auth");
  require.cache[authMw] = {
    id: authMw, filename: authMw, loaded: true,
    exports: { authMiddleware: (req, _res, next) => { req.user = user; next(); } },
  };
}

async function boot(routePath, pool, user) {
  resetModules();
  installFakeDb(pool);
  stubAuth(user);
  // I-07: the KYC routes reach the domain through the use-case executor, and
  // a use case that is not registered is a StartupError rather than a
  // denial. server.js composes at boot; so does this.
  require("../src/composition/modules").composeModules();
  return serve(require(routePath), { middleware: [asUser(user)] });
}

const SUBJECT = { id: "subject-1", role: "customer", is_active: 1 };

const VERIFICATION_CASE = {
  id: "kyc-1", principal_id: SUBJECT.id, kind: "identity", state: "under_review",
  submitted_at: "2026-01-01", decided_by: null, decided_at: null,
  decision_reason: null, expires_at: null, legacy_kyc_id: "kyc-1",
  correlation_id: null, created_at: "2026-01-01", updated_at: "2026-01-01",
};

const adminPool = (extra = []) => makePool([
  ...extra,
  { match: "SELECT id, role, is_active FROM users WHERE id = ?", rows: [SUBJECT] },
  { match: "SELECT id, user_id, status, doc_type FROM kyc_docs", rows: [{ id: "kyc-1", user_id: SUBJECT.id, status: "pending", doc_type: "nid" }] },
  // I-07: the same case, in the model that now owns the decision. `kyc-1` is
  // both ids because migration 011 reuses the `kyc_docs` id as the case id,
  // which is what keeps an existing client's link working.
  //
  // `under_review` rather than `submitted`, deliberately: the route claims
  // the case before deciding it, and a case already claimed makes that first
  // step roll back instead of commit — so the assertions below see ONE
  // committing transaction rather than two.
  { match: "FROM verification_case", rows: [VERIFICATION_CASE] },
  { match: "UPDATE verification_case", rows: { affectedRows: 1 } },
  // The handler fetches the row again, with its images. That is not a
  // duplicated authorization query: the loader deliberately does NOT select
  // the image columns, because an authorization decision has no business
  // pulling four multi-megabyte blobs to find out whose document it is.
  { match: "SELECT k.*, u.name, u.email, u.phone", rows: [{ id: "kyc-1", user_id: SUBJECT.id, status: "pending", front_image: "data:..." }] },
  { match: "SELECT id, user_id, status, assigned_to FROM complaints", rows: [{ id: 7, user_id: "other-1", status: "open", assigned_to: null }] },
  { match: "SELECT id, code, is_active FROM promos", rows: [{ id: 3, code: "SAVE20", is_active: 1 }] },
  { match: "SELECT COUNT(*) AS cnt FROM system_settings", rows: [{ cnt: 1 }] },
  { match: "SELECT COUNT(*)", rows: [{ v: 0, total: 0 }] },
  { match: "SELECT ROUND(AVG", rows: [{ v: 0 }] },
  { match: "SELECT COALESCE(SUM", rows: [{ v: 0 }] },
  { match: "SELECT", rows: [] },
]);

// ════════════════════════════════════════════════════════════
test("§31 every migrated admin endpoint refuses a customer and answers an administrator", async (t) => {
  const surface = [
    ["GET", "/stats"],
    ["GET", "/providers"],
    ["GET", "/users"],
    ["GET", "/bookings"],
    ["GET", "/kyc"],
    ["GET", "/kyc/kyc-1"],
    ["GET", "/complaints"],
    ["GET", "/revenue"],
    ["GET", "/promos"],
    ["GET", "/settings"],
    ["GET", "/announcements"],
  ];

  await t.test("a customer is refused on all of them", async (tt) => {
    const srv = await boot("../routes/admin", adminPool(), CUSTOMER);
    tt.after(() => srv.close());
    for (const [method, path] of surface) {
      const res = await call(srv.url, method, path);
      assert.equal(res.status, 403, `${method} ${path} answered a customer with ${res.status}`);
      assert.deepEqual(Object.keys(res.body), ["error"], `${method} ${path} leaked detail`);
    }
  });

  await t.test("an actor with no recognisable role is refused on all of them", async (tt) => {
    // Fail closed: `users.role` is nullable, and a row with no role holds
    // nothing. It is not quietly treated as a customer, and never as an admin.
    const srv = await boot("../routes/admin", adminPool(), ROLELESS);
    tt.after(() => srv.close());
    for (const [method, path] of surface) {
      const res = await call(srv.url, method, path);
      // 403, not 401: they ARE authenticated. Answering 401 would send a
      // client that already holds a valid token back to sign in, forever.
      assert.equal(res.status, 403, `${method} ${path} answered a role-less actor with ${res.status}`);
    }
  });

  await t.test("the administrator is answered on all of them", async (tt) => {
    const srv = await boot("../routes/admin", adminPool(), ADMIN);
    tt.after(() => srv.close());
    for (const [method, path] of surface) {
      const res = await call(srv.url, method, path);
      assert.notEqual(res.status, 403, `${method} ${path} refused the administrator`);
      assert.notEqual(res.status, 401, `${method} ${path} refused the administrator`);
    }
  });
});

// ════════════════════════════════════════════════════════════
test("§29 PATCH /admin/users/:id — one endpoint, two permissions", async (t) => {
  await t.test("a customer cannot suspend or promote anyone", async (tt) => {
    const pool = adminPool();
    const srv = await boot("../routes/admin", pool, CUSTOMER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "PATCH", "/users/subject-1", { role: "admin", is_active: 0 });
    assert.equal(res.status, 403);
    assert.equal(pool.ran("UPDATE users SET is_active"), false, "no write reached the database");
  });

  // NEGATIVE CONTROL: drop the `wasAuthorized` guard in the handler and the
  // role is applied even when its authorization was skipped.
  await t.test("a role change is applied", async (tt) => {
    const pool = adminPool([{ match: "UPDATE users SET is_active", rows: { affectedRows: 1 } }]);
    const srv = await boot("../routes/admin", pool, ADMIN);
    tt.after(() => srv.close());
    const res = await call(srv.url, "PATCH", "/users/subject-1", { role: "provider" });
    assert.equal(res.status, 200);
    const [write] = pool.all("UPDATE users SET is_active");
    assert.equal(write.params[1], "provider");
  });

  await t.test("the privilege change and its audit record are one transaction (§27)", async (tt) => {
    const pool = adminPool([{ match: "UPDATE users SET is_active", rows: { affectedRows: 1 } }]);
    const srv = await boot("../routes/admin", pool, ADMIN);
    tt.after(() => srv.close());
    await call(srv.url, "PATCH", "/users/subject-1", { role: "admin", reason: "second operator" });

    const order = pool.queries.map((q) => q.sql.split(" ").slice(0, 3).join(" "));
    const begin = order.indexOf("BEGIN");
    const update = order.findIndex((s) => s.startsWith("UPDATE users"));
    const audit = order.findIndex((s) => s.startsWith("INSERT INTO audit_log"));
    const commit = order.indexOf("COMMIT");
    assert.ok(begin >= 0 && commit > begin, "the write is transactional");
    assert.ok(update > begin && update < commit, "the update is inside it");
    assert.ok(audit > begin && audit < commit, "so is the record — it must not be losable separately");
  });

  await t.test("the audit record carries the before and after roles, and nothing else", async (tt) => {
    const pool = adminPool([{ match: "UPDATE users SET is_active", rows: { affectedRows: 1 } }]);
    const srv = await boot("../routes/admin", pool, ADMIN);
    tt.after(() => srv.close());
    await call(srv.url, "PATCH", "/users/subject-1", { role: "admin", reason: "second operator" });

    const [audit] = pool.all("INSERT INTO audit_log");
    const before = JSON.parse(audit.params[13]);
    const after = JSON.parse(audit.params[14]);
    assert.deepEqual(before, { role: "customer" });
    assert.deepEqual(after, { role: "admin" });
    assert.equal(audit.params[15], "second operator", "the operator's reason is recorded");
    assert.equal(audit.params[8], "membership.grant");
  });

  // The silent no-op, fixed.
  await t.test("a target that does not exist is a 404, not a reported success", async (tt) => {
    const pool = makePool([
      { match: "SELECT id, role, is_active FROM users WHERE id = ?", rows: [] },
    ]);
    const srv = await boot("../routes/admin", pool, ADMIN);
    tt.after(() => srv.close());
    const res = await call(srv.url, "PATCH", "/users/no-such-user", { is_active: 0 });
    assert.equal(res.status, 404);
    assert.equal(pool.ran("UPDATE users SET is_active"), false);
  });

  await t.test("an operator still cannot deactivate their own account, and is told why", async (tt) => {
    const pool = adminPool([
      { match: "SELECT id, role, is_active FROM users WHERE id = ?", rows: [{ id: ADMIN.id, role: "admin", is_active: 1 }] },
    ]);
    const srv = await boot("../routes/admin", pool, ADMIN);
    tt.after(() => srv.close());
    const res = await call(srv.url, "PATCH", `/users/${ADMIN.id}`, { is_active: 0 });
    assert.equal(res.status, 409, "a state conflict, per API-ARCHITECTURE §4.1");
    assert.match(res.body.error, /your own account/i);
    assert.equal(pool.ran("UPDATE users SET is_active"), false);
  });

  await t.test("is_active = -1 is still refused (P1-11)", async (tt) => {
    const pool = adminPool();
    const srv = await boot("../routes/admin", pool, ADMIN);
    tt.after(() => srv.close());
    const res = await call(srv.url, "PATCH", "/users/subject-1", { is_active: -1 });
    assert.equal(res.status, 400);
    assert.equal(pool.ran("UPDATE users SET is_active"), false);
  });

  await t.test("changing your own role without a reason is refused", async (tt) => {
    const pool = adminPool([
      { match: "SELECT id, role, is_active FROM users WHERE id = ?", rows: [{ id: ADMIN.id, role: "admin", is_active: 1 }] },
    ]);
    const srv = await boot("../routes/admin", pool, ADMIN);
    tt.after(() => srv.close());
    const bare = await call(srv.url, "PATCH", `/users/${ADMIN.id}`, { role: "customer" });
    assert.equal(bare.status, 422);
    assert.equal(pool.ran("UPDATE users SET is_active"), false);
  });

  await t.test("changing your own role WITH a reason is permitted and flagged as an SOD bypass", async (tt) => {
    const pool = adminPool([
      { match: "SELECT id, role, is_active FROM users WHERE id = ?", rows: [{ id: ADMIN.id, role: "admin", is_active: 1 }] },
      { match: "UPDATE users SET is_active", rows: { affectedRows: 1 } },
    ]);
    const srv = await boot("../routes/admin", pool, ADMIN);
    tt.after(() => srv.close());
    const res = await call(srv.url, "PATCH", `/users/${ADMIN.id}`, { role: "customer", reason: "stepping down" });
    assert.equal(res.status, 200);
    const [audit] = pool.all("INSERT INTO audit_log");
    assert.equal(audit.params[18], 1, "sod_bypass must be 1 — the exception is counted, not hidden");
  });
});

// ════════════════════════════════════════════════════════════
test("§31 verification decisions", async (t) => {
  await t.test("a customer cannot decide a KYC case through either route", async (tt) => {
    for (const route of ["../routes/admin", "../routes/kyc"]) {
      const pool = adminPool();
      const srv = await boot(route, pool, CUSTOMER);
      const path = route.endsWith("admin") ? "/kyc/kyc-1" : "/kyc-1";
      const res = await call(srv.url, "PATCH", path, { status: "verified" });
      await srv.close();
      assert.equal(res.status, 403, `${route} answered ${res.status}`);
      assert.equal(pool.ran("UPDATE kyc_docs"), false, `${route} wrote anyway`);
    }
  });

  await t.test("the decision, the derived user status and the record commit together", async (tt) => {
    const pool = adminPool([
      { match: "UPDATE kyc_docs", rows: { affectedRows: 1 } },
      { match: "UPDATE users SET kyc_status", rows: { affectedRows: 1 } },
    ]);
    const srv = await boot("../routes/admin", pool, ADMIN);
    tt.after(() => srv.close());
    const res = await call(srv.url, "PATCH", "/kyc/kyc-1", { status: "verified" });
    assert.equal(res.status, 200);

    const order = pool.queries.map((q) => q.sql.split(" ").slice(0, 3).join(" "));
    const begin = order.indexOf("BEGIN");
    const commit = order.indexOf("COMMIT");
    for (const needle of ["UPDATE kyc_docs SET", "UPDATE users SET", "INSERT INTO audit_log"]) {
      const at = order.findIndex((s) => s.startsWith(needle.split(" ").slice(0, 3).join(" ")));
      assert.ok(at > begin && at < commit, `${needle} is outside the transaction`);
    }
  });

  await t.test("reading one identity document writes a record even though it changes nothing", async (tt) => {
    const pool = adminPool();
    const srv = await boot("../routes/admin", pool, ADMIN);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", "/kyc/kyc-1");
    assert.equal(res.status, 200);
    await new Promise((r) => setImmediate(r));
    const rows = pool.all("INSERT INTO audit_log");
    assert.equal(rows.length, 1, "V-07: every Sealed read is audited");
    assert.equal(rows[0].params[8], "verification.read_document");
    assert.equal(rows[0].params[12], "permitted");
  });
});

// ════════════════════════════════════════════════════════════
test("§31 catalogue and promotions", async (t) => {
  await t.test("a customer cannot edit the catalogue", async (tt) => {
    const pool = makePool([{ match: "SELECT id, slug, is_active FROM categories", rows: [{ id: 1, slug: "plumbing", is_active: 1 }] }]);
    const srv = await boot("../routes/services", pool, CUSTOMER);
    tt.after(() => srv.close());
    assert.equal((await call(srv.url, "POST", "/", { slug: "x", name_bn: "x", name_en: "x" })).status, 403);
    assert.equal((await call(srv.url, "PUT", "/1", { name_en: "x" })).status, 403);
    assert.equal((await call(srv.url, "DELETE", "/1")).status, 403);
    assert.equal(pool.ran("UPDATE categories"), false);
    assert.equal(pool.ran("INSERT INTO categories"), false);
  });

  await t.test("an administrator may, and the service must exist", async (tt) => {
    const present = makePool([
      { match: "SELECT id, slug, is_active FROM categories", rows: [{ id: 1, slug: "plumbing", is_active: 1 }] },
      { match: "UPDATE categories", rows: { affectedRows: 1 } },
    ]);
    let srv = await boot("../routes/services", present, ADMIN);
    assert.equal((await call(srv.url, "PUT", "/1", { name_en: "Plumbing" })).status, 200);
    await srv.close();

    // The silent no-op, fixed.
    const missing = makePool([{ match: "SELECT id, slug, is_active FROM categories", rows: [] }]);
    srv = await boot("../routes/services", missing, ADMIN);
    const res = await call(srv.url, "PUT", "/99999", { name_en: "Nothing" });
    await srv.close();
    assert.equal(res.status, 404, "an update that matches no row is not a success");
    assert.equal(missing.ran("UPDATE categories"), false);
  });

  await t.test("a promotion that does not exist cannot be deleted successfully", async (tt) => {
    const pool = makePool([{ match: "SELECT id, code, is_active FROM promos", rows: [] }]);
    const srv = await boot("../routes/admin", pool, ADMIN);
    tt.after(() => srv.close());
    const res = await call(srv.url, "DELETE", "/promos/99999");
    assert.equal(res.status, 404);
    assert.equal(pool.ran("DELETE FROM promos"), false);
  });
});

// ════════════════════════════════════════════════════════════
test("§30 payments — a role no longer travels inside a WHERE clause", async (t) => {
  const paymentRow = { id: "pay-1", user_id: CUSTOMER.id, booking_id: "b-1", status: "success" };

  await t.test("the payer reads their own payment", async (tt) => {
    const pool = makePool([
      { match: "SELECT id, user_id, booking_id, status FROM payments", rows: [paymentRow] },
      { match: "SELECT p.*, b.service_name_bn", rows: [paymentRow] },
    ]);
    const srv = await boot("../routes/payments", pool, CUSTOMER);
    tt.after(() => srv.close());
    assert.equal((await call(srv.url, "GET", "/pay-1")).status, 200);
  });

  await t.test("someone else's payment is a 404, indistinguishable from one that does not exist", async (tt) => {
    const other = makePool([
      { match: "SELECT id, user_id, booking_id, status FROM payments", rows: [paymentRow] },
      { match: "SELECT p.*, b.service_name_bn", rows: [paymentRow] },
    ]);
    let srv = await boot("../routes/payments", other, PROVIDER);
    const notMine = await call(srv.url, "GET", "/pay-1");
    await srv.close();

    const absent = makePool([{ match: "SELECT id, user_id, booking_id, status FROM payments", rows: [] }]);
    srv = await boot("../routes/payments", absent, PROVIDER);
    const notThere = await call(srv.url, "GET", "/pay-999");
    await srv.close();

    assert.deepEqual(
      { status: notMine.status, body: notMine.body },
      { status: notThere.status, body: notThere.body },
      "the two must be byte-identical or the API enumerates payment ids"
    );
    assert.equal(notMine.status, 404);
    assert.equal(other.ran("SELECT p.*, b.service_name_bn"), false, "the row was never fetched for an unauthorized caller");
  });

  await t.test("the detail query no longer carries a role comparison", async (tt) => {
    const pool = makePool([
      { match: "SELECT id, user_id, booking_id, status FROM payments", rows: [paymentRow] },
      { match: "SELECT p.*, b.service_name_bn", rows: [paymentRow] },
    ]);
    const srv = await boot("../routes/payments", pool, CUSTOMER);
    tt.after(() => srv.close());
    await call(srv.url, "GET", "/pay-1");
    for (const q of pool.all("SELECT p.*, b.service_name_bn")) {
      assert.equal(/'admin'/.test(q.sql), false, "an authorization rule inside SQL is one no reviewer looks for");
    }
  });

  await t.test("a customer cannot read every payment on the platform", async (tt) => {
    const pool = makePool([{ match: "SELECT", rows: [] }]);
    const srv = await boot("../routes/payments", pool, CUSTOMER);
    tt.after(() => srv.close());
    assert.equal((await call(srv.url, "GET", "/admin/all")).status, 403);
  });
});

// ════════════════════════════════════════════════════════════
test("§31 the emergency queue", async (t) => {
  await t.test("a customer cannot list or close alerts", async (tt) => {
    const pool = makePool([
      { match: "SELECT id, user_id, status FROM sos_alerts", rows: [{ id: 4, user_id: "someone", status: "open" }] },
      { match: "SELECT", rows: [] },
    ]);
    const srv = await boot("../routes/sos", pool, CUSTOMER);
    tt.after(() => srv.close());
    assert.equal((await call(srv.url, "GET", "/")).status, 403);
    assert.equal((await call(srv.url, "PATCH", "/4", { status: "dismissed" })).status, 403);
    assert.equal(pool.ran("UPDATE sos_alerts"), false);
  });

  await t.test("closing an alert that does not exist is a 404", async (tt) => {
    const pool = makePool([{ match: "SELECT id, user_id, status FROM sos_alerts", rows: [] }]);
    const srv = await boot("../routes/sos", pool, ADMIN);
    tt.after(() => srv.close());
    assert.equal((await call(srv.url, "PATCH", "/999", { status: "resolved" })).status, 404);
    assert.equal(pool.ran("UPDATE sos_alerts"), false);
  });
});
