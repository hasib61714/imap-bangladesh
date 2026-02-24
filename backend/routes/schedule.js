const logger = require('../utils/logger');
const router = require("express").Router();
const pool   = require("../db");
const { authMiddleware } = require("../middleware/auth");

// Seed default slots for a provider if they have none
const seedDefaultSlots = async (providerId) => {
  const [[{ cnt }]] = await pool.query(
    "SELECT COUNT(*) cnt FROM provider_schedule WHERE provider_id=?", [providerId]
  );
  if (cnt > 0) return;
  const defaults = [
    ["সোমবার",    "Monday",    "সকাল ৯টা",    "9:00 AM",  1],
    ["সোমবার",    "Monday",    "দুপুর ১২টা",   "12:00 PM", 1],
    ["সোমবার",    "Monday",    "বিকাল ৩টা",   "3:00 PM",  1],
    ["মঙ্গলবার",  "Tuesday",   "সকাল ১০টা",   "10:00 AM", 1],
    ["মঙ্গলবার",  "Tuesday",   "দুপুর ২টা",    "2:00 PM",  1],
    ["মঙ্গলবার",  "Tuesday",   "সন্ধ্যা ৬টা", "6:00 PM",  1],
    ["বুধবার",    "Wednesday", "সকাল ৯টা",    "9:00 AM",  1],
    ["বুধবার",    "Wednesday", "দুপুর ১২টা",  "12:00 PM", 1],
    ["বুধবার",    "Wednesday", "বিকাল ৪টা",   "4:00 PM",  1],
    ["বৃহস্পতিবার","Thursday", "সকাল ১০টা",  "10:00 AM", 1],
    ["বৃহস্পতিবার","Thursday", "দুপুর ১টা",   "1:00 PM",  1],
    ["শুক্রবার",  "Friday",    "সকাল ৯টা",    "9:00 AM",  1],
    ["শনিবার",    "Saturday",  "সকাল ১০টা",  "10:00 AM", 1],
    ["শনিবার",    "Saturday",  "দুপুর ২টা",  "2:00 PM",   1],
  ];
  if (defaults.length) {
    const ph = defaults.map(() => "(?,?,?,?,?)").join(",");
    const vals = defaults.flatMap(([bn, en, slot_bn, slot_en, avail]) =>
      [providerId, bn, en, `${slot_bn} / ${slot_en}`, avail]
    );
    await pool.query(
      `INSERT INTO provider_schedule (provider_id,day_name_bn,day_name_en,slot_time,is_available) VALUES ${ph}`,
      vals
    );
  }
};

// GET /api/schedule  — get my schedule (provider auth required)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    // Get provider record
    const [[prov]] = await pool.query("SELECT id FROM providers WHERE user_id=?", [uid]);
    if (!prov) return res.json({ slots: {} });
    await seedDefaultSlots(prov.id);
    const [rows] = await pool.query(
      "SELECT * FROM provider_schedule WHERE provider_id=? ORDER BY id",
      [prov.id]
    );
    // Group by day
    const slots = {};
    rows.forEach(r => {
      const day = r.day_name_bn || r.day_name_en;
      if (!slots[day]) slots[day] = [];
      slots[day].push({ id: r.id, t: r.slot_time, avail: !!r.is_available });
    });
    res.json({ slots });
  } catch (e) {
    logger.error("schedule get:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/schedule/:slotId — toggle availability
router.patch("/:slotId", authMiddleware, async (req, res) => {
  try {
    const { slotId } = req.params;
    const { avail } = req.body;
    const uid = req.user.id;
    // Verify slot belongs to this provider
    const [[prov]] = await pool.query("SELECT id FROM providers WHERE user_id=?", [uid]);
    if (!prov) return res.status(403).json({ error: "Not a provider" });
    await pool.query(
      "UPDATE provider_schedule SET is_available=? WHERE id=? AND provider_id=?",
      [avail ? 1 : 0, slotId, prov.id]
    );
    res.json({ success: true });
  } catch (e) {
    logger.error("schedule patch:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/schedule/provider/:providerId — public; customer can check availability
router.get("/provider/:providerId", async (req, res) => {
  try {
    const { providerId } = req.params;
    const [rows] = await pool.query(
      "SELECT id,day_name_bn,day_name_en,slot_time,is_available FROM provider_schedule WHERE provider_id=? ORDER BY id",
      [providerId]
    );
    const slots = {};
    rows.forEach(r => {
      const day = r.day_name_bn || r.day_name_en;
      if (!slots[day]) slots[day] = [];
      slots[day].push({ id: r.id, t: r.slot_time, avail: !!r.is_available });
    });
    res.json({ slots });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
