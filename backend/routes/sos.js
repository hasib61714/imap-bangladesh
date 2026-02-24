const logger = require('../utils/logger');
const router  = require("express").Router();
const pool    = require("../db");
const { authMiddleware, requireRole } = require("../middleware/auth");
const cache = require('../utils/cache');

/* ── POST /api/sos  — Submit an SOS alert (auth required) ── */
router.post("/", authMiddleware, async (req, res) => {
  const { type, description, booking_id, lat, lng } = req.body;

  const validTypes = ["harassment","fraud","unsafe","emergency","other"];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: "Valid type required: " + validTypes.join(", ") });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO sos_alerts (user_id, type, description, booking_id, lat, lng, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', NOW())`,
      [req.user.id, type, description || null, booking_id || null, lat || null, lng || null]
    );

    const alertId = result.insertId;

    // Emit to admin room via socket.io
    const io = req.app.get("io");
    if (io) {
      io.emit("sos_alert", {
        id: alertId,
        user_id:   req.user.id,
        user_name: req.user.name,
        user_phone:req.user.phone,
        type,
        description: description || "",
        booking_id: booking_id || null,
        lat, lng,
        created_at: new Date().toISOString(),
      });
    }

    res.json({ ok: true, alert_id: alertId, message: "SOS alert sent to admin & call center." });
  } catch (err) {
    logger.error("SOS error:", err);
    res.status(500).json({ error: "Failed to send SOS alert" });
  }
});

/* ── GET /api/sos  — List alerts (admin only) ── */
router.get("/", authMiddleware, requireRole("admin"), async (req, res) => {
  const { status, limit = 50 } = req.query;
  try {
    const cacheKey = `sos:admin:${status || 'all'}`;
    const alerts = await cache.getOrSet(cacheKey, async () => {
      const [rows] = await pool.query(
        `SELECT s.*, u.name AS user_name, u.phone AS user_phone, u.email AS user_email,
                b.id AS booking_ref
         FROM sos_alerts s
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN bookings b ON b.id = s.booking_id
         ${status ? "WHERE s.status = ?" : ""}
         ORDER BY s.created_at DESC
         LIMIT ?`,
        status ? [status, Number(limit)] : [Number(limit)]
      );
      return rows;
    }, 20);
    res.json({ alerts });
  } catch (err) {
    logger.error("SOS list error:", err);
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

/* ── PATCH /api/sos/:id  — Update status (admin only) ── */
router.patch("/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  const { status, admin_note } = req.body;
  const validStatus = ["open","in_progress","resolved","dismissed"];
  if (!validStatus.includes(status)) {
    return res.status(400).json({ error: "Valid status: " + validStatus.join(", ") });
  }
  try {
    await pool.query(
      "UPDATE sos_alerts SET status=?, admin_note=?, updated_at=NOW() WHERE id=?",
      [status, admin_note || null, req.params.id]
    );
    // Bust all sos admin cache keys since status filter variations are cached separately
    ['open','in_progress','resolved','dismissed','all'].forEach(s => cache.del(`sos:admin:${s}`));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

module.exports = router;
