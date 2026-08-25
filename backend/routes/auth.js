const logger = require('../utils/logger');
const router   = require("express").Router();
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const pool     = require("../db");
const sms      = require("../utils/sms");
// I-05 (F-9): utils/otp-store.js was a module-level Map. With two instances a
// code issued by one did not exist on the other, and `attempts` — the only
// thing between a six-digit number and an exhaustive search — counted per
// instance. The store is now a table every instance shares.
const otp      = require("../src/modules/platform/otp");
const limiter  = require("../src/modules/platform/ratelimit");
const { rateLimit } = require("../middleware/rateLimit");
const { REFRESH_TTL_MS } = require("../src/modules/identity/domain/session");
const { validate, body } = require("../middleware/validate");
const { parseOptionalAmount, MoneyError } = require("../utils/money");
const env      = require("../config/environment");
// I-03 (§35): authentication events are recorded. Until now no login attempt
// was written anywhere, which is exactly why CREDENTIAL-INCIDENT.md §2 has to
// answer "was the published credential used?" with UNKNOWN. Only the minimum
// writer exists — the full in-transaction audit rule arrives with the use-case
// layer.
const { writeAuditOutOfBand } = require("../src/modules/platform/audit/writeAudit");
const { auditActorFromRequest, requestIp, requestUserAgent } =
  require("../src/modules/platform/audit/auditActor");

/** Record an authentication event. Never throws into the request path. */
function recordAuth(req, { action, outcome, principalId = null, role = null, reason = null }) {
  return writeAuditOutOfBand(pool, {
    actor: auditActorFromRequest(req, { principalId, role }),
    action,
    resourceType: "principal",
    resourceId: principalId,
    resourceOwner: principalId,
    outcome,
    reason,
    ip: requestIp(req),
    userAgent: requestUserAgent(req),
  });
}

const makeReferralCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
// I-03 (§16): the algorithm is pinned on both sides. jsonwebtoken 9 already
// rejects `alg: none` — verified, not assumed — but without an explicit
// `algorithms` list, verify() accepts any HS* variant, so a token signed
// HS512 validates against a service that only ever issues HS256. Pinning
// removes the mismatch and makes the accepted set reviewable in one place.
const JWT_ALG = "HS256";

/**
 * I-05 (§19, F-10): the absolute deadline for the whole session.
 *
 * `/auth/refresh` exchanged any still-valid token for a fresh seven-day one,
 * with nothing bounding how many times. A token captured once could be
 * refreshed forever, so "seven days" was the gap between refreshes and not
 * the life of the session.
 *
 * `sae` — session absolute expiry — is carried across refreshes rather than
 * recomputed, so thirty days after sign-in the session ends whatever the
 * client does. It is thirty days because that is REFRESH_TTL_MS, the session
 * lifetime I-03 already chose.
 *
 * The claim is ADDITIVE. A token issued before this deploy has no `sae`; it
 * keeps working and acquires a deadline on its first refresh, so nobody is
 * signed out by the change and every session is bounded within one cycle.
 */
const MAX_SESSION_MS = REFRESH_TTL_MS;

