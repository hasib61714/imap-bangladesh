// Unit tests for the admin password strength policy (no DB).
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { validatePasswordStrength } = require("../utils/password");

test("the old default 'admin123' is rejected", () => {
  assert.equal(validatePasswordStrength("admin123").ok, false);
});

test("rejects short / incomplete passwords", () => {
  assert.equal(validatePasswordStrength("Short1!").ok, false);          // too short
  assert.equal(validatePasswordStrength("alllowercase1!").ok, false);   // no uppercase
  assert.equal(validatePasswordStrength("ALLUPPERCASE1!").ok, false);   // no lowercase
  assert.equal(validatePasswordStrength("NoDigitsHere!!").ok, false);   // no digit
  assert.equal(validatePasswordStrength("NoSymbols1234").ok, false);    // no symbol
});

test("accepts a strong password", () => {
  const r = validatePasswordStrength("Str0ng-Admin-Pass!");
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test("reports the specific missing requirements", () => {
  const r = validatePasswordStrength("weak");
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 3);
});
