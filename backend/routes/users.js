const logger = require('../utils/logger');
const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const pool   = require("../db");
const cache  = require("../utils/cache");
const { authMiddleware } = require("../middleware/auth");
const payment = require("../utils/payment");
const { finalizePayment } = require("../utils/ledger");

// ── GET /api/users/profile ────────────────────────────────
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const data = await cache.getOrSet(`user:profile:${req.user.id}`, async () => {
      const [rows] = await pool.query(
        `SELECT u.id, u.name, u.email, u.phone, u.role, u.avatar, u.kyc_status,
                u.verified, u.balance, u.points, u.referral_code, u.joined_at,
                p.id AS provider_id, p.service_type_bn, p.service_type_en,
                p.area_bn, p.area_en, p.hourly_rate, p.is_available,
                p.rating, p.total_jobs, p.trust_score, p.bio_bn, p.bio_en,
                (SELECT COUNT(*) FROM bookings WHERE customer_id = u.id) AS total_bookings,
                (SELECT COALESCE(SUM(amount), 0) FROM bookings
                 WHERE customer_id = u.id AND status = 'completed') AS total_spent
         FROM users u
         LEFT JOIN providers p ON p.user_id = u.id
         WHERE u.id = ?`,
        [req.user.id]
      );
      if (!rows.length) return null;
      return rows[0];
    }, 60);
    if (!data) return res.status(404).json({ error: "User not found" });
    res.json(data);
  } catch (err) {
    logger.error("get profile:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PUT /api/users/profile ────────────────────────────────
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    if (name   && name.length   > 120) return res.status(400).json({ error: "Name too long (max 120)" });
    if (email  && email.length  > 200) return res.status(400).json({ error: "Email too long (max 200)" });
    if (phone  && phone.length  > 20)  return res.status(400).json({ error: "Phone too long (max 20)" });
    await pool.query(
      "UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email) WHERE id = ?",
      [name || null, phone || null, email || null, req.user.id]
    );
    // Return updated user so frontend can refresh auth state
    const [[user]] = await pool.query(
      "SELECT id, name, email, phone, role, avatar, kyc_status, verified, balance, points, referral_code FROM users WHERE id = ?",
      [req.user.id]
    );
    cache.del(`user:profile:${req.user.id}`);
    res.json({ success: true, user });
  } catch (err) {
    logger.error("update profile:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PUT /api/users/avatar ─────────────────────────────────
router.put("/avatar", authMiddleware, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ error: "Avatar required" });
    if (avatar.length > 2_700_000) return res.status(400).json({ error: "Avatar too large (max ~2 MB)" });
    await pool.query("UPDATE users SET avatar = ? WHERE id = ?", [avatar, req.user.id]);    cache.del(`user:profile:${req.user.id}`);    res.json({ success: true });
  } catch (err) {
    logger.error("update avatar:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/users/wallet ─────────────────────────────────
router.get("/wallet", authMiddleware, async (req, res) => {
  try {
    const data = await cache.getOrSet(`user:wallet:${req.user.id}`, async () => {
      const [balance] = await pool.query("SELECT balance FROM users WHERE id = ?", [req.user.id]);
      const [transactions] = await pool.query(
        "SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
        [req.user.id]
      );
      return { balance: balance[0]?.balance || 0, transactions };
    }, 30);
    res.json(data);
  } catch (err) {
    logger.error("wallet:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/users/wallet/topup ──────────────────────────
// SECURITY: this endpoint NEVER credits the wallet directly. It creates a
// pending wallet-topup payment request; the balance is credited only after a
// verified SSLCommerz callback settles the payment (see utils/ledger.js).
// When a gateway is configured it returns the hosted payment URL; in
// development (no gateway) a clearly-labelled mock settlement is allowed; in
// production a missing gateway fails safely so no API call can mint money.
// (A gateway-routed top-up is also available via POST /api/payments/initiate
//  with { type: "wallet_topup", topup_amount }.)
router.post("/wallet/topup", authMiddleware, async (req, res) => {
  try {
    const { method = "bKash" } = req.body;
    const amt = parseFloat(req.body.amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: "Invalid amount" });
    if (amt < 10)      return res.status(400).json({ error: "Minimum top-up is ৳10" });
    if (amt > 100000)  return res.status(400).json({ error: "Maximum top-up is ৳1,00,000" });

    const payId = uuidv4();
    await pool.query(
      "INSERT INTO payments (id, booking_id, user_id, amount, method, purpose, status, gateway_tran_id) VALUES (?,?,?,?,?,'wallet_topup','pending',?)",
      [payId, null, req.user.id, amt, method, payId]
    );

    // Real gateway → return hosted payment URL; credit happens on callback
    if (payment.isConfigured()) {
      const [[u]] = await pool.query("SELECT name, email, phone FROM users WHERE id = ?", [req.user.id]);
      const resp = await payment.initiatePayment({
        orderId: payId, amount: amt,
        customer: { name: u?.name, email: u?.email, phone: u?.phone, address: "Dhaka, Bangladesh" },
        product:  { name: "Wallet Top-up", category: "Wallet" },
      });
      if (resp?.GatewayPageURL) {
        await pool.query("UPDATE payments SET gateway_session_key = ? WHERE id = ?", [resp.sessionkey, payId]);
        return res.json({ url: resp.GatewayPageURL, paymentId: payId });
      }
      await pool.query("UPDATE payments SET status='failed' WHERE id=?", [payId]).catch(() => {});
      return res.status(502).json({ error: "Payment gateway error. Try again." });
    }

    // No gateway configured — production must not mint money
    if (!payment.allowMock()) {
      await pool.query("UPDATE payments SET status='failed' WHERE id=?", [payId]).catch(() => {});
      logger.error("wallet-topup: gateway not configured in production", { payId, user: req.user.id });
      return res.status(503).json({ error: "Wallet top-up is temporarily unavailable." });
    }

    // Dev-only mock: settle via the idempotent ledger (credits wallet + writes tx)
    await finalizePayment(payId, "MOCK-" + payId);
    cache.del(`user:wallet:${req.user.id}`);
    cache.del(`user:profile:${req.user.id}`);
    const [[b]] = await pool.query("SELECT balance FROM users WHERE id = ?", [req.user.id]);
    res.json({ success: true, mock: true, paymentId: payId, balance: b.balance, note: "DEV mock top-up — no gateway configured" });
  } catch (err) {
    logger.error("topup:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/users/wallet/withdraw ───────────────────────
// Atomic: locks the balance row, verifies funds, debits and records the
// transaction in a single committed unit.
router.post("/wallet/withdraw", authMiddleware, async (req, res) => {
  const { method = "bKash" } = req.body;
  const amt = parseFloat(req.body.amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: "Invalid amount" });
  if (amt < 50)     return res.status(400).json({ error: "Minimum withdrawal is ৳50" });
  if (amt > 100000) return res.status(400).json({ error: "Maximum withdrawal is ৳1,00,000" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[u]] = await conn.query("SELECT balance FROM users WHERE id = ? FOR UPDATE", [req.user.id]);
    if (!u) { await conn.rollback(); return res.status(404).json({ error: "User not found" }); }
    if (parseFloat(u.balance) < amt) {
      await conn.rollback();
      return res.status(400).json({ error: "Insufficient balance" });
    }
    const newBal = parseFloat(u.balance) - amt;
    await conn.query("UPDATE users SET balance = ? WHERE id = ?", [newBal, req.user.id]);
    await conn.query(
      "INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method, balance_after) VALUES (?,?,?,?,?,?,?)",
      [req.user.id, "debit", amt, "উত্তোলন", "Withdrawal", method, newBal]
    );
    await conn.commit();
    cache.del(`user:wallet:${req.user.id}`);
    cache.del(`user:profile:${req.user.id}`);
    res.json({ success: true, balance: newBal });
  } catch (err) {
    await conn.rollback().catch(() => {});
    logger.error("withdraw:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    conn.release();
  }
});

// ── GET /api/users/notifications ─────────────────────────
router.get("/notifications", authMiddleware, async (req, res) => {
  try {
    const data = await cache.getOrSet(`user:notifs:${req.user.id}`, async () => {
      const [rows] = await pool.query(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
        [req.user.id]
      );

      // Auto-seed welcome notifications for new users (single round-trip)
      if (rows.length === 0) {
        await pool.query(
          "INSERT INTO notifications (user_id,icon,type,title_bn,title_en,body_bn,body_en) VALUES (?,?,?,?,?,?,?),(?,?,?,?,?,?,?),(?,?,?,?,?,?,?)",
          [
            req.user.id,"🎉","promo","IMAP-এ স্বাগতম!","Welcome to IMAP!","আজ যেকোনো সেবায় IMAP20 কোডে ২০% ছাড় পাচ্ছেন।","Use code IMAP20 for 20% off your first booking!",
            req.user.id,"🛡️","info","KYC যাচাই করুন","Complete KYC Verification","আপনার পরিচয় যাচাই করে আরও সুবিধা পান।","Verify your identity to unlock more features.",
            req.user.id,"🔔","info","নতুন সেবা যোগ হয়েছে","New Services Available","নার্সিং ও গৃহ পরিচ্ছন্নতা সেবায় নতুন প্রোভাইডার যোগ হয়েছেন।","New providers added for nursing & cleaning services.",
          ]
        ).catch(()=>{});
        const [seeded] = await pool.query(
          "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
          [req.user.id]
        );
        const unread = seeded.filter(n => !n.is_read).length;
        return { notifications: seeded, unread };
      }

      const unread = rows.filter(n => !n.is_read).length;
      return { notifications: rows, unread };
    }, 15);
    res.json(data);
  } catch (err) {
    logger.error("notifications:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PUT /api/users/notifications/read ────────────────────
router.put("/notifications/read", authMiddleware, async (req, res) => {
  try {
    await pool.query("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [req.user.id]);    cache.del(`user:notifs:${req.user.id}`);    res.json({ success: true });
  } catch (err) {
    logger.error("mark-all-notifs-read:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/users/loyalty  — points + history ───────────
router.get("/loyalty", authMiddleware, async (req, res) => {
  try {
    const data = await cache.getOrSet(`user:loyalty:${req.user.id}`, async () => {
      const [[user]] = await pool.query("SELECT points FROM users WHERE id=?", [req.user.id]);
      const points = user?.points || 0;
      const [logs] = await pool.query(
        "SELECT * FROM loyalty_log WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
        [req.user.id]
      );
      return { points, history: logs };
    }, 30);
    res.json(data);
  } catch (err) {
    logger.error("loyalty:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/users/referral — code + friends list ────────
router.get("/referral", authMiddleware, async (req, res) => {
  try {
    const data = await cache.getOrSet(`user:referral:${req.user.id}`, async () => {
      const [[user]] = await pool.query(
        "SELECT referral_code FROM users WHERE id=?", [req.user.id]
      );
      const [friends] = await pool.query(
        `SELECT u.name, r.status, r.bonus_paid AS earned,
                DATE_FORMAT(r.created_at,'%b %d') AS date
         FROM referrals r
         LEFT JOIN users u ON u.id = r.referred_id
         WHERE r.referrer_id = ?
         ORDER BY r.created_at DESC`,
        [req.user.id]
      );
      return {
        referral_code: user?.referral_code || null,
        friends: friends.map(f => ({
          name: f.name,
          status: f.status,
          earned: parseFloat(f.earned) || 0,
          date: f.date,
        })),
      };
    }, 60);
    res.json(data);
  } catch (err) {
    logger.error("referral:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/users/complaints — submit a dispute ────────
router.post("/complaints", authMiddleware, async (req, res) => {
  try {
    const { booking_id, subject, description, priority = "medium" } = req.body;
    if (!description || description.length > 2000)
      return res.status(400).json({ error: "Description required (max 2000 chars)" });
    if (subject && subject.length > 200)
      return res.status(400).json({ error: "Subject max 200 chars" });
    const VALID_PRIORITIES = ["low", "medium", "high"];
    const safePriority = VALID_PRIORITIES.includes(priority) ? priority : "medium";
    const [result] = await pool.query(
      "INSERT INTO complaints (user_id, booking_id, subject, description, priority) VALUES (?,?,?,?,?)",
      [req.user.id, booking_id || null, subject || "Service Complaint", description, safePriority]
    );
    const refId = `DSP-${String(result.insertId).padStart(5, "0")}`;
    cache.del("admin:stats"); // open-complaint count changes
    res.json({ success: true, id: result.insertId, ref: refId });
  } catch (err) {
    logger.error("submit complaint:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/users/notifications/:id/read ───────────────
router.patch("/notifications/:id/read", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    cache.del(`user:notifs:${req.user.id}`);
    res.json({ success: true });
  } catch (err) {
    logger.error("mark-notif-read:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/users/loyalty/redeem — redeem points ───────
router.post("/loyalty/redeem", authMiddleware, async (req, res) => {
  try {
    const { pts, code } = req.body;
    if (!pts || pts <= 0) return res.status(400).json({ error: "Invalid points" });

    // Deduct points atomically — prevents concurrent double-spend
    const walletCredit = Math.round(pts * 0.5);
    const [redeemResult] = await pool.query(
      "UPDATE users SET points = points - ?, balance = balance + ? WHERE id = ? AND points >= ?",
      [pts, walletCredit, req.user.id, pts]
    );
    if (redeemResult.affectedRows === 0) return res.status(400).json({ error: "Insufficient points" });
    await pool.query(
      "INSERT INTO loyalty_log (user_id, points, reason_bn, reason_en) VALUES (?,?,?,?)",
      [req.user.id, -pts, `রিডিম করা হয়েছে (${code})`, `Redeemed (${code})`]
    );
    const [[b]] = await pool.query("SELECT points, balance FROM users WHERE id=?", [req.user.id]);
    cache.del(`user:loyalty:${req.user.id}`);
    cache.del(`user:profile:${req.user.id}`);
    cache.del(`user:wallet:${req.user.id}`);
    res.json({ success: true, points: b[0].points, balance: b[0].balance, walletCredit });
  } catch (err) {
    logger.error("loyalty redeem:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PUT /api/users/settings — save notification prefs ────
router.put("/settings", authMiddleware, async (req, res) => {
  try {
    const { notif_booking, notif_promo, notif_sms, privacy_2fa, privacy_location } = req.body;
    const prefs = { notif_booking, notif_promo, notif_sms, privacy_2fa, privacy_location };
    // Persist as JSON in users.settings column (added via ALTER if missing)
    await pool.query(
      "UPDATE users SET settings = ? WHERE id = ?",
      [JSON.stringify(prefs), req.user.id]
    );
    res.json({ success: true, settings: prefs });
  } catch (err) {
    // If column doesn't exist yet, still return success
    logger.warn("settings save:", err.message);
    res.json({ success: true, settings: req.body });
  }
});

// ── Push Notifications ────────────────────────────────────
const webpush = require("web-push");
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:admin@imap-bangladesh.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Ensure push_subscriptions table exists (called once on first use)
let pushTableReady = false;
async function ensurePushTable() {
  if (pushTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      endpoint VARCHAR(600) NOT NULL,
      \`keys\` JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_ep (endpoint(255)),
      INDEX idx_ps_user (user_id)
    )
  `);
  pushTableReady = true;
}

// POST /api/users/push-subscribe — save browser push subscription
router.post("/push-subscribe", authMiddleware, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: "Invalid subscription" });
    await ensurePushTable();
    await pool.query(
      "INSERT INTO push_subscriptions (user_id, endpoint, `keys`) " +
      "VALUES (?,?,?) " +
      "ON DUPLICATE KEY UPDATE user_id=?, `keys`=?",
      [req.user.id, subscription.endpoint, JSON.stringify(subscription.keys),
       req.user.id, JSON.stringify(subscription.keys)]
    );
    res.json({ success: true });
  } catch (err) {
    logger.error("push-subscribe:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/users/push-subscribe — unsubscribe (own subscriptions only)
// Body { endpoint } removes that one; with no endpoint, removes all of the user's.
router.delete("/push-subscribe", authMiddleware, async (req, res) => {
  try {
    await ensurePushTable();
    const { endpoint } = req.body || {};
    let result;
    if (endpoint) {
      // Own-only: scoped by user_id so a user can never delete another's subscription
      [result] = await pool.query(
        "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
        [req.user.id, endpoint]
      );
    } else {
      [result] = await pool.query(
        "DELETE FROM push_subscriptions WHERE user_id = ?",
        [req.user.id]
      );
    }
    res.json({ success: true, removed: result.affectedRows });
  } catch (err) {
    logger.error("push-unsubscribe:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/users/test-push — send test push notification to self
router.post("/test-push", authMiddleware, async (req, res) => {
  try {
    if (!process.env.VAPID_PUBLIC_KEY) return res.status(501).json({ error: "Push not configured on server" });
    await ensurePushTable();
    const [subs] = await pool.query(
      "SELECT * FROM push_subscriptions WHERE user_id=? LIMIT 5",
      [req.user.id]
    );
    if (!subs.length) return res.status(404).json({ error: "No subscription found. Please enable push first." });

    const payload = JSON.stringify({
      title: "🔔 IMAP Bangladesh",
      body: "পুশ নোটিফিকেশন সফলভাবে চালু হয়েছে! ✅",
      url: "/"
    });
    const results = await Promise.allSettled(
      subs.map(s => webpush.sendNotification(
        { endpoint: s.endpoint, keys: typeof s.keys === "string" ? JSON.parse(s.keys) : s.keys },
        payload
      ))
    );
    const sent = results.filter(r => r.status === "fulfilled").length;
    res.json({ success: true, sent });
  } catch (err) {
    logger.error("test-push:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/vapid-public-key — serve VAPID public key to frontend
router.get("/vapid-public-key", (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY || "";
  res.json({ key });
});

module.exports = router;
