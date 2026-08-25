const logger = require('../utils/logger');
/**
 * File Upload Routes — IMAP Bangladesh
 * POST /api/upload/avatar   → Profile picture (auth required)
 * POST /api/upload/kyc      → KYC documents (auth required)
 * POST /api/upload/proof    → Booking proof image (auth required)
 * GET  /api/upload/status   → Check storage configuration
 */
const router  = require("express").Router();
const multer  = require("multer");
const { v4: uuidv4 } = require("uuid");
const pool    = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { requireAuthorization } = require("../middleware/authorize");
const { ACTION } = require("../src/modules/platform/authorization");
const storage = require("../utils/storage");
const cache = require("../utils/cache");
// I-07: KYC submission is a use case, not a route. This file supplies the
// multipart wire format and nothing else.
const { execute } = require("../src/application/execute");
const identity = require("../src/modules/identity");
const { legacyActorFromUser } = require("../src/modules/platform/authorization").legacy;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = ["image/jpeg","image/jpg","image/png","image/webp","application/pdf"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("শুধুমাত্র JPG, PNG, WEBP, PDF ফাইল গ্রহণযোগ্য।"));
    cb(null, true);
  },
});

router.get("/status", (req, res) => {
  res.json({
    configured: storage.isConfigured(),
    provider: process.env.R2_ACCOUNT_ID ? "cloudflare-r2" : process.env.AWS_ACCESS_KEY_ID ? "aws-s3" : "not-configured",
    note: storage.isConfigured() ? "Storage ready" : "Add R2_ACCOUNT_ID or AWS credentials to .env",
  });
});

