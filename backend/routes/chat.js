const router = require("express").Router();
const pool   = require("../db");
const { authMiddleware } = require("../middleware/auth");

// Ensure chat_messages table exists
const initTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      booking_id  VARCHAR(36) NOT NULL,
      sender_id   VARCHAR(36) NOT NULL,
      sender_role ENUM('customer','provider','admin') DEFAULT 'customer',
      message     TEXT NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_booking (booking_id)
    ) ENGINE=InnoDB
  `);
};
initTable().catch(e => console.warn("chat table init:", e.message));

// GET /api/chat/:bookingId  — fetch messages (polling)
router.get("/:bookingId", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { after } = req.query; // optional: return only messages after given id
    let sql = "SELECT * FROM chat_messages WHERE booking_id = ?";
    const params = [bookingId];
    if (after) { sql += " AND id > ?"; params.push(parseInt(after)||0); }
    sql += " ORDER BY created_at ASC LIMIT 100";
    const [rows] = await pool.query(sql, params);
    res.json({ messages: rows });
  } catch (e) {
    console.error("chat get:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/chat/:bookingId  — send message
router.post("/:bookingId", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Empty message" });
    const user = req.user;
    const role = user.role || "customer";
    const [result] = await pool.query(
      "INSERT INTO chat_messages (booking_id,sender_id,sender_role,message) VALUES (?,?,?,?)",
      [bookingId, user.id, role, message.trim()]
    );
    const [[msg]] = await pool.query("SELECT * FROM chat_messages WHERE id = ?", [result.insertId]);

    // ✅ Emit via Socket.io to booking room (real-time delivery)
    const io = req.app.get("io");
    if (io) {
      io.to(`booking_${bookingId}`).emit("new_message", {
        ...msg,
        sender_name: user.name,
        sender_avatar: user.avatar || null,
      });
    }

    res.json({ success: true, message: msg });
  } catch (e) {
    console.error("chat post:", e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
