/**
 * P0-7 — a socket must not join a booking room it is not a participant of.
 * P0-7 — location updates must be restricted to authorized participants.
 * P0-8 — SOS data must not be broadcast to every connected socket.
 *
 * Audit evidence: docs/audit/SECURITY-GAPS.md P0-7, P0-8
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { makePool, installFakeDb, resetModules, serve, call, asUser } = require("./helpers/harness");

/** Minimal stand-in for a socket.io Socket that records what it did. */
function fakeSocket(user) {
  const s = new EventEmitter();
  s.user = user;
  s.rooms = new Set();
  s.emitted = [];
  s.toCalls = [];
  s.join = (r) => s.rooms.add(r);
  s.leave = (r) => s.rooms.delete(r);
  s.emit = (event, payload) => { s.emitted.push({ event, payload }); return true; };
  s.to = (room) => ({ emit: (event, payload) => s.toCalls.push({ room, event, payload }) });
  return s;
}

/** Minimal stand-in for the io server. */
function fakeIo() {
  const sent = [];
  return {
    sent,
    to: (room) => ({ emit: (event, payload) => sent.push({ room, event, payload }) }),
    emit: (event, payload) => sent.push({ room: "__ALL__", event, payload }),
    sockets: { adapter: { rooms: new Map([["role:admin", new Set(["admin-socket"])]]) } },
  };
}

/** Wait a tick so async handlers finish. */
const tick = () => new Promise((r) => setImmediate(r));

function loadRealtime() {
  resetModules("../realtime", "../utils/bookingAccess", "../utils/bookingState");
  // utils/bookingAccess requires ../db at module load. Without a fake in
  // place the real mysql2 pool would be created and try to dial a database,
  // which keeps the event loop alive and hangs the test run.
  installFakeDb(makePool([]));
  return require("../realtime");
}

// ── P0-7 ────────────────────────────────────────────────────────────
test("P0-7: a non-participant cannot join a booking room", async () => {
  const { registerHandlers } = loadRealtime();
  const io = fakeIo();
  const socket = fakeSocket({ id: "outsider-1", role: "customer" });

  registerHandlers(io, socket, {
    pool: makePool([]),
    // Real bookings exist, but this user is neither party.
    participation: async () => ({ allowed: false, role: null, customerId: "cust-1", providerUserId: "prov-1" }),
  });

  socket.emit_ = socket.emit;
  socket.listeners("join_room")[0]("bk-someone-elses");
  await tick();

  assert.equal(socket.rooms.size, 0, "no room was joined");
  assert.equal(socket.authorizedBookings.size, 0, "nothing was authorized");
  assert.ok(socket.emitted.some(e => e.event === "room_denied"), "the client is told it was denied");
});

test("P0-7: a participant can join, and only that booking", async () => {
  const { registerHandlers } = loadRealtime();
  const io = fakeIo();
  const socket = fakeSocket({ id: "cust-1", role: "customer" });

  registerHandlers(io, socket, {
    pool: makePool([]),
    participation: async (bookingId) =>
      bookingId === "bk-mine"
        ? { allowed: true, role: "customer", customerId: "cust-1", providerUserId: "prov-1" }
        : { allowed: false, role: null, customerId: "cust-9", providerUserId: "prov-9" },
  });

  socket.listeners("join_room")[0]("bk-mine");
  await tick();
  socket.listeners("join_room")[0]("bk-theirs");
  await tick();

  assert.ok(socket.rooms.has("booking_bk-mine"));
  assert.ok(!socket.rooms.has("booking_bk-theirs"));
  assert.deepEqual([...socket.authorizedBookings], ["bk-mine"]);
});

test("P0-7: a guest socket (no token) cannot join anything", async () => {
  const { registerHandlers } = loadRealtime();
  const socket = fakeSocket(null);
  registerHandlers(fakeIo(), socket, {
    pool: makePool([]),
    participation: async () => ({ allowed: true, role: "customer", customerId: "x", providerUserId: "y" }),
  });

  socket.listeners("join_room")[0]("bk-1");
  await tick();

  assert.equal(socket.rooms.size, 0, "a tokenless socket joins nothing");
});

test("P0-7: location_update from an unauthorized socket is dropped", async () => {
  const { registerHandlers } = loadRealtime();
  const io = fakeIo();
  const socket = fakeSocket({ id: "outsider-1", role: "customer" });

  registerHandlers(io, socket, {
    pool: makePool([]),
    participation: async () => ({ allowed: false, role: null, customerId: "c", providerUserId: "p" }),
  });

  // Never joined — try to inject coordinates anyway.
  socket.listeners("location_update")[0]({ bookingId: "bk-1", lat: 23.8, lng: 90.4 });
  await tick();

  assert.equal(io.sent.length, 0, "no location was broadcast");
});

