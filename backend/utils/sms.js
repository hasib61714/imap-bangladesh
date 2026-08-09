/**
 * SMS Utility — IMAP Bangladesh
 * Set SMS_PROVIDER in .env: mock | bulksmsbd | sslwireless | twilio
 */
const https  = require("https");
const http   = require("http");
const logger = require("./logger");

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u    = new URL(url);
    const data = typeof body === "string" ? body : JSON.stringify(body);
    const lib  = u.protocol === "https:" ? https : http;
    const options = {
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), ...headers },
    };
    const req = lib.request(options, (res) => {
      let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(d));
    });
    req.on("error", reject); req.write(data); req.end();
  });
}

async function sendSMS(phone, message) {
  const provider = process.env.SMS_PROVIDER || "mock";

  if (provider === "bulksmsbd") {
    // P1-17: render.yaml and .env.example provision BD_SMS_API_KEY /
    // BD_SMS_SENDER_ID; this only read BULKSMS_*, so the request went out
    // with api_key=undefined and every OTP silently failed.
    const apiKey   = process.env.BULKSMS_API_KEY   || process.env.BD_SMS_API_KEY;
    const senderId = process.env.BULKSMS_SENDER_ID || process.env.BD_SMS_SENDER_ID || "IMAP";
    if (!apiKey) throw new Error("SMS provider 'bulksmsbd' selected but BD_SMS_API_KEY is not set");
    const url = `https://bulksmsbd.net/api/smsapi?api_key=${encodeURIComponent(apiKey)}&type=text&number=${encodeURIComponent(phone)}&senderid=${encodeURIComponent(senderId)}&message=${encodeURIComponent(message)}`;
    const result = await httpGet(url);
    logger.info(`[SMS][bulksmsbd] ${phone} → ${result}`);
    return { provider: "bulksmsbd", result };
  }

  if (provider === "sslwireless") {
    const result = await httpPost("https://sslwireless.com/pushapi/plain/send",
      { api_token: process.env.SSLWIRELESS_TOKEN, sid: process.env.SSLWIRELESS_SID||"IMAP", msisdn: phone, sms: message, csmsid: Date.now() });
    logger.info(`[SMS][sslwireless] ${phone} → ${result}`);
    return { provider: "sslwireless", result };
  }

  if (provider === "twilio") {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: tok } = process.env;
    // P1-17: render.yaml provisions SMS_FROM; this only read TWILIO_PHONE,
    // so the From number was undefined and Twilio rejected every message.
    const from = process.env.TWILIO_PHONE || process.env.SMS_FROM;
    if (!sid || !tok || !from) {
      throw new Error("SMS provider 'twilio' selected but TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / SMS_FROM are not all set");
    }
    const auth   = Buffer.from(`${sid}:${tok}`).toString("base64");
    const body   = `To=+88${phone}&From=${encodeURIComponent(from)}&Body=${encodeURIComponent(message)}`;
    const result = await httpPost(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, body,
      { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" });
    logger.info(`[SMS][twilio] ${phone} → ${result}`);
    return { provider: "twilio", result };
  }

  // Mock (default)
  logger.info(`[SMS][MOCK] To: ${phone} | ${message}`);
  return { provider: "mock", success: true };
}

module.exports = { sendSMS };
