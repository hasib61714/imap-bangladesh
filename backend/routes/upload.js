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
const storage = require("../utils/storage");
const { normalizeDocType } = require("../config/kyc");
const { assertAllowedUpload } = require("../utils/fileType");

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

// Record object-storage metadata (object_key, cdn_url, mime_type, size).
// Best-effort — never blocks the upload response.
async function recordMedia(owner_id, kind, { key, url, mimetype, size }) {
  try {
    await pool.query(
      "INSERT INTO media_assets (id, owner_id, kind, object_key, cdn_url, mime_type, size) VALUES (?,?,?,?,?,?,?)",
      [uuidv4(), owner_id, kind, key, url || null, mimetype || null, size || null]
    );
  } catch (e) { logger.warn("media_assets record:", e.message); }
}

/* ── Avatar upload ── */
router.post("/avatar", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "ফাইল প্রয়োজন।" });
    if (req.file.size > 2 * 1024 * 1024) return res.status(400).json({ error: "Avatar সর্বোচ্চ 2MB হতে পারে।" });
    const mime = assertAllowedUpload(req.file); // trust bytes, not client Content-Type

    if (storage.isConfigured()) {
      const { key, url } = await storage.uploadFile({ buffer: req.file.buffer, mimetype: mime, originalname: req.file.originalname, folder: "avatars" });
      await pool.query("UPDATE users SET avatar=? WHERE id=?", [url, req.user.id]);
      await recordMedia(req.user.id, "avatar", { key, url, mimetype: mime, size: req.file.size });
      return res.json({ url, message: "প্রোফাইল ছবি আপডেট হয়েছে।" });
    }

    const base64 = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
    await pool.query("UPDATE users SET avatar=? WHERE id=?", [base64, req.user.id]);
    res.json({ url: base64, mock: true, note: "Cloud storage নেই — base64 dev mode" });
  } catch (err) {
    logger.error("upload-avatar:", err);
    res.status(err.status || 500).json({ error: err.message || "Upload failed" });
  }
});

/* ── KYC document upload ── */
router.post("/kyc", authMiddleware, upload.fields([
  { name: "nid_front", maxCount: 1 }, { name: "nid_back", maxCount: 1 },
  { name: "selfie", maxCount: 1 },    { name: "certificate", maxCount: 1 },
]), async (req, res) => {
  try {
    const files  = req.files || {};
    const colMap = { nid_front: "front_image", nid_back: "back_image", selfie: "selfie_image", certificate: "certificate_image" };
    const results = {};

    for (const [field, col] of Object.entries(colMap)) {
      if (!files[field]?.[0]) continue;
      const f = files[field][0];
      const fMime = assertAllowedUpload(f); // trust bytes, not client Content-Type
      let url;
      if (storage.isConfigured()) {
        const up = await storage.uploadFile({ buffer: f.buffer, mimetype: fMime, originalname: f.originalname, folder: `kyc/${req.user.id}` });
        url = up.url;
        await recordMedia(req.user.id, "kyc", { key: up.key, url: up.url, mimetype: fMime, size: f.size });
      } else {
        url = `data:${fMime};base64,${f.buffer.toString("base64")}`;
      }
      results[col] = url;
    }

    if (!Object.keys(results).length) return res.status(400).json({ error: "কোনো ফাইল পাওয়া যায়নি।" });

    const doc_type   = normalizeDocType(req.body?.doc_type) || "nid";
    const doc_number = (req.body?.doc_number || "").slice(0, 30);

    const [existing] = await pool.query("SELECT id FROM kyc_docs WHERE user_id=?", [req.user.id]);
    if (existing.length) {
      const set = [...Object.keys(results).map(k => `${k}=?`), "doc_type=?", "doc_number=?", "status='pending'"].join(", ");
      await pool.query(
        `UPDATE kyc_docs SET ${set}, submitted_at=NOW() WHERE user_id=?`,
        [...Object.values(results), doc_type, doc_number, req.user.id]
      );
    } else {
      const cols = ["id","user_id","doc_type","doc_number",...Object.keys(results),"status"];
      const vals = [uuidv4(), req.user.id, doc_type, doc_number, ...Object.values(results), "pending"];
      await pool.query(`INSERT INTO kyc_docs (${cols.join(",")}) VALUES (${cols.map(()=>"?").join(",")})`, vals);
    }

    // Update user kyc_status and notify admin
    await pool.query("UPDATE users SET kyc_status='pending' WHERE id=? AND kyc_status='not_submitted'", [req.user.id]);
    try {
      const [admins] = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
      if (admins.length) {
        await pool.query(
          "INSERT INTO notifications (user_id,icon,type,title_bn,title_en,body_bn,body_en) VALUES (?,?,?,?,?,?,?)",
          [admins[0].id,"🛡️","alert","নতুন KYC আবেদন","New KYC Application",
           `${req.user.name} নতুন KYC ফাইল আপলোড করেছে`,`${req.user.name} uploaded new KYC documents`]
        );
      }
    } catch {}

    res.json({ uploaded: Object.keys(results), doc_type, doc_number, message: "KYC ডকুমেন্ট আপলোড হয়েছে।" });
  } catch (err) {
    logger.error("upload-kyc:", err);
    res.status(err.status || 500).json({ error: err.message || "Upload failed" });
  }
});

/* ── Proof upload ── */
router.post("/proof", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "ফাইল প্রয়োজন।" });
    const mime = assertAllowedUpload(req.file); // trust bytes, not client Content-Type
    const { booking_id } = req.body;
    let url;
    if (storage.isConfigured()) {
      const r = await storage.uploadFile({ buffer: req.file.buffer, mimetype: mime, originalname: req.file.originalname, folder: "proof" });
      url = r.url;
      await recordMedia(req.user.id, "proof", { key: r.key, url: r.url, mimetype: mime, size: req.file.size });
    } else {
      url = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
    }
    if (booking_id) await pool.query("UPDATE bookings SET completion_proof=? WHERE id=? AND (customer_id=? OR ?='admin')", [url, booking_id, req.user.id, req.user.role]);
    res.json({ url, message: "ছবি আপলোড হয়েছে।" });
  } catch (err) { logger.error("upload-proof:", err); res.status(err.status || 500).json({ error: err.message || "Upload failed" }); }
});

/* ── Error handler ── */
router.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "ফাইল সর্বোচ্চ 5MB হতে পারে।" });
  res.status(400).json({ error: err.message });
});

module.exports = router;
