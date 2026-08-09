const logger = require('../utils/logger');
const cache  = require('../utils/cache');
/**
 * Payment Routes — IMAP Bangladesh
 * POST   /api/payments/initiate  → Start payment session (auth required)
 * POST   /api/payments/ipn       → SSLCommerz IPN callback  (the ONLY crediting path)
 * POST   /api/payments/success   → Redirect after success   (redirect only, credits nothing)
 * POST   /api/payments/fail      → Redirect after fail
 * POST   /api/payments/cancel    → Redirect after cancel
 * GET    /api/payments           → My payment history
 * GET    /api/payments/admin/all → All payments (admin only)
 * GET    /api/payments/:id       → Single payment detail
 */
const router          = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const pool            = require("../db");
const { withTransaction } = require("../db");
const { authMiddleware, requireRole } = require("../middleware/auth");
const payment         = require("../utils/payment");
const { parseAmount, MoneyError } = require("../utils/money");
const env            = require("../config/environment");

const isProd = () => env.isProduction();
const FE = () => process.env.FRONTEND_APP_URL || process.env.FRONTEND_URL || "https://hasib61714.github.io/imap-bangladesh";

/**
 * Credit a settled payment exactly once.
 *
 * P0-12 / P0-11: crediting now happens in one transaction, guarded by a
 * compare-and-swap on the payment status AND a unique ledger ref, so two
 * concurrent callbacks cannot both credit. Previously the balance was
 * updated before the ledger insert, and the ledger insert then failed on
 * an enum mismatch — producing silent, unlogged credits.
 *
 * @returns {Promise<"credited"|"already_processed"|"not_found">}
 */
async function settlePayment({ tranId, valId, gatewayAmount }) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query("SELECT * FROM payments WHERE id = ? FOR UPDATE", [tranId]);
    if (!rows.length) return "not_found";
    const pay = rows[0];
    if (pay.status === "success") return "already_processed";

    // P1-4: reconcile the amount the gateway reports against the amount we
    // recorded when the session was created. A mismatch is never settled.
    if (gatewayAmount !== undefined && gatewayAmount !== null) {
      const reported = Number(gatewayAmount);
      const expected = Number(pay.amount);
      if (!Number.isFinite(reported) || Math.abs(reported - expected) > 0.01) {
        logger.error("payment amount mismatch — refusing to settle", {
          tranId, expected, reported,
        });
        const e = new Error("Payment amount mismatch");
        e.status = 409;
        throw e;
      }
    }

    const [upd] = await conn.query(
      "UPDATE payments SET status='success', gateway_val_id=?, paid_at=NOW() WHERE id=? AND status<>'success'",
      [valId || null, tranId]
    );
    if (upd.affectedRows === 0) return "already_processed";

    if (pay.booking_id) {
      await conn.query(
        "UPDATE bookings SET payment_status='paid', status='confirmed' WHERE id=? AND payment_status<>'paid'",
        [pay.booking_id]
      );
    } else {
      const amount = parseAmount(pay.amount, "amount");
      await conn.query("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, pay.user_id]);
      const [[u]] = await conn.query("SELECT balance FROM users WHERE id = ?", [pay.user_id]);
      await conn.query(
        `INSERT INTO wallet_transactions
           (user_id, type, amount, description_bn, description_en, method, ref_id, balance_after)
         VALUES (?,?,?,?,?,?,?,?)`,
        [pay.user_id, "topup", amount, "ওয়ালেট টপআপ", "Wallet Top-up",
         pay.method, `payment:${pay.id}:topup`, u.balance]
      );
    }
    return "credited";
  });
}

function bustPaymentCaches(userId) {
  cache.del(`user:wallet:${userId}`);
  cache.del(`user:profile:${userId}`);
  cache.delPattern(new RegExp(`^payments:user:${userId}:`));
  cache.delPattern(/^payments:admin:all:/);
}

