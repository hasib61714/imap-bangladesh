const router = require("express").Router();
const pool   = require("../db");
const { authMiddleware, requireRole } = require("../middleware/auth");
const auth = [authMiddleware, requireRole("admin")];

// ── GET /api/admin/stats ──────────────────────────────────
router.get("/stats", ...auth, async (req, res) => {
  try {
    const [[users]]     = await pool.query("SELECT COUNT(*) AS v FROM users WHERE role = 'customer'");
    const [[providers]] = await pool.query("SELECT COUNT(*) AS v FROM users WHERE role = 'provider'");
    const [[bookings]]  = await pool.query("SELECT COUNT(*) AS v FROM bookings");
    const [[revenue]]   = await pool.query("SELECT COALESCE(SUM(amount+platform_fee),0) AS v FROM bookings WHERE status = 'completed'");
    const [[kycPending]]= await pool.query("SELECT COUNT(*) AS v FROM kyc_docs WHERE status = 'pending'");
    const [[complaints]]= await pool.query("SELECT COUNT(*) AS v FROM complaints WHERE status = 'open'");
    const [[avgRating]] = await pool.query("SELECT ROUND(AVG(rating),2) AS v FROM reviews");
    const [[todayBooks]]= await pool.query("SELECT COUNT(*) AS v FROM bookings WHERE DATE(created_at) = CURDATE()");

    res.json({
      users:      users.v,
      providers:  providers.v,
      bookings:   bookings.v,
      revenue:    revenue.v,
      kycPending: kycPending.v,
      complaints: complaints.v,
      avgRating:  avgRating.v || 0,
      todayBookings: todayBooks.v,
    });
  } catch (err) {
    console.error("admin stats:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/users ──────────────────────────────────
router.get("/users", ...auth, async (req, res) => {
  try {
    const { q, role, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ["1=1"], params = [];
    if (q) { where.push("(name LIKE ? OR email LIKE ? OR phone LIKE ?)"); const l = `%${q}%`; params.push(l,l,l); }
    if (role) { where.push("role = ?"); params.push(role); }

    const [rows] = await pool.query(
      `SELECT id, name, email, phone, role, kyc_status, verified, balance, points, is_active, joined_at
       FROM users WHERE ${where.join(" AND ")} ORDER BY joined_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const [[total]] = await pool.query(
      `SELECT COUNT(*) AS v FROM users WHERE ${where.join(" AND ")}`, params
    );
    res.json({ users: rows, total: total.v });
  } catch (err) {
    console.error("admin users:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/admin/users/:id ────────────────────────────
router.patch("/users/:id", ...auth, async (req, res) => {
  try {
    const { is_active, role } = req.body;
    await pool.query(
      "UPDATE users SET is_active = COALESCE(?, is_active), role = COALESCE(?, role) WHERE id = ?",
      [is_active !== undefined ? is_active : null, role || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("admin update user:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/bookings ───────────────────────────────
router.get("/bookings", ...auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ["1=1"], params = [];
    if (status) { where.push("b.status = ?"); params.push(status); }

    const [rows] = await pool.query(
      `SELECT b.*, cu.name AS customer_name, pu.name AS provider_name
       FROM bookings b
       JOIN users cu ON cu.id = b.customer_id
       JOIN providers p ON p.id = b.provider_id
       JOIN users pu ON pu.id = p.user_id
       WHERE ${where.join(" AND ")}
       ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const [[total]] = await pool.query(
      `SELECT COUNT(*) AS v FROM bookings b WHERE ${where.join(" AND ")}`, params
    );
    res.json({ bookings: rows, total: total.v });
  } catch (err) {
    console.error("admin bookings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/kyc ────────────────────────────────────
router.get("/kyc", ...auth, async (req, res) => {
  try {
    const { status = "pending", page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [rows] = await pool.query(
      `SELECT k.*, u.name, u.email, u.phone FROM kyc_docs k
       JOIN users u ON u.id = k.user_id
       WHERE k.status = ? ORDER BY k.submitted_at DESC LIMIT ? OFFSET ?`,
      [status, parseInt(limit), offset]
    );
    const [[total]] = await pool.query(
      "SELECT COUNT(*) AS v FROM kyc_docs WHERE status = ?", [status]
    );
    res.json({ docs: rows, total: total.v });
  } catch (err) {
    console.error("admin kyc:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/complaints ─────────────────────────────
router.get("/complaints", ...auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ["1=1"], params = [];
    if (status) { where.push("c.status = ?"); params.push(status); }

    const [rows] = await pool.query(
      `SELECT c.*, u.name AS user_name FROM complaints c
       JOIN users u ON u.id = c.user_id
       WHERE ${where.join(" AND ")} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json(rows);
  } catch (err) {
    console.error("admin complaints:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/admin/complaints/:id ──────────────────────
router.patch("/complaints/:id", ...auth, async (req, res) => {
  try {
    const { status, resolved_note } = req.body;
    await pool.query(
      "UPDATE complaints SET status = COALESCE(?, status), resolved_note = COALESCE(?, resolved_note), assigned_to = ? WHERE id = ?",
      [status || null, resolved_note || null, req.user.id, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/admin/notify ────────────────────────────────
router.post("/notify", ...auth, async (req, res) => {
  try {
    const { user_id, title_bn, title_en, body_bn, body_en, type = "system", icon = "📣" } = req.body;
    if (user_id) {
      await pool.query(
        "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
        [user_id, icon, type, title_bn, title_en, body_bn, body_en]
      );
    } else {
      // Broadcast to all
      const [users] = await pool.query("SELECT id FROM users WHERE is_active = 1");
      const inserts = users.map(u => [u.id, icon, type, title_bn, title_en, body_bn, body_en]);
      if (inserts.length) {
        await pool.query(
          "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES ?",
          [inserts]
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error("admin notify:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/revenue ────────────────────────────────
router.get("/revenue", ...auth, async (req, res) => {
  try {
    const [monthly] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
              SUM(amount + platform_fee) AS revenue,
              COUNT(*) AS bookings
       FROM bookings WHERE status = 'completed'
       GROUP BY month ORDER BY month DESC LIMIT 12`
    );
    const [[total]] = await pool.query(
      "SELECT COALESCE(SUM(amount+platform_fee),0) AS v FROM bookings WHERE status='completed'"
    );
    const [[fees]] = await pool.query(
      "SELECT COALESCE(SUM(platform_fee),0) AS v FROM bookings WHERE status='completed'"
    );
    res.json({ monthly, totalRevenue: total.v, totalFees: fees.v });
  } catch (err) {
    console.error("admin revenue:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
