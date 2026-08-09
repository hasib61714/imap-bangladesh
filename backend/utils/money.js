/**
 * Money validation — IMAP
 *
 * Phase 0.5 containment. Every financial entry point runs untrusted
 * numeric input through here before it can reach a balance column.
 *
 * The audited failure (P0-4) was that `platform_fee` had no validation
 * rule at all, so a negative fee made `total` negative and turned the
 * "atomic deduction" guard (balance >= total) into a credit.
 *
 * Rules:
 *   - must parse to a finite Number  (rejects NaN, Infinity, "", null,
 *     objects, arrays, "1e999", "abc")
 *   - must be >= 0                    (rejects the negative-fee attack)
 *   - must be <= MAX_AMOUNT           (bounds a single operation)
 *   - rounded to 2 decimal places to match DECIMAL(12,2) storage
 */

/** Hard ceiling for any single money value, in BDT. */
const MAX_AMOUNT = 1_000_000;

class MoneyError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "MoneyError";
    this.status = 400;
    this.field = field;
  }
}

/** Round half-up to 2 dp without binary-float drift on typical values. */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Parse and validate a non-negative money value.
 * @param {*} value
 * @param {string} field - field name used in the error message
 * @param {{ max?: number, min?: number }} [opts]
 * @returns {number} a finite, non-negative, 2-dp number
 * @throws {MoneyError}
 */
function parseAmount(value, field = "amount", opts = {}) {
  const max = opts.max ?? MAX_AMOUNT;
  const min = opts.min ?? 0;

  if (value === null || value === undefined || value === "") {
    throw new MoneyError(`${field} is required`, field);
  }
  // Reject objects/arrays/booleans outright: Number([]) === 0 and
  // Number(true) === 1, both of which would silently pass.
  if (typeof value !== "number" && typeof value !== "string") {
    throw new MoneyError(`${field} must be a number`, field);
  }
  const n = typeof value === "number" ? value : Number(String(value).trim());

  if (!Number.isFinite(n)) throw new MoneyError(`${field} must be a finite number`, field);
  if (n < min)   throw new MoneyError(`${field} must be at least ${min}`, field);
  if (n > max)   throw new MoneyError(`${field} exceeds the maximum of ${max}`, field);

  return round2(n);
}

/**
 * Same as parseAmount but returns `fallback` when the value is absent.
 * Present-but-invalid still throws — absence and garbage are different.
 */
function parseOptionalAmount(value, field, fallback = 0, opts = {}) {
  if (value === null || value === undefined || value === "") return round2(fallback);
  return parseAmount(value, field, opts);
}

/** True when the value is a safe, non-negative money amount. */
function isValidAmount(value, opts = {}) {
  try {
    parseAmount(value, "value", opts);
    return true;
  } catch {
    return false;
  }
}

module.exports = { parseAmount, parseOptionalAmount, isValidAmount, round2, MoneyError, MAX_AMOUNT };
