const logger = require('../utils/logger');
const router = require("express").Router();
const pool   = require("../db");
const { authMiddleware } = require("../middleware/auth");
const cache = require('../utils/cache');
const env   = require("../config/environment");

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
  // ── P0-10: eight fabricated donors — names, phone numbers, donation
  // counts and GPS coordinates — used to be seeded into the production
  // database and served as real people. A user in a medical emergency
  // could call a number that belongs to nobody.
  //
  // Seeding is now development-only, and every seeded row is flagged
  // is_demo=1 so production reads exclude it (see DEMO_FILTER below).
  if (env.isProduction()) return;

  const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM blood_donors");
  if (cnt === 0) {
    await pool.query(`INSERT INTO blood_donors (name,blood_group,phone,area_bn,area_en,is_available,total_donated,last_donated,latitude,longitude,is_demo) VALUES
      ('[DEMO] মো. কাদের',  'A+', '01700-000001', 'মিরপুর',      'Mirpur',       1, 12, DATE_SUB(CURDATE(), INTERVAL 3 MONTH), 23.8041, 90.3660, 1),
      ('[DEMO] রুমা খানম',  'O+', '01700-000002', 'গুলশান',      'Gulshan',      1,  8, DATE_SUB(CURDATE(), INTERVAL 5 MONTH), 23.7860, 90.4158, 1),
      ('[DEMO] তারিক ইসলাম','B+', '01700-000003', 'ধানমন্ডি',   'Dhanmondi',    0, 20, DATE_SUB(CURDATE(), INTERVAL 2 MONTH), 23.7461, 90.3742, 1),
      ('[DEMO] সাদিয়া',    'AB+','01700-000004', 'উত্তরা',      'Uttara',       1,  5, DATE_SUB(CURDATE(), INTERVAL 6 MONTH), 23.8759, 90.3795, 1),
      ('[DEMO] হাসান আলী',  'O-', '01700-000005', 'বারিধারা',    'Baridhara',    1, 15, DATE_SUB(CURDATE(), INTERVAL 4 MONTH), 23.7937, 90.4241, 1),
      ('[DEMO] নাজমা বেগম', 'A-', '01700-000006', 'বনানী',       'Banani',       1,  3, DATE_SUB(CURDATE(), INTERVAL 7 MONTH), 23.7936, 90.4052, 1),
      ('[DEMO] রাফিউল আলম', 'B-', '01700-000007', 'মোহাম্মদপুর','Mohammadpur',  0,  9, DATE_SUB(CURDATE(), INTERVAL 8 MONTH), 23.7528, 90.3564, 1),
      ('[DEMO] সিনথিয়া',   'AB-','01700-000008', 'রামপুরা',     'Rampura',      1,  2, DATE_SUB(CURDATE(), INTERVAL 1 MONTH), 23.7628, 90.4243, 1)
    `).catch(e => logger.warn("blood demo seed skipped:", e.message));
  }
};
initTable().catch(e => logger.warn("blood table init:", e.message));

/** Production must never read demo rows. */
const DEMO_FILTER = env.isProduction() ? " AND is_demo = 0" : "";

/**
 * Donor phone numbers are personal data belonging to volunteers.
 * They are masked in listings; the full number is released only through
 * POST /api/blood/:id/contact, which requires authentication and records
 * who asked for it (P1-2).
 */
function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 5) return "•••";
  return `${digits.slice(0, 3)}${"•".repeat(Math.max(3, digits.length - 5))}${digits.slice(-2)}`;
}

