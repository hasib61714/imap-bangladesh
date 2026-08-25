// Cleanup worker — periodic housekeeping (safe DELETEs only).
const pool = require("../../db");
const logger = require("../../utils/logger");
module.exports = {
  queue: "cleanup",
  handler: async () => {
    // Expired / revoked refresh tokens
    await pool.query("DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = 1").catch(() => {});
    // Old, already-read notifications (>90 days)
    await pool.query(
      "DELETE FROM notifications WHERE is_read = 1 AND created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)"
    ).catch(() => {});
    logger.debug("[cleanup job] completed");
  },
};
