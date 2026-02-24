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

const FE = () => process.env.FRONTEND_URL || "https://hasib61714.github.io/imap-bangladesh";

/* ── POST /api/payments/initiate ── */
router.post("/initiate", authMiddleware, async (req, res) => {
  try {
    const { booking_id, payment_method = "sslcommerz" } = req.body;
    if (!booking_id) return res.status(400).json({ error: "booking_id required" });

    const [brows] = await pool.query(
      "SELECT b.*, u.name AS cus_name, u.email AS cus_email, u.phone AS cus_phone FROM bookings b LEFT JOIN users u ON u.id = b.customer_id WHERE b.id = ? AND b.customer_id = ?",
      [booking_id, req.user.id]
    );
    if (!brows.length) return res.status(404).json({ error: "Booking not found" });

    const booking     = brows[0];
    const totalAmount = parseFloat(booking.amount) + parseFloat(booking.platform_fee || 0);
    const payId       = uuidv4();

    await pool.query(
      "INSERT INTO payments (id, booking_id, user_id, amount, method, status, gateway_tran_id) VALUES (?,?,?,?,?,'pending',?)",
      [payId, booking_id, req.user.id, totalAmount, payment_method, payId]
    );

    if (payment.isConfigured()) {
      const resp = await payment.initiatePayment({
        orderId: payId, amount: totalAmount,
        customer: { name: booking.cus_name, email: booking.cus_email, phone: booking.cus_phone, address: booking.address || "Dhaka, Bangladesh" },
        product:  { name: booking.service_name_en || "IMAP Service", category: "Home Service" },
      });
      if (resp?.GatewayPageURL) {
        await pool.query("UPDATE payments SET gateway_session_key = ? WHERE id = ?", [resp.sessionkey, payId]);
        return res.json({ url: resp.GatewayPageURL, paymentId: payId });
      }
      return res.status(500).json({ error: "Payment gateway error. Try again." });
    }

    // Mock (dev mode)
    await pool.query("UPDATE payments SET status='success', gateway_val_id=?, paid_at=NOW() WHERE id=?", ["MOCK-"+payId, payId]);
    await pool.query("UPDATE bookings SET payment_status='paid', status='confirmed' WHERE id=?", [booking_id]);
    res.json({ mock: true, paymentId: payId, message: "মক পেমেন্ট সফল (dev mode — SSLCommerz credentials .env এ যোগ করুন)" });
  } catch (err) {
    console.error("payment-initiate:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ── POST /api/payments/ipn ── */
router.post("/ipn", async (req, res) => {
  try {
    const { tran_id, val_id, status, amount } = req.body;
    console.log("[IPN]", { tran_id, status, amount });
    if (status !== "VALID" && status !== "VALIDATED") return res.json({ status: "ignored" });
    const validated = await payment.validatePayment(val_id);
    if (validated.status !== "VALID" && validated.status !== "VALIDATED") return res.json({ status: "invalid" });
    const [payRows] = await pool.query("SELECT * FROM payments WHERE id = ?", [tran_id]);
    if (!payRows.length || payRows[0].status === "success") return res.json({ status: "already_processed" });
    await pool.query("UPDATE payments SET status='success', gateway_val_id=?, paid_at=NOW() WHERE id=?", [val_id, tran_id]);
    await pool.query("UPDATE bookings SET payment_status='paid', status='confirmed' WHERE id=?", [payRows[0].booking_id]);
    await pool.query("INSERT INTO notifications (user_id,icon,type,title_bn,title_en,body_bn,body_en) VALUES (?,?,?,?,?,?,?)",
      [payRows[0].user_id, "✅", "payment", "পেমেন্ট সফল", "Payment Successful",
       `৳${parseFloat(amount).toFixed(0)} পেমেন্ট গ্রহণ করা হয়েছে।`, `Payment of ৳${parseFloat(amount).toFixed(0)} received.`]);
    res.json({ status: "processed" });
  } catch (err) {
    console.error("ipn:", err);
    res.status(500).json({ error: "IPN error" });
  }
});

/* ── Redirect handlers ── */
router.post("/success", async (req, res) => {
  const { tran_id, val_id, status } = req.body;
  if (status === "VALID" || status === "VALIDATED") {
    try {
      await payment.validatePayment(val_id);
      await pool.query("UPDATE payments SET status='success', gateway_val_id=?, paid_at=NOW() WHERE id=? AND status!='success'", [val_id, tran_id]);
      const [p] = await pool.query("SELECT booking_id FROM payments WHERE id=?", [tran_id]);
      if (p.length) await pool.query("UPDATE bookings SET payment_status='paid', status='confirmed' WHERE id=?", [p[0].booking_id]);
    } catch(e) { console.error("success-redirect:", e); }
  }
  res.redirect(`${FE()}?payment=success&tran_id=${tran_id}`);
});
router.post("/fail",   (req, res) => res.redirect(`${FE()}?payment=failed&tran_id=${req.body.tran_id||""}`));
router.post("/cancel", (req, res) => res.redirect(`${FE()}?payment=cancelled&tran_id=${req.body.tran_id||""}`));

/* ── GET /api/payments (my history) ── */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page)-1)*parseInt(limit);
    const [rows] = await pool.query(
      "SELECT p.*, b.service_name_bn, b.service_name_en FROM payments p LEFT JOIN bookings b ON b.id=p.booking_id WHERE p.user_id=? ORDER BY p.created_at DESC LIMIT ? OFFSET ?",
      [req.user.id, parseInt(limit), offset]
    );
    const [[{total}]] = await pool.query("SELECT COUNT(*) AS total FROM payments WHERE user_id=?", [req.user.id]);
    res.json({ data: rows, total, page: parseInt(page) });
  } catch(err) { console.error("payments-list:", err); res.status(500).json({ error: "Server error" }); }
});

/* ── GET /api/payments/admin/all ── */
router.get("/admin/all", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page)-1)*parseInt(limit);
    let where = "1=1"; let params = [];
    if (status) { where += " AND p.status=?"; params.push(status); }
    const [rows] = await pool.query(
      `SELECT p.*, u.name AS user_name, u.phone AS user_phone, b.service_name_bn, b.service_name_en FROM payments p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN bookings b ON b.id=p.booking_id WHERE ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const [[{total}]] = await pool.query(`SELECT COUNT(*) AS total FROM payments p WHERE ${where}`, params);
    res.json({ data: rows, total, page: parseInt(page) });
  } catch(err) { console.error("admin-payments:", err); res.status(500).json({ error: "Server error" }); }
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
  } catch(err) { console.error("payment-detail:", err); res.status(500).json({ error: "Server error" }); }
});

module.exports = router;
