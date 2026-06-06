// Unit tests for the auth SERVICE using a fake repository (no DB).
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const bcrypt   = require("bcryptjs");
const { createAuthService } = require("../src/modules/auth/auth.service");

function makeService(users = []) {
  const repo = {
    findActiveByIdentifier: async (id) => users.find(u => (u.email === id || u.phone === id) && u.is_active) || null,
    findByEmail: async (e) => users.find(u => u.email === e) || null,
    findByPhone: async (p) => users.find(u => u.phone === p) || null,
    insertUser: async (u) => { users.push({ ...u, is_active: 1 }); },
    insertProviderProfile: async () => {},
    publicProfileById: async (id) => { const u = users.find(x => x.id === id); const { password_hash, ...rest } = u; return rest; },
  };
  return createAuthService({ repo, signAccessToken: (u) => `tok:${u.id}`, issueRefresh: async (id) => `ref:${id}` });
}

test("login succeeds with the correct password", async () => {
  const svc = makeService([{ id: "u1", email: "a@b.com", is_active: 1, role: "customer", password_hash: bcrypt.hashSync("secret", 4) }]);
  const out = await svc.login("a@b.com", "secret");
  assert.equal(out.token, "tok:u1");
  assert.equal(out.refresh_token, "ref:u1");
  assert.equal(out.user.password_hash, undefined, "hash never returned");
});

test("login rejects a wrong password", async () => {
  const svc = makeService([{ id: "u1", email: "a@b.com", is_active: 1, role: "customer", password_hash: bcrypt.hashSync("secret", 4) }]);
  await assert.rejects(() => svc.login("a@b.com", "nope"), /Wrong password/);
});

test("login rejects an unknown account", async () => {
  const svc = makeService([]);
  await assert.rejects(() => svc.login("ghost@x.com", "x"), (e) => e.status === 401);
});

test("register rejects a duplicate email", async () => {
  const svc = makeService([{ id: "u1", email: "a@b.com", is_active: 1 }]);
  await assert.rejects(() => svc.register({ name: "X", email: "a@b.com" }), (e) => e.status === 409);
});

test("register creates a user and returns tokens", async () => {
  const svc = makeService([]);
  const out = await svc.register({ name: "New User", email: "new@x.com", password: "pw123456" });
  assert.equal(out.user.email, "new@x.com");
  assert.ok(out.token.startsWith("tok:"));
  assert.ok(out.refresh_token.startsWith("ref:"));
});
