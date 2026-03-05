const logger = require('../utils/logger');
const cache  = require('../utils/cache');
/**
 * Payment Routes — IMAP Bangladesh
 * POST   /api/payments/initiate  → Start payment session (auth required)
 * POST   /api/payments/ipn       → SSLCommerz IPN callback
 * POST   /api/payments/success   → Redirect after success
 * POST   /api/payments/fail      → Redirect after fail
 * POST   /api/payments/cancel    → Redirect after cancel
 * GET    /api/payments           → My payment history
 * GET    /api/payments/admin/all → All payments (admin only)
 * GET    /api/payments/:id       → Single payment detail
 */
const router          = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const pool            = require("../db");
const { authMiddleware, requireRole } = require("../middleware/auth");
const payment         = require("../utils/payment");

const FE = () => process.env.FRONTEND_APP_URL || process.env.FRONTEND_URL || "https://hasib61714.github.io/imap-bangladesh";

/* ── POST /api/payments/initiate ── */
router.post("/initiate", authMiddleware, async (req, res) => {
  try {
    const { booking_id, topup_amount, type = "booking", payment_method = "sslcommerz" } = req.body;

    let totalAmount, payId, customerInfo, productInfo;

    if (type === "wallet_topup") {
      // ── Wallet top-up: no booking needed ──
      const amt = parseFloat(topup_amount);
      if (!amt || amt < 10 || amt > 100000)
        return res.status(400).json({ error: "Top-up amount must be ৳10–৳1,00,000" });

      payId = uuidv4();
      totalAmount = amt;
      await pool.query(
        "INSERT INTO payments (id, booking_id, user_id, amount, method, status, gateway_tran_id) VALUES (?,NULL,?,?,?,'pending',?)",
        [payId, req.user.id, totalAmount, payment_method, payId]
      );
      customerInfo = { name: req.user.name, email: req.user.email || "noemail@imap.app", phone: req.user.phone || "01700000000", address: "Dhaka, Bangladesh" };
      productInfo  = { name: "Wallet Top-up", category: "Wallet" };

    } else {
      // ── Booking payment ──
      if (!booking_id) return res.status(400).json({ error: "booking_id required" });

      const [brows] = await pool.query(
        "SELECT b.*, u.name AS cus_name, u.email AS cus_email, u.phone AS cus_phone FROM bookings b LEFT JOIN users u ON u.id = b.customer_id WHERE b.id = ? AND b.customer_id = ?",
        [booking_id, req.user.id]
      );
      if (!brows.length) return res.status(404).json({ error: "Booking not found" });

      const booking = brows[0];
      totalAmount   = parseFloat(booking.amount) + parseFloat(booking.platform_fee || 0);
      payId         = uuidv4();
      await pool.query(
        "INSERT INTO payments (id, booking_id, user_id, amount, method, status, gateway_tran_id) VALUES (?,?,?,?,?,'pending',?)",
        [payId, booking_id, req.user.id, totalAmount, payment_method, payId]
      );
      customerInfo = { name: booking.cus_name, email: booking.cus_email, phone: booking.cus_phone, address: booking.address || "Dhaka, Bangladesh" };
      productInfo  = { name: booking.service_name_en || "IMAP Service", category: "Home Service" };
    }

    if (payment.isConfigured()) {
      const resp = await payment.initiatePayment({
        orderId: payId, amount: totalAmount,
        customer: customerInfo,
        product:  productInfo,
      });
      if (resp?.GatewayPageURL) {
        await pool.query("UPDATE payments SET gateway_session_key = ? WHERE id = ?", [resp.sessionkey, payId]);
        return res.json({ url: resp.GatewayPageURL, paymentId: payId });
      }
      return res.status(500).json({ error: "Payment gateway error. Try again." });
    }

    // Mock (dev mode)
    await pool.query("UPDATE payments SET status='success', gateway_val_id=?, paid_at=NOW() WHERE id=?", ["MOCK-"+payId, payId]);
    if (type === "wallet_topup") {
      await pool.query("UPDATE users SET balance = balance + ? WHERE id = ?", [totalAmount, req.user.id]);
      const [[u]] = await pool.query("SELECT balance FROM users WHERE id = ?", [req.user.id]);
      await pool.query(
        "INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method, balance_after) VALUES (?,?,?,?,?,?,?)",
        [req.user.id, "topup", totalAmount, "ওয়ালেট টপআপ", "Wallet Top-up", payment_method, u.balance]
      );
      cache.del(`user:wallet:${req.user.id}`);
      cache.del(`user:profile:${req.user.id}`);
    } else {
      await pool.query("UPDATE bookings SET payment_status='paid', status='confirmed' WHERE id=?", [booking_id]);
    }
    cache.delPattern(new RegExp(`^payments:user:${req.user.id}:`));
    cache.delPattern(/^payments:admin:all:/);
    res.json({ mock: true, paymentId: payId, message: "মক পেমেন্ট সফল (dev mode — SSLCommerz credentials .env এ যোগ করুন)" });
  } catch (err) {
    logger.error("payment-initiate:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ── POST /api/payments/ipn ── */
router.post("/ipn", async (req, res) => {
  try {
    const { tran_id, val_id, status, amount } = req.body;
    logger.info("[IPN]", { tran_id, status, amount });
    if (status !== "VALID" && status !== "VALIDATED") return res.json({ status: "ignored" });
    const validated = await payment.validatePayment(val_id);
    if (validated.status !== "VALID" && validated.status !== "VALIDATED") return res.json({ status: "invalid" });
    // Atomic compare-and-swap: transition 'pending'→'success'; affectedRows=0 means already processed
    const [upd] = await pool.query(
      "UPDATE payments SET status='success', gateway_val_id=?, paid_at=NOW() WHERE id=? AND status!='success'",
      [val_id, tran_id]
    );
    if (!upd.affectedRows) return res.json({ status: "already_processed" });
    const [[pay]] = await pool.query("SELECT * FROM payments WHERE id = ?", [tran_id]);
    if (!pay) return res.json({ status: "not_found" });
    if (pay.booking_id) {
      // Booking payment
      await pool.query("UPDATE bookings SET payment_status='paid', status='confirmed' WHERE id=?", [pay.booking_id]);
    } else {
      // Wallet top-up — credit user balance
      await pool.query("UPDATE users SET balance = balance + ? WHERE id = ?", [pay.amount, pay.user_id]);
      const [[u]] = await pool.query("SELECT balance FROM users WHERE id = ?", [pay.user_id]);
      await pool.query(
        "INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method, balance_after) VALUES (?,?,?,?,?,?,?)",
        [pay.user_id, "topup", pay.amount, "ওয়ালেট টপআপ", "Wallet Top-up", pay.method, u.balance]
      );
      cache.del(`user:wallet:${pay.user_id}`);
      cache.del(`user:profile:${pay.user_id}`);
    }
    await pool.query("INSERT INTO notifications (user_id,icon,type,title_bn,title_en,body_bn,body_en) VALUES (?,?,?,?,?,?,?)",
      [pay.user_id, "✅", "payment", "পেমেন্ট সফল", "Payment Successful",
       `৳${parseFloat(amount).toFixed(0)} পেমেন্ট গ্রহণ করা হয়েছে।`, `Payment of ৳${parseFloat(amount).toFixed(0)} received.`]);
    cache.delPattern(new RegExp(`^payments:user:${pay.user_id}:`));
    cache.delPattern(/^payments:admin:all:/);
    res.json({ status: "processed" });
  } catch (err) {
    logger.error("ipn:", err);
    res.status(500).json({ error: "IPN error" });
  }
});

/* ── Redirect handlers ── */
router.post("/success", async (req, res) => {
  const { tran_id, val_id, status } = req.body;
  if (status === "VALID" || status === "VALIDATED") {
    try {
      await payment.validatePayment(val_id);
      // Atomic guard: only credit wallet/booking if this is the first request to set status='success'
      const [upd] = await pool.query("UPDATE payments SET status='success', gateway_val_id=?, paid_at=NOW() WHERE id=? AND status!='success'", [val_id, tran_id]);
      if (upd.affectedRows) {
        const [[p]] = await pool.query("SELECT * FROM payments WHERE id=?", [tran_id]);
        if (p) {
          if (p.booking_id) {
            await pool.query("UPDATE bookings SET payment_status='paid', status='confirmed' WHERE id=?", [p.booking_id]);
          } else {
            // Wallet top-up
            await pool.query("UPDATE users SET balance = balance + ? WHERE id = ?", [p.amount, p.user_id]);
            const [[u]] = await pool.query("SELECT balance FROM users WHERE id = ?", [p.user_id]);
            await pool.query(
              "INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method, balance_after) VALUES (?,?,?,?,?,?,?)",
              [p.user_id, "topup", p.amount, "ওয়ালেট টপআপ", "Wallet Top-up", p.method, u.balance]
            );
            cache.del(`user:wallet:${p.user_id}`);
            cache.del(`user:profile:${p.user_id}`);
          }
        }
      }
    } catch(e) { logger.error("success-redirect:", e); }
  }
  res.redirect(`${FE()}?payment=success&tran_id=${encodeURIComponent(tran_id||"")}`);
});
router.post("/fail",   (req, res) => res.redirect(`${FE()}?payment=failed&tran_id=${encodeURIComponent(req.body.tran_id||"")}`));
router.post("/cancel", (req, res) => res.redirect(`${FE()}?payment=cancelled&tran_id=${encodeURIComponent(req.body.tran_id||"")}`))

/* ── GET /api/payments (my history) ── */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const key = `payments:user:${req.user.id}:${page}:${limit}`;
    const result = await cache.getOrSet(key, async () => {
      const offset = (parseInt(page)-1)*parseInt(limit);
      const [rows] = await pool.query(
        "SELECT p.*, b.service_name_bn, b.service_name_en FROM payments p LEFT JOIN bookings b ON b.id=p.booking_id WHERE p.user_id=? ORDER BY p.created_at DESC LIMIT ? OFFSET ?",
        [req.user.id, parseInt(limit), offset]
      );
      const [[{total}]] = await pool.query("SELECT COUNT(*) AS total FROM payments WHERE user_id=?", [req.user.id]);
      return { data: rows, total, page: parseInt(page) };
    }, 30);
    res.json(result);
  } catch(err) { logger.error("payments-list:", err); res.status(500).json({ error: "Server error" }); }
});

/* ── GET /api/payments/admin/all ── */
router.get("/admin/all", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const key = `payments:admin:all:${status||'all'}:${page}:${limit}`;
    const result = await cache.getOrSet(key, async () => {
      const offset = (parseInt(page)-1)*parseInt(limit);
      let where = "1=1"; let params = [];
      if (status) { where += " AND p.status=?"; params.push(status); }
      const [rows] = await pool.query(
        `SELECT p.*, u.name AS user_name, u.phone AS user_phone, b.service_name_bn, b.service_name_en FROM payments p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN bookings b ON b.id=p.booking_id WHERE ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset]
      );
      const [[{total}]] = await pool.query(`SELECT COUNT(*) AS total FROM payments p WHERE ${where}`, params);
      return { data: rows, total, page: parseInt(page) };
    }, 30);
    res.json(result);
  } catch(err) { logger.error("admin-payments:", err); res.status(500).json({ error: "Server error" }); }
});

/* ── GET /api/payments/:id ── */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT p.*, b.service_name_bn, b.service_name_en FROM payments p LEFT JOIN bookings b ON b.id=p.booking_id WHERE p.id=? AND (p.user_id=? OR ?='admin')",
      [req.params.id, req.user.id, req.user.role]
    );
    if (!rows.length) return res.status(404).json({ error: "Payment not found" });
    res.json(rows[0]);
  } catch(err) { logger.error("payment-detail:", err); res.status(500).json({ error: "Server error" }); }
});

module.exports = router;
