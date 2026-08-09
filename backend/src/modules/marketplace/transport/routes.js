/**
 * Marketplace HTTP routes — marketplace / transport
 *
 * I-06 §8. A transport adapter, and nothing else.
 *
 * Each handler does exactly five things:
 *
 *   1. read the request
 *   2. build the actor
 *   3. call a use case
 *   4. shape the result for HTTP
 *   5. let the error boundary map a failure
 *
 * There is no `if` about who may do what, no SQL, no transaction, no audit
 * write and no business rule. What used to be 376 lines of route file is the
 * mapping below plus the use cases it calls.
 *
 * WHY THE RESPONSE SHAPES ARE PRESERVED EXACTLY
 * ─────────────────────────────────────────────
 * §27: the frontend is not migrated in I-06. `App.jsx` reads `providers[]`,
 * `provider.name`, `provider.hourly_rate` and the rest, so the presenters
 * below map the domain shape back to the wire shape the client already
 * expects. A structural migration that also changed the contract would make
 * one failure indistinguishable from the other.
 *
 * Those presenters are the ONLY place snake_case appears in this module.
 */
"use strict";

const router = require("express").Router();
const pool = require("../../../../db");
const { authMiddleware } = require("../../../../middleware/auth");
const platform = require("../../platform");
const { execute } = require("../../../application/execute");
const { repositories } = require("../index");

const { anonymousActor } = platform.authorization;
const { legacyActorFromUser } = platform.authorization.legacy;
const { requestIp, requestUserAgent } = platform.audit;

/**
 * The context every use case receives.
 *
 * `req` stops here — a use case is handed an actor, a database and its
 * repositories, and could equally be called by a job or by a socket handler.
 */
function contextFor(req) {
  return {
    actor: req.user
      ? legacyActorFromUser(req.user, { correlationId: req.requestId || null })
      : anonymousActor({ correlationId: req.requestId || null }),
    db: pool,
    repositories,
    correlationId: req.requestId || null,
    ip: requestIp(req),
    userAgent: requestUserAgent(req),
  };
}

/** Hand any failure to the transport error boundary rather than mapping it here. */
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// ── presenters — domain shape → the wire shape the client expects ──
const candidateToWire = (c) => ({
  id: c.providerId,
  user_id: c.userId,
  provider_source: c.source,
  name: c.displayName,
  avatar: c.avatar,
  service_type_bn: c.capability.serviceTypeBn,
  service_type_en: c.capability.serviceTypeEn,
  area_bn: c.area ? c.area.labelBn : null,
  area_en: c.area ? c.area.label : null,
  latitude: c.area ? c.area.latitude : null,
  longitude: c.area ? c.area.longitude : null,
  hourly_rate: c.pricing.hourlyRate,
  rating: c.quality.rating,
  total_jobs: c.quality.completedJobs,
  review_count: c.quality.reviewCount,
  is_available: c.availability.isAvailable ? 1 : 0,
  nid_verified: c.verification.nidVerified ? 1 : 0,
  kyc_status: c.verification.kycStatus,
  cat_slug: c.capability.categorySlug,
  category_id: c.capability.categoryId,
});

const profileToWire = (p) => ({
  ...candidateToWire(p),
  bio_bn: p.profile.bioBn,
  bio_en: p.profile.bioEn,
  experience_yrs: p.profile.experienceYears,
  trust_score: p.profile.trustScore,
  created_at: p.profile.joinedAt,
  is_verified: p.verification.isApproved ? 1 : 0,
});

const scheduleToWire = (s) => s.map((slot) => ({
  id: slot.id,
  day_name_bn: slot.dayBn,
  day_name_en: slot.dayEn,
  slot_time: slot.slot,
  is_available: slot.isAvailable ? 1 : 0,
}));

// ── GET /api/providers ────────────────────────────────────
router.get("/", handle(async (req, res) => {
  const out = await execute("marketplace.SearchFulfillmentCandidates", {
    text: req.query.q,
    categorySlug: req.query.category,
    areaLabel: req.query.area,
    maxPrice: req.query.max_price === undefined ? null : Number(req.query.max_price),
    minRating: req.query.min_rating === undefined ? null : Number(req.query.min_rating),
    sort: req.query.sort,
    page: req.query.page,
    limit: req.query.limit,
  }, contextFor(req));

  res.json({
    providers: out.candidates.map(candidateToWire),
    total: out.total,
    page: out.page,
    limit: out.limit,
  });
}));

// ── GET /api/providers/me ─────────────────────────────────
// Declared before `/:id`, or express would read "me" as a provider id.
router.get("/me", authMiddleware, handle(async (req, res) => {
  const p = await execute("marketplace.ReadOwnProviderProfile", {}, contextFor(req));
  res.json({ ...profileToWire(p), phone: p.contact.phone, email: p.contact.email });
}));

// ── GET /api/providers/me/analytics ───────────────────────
router.get("/me/analytics", authMiddleware, handle(async (req, res) => {
  const a = await execute("marketplace.ReadOwnEarnings", {}, contextFor(req));
  res.json({
    months: a.months,
    earnings: a.earnings,
    // `views` is gone: it was total_jobs * 4, an invented measurement.
    stats: { jobs: a.completedJobs, rating: a.rating, thisMonth: a.thisMonth },
    reviews: a.reviews,
  });
}));

// ── GET /api/providers/me/jobs ────────────────────────────
router.get("/me/jobs", authMiddleware, handle(async (req, res) => {
  res.json(await execute("marketplace.ReadOwnJobs", {}, contextFor(req)));
}));

// ── PUT /api/providers/me ─────────────────────────────────
router.put("/me", authMiddleware, handle(async (req, res) => {
  const p = await execute("marketplace.UpdateOwnProviderProfile", req.body || {}, contextFor(req));
  res.json({ success: true, provider: { ...profileToWire(p), phone: p.contact.phone } });
}));

// ── PATCH /api/providers/me/availability ──────────────────
router.patch("/me/availability", authMiddleware, handle(async (req, res) => {
  const out = await execute("marketplace.SetOwnAvailability", req.body || {}, contextFor(req));
  res.json({ success: true, is_available: out.isAvailable });
}));

// ── POST /api/providers/apply ─────────────────────────────
router.post("/apply", authMiddleware, handle(async (req, res) => {
  const out = await execute("marketplace.ApplyAsProvider", req.body || {}, contextFor(req));
  res.status(201).json({
    success: true,
    status: out.status,
    // The old copy promised review "within 24-48 hours". F-12 records that no
    // endpoint can approve an application at all, so the promise is removed
    // rather than repeated.
    message: "Application submitted for review",
  });
}));

// ── GET /api/providers/:id ────────────────────────────────
router.get("/:id", handle(async (req, res) => {
  const out = await execute("marketplace.ReadProviderProfile",
    { providerId: req.params.id }, contextFor(req));
  res.json({
    ...profileToWire(out.provider),
    schedule: scheduleToWire(out.schedule),
    reviews: out.reviews,
  });
}));

module.exports = router;