test("P0-7: only the assigned provider may publish a location", async () => {
  const { registerHandlers } = loadRealtime();

  // The customer is a participant but must not be able to fake the provider's position.
  const io1 = fakeIo();
  const customer = fakeSocket({ id: "cust-1", role: "customer" });
  registerHandlers(io1, customer, {
    pool: makePool([]),
    participation: async () => ({ allowed: true, role: "customer", customerId: "cust-1", providerUserId: "prov-1" }),
  });
  customer.listeners("join_room")[0]("bk-1");
  await tick();
  customer.listeners("location_update")[0]({ bookingId: "bk-1", lat: 0, lng: 0 });
  await tick();
  assert.equal(io1.sent.length, 0, "a customer cannot publish a provider location");

  // The provider can.
  const io2 = fakeIo();
  const provider = fakeSocket({ id: "prov-1", role: "provider" });
  registerHandlers(io2, provider, {
    pool: makePool([]),
    participation: async () => ({ allowed: true, role: "provider", customerId: "cust-1", providerUserId: "prov-1" }),
  });
  provider.listeners("join_room")[0]("bk-1");
  await tick();
  provider.listeners("location_update")[0]({ bookingId: "bk-1", lat: 23.81, lng: 90.41 });
  await tick();
  assert.equal(io2.sent.length, 1);
  assert.equal(io2.sent[0].room, "booking_bk-1", "scoped to the booking room, not broadcast");
  assert.deepEqual(io2.sent[0].payload, { lat: 23.81, lng: 90.41 });
});

test("P0-8: only a DB-verified admin joins the admin room", async () => {
  const { registerHandlers, ADMIN_ROOM } = loadRealtime();

  // A forged/stale JWT claiming role admin, but the DB says customer.
  const liar = fakeSocket({ id: "u-1", role: "admin" });
  registerHandlers(fakeIo(), liar, {
    pool: makePool([{ match: "SELECT role FROM users", rows: [{ role: "customer" }] }]),
    participation: async () => ({ allowed: false }),
  });
  await tick();
  assert.ok(!liar.rooms.has(ADMIN_ROOM), "the JWT claim alone is not enough");

  // A real admin.
  const real = fakeSocket({ id: "admin-1", role: "admin" });
  registerHandlers(fakeIo(), real, {
    pool: makePool([{ match: "SELECT role FROM users", rows: [{ role: "admin" }] }]),
    participation: async () => ({ allowed: false }),
  });
  await tick();
  assert.ok(real.rooms.has(ADMIN_ROOM), "a verified admin is admitted");
});

// ── P0-8 ────────────────────────────────────────────────────────────
test("P0-8: an SOS alert goes to the admin room, never to all sockets", async (t) => {
  resetModules("../routes/sos", "../middleware/auth");
  const pool = makePool([
    { match: "INSERT INTO sos_alerts", rows: { insertId: 77, affectedRows: 1 } },
  ]);
  installFakeDb(pool);
  const authMw = require.resolve("../middleware/auth");
  const victim = { id: "victim-1", name: "Victim Name", role: "customer", phone: "01799887766" };
  require.cache[authMw] = {
    id: authMw, filename: authMw, loaded: true,
    exports: {
      authMiddleware: (req, _res, next) => { req.user = victim; next(); },
      requireRole: () => (_req, _res, next) => next(),
    },
  };

  const io = fakeIo();
  const srv = await serve(require("../routes/sos"), {
    middleware: [
      asUser(victim),
      (req, _res, next) => {
        req.app.set("io", io);
        req.app.set("adminRoom", "role:admin");
        next();
      },
    ],
  });
  t.after(() => srv.close());

  const res = await call(srv.url, "POST", "/", {
    type: "harassment",
    description: "Being followed",
    lat: 23.81, lng: 90.41,
  });

  assert.equal(res.status, 200);

  // The critical assertion: nothing was emitted to every socket.
  const broadcasts = io.sent.filter(s => s.room === "__ALL__");
  assert.equal(broadcasts.length, 0, "SOS must never be io.emit()-broadcast");

  const admin = io.sent.filter(s => s.room === "role:admin" && s.event === "sos_alert");
  assert.equal(admin.length, 1, "exactly one delivery, to the admin room");
  assert.equal(admin[0].payload.user_phone, "01799887766", "admins still get what they need");

  // And the response must not claim a dispatch that did not happen.
  assert.notEqual(res.body.dispatch, "dispatched");
  assert.ok(!/call\s*cent/i.test(res.body.message), "no fabricated call-centre claim");
  assert.equal(res.body.recorded, true);
});
