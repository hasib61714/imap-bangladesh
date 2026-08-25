// Unit tests for refresh-token primitives (no DB).
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { generateToken, hashToken } = require("../utils/refreshTokens");

test("generated tokens are long, random and unique", () => {
  const a = generateToken(), b = generateToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 60, "token should be high-entropy");
});

test("hash is deterministic SHA-256 hex and never equals the plaintext", () => {
  const t = generateToken();
  assert.equal(hashToken(t), hashToken(t));
  assert.match(hashToken(t), /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken(t), t, "we store the hash, not the token");
});

test("different tokens hash differently", () => {
  assert.notEqual(hashToken("a"), hashToken("b"));
});
