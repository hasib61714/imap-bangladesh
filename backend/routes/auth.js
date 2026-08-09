const logger = require('../utils/logger');
const router   = require("express").Router();
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const pool     = require("../db");
const sms      = require("../utils/sms");
const otpStore = require("../utils/otp-store");
const { validate, body } = require("../middleware/validate");
const { parseOptionalAmount, MoneyError } = require("../utils/money");

const makeReferralCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const makeToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// ── Validation schemas ──────────────────────────────────
const registerRules = validate([
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 80 }).withMessage("Name too long"),
  body("email").optional({ checkFalsy: true }).isEmail().withMessage("Invalid email").normalizeEmail(),
  body("phone").optional({ checkFalsy: true }).matches(/^01[0-9]{9}$/).withMessage("Phone must be 11 digits starting with 01"),
  body("password").optional({ checkFalsy: true }).isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("role").optional().isIn(["customer", "provider"]).withMessage("Role must be customer or provider"),
]);

const loginRules = validate([
  body("identifier").trim().notEmpty().withMessage("Email or phone is required").isLength({ max: 100 }).withMessage("identifier too long"),
]);

const otpRules = validate([
  body("phone").matches(/^01[0-9]{9}$/).withMessage("Valid 11-digit phone required"),
]);

// ── POST /api/auth/register ───────────────────────────────
router.post("/register", registerRules, async (req, res) => {
  try {
    const { name, email, phone, password, role = "customer", avatar } = req.body;

    // SECURITY (P0-2 related): `socialId` and `loginMethod` are no longer
    // accepted here. Allowing a client to assert a social identity at
    // registration let an attacker pre-register a victim's provider
    // subject id and capture their account on first social sign-in.
    // social_id is now written only by POST /api/auth/google, after the
    // provider's ID token has been verified.
    const loginMethod = phone && !email ? "phone" : "email";

    if (!name?.trim())  return res.status(400).json({ error: "Name required" });
    if (!email && !phone)
      return res.status(400).json({ error: "Email or phone required" });
    if (avatar && avatar.length > 2_700_000)
      return res.status(400).json({ error: "Avatar too large (max ~2 MB)" });

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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [id, name.trim(), email || null, phone || null, hash, role, avatar || null, loginMethod, refCode]
    );

    // If provider role → create provider profile.
    // is_approved defaults to 0: a new provider is not publicly listed
    // or bookable until an admin approves them (P1-7).
    if (role === "provider") {
      const pid = uuidv4();
      const { service_type_bn, service_type_en, area_bn, area_en, hourly_rate } = req.body;
      // A provider setting their own rate is legitimate, but it feeds
      // server-side pricing, so it is validated as money (P0-4).
      const rate = parseOptionalAmount(hourly_rate, "hourly_rate", 0, { max: 100000 });
      await pool.query(
        `INSERT INTO providers (id, user_id, service_type_bn, service_type_en, area_bn, area_en, hourly_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [pid, id,
         service_type_bn || null, service_type_en || null,
         area_bn || null, area_en || null,
         rate > 0 ? rate : null]
      );
    }

    const [rows] = await pool.query(
      "SELECT id, name, email, phone, role, avatar, kyc_status, verified, balance, points, referral_code FROM users WHERE id = ?",
      [id]
    );

    res.status(201).json({ user: rows[0], token: makeToken(rows[0]) });
  } catch (err) {
    if (err instanceof MoneyError) return res.status(400).json({ error: err.message, field: err.field });
    logger.error("register:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/auth/login ──────────────────────────────────
// SECURITY (P0-1): this handler previously skipped password verification
// entirely when `password_hash` was NULL — which is the case for every
// account created through OTP or a social provider. Knowing a phone
// number was therefore enough to obtain that user's token.
//
// It now fails closed: a password login requires a stored hash, and an
// account without one must authenticate through the flow that owns it
// (OTP or Google). Responses are deliberately uniform so they cannot be
// used to enumerate accounts or discover which credential type an
// account uses.
const INVALID_CREDENTIALS = "Invalid credentials";
// Real bcrypt hash of a random string, compared against when no account
// or no stored hash exists so the response time does not reveal which.
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

router.post("/login", loginRules, async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier) return res.status(400).json({ error: "Email or phone required" });

    const [rows] = await pool.query(
      "SELECT * FROM users WHERE (email = ? OR phone = ?) AND is_active = 1",
      [identifier, identifier]
    );

    const user = rows[0];
    const storedHash =
      user && typeof user.password_hash === "string" && user.password_hash.length > 0
        ? user.password_hash
        : null;

    // Always run a comparison, even with no account / no hash, so that
    // timing does not distinguish the three cases.
    const ok = await bcrypt.compare(String(password || ""), storedHash || DUMMY_HASH);

    if (!user || !storedHash || !ok) {
      if (user && !storedHash) {
        logger.warn("login rejected: account has no password credential", { userId: user.id });
      }
      return res.status(401).json({ error: INVALID_CREDENTIALS });
    }

    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, token: makeToken(user) });
  } catch (err) {
    logger.error("login:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/auth/social-login ───────────────────────────
// DISABLED (P0-2). This endpoint issued a full session token to anyone
// who supplied a `socialId` that existed in the database, with no
// verification against the social provider. Google's `sub` — which
// /api/auth/google stores in that same column — is a public identifier,
// not a secret, so this was a direct account-takeover path.
//
// It fails closed rather than being "fixed", because there is no way to
// verify an identity from client-supplied fields alone. Google sign-in
// continues to work through POST /api/auth/google, which verifies the
// ID token and its audience with Google before issuing anything.
//
// Providers disabled by this change: Facebook (the client generated its
// own socialId — it was never a real OAuth flow) and any other caller
// of this endpoint. Re-enabling requires a server-side token exchange
// with the provider.
router.post("/social-login", (_req, res) => {
  logger.warn("social-login called — endpoint disabled in Phase 0.5 (P0-2)");
  res.status(410).json({
    error: "This sign-in method has been disabled. Please use Google sign-in, phone OTP, or email and password.",
    code: "SOCIAL_LOGIN_DISABLED",
  });
});

// ── POST /api/auth/send-otp ───────────────────────────────
router.post("/send-otp", otpRules, async (req, res) => {
  try {
    const { phone } = req.body;
    const otp    = Math.floor(100000 + Math.random() * 900000).toString();
    const stored = otpStore.setOtp(phone, otp);
    if (!stored) {
      const secs = otpStore.getSecondsLeft(phone);
      return res.status(429).json({ error: `OTP ইতিমধ্যে পাঠানো হয়েছে। ${secs} সেকেন্ড পর আবার চেষ্টা করুন।`, retryAfter: secs });
    }
    const message = `আপনার IMAP OTP কোড: ${otp}। এই কোড ৫ মিনিট বৈধ। কাউকে শেয়ার করবেন না।`;
    await sms.sendSMS(phone, message);
    const isMock = process.env.NODE_ENV !== "production" && (process.env.SMS_PROVIDER || "mock") === "mock";
    res.json({ success: true, expiresIn: 300, ...(isMock && { mockOtp: otp, note: "Dev only — never sent in production" }) });
  } catch (err) {
    logger.error("send-otp:", err);
    res.status(500).json({ error: "SMS পাঠাতে সমস্যা হয়েছে। পরে চেষ্টা করুন।" });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP required" });
    if (!/^01[0-9]{9}$/.test(phone)) return res.status(400).json({ error: "Valid 11-digit phone required" });
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
    logger.error("verify-otp:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/auth/google — verify Google ID token ─────────
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Google credential required" });

    // Verify token with Google's tokeninfo endpoint (credential is encoded to prevent URL injection)
    const gRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!gRes.ok) return res.status(401).json({ error: "Invalid Google token" });
    const gUser = await gRes.json();

    // Validate audience if GOOGLE_CLIENT_ID is set
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && gUser.aud !== clientId)
      return res.status(401).json({ error: "Token audience mismatch" });

    const { sub: googleId, email, name, picture } = gUser;
    if (!googleId) return res.status(401).json({ error: "Invalid token payload" });

    // Google returns email_verified as the string "true"/"false" on the
    // tokeninfo endpoint. Only an address Google has actually verified may
    // be used to match an existing local account — otherwise an attacker
    // who registered that email first would capture the sign-in.
    const emailVerified = String(gUser.email_verified) === "true";
    const matchEmail = emailVerified && email ? email : null;

    // Match on the verified subject id first, then on a verified email.
    const [rows] = await pool.query(
      matchEmail
        ? "SELECT * FROM users WHERE social_id = ? OR (email = ? AND email IS NOT NULL AND email <> '') LIMIT 1"
        : "SELECT * FROM users WHERE social_id = ? LIMIT 1",
      matchEmail ? [googleId, matchEmail] : [googleId]
    );

    if (rows.length) {
      const user = rows[0];
      // Attach social_id if not yet set
      if (!user.social_id) {
        await pool.query(
          "UPDATE users SET social_id=?, login_method='google', avatar=COALESCE(NULLIF(avatar,''),?) WHERE id=?",
          [googleId, picture || null, user.id]
        );
      }
      const { password_hash, ...safeUser } = user;
      return res.json({
        user: { ...safeUser, social_id: googleId, avatar: user.avatar || picture },
        token: makeToken(user),
        isNew: false,
      });
    }

    // New Google user — return prefill, let frontend complete profile
    res.json({ isNew: true, prefill: { name, email, socialId: googleId, avatar: picture } });
  } catch (err) {
    logger.error("google-auth:", err);
    res.status(500).json({ error: "Google authentication failed" });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────
const { authMiddleware } = require("../middleware/auth");
router.get("/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});
// ── POST /api/auth/refresh ─────────────────────────────────────
// Exchange a still-valid JWT for a fresh one with a new expiry.
// Requires: Authorization: Bearer <token>
router.post("/refresh", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, phone, role, avatar, kyc_status, verified, balance, points FROM users WHERE id = ? AND is_active = 1",
      [req.user.id]
    );
    if (!rows.length) return res.status(401).json({ error: "User not found or inactive" });
    const token = makeToken(rows[0]);
    res.json({ token, user: rows[0] });
  } catch (err) {
    logger.error("token refresh:", err);
    res.status(500).json({ error: "Server error" });
  }
});
module.exports = router;
