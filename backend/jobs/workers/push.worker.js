// Push worker — wraps utils/push.
const { sendPush } = require("../../utils/push");
module.exports = {
  queue: "push",
  handler: async ({ userId, payload }) => {
    if (!userId) return;
    await sendPush(userId, payload || {});
  },
};
