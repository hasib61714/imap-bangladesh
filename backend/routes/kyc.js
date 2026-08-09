/**
 * KYC — the legacy wire format, on the new model
 *
 * I-07 §13, §23, §24, §25. This file used to be the defect Phase 0 named:
 *
 *     INSERT INTO kyc_docs (…, front_image, back_image, selfie_image)
 *     VALUES (…, <up to 7,168,000 chars of base64>, …, …)
 *
 * — three ~5 MB LONGTEXT columns of identity documents in the primary
 * transactional database, on a row that also carried `doc_number` in clear.
 *
 * WHAT IT IS NOW
 * ──────────────
 * An adapter. It accepts the body the current frontend already sends, calls
 * the same use cases `/api/verification/*` calls, and maps the result back to
 * the response shape the client already reads. No SQL about verification
 * state, no authorization decision, no audit write, no transaction — those
 * are the use case's, and there is exactly one of each.
 *
 * §27 of I-06 froze the frontend, so the wire format stays. Where the BYTES
 * come to rest is what changed, and that was the point.
 *
 * WHAT IT DELIBERATELY STOPS STORING
 * ──────────────────────────────────
 * `doc_type` and `doc_number`. Both are still accepted and validated so the
 * client is unchanged, and neither reaches the database: the authoritative
 * `verification_case` in `ENTITY-IMPLEMENTATION-MAP.md` has no field for
 * either, a reviewer reads both off the image they are shown, and §16 asks
 * for data minimisation rather than a second copy of a national ID number.
 * Historical `kyc_docs.doc_number` values are untouched — removing them is
 * M-15's, and it is irreversible.
 */
const logger = require("../utils/logger");
const router = require("express").Router();
const pool = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { validate, body } = require("../middleware/validate");
const cache = require("../utils/cache");
const platform = require("../src/modules/platform");
const { execute } = require("../src/application/execute");
const identity = require("../src/modules/identity");
const verificationRepo = identity.repositories.verification;

const { anonymousActor } = platform.authorization;
const { legacyActorFromUser } = platform.authorization.legacy;
const { requestIp, requestUserAgent } = platform.audit;

/** Unchanged: the same fields, the same messages, the same failures. */
const kycRules = validate([
  body("doc_type")
    .isIn(["nid", "passport", "birth_cert", "driving_license"])
    .withMessage("doc_type must be nid, passport, birth_cert, or driving_license"),
  body("doc_number")
    .trim().isLength({ min: 5 })
    .withMessage("doc_number must be at least 5 characters"),
  // Accept both legacy 'front_image' and current 'img_front' field names
  body("img_front")
    .if(body("front_image").not().exists())
    .notEmpty()
    .withMessage("img_front (base64) is required"),
  body("img_back").optional(),
  body("img_selfie").optional(),
]);

function contextFor(req) {
  return {
    actor: req.user
      ? legacyActorFromUser(req.user, { correlationId: req.requestId || null })
      : anonymousActor({ correlationId: req.requestId || null }),
    db: pool,
    repositories: identity.repositories,
    correlationId: req.requestId || null,
    ip: requestIp(req),
    userAgent: requestUserAgent(req),
    reason: (req.body && req.body.rejection_reason) || null,
  };
}

const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

/**
 * The legacy row shape, from the case.
 *
 * `doc_type` and `doc_number` come from the migrated `kyc_docs` row where
 * there is one and are null otherwise — a new submission does not store
 * them. The client displays these; nothing decides on them.
 */
const caseToLegacyRow = (row, legacy) => ({
  id: String(row.id),
  doc_type: legacy ? legacy.doc_type : null,
  doc_number: null,
  status: verificationRepo.LEGACY_STATUS[row.state] || "pending",
  rejection_reason: row.decision_reason,
  submitted_at: row.submitted_at,
  reviewed_at: row.decided_at,
  // New, additive. The legacy enum has three values and the machine has
  // seven, so a client that wants the real state can read this one.
  state: row.state,
});

// ── GET /api/kyc ──────────────────────────────────────────
//
// Still an array, because that is what the client destructures. One case per
// person, so it holds at most one element.
router.get("/", authMiddleware, handle(async (req, res) => {
  const view = await execute("identity.ReadOwnVerification", {}, contextFor(req));
  if (view.state === "not_submitted") return res.json([]);

  const row = await verificationRepo.findByPrincipal(pool, req.user.id, "identity");
  const legacy = row && row.legacy_kyc_id
    ? await verificationRepo.legacyDocumentPresence(pool, row.legacy_kyc_id)
    : null;
  res.json([caseToLegacyRow(row, legacy)]);
}));

