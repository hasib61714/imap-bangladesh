const logger = require('../utils/logger');
const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const pool   = require("../db");
const cache  = require("../utils/cache");
const { authMiddleware } = require("../middleware/auth");
const { sendPush } = require("../utils/push");
const { validate, body } = require("../middleware/validate");

const { computeBookingPrice } = require("../utils/pricing");

const createBookingRules = validate([
  body("provider_id").notEmpty().withMessage("provider_id required"),
  // NOTE: client-supplied amount/total_amount/platform_fee are IGNORED — price is
  // computed server-side. Validators below only constrain optional pricing INPUTS
  // and free-text field lengths.
  body("duration_hours").optional({ checkFalsy: true }).isFloat({ min: 1, max: 24 }).withMessage("duration_hours must be 1–24"),
  body("payment_method").optional().isIn(["bKash","Nagad","Rocket","card","cash","Cash","wallet"]).withMessage("Invalid payment method"),
  body("service_name_en").optional().isString().isLength({ max: 120 }).withMessage("service_name_en too long"),
  body("service_name_bn").optional().isString().isLength({ max: 120 }).withMessage("service_name_bn too long"),
  body("service_type").optional().isString().isLength({ max: 120 }).withMessage("service_type too long"),
  body("address").optional().isString().isLength({ max: 300 }).withMessage("address too long"),
  body("note").optional().isString().isLength({ max: 1000 }).withMessage("note too long"),
]);

