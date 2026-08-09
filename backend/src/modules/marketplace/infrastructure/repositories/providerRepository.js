/**
 * Provider repository — marketplace / infrastructure
 *
 * I-06 §14, §15. The only place marketplace SQL exists.
 *
 * Every method takes `db` first — a pool OR a transaction connection — so a
 * write can join the executor's transaction without the repository knowing
 * whether it is in one. That is the same signature the I-05 repositories use.
 *
 * Rows in, domain shapes out. A caller never sees `service_type_bn`; it sees
 * `serviceTypeBn`, and a column rename stops at this file.
 *
 * NO AUTHORIZATION DECISIONS HERE (§14). `search()` takes a `scope` produced
 * by the authorization policy and turns it into a WHERE clause. It does not
 * decide what the scope should be — that is the kernel's, and a repository
 * that decided it would be the second authorization implementation.
 */
"use strict";

const cache = require("../../../../../utils/cache");
const { toCandidate } = require("../../domain/fulfillmentCandidate");
const { PROVIDER_SOURCE } = require("../../domain/providerSource");
const { LISTING } = require("../../domain/listingEligibility");

/** Cache keys, unchanged from the route file so behaviour is identical. */
const LIST_KEY = (sort) => `providers:list:${sort}`;
const DETAIL_KEY = (id) => `provider:detail:${id}`;
const bustList = () => ["rating", "price", "jobs", "new"].forEach((s) => cache.del(LIST_KEY(s)));

const ORDER = Object.freeze({
  rating: "p.rating DESC",
  price: "p.hourly_rate ASC",
  jobs: "p.total_jobs DESC",
  new: "p.created_at DESC",
});

/**
 * Is this provider's identity currently verified?
 *
 * The whole conjunct in one correlated EXISTS, including the expiry check —
 * a case that says `verified` with a past `expires_at` grants nothing, and
 * the job that writes `expired` is a tidy-up rather than the control
 * (`verificationCase.grantsIdentityVerified` says the same thing in JS).
 *
 * Written here rather than joined so a provider with no `user_id` — an
 * INTERNAL provider entered by operations — evaluates to false rather than
 * dropping out of a LEFT JOIN in a way that reads like a missing row.
 */
const IDENTITY_VERIFIED_SQL = `
  EXISTS (SELECT 1 FROM verification_case v
           WHERE v.principal_id = p.user_id
             AND v.kind = 'identity'
             AND v.state = 'verified'
             AND (v.expires_at IS NULL OR v.expires_at > NOW()))`;

/** Columns a candidate is built from. One list, so list and detail agree. */
const CANDIDATE_COLUMNS = `
  p.id, p.user_id, p.provider_source, p.service_type_bn, p.service_type_en,
  p.area_bn, p.area_en, p.hourly_rate, p.rating, p.total_jobs,
  p.is_available, p.is_approved, p.listing_state, p.nid_verified,
  p.latitude, p.longitude,
  p.category_id, u.name AS display_name, u.avatar, u.is_active AS account_active,
  u.kyc_status, c.slug AS category_slug,
  ${IDENTITY_VERIFIED_SQL} AS identity_verified`;

/**
 * Turn a row into the shape `toCandidate` expects.
 *
 * The area is built by the domain's own value object rather than passed
 * through, so a coordinate that could not exist never becomes a candidate.
 */
function rowToCandidateInput(r, describeArea) {
  return {
    id: String(r.id),
    userId: r.user_id === null ? null : String(r.user_id),
    providerSource: r.provider_source || PROVIDER_SOURCE.EXTERNAL,
    serviceTypeBn: r.service_type_bn,
    serviceTypeEn: r.service_type_en,
    categoryId: r.category_id,
    categorySlug: r.category_slug ?? null,
    isApproved: r.is_approved === 1 || r.is_approved === true,
    listingState: r.listing_state || "applied",
    // From `verification_case`, not from `users.kyc_status`. The legacy column
    // is a compatibility MIRROR written by the decision path (I-07 §23) and
    // reading it back as authority would give "verified" two definitions.
    identityVerified: r.identity_verified === 1 || r.identity_verified === true,
    nidVerified: r.nid_verified === 1 || r.nid_verified === true,
    kycStatus: r.kyc_status ?? null,
    isAvailable: r.is_available === 1 || r.is_available === true,
    accountActive: r.account_active === 1 || r.account_active === true,
    area: describeArea({
      label: r.area_en, labelBn: r.area_bn,
      latitude: r.latitude, longitude: r.longitude,
    }),
    rating: r.rating,
    totalJobs: r.total_jobs,
    reviewCount: r.review_count ?? 0,
    hourlyRate: r.hourly_rate === null ? null : Number(r.hourly_rate),
    displayName: r.name ?? r.display_name ?? null,
    avatar: r.avatar ?? null,
  };
}