// GET /api/blood  — list donors (authentication required)
//
// P1-2: this was unauthenticated and returned every donor's full phone
// number and exact GPS coordinates. Donors are volunteers who registered
// to help, not a public directory. The list now requires a signed-in user,
// masks the phone number, and omits precise coordinates.
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { group } = req.query;
    const VALID_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
    if (group && group !== "all" && !VALID_GROUPS.includes(group)) {
      return res.status(400).json({ error: "Invalid blood group" });
    }
    const cacheKey = `blood:donors:${group || 'all'}`;
    const donors = await cache.getOrSet(cacheKey, async () => {
      let sql = `SELECT id, name, blood_group, phone, area_bn, area_en,
                        is_available, total_donated, last_donated, is_demo
                   FROM blood_donors WHERE 1=1${DEMO_FILTER}`;
      const params = [];
      if (group && group !== "all") { sql += " AND blood_group = ?"; params.push(group); }
      sql += " ORDER BY is_available DESC, total_donated DESC LIMIT 200";
      const [rows] = await pool.query(sql, params);

      return rows.map(r => {
        let lastDonMonths = null;
        if (r.last_donated) {
          const diff = Date.now() - new Date(r.last_donated).getTime();
          lastDonMonths = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24 * 30)));
        }
        return {
          id: r.id,
          name: r.name,
          nameEn: r.name,
          bg: r.blood_group,
          // Masked. Use POST /api/blood/:id/contact for the real number.
          phone: maskPhone(r.phone),
          phone_masked: true,
          loc: r.area_bn || "",
          locEn: r.area_en || "",
          // `dist` used to be the distance from Dhaka city centre, shown
          // to every user as if it were their own distance. Removed rather
          // than left misleading; precise donor coordinates are not public.
          dist: null,
          lat: null, lng: null,
          avail: !!r.is_available,
          dons: r.total_donated || 0,
          lastDon: lastDonMonths,
          is_demo: !!r.is_demo,
        };
      });
    }, 120);
    res.json({ donors, verified_source: false });
  } catch (e) {
    logger.error("blood list:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/blood/:id/contact — release a donor's real phone number.
// An explicit, authenticated, logged action rather than bulk exposure.
router.post("/:id/contact", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, phone, blood_group, is_available, is_demo
         FROM blood_donors WHERE id = ?${DEMO_FILTER} LIMIT 1`,
      [parseInt(req.params.id, 10) || 0]
    );
    if (!rows.length) return res.status(404).json({ error: "Donor not found" });
    const donor = rows[0];
    if (!donor.is_available) {
      return res.status(409).json({ error: "This donor is not currently available." });
    }
    logger.info("blood donor contact released", {
      requestedBy: req.user.id, donorId: donor.id,
    });
    res.json({
      id: donor.id,
      name: donor.name,
      blood_group: donor.blood_group,
      phone: donor.phone,
      is_demo: !!donor.is_demo,
      notice: donor.is_demo
        ? "This is demonstration data. The number does not belong to a real donor."
        : "Please contact this volunteer respectfully. Their number was shared for this request only.",
    });
  } catch (e) {
    logger.error("blood contact:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/blood/register — register as donor
router.post("/register", authMiddleware, async (req, res) => {
  try {
    const { blood_group, phone, area_bn, area_en } = req.body;
    const validGroups = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
    if (!blood_group || !validGroups.includes(blood_group))
      return res.status(400).json({ error: "Valid blood group required (A+, A-, B+, B-, AB+, AB-, O+, O-)" });
    if (!phone || typeof phone !== "string" || !/^[0-9+\-\s]{7,20}$/.test(phone.trim()))
      return res.status(400).json({ error: "Valid phone number required" });
    if (area_bn && area_bn.length > 100) return res.status(400).json({ error: "area_bn max 100 chars" });
    if (area_en && area_en.length > 100) return res.status(400).json({ error: "area_en max 100 chars" });
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
    // Bust donor list cache for the registered group and 'all'
    cache.del(`blood:donors:${blood_group}`);
    cache.del('blood:donors:all');
    res.json({ success: true });
  } catch (e) {
    logger.error("blood register:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/blood/request — record a blood request
//
// P0-10 / truthfulness: this used to write a single log line and then tell
// the user "Request sent to available donors". No donor was ever contacted
// and the request was not stored anywhere — someone in a medical emergency
// was told help was on the way when nothing had happened.
//
// The request is now persisted, and the response describes exactly what
// the platform did and did not do.
router.post("/request", authMiddleware, async (req, res) => {
  try {
    const { blood_group, name, message, phone, area } = req.body;
    const validGroups = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
    if (!blood_group || !validGroups.includes(blood_group)) return res.status(400).json({ error: "Valid blood group required" });
    if (!name || typeof name !== "string" || !name.trim() || name.trim().length > 100) return res.status(400).json({ error: "Name required (max 100 chars)" });
    if (message && message.length > 500) return res.status(400).json({ error: "Message max 500 chars" });
    if (phone && String(phone).length > 40) return res.status(400).json({ error: "Phone too long" });
    if (area && String(area).length > 120) return res.status(400).json({ error: "Area too long" });

    const contact = phone ? String(phone).trim() : (req.user.phone || null);

    const [result] = await pool.query(
      `INSERT INTO blood_requests (user_id, requester, blood_group, contact, message, area, status)
       VALUES (?,?,?,?,?,?, 'received')`,
      [req.user.id, name.trim(), blood_group, contact, message || null, area || null]
    );

    // Notify administrators so a human can act on it. This is the only
    // outbound step that actually exists today.
    let adminNotified = 0;
    try {
      const [admins] = await pool.query("SELECT id FROM users WHERE role='admin' AND is_active=1 LIMIT 10");
      for (const a of admins) {
        await pool.query(
          "INSERT INTO notifications (user_id,icon,type,title_bn,title_en,body_bn,body_en) VALUES (?,?,?,?,?,?,?)",
          [a.id, "🩸", "alert", "রক্তের অনুরোধ", "Blood Request",
           `${name.trim()} — ${blood_group} প্রয়োজন`, `${name.trim()} needs ${blood_group}`]
        );
      }
      adminNotified = admins.length;
    } catch (e) {
      logger.warn("blood request admin notify failed", { err: e.message });
    }

    // No automated donor notification channel exists. Say so.
    res.status(201).json({
      success: true,
      request_id: result.insertId,
      status: "received",
      donors_notified: 0,
      admins_notified: adminNotified,
      message: "Your request has been recorded. Automatic donor notification is not available yet — please also contact donors directly from the donor list, and call 999 in an emergency.",
      message_bn: "আপনার অনুরোধ রেকর্ড করা হয়েছে। স্বয়ংক্রিয় ডোনার নোটিফিকেশন এখনো চালু হয়নি — ডোনার তালিকা থেকে সরাসরি যোগাযোগ করুন, এবং জরুরি অবস্থায় ৯৯৯ নম্বরে কল করুন।",
    });
  } catch (e) {
    logger.error("blood request:", e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
