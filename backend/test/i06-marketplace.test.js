/**
 * I-06 — the marketplace module
 *
 * The domain invariants, and the endpoints that now reach them through a use
 * case. §25's "provider source" and "need" blocks are here.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { makePool, installFakeDb, resetModules, serve, call, asUser } = require("./helpers/harness");

process.env.APP_ENV = process.env.APP_ENV || "test";
process.env.DATABASE_ENV = process.env.DATABASE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const source = require("../src/modules/marketplace/domain/providerSource");
const { describeNeed, needOutcome } = require("../src/modules/marketplace/domain/need");
const { describeArea, looksBangladeshi } = require("../src/modules/marketplace/domain/serviceArea");
const { toCandidate, isOfferable } = require("../src/modules/marketplace/domain/fulfillmentCandidate");
const profile = require("../src/modules/marketplace/domain/providerProfile");

const OWNER = { id: "u-prov", name: "Karim", role: "customer", is_active: 1 };
const STRANGER = { id: "u-other", name: "Rina", role: "customer", is_active: 1 };
const ADMIN = { id: "u-admin", name: "Ops", role: "admin", is_active: 1 };

const providerRow = (over = {}) => ({
  id: "p-1", user_id: OWNER.id, provider_source: "external",
  service_type_bn: "ইলেকট্রিশিয়ান", service_type_en: "Electrician",
  area_bn: "মিরপুর", area_en: "Mirpur", hourly_rate: "450.00",
  rating: "4.5", total_jobs: 12, is_available: 1, is_approved: 1,
  nid_verified: 1, latitude: null, longitude: null, category_id: 3,
  name: "Karim", avatar: null, account_active: 1, kyc_status: "verified",
  category_slug: "electrician", review_count: 4,
  bio_bn: null, bio_en: "Ten years", experience_yrs: 10, trust_score: 70,
  created_at: "2026-01-01", phone: "01711111111", email: "k@x.test",
  ...over,
});

/** The loader shape the authorization kernel reads. */
const loaderRow = (over = {}) => ({
  id: "p-1", user_id: OWNER.id, is_approved: 1, is_available: 1,
  provider_source: "external", account_active: 1, ...over,
});

function stubAuth(user) {
  const authMw = require.resolve("../middleware/auth");
  require.cache[authMw] = {
    id: authMw, filename: authMw, loaded: true,
    exports: { authMiddleware: (req, _res, next) => { req.user = user; next(); } },
  };
}

async function boot(pool, user) {
  resetModules();
  installFakeDb(pool);
  if (user) stubAuth(user);
  require("../src/composition/modules").composeModules();
  const router = require("../src/modules/marketplace/transport/routes");
  const { errorBoundary } = require("../src/transport/http/errorBoundary");
  const express = require("express");
  const http = require("http");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.requestId = "test-corr"; next(); });
  if (user) app.use(asUser(user));
  app.use("/", router);
  app.use(errorBoundary);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

// ════════════════════════════════════════════════════════════
test("§16, §20 provider source", async (t) => {
  await t.test("there are exactly two, and neither is a default for the unknown", () => {
    assert.deepEqual(source.PROVIDER_SOURCES, ["internal", "external"]);
    for (const bad of ["INTERNAL", "employee", "", null, undefined, 0]) {
      assert.equal(source.isProviderSource(bad), false, `${JSON.stringify(bad)} was accepted`);
      assert.throws(() => source.assertProviderSource(bad, "test"), /unknown provider source/);
    }
  });

  // NEGATIVE CONTROL: make assertProviderSource fall back to EXTERNAL and this
  // passes — an employee would then be silently put under commission rules.
  await t.test("an unreadable source fails closed rather than defaulting", () => {
    assert.throws(() => source.assertProviderSource(undefined, "provider p-9"), /provider p-9/);
  });

  await t.test("commission eligibility follows the source, and has no rate", () => {
    assert.equal(source.isCommissionEligible("external"), true);
    assert.equal(source.isCommissionEligible("internal"), false,
      "internal work is compensation, not a transaction between two parties");
    // D-009 is unset; nothing here returns a number.
    assert.equal(typeof source.isCommissionEligible("external"), "boolean");
  });

  await t.test("both sources produce the same candidate shape (§16)", () => {
    const external = toCandidate({ ...candidateInput(), providerSource: "external" });
    const internal = toCandidate({ ...candidateInput(), providerSource: "internal" });
    assert.deepEqual(Object.keys(external).sort(), Object.keys(internal).sort(),
      "two shapes would become two booking architectures");
    assert.equal(external.pricing.commissionEligible, true);
    assert.equal(internal.pricing.commissionEligible, false);
    assert.equal(isOfferable(external), isOfferable(internal),
      "whether a candidate may be offered does not depend on who employs them");
  });
});

