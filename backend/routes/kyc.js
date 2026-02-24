const logger = require('../utils/logger');
const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const pool   = require("../db");
const { authMiddleware } = require("../middleware/auth");

// ── GET /api/kyc ──────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, doc_type, doc_number, status, rejection_reason, submitted_at, reviewed_at FROM kyc_docs WHERE user_id = ? ORDER BY submitted_at DESC",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    logger.error("kyc get:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/kyc ─────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { doc_type, doc_number, front_image, back_image, selfie_image } = req.body;
    if (!doc_type || !doc_number) return res.status(400).json({ error: "doc_type and doc_number required" });
    if (!front_image) return res.status(400).json({ error: "Front image required" });

    // Remove previous for same type
    await pool.query("DELETE FROM kyc_docs WHERE user_id = ? AND doc_type = ?", [req.user.id, doc_type]);

    const id = uuidv4();
    await pool.query(
      `INSERT INTO kyc_docs (id, user_id, doc_type, doc_number, front_image, back_image, selfie_image)
       VALUES (?,?,?,?,?,?,?)`,
      [id, req.user.id, doc_type, doc_number, front_image, back_image || null, selfie_image || null]
    );

    // Update user kyc_status to pending
    await pool.query(
      "UPDATE users SET kyc_status = 'pending' WHERE id = ? AND kyc_status = 'not_submitted'",
      [req.user.id]
    );

    // Notify admin (system notification)
    const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (admins.length) {
      await pool.query(
        "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
        [admins[0].id, "🛡️", "alert", "নতুন KYC আবেদন", "New KYC Application",
         `${req.user.name} নতুন KYC দাখিল করেছে`, `${req.user.name} submitted new KYC`]
      );
    }

    res.status(201).json({ id, status: "pending" });
  } catch (err) {
    logger.error("kyc submit:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/kyc/:id  (admin only) ─────────────────────
router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
    const { status, rejection_reason } = req.body;
    if (!["verified","rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });

    const [rows] = await pool.query("SELECT * FROM kyc_docs WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "KYC doc not found" });
    const doc = rows[0];

    await pool.query(
      "UPDATE kyc_docs SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
      [status, rejection_reason || null, req.user.id, req.params.id]
    );

    // Update user kyc_status
    const [allDocs] = await pool.query("SELECT status FROM kyc_docs WHERE user_id = ?", [doc.user_id]);
    const overallStatus = allDocs.some(d => d.status === "verified") ? "verified"
      : allDocs.some(d => d.status === "pending") ? "pending" : "rejected";
    await pool.query("UPDATE users SET kyc_status = ?, verified = ? WHERE id = ?",
      [overallStatus, overallStatus === "verified" ? 1 : 0, doc.user_id]);

    // Also update provider nid_verified
    if (doc.doc_type === "nid" && status === "verified") {
      await pool.query("UPDATE providers SET nid_verified = 1, trust_score = LEAST(trust_score + 30, 100) WHERE user_id = ?", [doc.user_id]);
    }

    // Notify user
    await pool.query(
      "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
      [doc.user_id, status === "verified" ? "✅" : "❌", "alert",
       status === "verified" ? "KYC যাচাইকৃত" : "KYC প্রত্যাখ্যাত",
       status === "verified" ? "KYC Verified" : "KYC Rejected",
       status === "verified" ? "আপনার পরিচয় যাচাই সম্পন্ড!" : `প্রত্যাখ্যানের কারণ: ${rejection_reason || "N/A"}`,
       status === "verified" ? "Your identity has been verified!" : `Rejection reason: ${rejection_reason || "N/A"}`]
    );

    res.json({ success: true, status: overallStatus });
  } catch (err) {
    logger.error("kyc review:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
