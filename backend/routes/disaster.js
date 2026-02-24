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
  // Seed
  const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM disaster_reports");
  if (cnt === 0) {
    await pool.query(`INSERT INTO disaster_reports (type,description,area,severity,status,created_at) VALUES
      ('flood',     'পানি বন্দি এলাকা, উচ্চতা ৩ ফুট', 'সিলেট সদর',      'high',     'confirmed', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
      ('cyclone',   'সাইক্লোন সতর্কতা জারি',          'কক্সবাজার',      'critical', 'pending',   DATE_SUB(NOW(), INTERVAL 5 HOUR)),
      ('earthquake','ভূমিকম্পের ঝুঁকি চিহ্নিত',       'চট্টগ্রাম',      'medium',   'confirmed', DATE_SUB(NOW(), INTERVAL 1 DAY)),
      ('fire',      'আবাসিক এলাকায় আগুন',             'ঢাকা – মিরপুর', 'high',     'resolved',  DATE_SUB(NOW(), INTERVAL 3 DAY))
    `);
  }
};
initTable().catch(e => logger.warn("disaster table init:", e.message));

// GET /api/disaster/alerts  — public
router.get("/alerts", async (_req, res) => {
  try {
    const alerts = await cache.getOrSet('disaster:alerts', async () => {
      const [rows] = await pool.query(
        "SELECT * FROM disaster_reports ORDER BY created_at DESC LIMIT 20"
      );
      return rows;
    }, 30);
    res.json({ alerts });
  } catch (e) {
    logger.error("disaster alerts:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/disaster/report  — anyone can report
router.post("/report", async (req, res) => {
  try {
    const { type, description, area, severity, reporter_name, user_id } = req.body;
    if (!type) return res.status(400).json({ error: "Missing disaster type" });
    const sev = ['low','medium','high','critical'].includes(severity) ? severity : 'medium';
    const [result] = await pool.query(
      "INSERT INTO disaster_reports (user_id,reporter_name,type,description,area,severity) VALUES (?,?,?,?,?,?)",
      [user_id||null, reporter_name||null, type, description||"", area||"", sev]
    );
    cache.del('disaster:alerts');
    res.json({ success: true, id: result.insertId });
  } catch (e) {
    logger.error("disaster report:", e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
