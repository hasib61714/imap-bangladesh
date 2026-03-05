const logger = require('../utils/logger');
const router = require("express").Router();
const pool   = require("../db");
const { authMiddleware, requireRole } = require("../middleware/auth");
const cache  = require("../utils/cache");

// ── GET /api/services ─────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const all = req.query.all === "1";
    const key = `services:${all ? "all" : "active"}`;
    const rows = await cache.getOrSet(key, async () => {
      const where = all ? "" : "WHERE c.is_active = 1";
      const [r] = await pool.query(
        `SELECT c.*,
           (SELECT COUNT(*) FROM providers p WHERE p.category_id = c.id AND p.is_available = 1) AS available_count
         FROM categories c ${where} ORDER BY c.sort_order`
      );
      return r;
    }, 60);
    res.json(rows);
  } catch (err) {
    logger.error("services:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/services  (admin) ───────────────────────────
router.post("/", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { slug, name_bn, name_en, icon, color, base_price, sort_order } = req.body;
    if (!slug || !name_bn || !name_en) return res.status(400).json({ error: "slug, name_bn, name_en required" });
    if (slug.length > 80 || name_bn.length > 120 || name_en.length > 120)
      return res.status(400).json({ error: "slug max 80, names max 120 chars" });
    if (icon  && icon.length  > 20) return res.status(400).json({ error: "icon too long (max 20)" });
    if (color && color.length > 30) return res.status(400).json({ error: "color too long (max 30)" });

    await pool.query(
      "INSERT INTO categories (slug, name_bn, name_en, icon, color, base_price, sort_order) VALUES (?,?,?,?,?,?,?)",
      [slug, name_bn, name_en, icon || "🔧", color || "#1DBF73", base_price || 300, sort_order || 0]
    );
    cache.del("services:active"); cache.del("services:all");
    res.status(201).json({ success: true });
  } catch (err) {
    logger.error("create category:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PUT /api/services/:id  (admin) ────────────────────────
router.put("/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { name_bn, name_en, icon, color, base_price, is_active, sort_order } = req.body;
    await pool.query(
      `UPDATE categories SET
         name_bn    = COALESCE(?, name_bn),
         name_en    = COALESCE(?, name_en),
         icon       = COALESCE(?, icon),
         color      = COALESCE(?, color),
         base_price = COALESCE(?, base_price),
         is_active  = COALESCE(?, is_active),
         sort_order = COALESCE(?, sort_order)
       WHERE id = ?`,
      [name_bn||null, name_en||null, icon||null, color||null, base_price||null,
       is_active !== undefined ? is_active : null, sort_order||null, req.params.id]
    );
    cache.del("services:active"); cache.del("services:all");
    res.json({ success: true });
  } catch (err) {
    logger.error("update category:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE /api/services/:id  (admin) ────────────────────────
router.delete("/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    await pool.query("UPDATE categories SET is_active = 0 WHERE id = ?", [req.params.id]);
    cache.del("services:active"); cache.del("services:all");
    res.json({ success: true });
  } catch (err) {
    logger.error("delete category:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
