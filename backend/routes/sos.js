const logger = require('../utils/logger');
const router  = require("express").Router();
const pool    = require("../db");
const { authMiddleware } = require("../middleware/auth");
// I-04: the emergency queue is `emergency_responder` — a role that reaches
// nothing in marketplace or finance, and that nothing there reaches.
const { requireAuthorization } = require("../middleware/authorize");
const { ACTION } = require("../src/modules/platform/authorization");
const cache = require('../utils/cache');

/* ── POST /api/sos  — Submit an SOS alert (auth required) ── */
router.post("/", authMiddleware, async (req, res) => {
  const { type, description, booking_id, lat, lng } = req.body;

  const validTypes = ["harassment","fraud","unsafe","emergency","other"];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: "Valid type required: " + validTypes.join(", ") });
  }
  if (description && description.length > 1000) {
    return res.status(400).json({ error: "description max 1000 chars" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO sos_alerts (user_id, type, description, booking_id, lat, lng, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', NOW())`,
      [req.user.id, type, description || null, booking_id || null, lat || null, lng || null]
    );

    const alertId = result.insertId;

    // ── P0-8: this used io.emit(), which delivers to EVERY connected
    // socket — including unauthenticated guests. The victim's name, phone
    // number, GPS position and the nature of their emergency were
    // broadcast to anyone with the page open. It now goes to the verified
    // administrator room only.
    const io = req.app.get("io");
    const adminRoom = req.app.get("adminRoom") || "role:admin";
    let notifiedAdmins = 0;
    if (io) {
      try {
        const room = io.sockets.adapter.rooms.get(adminRoom);
        notifiedAdmins = room ? room.size : 0;
      } catch { notifiedAdmins = 0; }
      io.to(adminRoom).emit("sos_alert", {
        id: alertId,
        user_id:    req.user.id,
        user_name:  req.user.name,
        user_phone: req.user.phone,
        type,
        description: description || "",
        booking_id: booking_id || null,
        lat, lng,
        created_at: new Date().toISOString(),
      });
    }

    // ── P0-10 / truthfulness: the response used to claim the alert had
    // been "sent to admin & call center". No call-centre integration
    // exists. The response now states exactly what happened.
    const dispatchConfigured = false; // no emergency dispatch integration exists yet
    res.json({
      ok: true,
      alert_id: alertId,
      recorded: true,
      admins_online: notifiedAdmins,
      dispatch: dispatchConfigured ? "dispatched" : "unavailable",
      message: notifiedAdmins > 0
        ? "Emergency request recorded and sent to the on-duty admin team."
        : "Emergency request recorded. No admin is currently online — if you are in immediate danger call 999.",
      message_bn: notifiedAdmins > 0
        ? "জরুরি অনুরোধ রেকর্ড করা হয়েছে এবং দায়িত্বরত অ্যাডমিন টিমকে পাঠানো হয়েছে।"
        : "জরুরি অনুরোধ রেকর্ড করা হয়েছে। এই মুহূর্তে কোনো অ্যাডমিন অনলাইনে নেই — তাৎক্ষণিক বিপদে ৯৯৯ নম্বরে কল করুন।",
    });
  } catch (err) {
    logger.error("SOS error:", err);
    res.status(500).json({ error: "Failed to send SOS alert" });
  }
});

/* ── GET /api/sos  — List alerts (admin only) ── */
router.get("/", authMiddleware, requireAuthorization(ACTION.EMERGENCY_LIST), async (req, res) => {
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
router.patch("/:id", authMiddleware,
  requireAuthorization(ACTION.EMERGENCY_UPDATE, { resource: (req) => req.params.id }), async (req, res) => {
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