/* ── Avatar upload ── */
router.post("/avatar", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "ফাইল প্রয়োজন।" });
    if (req.file.size > 2 * 1024 * 1024) return res.status(400).json({ error: "Avatar সর্বোচ্চ 2MB হতে পারে।" });

    if (storage.isConfigured()) {
      const { url } = await storage.uploadFile({ buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname, folder: "avatars" });
      await pool.query("UPDATE users SET avatar=? WHERE id=?", [url, req.user.id]);
      return res.json({ url, message: "প্রোফাইল ছবি আপডেট হয়েছে।" });
    }

    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    await pool.query("UPDATE users SET avatar=? WHERE id=?", [base64, req.user.id]);
    res.json({ url: base64, mock: true, note: "Cloud storage নেই — base64 dev mode" });
  } catch (err) {
    logger.error("upload-avatar:", err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

/* ── KYC document upload ── */
/**
 * POST /api/upload/kyc — the path the UI actually uses.
 *
 * WHAT IT USED TO DO, AND WHY THAT WAS THE WHOLE PROBLEM
 * ─────────────────────────────────────────────────────
 * It uploaded each file through `utils/storage.js`, which returns a
 * PERMANENT PUBLIC URL, and wrote that URL into `kyc_docs.front_image`.
 * Where storage was unconfigured it fell back to a `data:` URI — the same
 * multi-megabyte base64 in the primary database that Phase 0 named. Either
 * way it created no verification case, so a person who submitted through
 * the app could never be reviewed: the whole I-07 lifecycle was reachable
 * only from the JSON fallback the UI uses when this one fails.
 *
 * It now calls the same use case `/api/verification/identity` calls, so
 * there is ONE submission path with one set of controls — the sealed store,
 * the state machine, the audit record — and the wire format is the only
 * thing that differs between them.
 *
 * The response shape is unchanged, so the existing client is unaffected.
 */
router.post("/kyc", authMiddleware, upload.fields([
  { name: "nid_front", maxCount: 1 }, { name: "nid_back", maxCount: 1 },
  { name: "selfie", maxCount: 1 },    { name: "certificate", maxCount: 1 },
]), async (req, res, next) => {
  try {
    const files = req.files || {};
    // The field names the client sends, mapped to the document kinds the
    // domain knows. `certificate` is accepted by multer and deliberately not
    // forwarded: capability verification has no Gate-1 surface, and silently
    // filing a skill certificate under an identity case would be claiming a
    // review that nobody performs.
    const FIELDS = { nid_front: "id_front", nid_back: "id_back", selfie: "selfie" };

    const documents = {};
    for (const [field, docType] of Object.entries(FIELDS)) {
      const f = files[field] && files[field][0];
      if (!f) continue;
      documents[docType] = { buffer: f.buffer, mime: f.mimetype };
    }

    if (!Object.keys(documents).length) {
      return res.status(400).json({ error: "কোনো ফাইল পাওয়া যায়নি।" });
    }

    const out = await execute("identity.SubmitIdentityVerification", { documents }, {
      actor: legacyActorFromUser(req.user, { correlationId: req.requestId || null }),
      db: pool,
      repositories: identity.repositories,
      correlationId: req.requestId || null,
      ip: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
    });

    cache.del(`kyc:user:${req.user.id}`);
    cache.del(`user:profile:${req.user.id}`);

    // Best-effort and outside the use case: a notification that fails must
    // not roll back a submission the applicant was told succeeded.
    (async () => {
      const [admins] = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
      if (!admins.length) return;
      await pool.query(
        "INSERT INTO notifications (user_id,icon,type,title_bn,title_en,body_bn,body_en) VALUES (?,?,?,?,?,?,?)",
        [admins[0].id, "🛡️", "alert", "নতুন KYC আবেদন", "New KYC Application",
         `${req.user.name} নতুন KYC ফাইল আপলোড করেছে`, `${req.user.name} uploaded new KYC documents`]
      );
    })().catch((err) => logger.warn("kyc notify failed", { err: err.message }));

    res.json({
      uploaded: out.documents,
      case_id: out.caseId,
      state: out.state,
      // Echoed for wire compatibility. Neither is stored any more: the
      // authoritative verification_case has no field for either, and a
      // reviewer reads both off the image (I-07 §9).
      doc_type: req.body && req.body.doc_type,
      doc_number: undefined,
      message: "KYC ডকুমেন্ট আপলোড হয়েছে।",
    });
  } catch (err) {
    // AppErrors carry their own status and user message; the transport error
    // boundary maps them. Only a genuine failure becomes a 500.
    if (err && typeof err.status === "number") return next(err);
    logger.error("upload-kyc:", err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

/* ── Proof upload ── */
//
// THE OLD CHECK DID NOT WORK, AND SAID IT DID.
//
//   UPDATE bookings SET completion_proof=? WHERE id=? AND (customer_id=? OR ?='admin')
//
// The assigned PROVIDER is the person who takes a completion photo, and that
// clause excludes them: the update matched zero rows and the endpoint answered
// 200 with the uploaded URL. The provider saw success and the booking carried
// no proof. An unauthorized caller got exactly the same answer, so neither
// case was visible from outside.
//
// The kernel decides now, against the loaded booking, and the state condition
// on the policy refuses proof for a booking that never reached the work.
// multer runs first because booking_id arrives in the multipart body.
router.post("/proof", authMiddleware, upload.single("file"),
  requireAuthorization(ACTION.BOOKING_ATTACH_PROOF, {
    when: (req) => Boolean(req.body?.booking_id),
    resource: (req) => req.body.booking_id,
  }),
  async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "ফাইল প্রয়োজন।" });
    const { booking_id } = req.body;
    let url;
    if (storage.isConfigured()) {
      const r = await storage.uploadFile({ buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname, folder: "proof" });
      url = r.url;
    } else {
      url = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }
    if (booking_id) {
      await pool.query("UPDATE bookings SET completion_proof=? WHERE id=?", [url, booking_id]);
    }
    res.json({ url, message: "ছবি আপলোড হয়েছে।" });
  } catch (err) { logger.error("upload-proof:", err); res.status(500).json({ error: err.message || "Upload failed" }); }
});

/* ── Error handler ── */
router.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "ফাইল সর্বোচ্চ 5MB হতে পারে।" });
  res.status(400).json({ error: err.message });
});

module.exports = router;
