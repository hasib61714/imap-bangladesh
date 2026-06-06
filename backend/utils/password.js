// ─────────────────────────────────────────────────────────────
//  IMAP – Password strength policy (pure, unit-testable)
// ─────────────────────────────────────────────────────────────

const MIN_LENGTH = 12;

/**
 * Validate password strength. Returns { ok, errors[] }.
 * Policy: >= 12 chars with upper, lower, digit and symbol.
 */
function validatePasswordStrength(pw) {
  const errors = [];
  if (typeof pw !== "string" || pw.length < MIN_LENGTH)
    errors.push(`at least ${MIN_LENGTH} characters`);
  if (!/[a-z]/.test(pw || "")) errors.push("a lowercase letter");
  if (!/[A-Z]/.test(pw || "")) errors.push("an uppercase letter");
  if (!/[0-9]/.test(pw || "")) errors.push("a digit");
  if (!/[^A-Za-z0-9]/.test(pw || "")) errors.push("a symbol");
  return { ok: errors.length === 0, errors };
}

module.exports = { validatePasswordStrength, MIN_LENGTH };
