/**
 * Need — marketplace / domain
 *
 * I-06 §4, §17. The thing a person actually wants, as distinct from the
 * provider they end up with.
 *
 * WHY IT MUST EXIST NOW
 * ─────────────────────
 * The North Star is "any person can obtain the everyday service they need".
 * A platform that only records BOOKINGS can measure conversions; it cannot
 * measure the needs it failed to meet, and those are the ones that matter —
 * the searches with no result, the areas with no provider, the prices nobody
 * could pay. §17: do not remove or bypass Need.
 *
 * WHY IT IS NOT AN ENTITY
 * ───────────────────────
 * `GATE-1-ARCHITECTURE.md` §4.1 collapsed `need_understanding` and
 * `need_outcome` into one append-only `booking_event` row: "the funnel is a
 * query". That decision stands, and `booking_event` belongs to the booking
 * module, which is I-11. Creating a `need` table here would expand Gate 1,
 * which §7 forbids.
 *
 * So Need is a VALUE OBJECT and a use-case boundary. It is what a customer
 * expressed; it is passed to discovery; it is not stored yet.
 *
 * WHAT IS DELIBERATELY NOT HERE (§17)
 * ───────────────────────────────────
 * No AI understanding, no intent classification, no embedding, no synonym
 * expansion. A need at Gate 1 is what the customer typed and chose, and the
 * text is carried verbatim so that the understanding layer, when it arrives,
 * has the original to work from rather than something already interpreted.
 */
"use strict";

const { ValidationError } = require("../../../shared/errors");

/** Long enough for a sentence, short enough not to be a payload. */
const MAX_TEXT = 200;

/**
 * @param {object} spec
 * @param {string|null} [spec.text]        what the customer typed, verbatim
 * @param {string|null} [spec.categorySlug] a catalogue category they chose
 * @param {object|null} [spec.area]        a ServiceArea — where they need it
 * @param {number|null} [spec.maxPrice]  what they can pay (§19). A decimal, like the column
 * @param {number|null} [spec.minRating]   the quality floor they asked for
 */
function describeNeed(spec = {}) {
  const text = spec.text === null || spec.text === undefined ? null : String(spec.text).trim();
  if (text !== null && text.length > MAX_TEXT) {
    throw new ValidationError("need text is too long", {
      fields: [{ field: "q", code: "TOO_LONG" }],
    });
  }

  const categorySlug = spec.categorySlug ? String(spec.categorySlug).trim().slice(0, 80) : null;

  // A need that says nothing is not a need — it is a request for the whole
  // directory, which is a different thing and is allowed. `isSpecific` is
  // what discovery uses to decide whether it is answering a question or
  // listing everything.
  const isSpecific = Boolean(text || categorySlug || spec.area || spec.maxPrice || spec.minRating);

  return Object.freeze({
    text: text || null,
    categorySlug,
    area: spec.area || null,
    maxPrice: spec.maxPrice ?? null,
    minRating: spec.minRating ?? null,
    isSpecific,
  });
}

/**
 * The record a future `booking_event` row will carry.
 *
 * Not written anywhere yet — `booking_event` is I-11 — but the shape is fixed
 * here so that the funnel query the North Star needs ("how many needs went
 * unmet, where, at what price") is answerable from the first event written,
 * rather than from whatever the booking module happens to record.
 *
 * PII: the free text is a customer's own words and may contain an address or
 * a name. It is carried, never logged (§24), and its retention is an owner
 * decision that has not been made.
 */
function needOutcome(need, { candidateCount, chosenProviderId = null }) {
  return Object.freeze({
    text: need.text,
    categorySlug: need.categorySlug,
    areaLabel: need.area ? need.area.label : null,
    maxPrice: need.maxPrice,
    candidateCount,
    chosenProviderId,
    met: candidateCount > 0,
  });
}

module.exports = { describeNeed, needOutcome, MAX_TEXT };
