const router = require("express").Router();
const pool   = require("../db");
const { authMiddleware } = require("../middleware/auth");

// ── POST /api/reviews ─────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { booking_id, rating, comment, tags } = req.body;
    if (!booking_id || !rating) return res.status(400).json({ error: "booking_id and rating required" });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: "Rating must be 1-5" });

    const [bookings] = await pool.query(
      "SELECT * FROM bookings WHERE id = ? AND customer_id = ? AND status = 'completed'",
      [booking_id, req.user.id]
    );
    if (!bookings.length) return res.status(403).json({ error: "Booking not found or not completed" });

    const booking = bookings[0];
    if (booking.rated) return res.status(409).json({ error: "Already rated" });

    await pool.query(
      "INSERT INTO reviews (booking_id, customer_id, provider_id, rating, comment, tags) VALUES (?,?,?,?,?,?)",
      [booking_id, req.user.id, booking.provider_id, rating, comment || null, tags || null]
    );

    await pool.query("UPDATE bookings SET rated = 1 WHERE id = ?", [booking_id]);

    // Recalculate provider avg rating
    const [avg] = await pool.query(
      "SELECT AVG(rating) AS avg FROM reviews WHERE provider_id = ?",
      [booking.provider_id]
    );
    await pool.query(
      "UPDATE providers SET rating = ? WHERE id = ?",
      [parseFloat(avg[0].avg).toFixed(2), booking.provider_id]
    );

    // Notify provider
    const [prov] = await pool.query("SELECT user_id FROM providers WHERE id = ?", [booking.provider_id]);
    if (prov.length) {
      await pool.query(
        "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
        [prov[0].user_id, "⭐", "booking", "নতুন রিভিউ", "New Review",
         `${req.user.name} আপনাকে ${rating} তারা দিয়েছে`, `${req.user.name} gave you ${rating} stars`]
      );
    }

    res.status(201).json({ success: true });
  } catch (err) {
    console.error("review create:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/reviews/provider/:id ────────────────────────
router.get("/provider/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, u.name AS customer_name, u.avatar AS customer_avatar
       FROM reviews r JOIN users u ON u.id = r.customer_id
       WHERE r.provider_id = ? ORDER BY r.created_at DESC`,
      [req.params.id]
    );
    const avg = rows.length ? rows.reduce((a, r) => a + r.rating, 0) / rows.length : 0;
    res.json({ reviews: rows, avg: parseFloat(avg.toFixed(2)), total: rows.length });
  } catch (err) {
    console.error("provider reviews:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
