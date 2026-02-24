const logger = require('../utils/logger');
const router = require("express").Router();
const pool   = require("../db");

// Seed default promos if table is empty
const seed = async () => {
  // Add missing columns if they don't exist (safe migration)
  try { await pool.query("ALTER TABLE promos ADD COLUMN category VARCHAR(50) DEFAULT 'all'"); } catch{}
  try { await pool.query("ALTER TABLE promos ADD COLUMN tag VARCHAR(20) DEFAULT ''"); } catch{}
  try { await pool.query("ALTER TABLE promos ADD COLUMN max_discount DECIMAL(10,2)"); } catch{}

  const [[{ cnt }]] = await pool.query("SELECT COUNT(*) cnt FROM promos");
  if (cnt === 0) {
    await pool.query(`INSERT INTO promos (code,title_bn,title_en,discount_pct,discount_amt,max_discount,min_order,max_uses,used_count,category,tag,valid_until) VALUES
      ('IMAP20',   'সব সেবায় ২০% ছাড়',         '20% off all services',          20, 150, 150, 300, 2000, 1240, 'all',         'hot',   DATE_ADD(CURDATE(), INTERVAL 30 DAY)),
      ('FIRST50',  'প্রথম বুকিংয়ে ৫০% ছাড়',   '50% off your first booking',    50, 200, 200, 200, 1000,  890, 'all',         'new',   DATE_ADD(CURDATE(), INTERVAL 60 DAY)),
      ('ELEC15',   'ইলেকট্রিক সেবায় ১৫% ছাড়', '15% off electrical services',   15, 120, 120, 250,  500,  340, 'electrical',  '',      DATE_ADD(CURDATE(), INTERVAL 45 DAY)),
      ('CLEAN30',  'গৃহপরিচ্ছন্নতায় ৩০% ছাড়', '30% off cleaning services',     30, 180, 180, 300,  800,  620, 'cleaning',    '',      DATE_ADD(CURDATE(), INTERVAL 45 DAY)),
      ('NURSE10',  'নার্সিং সেবায় ১০% ছাড়',   '10% off nursing services',      10, 100, 100, 400,  300,  180, 'medical',     'new',   DATE_ADD(CURDATE(), INTERVAL 60 DAY)),
      ('FLASH40',  'ফ্ল্যাশ সেল — ৪০% ছাড়',   'Flash sale — 40% off',          40, 250, 250, 500, 2000, 1890, 'all',         'flash', DATE_ADD(CURDATE(), INTERVAL 1 DAY))
    `);
  }
};
seed().catch(e => logger.warn("promo seed:", e.message));

// GET /api/promos — list all active promos
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, title_bn AS descBn, title_en AS descEn,
              title_bn, title_en,
              discount_pct AS pct,
              COALESCE(max_discount, discount_amt) AS maxTk,
              min_order AS minOrder,
              max_uses AS \`limit\`,
              used_count AS uses,
              COALESCE(category, 'all') AS cat,
              COALESCE(tag, '') AS tag,
              valid_until AS expiry,
              is_active
       FROM promos
       WHERE is_active=1 AND (valid_until IS NULL OR valid_until >= CURDATE())
       ORDER BY FIELD(COALESCE(tag,''), 'flash','hot','new','') ASC`
    );
    res.json({ coupons: rows });
  } catch (e) {
    logger.error("promos list:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/promos/validate — check a promo code
router.post("/validate", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ valid: false, error: "No code provided" });
    const [[promo]] = await pool.query(
      `SELECT * FROM promos WHERE code=? AND is_active=1
       AND (valid_until IS NULL OR valid_until >= CURDATE())
       AND used_count < max_uses`,
      [code.trim().toUpperCase()]
    );
    if (!promo) return res.json({ valid: false, error: "Invalid or expired code" });
    res.json({
      valid: true,
      promo: {
        code:     promo.code,
        pct:      promo.discount_pct,
        maxTk:    promo.max_discount || promo.discount_amt,
        minOrder: promo.min_order,
        titleBn:  promo.title_bn,
        titleEn:  promo.title_en,
      }
    });
  } catch (e) {
    logger.error("promo validate:", e);
    res.status(500).json({ valid: false, error: "Server error" });
  }
});

module.exports = router;
