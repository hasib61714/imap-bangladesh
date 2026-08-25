/**
 * Marketplace resource loaders — marketplace / infrastructure
 *
 * I-04 §17's rule, applied to this module's resources: a loader takes an id
 * and returns the authoritative row. It cannot take a request.
 *
 * TWO TYPES FOR ONE TABLE, AND THE REASON IS OWNERSHIP
 * ────────────────────────────────────────────────────
 *   provider_profile      keyed by provider id     — the public surface
 *   own_provider_profile  keyed by USER id         — "my profile"
 *
 * `/api/providers/me` has no id in the request, and the alternative to a
 * second loader is for the use case to look the row up itself and then
 * compare — which is ownership decided outside the kernel, the exact defect
 * I-04 removed. Keying the second loader on the user id lets the ACTOR'S OWN
 * id be the reference, so the kernel still loads the row and still decides.
 */
"use strict";

const { registerLoader } = require("../../platform").authorization;

const SELECT = `
  SELECT p.id, p.user_id, p.is_approved, p.listing_state, p.is_available,
         p.provider_source, u.is_active AS account_active
    FROM providers p LEFT JOIN users u ON u.id = p.user_id`;

const shape = (r) => ({
  type: null,   // set by the caller below
  id: String(r.id),
  userId: r.user_id === null ? null : String(r.user_id),
  // I-07 §9: the authority. `isApproved` travels alongside because the wire
  // shape still carries it, but no policy decides on it.
  listingState: r.listing_state || "applied",
  isApproved: r.is_approved === 1 || r.is_approved === true,
  isAvailable: r.is_available === 1 || r.is_available === true,
  accountActive: r.account_active === 1 || r.account_active === true,
  providerSource: r.provider_source,
});

async function loadProviderProfile(id, { db }) {
  const [rows] = await db.query(`${SELECT} WHERE p.id = ? LIMIT 1`, [id]);
  if (!rows.length) return null;
  return { ...shape(rows[0]), type: "provider_profile" };
}

async function loadOwnProviderProfile(userId, { db }) {
  const [rows] = await db.query(`${SELECT} WHERE p.user_id = ? LIMIT 1`, [userId]);
  if (!rows.length) return null;
  return { ...shape(rows[0]), type: "own_provider_profile" };
}

let installed = false;
function installMarketplaceLoaders() {
  if (installed) return;
  installed = true;
  registerLoader("provider_profile", loadProviderProfile);
  registerLoader("own_provider_profile", loadOwnProviderProfile);
}

module.exports = { installMarketplaceLoaders, loadProviderProfile, loadOwnProviderProfile };
