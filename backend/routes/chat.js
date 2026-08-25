const logger = require('../utils/logger');
const router = require("express").Router();
const pool   = require("../db");
const { authMiddleware } = require("../middleware/auth");
// I-04: both handlers ran their own copy of the participation query — a
// fourth authorization implementation, and one that had already drifted
// from utils/bookingAccess.js. The kernel loads the booking once and hands
// it over, so the query below is gone rather than deduplicated.
const { requireAuthorization } = require("../middleware/authorize");
const { ACTION } = require("../src/modules/platform/authorization");
const { sendPush } = require("../utils/push");

// I-01: initTable() used to CREATE TABLE chat_messages on import.
// The table is migration 003; the function is gone with it.

// GET /api/chat/:bookingId  — fetch messages (polling)
router.get("/:bookingId", authMiddleware,
  requireAuthorization(ACTION.MESSAGE_READ, { resource: (req) => req.params.bookingId }),
  async (req, res) => {
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
    logger.error("chat get:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/chat/:bookingId  — send message
router.post("/:bookingId", authMiddleware,
  requireAuthorization(ACTION.MESSAGE_SEND, { resource: (req) => req.params.bookingId }),
  async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Empty message" });
    if (message.length > 2000) return res.status(400).json({ error: "Message max 2000 chars" });
    const user = req.user;
    const role = user.role || "customer";

    // Loaded once, by the kernel, from the database.
    const { customerId: customer_id, providerUserId: provider_user_id } = req.authorization.resource;

    const [result] = await pool.query(
      "INSERT INTO chat_messages (booking_id,sender_id,sender_role,message) VALUES (?,?,?,?)",
      [bookingId, user.id, role, message.trim()]
    );
    const [[msg]] = await pool.query("SELECT * FROM chat_messages WHERE id = ?", [result.insertId]);

    // ✅ Emit via Socket.io to booking room (real-time delivery)
    // Avatar is fetched lazily here (only on send) instead of on every
    // authenticated request — see middleware/auth.js.
    const io = req.app.get("io");
    if (io) {
      const [[me]] = await pool.query("SELECT avatar FROM users WHERE id = ?", [user.id]).catch(() => [[]]);
      io.to(`booking_${bookingId}`).emit("new_message", {
        ...msg,
        sender_name: user.name,
        sender_avatar: me?.avatar || null,
      });
    }

    // Push notification to the other party (reuse bCheck data fetched above)
    try {
      const otherId = String(user.id) === String(provider_user_id) ? customer_id : provider_user_id;
      if (otherId) {
        sendPush(otherId, {
          title: `💬 ${user.name || "বার্তা"}`,
          body:  message.trim().slice(0, 80),
          url:   "/",
        }).catch(() => {});
      }
    } catch {}

    res.json({ success: true, message: msg });
  } catch (e) {
    logger.error("chat post:", e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
