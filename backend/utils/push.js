/**
 * IMAP Push Notification Utility
 * Sends web-push notifications to all subscriptions for a user.
 */
const webpush = require("web-push");
const pool    = require("../db");

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:admin@imap-bangladesh.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * Send a push notification to all subscriptions for a given user.
 * @param {number} userId
 * @param {{ title: string, body: string, url?: string }} payload
 */
async function sendPush(userId, payload) {
  if (!process.env.VAPID_PUBLIC_KEY) return; // not configured

  let subs;
  try {
    [subs] = await pool.query(
      "SELECT endpoint, `keys` FROM push_subscriptions WHERE user_id = ?",
      [userId]
    );
  } catch { return; } // table may not exist yet

  if (!subs?.length) return;

  const data = JSON.stringify({
    title: payload.title || "IMAP Bangladesh 🔔",
    body:  payload.body  || "",
    url:   payload.url   || "/",
  });

  await Promise.allSettled(
    subs.map(s => webpush.sendNotification(
      { endpoint: s.endpoint, keys: typeof s.keys === "string" ? JSON.parse(s.keys) : s.keys },
      data
    ).catch(err => {
      // Remove expired / invalid subscriptions (410 Gone)
      if (err.statusCode === 410 || err.statusCode === 404) {
        pool.query("DELETE FROM push_subscriptions WHERE endpoint = ?", [s.endpoint]).catch(() => {});
      }
    }))
  );
}

module.exports = { sendPush };