/**
 * Candidates that could meet a need.
 *
 * @param {object} db
 * @param {object} params
 * @param {object} params.need     a Need value object
 * @param {object} params.scope    from the authorization decision
 * @param {string} params.sort
 * @param {number} params.page
 * @param {number} params.limit
 * @param {(spec) => object} params.describeArea  injected so this file imports no domain rule it does not need
 */
async function search(db, { need, scope, sort = "rating", page = 1, limit = 20, describeArea }) {
  const where = [];
  const params = [];

  /**
   * §14: the visibility rule comes from the POLICY, not from here. P1-7 was a
   * provider appearing in this list the moment they applied, while the
   * applicant was told review takes 24-48 hours; the rule that fixed it now
   * lives where "who may see what" is decided.
   *
   * I-07 §9: THE FILTER IS NOW THE ARCHITECTURE'S CONJUNCTION
   * ────────────────────────────────────────────────────────
   * `TRUST-ARCHITECTURE.md` §5 says listable requires a verified identity as
   * well as a human approval, and this is where that becomes true rather than
   * aspirational. `is_approved` is no longer consulted — `listing_state` is —
   * and identity verification is read from `verification_case`.
   *
   * THIS DE-LISTS PROVIDERS, AND THAT IS A DELIBERATE, STATED CHANGE.
   * A provider carrying `is_approved = 1` from migration 002's grandfathering
   * but no verified identity case stops appearing. The homepage says
   * "KYC-verified providers"; listing unverified ones under that copy is the
   * defect, and P1-7 is the precedent for closing exactly this gap. The
   * number affected must be counted before deploy — the query is in
   * I-07-PROVIDER-VERIFICATION.md §9 — because it is a business impact, and
   * the timing of a business impact has an owner.
   *
   * `has_capability`, `has_coverage` and `has_price` are NOT in this WHERE
   * clause. They are in `evaluateEligibility`, which the candidate shape
   * carries, and they are omitted here because the two free-text stand-ins
   * would make the SQL filter on columns the domain has already said are
   * approximations (§19). A provider missing a rate is visible and unbookable
   * rather than invisible and unexplained — `utils/pricing.js` refuses the
   * quote, which is a message the customer can act on.
   */
  if (scope && scope.visibility === "public") {
    where.push(
      "p.listing_state = 'approved'",
      "u.is_active = 1",
      "p.is_available = 1",
      IDENTITY_VERIFIED_SQL
    );
  }

  if (need.text) {
    where.push("(u.name LIKE ? OR p.service_type_bn LIKE ? OR p.service_type_en LIKE ? OR p.area_bn LIKE ? OR p.area_en LIKE ?)");
    const like = `%${need.text}%`;
    params.push(like, like, like, like, like);
  }
  if (need.categorySlug) { where.push("c.slug = ?"); params.push(need.categorySlug); }
  if (need.minRating !== null) { where.push("p.rating >= ?"); params.push(need.minRating); }
  // §19: a price ceiling is what the customer can pay, applied as a filter and
  // not as a preference weight. The weighting across price, quality, distance
  // and availability is a product decision nobody has made.
  if (need.maxPrice !== null) { where.push("p.hourly_rate <= ?"); params.push(need.maxPrice); }
  if (need.area && need.area.label) {
    where.push("(p.area_en LIKE ? OR p.area_bn LIKE ?)");
    params.push(`%${need.area.label}%`, `%${need.area.label}%`);
  }

  const whereSql = where.length ? where.join(" AND ") : "1=1";
  const orderSql = ORDER[sort] || ORDER.rating;
  const offset = (page - 1) * limit;

  const listSql = `
      SELECT ${CANDIDATE_COLUMNS},
             (SELECT COUNT(*) FROM reviews r WHERE r.provider_id = p.id) AS review_count
      FROM providers p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?`;
  const countSql = `
      SELECT COUNT(*) AS total FROM providers p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${whereSql}`;

  const [rows] = await db.query(listSql, [...params, limit, offset]);
  const [[count]] = await db.query(countSql, params);

  return {
    candidates: rows.map((r) => toCandidate(rowToCandidateInput(r, describeArea))),
    total: Number(count ? count.total : 0),
  };
}