function candidateInput(over = {}) {
  return {
    id: "p-1", userId: "u-1", providerSource: "external",
    serviceTypeEn: "Electrician", categoryId: 3, categorySlug: "electrician",
    isApproved: true, nidVerified: true, kycStatus: "verified",
    isAvailable: true, accountActive: true,
    area: describeArea({ label: "Mirpur" }),
    rating: "4.5", totalJobs: 12, reviewCount: 4, hourlyRate: 450,
    displayName: "Karim", ...over,
  };
}

// ════════════════════════════════════════════════════════════
test("D-005 a candidate is offerable only once the platform has approved them", async (t) => {
  // NEGATIVE CONTROL: drop `isApproved` from isOfferable and this passes —
  // which is P1-7, where an applicant appeared in the directory immediately.
  await t.test("an unapproved provider is not offerable", () => {
    assert.equal(isOfferable(toCandidate(candidateInput({ isApproved: false }))), false);
  });
  await t.test("nor is one who has switched themselves off, or whose account is inactive", () => {
    assert.equal(isOfferable(toCandidate(candidateInput({ isAvailable: false }))), false);
    assert.equal(isOfferable(toCandidate(candidateInput({ accountActive: false }))), false);
  });
  await t.test("an approved, available, active provider is", () => {
    assert.equal(isOfferable(toCandidate(candidateInput())), true);
  });
});

// ════════════════════════════════════════════════════════════
test("§17 a need exists as a thing", async (t) => {
  await t.test("it carries what the customer expressed, verbatim", () => {
    const n = describeNeed({ text: "  ac repair urgent ", categorySlug: "electrician", maxPrice: 800 });
    assert.equal(n.text, "ac repair urgent", "trimmed, not interpreted");
    assert.equal(n.categorySlug, "electrician");
    assert.equal(n.maxPrice, 800);
    assert.equal(n.isSpecific, true);
  });

  await t.test("an empty need is a request for the directory, not an error", () => {
    const n = describeNeed({});
    assert.equal(n.isSpecific, false);
    assert.equal(n.text, null);
  });

  await t.test("a need is bounded — free text is not a payload", () => {
    assert.throws(() => describeNeed({ text: "x".repeat(201) }), /too long/);
  });

  await t.test("the outcome shape can answer whether a need went unmet", () => {
    const n = describeNeed({ text: "plumber", area: describeArea({ label: "Khulna" }) });
    const unmet = needOutcome(n, { candidateCount: 0 });
    assert.equal(unmet.met, false);
    assert.equal(unmet.areaLabel, "Khulna");
    assert.equal(needOutcome(n, { candidateCount: 3, chosenProviderId: "p-1" }).met, true);
  });
});

