// AI worker — placeholder for async/long-running AI tasks
// (e.g. precomputing analytics caches, batch scoring).
const logger = require("../../utils/logger");
module.exports = {
  queue: "ai",
  handler: async (payload = {}) => {
    logger.debug("[ai job]", { type: payload.type || "unknown" });
  },
};
