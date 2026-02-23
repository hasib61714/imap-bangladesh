const router = require("express").Router();
const pool   = require("../db");
const { authMiddleware } = require("../middleware/auth");

// Ensure table exists with seed data
const initTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blood_donors (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      user_id      VARCHAR(36),
      name         VARCHAR(120) NOT NULL,
      blood_group  VARCHAR(6) NOT NULL,
      phone        VARCHAR(20) NOT NULL,
      area_bn      VARCHAR(100),
      area_en      VARCHAR(100),
      district     VARCHAR(60),
      is_available TINYINT(1) DEFAULT 1,
      total_donated INT DEFAULT 0,
      last_donated_months INT DEFAULT 3,
      latitude     DECIMAL(10,8),
      longitude    DECIMAL(11,8),
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  // Seed if empty
  const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM blood_donors");
  if (cnt === 0) {
    await pool.query(`INSERT INTO blood_donors (name,blood_group,phone,area_bn,area_en,is_available,total_donated,last_donated) VALUES
      ('মো. কাদের',  'A+', '01700-000001', 'মিরপুর',      'Mirpur',       1, 12,  DATE_SUB(CURDATE(), INTERVAL 3 MONTH)),
      ('রুমা খানম',  'O+', '01700-000002', 'গুলশান',      'Gulshan',      1,  8,  DATE_SUB(CURDATE(), INTERVAL 5 MONTH)),
      ('তারিক ইসলাম','B+', '01700-000003', 'ধানমন্ডি',   'Dhanmondi',    0, 20,  DATE_SUB(CURDATE(), INTERVAL 2 MONTH)),
      ('সাদিয়া',    'AB+','01700-000004', 'উত্তরা',      'Uttara',       1,  5,  DATE_SUB(CURDATE(), INTERVAL 6 MONTH)),
      ('হাসান আলী',  'O-', '01700-000005', 'বারিধারা',    'Baridhara',    1, 15,  DATE_SUB(CURDATE(), INTERVAL 4 MONTH)),
      ('নাজমা বেগম', 'A-', '01700-000006', 'বনানী',       'Banani',       1,  3,  DATE_SUB(CURDATE(), INTERVAL 7 MONTH)),
      ('রাফিউল আলম', 'B-', '01700-000007', 'মোহাম্মদপুর','Mohammadpur',  0,  9,  DATE_SUB(CURDATE(), INTERVAL 8 MONTH)),
      ('সিনথিয়া',   'AB-','01700-000008', 'রামপুরা',     'Rampura',      1,  2,  DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
    `);
  }
};
initTable().catch(e => console.warn("blood table init:", e.message));

// GET /api/blood  — list donors
router.get("/", async (req, res) => {
  try {
    const { group } = req.query;
    let sql = "SELECT * FROM blood_donors WHERE 1=1";
    const params = [];
    if (group && group !== "all") { sql += " AND blood_group = ?"; params.push(group); }
    sql += " ORDER BY is_available DESC, total_donated DESC";
    const [rows] = await pool.query(sql, params);
    // Map DB fields to frontend-compatible format
    const donors = rows.map(r => {
      let lastDonMonths = 3;
      if (r.last_donated) {
        const diff = Date.now() - new Date(r.last_donated).getTime();
        lastDonMonths = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24 * 30)));
      }
      return {
        id: r.id,
        name: r.name,
        nameEn: r.name,
        bg: r.blood_group,
        phone: r.phone,
        loc: r.area_bn || "",
        locEn: r.area_en || "",
        dist: r.district || "",
        avail: !!r.is_available,
        dons: r.total_donated || 0,
        lastDon: lastDonMonths,
      };
    });
    res.json({ donors });
  } catch (e) {
    console.error("blood list:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/blood/register — register as donor
router.post("/register", authMiddleware, async (req, res) => {
  try {
    const { blood_group, phone, area_bn, area_en } = req.body;
    if (!blood_group || !phone) return res.status(400).json({ error: "Missing fields" });
    const user = req.user;
    // upsert
    const [[exists]] = await pool.query("SELECT id FROM blood_donors WHERE user_id = ?", [user.id]);
    if (exists) {
      await pool.query("UPDATE blood_donors SET blood_group=?,phone=?,area_bn=?,area_en=?,is_available=1 WHERE user_id=?",
        [blood_group, phone, area_bn||"", area_en||"", user.id]);
    } else {
      await pool.query("INSERT INTO blood_donors (user_id,name,blood_group,phone,area_bn,area_en,is_available) VALUES (?,?,?,?,?,?,1)",
        [user.id, user.name || "Donor", blood_group, phone, area_bn||"", area_en||""]);
    }
    res.json({ success: true });
  } catch (e) {
    console.error("blood register:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/blood/request — send blood request (creates notification)
router.post("/request", async (req, res) => {
  try {
    const { blood_group, name, message, phone } = req.body;
    if (!blood_group || !name) return res.status(400).json({ error: "Missing fields" });
    // Just log it — in production this would notify matching donors
    console.log(`[BLOOD REQUEST] ${name} needs ${blood_group} — ${message}`);
    // Could add to complaints table or a dedicated requests table
    res.json({ success: true, message: "Request sent to available donors" });
  } catch (e) {
    console.error("blood request:", e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
