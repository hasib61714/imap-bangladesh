const logger = require('../utils/logger');
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
const { withTransaction } = require("../db");
const { v4: uuidv4 } = require("uuid");
const { authMiddleware } = require("../middleware/auth");
// I-04: credit decisions are `finance`. D-011 defers the FEATURE; the data
// and the endpoints exist, so their authorization is migrated with the rest.
const { requireAuthorization } = require("../middleware/authorize");
const { ACTION } = require("../src/modules/platform/authorization");
const cache  = require("../utils/cache");
const { parseAmount, MoneyError } = require("../utils/money");

// ── Auto-create table ─────────────────────────────────────
// I-01: microloans is migration 003. This module is deferred from Gate 1
// (D-011) and issues no DDL.

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
    const data = await cache.getOrSet(`loans:score:${req.user.id}`, async () => {
      const score = await calcLoanScore(req.user.id);
      const [[{ cnt }]] = await pool.query(
        "SELECT COUNT(*) AS cnt FROM microloans WHERE user_id=? AND status IN ('pending','approved','disbursed')",
        [req.user.id]
      );
      return { score, has_active_loan: cnt > 0 };
    }, 60);
    res.json(data);
  } catch (err) {
    logger.error("loan score:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/loans/apply ─────────────────────────────────
router.post("/apply", authMiddleware, async (req, res) => {
  try {
    const { full_name, phone, purpose, amount, tenure_months = 12 } = req.body;

    if (!full_name?.trim() || full_name.length > 120) return res.status(400).json({ error: "পূর্ণ নাম প্রয়োজন (সর্বোচ্চ ১২০ অক্ষর)।" });
    if (!phone?.trim() || phone.length > 20)     return res.status(400).json({ error: "ফোন নম্বর প্রয়োজন।" });
    // P0-4: rejects negative, NaN, Infinity, "1e999", [] and objects —
    // parseFloat("1e999") is Infinity and used to pass the < 100000 test.
    let safeAmount;
    try {
      safeAmount = parseAmount(amount, "amount", { min: 1, max: 100000 });
    } catch (e) {
      return res.status(400).json({ error: "সঠিক পরিমাণ দিন। (Invalid amount)" });
    }
    if (purpose && purpose.length > 500)
      return res.status(400).json({ error: "purpose max 500 chars" });
    const ALLOWED_TENURES = [3, 6, 12, 24];
    const safeTenure = ALLOWED_TENURES.includes(parseInt(tenure_months)) ? parseInt(tenure_months) : 12;
    const INTEREST_RATE = 9.00; // fixed by platform — never accept from user

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
       safeAmount, safeTenure, INTEREST_RATE,
       score, refNo]
    );

    // Notify admin
    const [admins] = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
    if (admins.length) {
      await pool.query(
        "INSERT INTO notifications (user_id,icon,type,title_bn,title_en,body_bn,body_en) VALUES (?,?,?,?,?,?,?)",
        [admins[0].id, "💹", "alert", "নতুন লোন আবেদন", "New Loan Application",
         `${req.user.name} ৳${safeAmount.toLocaleString()} লোনের আবেদন করেছে`,
         `${req.user.name} applied for ৳${safeAmount.toLocaleString()} loan`]
      );
    }

    res.status(201).json({
      id,
      reference_no: refNo,
      status:       "pending",
      loan_score:   score,
      message:      "আবেদন সফলভাবে জমা হয়েছে।",
    });
    // Bust user-specific and admin loan caches
    cache.del(`loans:score:${req.user.id}`);
    cache.del(`loans:user:${req.user.id}`);
    ["all","pending"].forEach(s => ["1","2","3"].forEach(p => cache.del(`loans:admin:${s}:p${p}`)));
  } catch (err) {
    logger.error("loan apply:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/loans — my applications ─────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const data = await cache.getOrSet(`loans:user:${req.user.id}`, async () => {
      const [rows] = await pool.query(
        "SELECT * FROM microloans WHERE user_id=? ORDER BY applied_at DESC",
        [req.user.id]
      );
      return { loans: rows };
    }, 30);
    res.json(data);
  } catch (err) {
    logger.error("loans list:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/loans/admin — all loans (admin) ─────────────
router.get("/admin", authMiddleware, requireAuthorization(ACTION.LOAN_READ_ALL), async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const cacheKey = `loans:admin:${status||"all"}:p${page}`;
    const data = await cache.getOrSet(cacheKey, async () => {
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
      return { loans: rows, total };
    }, 15);
    res.json(data);
  } catch (err) {
    logger.error("loans admin list:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/loans/:id — update status (admin) ─────────
// P0-6: this used to write the new status unconditionally and then credit
// the wallet whenever the requested status was "disbursed" — with no check
// that it had not already been disbursed. Every repeat of the request (a
// double-click, a retry, a refresh) credited the borrower again, up to the
// ৳100,000 application cap each time, in three separate autocommit steps.
//
// Now: the transition is guarded on the current status inside a
// transaction, the credit carries a unique ledger ref, and a repeat
// returns the existing disbursement instead of moving money.
const LOAN_STATUSES = ["pending", "approved", "disbursed", "rejected", "repaid"];

/** from → allowed next states. Terminal states accept nothing. */
const LOAN_TRANSITIONS = {
  pending:   ["approved", "rejected"],
  approved:  ["disbursed", "rejected"],
  disbursed: ["repaid"],
  rejected:  [],
  repaid:    [],
};

router.patch("/:id", authMiddleware,
  requireAuthorization(ACTION.LOAN_DECIDE, { resource: (req) => req.params.id }), async (req, res) => {
  const { status, admin_note } = req.body;
  if (!LOAN_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status" });
  if (admin_note && String(admin_note).length > 1000) {
    return res.status(400).json({ error: "admin_note too long (max 1000)" });
  }

  try {
    const outcome = await withTransaction(async (conn) => {
      const [rows] = await conn.query("SELECT * FROM microloans WHERE id=? FOR UPDATE", [req.params.id]);
      if (!rows.length) { const e = new Error("Loan not found"); e.status = 404; throw e; }
      const loan = rows[0];

      if (loan.status === status) {
        // Idempotent no-op: report the existing state, move nothing.
        return { loan, changed: false, disbursed: false, alreadyInState: true };
      }
      const allowed = LOAN_TRANSITIONS[loan.status] || [];
      if (!allowed.includes(status)) {
        const e = new Error(`Cannot move a loan from ${loan.status} to ${status}`);
        e.status = 409;
        throw e;
      }

      const [upd] = await conn.query(
        "UPDATE microloans SET status=?, admin_note=?, reviewed_by=?, reviewed_at=NOW() WHERE id=? AND status=?",
        [status, admin_note || null, req.user.id, req.params.id, loan.status]
      );
      if (upd.affectedRows === 0) {
        const e = new Error("Loan was updated by another request. Please retry.");
        e.status = 409;
        throw e;
      }

      if (status === "disbursed") {
        const amount = parseAmount(loan.amount, "loan.amount", { max: 100000 });
        await conn.query("UPDATE users SET balance = balance + ? WHERE id=?", [amount, loan.user_id]);
        // Unique ref_id: even if the status guard were bypassed, a second
        // insert violates uniq_wallet_ref and rolls the whole thing back.
        await conn.query(
          `INSERT INTO wallet_transactions
             (user_id, type, amount, description_bn, description_en, method, ref_id)
           VALUES (?,?,?,?,?,?,?)`,
          [loan.user_id, "credit", amount,
           `মাইক্রো-লোন বিতরণ (${loan.reference_no})`,
           `Microloan disbursed (${loan.reference_no})`,
           "bank", `loan:${loan.id}:disburse`]
        );
        return { loan, changed: true, disbursed: true, amount };
      }
      return { loan, changed: true, disbursed: false };
    });

    const loan = outcome.loan;

    if (outcome.changed) {
      const msgs = {
        approved:  { bn: "🎉 আপনার লোন অনুমোদিত হয়েছে! শীঘ্রই বিতরণ হবে।", en: "🎉 Your loan is approved! Disbursement soon." },
        rejected:  { bn: "আপনার লোন আবেদন প্রত্যাখ্যাত হয়েছে।",           en: "Your loan application was rejected." },
        disbursed: {
          bn: `✅ ৳${parseFloat(loan.amount).toLocaleString()} আপনার ওয়ালেটে জমা হয়েছে।`,
          en: `✅ ৳${parseFloat(loan.amount).toLocaleString()} credited to your wallet.`,
        },
        repaid:    { bn: "আপনার লোন পরিশোধিত হিসেবে চিহ্নিত হয়েছে।", en: "Your loan has been marked as repaid." },
      };
      if (msgs[status]) {
        pool.query(
          "INSERT INTO notifications (user_id,icon,type,title_bn,title_en,body_bn,body_en) VALUES (?,?,?,?,?,?,?)",
          [loan.user_id, "💹", "alert", "লোন আপডেট", "Loan Update", msgs[status].bn, msgs[status].en]
        ).catch(e => logger.warn("loan notify failed", { err: e.message }));
      }
    }

    cache.del(`loans:user:${loan.user_id}`);
    cache.del(`loans:score:${loan.user_id}`);
    if (outcome.disbursed) {
      cache.del(`user:wallet:${loan.user_id}`);
      cache.del(`user:profile:${loan.user_id}`);
    }
    ["all","pending","approved","disbursed","rejected","repaid"].forEach(s =>
      ["1","2","3"].forEach(p => cache.del(`loans:admin:${s}:p${p}`))
    );

    res.json({
      ok: true,
      status,
      changed: outcome.changed,
      disbursed: outcome.disbursed,
      ...(outcome.alreadyInState && { message: `Loan is already ${status}. No change was made.` }),
    });
  } catch (err) {
    if (err instanceof MoneyError) return res.status(400).json({ error: err.message });
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error("loan update:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
