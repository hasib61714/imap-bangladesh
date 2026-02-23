/**
 * SMS Utility — IMAP Bangladesh
 * Set SMS_PROVIDER in .env: mock | bulksmsbd | sslwireless | twilio
 */
const https = require("https");
const http  = require("http");

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
    const url = `https://bulksmsbd.net/api/smsapi?api_key=${encodeURIComponent(process.env.BULKSMS_API_KEY)}&type=text&number=${encodeURIComponent(phone)}&senderid=${encodeURIComponent(process.env.BULKSMS_SENDER_ID||"IMAP")}&message=${encodeURIComponent(message)}`;
    const result = await httpGet(url);
    console.log("[SMS][bulksmsbd]", phone, "→", result);
    return { provider: "bulksmsbd", result };
  }

  if (provider === "sslwireless") {
    const result = await httpPost("https://sslwireless.com/pushapi/plain/send",
      { api_token: process.env.SSLWIRELESS_TOKEN, sid: process.env.SSLWIRELESS_SID||"IMAP", msisdn: phone, sms: message, csmsid: Date.now() });
    console.log("[SMS][sslwireless]", phone, "→", result);
    return { provider: "sslwireless", result };
  }

  if (provider === "twilio") {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: tok, TWILIO_PHONE: from } = process.env;
    const auth   = Buffer.from(`${sid}:${tok}`).toString("base64");
    const body   = `To=+88${phone}&From=${encodeURIComponent(from)}&Body=${encodeURIComponent(message)}`;
    const result = await httpPost(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, body,
      { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" });
    console.log("[SMS][twilio]", phone, "→", result);
    return { provider: "twilio", result };
  }

  // Mock (default)
  console.log(`[SMS][MOCK] ☎️  To: ${phone}`);
  console.log(`[SMS][MOCK] 📨  Message: ${message}`);
  return { provider: "mock", success: true };
}

module.exports = { sendSMS };
