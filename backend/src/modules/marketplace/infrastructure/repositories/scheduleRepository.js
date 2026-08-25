/**
 * Provider schedule — marketplace / infrastructure
 *
 * Read-only at I-06. `routes/schedule.js` still owns the write side and its
 * own default-slot seeding; only the read a public profile needs is here, so
 * that `ReadProviderProfile` does not reach into another route file's query.
 *
 * `provider_schedule` therefore has two readers until the rest of the module
 * migrates. Recorded rather than left to be discovered.
 */
"use strict";

/** Slots grouped by day, in the shape the profile page already expects. */
async function listForProvider(db, providerId) {
  const [rows] = await db.query(
    `SELECT id, day_name_bn, day_name_en, slot_time, is_available
       FROM provider_schedule WHERE provider_id = ? ORDER BY id`,
    [providerId]
  );
  return rows.map((r) => ({
    id: r.id,
    dayBn: r.day_name_bn,
    dayEn: r.day_name_en,
    slot: r.slot_time,
    isAvailable: r.is_available === 1 || r.is_available === true,
  }));
}

module.exports = { listForProvider };
