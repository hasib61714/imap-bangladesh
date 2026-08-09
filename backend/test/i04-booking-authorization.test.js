/**
 * I-04 — booking participation, through the kernel
 *
 * P0-7 was "any authenticated user could join any booking's room". Phase 0.5
 * contained it with `utils/bookingAccess.js`, which was correct and was the
 * THIRD authorization implementation in the codebase. This file checks that
 * the containment survived being replaced by the kernel, and that the two
 * transports cannot drift apart, because they are now the same decision.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { makePool, installFakeDb, resetModules, serve, call, asUser } = require("./helpers/harness");

process.env.APP_ENV = process.env.APP_ENV || "test";
process.env.DATABASE_ENV = process.env.DATABASE_ENV || "test";

const CUSTOMER = { id: "cust-1", name: "Rina", role: "customer", is_active: 1 };
const PROVIDER = { id: "provuser-1", name: "Karim", role: "provider", is_active: 1 };
const STRANGER = { id: "cust-9", name: "Nobody", role: "customer", is_active: 1 };
const ADMIN = { id: "admin-1", name: "Ops", role: "admin", is_active: 1 };
const BOOKING = "bk-1";

const bookingRow = (over = {}) => ({
  id: BOOKING, customer_id: CUSTOMER.id, provider_id: "prov-1",
  provider_user_id: PROVIDER.id, status: "active", payment_status: "paid", ...over,
});

const detailRow = (over = {}) => ({
  id: BOOKING, customer_id: CUSTOMER.id, provider_id: "prov-1",
  status: "active", otp_code: "482913", amount: 400, ...over,
});

function bookingPool(over = {}, extra = []) {
  return makePool([
    ...extra,
    { match: "FROM bookings b LEFT JOIN providers p ON p.id = b.provider_id WHERE b.id = ?", rows: over.absent ? [] : [bookingRow(over)] },
    { match: "SELECT b.*, u.name AS provider_name", rows: [detailRow(over)] },
    { match: "SELECT * FROM chat_messages", rows: [] },
    { match: "SELECT", rows: [] },
  ]);
}

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
  return serve(require(routePath), { middleware: [asUser(user)] });
}

// ════════════════════════════════════════════════════════════
test("§30 GET /bookings/:id", async (t) => {
  await t.test("both participants may read it", async (tt) => {
    for (const user of [CUSTOMER, PROVIDER]) {
      const srv = await boot("../routes/bookings", bookingPool(), user);
      const res = await call(srv.url, "GET", `/${BOOKING}`);
      await srv.close();
      assert.equal(res.status, 200, `${user.role} was refused`);
    }
  });

  // NEGATIVE CONTROL: make bookingParticipantOrPlatform return `true` and
  // this fails. It is P0-7 expressed against the kernel.
  await t.test("an unrelated authenticated user may not", async (tt) => {
    const pool = bookingPool();
    const srv = await boot("../routes/bookings", pool, STRANGER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", `/${BOOKING}`);
    assert.equal(res.status, 403);
    assert.equal(pool.ran("SELECT b.*, u.name AS provider_name"), false,
      "the booking was never fetched for a caller who may not see it");
  });

  await t.test("a booking that does not exist is a 404", async (tt) => {
    const srv = await boot("../routes/bookings", bookingPool({ absent: true }), STRANGER);
    tt.after(() => srv.close());
    assert.equal((await call(srv.url, "GET", "/no-such-booking")).status, 404);
  });

  // NEGATIVE CONTROL: point BOOKING_READ_COMPLETION_OTP at
  // bookingParticipantOrPlatform and the provider sees the code.
  await t.test("the provider reads the booking but not the completion OTP", async (tt) => {
    let srv = await boot("../routes/bookings", bookingPool(), PROVIDER);
    const asProvider = await call(srv.url, "GET", `/${BOOKING}`);
    await srv.close();
    assert.equal(asProvider.status, 200);
    assert.equal("otp_code" in asProvider.body, false,
      "the provider could close a job the customer never confirmed");

    srv = await boot("../routes/bookings", bookingPool(), CUSTOMER);
    const asCustomer = await call(srv.url, "GET", `/${BOOKING}`);
    await srv.close();
    assert.equal(asCustomer.body.otp_code, "482913");
  });

  // NEGATIVE CONTROL: change BOOKING_READ_COMPLETION_OTP's relationship to
  // bookingParticipantOrPlatform and this fails. The `roles` list alone does
  // NOT cover this case, which is why the relationship is there.
  await t.test("a provider whose users.role is 'customer' still cannot read the OTP", async (tt) => {
    // Not hypothetical. POST /api/providers/apply creates a providers row and
    // never touches users.role, so a person who signed up as a customer and
    // later applied is a provider with role='customer'. The role gate lets
    // them through; the relationship is what stops them reading the
    // customer's proof of delivery for their own job.
    const applied = { id: "applied-1", name: "Shuvo", role: "customer", is_active: 1 };
    const pool = bookingPool({ provider_user_id: applied.id });
    const srv = await boot("../routes/bookings", pool, applied);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", `/${BOOKING}`);
    assert.equal(res.status, 200, "they are a participant and may read the booking");
    assert.equal("otp_code" in res.body, false, "but not the customer's completion code");
  });

  await t.test("the second decision costs no second query (§36)", async (tt) => {
    const pool = bookingPool();
    const srv = await boot("../routes/bookings", pool, CUSTOMER);
    tt.after(() => srv.close());
    await call(srv.url, "GET", `/${BOOKING}`);
    // The loader's own SELECT list, not the join — the handler's detail query
    // shares the join and counting that would measure nothing.
    const loads = pool.all("SELECT b.id, b.customer_id, b.provider_id, b.status");
    assert.equal(loads.length, 1,
      "reading the booking and deciding on its OTP are two questions about one row");
  });
});

// ════════════════════════════════════════════════════════════
test("§30 PATCH /bookings/:id/status", async (t) => {
  await t.test("a stranger is refused before any transaction opens", async (tt) => {
    const pool = bookingPool();
    const srv = await boot("../routes/bookings", pool, STRANGER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "PATCH", `/${BOOKING}/status`, { status: "completed" });
    assert.equal(res.status, 403);
    assert.equal(pool.ran("BEGIN"), false, "an unauthorized caller must not open a transaction");
    assert.equal(pool.ran("UPDATE bookings SET status"), false);
  });

  await t.test("the state machine still owns legality, and the kernel does not duplicate it", async (tt) => {
    // The customer is a participant, so the KERNEL permits the attempt. The
    // state machine then refuses `active -> completed` for a customer. Two
    // distinct answers to two distinct questions (§19).
    const pool = bookingPool({}, [
      { match: "SELECT id, customer_id, provider_id, amount, platform_fee, status, payment_status FROM bookings",
        rows: [{ id: BOOKING, customer_id: CUSTOMER.id, provider_id: "prov-1", amount: 400, platform_fee: 0, status: "active", payment_status: "paid" }] },
    ]);
    const srv = await boot("../routes/bookings", pool, CUSTOMER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "PATCH", `/${BOOKING}/status`, { status: "completed" });
    assert.equal(res.status, 403, "the transition is refused by the machine, not by the kernel");
    assert.equal(pool.ran("BEGIN"), true, "the kernel permitted the attempt");
    assert.equal(pool.ran("UPDATE users SET balance = balance + ?"), false, "nothing was paid");
  });
});

// ════════════════════════════════════════════════════════════
test("§30 the conversation", async (t) => {
  await t.test("a stranger can neither read nor post", async (tt) => {
    const pool = bookingPool();
    const srv = await boot("../routes/chat", pool, STRANGER);
    tt.after(() => srv.close());
    assert.equal((await call(srv.url, "GET", `/${BOOKING}`)).status, 403);
    assert.equal((await call(srv.url, "POST", `/${BOOKING}`, { message: "hello" })).status, 403);
    assert.equal(pool.ran("INSERT INTO chat_messages"), false);
    assert.equal(pool.ran("SELECT * FROM chat_messages"), false);
  });

  await t.test("both participants can, and the participation query runs once", async (tt) => {
    const pool = bookingPool();
    const srv = await boot("../routes/chat", pool, PROVIDER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", `/${BOOKING}`);
    assert.equal(res.status, 200);
    const checks = pool.all("FROM bookings b LEFT JOIN providers p ON p.id = b.provider_id");
    assert.equal(checks.length, 1,
      "the handler used to run its own copy of this query — a fourth implementation");
  });

  await t.test("posting to a completed booking is still permitted, and the disagreement is recorded", async (tt) => {
    // §24. The plan conditions message.send on a non-terminal booking; the
    // live system does not. Shadow mode must not revoke.
    const pool = bookingPool({ status: "completed" }, [
      { match: "INSERT INTO chat_messages", rows: { insertId: 5 } },
      { match: "SELECT * FROM chat_messages WHERE id = ?", rows: [{ id: 5, message: "thanks" }] },
    ]);
    const srv = await boot("../routes/chat", pool, CUSTOMER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "POST", `/${BOOKING}`, { message: "thanks" });
    assert.equal(res.status, 200, "shadow logic must never become authoritative");
    await new Promise((r) => setImmediate(r));
    const audits = pool.all("INSERT INTO audit_log");
    assert.equal(audits.length, 1, "the mismatch is recorded");
    assert.equal(audits[0].params[12], "permitted", "and recorded as what actually happened");
  });
});

// ════════════════════════════════════════════════════════════
test("POST /upload/proof — an authorization check that did not work, and said it did", async (t) => {
  // The old clause was:
  //   WHERE id=? AND (customer_id=? OR ?='admin')
  // which excluded the assigned provider — the person who takes the photo.
  // The UPDATE matched zero rows and the endpoint answered 200 with the URL.
  const multipart = async (url, fields) => {
    const boundary = "----imap" + "0123456789";
    const parts = [];
    for (const [k, v] of Object.entries(fields)) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
    }
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="p.png"\r\n` +
      `Content-Type: image/png\r\n\r\nPNGDATA\r\n--${boundary}--\r\n`
    );
    const res = await fetch(url + "/proof", {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: parts.join(""),
    });
    let body = null;
    try { body = await res.json(); } catch { body = {}; }
    return { status: res.status, body: body ?? {} };
  };

  await t.test("the assigned provider may now attach proof, and the write happens", async (tt) => {
    const pool = bookingPool({}, [{ match: "UPDATE bookings SET completion_proof", rows: { affectedRows: 1 } }]);
    const srv = await boot("../routes/upload", pool, PROVIDER);
    tt.after(() => srv.close());
    const res = await multipart(srv.url, { booking_id: BOOKING });
    assert.equal(res.status, 200);
    const writes = pool.all("UPDATE bookings SET completion_proof");
    assert.equal(writes.length, 1, "the provider's photo used to be silently discarded");
    assert.equal(writes[0].params.length, 2, "no role travels inside the WHERE clause any more");
  });

  await t.test("a stranger is refused, and told so instead of being told it worked", async (tt) => {
    const pool = bookingPool();
    const srv = await boot("../routes/upload", pool, STRANGER);
    tt.after(() => srv.close());
    const res = await multipart(srv.url, { booking_id: BOOKING });
    assert.equal(res.status, 403);
    assert.equal(pool.ran("UPDATE bookings SET completion_proof"), false);
  });

  // NEGATIVE CONTROL: delete the `conditions` line on BOOKING_ATTACH_PROOF
  // and this returns 200.
  await t.test("proof cannot be attached to a cancelled booking (§18)", async (tt) => {
    const pool = bookingPool({ status: "cancelled" });
    const srv = await boot("../routes/upload", pool, PROVIDER);
    tt.after(() => srv.close());
    const res = await multipart(srv.url, { booking_id: BOOKING });
    assert.equal(res.status, 409);
    assert.equal(pool.ran("UPDATE bookings SET completion_proof"), false);
  });

  await t.test("an upload with no booking attached needs no booking authorization", async (tt) => {
    const pool = bookingPool();
    const srv = await boot("../routes/upload", pool, CUSTOMER);
    tt.after(() => srv.close());
    const res = await multipart(srv.url, {});
    assert.equal(res.status, 200);
    assert.equal(pool.ran("UPDATE bookings SET completion_proof"), false);
  });
});

// ════════════════════════════════════════════════════════════
test("row 17 — transport parity", async (t) => {
  const { getParticipation } = require("../utils/bookingAccess");
  const { authorize, ACTION, authorizeLoaded } = require("../src/modules/platform/authorization");
  const { legacyActorFromUser } = require("../src/modules/platform/authorization/legacy");

  const db = (over = {}) => ({
    async query(sql) {
      if (String(sql).includes("FROM bookings b")) return [over.absent ? [] : [bookingRow(over)], []];
      return [[], []];
    },
  });

  await t.test("the socket path and the HTTP path reach the same decision for every actor", async () => {
    for (const user of [CUSTOMER, PROVIDER, STRANGER, ADMIN]) {
      const socket = await getParticipation(BOOKING, user, { db: db() });
      const http = await authorize(legacyActorFromUser(user), ACTION.BOOKING_OBSERVE, BOOKING, { db: db() });
      assert.equal(socket.allowed, http.allowed,
        `${user.role} is treated differently over the socket than over HTTP`);
    }
  });

  await t.test("a booking that does not exist denies on both, and says so only internally", async () => {
    const socket = await getParticipation(BOOKING, CUSTOMER, { db: db({ absent: true }) });
    assert.equal(socket.allowed, false);
    assert.equal(socket.notFound, true);
    assert.equal(socket.customerId, null, "a denied caller learns nothing about the booking");
  });

  await t.test("the participant role is resolved from the row, for the state machine", async () => {
    assert.equal((await getParticipation(BOOKING, CUSTOMER, { db: db() })).role, "customer");
    assert.equal((await getParticipation(BOOKING, PROVIDER, { db: db() })).role, "provider");
    assert.equal((await getParticipation(BOOKING, ADMIN, { db: db() })).role, "admin");
  });

  await t.test("an administrator who books a service is that booking's customer, not staff", async () => {
    const p = await getParticipation(BOOKING, ADMIN, { db: db({ customer_id: ADMIN.id }) });
    assert.equal(p.role, "customer", "otherwise an admin could complete their own booking as staff");
  });
});

// ════════════════════════════════════════════════════════════
test("authorizeLoaded cannot be handed a resource the caller built", async (t) => {
  const { authorizeLoaded, ACTION } = require("../src/modules/platform/authorization");
  const { legacyActorFromUser } = require("../src/modules/platform/authorization/legacy");
  const { DENY } = require("../src/modules/platform/authorization/decision");
  const { loadResource } = require("../src/modules/platform/authorization/resources");

  const db = { async query() { return [[bookingRow()], []]; } };

  // NEGATIVE CONTROL: drop the `wasLoadedFromDatabase` check and the forged
  // object below is accepted, which is request-supplied ownership again.
  await t.test("a hand-built object is refused even when it names the right owner", async () => {
    const forged = { type: "booking", id: BOOKING, customerId: STRANGER.id, providerUserId: null, status: "active" };
    const d = await authorizeLoaded(legacyActorFromUser(STRANGER), ACTION.BOOKING_OBSERVE, forged, { db });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.WRONG_RESOURCE);
  });

  await t.test("a row that survived JSON no longer counts as loaded", async () => {
    const real = await loadResource("booking", BOOKING, { db });
    const roundTripped = JSON.parse(JSON.stringify(real));
    assert.equal((await authorizeLoaded(legacyActorFromUser(CUSTOMER), ACTION.BOOKING_OBSERVE, roundTripped, { db })).allowed, false);
    assert.equal((await authorizeLoaded(legacyActorFromUser(CUSTOMER), ACTION.BOOKING_OBSERVE, real, { db })).allowed, true);
  });

  await t.test("a genuinely loaded row of the WRONG type is refused", async () => {
    const real = await loadResource("booking", BOOKING, { db });
    const d = await authorizeLoaded(legacyActorFromUser(ADMIN), ACTION.VERIFICATION_READ_DOCUMENT, real, { db });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, DENY.WRONG_RESOURCE);
  });
});
