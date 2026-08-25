// Email worker — stub. No email provider is configured yet; wire SES/SMTP here.
const logger = require("../../utils/logger");
module.exports = {
  queue: "email",
  handler: async ({ to, subject } = {}) => {
    logger.info("[email job] (stub — configure an email provider)", { to, subject });
  },
};