// ════════════════════════════════════════════════════════════
test("§18 the location boundary", async (t) => {
  await t.test("a label is normalised and bounded", () => {
    assert.equal(describeArea({ label: "  Mirpur   10 " }).label, "Mirpur 10");
    assert.throws(() => describeArea({ label: "x".repeat(201) }), /too long/);
  });

  await t.test("nothing is locatable yet, and the shape says so", () => {
    assert.equal(describeArea({ label: "Mirpur" }).isLocatable, false);
    assert.equal(describeArea({ label: "Mirpur", latitude: 23.8, longitude: 90.4 }).isLocatable, true);
  });

  await t.test("half a coordinate is a broken one, not half a location", () => {
    assert.throws(() => describeArea({ latitude: 23.8 }), /both latitude and longitude/);
    assert.throws(() => describeArea({ longitude: 90.4 }), /both latitude and longitude/);
  });

  await t.test("an impossible coordinate is refused rather than stored", () => {
    assert.throws(() => describeArea({ latitude: 200, longitude: 90 }), /outside the possible range/);
    assert.throws(() => describeArea({ latitude: "north", longitude: "east" }), /must be numbers/);
  });

  await t.test("Bangladesh is advisory, never a refusal", () => {
    assert.equal(looksBangladeshi(describeArea({ latitude: 23.8, longitude: 90.4 })), true);
    assert.equal(looksBangladeshi(describeArea({ latitude: 48.85, longitude: 2.35 })), false);
    assert.doesNotThrow(() => describeArea({ latitude: 48.85, longitude: 2.35 }));
  });
});

// ════════════════════════════════════════════════════════════
test("§10 the profile rules are the domain's, not a route's", async (t) => {
  await t.test("every text field is bounded, on both paths", () => {
    for (const [field, limit] of Object.entries(profile.LIMITS)) {
      // `nid_number` is identity evidence collected with an application, not
      // a profile field, so it is bounded by the same helper on its own path.
      if (field === "nid_number") {
        assert.throws(() => profile.boundedText("x".repeat(limit + 1), field), /too long/, field);
        continue;
      }
      assert.throws(() => profile.editableProfile({ [field]: "x".repeat(limit + 1) }), /too long/, field);
    }
  });

  // NEGATIVE CONTROL: return the raw input from editableProfile and this
  // passes — which is mass assignment.
  await t.test("standing is not settable through a profile update", () => {
    const p = profile.editableProfile({
      service_type_en: "Electrician",
      is_approved: 1, rating: 5, total_jobs: 999, trust_score: 100,
      nid_verified: 1, provider_source: "internal", user_id: "somebody-else",
    });
    for (const forbidden of ["is_approved", "isApproved", "rating", "totalJobs", "trustScore",
                             "nidVerified", "providerSource", "userId"]) {
      assert.equal(forbidden in p, false, `${forbidden} reached the writable shape`);
    }
    assert.deepEqual(Object.keys(p).sort(), [
      "areaBn", "areaEn", "bioBn", "bioEn", "experienceYears",
      "hourlyRate", "serviceTypeBn", "serviceTypeEn",
    ]);
  });

  await t.test("the rate is money, and money is validated (P0-4)", () => {
    assert.equal(profile.offeredRate(450), 450);
    assert.equal(profile.offeredRate(0), null, "zero and absent are the same: no rate set");
    assert.equal(profile.offeredRate(undefined), null);
    for (const bad of [-1, "abc", Infinity, NaN, 1e999, 100001, [], {}]) {
      assert.throws(() => profile.offeredRate(bad), /hourly_rate|amount|invalid/i, String(bad));
    }
  });

  await t.test("availability is strictly 0 or 1 (P1-11)", () => {
    assert.equal(profile.availabilityFlag(1), 1);
    assert.equal(profile.availabilityFlag("0"), 0);
    assert.equal(profile.availabilityFlag(true), 1);
    for (const bad of [-1, 2, "yes", null, undefined, {}]) {
      assert.throws(() => profile.availabilityFlag(bad), /must be 0 or 1/, String(bad));
    }
  });

  await t.test("experience is a whole number of plausible years", () => {
    assert.equal(profile.editableProfile({ experience_yrs: 10 }).experienceYears, 10);
    assert.throws(() => profile.editableProfile({ experience_yrs: 10.5 }), /whole number/);
    assert.throws(() => profile.editableProfile({ experience_yrs: 200 }), /whole number/);
  });
});