// ── POST /api/bookings ────────────────────────────────────
// Price is server-authoritative. Money movement is atomic (single txn with
// SELECT ... FOR UPDATE) to prevent double-spend / partial writes.
router.post("/", authMiddleware, createBookingRules, async (req, res) => {
  const {
    provider_id, category_id,
    service_name_bn, service_name_en,
    service_type, // legacy field name
    address,
    scheduled_time, scheduled_at,
    payment_method = "bKash",
    is_urgent = 0, note = "",
    duration_hours, promo_code,
  } = req.body;

  const finalServiceEn = service_name_en || service_type || null;
  const finalServiceBn = service_name_bn || null;
  const finalScheduled = scheduled_time || scheduled_at || null;
  const isCash = String(payment_method).toLowerCase() === "cash";

  const conn = await pool.getConnection();
  let providerUserId = null;
  let id, otp, price;
  try {
    await conn.beginTransaction();

    // Server-side price authority (throws 404 if provider unknown)
    price = await computeBookingPrice(conn, {
      provider_id, category_id, duration_hours, is_urgent, promo_code,
    });
    const total = price.total;

    // Wallet payment → lock the row and verify funds inside the txn
    if (!isCash) {
      const [[u]] = await conn.query(
        "SELECT balance FROM users WHERE id = ? FOR UPDATE",
        [req.user.id]
      );
      if (!u) { await conn.rollback(); return res.status(404).json({ error: "User not found" }); }
      if (parseFloat(u.balance) < total) {
        await conn.rollback();
        return res.status(400).json({ error: "Insufficient wallet balance. Please top up first." });
      }
    }

    id  = uuidv4();
    otp = Math.floor(100000 + Math.random() * 900000).toString();

    await conn.query(
      `INSERT INTO bookings
        (id, customer_id, provider_id, category_id, service_name_bn, service_name_en,
         address, scheduled_time, amount, platform_fee, payment_method, is_urgent, otp_code, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.user.id, provider_id, category_id || null,
       finalServiceBn, finalServiceEn,
       address || null, finalScheduled,
       price.amount, price.platform_fee, payment_method,
       is_urgent ? 1 : 0, otp, note]
    );

    // Deduct from wallet ONLY for non-cash (cash is paid on delivery — no wallet debit)
    if (!isCash) {
      await conn.query("UPDATE users SET balance = balance - ? WHERE id = ?", [total, req.user.id]);
      await conn.query(
        "INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method, ref_id) VALUES (?,?,?,?,?,?,?)",
        [req.user.id, "debit", total, `সেবা বুকিং #${id.slice(0,8)}`, `Service Booking #${id.slice(0,8)}`, payment_method, id]
      );
    }

    // Notify provider
    const [prov] = await conn.query("SELECT user_id FROM providers WHERE id = ?", [provider_id]);
    if (prov.length) {
      providerUserId = prov[0].user_id;
      await conn.query(
        "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
        [providerUserId, "💼", "booking", "নতুন বুকিং", "New Booking",
         `${req.user.name} সেবা বুক করেছে`, `${req.user.name} booked a service`]
      );
    }

    // Award loyalty points on the authoritative amount
    const pts = Math.floor(price.amount / 100);
    if (pts > 0) {
      await conn.query("UPDATE users SET points = points + ? WHERE id = ?", [pts, req.user.id]);
      await conn.query(
        "INSERT INTO loyalty_log (user_id, points, reason_bn, reason_en, booking_id) VALUES (?,?,?,?,?)",
        [req.user.id, pts, "বুকিং পয়েন্ট", "Booking points", id]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    if (err.status === 404) return res.status(404).json({ error: err.message });
    logger.error("create booking:", err);
    return res.status(500).json({ error: "Server error" });
  }
  conn.release();

  // Cache busting (post-commit; safe to do outside the txn)
  cache.del("admin:stats");
  cache.del("admin:revenue");
  cache.del("admin:bookings:default");
  cache.delPattern(new RegExp(`^bookings:user:${req.user.id}:`));
  cache.del(`user:wallet:${req.user.id}`);
  cache.del(`user:loyalty:${req.user.id}`);
  cache.del(`user:profile:${req.user.id}`);
  if (providerUserId) cache.del(`provider:jobs:${providerUserId}`);

  res.status(201).json({
    id, otp, status: "pending", message: "Booking created",
    amount: price.amount, platform_fee: price.platform_fee, total: price.total,
  });
});

// ── GET /api/bookings  (my bookings) ─────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const cacheKey = `bookings:user:${req.user.id}:${status||'all'}:${page}:${limit}`;
    const result = await cache.getOrSet(cacheKey, async () => {
      const offset = (parseInt(page) - 1) * parseInt(limit);

      let where = ["b.customer_id = ?"];
      let params = [req.user.id];

      if (status && status !== "all") {
        where.push("b.status = ?");
        params.push(status);
      }

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM bookings b WHERE ${where.join(" AND ")}`,
        params
      );

      const [rows] = await pool.query(
        `SELECT b.*, u.name AS provider_name, u.avatar AS provider_avatar, u.phone AS provider_phone
         FROM bookings b
         LEFT JOIN providers p ON p.id = b.provider_id
         LEFT JOIN users u ON u.id = p.user_id
         WHERE ${where.join(" AND ")}
         ORDER BY b.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset]
      );
      return { bookings: rows, total, page: parseInt(page), limit: parseInt(limit) };
    }, 30);
    res.json(result);
  } catch (err) {
    logger.error("my bookings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/bookings/:id ─────────────────────────────────
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, u.name AS provider_name, u.avatar AS provider_avatar, u.phone AS provider_phone
       FROM bookings b
       LEFT JOIN providers p ON p.id = b.provider_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE b.id = ? AND b.customer_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Booking not found" });
    res.json(rows[0]);
  } catch (err) {
    logger.error("booking detail:", err);
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

    // Status-based notifications
    const pushMessages = {
      confirmed:  { title: "✅ বুকিং নিশ্চিত",   body: "আপনার বুকিং নিশ্চিত হয়েছে।" },
      active:     { title: "🔄 সেবা শুরু হয়েছে",  body: "সেবা প্রদানকারী কাজ শুরু করেছেন।" },
      completed:  { title: "🎉 সেবা সম্পন্ন",   body: "আপনার সেবা সম্পন্ন হয়েছে। রিভিউ দিন!" },
      cancelled:  { title: "❌ বুকিং বাতিল",   body: "আপনার বুকিং বাতিল করা হয়েছে।" },
    };
    const pushMsg = pushMessages[status];
    if (pushMsg) {
      // Push to customer
      sendPush(booking.customer_id, { ...pushMsg, url: "/" }).catch(() => {});
      // Insert DB notification
      await pool.query(
        "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
        [booking.customer_id, pushMsg.title.slice(0,2), "booking",
         pushMsg.title, pushMsg.title, pushMsg.body, pushMsg.body]
      ).catch(() => {});
    }

    // On complete — update provider stats + credit earnings
    if (status === "completed") {
      await pool.query(
        "UPDATE providers SET total_jobs = total_jobs + 1 WHERE id = ?",
        [booking.provider_id]
      );
      // Credit provider wallet (amount minus platform fee)
      if (prov.length) {
        const earnings = parseFloat(booking.amount) - parseFloat(booking.platform_fee || 0);
        if (earnings > 0) {
          await pool.query(
            "UPDATE users SET balance = balance + ? WHERE id = ?",
            [earnings, prov[0].user_id]
          );
          await pool.query(
            "INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method) VALUES (?,?,?,?,?,?)",
            [prov[0].user_id, "credit", earnings,
             `সেবা সম্পন্ন - বুকিং #${req.params.id.slice(0,8)}`,
             `Service completed - Booking #${req.params.id.slice(0,8)}`, "wallet"]
          );
        }
      }
      cache.del("admin:stats");
      cache.del("admin:revenue");
      cache.del("admin:bookings:default");
      if (prov.length) cache.del(`provider:jobs:${prov[0].user_id}`);
      if (prov.length) cache.del(`user:wallet:${prov[0].user_id}`); // bust provider wallet after earnings credit
      if (prov.length) cache.del(`user:profile:${prov[0].user_id}`); // bust provider profile (balance changed)
      cache.delPattern(new RegExp(`^bookings:user:${booking.customer_id}:`));
      // Notify via socket too
      if (io) {
        io.emit(`user_${booking.customer_id}`, {
          type: "notification",
          title: "সেবা সম্পন্ন ✅",
          body: "আপনার সেবা সম্পন্ন হয়েছে।",
        });
      }
    }

    // On cancellation — refund customer if booking not yet active
    if (status === "cancelled" && ["pending", "confirmed"].includes(booking.status)) {
      const refundAmt = parseFloat(booking.amount) + parseFloat(booking.platform_fee || 0);
      await pool.query(
        "UPDATE users SET balance = balance + ? WHERE id = ?",
        [refundAmt, booking.customer_id]
      );
      await pool.query(
        "INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method) VALUES (?,?,?,?,?,?)",
        [booking.customer_id, "credit", refundAmt,
         `বুকিং বাতিল রিফান্ড #${req.params.id.slice(0,8)}`,
         `Booking cancellation refund #${req.params.id.slice(0,8)}`, "refund"]
      );
      cache.del("admin:stats");
      cache.del("admin:revenue");
      cache.del("admin:bookings:default");
      if (prov.length) cache.del(`provider:jobs:${prov[0].user_id}`);
      cache.del(`user:wallet:${booking.customer_id}`); // bust customer wallet after cancellation refund
      cache.del(`user:profile:${booking.customer_id}`); // bust customer profile (balance changed)
      cache.delPattern(new RegExp(`^bookings:user:${booking.customer_id}:`));
      // Socket-notify provider so their jobs view updates immediately
      if (io && prov.length) {
        io.emit(`user_${prov[0].user_id}`, {
          type: "notification",
          title: "❌ বুকিং বাতিল",
          body: "একটি বুকিং বাতিল হয়েছে।",
        });
      }
    }

    res.json({ success: true, status });
  } catch (err) {
    logger.error("update booking status:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
