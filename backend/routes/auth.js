const router   = require("express").Router();
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const pool     = require("../db");
const sms      = require("../utils/sms");
const otpStore = require("../utils/otp-store");

const makeReferralCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const makeToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// ── POST /api/auth/register ───────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, role = "customer", loginMethod = "email", socialId, avatar } = req.body;

    if (!name?.trim())  return res.status(400).json({ error: "Name required" });
    if (!email && !phone && !socialId)
      return res.status(400).json({ error: "Email, phone, or social ID required" });

    // Duplicate check
    if (email) {
      const [ex] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
      if (ex.length) return res.status(409).json({ error: "Email already registered" });
    }
    if (phone) {
      const [ex] = await pool.query("SELECT id FROM users WHERE phone = ?", [phone]);
      if (ex.length) return res.status(409).json({ error: "Phone already registered" });
    }

    const id      = uuidv4();
    const hash    = password ? await bcrypt.hash(password, 10) : null;
    const refCode = makeReferralCode();

    await pool.query(
      `INSERT INTO users (id, name, email, phone, password_hash, role, avatar, login_method, social_id, referral_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name.trim(), email || null, phone || null, hash, role, avatar || null, loginMethod, socialId || null, refCode]
    );

    // If provider role → create provider profile
    if (role === "provider") {
      const pid = uuidv4();
      await pool.query(
        "INSERT INTO providers (id, user_id) VALUES (?, ?)",
        [pid, id]
      );
    }

    const [rows] = await pool.query(
      "SELECT id, name, email, phone, role, avatar, kyc_status, verified, balance, points FROM users WHERE id = ?",
      [id]
    );

    res.status(201).json({ user: rows[0], token: makeToken(rows[0]) });
  } catch (err) {
    console.error("register:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/auth/login ──────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier) return res.status(400).json({ error: "Email or phone required" });

    const [rows] = await pool.query(
      "SELECT * FROM users WHERE (email = ? OR phone = ?) AND is_active = 1",
      [identifier, identifier]
    );
    if (!rows.length) return res.status(401).json({ error: "Account not found" });

    const user = rows[0];

    if (user.password_hash) {
      const ok = await bcrypt.compare(password || "", user.password_hash);
      if (!ok) return res.status(401).json({ error: "Wrong password" });
    }

    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, token: makeToken(user) });
  } catch (err) {
    console.error("login:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/auth/social-login ───────────────────────────
router.post("/social-login", async (req, res) => {
  try {
    const { socialId, provider, email, name, avatar } = req.body;
    if (!socialId || !provider) return res.status(400).json({ error: "socialId and provider required" });

    const [rows] = await pool.query(
      "SELECT * FROM users WHERE social_id = ? OR email = ?",
      [socialId, email || ""]
    );

    if (rows.length) {
      const { password_hash, ...safeUser } = rows[0];
      return res.json({ user: safeUser, token: makeToken(rows[0]), isNew: false });
    }

    // New — needs profile step (return partial, no save yet)
    res.json({ isNew: true, prefill: { name, email, socialId } });
  } catch (err) {
    console.error("social-login:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/auth/send-otp ───────────────────────────────
router.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });
    const otp    = Math.floor(100000 + Math.random() * 900000).toString();
    const stored = otpStore.setOtp(phone, otp);
    if (!stored) {
      const secs = otpStore.getSecondsLeft(phone);
      return res.status(429).json({ error: `OTP ইতিমধ্যে পাঠানো হয়েছে। ${secs} সেকেন্ড পর আবার চেষ্টা করুন।`, retryAfter: secs });
    }
    const message = `আপনার IMAP OTP কোড: ${otp}। এই কোড ৫ মিনিট বৈধ। কাউকে শেয়ার করবেন না।`;
    await sms.sendSMS(phone, message);
    const isMock = (process.env.SMS_PROVIDER || "mock") === "mock";
    res.json({ success: true, expiresIn: 300, ...(isMock && { mockOtp: otp, note: "Remove mockOtp before production" }) });
  } catch (err) {
    console.error("send-otp:", err);
    res.status(500).json({ error: "SMS পাঠাতে সমস্যা হয়েছে। পরে চেষ্টা করুন।" });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP required" });
    const result = otpStore.verifyOtp(phone, String(otp));
    if (result === "expired")  return res.status(400).json({ error: "OTP মেয়াদ শেষ। নতুন OTP নিন।" });
    if (result === "blocked")  return res.status(429).json({ error: "অনেকবার ভুল হয়েছে। নতুন OTP নিন।" });
    if (result === "invalid")  return res.status(400).json({ error: "OTP ভুল। আবার চেষ্টা করুন।" });
    const [rows] = await pool.query("SELECT * FROM users WHERE phone = ?", [phone]);
    if (rows.length) {
      const { password_hash, ...safeUser } = rows[0];
      return res.json({ user: safeUser, token: makeToken(rows[0]), isNew: false });
    }
    res.json({ isNew: true, verified: true });
  } catch (err) {
    console.error("verify-otp:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────
const { authMiddleware } = require("../middleware/auth");
router.get("/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
