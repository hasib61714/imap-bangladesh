// SMS worker — wraps utils/sms so callers can fire-and-forget.
const sms = require("../../utils/sms");
module.exports = {
  queue: "sms",
  handler: async ({ phone, message }) => {
    if (!phone || !message) return;
    await sms.sendSMS(phone, message);
  },
};
