const router = require("express").Router();
const pool   = require("../db");
const { authMiddleware } = require("../middleware/auth");

// ── GET /api/providers  (list / search / filter) ──────────
router.get("/", async (req, res) => {
  try {
    const { q, category, min_rating, max_price, sort = "rating", page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ["p.is_available = 1", "u.is_active = 1"];
    let params = [];

    if (q) {
      where.push("(u.name LIKE ? OR p.service_type_bn LIKE ? OR p.service_type_en LIKE ? OR p.area_bn LIKE ? OR p.area_en LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    if (category) {
      where.push("c.slug = ?");
      params.push(category);
    }
    if (min_rating) {
      where.push("p.rating >= ?");
      params.push(parseFloat(min_rating));
    }
    if (max_price) {
      where.push("p.hourly_rate <= ?");
      params.push(parseFloat(max_price));
    }

    const orderMap = { rating: "p.rating DESC", price: "p.hourly_rate ASC", jobs: "p.total_jobs DESC", new: "p.created_at DESC" };
    const orderSql = orderMap[sort] || "p.rating DESC";

    const sql = `
      SELECT p.id, p.user_id, u.name, u.avatar, u.phone,
             p.service_type_bn, p.service_type_en,
             p.area_bn, p.area_en,
             p.hourly_rate, p.rating, p.total_jobs,
             p.trust_score, p.is_available, p.nid_verified,
             p.bio_bn, p.bio_en, p.experience_yrs,
             c.name_bn AS cat_bn, c.name_en AS cat_en, c.slug AS cat_slug, c.icon AS cat_icon
      FROM providers p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(" AND ")}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?`;

    params.push(parseInt(limit), offset);
    const [rows] = await pool.query(sql, params);

    // total count
    const [cnt] = await pool.query(
      `SELECT COUNT(*) AS total FROM providers p JOIN users u ON u.id = p.user_id LEFT JOIN categories c ON c.id = p.category_id WHERE ${where.join(" AND ")}`,
      params.slice(0, -2)
    );

    res.json({ providers: rows, total: cnt[0].total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error("providers list:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/providers/:id ────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, u.name, u.avatar, u.phone, u.email, u.kyc_status,
              c.name_bn AS cat_bn, c.name_en AS cat_en, c.icon AS cat_icon
       FROM providers p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Provider not found" });

    const [schedule] = await pool.query(
      "SELECT * FROM provider_schedule WHERE provider_id = ? ORDER BY id",
      [req.params.id]
    );
    const [reviews] = await pool.query(
      `SELECT r.*, u.name AS customer_name, u.avatar AS customer_avatar
       FROM reviews r JOIN users u ON u.id = r.customer_id
       WHERE r.provider_id = ? ORDER BY r.created_at DESC LIMIT 20`,
      [req.params.id]
    );

    res.json({ ...rows[0], schedule, reviews });
  } catch (err) {
    console.error("provider detail:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PUT /api/providers/me ─────────────────────────────────
router.put("/me", authMiddleware, async (req, res) => {
  try {
    const { service_type_bn, service_type_en, area_bn, area_en, bio_bn, bio_en, hourly_rate, is_available, experience_yrs } = req.body;
    const [rows] = await pool.query("SELECT id FROM providers WHERE user_id = ?", [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: "Provider profile not found" });

    await pool.query(
      `UPDATE providers SET
        service_type_bn = COALESCE(?, service_type_bn),
        service_type_en = COALESCE(?, service_type_en),
        area_bn = COALESCE(?, area_bn),
        area_en = COALESCE(?, area_en),
        bio_bn  = COALESCE(?, bio_bn),
        bio_en  = COALESCE(?, bio_en),
        hourly_rate    = COALESCE(?, hourly_rate),
        is_available   = COALESCE(?, is_available),
        experience_yrs = COALESCE(?, experience_yrs)
       WHERE user_id = ?`,
      [service_type_bn||null, service_type_en||null, area_bn||null, area_en||null,
       bio_bn||null, bio_en||null, hourly_rate||null,
       is_available !== undefined ? is_available : null,
       experience_yrs||null, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("update provider:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/providers/me/jobs ────────────────────────────
router.get("/me/jobs", authMiddleware, async (req, res) => {
  try {
    const [prov] = await pool.query("SELECT id FROM providers WHERE user_id = ?", [req.user.id]);
    if (!prov.length) return res.status(404).json({ error: "Provider not found" });

    const [rows] = await pool.query(
      `SELECT b.*, u.name AS customer_name, u.phone AS customer_phone, u.avatar AS customer_avatar
       FROM bookings b JOIN users u ON u.id = b.customer_id
       WHERE b.provider_id = ? ORDER BY b.created_at DESC`,
      [prov[0].id]
    );
    res.json(rows);
  } catch (err) {
    console.error("provider jobs:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/providers/apply  (existing user applies as provider) ──────────
router.post("/apply", authMiddleware, async (req, res) => {
  try {
    const { service_type_bn, service_type_en, area_bn, area_en, bio_bn, bio_en,
            hourly_rate, experience_yrs, nid_number } = req.body;

    // Check if provider row already exists
    const [existing] = await pool.query("SELECT id FROM providers WHERE user_id = ?", [req.user.id]);

    if (existing.length) {
      // Update existing
      await pool.query(
        `UPDATE providers SET
          service_type_bn = COALESCE(?, service_type_bn),
          service_type_en = COALESCE(?, service_type_en),
          area_bn  = COALESCE(?, area_bn),
          area_en  = COALESCE(?, area_en),
          bio_bn   = COALESCE(?, bio_bn),
          bio_en   = COALESCE(?, bio_en),
          hourly_rate    = COALESCE(?, hourly_rate),
          experience_yrs = COALESCE(?, experience_yrs)
         WHERE user_id = ?`,
        [service_type_bn||null, service_type_en||null, area_bn||null, area_en||null,
         bio_bn||null, bio_en||null, hourly_rate||null, experience_yrs||null, req.user.id]
      );
    } else {
      // Create new provider row
      await pool.query(
        `INSERT INTO providers
          (user_id, service_type_bn, service_type_en, area_bn, area_en, bio_bn, bio_en,
           hourly_rate, experience_yrs)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [req.user.id, service_type_bn||null, service_type_en||null, area_bn||null, area_en||null,
         bio_bn||null, bio_en||null, hourly_rate||null, experience_yrs||null]
      );
    }

    // Store NID if provided
    if (nid_number) {
      await pool.query("UPDATE users SET nid_number = ? WHERE id = ?", [nid_number, req.user.id]).catch(()=>{});
    }

    // Mark application pending review
    await pool.query(
      "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
      [req.user.id, "🎉", "system",
       "আবেদন গৃহীত হয়েছে", "Application Received",
       "আপনার প্রোভাইডার আবেদন ২৪–৪৮ ঘণ্টার মধ্যে পর্যালোচনা করা হবে।",
       "Your provider application will be reviewed within 24–48 hours."]
    );

    res.status(201).json({ success: true, message: "Application submitted for review" });
  } catch (err) {
    console.error("provider apply:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
