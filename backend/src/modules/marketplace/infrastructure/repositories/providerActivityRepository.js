/**
 * Provider activity — marketplace / infrastructure
 *
 * A provider's own view of their work: what they have earned, what is booked,
 * what customers said.
 *
 * THIS FILE CROSSES A MODULE BOUNDARY, AND SAYS SO
 * ────────────────────────────────────────────────
 * It reads `bookings` and `reviews`, which belong to the booking module.
 * `TARGET-REPOSITORY-STRUCTURE.md` §5 puts `routes/providers.js` in
 * marketplace, so these two endpoints land here — but the DATA is booking's,
 * and the correct end state is a read model that booking maintains and
 * marketplace queries.
 *
 * That read model needs the booking module, which is I-11/I-12. Until then
 * this is one named file rather than the same joins scattered through the
 * use cases, so when the read model arrives there is one place to change.
 * Recorded as a finding rather than left to be discovered.
 */
"use strict";

const cache = require("../../../../../utils/cache");

/**
 * Monthly completed-booking totals and recent reviews.
 *
 * WHAT WAS REMOVED
 * ────────────────
 * The previous handler reported `views: (total_jobs || 0) * 4`. There is no
 * view counter anywhere in the system; the number was invented from the job
 * count and shown to providers as a measurement. That is the fabricated-data
 * class the Phase 0 audit catalogued, so it is gone rather than carried
 * forward. A provider now sees the four figures that are real.
 */
async function summary(db, { userId, providerId }) {
  return cache.getOrSet(`provider:analytics:${userId}`, async () => {
    const [monthly] = await db.query(
      `SELECT DATE_FORMAT(created_at,'%b') AS month, SUM(amount) AS total
         FROM bookings
        WHERE provider_id = ? AND status = 'completed'
          AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        GROUP BY YEAR(created_at), MONTH(created_at)
        ORDER BY YEAR(created_at), MONTH(created_at)`,
      [providerId]
    );

    const [reviews] = await db.query(
      `SELECT r.rating AS stars, r.comment AS text, u.name,
              DATE_FORMAT(r.created_at,'%d %b') AS date
         FROM reviews r LEFT JOIN users u ON u.id = r.customer_id
        WHERE r.provider_id = ?
        ORDER BY r.created_at DESC LIMIT 5`,
      [providerId]
    );

    const [[totals]] = await db.query(
      "SELECT total_jobs, rating FROM providers WHERE id = ? LIMIT 1",
      [providerId]
    );

    return {
      months: monthly.map((r) => r.month),
      earnings: monthly.map((r) => Number(r.total) || 0),
      completedJobs: totals ? Number(totals.total_jobs) || 0 : 0,
      rating: totals ? Number(totals.rating) || 0 : 0,
      thisMonth: monthly.length ? Number(monthly[monthly.length - 1].total) || 0 : 0,
      reviews,
    };
  }, 60);
}

/** The provider's booked work, newest first. */
async function jobs(db, { userId, providerId }) {
  return cache.getOrSet(`provider:jobs:${userId}`, async () => {
    const [rows] = await db.query(
      `SELECT b.*, u.name AS customer_name, u.phone AS customer_phone, u.avatar AS customer_avatar
         FROM bookings b LEFT JOIN users u ON u.id = b.customer_id
        WHERE b.provider_id = ? ORDER BY b.created_at DESC`,
      [providerId]
    );
    return rows;
  }, 15);
}

/**
 * The reviews shown on a public profile.
 *
 * Booking-module data again, and the same note applies: this becomes a read
 * model when booking exists. Bounded at 20 because a profile page is not a
 * review archive.
 */
async function recentReviews(db, providerId) {
  const [rows] = await db.query(
    `SELECT r.id, r.rating, r.comment, r.created_at,
            u.name AS customer_name, u.avatar AS customer_avatar
       FROM reviews r LEFT JOIN users u ON u.id = r.customer_id
      WHERE r.provider_id = ? ORDER BY r.created_at DESC LIMIT 20`,
    [providerId]
  );
  return rows;
}

module.exports = { summary, jobs, recentReviews };
