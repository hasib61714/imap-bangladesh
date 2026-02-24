/**
 * Microloan Routes — IMAP Bangladesh
 * GET  /api/loans/score       → Get my loan eligibility score (auth)
 * POST /api/loans/apply       → Submit loan application (auth)
 * GET  /api/loans             → My loan applications (auth)
 * GET  /api/loans/admin       → All loans (admin only)
 * PATCH /api/loans/:id        → Update loan status (admin only)
 */
const router = require("express").Router();
const pool   = require("../db");
const { v4: uuidv4 } = require("uuid");
const { authMiddleware, requireRole } = require("../middleware/auth");

// ── Auto-create table ─────────────────────────────────────
const initTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS microloans (
      id            VARCHAR(36) PRIMARY KEY,
      user_id       VARCHAR(36) NOT NULL,
      provider_id   VARCHAR(36),
      full_name     VARCHAR(120) NOT NULL,
      phone         VARCHAR(20)  NOT NULL,
      purpose       TEXT,
      amount        DECIMAL(12,2) NOT NULL,
      tenure_months INT NOT NULL DEFAULT 12,
      interest_rate DECIMAL(5,2) NOT NULL DEFAULT 9.00,
      loan_score    INT NOT NULL DEFAULT 0,
      status        ENUM('pending','approved','disbursed','rejected','repaid') DEFAULT 'pending',
      admin_note    TEXT,
      reference_no  VARCHAR(20) UNIQUE,
      applied_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at   TIMESTAMP NULL,
      reviewed_by   VARCHAR(36),
      INDEX idx_user   (user_id),
      INDEX idx_status (status)
    ) ENGINE=InnoDB
  `);
};
initTable().catch(e => console.warn("microloans table init:", e.message));

// ── Loan score calculator ─────────────────────────────────
const calcLoanScore = async (userId) => {
  const [[u]] = await pool.query(
    `SELECT u.points, u.balance, u.kyc_status, u.verified, u.joined_at,
            (SELECT COUNT(*) FROM bookings WHERE customer_id=u.id AND status='completed') AS jobs_done,
            (SELECT COUNT(*) FROM reviews  WHERE customer_id=u.id) AS reviews_given
     FROM users u WHERE u.id = ?`,
    [userId]
  );
  if (!u) return 50;

  let score = 30; // base

  // Loyalty points earned → up to +20
  score += Math.min(20, Math.floor((u.points || 0) / 50));

  // Completed bookings → up to +20
  score += Math.min(20, (u.jobs_done || 0) * 3);

  // KYC verified → +15
  if (u.kyc_status === "verified") score += 15;

  // Phone/NID verified → +5
  if (u.verified) score += 5;

  // Wallet balance > ৳1000 → +5
  if (parseFloat(u.balance || 0) > 1000) score += 5;

  // Reviews given → up to +5
  score += Math.min(5, u.reviews_given || 0);

  // Account age in months → up to +10
  const ageMonths = u.joined_at
    ? Math.floor((Date.now() - new Date(u.joined_at).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : 0;
  score += Math.min(10, ageMonths);

  return Math.min(100, score);
};

// ── GET /api/loans/score ──────────────────────────────────
router.get("/score", authMiddleware, async (req, res) => {
  try {
    const score = await calcLoanScore(req.user.id);
    const [[{ cnt }]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM microloans WHERE user_id=? AND status IN ('pending','approved','disbursed')",
      [req.user.id]
    );
    res.json({ score, has_active_loan: cnt > 0 });
  } catch (err) {
    console.error("loan score:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/loans/apply ─────────────────────────────────
router.post("/apply", authMiddleware, async (req, res) => {
  try {
    const { full_name, phone, purpose, amount, tenure_months = 12, interest_rate = 9 } = req.body;

    if (!full_name?.trim()) return res.status(400).json({ error: "পূর্ণ নাম প্রয়োজন।" });
    if (!phone?.trim())     return res.status(400).json({ error: "ফোন নম্বর প্রয়োজন।" });
    if (!amount || parseFloat(amount) <= 0)
      return res.status(400).json({ error: "সঠিক পরিমাণ দিন।" });

    // Prevent duplicate active loan
    const [[{ cnt }]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM microloans WHERE user_id=? AND status IN ('pending','approved','disbursed')",
      [req.user.id]
    );
    if (cnt > 0)
      return res.status(409).json({ error: "আপনার ইতিমধ্যে একটি সক্রিয় লোন আবেদন আছে।" });

    const score = await calcLoanScore(req.user.id);
    if (score < 40)
      return res.status(403).json({ error: "লোন স্কোর অপর্যাপ্ত। কমপক্ষে ৪০ স্কোর প্রয়োজন।", score });

    const id     = uuidv4();
    const refNo  = `LN-${Date.now().toString(36).toUpperCase().slice(-6)}`;

    // Provider ID (if user is also a provider)
    const [[prov]] = await pool.query("SELECT id FROM providers WHERE user_id=? LIMIT 1", [req.user.id]).catch(() => [[null]]);

    await pool.query(
      `INSERT INTO microloans
        (id, user_id, provider_id, full_name, phone, purpose,
         amount, tenure_months, interest_rate, loan_score, reference_no)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.user.id, prov?.id || null,
       full_name.trim(), phone.trim(), purpose || null,
       parseFloat(amount), parseInt(tenure_months), parseFloat(interest_rate),
       score, refNo]
    );

    // Notify admin
    const [admins] = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
    if (admins.length) {
      await pool.query(
        "INSERT INTO notifications (user_id,icon,type,title_bn,title_en,body_bn,body_en) VALUES (?,?,?,?,?,?,?)",
        [admins[0].id, "💹", "alert", "নতুন লোন আবেদন", "New Loan Application",
         `${req.user.name} ৳${parseFloat(amount).toLocaleString()} লোনের আবেদন করেছে`,
         `${req.user.name} applied for ৳${parseFloat(amount).toLocaleString()} loan`]
      );
    }

    res.status(201).json({
      id,
      reference_no: refNo,
      status:       "pending",
      loan_score:   score,
      message:      "আবেদন সফলভাবে জমা হয়েছে।",
    });
  } catch (err) {
    console.error("loan apply:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/loans — my applications ─────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM microloans WHERE user_id=? ORDER BY applied_at DESC",
      [req.user.id]
    );
    res.json({ loans: rows });
  } catch (err) {
    console.error("loans list:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/loans/admin — all loans (admin) ─────────────
router.get("/admin", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const baseWhere = status ? "WHERE l.status = ?" : "";
    const baseParams = status ? [status] : [];

    const [rows] = await pool.query(
      `SELECT l.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM microloans l
       LEFT JOIN users u ON u.id = l.user_id
       ${baseWhere}
       ORDER BY l.applied_at DESC
       LIMIT ? OFFSET ?`,
      [...baseParams, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM microloans ${baseWhere}`,
      baseParams
    );

    res.json({ loans: rows, total });
  } catch (err) {
    console.error("loans admin list:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/loans/:id — update status (admin) ─────────
router.patch("/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  const { status, admin_note } = req.body;
  const valid = ["pending", "approved", "disbursed", "rejected", "repaid"];
  if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status" });

  try {
    await pool.query(
      "UPDATE microloans SET status=?, admin_note=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?",
      [status, admin_note || null, req.user.id, req.params.id]
    );

    // Fetch loan for notifications / disbursement
    const [[loan]] = await pool.query("SELECT * FROM microloans WHERE id=?", [req.params.id]);
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    // User notification on status change
    const msgs = {
      approved:  {
        bn: "🎉 আপনার লোন অনুমোদিত হয়েছে! শীঘ্রই বিতরণ হবে।",
        en: "🎉 Your loan is approved! Disbursement soon.",
      },
      rejected:  {
        bn: "আপনার লোন আবেদন প্রত্যাখ্যাত হয়েছে।",
        en: "Your loan application was rejected.",
      },
      disbursed: {
        bn: `✅ ৳${parseFloat(loan.amount).toLocaleString()} আপনার ওয়ালেটে জমা হয়েছে।`,
        en: `✅ ৳${parseFloat(loan.amount).toLocaleString()} credited to your wallet.`,
      },
    };

    if (msgs[status]) {
      await pool.query(
        "INSERT INTO notifications (user_id,icon,type,title_bn,title_en,body_bn,body_en) VALUES (?,?,?,?,?,?,?)",
        [loan.user_id, "💹", "alert", "লোন আপডেট", "Loan Update", msgs[status].bn, msgs[status].en]
      );
    }

    // On disbursement: credit wallet + write transaction
    if (status === "disbursed") {
      await pool.query(
        "UPDATE users SET balance = balance + ? WHERE id=?",
        [loan.amount, loan.user_id]
      );
      await pool.query(
        "INSERT INTO wallet_transactions (user_id,type,amount,description_bn,description_en,method) VALUES (?,?,?,?,?,?)",
        [loan.user_id, "credit", loan.amount,
         `মাইক্রো-লোন বিতরণ (${loan.reference_no})`,
         `Microloan disbursed (${loan.reference_no})`,
         "bank"]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("loan update:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