function makeToken(user, { sessionExpiresAt = null } = {}) {
  const deadline = sessionExpiresAt || new Date(Date.now() + MAX_SESSION_MS);
  return jwt.sign(
    { id: user.id, role: user.role, sae: Math.floor(deadline.getTime() / 1000) },
    process.env.JWT_SECRET,
    { algorithm: JWT_ALG, expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

/** The OTP purpose for this endpoint pair. Server-side, never from the client (§10). */
const OTP_PURPOSE = otp.PURPOSE.LOGIN;

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

const verifyOtpRules = validate([
  body("phone").matches(/^01[0-9]{9}$/).withMessage("Valid 11-digit phone required"),
  body("otp").isString().trim().isLength({ min: 6, max: 6 }).withMessage("6-digit code required"),
]);

/** The rate-limit dimension for a phone. Normalised, so formatting cannot buy extra attempts. */
const phoneDimension = (req) => ({
  destination: otp.normaliseDestination("phone", req.body?.phone),
});

// ── POST /api/auth/register ───────────────────────────────
router.post("/register", registerRules,
  rateLimit("auth.register"),
  async (req, res) => {
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

router.post("/login", loginRules,
  rateLimit("auth.login", (req) => ({ identifier: String(req.body?.identifier || "").trim().toLowerCase() })),
  async (req, res) => {
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
      // The REASON is recorded; the RESPONSE stays uniform. An investigation
      // needs to tell "no such account" from "no password credential" from
      // "wrong password"; a caller must not be able to.
      await recordAuth(req, {
        action: "session.authenticate",
        outcome: "denied",
        principalId: user ? user.id : null,
        role: user ? user.role : null,
        reason: !user ? "unknown_identifier" : !storedHash ? "no_password_credential" : "wrong_password",
      });
      return res.status(401).json({ error: INVALID_CREDENTIALS });
    }

    await recordAuth(req, {
      action: "session.authenticate",
      outcome: "permitted",
      principalId: user.id,
      role: user.role,
      reason: "password",
    });

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
router.post("/social-login", async (req, res) => {
  logger.warn("social-login called — endpoint disabled in Phase 0.5 (P0-2)");
  // Recorded: a call to a disabled account-takeover endpoint is a signal, and
  // an unrecorded attempt is one nobody can count.
  await recordAuth(req, {
    action: "session.authenticate",
    outcome: "denied",
    reason: "social_login_disabled",
  });
  res.status(410).json({
    error: "This sign-in method has been disabled. Please use Google sign-in, phone OTP, or email and password.",
    code: "SOCIAL_LOGIN_DISABLED",
  });
});

// ── POST /api/auth/send-otp ───────────────────────────────
//
// The code was generated with Math.random(). V8 seeds xorshift128+ from a
// weak source and its state is recoverable from a modest number of outputs,
// so an attacker requesting codes for their own number could predict the next
// one issued to somebody else. SECURITY-ARCHITECTURE §3 says
// "cryptographically random"; domain/challenge.js uses crypto.randomInt.
router.post("/send-otp", otpRules,
  rateLimit("auth.otp_request", phoneDimension),
  async (req, res) => {
  try {
    const { phone } = req.body;

    // §11: the principal is resolved SERVER-SIDE at issue, so the challenge
    // is bound to an identity rather than only to a string the caller sent.
    // NULL is a legitimate registration case, not an unknown principal.
    const [owner] = await pool.query(
      "SELECT id FROM users WHERE phone = ? AND is_active = 1 LIMIT 1", [phone]
    );

    const issued = await otp.issue(pool, {
      purpose: OTP_PURPOSE,
      channel: "phone",
      destination: phone,
      principalId: owner.length ? owner[0].id : null,
      correlationId: req.requestId || null,
      ip: requestIp(req),
    });

    if (!issued.issued) {
      return res.status(429).json({
        error: `OTP ইতিমধ্যে পাঠানো হয়েছে। ${issued.retryAfterSeconds} সেকেন্ড পর আবার চেষ্টা করুন।`,
        retryAfter: issued.retryAfterSeconds,
      });
    }

    const message = `আপনার IMAP OTP কোড: ${issued.code}। এই কোড ৫ মিনিট বৈধ। কাউকে শেয়ার করবেন না।`;
    await sms.sendSMS(phone, message);

    // §12: unchanged. The gate is the two-axis environment guard, so a
    // production process cannot reach this branch whatever SMS_PROVIDER says.
    const isMock = env.allowsDevelopmentBehaviour() && (process.env.SMS_PROVIDER || "mock") === "mock";
    res.json({
      success: true,
      expiresIn: Math.floor(otp.TTL_MS / 1000),
      ...(isMock && { mockOtp: issued.code, note: "Dev only — never sent in production" }),
    });
  } catch (err) {
    if (err instanceof otp.OtpStoreUnavailable) {
      // §35: fail closed. No in-memory fallback — a code nobody else can
      // verify is worse than no code.
      logger.error("send-otp: OTP store unavailable");
      return res.status(503).json({ error: "সেবা সাময়িকভাবে অনুপলব্ধ। পরে চেষ্টা করুন।" });
    }
    logger.error("send-otp:", err);
    res.status(500).json({ error: "SMS পাঠাতে সমস্যা হয়েছে। পরে চেষ্টা করুন।" });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────
//
// §13: every failure answers the same way.
//
// Distinguishing "expired" from "wrong code" tells a caller whether a
// challenge exists for a number right now — which is to say whether its owner
// is mid-sign-in. That is a useful window for a real-time phishing or
// SIM-swap attempt, and it is not worth the marginally better error message.
// The precise reason goes to the audit log, where it belongs.
//
// This mirrors /login, which has answered uniformly since Phase 0.5 for the
// same reason.
const OTP_REJECTED = "OTP সঠিক নয় বা মেয়াদ শেষ। নতুন OTP নিন।";

router.post("/verify-otp", verifyOtpRules,
  rateLimit("auth.otp_verify", phoneDimension),
  async (req, res) => {
  try {
    const { phone } = req.body;
    const result = await otp.verify(pool, {
      purpose: OTP_PURPOSE,
      channel: "phone",
      destination: phone,
      code: req.body.otp,
    });

    if (!result.ok) {
      await recordAuth(req, {
        action: "session.authenticate",
        outcome: "denied",
        reason: `otp:${result.reason}`,
      });
      return res.status(400).json({ error: OTP_REJECTED });
    }
    // I-03 (§14): `AND is_active = 1` was missing here. /login checked it;
    // this path did not, so a deactivated account could still obtain a full
    // session by proving control of its phone number. Account state must gate
    // every authentication path, not the one that happens to be busiest.
    //
    // A deactivated account is treated as absent rather than refused, so the
    // response cannot be used to discover that a number is registered.
    // The principal this challenge was issued for (§11). Re-resolved by phone
    // only when the challenge carried none, which is the registration case —
    // and covers a user who completed sign-up between issue and verify.
    const [rows] = result.principalId
      ? await pool.query("SELECT * FROM users WHERE id = ? AND is_active = 1", [result.principalId])
      : await pool.query("SELECT * FROM users WHERE phone = ? AND is_active = 1", [phone]);
    if (rows.length) {
      // A successful authentication clears this destination's own counter, so
      // a user who mistyped four times is not locked out for the rest of the
      // window. Deliberately not the IP counter: clearing that would let an
      // attacker reset their own limit using an account they control.
      await limiter.forget(pool, "auth.otp_verify", "destination",
        otp.normaliseDestination("phone", phone)).catch(() => {});
      await recordAuth(req, {
        action: "session.authenticate",
        outcome: "permitted",
        principalId: rows[0].id,
        role: rows[0].role,
        reason: "otp",
      });
      const { password_hash, ...safeUser } = rows[0];
      return res.json({ user: safeUser, token: makeToken(rows[0]), isNew: false });
    }
    res.json({ isNew: true, verified: true });
  } catch (err) {
    if (err instanceof otp.OtpStoreUnavailable) {
      logger.error("verify-otp: OTP store unavailable");
      return res.status(503).json({ error: "সেবা সাময়িকভাবে অনুপলব্ধ। পরে চেষ্টা করুন।" });
    }
    logger.error("verify-otp:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/auth/google — verify Google ID token ─────────
router.post("/google", rateLimit("auth.social"), async (req, res) => {
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
    // I-03 (§14): same omission as verify-otp — a deactivated account could
    // sign in with Google. Deactivated accounts fall through to the "new user"
    // branch rather than being refused, so the response does not reveal that
    // the identity exists.
    const [rows] = await pool.query(
      matchEmail
        ? "SELECT * FROM users WHERE (social_id = ? OR (email = ? AND email IS NOT NULL AND email <> '')) AND is_active = 1 LIMIT 1"
        : "SELECT * FROM users WHERE social_id = ? AND is_active = 1 LIMIT 1",
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
    // I-05 (F-10). The session's absolute deadline, carried across refreshes
    // rather than recomputed. Without it this endpoint renewed forever and
    // "expires in 7 days" described the interval between refreshes, not the
    // life of the session.
    const sae = req.tokenClaims && typeof req.tokenClaims.sae === "number" ? req.tokenClaims.sae : null;
    if (sae !== null && Date.now() >= sae * 1000) {
      return res.status(401).json({
        error: "Session expired. Please sign in again.",
        code: "SESSION_EXPIRED",
      });
    }

    const [rows] = await pool.query(
      "SELECT id, name, email, phone, role, avatar, kyc_status, verified, balance, points FROM users WHERE id = ? AND is_active = 1",
      [req.user.id]
    );
    if (!rows.length) return res.status(401).json({ error: "User not found or inactive" });
    // A token issued before this deploy has no deadline; it gets one now
    // rather than being rejected, so the change signs nobody out.
    const token = makeToken(rows[0], {
      sessionExpiresAt: sae !== null ? new Date(sae * 1000) : new Date(Date.now() + MAX_SESSION_MS),
    });
    res.json({ token, user: rows[0] });
  } catch (err) {
    logger.error("token refresh:", err);
    res.status(500).json({ error: "Server error" });
  }
});
module.exports = router;
