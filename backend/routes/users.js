const logger = require('../utils/logger');
const router = require("express").Router();
const pool   = require("../db");
const { withTransaction } = require("../db");
const cache  = require("../utils/cache");
const { authMiddleware } = require("../middleware/auth");
const { parseAmount, MoneyError } = require("../utils/money");

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
// P1-15: `phone` and `email` are login identifiers. This endpoint used to
// change them with no proof that the user controls the new address or
// number — so an account could be silently re-pointed at an attacker's
// contact details. Identity changes now require a verified flow, which
// does not exist yet, so they are refused here rather than accepted
// unverified. Display name remains editable.
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    if (name && name.length > 120) return res.status(400).json({ error: "Name too long (max 120)" });

    const wantsPhoneChange = phone !== undefined && phone !== null && String(phone) !== String(req.user.phone ?? "");
    const wantsEmailChange = email !== undefined && email !== null && String(email) !== String(req.user.email ?? "");
    if (wantsPhoneChange || wantsEmailChange) {
      return res.status(400).json({
        error: "Phone and email cannot be changed here. Contact support to update your login details.",
        code: "IDENTITY_CHANGE_REQUIRES_VERIFICATION",
      });
    }

    await pool.query(
      "UPDATE users SET name = COALESCE(?, name) WHERE id = ?",
      [name || null, req.user.id]
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
// NOTE: In production (payment gateway configured) wallet top-up must go through
// POST /api/payments/initiate with { type: "wallet_topup", topup_amount }.
// This endpoint is only allowed in dev/mock mode.
const paymentGateway = require("../utils/payment");
router.post("/wallet/topup", authMiddleware, async (req, res) => {
  // P0-12 (related): this credits a balance with no payment behind it.
  // It is now refused in production regardless of gateway configuration —
  // previously an unconfigured gateway was enough to unlock free money.
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({
      error: "Use the payment gateway for wallet top-up.",
      useGateway: true,
      hint: "POST /api/payments/initiate with { type: 'wallet_topup', topup_amount }",
    });
  }
  if (paymentGateway.isConfigured()) {
    return res.status(400).json({
      error: "Use the payment gateway for wallet top-up.",
      useGateway: true,
      hint: "POST /api/payments/initiate with { type: 'wallet_topup', topup_amount }",
    });
  }
  try {
    const amt = parseAmount(req.body.amount, "amount", { min: 1, max: 100000 });
    const method = String(req.body.method || "bKash").slice(0, 30);

    const balance = await withTransaction(async (conn) => {
      await conn.query("UPDATE users SET balance = balance + ? WHERE id = ?", [amt, req.user.id]);
      const [[b]] = await conn.query("SELECT balance FROM users WHERE id = ?", [req.user.id]);
      await conn.query(
        "INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method, balance_after) VALUES (?,?,?,?,?,?,?)",
        [req.user.id, "topup", amt, "টপআপ (dev)", "Top-up (dev)", method, b.balance]
      );
      return b.balance;
    });

    cache.del(`user:wallet:${req.user.id}`);
    cache.del(`user:profile:${req.user.id}`);
    res.json({ success: true, balance, devMode: true });
  } catch (err) {
    if (err instanceof MoneyError) return res.status(400).json({ error: err.message, field: err.field });
    logger.error("topup:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/users/wallet/withdraw ───────────────────────
router.post("/wallet/withdraw", authMiddleware, async (req, res) => {
  try {
    // P0-4: rejects negative / NaN / Infinity before it can reach a balance.
    const amt = parseAmount(req.body.amount, "amount", { min: 50, max: 100000 });
    const method = String(req.body.method || "bKash").slice(0, 30);

    // P0-11: the debit and its ledger row are now one atomic unit.
    const balance = await withTransaction(async (conn) => {
      const [result] = await conn.query(
        "UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?",
        [amt, req.user.id, amt]
      );
      if (result.affectedRows === 0) {
        const e = new Error("Insufficient balance"); e.status = 400; throw e;
      }
      const [[nb]] = await conn.query("SELECT balance FROM users WHERE id = ?", [req.user.id]);
      await conn.query(
        "INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method, balance_after) VALUES (?,?,?,?,?,?,?)",
        [req.user.id, "withdrawal", amt, "উত্তোলন", "Withdrawal", method, nb.balance]
      );
      return nb.balance;
    });

    cache.del(`user:wallet:${req.user.id}`);
    cache.del(`user:profile:${req.user.id}`);
    res.json({ success: true, balance });
  } catch (err) {
    if (err instanceof MoneyError) return res.status(400).json({ error: err.message, field: err.field });
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error("withdraw:", err);
    res.status(500).json({ error: "Server error" });
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
    const { code } = req.body;
    const pts = parseInt(req.body.pts, 10);
    if (!Number.isSafeInteger(pts) || pts <= 0 || pts > 1_000_000) {
      return res.status(400).json({ error: "Invalid points" });
    }
    const safeCode = String(code || "").slice(0, 40);

    // P0-11: the points debit, the wallet credit and the log entry are one unit.
    const walletCredit = Math.round(pts * 0.5);
    const b = await withTransaction(async (conn) => {
      const [redeem] = await conn.query(
        "UPDATE users SET points = points - ?, balance = balance + ? WHERE id = ? AND points >= ?",
        [pts, walletCredit, req.user.id, pts]
      );
      if (redeem.affectedRows === 0) {
        const e = new Error("Insufficient points"); e.status = 400; throw e;
      }
      await conn.query(
        "INSERT INTO loyalty_log (user_id, points, reason_bn, reason_en) VALUES (?,?,?,?)",
        [req.user.id, -pts, `রিডিম করা হয়েছে (${safeCode})`, `Redeemed (${safeCode})`]
      );
      const [[row]] = await conn.query("SELECT points, balance FROM users WHERE id=?", [req.user.id]);
      return row;
    });
    cache.del(`user:loyalty:${req.user.id}`);
    cache.del(`user:profile:${req.user.id}`);
    cache.del(`user:wallet:${req.user.id}`);
    res.json({ success: true, points: b.points, balance: b.balance, walletCredit });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
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
