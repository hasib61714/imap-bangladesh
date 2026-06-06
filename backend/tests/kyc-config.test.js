// Unit tests for KYC document-type normalization (no DB).
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { DOC_TYPES, normalizeDocType, isValidDocType } = require("../config/kyc");

test("canonical types are accepted and unchanged", () => {
  for (const t of DOC_TYPES) {
    assert.equal(isValidDocType(t), true);
    assert.equal(normalizeDocType(t), t);
  }
});

test("legacy aliases normalise to canonical values", () => {
  assert.equal(normalizeDocType("birth"), "birth_certificate");
  assert.equal(normalizeDocType("birth_cert"), "birth_certificate");
  assert.equal(normalizeDocType("driving"), "driving_license");
  assert.equal(normalizeDocType("driving_licence"), "driving_license");
});

test("case and whitespace are tolerated", () => {
  assert.equal(normalizeDocType("  NID "), "nid");
  assert.equal(normalizeDocType("Passport"), "passport");
});

test("unknown / invalid values are rejected", () => {
  assert.equal(normalizeDocType("ssn"), null);
  assert.equal(isValidDocType("ssn"), false);
  assert.equal(isValidDocType(123), false);
  assert.equal(isValidDocType(null), false);
});
