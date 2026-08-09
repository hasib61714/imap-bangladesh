/**
 * Service area — marketplace / domain
 *
 * I-06 §18. IMAP is hyperlocal: a plumber in Sylhet is not a result for a
 * customer in Khulna, however good they are.
 *
 * WHAT EXISTS TODAY
 * ─────────────────
 * `providers.area_bn` / `area_en` — free text a provider typed. `latitude` /
 * `longitude` — nullable, and written by nothing in the repository. Migration
 * 005 created an `area` hierarchy table, deliberately EMPTY because no
 * official source for Bangladesh's administrative divisions had been agreed
 * (I-01).
 *
 * So the only location data that exists is a string, and matching is a
 * `LIKE`. That is the honest starting point and this value object does not
 * pretend otherwise.
 *
 * WHAT IS DELIBERATELY NOT HERE (§18)
 * ───────────────────────────────────
 * No GPS tracking, no geospatial ranking, no radius query, no distance
 * calculation, no location history, no live provider position. Those need the
 * `area` hierarchy populated and a decision about coordinate precision that
 * `SECURITY-ARCHITECTURE.md` §7 constrains ("purpose-scoped, time-bounded,
 * not persisted beyond the booking" — D-04).
 *
 * WHAT IS HERE
 * ────────────
 * One shape, so that the day the hierarchy is populated there is one place
 * that changes. Coordinates are VALIDATED but not used for matching: a
 * latitude of 200 is currently storable, and refusing it costs nothing now
 * and saves a corrupt row later.
 */
"use strict";

const { ValidationError } = require("../../../shared/errors");

const MAX_LABEL = 200;

/** Bangladesh, generously bounded. A point outside it is a data error today. */
const BD_BOUNDS = Object.freeze({ minLat: 20.5, maxLat: 26.7, minLng: 88.0, maxLng: 92.7 });

/**
 * @param {object} spec
 * @param {string|null} [spec.label]   what the provider or customer typed
 * @param {string|null} [spec.labelBn]
 * @param {number|null} [spec.latitude]
 * @param {number|null} [spec.longitude]
 */
function describeArea(spec = {}) {
  const label = normaliseLabel(spec.label, "area_en");
  const labelBn = normaliseLabel(spec.labelBn, "area_bn");

  const point = coordinate(spec.latitude, spec.longitude);

  return Object.freeze({
    label: label || null,
    labelBn: labelBn || null,
    latitude: point ? point.latitude : null,
    longitude: point ? point.longitude : null,
    /**
     * Whether this area can take part in a proximity query. Always false at
     * Gate 1, because nothing writes coordinates — stated as a property
     * rather than left for a future reader to discover by reading the
     * repository.
     */
    isLocatable: Boolean(point),
  });
}

function normaliseLabel(value, field) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (s.length > MAX_LABEL) {
    throw new ValidationError(`${field} is too long`, { fields: [{ field, code: "TOO_LONG" }] });
  }
  return s;
}

/**
 * A point, or null. Both halves or neither: a latitude without a longitude is
 * not half a location, it is a broken one.
 */
function coordinate(lat, lng) {
  const hasLat = lat !== null && lat !== undefined && lat !== "";
  const hasLng = lng !== null && lng !== undefined && lng !== "";
  if (!hasLat && !hasLng) return null;
  if (hasLat !== hasLng) {
    throw new ValidationError("a coordinate needs both latitude and longitude", {
      fields: [{ field: hasLat ? "longitude" : "latitude", code: "REQUIRED" }],
    });
  }

  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ValidationError("coordinates must be numbers", {
      fields: [{ field: "latitude", code: "INVALID" }],
    });
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new ValidationError("coordinates are outside the possible range", {
      fields: [{ field: "latitude", code: "OUT_OF_RANGE" }],
    });
  }
  return { latitude, longitude };
}

/** Whether a point is plausibly in Bangladesh. Advisory — never a refusal. */
const looksBangladeshi = (area) =>
  Boolean(area && area.isLocatable &&
    area.latitude >= BD_BOUNDS.minLat && area.latitude <= BD_BOUNDS.maxLat &&
    area.longitude >= BD_BOUNDS.minLng && area.longitude <= BD_BOUNDS.maxLng);

module.exports = { describeArea, coordinate, looksBangladeshi, BD_BOUNDS, MAX_LABEL };
