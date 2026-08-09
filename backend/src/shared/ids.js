/**
 * Identifiers — IMAP
 *
 * `DATA-ARCHITECTURE.md` rule 11: ids are UUIDv7. Time-ordered, so they sort
 * by creation and index without the page-split cost of v4, and non-guessable,
 * so they cannot be enumerated the way the current sequential INT primary
 * keys can.
 *
 * v7 comes from the `uuid` package already present at 10.0.0 — no new
 * dependency.
 */
const { v7: uuidv7, validate, version } = require("uuid");

/** A new time-ordered id. The only id generator application code should use. */
function newId() {
  return uuidv7();
}

/** True for any well-formed UUID of any version — legacy rows are v4. */
function isId(value) {
  return typeof value === "string" && validate(value);
}

/**
 * True only for v7. Useful in migration validation: it distinguishes rows
 * created after the cutover from rows carried across it.
 */
function isTimeOrderedId(value) {
  return isId(value) && version(value) === 7;
}

module.exports = { newId, isId, isTimeOrderedId };
