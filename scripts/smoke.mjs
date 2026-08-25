/**
 * End-to-end smoke test — IMAP
 *
 * Drives the real HTTP surface the frontend uses, as the roles that use it,
 * in the order a real person would. It is not a unit test: it exists to
 * answer "does the whole thing work", which no amount of module testing can.
 *
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Exit code is the number of failed steps.
 */
const BASE = process.argv[2] || process.env.SMOKE_BASE || "http://127.0.0.1:5001/api";

let pass = 0, fail = 0, skip = 0;
const failures = [];
const ctx = {};

const c = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", x: "\x1b[0m" };

async function call(method, path, { token, body, form, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } };
  if (token) opts.headers.Authorization = "Bearer " + token;
  if (form) { opts.body = form; }
  else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function step(name, fn) {
  try {
    const out = await fn();
    if (out === "skip") { skip++; console.log(c.y + "○" + c.x + " " + name + " " + c.d + "(skipped)" + c.x); return; }
    pass++; console.log(c.g + "✔" + c.x + " " + name + (out ? " " + c.d + out + c.x : ""));
  } catch (err) {
    fail++; failures.push([name, err.message]);
    console.log(c.r + "✖" + c.x + " " + name + "\n    " + c.r + err.message + c.x);
  }
}
const group = (t) => console.log("\n" + c.d + "── " + t + " " + "─".repeat(Math.max(0, 58 - t.length)) + c.x);
function expect(cond, msg) { if (!cond) throw new Error(msg); }
function expectStatus(res, want, what) {
  const ok = Array.isArray(want) ? want.includes(res.status) : res.status === want;
  if (!ok) throw new Error(what + ": expected " + want + ", got " + res.status + " — " + JSON.stringify(res.body).slice(0, 220));
}

const uniq = () => Math.random().toString(36).slice(2, 8);
const phone = () => "017" + String(Math.floor(10000000 + Math.random() * 89999999));
const soon = () => new Date(Date.now() + 864e5).toISOString().slice(0, 19).replace("T", " ");

// A 1x1 JPEG, synthetic and non-sensitive — never a real identity document.
const JPEG_1PX =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
  "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";


/**
 * Register an account, and say clearly when the platform refuses to.
 *
 * `auth.register` is rate-limited to 10 per IP per hour (I-05), which is a
 * control working as designed and also something a suite that creates six
 * accounts per run will hit on its third pass. `resetRateLimits` below
 * clears this machine's counters between runs; without it, a blocked
 * registration used to surface further down as an inscrutable "No token
 * provided" from the next call that needed the token.
 */
async function register(who) {
  const r = await call("POST", "/auth/register", { body: who });
  if (r.status === 429) {
    throw new Error(
      "registration is rate-limited (10/IP/hour, working as designed). " +
      "Run with IMAP_SMOKE_RESET_LIMITS=1 through scripts/dev.sh to clear the local counters."
    );
  }
  expectStatus(r, [200, 201], "register " + who.name);
  return { token: r.body.token || r.body.accessToken, id: r.body.user && r.body.user.id, body: r.body };
}

/**
 * Clear this machine's rate-limit counters, in development only.
 *
 * Refuses anything but a loopback database host, for the same reason the
 * integration tests do: this deletes rows, and it must never be pointed at
 * a shared server. It does not touch the limits themselves — the policy is
 * unchanged and the next run is limited exactly as before.
 */
async function resetRateLimits() {
  if (process.env.IMAP_SMOKE_RESET_LIMITS !== "1") return;
  const host = process.env.DB_HOST;
  if (!["127.0.0.1", "localhost", "::1"].includes(String(host))) {
    console.log(c.y + "○" + c.x + " rate-limit reset skipped — DB_HOST is not loopback");
    return;
  }
  // Resolved from the backend, which is where the dependency lives — this
  // script sits outside it and has no node_modules of its own.
  const { createRequire } = await import("node:module");
  const require = createRequire(new URL("../backend/package.json", import.meta.url));
  const { createConnection } = require("mysql2/promise");
  const conn = await createConnection({
    host, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  const [res] = await conn.query("DELETE FROM rate_limit_counter");
  await conn.end();
  console.log(c.d + "  (cleared " + res.affectedRows + " rate-limit counters for this run)" + c.x);
}

await resetRateLimits();

// ═══════════════════════════════════════════════════════════
group("platform");
await step("health reports ok", async () => {
  const r = await call("GET", "/health");
  expectStatus(r, 200, "health");
  expect(r.body.status === "ok", "status=" + r.body.status);
  expect(r.body.db && r.body.db.status === "ok", "db=" + JSON.stringify(r.body.db));
  return "db " + r.body.db.latencyMs + "ms";
});

// ═══════════════════════════════════════════════════════════
group("identity — register, login, session");
ctx.customer = { name: "Smoke Customer", phone: phone(), password: "SmokeTest#2026", email: "c" + uniq() + "@smoke.test" };
ctx.provider = { name: "Smoke Provider", phone: phone(), password: "SmokeTest#2026", email: "p" + uniq() + "@smoke.test" };

await step("a customer can register", async () => {
  const out = await register(ctx.customer);
  ctx.customer.token = out.token;
  ctx.customer.id = out.id;
  expect(ctx.customer.token, "no token in " + JSON.stringify(out.body).slice(0, 200));
  return "id " + ctx.customer.id;
});

await step("a provider-to-be can register", async () => {
  const out = await register(ctx.provider);
  ctx.provider.token = out.token;
  ctx.provider.id = out.id;
  expect(ctx.provider.token, "no token");
});

await step("registering the same phone twice is refused", async () => {
  const r = await call("POST", "/auth/register", { body: ctx.customer });
  expectStatus(r, [400, 409, 422], "duplicate register");
});

await step("login with the right password works", async () => {
  // The contract is `identifier` (email OR phone), which is what the
  // frontend sends. An earlier draft of this test sent `phone` and read the
  // resulting 422 as an application bug; it was the test that was wrong.
  const r = await call("POST", "/auth/login", { body: { identifier: ctx.customer.phone, password: ctx.customer.password } });
  expectStatus(r, 200, "login");
  expect(r.body.token || r.body.accessToken, "no token");
});

await step("login with the wrong password is refused", async () => {
  const r = await call("POST", "/auth/login", { body: { identifier: ctx.customer.phone, password: "wrong-password-here" } });
  expectStatus(r, [400, 401], "bad login");
});

await step("/auth/me returns the caller", async () => {
  const r = await call("GET", "/auth/me", { token: ctx.customer.token });
  expectStatus(r, 200, "me");
  const id = (r.body.user && r.body.user.id) || r.body.id;
  expect(id === ctx.customer.id, "got " + JSON.stringify(r.body).slice(0, 150));
});

await step("an unauthenticated call to a protected route is refused", async () => {
  const r = await call("GET", "/users/profile");
  expectStatus(r, 401, "no token");
});

await step("a garbage token is refused", async () => {
  const r = await call("GET", "/users/profile", { token: "not.a.real.token" });
  expectStatus(r, 401, "bad token");
});

// ═══════════════════════════════════════════════════════════
group("marketplace — the directory");
await step("the public directory returns providers", async () => {
  const r = await call("GET", "/providers");
  expectStatus(r, 200, "providers");
  expect(Array.isArray(r.body.providers), "no providers array");
  expect(r.body.providers.length > 0,
    "THE MARKETPLACE IS EMPTY — total=" + r.body.total + ". A customer opening the app sees nothing.");
  ctx.someProvider = r.body.providers[0];
  return r.body.total + " listed";
});

await step("the directory hides contact details", async () => {
  if (!ctx.someProvider) return "skip";
  const leaked = ["phone", "email", "nid_number"].filter((k) => ctx.someProvider[k]);
  expect(leaked.length === 0, "P1-1: public list leaks " + leaked.join(", "));
});

await step("search by text works", async () => {
  const r = await call("GET", "/providers?q=electric");
  expectStatus(r, 200, "search");
  expect(Array.isArray(r.body.providers), "no array");
  return r.body.total + " match 'electric'";
});

await step("a provider profile is readable by id", async () => {
  if (!ctx.someProvider) return "skip";
  const r = await call("GET", "/providers/" + ctx.someProvider.id);
  expectStatus(r, 200, "profile");
  expect(r.body.id, "no id");
});

await step("the service catalogue is readable", async () => {
  const r = await call("GET", "/services");
  expectStatus(r, 200, "services");
  const list = Array.isArray(r.body) ? r.body : (r.body.services || r.body.categories);
  expect(Array.isArray(list) && list.length > 0, "no categories: " + JSON.stringify(r.body).slice(0, 150));
  return list.length + " categories";
});

// ═══════════════════════════════════════════════════════════
group("marketplace — becoming a provider");
await step("a user can apply as a provider", async () => {
  const r = await call("POST", "/providers/apply", {
    token: ctx.provider.token,
    body: {
      service_type_en: "Electrician", service_type_bn: "ইলেকট্রিশিয়ান",
      area_en: "Mirpur", area_bn: "মিরপুর", bio_en: "Ten years of experience",
      hourly_rate: 500, experience_yrs: 10, nid_number: "1234567890",
    },
  });
  expectStatus(r, [200, 201], "apply");
  expect(r.body.success, "no success: " + JSON.stringify(r.body).slice(0, 200));
});

await step("the applicant can read their own profile", async () => {
  const r = await call("GET", "/providers/me", { token: ctx.provider.token });
  expectStatus(r, 200, "me");
  ctx.provider.providerId = r.body.id;
  expect(r.body.id, "no provider id");
  return "provider " + r.body.id;
});

await step("an unapproved applicant is NOT in the public directory", async () => {
  const r = await call("GET", "/providers?limit=100");
  expectStatus(r, 200, "list");
  const found = (r.body.providers || []).some((p) => p.id === ctx.provider.providerId);
  expect(!found, "P1-7: an applicant appears in the directory before review");
});

await step("the applicant can see WHY they are not listed", async () => {
  if (!ctx.provider.providerId) return "skip";
  const r = await call("GET", "/providers/" + ctx.provider.providerId + "/eligibility", { token: ctx.provider.token });
  expectStatus(r, 200, "eligibility");
  expect(Array.isArray(r.body.failing), "no failing list: " + JSON.stringify(r.body).slice(0, 200));
  return r.body.failing.join(", ") || "listable";
});

// ═══════════════════════════════════════════════════════════
group("identity — verification (KYC)");
await step("verification state before submitting is not_submitted", async () => {
  const r = await call("GET", "/verification/me", { token: ctx.provider.token });
  expectStatus(r, 200, "verification/me");
  expect(r.body.state === "not_submitted", "got " + r.body.state);
});

await step("submitting KYC through the JSON route works", async () => {
  const r = await call("POST", "/kyc", {
    token: ctx.provider.token,
    body: { doc_type: "nid", doc_number: "1234567890", front_image: JPEG_1PX, selfie_image: JPEG_1PX },
  });
  expectStatus(r, [200, 201], "kyc submit");
  ctx.caseId = r.body.id;
  return "case " + r.body.id;
});

await step("an ID with no selfie beside it is refused, in both languages", async () => {
  // TRUST-ARCHITECTURE §6: "NID + selfie, human review". A document without
  // a face beside it verifies that the document exists, not that the person
  // holding it is its subject — so this is a requirement, not an oversight.
  // The UI asks for both; this is the server saying the same thing.
  const tok = (await register({ name: "Front Only", phone: phone(), password: "SmokeTest#2026" })).token;
  const r = await call("POST", "/kyc", {
    token: tok, body: { doc_type: "nid", doc_number: "999888777", front_image: JPEG_1PX },
  });
  expectStatus(r, 400, "front-only kyc");
  expect(r.body.user_message && r.body.user_message.bn, "no Bangla message for a Bangla-first product");
});

await step("the multipart upload route also creates a verification case", async () => {
  const tok = (await register({ name: "Multipart", phone: phone(), password: "SmokeTest#2026" })).token;
  const fd = new FormData();
  fd.append("nid_front", new Blob([Buffer.from(JPEG_1PX, "base64")], { type: "image/jpeg" }), "front.jpg");
  fd.append("selfie", new Blob([Buffer.from(JPEG_1PX, "base64")], { type: "image/jpeg" }), "selfie.jpg");
  fd.append("doc_type", "nid");
  fd.append("doc_number", "555444333");
  const r = await call("POST", "/upload/kyc", { token: tok, form: fd });
  expectStatus(r, [200, 201, 503], "upload/kyc");
  if (r.status === 503) return "storage unconfigured — fails closed (correct)";
  const v = await call("GET", "/verification/me", { token: tok });
  expect(v.body.state === "submitted",
    "the multipart route did not create a verification case — state=" + v.body.state +
    ". This is the path the UI actually uses, so the review lifecycle is unreachable.");
});

await step("the subject sees their own case, and no reviewer name", async () => {
  const r = await call("GET", "/verification/me", { token: ctx.provider.token });
  expectStatus(r, 200, "verification/me");
  expect(r.body.state === "submitted", "state=" + r.body.state);
  expect(!JSON.stringify(r.body).includes("decided_by"), "leaks the reviewer");
});

await step("a customer cannot read the review queue", async () => {
  const r = await call("GET", "/verification/queue", { token: ctx.customer.token });
  expectStatus(r, [401, 403, 404], "queue as customer");
});

await step("a customer cannot approve a verification", async () => {
  if (!ctx.caseId) return "skip";
  const r = await call("POST", "/verification/cases/" + ctx.caseId + "/approve", { token: ctx.customer.token });
  expectStatus(r, [401, 403, 404, 409], "approve as customer");
});

// ═══════════════════════════════════════════════════════════
group("trust & safety — the reviewer");
await step("an admin account is available to review with", async () => {
  const r = await call("POST", "/auth/login", {
    body: {
      identifier: process.env.SMOKE_ADMIN_PHONE || "01700000000",
      password: process.env.SMOKE_ADMIN_PASSWORD || "",
    },
  });
  if (r.status !== 200) return "skip";
  ctx.admin = { token: r.body.token || r.body.accessToken };
  return "logged in";
});

await step("the reviewer sees the queue", async () => {
  if (!ctx.admin) return "skip";
  const r = await call("GET", "/verification/queue?state=submitted", { token: ctx.admin.token });
  expectStatus(r, 200, "queue");
  expect(Array.isArray(r.body.cases), "no cases array");
  return r.body.total + " waiting";
});

await step("the queue carries no document bytes", async () => {
  if (!ctx.admin) return "skip";
  const r = await call("GET", "/verification/queue?state=submitted", { token: ctx.admin.token });
  const s = JSON.stringify(r.body);
  expect(!/object_key|front_image|base64/.test(s), "P1-12: the queue carries evidence");
});

await step("the reviewer can claim, then approve, a case", async () => {
  if (!ctx.admin || !ctx.caseId) return "skip";
  const claim = await call("POST", "/verification/cases/" + ctx.caseId + "/review", { token: ctx.admin.token });
  expectStatus(claim, 200, "claim");
  const approve = await call("POST", "/verification/cases/" + ctx.caseId + "/approve", { token: ctx.admin.token });
  expectStatus(approve, 200, "approve");
  expect(approve.body.state === "verified", "state=" + approve.body.state);
});

await step("rejecting without a reason is refused, and with one succeeds", async () => {
  if (!ctx.admin) return "skip";
  const tok = (await register({ name: "Reject Me", phone: phone(), password: "SmokeTest#2026" })).token;
  const sub = await call("POST", "/kyc", { token: tok, body: { doc_type: "nid", doc_number: "1112223334", front_image: JPEG_1PX, selfie_image: JPEG_1PX } });
  expectStatus(sub, [200, 201], "submit before rejecting");
  const id = sub.body.id;
  await call("POST", "/verification/cases/" + id + "/review", { token: ctx.admin.token });
  const bare = await call("POST", "/verification/cases/" + id + "/reject", { token: ctx.admin.token, body: {} });
  expectStatus(bare, 422, "reject with no reason");
  const ok = await call("POST", "/verification/cases/" + id + "/reject", {
    token: ctx.admin.token, body: { reason: "The ID photograph is not readable" },
  });
  expectStatus(ok, 200, "reject with reason");
});

// ═══════════════════════════════════════════════════════════
group("marketplace — approval makes a provider listable");
await step("the reviewer can approve the provider's listing", async () => {
  if (!ctx.admin || !ctx.provider.providerId) return "skip";
  const r = await call("POST", "/providers/" + ctx.provider.providerId + "/approve", { token: ctx.admin.token });
  expectStatus(r, 200, "approve listing");
  expect(r.body.listing_state === "approved", "state=" + r.body.listing_state);
});

await step("the approved provider now appears in the directory", async () => {
  if (!ctx.admin || !ctx.provider.providerId) return "skip";
  const r = await call("GET", "/providers?limit=100");
  const found = (r.body.providers || []).some((p) => p.id === ctx.provider.providerId);
  expect(found, "an approved, verified provider is still not listed — the trust gate never opens");
});

// ═══════════════════════════════════════════════════════════
group("booking — the core loop");
const bookingBody = (over = {}) => ({
  provider_id: ctx.someProvider.id,
  service_type: ctx.someProvider.service_type_en || "Electrician",
  scheduled_at: soon(), address: "House 1, Road 2, Mirpur, Dhaka",
  note: "Smoke test booking", ...over,
});

await step("a customer with an empty wallet can still book (cash)", async () => {
  if (!ctx.someProvider) return "skip";
  // The default used to be bKash, which debited the in-app wallet, so every
  // new customer hit "Insufficient wallet balance" with nowhere to go.
  const r = await call("POST", "/bookings", { token: ctx.customer.token, body: bookingBody() });
  expectStatus(r, [200, 201], "create booking");
  ctx.bookingId = (r.body.booking && r.body.booking.id) || r.body.id;
  expect(ctx.bookingId, "no booking id: " + JSON.stringify(r.body).slice(0, 200));
  expect(r.body.payment && r.body.payment.next === "pay_on_completion",
    "cash booking did not say it is paid on completion: " + JSON.stringify(r.body.payment));
  return "booking " + ctx.bookingId + " (cash)";
});

await step("choosing bKash creates an unpaid booking and asks for payment", async () => {
  if (!ctx.someProvider) return "skip";
  const r = await call("POST", "/bookings", { token: ctx.customer.token, body: bookingBody({ payment_method: "bKash" }) });
  expectStatus(r, [200, 201], "gateway booking");
  expect(r.body.payment_status === "pending", "a gateway booking must not be marked paid");
  expect(r.body.payment && r.body.payment.next === "initiate",
    "the client is not told to initiate payment: " + JSON.stringify(r.body.payment));
  ctx.gatewayBookingId = r.body.id;
});

await step("payment can be initiated for that booking", async () => {
  if (!ctx.gatewayBookingId) return "skip";
  const r = await call("POST", "/payments/initiate", {
    token: ctx.customer.token, body: { booking_id: ctx.gatewayBookingId, type: "booking" },
  });
  // 503 is correct where no gateway is configured: P0-12 refuses rather than
  // pretending money moved.
  expectStatus(r, [200, 201, 503], "initiate");
  return r.status === 503 ? "gateway unconfigured — refused, not faked" : "session opened";
});

await step("paying from an empty wallet is refused with a usable message", async () => {
  if (!ctx.someProvider) return "skip";
  const r = await call("POST", "/bookings", { token: ctx.customer.token, body: bookingBody({ payment_method: "wallet" }) });
  expectStatus(r, [400, 402, 409], "wallet booking with no balance");
  expect(/wallet|balance|টাকা|ব্যালেন্স/i.test(JSON.stringify(r.body)),
    "the refusal does not say what is wrong: " + JSON.stringify(r.body).slice(0, 160));
});

await step("the client cannot dictate the price", async () => {
  if (!ctx.someProvider) return "skip";
  const r = await call("POST", "/bookings", {
    token: ctx.customer.token,
    body: {
      provider_id: ctx.someProvider.id, service_type: "Electrician",
      scheduled_at: soon(), address: "House 1", hours: 1,
      amount: 1, total: 1, platform_fee: -500,
    },
  });
  if (r.status >= 400) return "refused outright";
  const b = r.body.booking || r.body;
  expect(Number(b.amount) !== 1, "P0-1: the server accepted a client-supplied amount (" + b.amount + ")");
  expect(Number(b.platform_fee) >= 0, "P0-4: negative platform fee accepted (" + b.platform_fee + ")");
});

await step("the customer can read their own booking", async () => {
  if (!ctx.bookingId) return "skip";
  const r = await call("GET", "/bookings/" + ctx.bookingId, { token: ctx.customer.token });
  expectStatus(r, 200, "read booking");
});

await step("a stranger cannot read someone else's booking", async () => {
  if (!ctx.bookingId) return "skip";
  const r = await call("GET", "/bookings/" + ctx.bookingId, { token: ctx.provider.token });
  expectStatus(r, [403, 404], "stranger read");
});

await step("the customer's booking list contains it", async () => {
  if (!ctx.bookingId) return "skip";
  const r = await call("GET", "/bookings", { token: ctx.customer.token });
  expectStatus(r, 200, "list bookings");
  const list = r.body.bookings || r.body;
  expect(Array.isArray(list) && list.some((b) => b.id === ctx.bookingId), "own booking missing from list");
});

await step("an invalid status transition is refused", async () => {
  if (!ctx.bookingId) return "skip";
  const r = await call("PATCH", "/bookings/" + ctx.bookingId + "/status", {
    token: ctx.customer.token, body: { status: "completed" },
  });
  expectStatus(r, [400, 403, 409, 422], "pending → completed by the customer");
});

// ═══════════════════════════════════════════════════════════
group("money");
await step("the wallet is readable and starts empty", async () => {
  const r = await call("GET", "/users/wallet", { token: ctx.customer.token });
  expectStatus(r, 200, "wallet");
  const bal = r.body.balance !== undefined ? r.body.balance : (r.body.wallet_balance || 0);
  expect(Number(bal) === 0, "a new account started with money: " + bal);
});

await step("a negative top-up is refused", async () => {
  const r = await call("POST", "/users/wallet/topup", { token: ctx.customer.token, body: { amount: -1000 } });
  expectStatus(r, [400, 403, 422], "negative topup");
});

await step("withdrawing more than the balance is refused", async () => {
  const r = await call("POST", "/users/wallet/withdraw", { token: ctx.customer.token, body: { amount: 999999 } });
  expectStatus(r, [400, 402, 403, 409, 422], "overdraw");
});

// ═══════════════════════════════════════════════════════════
group("other surfaces");
const surfaces = [
  ["notifications", "GET", "/users/notifications", "customer"],
  ["profile", "GET", "/users/profile", "customer"],
  ["loyalty", "GET", "/users/loyalty", "customer"],
  ["referral", "GET", "/users/referral", "customer"],
  ["blood directory", "GET", "/blood", "customer"],
  ["disaster alerts", "GET", "/disaster/alerts", null],
  ["provider jobs", "GET", "/providers/me/jobs", "provider"],
  ["provider analytics", "GET", "/providers/me/analytics", "provider"],
];
for (const [name, method, path, auth] of surfaces) {
  await step(name + " responds", async () => {
    const token = auth ? ctx[auth] && ctx[auth].token : undefined;
    const r = await call(method, path, { token });
    expectStatus(r, 200, name);
  });
}

await step("the blood directory refuses an anonymous caller", async () => {
  // Not a bug: donor phone numbers are masked and releasing one is logged,
  // so the list itself is behind authentication by design.
  const r = await call("GET", "/blood");
  expectStatus(r, 401, "anonymous blood list");
});

await step("admin surfaces refuse a customer", async () => {
  for (const p of ["/admin/stats", "/admin/users", "/admin/kyc", "/admin/revenue"]) {
    const r = await call("GET", p, { token: ctx.customer.token });
    expect([401, 403, 404].includes(r.status), p + " answered " + r.status + " to a customer");
  }
});

// ═══════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(62));
console.log("  " + c.g + pass + " passed" + c.x + "   " + (fail ? c.r : c.d) + fail + " failed" + c.x + "   " + c.d + skip + " skipped" + c.x);
if (failures.length) {
  console.log("\n  " + c.r + "Failures" + c.x);
  for (const [n, m] of failures) console.log("   " + c.r + "✖" + c.x + " " + n + "\n     " + c.d + m + c.x);
}
console.log("═".repeat(62) + "\n");
process.exit(Math.min(fail, 250));