// ── POST /api/kyc ─────────────────────────────────────────
router.post("/", authMiddleware, kycRules, handle(async (req, res) => {
  const front = req.body.img_front || req.body.front_image;
  const back = req.body.img_back || req.body.back_image || null;
  const selfie = req.body.img_selfie || req.body.selfie_image || null;

  if (!front) return res.status(400).json({ error: "Front image is required" });

  // The size ceiling that used to be three `if (x.length > MAX_IMG)` checks
  // is `sealedDocumentStore.MAX_DOCUMENT_BYTES`, applied to DECODED bytes so
  // a caller cannot get a larger object through by choosing an encoding.
  const out = await execute("identity.SubmitIdentityVerification", {
    documents: {
      id_front: { data: front },
      ...(back ? { id_back: { data: back } } : {}),
      ...(selfie ? { selfie: { data: selfie } } : {}),
    },
  }, contextFor(req));

  cache.del(`kyc:user:${req.user.id}`);
  cache.del(`user:profile:${req.user.id}`);

  // Best-effort, and outside the transaction on purpose: a notification that
  // fails must not roll back a submission the applicant was told succeeded.
  notifyReviewers(req.user).catch((err) => logger.warn("kyc notify failed", { err: err.message }));

  // The response the client already reads. `id` is the case id — for a
  // migrated record that is the same value the `kyc_docs` row had, so an
  // existing client holding an old id keeps working.
  res.status(201).json({ id: out.caseId, status: "pending", state: out.state });
}));

async function notifyReviewers(user) {
  const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!admins.length) return;
  await pool.query(
    "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
    [admins[0].id, "🛡️", "alert", "নতুন KYC আবেদন", "New KYC Application",
     `${user.name} নতুন KYC দাখিল করেছে`, `${user.name} submitted new KYC`]
  );
}

// ── PATCH /api/kyc/:id ────────────────────────────────────
//
// §21: this is NOT `UPDATE verification_case SET state = ?`. It maps the two
// legacy status values onto the use cases that own those transitions, and
// every guard those use cases carry applies — the state machine, the
// mandatory reason on a rejection, the `trust_safety`-only policy, the
// audit record that must commit with the decision.
//
// It also takes the case through `under_review` first, because the machine
// has no `submitted → verified` edge. The old endpoint jumped straight from
// pending to verified; that jump is now two recorded steps, which is the
// difference between "someone approved this" and "someone reviewed it and
// then approved it".
router.patch("/:id", authMiddleware, handle(async (req, res) => {
  const { status, rejection_reason } = req.body || {};
  if (!["verified", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const ctx = { ...contextFor(req), reason: rejection_reason || null };
  const caseId = req.params.id;

  // Claim the case first. `StartVerificationReview` authorizes on
  // `verification_case.start_review`, so an actor who may not decide is
  // refused HERE — before anything reads the case, and before the decision
  // use case is called at all.
  await claimForReview(caseId, ctx);

  const out = status === "verified"
    ? await execute("identity.ApproveVerification", { case_id: caseId }, ctx)
    : await execute("identity.RejectVerification", { case_id: caseId, reason: rejection_reason }, ctx);

  cache.del(`kyc:user:${out.subjectId}`);
  cache.del(`user:profile:${out.subjectId}`);

  notifySubject(out.subjectId, status, rejection_reason)
    .catch((err) => logger.warn("kyc decision notify failed", { err: err.message }));

  res.json({ success: true, status: verificationRepo.LEGACY_STATUS[out.state], state: out.state });
}));

/**
 * `submitted → under_review`, tolerating a case that is already there.
 *
 * The machine has no `submitted → verified` edge, so the legacy endpoint's
 * single jump becomes two recorded steps. A case a reviewer already claimed
 * refuses the first step with a transition conflict, and that is the one
 * error worth swallowing — every other failure, including a denial and a
 * missing case, belongs to the caller.
 */
async function claimForReview(caseId, ctx) {
  try {
    await execute("identity.StartVerificationReview", { case_id: caseId }, ctx);
  } catch (err) {
    if (err && err.code === "VERIFICATION_TRANSITION_INVALID") return;
    throw err;
  }
}

async function notifySubject(userId, status, reason) {
  const ok = status === "verified";
  await pool.query(
    "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
    [userId, ok ? "✅" : "❌", "alert",
     ok ? "KYC যাচাইকৃত" : "KYC প্রত্যাখ্যাত",
     ok ? "KYC Verified" : "KYC Rejected",
     ok ? "আপনার পরিচয় যাচাই সম্পন্ন!" : `প্রত্যাখ্যানের কারণ: ${reason || "N/A"}`,
     ok ? "Your identity has been verified!" : `Rejection reason: ${reason || "N/A"}`]
  );
}

module.exports = router;