// ════════════════════════════════════════════════════════════
test("the migrated endpoints", async (t) => {
  await t.test("GET / returns candidates carrying their source", async (tt) => {
    const pool = makePool([
      { match: "SELECT p.id, p.user_id, p.provider_source", rows: [providerRow()] },
      { match: "SELECT COUNT(*) AS total FROM providers", rows: [{ total: 1 }] },
    ]);
    const srv = await boot(pool, null);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", "/?q=electrician");
    assert.equal(res.status, 200);
    assert.equal(res.body.providers.length, 1);
    assert.equal(res.body.providers[0].provider_source, "external");
    assert.equal(res.body.providers[0].name, "Karim");
    assert.equal(res.body.total, 1);
  });

  // NEGATIVE CONTROL: change the discovery scope to `{ visibility: "all" }`
  // for everyone and this passes — P1-7 again.
  await t.test("the public scope filters on approval, and the platform's does not", async (tt) => {
    const pool = makePool([
      { match: "SELECT p.id, p.user_id, p.provider_source", rows: [] },
      { match: "SELECT COUNT(*) AS total FROM providers", rows: [{ total: 0 }] },
    ]);
    const srv = await boot(pool, null);
    tt.after(() => srv.close());
    await call(srv.url, "GET", "/?q=x");
    const listed = pool.all("SELECT p.id, p.user_id, p.provider_source")[0].sql;
    assert.match(listed, /p\.is_approved = 1/, "an anonymous caller sees approved providers only");
    assert.match(listed, /u\.is_active = 1/);
    assert.match(listed, /p\.is_available = 1/);
  });

  await t.test("an unapproved profile is not publicly readable", async (tt) => {
    const pool = makePool([
      { match: "FROM providers p LEFT JOIN users u ON u.id = p.user_id WHERE p.id", rows: [loaderRow({ is_approved: 0 })] },
      { match: "SELECT p.id, p.user_id, p.provider_source", rows: [providerRow({ is_approved: 0 })] },
    ]);
    const srv = await boot(pool, null);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", "/p-1");
    assert.equal(res.status, 404, "D-005: listing is trust-granted, and a profile page is listing");
  });

  await t.test("an approved profile is", async (tt) => {
    const pool = makePool([
      { match: "FROM providers p LEFT JOIN users u ON u.id = p.user_id WHERE p.id", rows: [loaderRow()] },
      { match: "SELECT p.id, p.user_id, p.provider_source", rows: [providerRow()] },
      { match: "FROM provider_schedule", rows: [] },
      { match: "FROM reviews r", rows: [] },
    ]);
    const srv = await boot(pool, null);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", "/p-1");
    assert.equal(res.status, 200);
    assert.equal(res.body.id, "p-1");
    assert.deepEqual(res.body.schedule, []);
  });

  await t.test("a stranger cannot read someone else's own-profile surface", async (tt) => {
    const pool = makePool([
      { match: "FROM providers p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id", rows: [] },
    ]);
    const srv = await boot(pool, STRANGER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", "/me");
    assert.equal(res.status, 404);
    assert.equal(pool.ran("phone"), false, "no contact detail was fetched for a caller with no profile");
  });

  await t.test("the owner reads their own, with the contact details the public shape omits", async (tt) => {
    const pool = makePool([
      { match: "FROM providers p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id", rows: [loaderRow()] },
      { match: "SELECT p.id, p.user_id, p.provider_source", rows: [providerRow()] },
    ]);
    const srv = await boot(pool, OWNER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", "/me");
    assert.equal(res.status, 200);
    assert.equal(res.body.phone, "01711111111");
  });

  await t.test("a profile update is transactional and audited (§12, §13)", async (tt) => {
    const pool = makePool([
      { match: "FROM providers p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id", rows: [loaderRow()] },
      { match: "SELECT p.id, p.user_id, p.provider_source", rows: [providerRow()] },
      { match: "UPDATE providers SET", rows: { affectedRows: 1 } },
      { match: "INSERT INTO audit_log", rows: { affectedRows: 1 } },
    ]);
    const srv = await boot(pool, OWNER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "PUT", "/me", { hourly_rate: 500 });
    assert.equal(res.status, 200);

    const order = pool.queries.map((q) => q.sql.split(" ").slice(0, 3).join(" "));
    const begin = order.indexOf("BEGIN");
    const update = order.findIndex((s) => s.startsWith("UPDATE providers"));
    const audit = order.findIndex((s) => s.startsWith("INSERT INTO audit_log"));
    const commit = order.indexOf("COMMIT");
    assert.ok(begin >= 0 && commit > begin);
    assert.ok(update > begin && update < commit);
    assert.ok(audit > begin && audit < commit, "the record commits with the change or not at all");
  });

  await t.test("an invalid rate is refused before any write, with the field named", async (tt) => {
    const pool = makePool([
      { match: "FROM providers p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id", rows: [loaderRow()] },
    ]);
    const srv = await boot(pool, OWNER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "PUT", "/me", { hourly_rate: -5 });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "VALIDATION_FAILED");
    assert.equal(res.body.fields[0].field, "hourly_rate");
    assert.equal(res.body.correlation_id, "test-corr");
    assert.equal(pool.ran("UPDATE providers"), false);
    assert.equal(pool.ran("COMMIT"), false);
  });

  await t.test("an application is created, audited, and never self-approves", async (tt) => {
    const pool = makePool([
      { match: "SELECT id FROM providers WHERE user_id", rows: [] },
      { match: "INSERT INTO providers", rows: { affectedRows: 1 } },
      { match: "INSERT INTO audit_log", rows: { affectedRows: 1 } },
    ]);
    const srv = await boot(pool, STRANGER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "POST", "/apply", {
      service_type_en: "Plumber", area_en: "Uttara", hourly_rate: 400, nid_number: "1234567890",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, "submitted_for_review");

    const insert = pool.all("INSERT INTO providers")[0];
    assert.equal(/is_approved/.test(insert.sql), false, "an application cannot list itself (D-005, P1-7)");
    assert.equal(/provider_source/.test(insert.sql), false, "the column's default says what an application is");

    // The NID travels with the application; its VALUE is not audited.
    const audit = pool.all("INSERT INTO audit_log")[0];
    assert.equal(JSON.stringify(audit.params).includes("1234567890"), false,
      "identity evidence is recorded as metadata, not as a value");
  });

  await t.test("availability accepts 0 and 1 and refuses -1 (P1-11)", async (tt) => {
    const pool = makePool([
      { match: "FROM providers p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id", rows: [loaderRow()] },
      { match: "UPDATE providers SET is_available", rows: { affectedRows: 1 } },
    ]);
    const srv = await boot(pool, OWNER);
    tt.after(() => srv.close());
    assert.equal((await call(srv.url, "PATCH", "/me/availability", { is_available: 0 })).status, 200);
    const bad = await call(srv.url, "PATCH", "/me/availability", { is_available: -1 });
    assert.equal(bad.status, 400);
  });

  await t.test("the earnings summary reports nothing it did not measure", async (tt) => {
    const pool = makePool([
      { match: "FROM providers p LEFT JOIN users u ON u.id = p.user_id WHERE p.user_id", rows: [loaderRow()] },
      { match: "FROM bookings", rows: [{ month: "Jan", total: "1200.00" }] },
      { match: "FROM reviews r", rows: [] },
      { match: "SELECT total_jobs, rating FROM providers", rows: [{ total_jobs: 12, rating: "4.5" }] },
    ]);
    const srv = await boot(pool, OWNER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", "/me/analytics");
    assert.equal(res.status, 200);
    assert.equal("views" in res.body.stats, false,
      "`views` was total_jobs * 4 — an invented measurement shown to providers as one");
    assert.deepEqual(Object.keys(res.body.stats).sort(), ["jobs", "rating", "thisMonth"]);
  });
});