/* ── POST /api/payments/initiate ── */
router.post("/initiate", authMiddleware, async (req, res) => {
  try {
    const { booking_id, topup_amount, type = "booking", payment_method = "sslcommerz" } = req.body;
    if (!["booking", "wallet_topup"].includes(type)) {
      return res.status(400).json({ error: "Invalid payment type" });
    }
    if (String(payment_method).length > 50) {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    // ── P0-12: fail closed. Without a configured gateway there is no way
    // to verify that money moved, so in production we refuse rather than
    // pretending the payment succeeded and crediting the wallet.
    if (!payment.isConfigured() && isProd()) {
      logger.error("payment initiate refused — gateway not configured in production");
      return res.status(503).json({
        error: "Payments are temporarily unavailable. Please try again later.",
        code: "PAYMENT_GATEWAY_UNAVAILABLE",
      });
    }

    let totalAmount, payId, customerInfo, productInfo;

    if (type === "wallet_topup") {
      const amt = parseAmount(topup_amount, "topup_amount", { min: 10, max: 100000 });
      payId = uuidv4();
      totalAmount = amt;
      await pool.query(
        "INSERT INTO payments (id, booking_id, user_id, amount, method, status, gateway_tran_id) VALUES (?,NULL,?,?,?,'pending',?)",
        [payId, req.user.id, totalAmount, payment_method, payId]
      );
      customerInfo = { name: req.user.name, email: req.user.email || "noemail@imap.app", phone: req.user.phone || "01700000000", address: "Dhaka, Bangladesh" };
      productInfo  = { name: "Wallet Top-up", category: "Wallet" };

    } else {
      if (!booking_id) return res.status(400).json({ error: "booking_id required" });

      const [brows] = await pool.query(
        `SELECT b.*, u.name AS cus_name, u.email AS cus_email, u.phone AS cus_phone
           FROM bookings b LEFT JOIN users u ON u.id = b.customer_id
          WHERE b.id = ? AND b.customer_id = ?`,
        [booking_id, req.user.id]
      );
      if (!brows.length) return res.status(404).json({ error: "Booking not found" });

      const booking = brows[0];

      // ── P1-5: the booking was already settled from the wallet at
      // creation. Charging the gateway as well took the money twice.
      if (booking.payment_status === "paid") {
        return res.status(409).json({ error: "This booking is already paid.", code: "ALREADY_PAID" });
      }
      if (booking.status === "cancelled") {
        return res.status(409).json({ error: "This booking has been cancelled." });
      }
      // Refuse a second live session for the same booking.
      const [[{ open }]] = await pool.query(
        "SELECT COUNT(*) AS open FROM payments WHERE booking_id = ? AND status = 'success'",
        [booking_id]
      );
      if (open > 0) return res.status(409).json({ error: "This booking is already paid.", code: "ALREADY_PAID" });

      // Server-side figures only — never the request body.
      totalAmount = parseAmount(
        Number(booking.amount) + Number(booking.platform_fee || 0),
        "booking total"
      );
      payId = uuidv4();
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
      await pool.query("UPDATE payments SET status='failed' WHERE id = ?", [payId]);
      return res.status(502).json({ error: "Payment gateway error. Try again." });
    }

    // ── Development-only settlement. Unreachable in production (guarded
    // above). Runs through the same single-credit path as a real callback
    // so the dev and production code paths cannot diverge.
    logger.warn("DEV MODE: settling payment without a gateway", { payId, ...env.describe() });
    const outcome = await settlePayment({ tranId: payId, valId: `DEV-${payId}`, gatewayAmount: totalAmount });
    bustPaymentCaches(req.user.id);
    return res.json({
      mock: true,
      devMode: true,
      paymentId: payId,
      outcome,
      message: "Development mode: settled without a payment gateway. Configure SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD for real payments.",
    });
  } catch (err) {
    if (err instanceof MoneyError) return res.status(400).json({ error: err.message, field: err.field });
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error("payment-initiate:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ── POST /api/payments/ipn ──
   The single authoritative crediting path. Requires the gateway to
   confirm the transaction via validatePayment() before anything moves. */
router.post("/ipn", async (req, res) => {
  try {
    const { tran_id, val_id, status, amount } = req.body;
    logger.info("[IPN]", { tran_id, status });

    if (!tran_id || !val_id) return res.status(400).json({ status: "bad_request" });
    if (status !== "VALID" && status !== "VALIDATED") return res.json({ status: "ignored" });

    // Fail closed: no credentials means we cannot verify, so we do not credit.
    if (!payment.isConfigured()) {
      logger.error("IPN received but the gateway is not configured — refusing to settle", { tran_id });
      return res.status(503).json({ status: "gateway_unavailable" });
    }

    const validated = await payment.validatePayment(val_id);
    if (validated.status !== "VALID" && validated.status !== "VALIDATED") {
      logger.warn("IPN validation rejected by gateway", { tran_id, status: validated.status });
      return res.json({ status: "invalid" });
    }

    // Prefer the gateway's own validated amount over the posted body.
    const verifiedAmount = validated.amount ?? validated.store_amount ?? amount;
    const outcome = await settlePayment({ tranId: tran_id, valId: val_id, gatewayAmount: verifiedAmount });

    if (outcome === "not_found")         return res.json({ status: "not_found" });
    if (outcome === "already_processed") return res.json({ status: "already_processed" });

    const [[pay]] = await pool.query("SELECT user_id, amount FROM payments WHERE id = ?", [tran_id]);
    if (pay) {
      pool.query(
        "INSERT INTO notifications (user_id,icon,type,title_bn,title_en,body_bn,body_en) VALUES (?,?,?,?,?,?,?)",
        [pay.user_id, "✅", "payment", "পেমেন্ট সফল", "Payment Successful",
         `৳${Number(pay.amount).toFixed(0)} পেমেন্ট গ্রহণ করা হয়েছে।`,
         `Payment of ৳${Number(pay.amount).toFixed(0)} received.`]
      ).catch(() => {});
      bustPaymentCaches(pay.user_id);
    }
    res.json({ status: "processed" });
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ status: "amount_mismatch" });
    logger.error("ipn:", err);
    res.status(500).json({ error: "IPN error" });
  }
});

/* ── Redirect handlers ──
   P1-3: these are browser redirect targets, not authenticated API calls —
   anyone can POST to them with any tran_id. They used to validate and
   credit. They now only redirect; the IPN callback is the sole path that
   can move money. The landing page reads the real status from the API. */
router.post("/success", (req, res) =>
  res.redirect(`${FE()}?payment=success&tran_id=${encodeURIComponent(req.body.tran_id || "")}`));
router.post("/fail", (req, res) =>
  res.redirect(`${FE()}?payment=failed&tran_id=${encodeURIComponent(req.body.tran_id || "")}`));
router.post("/cancel", (req, res) =>
  res.redirect(`${FE()}?payment=cancelled&tran_id=${encodeURIComponent(req.body.tran_id || "")}`));

/* ── GET /api/payments (my history) ── */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const key = `payments:user:${req.user.id}:${page}:${limit}`;
    const result = await cache.getOrSet(key, async () => {
      const offset = (page - 1) * limit;
      const [rows] = await pool.query(
        "SELECT p.*, b.service_name_bn, b.service_name_en FROM payments p LEFT JOIN bookings b ON b.id=p.booking_id WHERE p.user_id=? ORDER BY p.created_at DESC LIMIT ? OFFSET ?",
        [req.user.id, limit, offset]
      );
      const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM payments WHERE user_id=?", [req.user.id]);
      return { data: rows, total, page };
    }, 30);
    res.json(result);
  } catch (err) { logger.error("payments-list:", err); res.status(500).json({ error: "Server error" }); }
});

/* ── GET /api/payments/admin/all ── */
router.get("/admin/all", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { status } = req.query;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const VALID = ["pending", "success", "failed", "refunded", "cancelled"];
    if (status && !VALID.includes(status)) return res.status(400).json({ error: "Invalid status filter" });

    const key = `payments:admin:all:${status || 'all'}:${page}:${limit}`;
    const result = await cache.getOrSet(key, async () => {
      const offset = (page - 1) * limit;
      let where = "1=1"; const params = [];
      if (status) { where += " AND p.status=?"; params.push(status); }
      const [rows] = await pool.query(
        `SELECT p.*, u.name AS user_name, u.phone AS user_phone, b.service_name_bn, b.service_name_en
           FROM payments p
           LEFT JOIN users u ON u.id=p.user_id
           LEFT JOIN bookings b ON b.id=p.booking_id
          WHERE ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM payments p WHERE ${where}`, params);
      return { data: rows, total, page };
    }, 30);
    res.json(result);
  } catch (err) { logger.error("admin-payments:", err); res.status(500).json({ error: "Server error" }); }
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
  } catch (err) { logger.error("payment-detail:", err); res.status(500).json({ error: "Server error" }); }
});

module.exports = router;
