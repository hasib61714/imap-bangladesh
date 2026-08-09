/**
 * Provider profile rules — marketplace / domain
 *
 * I-06 §10. The invariants that were `if (bio_bn && bio_bn.length > 1000)`
 * repeated in two route handlers, with the two copies already differing in
 * which fields they checked.
 *
 * Pure: no database, no HTTP, no clock. Every function either returns a
 * validated value or throws an `AppError` the transport maps.
 */
"use strict";

const { ValidationError } = require("../../../shared/errors");
const { parseOptionalAmount, MoneyError } = require("../../../shared/money");
const { describeArea } = require("./serviceArea");

/**
 * Field limits, in one place.
 *
 * `providers.bio_bn` is TEXT and `service_type_bn` is VARCHAR(100); these are
 * at or under the column widths, so a value that passes here cannot be
 * truncated by the engine. Two of them were previously enforced on `apply`
 * and not on `update`, which meant the same field had two limits depending on
 * which endpoint set it.
 */
const LIMITS = Object.freeze({
  service_type_bn: 100,
  service_type_en: 100,
  area_bn: 200,
  area_en: 200,
  bio_bn: 1000,
  bio_en: 1000,
  nid_number: 30,
});

/** A provider setting their own rate is legitimate; an unbounded one is not. */
const MAX_HOURLY_RATE = 100000;

function boundedText(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value);
  const limit = LIMITS[field];
  if (limit && s.length > limit) {
    throw new ValidationError(`${field} is too long (max ${limit})`, {
      fields: [{ field, code: "TOO_LONG" }],
    });
  }
  return s;
}

/**
 * The rate a provider offers.
 *
 * It feeds server-side booking pricing, so it is money and is validated as
 * money — P0-4 was a negative `platform_fee` turning a deduction into a
 * credit, and the same class of value reaching the same arithmetic through a
 * provider's own profile would be the same defect with a different entry
 * point. Zero and absent are the same thing here: "I have not set a rate".
 */
function offeredRate(value) {
  try {
    const rate = parseOptionalAmount(value, "hourly_rate", 0, { max: MAX_HOURLY_RATE });
    return rate > 0 ? rate : null;
  } catch (err) {
    if (err instanceof MoneyError) {
      throw new ValidationError(err.message, { fields: [{ field: "hourly_rate", code: "INVALID_AMOUNT" }] });
    }
    throw err;
  }
}

/**
 * Normalise the fields a provider may set on their own profile.
 *
 * `undefined` means "not supplied" and is preserved as `null`, which the
 * repository turns into `COALESCE(?, column)` — leaving the stored value
 * alone. This is the one place that distinction is made, so a partial update
 * cannot accidentally blank a field it did not mention.
 *
 * NOT SETTABLE HERE, deliberately: `is_approved` (D-005 — trust-granted, and
 * F-12 records that no endpoint grants it), `rating`, `total_jobs`,
 * `trust_score`, `nid_verified`, `provider_source`. A provider does not
 * decide their own standing, and the way to guarantee that is for the shape
 * this function returns not to contain those fields at all.
 */
function editableProfile(input = {}) {
  const area = describeArea({ label: input.area_en, labelBn: input.area_bn });

  return Object.freeze({
    serviceTypeBn: boundedText(input.service_type_bn, "service_type_bn"),
    serviceTypeEn: boundedText(input.service_type_en, "service_type_en"),
    areaBn: area.labelBn,
    areaEn: area.label,
    bioBn: boundedText(input.bio_bn, "bio_bn"),
    bioEn: boundedText(input.bio_en, "bio_en"),
    hourlyRate: offeredRate(input.hourly_rate),
    experienceYears: experienceYears(input.experience_yrs),
  });
}

function experienceYears(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 80) {
    throw new ValidationError("experience_yrs must be a whole number of years", {
      fields: [{ field: "experience_yrs", code: "INVALID" }],
    });
  }
  return n;
}

/**
 * The availability switch. Strictly 0 or 1.
 *
 * P1-11 is the reason: the admin panel sent `is_active = -1` for "suspend"
 * and `!(-1)` is false, so a suspended user kept full access. A boolean-ish
 * column that accepts anything truthy is the same defect waiting for a
 * different caller.
 */
function availabilityFlag(value) {
  if (value === 0 || value === false || value === "0" || value === "false") return 0;
  if (value === 1 || value === true || value === "1" || value === "true") return 1;
  throw new ValidationError("is_available must be 0 or 1", {
    fields: [{ field: "is_available", code: "INVALID" }],
  });
}

module.exports = { LIMITS, MAX_HOURLY_RATE, editableProfile, offeredRate, availabilityFlag, boundedText };
