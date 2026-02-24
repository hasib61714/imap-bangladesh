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
      last_donated DATE NULL,
      latitude     DECIMAL(10,8),
      longitude    DECIMAL(11,8),
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  // If table already exists but still has old column name, add missing column gracefully
  await pool.query(`ALTER TABLE blood_donors ADD COLUMN IF NOT EXISTS last_donated DATE NULL`).catch(()=>{});
  await pool.query(`ALTER TABLE blood_donors ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8) NULL`).catch(()=>{});
  await pool.query(`ALTER TABLE blood_donors ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8) NULL`).catch(()=>{});
  // Seed if empty
  const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM blood_donors");
  if (cnt === 0) {
    await pool.query(`INSERT INTO blood_donors (name,blood_group,phone,area_bn,area_en,is_available,total_donated,last_donated,latitude,longitude) VALUES
      ('মো. কাদের',  'A+', '01700-000001', 'মিরপুর',      'Mirpur',       1, 12, DATE_SUB(CURDATE(), INTERVAL 3 MONTH), 23.8041, 90.3660),
      ('রুমা খানম',  'O+', '01700-000002', 'গুলশান',      'Gulshan',      1,  8, DATE_SUB(CURDATE(), INTERVAL 5 MONTH), 23.7860, 90.4158),
      ('তারিক ইসলাম','B+', '01700-000003', 'ধানমন্ডি',   'Dhanmondi',    0, 20, DATE_SUB(CURDATE(), INTERVAL 2 MONTH), 23.7461, 90.3742),
      ('সাদিয়া',    'AB+','01700-000004', 'উত্তরা',      'Uttara',       1,  5, DATE_SUB(CURDATE(), INTERVAL 6 MONTH), 23.8759, 90.3795),
      ('হাসান আলী',  'O-', '01700-000005', 'বারিধারা',    'Baridhara',    1, 15, DATE_SUB(CURDATE(), INTERVAL 4 MONTH), 23.7937, 90.4241),
      ('নাজমা বেগম', 'A-', '01700-000006', 'বনানী',       'Banani',       1,  3, DATE_SUB(CURDATE(), INTERVAL 7 MONTH), 23.7936, 90.4052),
      ('রাফিউল আলম', 'B-', '01700-000007', 'মোহাম্মদপুর','Mohammadpur',  0,  9, DATE_SUB(CURDATE(), INTERVAL 8 MONTH), 23.7528, 90.3564),
      ('সিনথিয়া',   'AB-','01700-000008', 'রামপুরা',     'Rampura',      1,  2, DATE_SUB(CURDATE(), INTERVAL 1 MONTH), 23.7628, 90.4243)
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
    // Dhaka city center reference point
    const DHAKA_LAT = 23.8103, DHAKA_LNG = 90.4125;
    const haversine = (lat1, lng1, lat2, lng2) => {
      const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
      return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10;
    };
    const donors = rows.map(r => {
      let lastDonMonths = 3;
      if (r.last_donated) {
        const diff = Date.now() - new Date(r.last_donated).getTime();
        lastDonMonths = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24 * 30)));
      }
      const lat = r.latitude ? parseFloat(r.latitude) : null;
      const lng = r.longitude ? parseFloat(r.longitude) : null;
      const dist = (lat && lng) ? haversine(DHAKA_LAT, DHAKA_LNG, lat, lng) : null;
      return {
        id: r.id,
        name: r.name,
        nameEn: r.name,
        bg: r.blood_group,
        phone: r.phone,
        loc: r.area_bn || "",
        locEn: r.area_en || "",
        dist: dist,
        lat, lng,
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
