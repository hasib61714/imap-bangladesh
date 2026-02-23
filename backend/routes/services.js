const router = require("express").Router();
const pool   = require("../db");
const { authMiddleware, requireRole } = require("../middleware/auth");

// ── GET /api/services ─────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const all = req.query.all === "1";
    const where = all ? "" : "WHERE c.is_active = 1";
    const [rows] = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(*) FROM providers p WHERE p.category_id = c.id AND p.is_available = 1) AS available_count
       FROM categories c ${where} ORDER BY c.sort_order`
    );
    res.json(rows);
  } catch (err) {
    console.error("services:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/services  (admin) ───────────────────────────
router.post("/", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { slug, name_bn, name_en, icon, color, base_price, sort_order } = req.body;
    if (!slug || !name_bn || !name_en) return res.status(400).json({ error: "slug, name_bn, name_en required" });

    await pool.query(
      "INSERT INTO categories (slug, name_bn, name_en, icon, color, base_price, sort_order) VALUES (?,?,?,?,?,?,?)",
      [slug, name_bn, name_en, icon || "🔧", color || "#1DBF73", base_price || 300, sort_order || 0]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error("create category:", err);
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
    res.json({ success: true });
  } catch (err) {
    console.error("update category:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE /api/services/:id  (admin) ────────────────────
router.delete("/:id", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    await pool.query("UPDATE categories SET is_active = 0 WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
