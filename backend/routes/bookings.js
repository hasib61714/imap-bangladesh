const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const pool   = require("../db");
const { authMiddleware } = require("../middleware/auth");

// ── POST /api/bookings ────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      provider_id, category_id,
      service_name_bn, service_name_en,
      address, scheduled_time,
      amount, platform_fee = 0,
      payment_method = "bKash",
      is_urgent = 0, note = ""
    } = req.body;

    if (!amount) return res.status(400).json({ error: "amount required" });

    const id     = uuidv4();
    const otp    = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      `INSERT INTO bookings
        (id, customer_id, provider_id, category_id, service_name_bn, service_name_en,
         address, scheduled_time, amount, platform_fee, payment_method, is_urgent, otp_code, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.user.id, provider_id, category_id || null,
       service_name_bn || null, service_name_en || null,
       address || null, scheduled_time || null,
       amount, platform_fee, payment_method,
       is_urgent ? 1 : 0, otp, note]
    );

    // Deduct from balance
    const total = parseFloat(amount) + parseFloat(platform_fee);
    await pool.query("UPDATE users SET balance = balance - ? WHERE id = ?", [total, req.user.id]);

    // Add wallet transaction
    await pool.query(
      "INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method) VALUES (?,?,?,?,?,?)",
      [req.user.id, "debit", total, `সেবা বুকিং #${id.slice(0,8)}`, `Service Booking #${id.slice(0,8)}`, payment_method]
    );

    // Notify provider
    const [prov] = await pool.query("SELECT user_id FROM providers WHERE id = ?", [provider_id]);
    if (prov.length) {
      await pool.query(
        "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
        [prov[0].user_id, "💼", "booking", "নতুন বুকিং", "New Booking",
         `${req.user.name} সেবা বুক করেছে`, `${req.user.name} booked a service`]
      );
    }

    // Award loyalty points
    const pts = Math.floor(parseFloat(amount) / 100);
    if (pts > 0) {
      await pool.query("UPDATE users SET points = points + ? WHERE id = ?", [pts, req.user.id]);
      await pool.query(
        "INSERT INTO loyalty_log (user_id, points, reason_bn, reason_en, booking_id) VALUES (?,?,?,?,?)",
        [req.user.id, pts, "বুকিং পয়েন্ট", "Booking points", id]
      );
    }

    res.status(201).json({ id, otp, status: "pending", message: "Booking created" });
  } catch (err) {
    console.error("create booking:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/bookings  (my bookings) ─────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ["b.customer_id = ?"];
    let params = [req.user.id];

    if (status && status !== "all") {
      where.push("b.status = ?");
      params.push(status);
    }

    const [rows] = await pool.query(
      `SELECT b.*, u.name AS provider_name, u.avatar AS provider_avatar, u.phone AS provider_phone
       FROM bookings b
       JOIN providers p ON p.id = b.provider_id
       JOIN users u ON u.id = p.user_id
       WHERE ${where.join(" AND ")}
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json(rows);
  } catch (err) {
    console.error("my bookings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/bookings/:id ─────────────────────────────────
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, u.name AS provider_name, u.avatar AS provider_avatar, u.phone AS provider_phone
       FROM bookings b
       JOIN providers p ON p.id = b.provider_id
       JOIN users u ON u.id = p.user_id
       WHERE b.id = ? AND b.customer_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Booking not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("booking detail:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/bookings/:id/status ───────────────────────
router.patch("/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["pending","confirmed","active","completed","cancelled"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const [rows] = await pool.query("SELECT * FROM bookings WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Booking not found" });

    const booking = rows[0];
    // customers can cancel; providers confirm/complete
    const isCustomer = booking.customer_id === req.user.id;
    const [prov]     = await pool.query("SELECT user_id FROM providers WHERE id = ?", [booking.provider_id]);
    const isProvider = prov.length && prov[0].user_id === req.user.id;
    const isAdmin    = req.user.role === "admin";

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    await pool.query("UPDATE bookings SET status = ? WHERE id = ?", [status, req.params.id]);

    // ✅ Emit real-time booking update via Socket.io
    const io = req.app.get("io");
    if (io) {
      io.to(`booking_${req.params.id}`).emit("booking_updated", {
        bookingId: req.params.id,
        status,
        updatedAt: new Date().toISOString(),
      });
    }

    // On complete — update provider stats, notify customer
    if (status === "completed") {
      await pool.query(
        "UPDATE providers SET total_jobs = total_jobs + 1 WHERE id = ?",
        [booking.provider_id]
      );
      // Notify customer
      await pool.query(
        "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
        [booking.customer_id, "✅", "booking", "সেবা সম্পন্ন", "Service Completed",
         "আপনার সেবা সম্পন্ন হয়েছে। রিভিউ দিন।", "Your service is complete. Please rate."]
      );
      // Notify via socket too
      if (io) {
        io.emit(`user_${booking.customer_id}`, {
          type: "notification",
          title: "সেবা সম্পন্ন ✅",
          body: "আপনার সেবা সম্পন্ন হয়েছে।",
        });
      }
    }

    res.json({ success: true, status });
  } catch (err) {
    console.error("update booking status:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