/** The cached default page. Same key and TTL the route file used. */
async function searchCached(db, params) {
  return cache.getOrSet(LIST_KEY(params.sort || "rating"), () => search(db, params), 45);
}

async function findById(db, id, { describeArea }) {
  const [rows] = await db.query(
    `SELECT ${CANDIDATE_COLUMNS}, p.bio_bn, p.bio_en, p.experience_yrs, p.trust_score, p.created_at,
            (SELECT COUNT(*) FROM reviews r WHERE r.provider_id = p.id) AS review_count
       FROM providers p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;
  const candidate = toCandidate(rowToCandidateInput(rows[0], describeArea));
  return {
    ...candidate,
    profile: Object.freeze({
      bioBn: rows[0].bio_bn, bioEn: rows[0].bio_en,
      experienceYears: rows[0].experience_yrs,
      trustScore: rows[0].trust_score,
      joinedAt: rows[0].created_at,
    }),
  };
}

async function findByUserId(db, userId, { describeArea }) {
  const [rows] = await db.query(
    `SELECT ${CANDIDATE_COLUMNS}, p.bio_bn, p.bio_en, p.experience_yrs, p.trust_score, p.created_at,
            u.phone, u.email,
            (SELECT COUNT(*) FROM reviews r WHERE r.provider_id = p.id) AS review_count
       FROM providers p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.user_id = ? LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  const candidate = toCandidate(rowToCandidateInput(rows[0], describeArea));
  return {
    ...candidate,
    profile: Object.freeze({
      bioBn: rows[0].bio_bn, bioEn: rows[0].bio_en,
      experienceYears: rows[0].experience_yrs,
      trustScore: rows[0].trust_score,
      joinedAt: rows[0].created_at,
    }),
    // Only ever returned to the owner. P1-1 removed contact details from the
    // public list for exactly this reason, so they are on a separate key that
    // the public shapes do not carry.
    contact: Object.freeze({ phone: rows[0].phone ?? null, email: rows[0].email ?? null }),
  };
}

/** Just the id — the cheapest "is this user a provider" question. */
async function findIdByUserId(db, userId) {
  const [rows] = await db.query("SELECT id FROM providers WHERE user_id = ? LIMIT 1", [userId]);
  return rows.length ? String(rows[0].id) : null;
}

/**
 * Create a provider profile.
 *
 * `is_approved` is not in the column list, deliberately. It defaults to 0 and
 * D-005 makes eligibility trust-granted — a provider does not list themselves
 * (P1-7). `provider_source` is not here either: an application is by
 * definition external, and the column's default says so.
 */
async function insert(db, { id, userId, profile }) {
  await db.query(
    `INSERT INTO providers
       (id, user_id, service_type_bn, service_type_en, area_bn, area_en, bio_bn, bio_en,
        hourly_rate, experience_yrs)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, userId, profile.serviceTypeBn, profile.serviceTypeEn, profile.areaBn, profile.areaEn,
     profile.bioBn, profile.bioEn, profile.hourlyRate, profile.experienceYears]
  );
  bustList();
  cache.del("admin:stats");
  return id;
}

/**
 * Update the fields a provider may set on their own profile.
 *
 * `COALESCE(?, column)` throughout: a field the caller did not mention keeps
 * its stored value. The domain decided which fields those are — this only
 * writes them.
 */
async function update(db, { userId, providerId, profile }) {
  const [res] = await db.query(
    `UPDATE providers SET
       service_type_bn = COALESCE(?, service_type_bn),
       service_type_en = COALESCE(?, service_type_en),
       area_bn         = COALESCE(?, area_bn),
       area_en         = COALESCE(?, area_en),
       bio_bn          = COALESCE(?, bio_bn),
       bio_en          = COALESCE(?, bio_en),
       hourly_rate     = COALESCE(?, hourly_rate),
       experience_yrs  = COALESCE(?, experience_yrs)
     WHERE user_id = ?`,
    [profile.serviceTypeBn, profile.serviceTypeEn, profile.areaBn, profile.areaEn,
     profile.bioBn, profile.bioEn, profile.hourlyRate, profile.experienceYears, userId]
  );
  bustList();
  if (providerId) cache.del(DETAIL_KEY(providerId));
  cache.del(`provider:analytics:${userId}`);
  cache.del(`provider:jobs:${userId}`);
  return res.affectedRows;
}

async function setAvailability(db, { userId, providerId, isAvailable }) {
  const [res] = await db.query(
    "UPDATE providers SET is_available = ? WHERE user_id = ?",
    [isAvailable, userId]
  );
  bustList();
  if (providerId) cache.del(DETAIL_KEY(providerId));
  return res.affectedRows;
}

// ── the listing decision (I-07, F-12) ──────────────────────

/**
 * Lock the provider row by PRIMARY KEY, as the transaction's first statement.
 *
 * I-05's locking discipline. A `SELECT … FOR UPDATE` reaching the row through
 * a secondary index and then an `UPDATE` on the clustered index takes locks
 * in two orders and deadlocks — ER_LOCK_DEADLOCK on InnoDB, ER_CHECKREAD on
 * MariaDB. Resolve the id in autocommit; lock by PK here.
 */
async function lockById(db, id) {
  const [rows] = await db.query(
    `SELECT p.id, p.user_id, p.listing_state, p.is_approved, p.is_available,
            p.service_type_en, p.service_type_bn, p.area_en, p.area_bn, p.hourly_rate,
            u.is_active AS account_active,
            ${IDENTITY_VERIFIED_SQL} AS identity_verified
       FROM providers p LEFT JOIN users u ON u.id = p.user_id
      WHERE p.id = ? FOR UPDATE`,
    [id]
  );
  return rows.length ? rows[0] : null;
}

/**
 * Move a listing from one state to another.
 *
 * `WHERE id = ? AND listing_state = ?` is the concurrency control: two
 * operators deciding at once produce one update and one `affectedRows === 0`,
 * and the loser is told the listing moved rather than overwriting the winner.
 *
 * `is_approved` moves WITH it, in the same statement. It is the compatibility
 * mirror (§23) — `scripts/seedDemo.js`, the admin panel and two older tests
 * still read it — and keeping the two in one UPDATE is what makes them unable
 * to disagree. Nothing I-07 adds reads it back as authority.
 */
async function setListingState(db, { providerId, from, to, userId }) {
  const [res] = await db.query(
    "UPDATE providers SET listing_state = ?, is_approved = ? WHERE id = ? AND listing_state = ?",
    [to, to === LISTING.APPROVED ? 1 : 0, providerId, from]
  );
  bustList();
  cache.del(DETAIL_KEY(providerId));
  cache.del("admin:stats");
  if (userId) {
    cache.del(`provider:analytics:${userId}`);
    cache.del(`provider:jobs:${userId}`);
  }
  return res.affectedRows === 1;
}

/** Everything `evaluateEligibility` needs, for one provider, in one query. */
async function findEligibilityInput(db, providerId) {
  const [rows] = await db.query(
    `SELECT p.id, p.user_id, p.listing_state, p.is_available, p.hourly_rate,
            p.service_type_en, p.service_type_bn, p.area_en, p.area_bn,
            u.is_active AS account_active,
            ${IDENTITY_VERIFIED_SQL} AS identity_verified
       FROM providers p LEFT JOIN users u ON u.id = p.user_id
      WHERE p.id = ? LIMIT 1`,
    [providerId]
  );
  return rows.length ? rows[0] : null;
}

/** The approval queue: applications waiting on a human. */
async function listByListingState(db, { state = "applied", page = 1, limit = 30 }) {
  const offset = (page - 1) * limit;
  const [rows] = await db.query(
    `SELECT p.id, p.user_id, p.listing_state, p.service_type_en, p.service_type_bn,
            p.area_en, p.area_bn, p.hourly_rate, p.experience_yrs, p.created_at,
            u.name, u.phone, u.email, u.is_active AS account_active,
            ${IDENTITY_VERIFIED_SQL} AS identity_verified
       FROM providers p LEFT JOIN users u ON u.id = p.user_id
      WHERE p.listing_state = ?
      ORDER BY p.created_at ASC LIMIT ? OFFSET ?`,
    [state, limit, offset]
  );
  const [[total]] = await db.query(
    "SELECT COUNT(*) AS v FROM providers WHERE listing_state = ?", [state]
  );
  return { providers: rows, total: Number(total ? total.v : 0) };
}

/** The NID a provider supplies with an application. Identity data, not marketplace. */
async function attachNationalId(db, { userId, nidNumber }) {
  const [res] = await db.query("UPDATE users SET nid_number = ? WHERE id = ?", [nidNumber, userId]);
  return res.affectedRows;
}

module.exports = {
  search, searchCached, findById, findByUserId, findIdByUserId,
  insert, update, setAvailability, attachNationalId,
  lockById, setListingState, findEligibilityInput, listByListingState,
  LIST_KEY, DETAIL_KEY, bustList, ORDER, IDENTITY_VERIFIED_SQL,
};
