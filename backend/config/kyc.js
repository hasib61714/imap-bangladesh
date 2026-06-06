// ─────────────────────────────────────────────────────────────
//  IMAP – KYC document types (single source of truth)
//
//  Canonical types used by routes, validation and the database.
//  Legacy aliases (old enum values / older client field values) are
//  normalised to the canonical form so historical data keeps working.
// ─────────────────────────────────────────────────────────────

const DOC_TYPES = ["nid", "passport", "birth_certificate", "driving_license"];

const ALIASES = {
  nid: "nid",
  passport: "passport",
  birth: "birth_certificate",          // legacy enum value
  birth_cert: "birth_certificate",     // legacy client value
  birth_certificate: "birth_certificate",
  driving: "driving_license",          // legacy enum value
  driving_licence: "driving_license",  // British spelling
  driving_license: "driving_license",
};

/** Normalise any accepted/legacy value to a canonical type, or null if unknown. */
function normalizeDocType(value) {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return ALIASES[key] || (DOC_TYPES.includes(key) ? key : null);
}

/** True if the value maps to a canonical document type. */
function isValidDocType(value) {
  return normalizeDocType(value) !== null;
}

module.exports = { DOC_TYPES, ALIASES, normalizeDocType, isValidDocType };
