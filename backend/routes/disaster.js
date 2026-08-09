const logger = require('../utils/logger');
const router = require("express").Router();
const pool   = require("../db");
const { authMiddleware } = require("../middleware/auth");
const cache = require('../utils/cache');

// Ensure disaster_reports table exists
const initTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS disaster_reports (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     VARCHAR(36),
      reporter_name VARCHAR(120),
      type        VARCHAR(60) NOT NULL,
      description TEXT,
      area        VARCHAR(120),
      severity    ENUM('low','medium','high','critical') DEFAULT 'medium',
      status      ENUM('pending','confirmed','resolved') DEFAULT 'pending',
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  // ── P0-10: four fabricated disaster alerts — including a "critical"
  // cyclone warning for Cox's Bazar — were seeded into the production
  // database and served publicly as live emergency information. Users
  // could take shelter or evacuation decisions based on invented data.
  //
  // Seeding is development-only now, and seeded rows carry is_demo=1 so
  // production reads exclude them.
  if (process.env.NODE_ENV === "production") return;

  const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM disaster_reports");
  if (cnt === 0) {
    await pool.query(`INSERT INTO disaster_reports (type,description,area,severity,status,is_demo,created_at) VALUES
      ('flood',     '[DEMO] পানি বন্দি এলাকা, উচ্চতা ৩ ফুট', 'সিলেট সদর',      'high',     'confirmed', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
      ('cyclone',   '[DEMO] সাইক্লোন সতর্কতা জারি',          'কক্সবাজার',      'critical', 'pending',   1, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
      ('earthquake','[DEMO] ভূমিকম্পের ঝুঁকি চিহ্নিত',       'চট্টগ্রাম',      'medium',   'confirmed', 1, DATE_SUB(NOW(), INTERVAL 1 DAY)),
      ('fire',      '[DEMO] আবাসিক এলাকায় আগুন',             'ঢাকা – মিরপুর', 'high',     'resolved',  1, DATE_SUB(NOW(), INTERVAL 3 DAY))
    `).catch(e => logger.warn("disaster demo seed skipped:", e.message));
  }
};
initTable().catch(e => logger.warn("disaster table init:", e.message));

/** Production must never serve demo rows as real alerts. */
const DEMO_FILTER = process.env.NODE_ENV === "production" ? " WHERE is_demo = 0" : "";

// GET /api/disaster/alerts  — public
//
// These are user-submitted reports, not warnings from a meteorological
// authority. The response says so explicitly so the client cannot present
// them as verified alerts.
router.get("/alerts", async (_req, res) => {
  try {
    const alerts = await cache.getOrSet('disaster:alerts', async () => {
      const [rows] = await pool.query(
        `SELECT id, user_id, reporter_name, type, description, area, severity, status, is_demo, created_at
           FROM disaster_reports${DEMO_FILTER} ORDER BY created_at DESC LIMIT 20`
      );
      return rows;
    }, 30);
    res.json({
      alerts,
      // Consumed by the UI to label the list correctly.
      verified_source: false,
      source: "user_reports",
      notice: "Community-submitted reports. Not verified against any official warning service. For official alerts contact the Bangladesh Meteorological Department or call 999.",
      notice_bn: "ব্যবহারকারীর জমা দেওয়া রিপোর্ট। কোনো সরকারি সতর্কবার্তা সেবার সাথে যাচাই করা হয়নি। সরকারি সতর্কতার জন্য আবহাওয়া অধিদপ্তর বা ৯৯৯ নম্বরে যোগাযোগ করুন।",
    });
  } catch (e) {
    logger.error("disaster alerts:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/disaster/report  — anyone can report (anonymous; user_id never trusted from body)
router.post("/report", async (req, res) => {
  try {
    const { type, description, area, severity, reporter_name } = req.body;
    if (!type || typeof type !== "string" || type.trim().length > 60)
      return res.status(400).json({ error: "Disaster type required (max 60 chars)" });
    if (description && description.length > 1000) return res.status(400).json({ error: "description max 1000 chars" });
    if (area && area.length > 120) return res.status(400).json({ error: "area max 120 chars" });
    if (reporter_name && reporter_name.length > 120) return res.status(400).json({ error: "reporter_name max 120 chars" });
    const sev = ['low','medium','high','critical'].includes(severity) ? severity : 'medium';
    const [result] = await pool.query(
      "INSERT INTO disaster_reports (user_id,reporter_name,type,description,area,severity) VALUES (?,?,?,?,?,?)",
      [null, reporter_name||null, type, description||"", area||"", sev]
    );
    cache.del('disaster:alerts');
    res.json({ success: true, id: result.insertId });
  } catch (e) {
    logger.error("disaster report:", e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
