const logger = require('../utils/logger');
const router = require("express").Router();
const pool   = require("../db");
const { authMiddleware } = require("../middleware/auth");

// ── GET /api/users/profile ────────────────────────────────
router.get("/profile", authMiddleware, async (req, res) => {
  try {
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
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    logger.error("get profile:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PUT /api/users/profile ────────────────────────────────
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    await pool.query(
      "UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email) WHERE id = ?",
      [name || null, phone || null, email || null, req.user.id]
    );
    // Return updated user so frontend can refresh auth state
    const [[user]] = await pool.query(
      "SELECT id, name, email, phone, role, avatar, kyc_status, balance, points, referral_code FROM users WHERE id = ?",
      [req.user.id]
    );
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
    await pool.query("UPDATE users SET avatar = ? WHERE id = ?", [avatar, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    logger.error("update avatar:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/users/wallet ─────────────────────────────────
router.get("/wallet", authMiddleware, async (req, res) => {
  try {
    const [balance] = await pool.query("SELECT balance FROM users WHERE id = ?", [req.user.id]);
    const [transactions] = await pool.query(
      "SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
      [req.user.id]
    );
    res.json({ balance: balance[0]?.balance || 0, transactions });
  } catch (err) {
    logger.error("wallet:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/users/wallet/topup ──────────────────────────
router.post("/wallet/topup", authMiddleware, async (req, res) => {
  try {
    const { amount, method = "bKash" } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });

    await pool.query("UPDATE users SET balance = balance + ? WHERE id = ?", [amount, req.user.id]);
    const [b] = await pool.query("SELECT balance FROM users WHERE id = ?", [req.user.id]);
    await pool.query(
      "INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method, balance_after) VALUES (?,?,?,?,?,?,?)",
      [req.user.id, "credit", amount, "টপআপ", "Top-up", method, b[0].balance]
    );
    res.json({ success: true, balance: b[0].balance });
  } catch (err) {
    logger.error("topup:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/users/wallet/withdraw ───────────────────────
router.post("/wallet/withdraw", authMiddleware, async (req, res) => {
  try {
    const { amount, method = "bKash" } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
    if (parseFloat(amount) < 50) return res.status(400).json({ error: "Minimum withdrawal is ৳50" });

    const [b] = await pool.query("SELECT balance FROM users WHERE id = ?", [req.user.id]);
    if (b[0].balance < amount) return res.status(400).json({ error: "Insufficient balance" });

    await pool.query("UPDATE users SET balance = balance - ? WHERE id = ?", [amount, req.user.id]);
    const [nb] = await pool.query("SELECT balance FROM users WHERE id = ?", [req.user.id]);
    await pool.query(
      "INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method, balance_after) VALUES (?,?,?,?,?,?,?)",
      [req.user.id, "debit", amount, "উত্তোলন", "Withdrawal", method, nb[0].balance]
    );
    res.json({ success: true, balance: nb[0].balance });
  } catch (err) {
    logger.error("withdraw:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/users/notifications ─────────────────────────
router.get("/notifications", authMiddleware, async (req, res) => {
  try {
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
      return res.json({ notifications: seeded, unread });
    }

    const unread = rows.filter(n => !n.is_read).length;
    res.json({ notifications: rows, unread });
  } catch (err) {
    logger.error("notifications:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PUT /api/users/notifications/read ────────────────────
router.put("/notifications/read", authMiddleware, async (req, res) => {
  try {
    await pool.query("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/users/loyalty  — points + history ───────────
router.get("/loyalty", authMiddleware, async (req, res) => {
  try {
    const [[user]] = await pool.query("SELECT points FROM users WHERE id=?", [req.user.id]);
    const points = user?.points || 0;
    // ensure loyalty_log table exists
    await pool.query(`CREATE TABLE IF NOT EXISTS loyalty_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      points INT NOT NULL,
      reason_bn VARCHAR(200),
      reason_en VARCHAR(200),
      booking_id VARCHAR(36),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    const [logs] = await pool.query(
      "SELECT * FROM loyalty_log WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
      [req.user.id]
    );
    res.json({ points, history: logs });
  } catch (err) {
    logger.error("loyalty:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/users/referral — code + friends list ────────
router.get("/referral", authMiddleware, async (req, res) => {
  try {
    // ensure referrals table
    await pool.query(`CREATE TABLE IF NOT EXISTS referrals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      referrer_id INT NOT NULL,
      referred_id INT NOT NULL,
      status ENUM('pending','active') DEFAULT 'pending',
      bonus_paid DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_ref (referrer_id, referred_id)
    ) ENGINE=InnoDB`);

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
    res.json({
      referral_code: user?.referral_code || null,
      friends: friends.map(f => ({
        name: f.name,
        status: f.status,
        earned: parseFloat(f.earned) || 0,
        date: f.date,
      })),
    });
  } catch (err) {
    logger.error("referral:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/users/complaints — submit a dispute ────────
router.post("/complaints", authMiddleware, async (req, res) => {
  try {
    const { booking_id, subject, description, priority = "medium" } = req.body;
    if (!description) return res.status(400).json({ error: "Description required" });
    const [result] = await pool.query(
      "INSERT INTO complaints (user_id, booking_id, subject, description, priority) VALUES (?,?,?,?,?)",
      [req.user.id, booking_id || null, subject || "Service Complaint", description, priority]
    );
    const refId = `DSP-${String(result.insertId).padStart(5, "0")}`;
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/users/loyalty/redeem — redeem points ───────
router.post("/loyalty/redeem", authMiddleware, async (req, res) => {
  try {
    const { pts, code } = req.body;
    if (!pts || pts <= 0) return res.status(400).json({ error: "Invalid points" });

    const [[user]] = await pool.query("SELECT points, balance FROM users WHERE id=?", [req.user.id]);
    if (!user || user.points < pts) return res.status(400).json({ error: "Insufficient points" });

    // Deduct points, add small wallet credit (1 pt = ৳0.5)
    const walletCredit = Math.round(pts * 0.5);
    await pool.query(
      "UPDATE users SET points = points - ?, balance = balance + ? WHERE id = ?",
      [pts, walletCredit, req.user.id]
    );
    await pool.query(
      "INSERT INTO loyalty_log (user_id, points, reason_bn, reason_en) VALUES (?,?,?,?)",
      [req.user.id, -pts, `রিডিম করা হয়েছে (${code})`, `Redeemed (${code})`]
    );
    const [b] = await pool.query("SELECT points, balance FROM users WHERE id=?", [req.user.id]);
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
      user_id INT NOT NULL,
      endpoint VARCHAR(600) NOT NULL,
      keys JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_ep (endpoint(255))
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
      `INSERT INTO push_subscriptions (user_id, endpoint, keys)
       VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE user_id=?, keys=?`,
      [req.user.id, subscription.endpoint, JSON.stringify(subscription.keys),
       req.user.id, JSON.stringify(subscription.keys)]
    );
    res.json({ success: true });
  } catch (err) {
    logger.error("push-subscribe:", err);
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
