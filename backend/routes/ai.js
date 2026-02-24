/**
 * IMAP AI Routes
 * POST /api/ai/chat          — LLM chatbot (OpenAI if key present, smart fallback otherwise)
 * POST /api/ai/match         — Personalized provider ranking
 * POST /api/ai/dynamic-price — Dynamic price suggestion
 * POST /api/ai/fraud-check   — Booking fraud detection
 * POST /api/ai/review-check  — Fake review detection
 * GET  /api/ai/forecast      — Demand & revenue forecast
 * GET  /api/ai/churn         — Provider/customer churn risk
 * GET  /api/ai/heatmap       — Service demand heatmap by area
 */

const express = require("express");
const router  = express.Router();
const db      = require("../db");

/* ── Google Gemini helper (free tier — try first) ─────────── */
async function callGemini(messages, lang = "bn") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const systemText = lang === "bn"
    ? "তুমি IMAP-এর AI সহায়ক। IMAP বাংলাদেশের একটি সেবা মার্কেটপ্লেস যেখানে ইলেকট্রিশিয়ান, নার্স, প্লাম্বার, পরিষ্কার কর্মী ইত্যাদি পাওয়া যায়। সংক্ষেপে ও বাংলায় উত্তর দাও। ইমোজি ব্যবহার করো।"
    : "You are IMAP's AI assistant. IMAP is a Bangladesh service marketplace for electricians, nurses, plumbers, cleaners etc. Reply concisely in English with emojis.";

  // Gemini requires alternating user/model turns — prepend system as first user turn
  const contents = [
    { role: "user",  parts: [{ text: systemText }] },
    { role: "model", parts: [{ text: "Understood! I'm IMAP AI ready to help." }] },
    ...messages.map(m => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
  ];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
        }),
      }
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(`⚠️  Gemini error ${res.status}: ${errBody.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { console.warn("Gemini exception:", e.message); return null; }
}

/* ── OpenAI helper (optional — works without key via fallback) ── */
async function callOpenAI(messages, lang = "bn") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;                    // fallback mode

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 300,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: lang === "bn"
            ? "তুমি IMAP-এর AI সহায়ক। IMAP বাংলাদেশের একটি সেবা মার্কেটপ্লেস যেখানে ইলেকট্রিশিয়ান, নার্স, প্লাম্বার, পরিষ্কার কর্মী ইত্যাদি পাওয়া যায়। সংক্ষেপে ও বাংলায় উত্তর দাও। ইমোজি ব্যবহার করো।"
            : "You are IMAP's AI assistant. IMAP is a Bangladesh service marketplace for electricians, nurses, plumbers, cleaners etc. Reply concisely in English with emojis.",
        },
        ...messages,
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

/* ── Smart Bangla/English fallback responses ─────────────────── */
const FALLBACK_BN = {
  ইলেকট্রি: "⚡ ইলেকট্রিক্যাল সমস্যার জন্য আমাদের কাছে ৪৫+ যাচাইকৃত ইলেকট্রিশিয়ান আছেন। এখনই বুকিং করুন! গড় সময়: ৩০ মিনিট।",
  প্লাম্ব:  "🔧 প্লাম্বিং সমস্যা? আমাদের ২৮+ দক্ষ প্লাম্বার সবসময় প্রস্তুত। জরুরি হলে ১৫ মিনিটে পৌঁছাবে!",
  নার্স:    "🏥 অভিজ্ঞ নার্স দরকার? ৩২+ NID-যাচাইকৃত নার্স available। বাড়িতে সেবা প্রদান সম্ভব।",
  পরিষ্কার: "🧹 বাড়ি/অফিস পরিষ্কারের জন্য ৫৬+ trained কর্মী আছেন। ঘণ্টা হিসেবে বা প্যাকেজে বুক করুন।",
  রাঁধুনি:  "👨‍🍳 অনুষ্ঠান বা দৈনন্দিন রান্নার জন্য ২৪+ পেশাদার রাঁধুনি। আজই বুক করুন!",
  ড্রাইভার: "🚗 বিশ্বস্ত ড্রাইভার চাই? ১৮+ verified ড্রাইভার available। মাসিক চুক্তিতেও নেওয়া যায়।",
  দাম:      "💰 সেবার দাম নির্ভর করে কাজের ধরন ও এলাকার উপর। সাধারণত ৳২৫০-৳১৫০০ এর মধ্যে। আজ বুক করলে ১০% ছাড়!",
  জরুরি:   "🚨 জরুরি সেবা? এখনই ৯৯৯ বা আমাদের Emergency বাটন চাপুন! ৩ মিনিটের মধ্যে নিকটতম professional ডিসপ্যাচ।",
  লোন:     "💹 আপনার credit score IMAP-এ ৮২/১০০। এই স্কোর দিয়ে ৳৫০,০০০ পর্যন্ত instant microloan নেওয়া সম্ভব!",
  পেমেন্ট: "💳 আমরা bKash, Nagad, Rocket এবং cash on delivery সাপোর্ট করি। ১০০% নিরাপদ লেনদেন।",
  রেটিং:   "⭐ সেবা পাওয়ার পর রেটিং দিন। আপনার রিভিউ অন্যদের সঠিক provider বেছে নিতে সাহায্য করে।",
  নিকট:    "📍 আপনার অবস্থান দিন, নিকটতম provider খুঁজে দেব। Nearby বাটন ব্যবহার করুন!",
  বুকিং:   "📋 বুকিং করতে Services পেজে যান, provider বেছে নিন ও সময় সিলেক্ট করুন। ৩ ধাপে সহজেই হয়!",
  হ্যালো:  "😊 আস্সালামুয়ালাইকুম! আমি IMAP AI। কোন সেবা দরকার? ইলেকট্রিশিয়ান, নার্স, প্লাম্বার, পরিষ্কার... যেকোনো কিছু বলুন।",
  ধন্যবাদ: "🌿 আপনাকে স্বাগতম! আরো কিছু প্রয়োজন হলে জিজ্ঞেস করুন। ভালো থাকুন! 😊",
  কার্পেন: "🪚 কার্পেন্টার দরকার? আমাদের ২০+ দক্ষ কার্পেন্টার আসবাব মেরামত থেকে নতুন নির্মাণে সাহায্য করেন।",
  রং:      "🎨 পেইন্টিং সেবা? ঘরের ভেতর-বাইরে পেইন্টিংয়ের জন্য ১৫+ অভিজ্ঞ painter। বিনামূল্যে কোটেশন!",
  এসি:     "❄️ AC সমস্যা? ইনস্টলেশন, সার্ভিসিং বা মেরামতের জন্য আমাদের AC technician ডাকুন। ২৪ ঘণ্টা সেবা!",
  গার্ড:   "🔒 নিরাপত্তা রক্ষী দরকার? ট্রেনড সিকিউরিটি গার্ড ইভেন্ট বা বাড়ি/অফিসের জন্য পাওয়া যায়।",
  কাজ:     "💼 কোন কাজে সাহায্য লাগবে? ইলেকট্রিক, প্লাম্বিং, পরিষ্কার, রান্না, নার্সিং — সব সেবাই আমাদের কাছে আছে!",
  সেবা:    "🌟 IMAP-এ ৫০+ ধরনের সেবা পাওয়া যায়। Services পেজে গিয়ে দেখুন এবং নিজের পছন্দের সেবা বুক করুন!",
  সমস্যা:  "🛠️ কোন সমস্যায় পড়েছেন? আমাকে বলুন কোন ধরনের সেবা দরকার, আমি সঠিক professional খুঁজে দেব।",
  কতক্ষণ: "⏱️ সাধারণত বুকিং কনফার্মের ৩০-৬০ মিনিটের মধ্যে provider পৌঁছে যান। জরুরি ক্ষেত্রে আরও দ্রুত!",
};

const FALLBACK_EN = {
  electr:  "⚡ Need electrical work? We have 45+ verified electricians. Average response: 30 min. Book now!",
  plumb:   "🔧 Plumbing issue? Our 28+ skilled plumbers are ready 24/7. Emergency dispatch in 15 minutes!",
  nurse:   "🏥 Looking for a nurse? 32+ NID-verified nursing professionals available for home visits.",
  clean:   "🧹 Home/office cleaning? 56+ trained cleaners available. Book by hour or package deal.",
  cook:    "👨‍🍳 Need a cook? 24+ professional cooks for events or daily service. Book today!",
  driver:  "🚗 Trusted driver? 18+ verified drivers available, including monthly packages.",
  price:   "💰 Prices range ৳250-৳1500 depending on service & area. Book today for 10% off!",
  urgent:  "🚨 Emergency? Hit the Emergency button! Nearest professional dispatched within 3 minutes.",
  loan:    "💹 Your IMAP credit score is 82/100 — eligible for instant microloan up to ৳50,000!",
  payment: "💳 We support bKash, Nagad, Rocket & cash on delivery. 100% secure transactions.",
  rating:  "⭐ Rate your provider after service. Your review helps others choose the best professional.",
  near:    "📍 Share your location to find the nearest provider. Use the Nearby button!",
  book:    "📋 Go to Services → choose provider → select time. Done in 3 easy steps!",
  hello:   "😊 Hello! I'm IMAP AI. What service do you need? Electrician, Nurse, Plumber, Cleaning...",
  thank:   "🌿 You're welcome! Let me know if you need anything else. Stay well! 😊",
  carpen:  "🪚 Need carpentry? 20+ skilled carpenters for furniture repair or new installations.",
  paint:   "🎨 Painting service? 15+ experienced painters for interior & exterior. Free quote!",
  ac:      "❄️ AC problem? Installation, servicing or repair — our AC technicians are available 24/7!",
  guard:   "🔒 Need security? Trained security guards available for events, homes & offices.",
  service: "🌟 IMAP offers 50+ service types. Visit our Services page to browse and book!",
  how:     "📱 How it works: 1️⃣ Choose service → 2️⃣ Select provider → 3️⃣ Pick time → Done! Payment after service.",
  long:    "⏱️ Providers typically arrive within 30-60 minutes of booking. Emergency slots even faster!",
  cancel:  "↩️ You can cancel a booking up to 1 hour before the scheduled time at no charge.",
  refund:  "💸 Refunds are processed within 3-5 business days to your original payment method.",
};

function smartFallback(text, lang) {
  const t = text.toLowerCase();
  if (lang === "bn") {
    const k = Object.keys(FALLBACK_BN).find(k => t.includes(k));
    return k ? FALLBACK_BN[k] : "🤖 বুঝেছি! আমি IMAP AI সহায়ক। ইলেকট্রিক, প্লাম্বিং, নার্স, পরিষ্কার, রান্না — যেকোনো সেবার জন্য জিজ্ঞেস করুন অথবা Services পেজ থেকে সরাসরি বুক করুন! 😊";
  }
  const k = Object.keys(FALLBACK_EN).find(k => t.includes(k));
  return k ? FALLBACK_EN[k] : "🤖 I'm IMAP AI! I can help with Electrical, Plumbing, Nursing, Cleaning, Cooking and more. What service do you need today? Or visit our Services page to browse! 😊";
}

/* ═══════════════════════════════════════════════════════════
   POST /api/ai/chat
   body: { messages: [{role, content}], lang: "bn"|"en" }
═══════════════════════════════════════════════════════════ */
/* GET /api/ai/debug — check if Gemini key is configured */
router.get("/debug", async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.json({ gemini: false, reason: "GEMINI_API_KEY not set" });
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "hi" }] }] }) }
    );
    const body = await r.json();
    if (r.ok) return res.json({ gemini: true, status: r.status });
    return res.json({ gemini: false, status: r.status, error: body?.error?.message });
  } catch (e) { return res.json({ gemini: false, reason: e.message }); }
});

router.post("/chat", async (req, res) => {
  try {
    const { messages = [], lang = "bn" } = req.body;
    const userText = messages.filter(m => m.role === "user").slice(-1)[0]?.content || "";

    // 1. Try Google Gemini (free tier)
    const geminiReply = await callGemini(messages, lang);
    if (geminiReply) return res.json({ reply: geminiReply, source: "gemini" });

    // 2. Try OpenAI
    const llmReply = await callOpenAI(messages, lang);
    if (llmReply) return res.json({ reply: llmReply, source: "openai" });

    // 3. Smart keyword fallback
    const reply = smartFallback(userText, lang);
    res.json({ reply, source: "fallback" });
  } catch (err) {
    console.error("AI chat error:", err.message);
    res.json({ reply: "🤖 দুঃখিত, এখন একটু সমস্যা হচ্ছে। একটু পরে আবার চেষ্টা করুন।", source: "error" });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/ai/chat/stream
   Server-Sent Events — real-time token streaming from Gemini
   body: { messages: [{role, content}], lang: "bn"|"en" }
   Client reads: data: {"text":"chunk"}\n\n  then  data: [DONE]\n\n
═══════════════════════════════════════════════════════════ */
router.post("/chat/stream", async (req, res) => {
  const { messages = [], lang = "bn" } = req.body;
  const apiKey    = process.env.GEMINI_API_KEY;
  const userText  = messages.filter(m => m.role === "user").slice(-1)[0]?.content || "";

  // SSE headers
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const done  = ()   => { res.write("data: [DONE]\n\n"); res.end(); };

  // ── No Gemini key → simulate streaming from fallback ──
  if (!apiKey) {
    const text = smartFallback(userText, lang);
    for (let i = 0; i < text.length; i += 3) {
      send({ text: text.slice(i, i + 3) });
      await new Promise(r => setTimeout(r, 22));
    }
    return done();
  }

  // ── Gemini streaming ──
  const systemText = lang === "bn"
    ? "তুমি IMAP-এর AI সহায়ক। IMAP বাংলাদেশের একটি সেবা মার্কেটপ্লেস। সংক্ষেপে ও বাংলায় উত্তর দাও। ইমোজি ব্যবহার করো।"
    : "You are IMAP's AI assistant. IMAP is a Bangladesh service marketplace. Reply concisely in English with emojis.";

  const contents = [
    { role: "user",  parts: [{ text: systemText }] },
    { role: "model", parts: [{ text: "Understood! I'm IMAP AI." }] },
    ...messages.map(m => ({
      role:  m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
  ];

  try {
    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ contents, generationConfig: { maxOutputTokens: 400, temperature: 0.7 } }),
      }
    );

    if (!gemRes.ok) {
      // Quota/auth error → fall back to keyword
      const fallback = smartFallback(userText, lang);
      send({ text: fallback, source: "fallback" });
      return done();
    }

    const reader  = gemRes.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";

    while (true) {
      const { done: rDone, value } = await reader.read();
      if (rDone) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines from buffer
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (raw === "[DONE]") break;
        try {
          const json = JSON.parse(raw);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) send({ text });
        } catch {}
      }
    }
  } catch (err) {
    console.error("Gemini stream error:", err.message);
    send({ text: lang === "bn" ? "দুঃখিত, সমস্যা হচ্ছে।" : "Sorry, an error occurred." });
  }

  done();
});

/* ═══════════════════════════════════════════════════════════
   POST /api/ai/match
   body: { serviceType, area, userId, limit }
   Returns providers ranked by AI score
═══════════════════════════════════════════════════════════ */
router.post("/match", async (req, res) => {
  try {
    const { serviceType, area, userId, limit = 10 } = req.body;

    // Base query: get providers with ratings
    let query = `
      SELECT p.*, u.name, u.phone,
        COALESCE(AVG(r.rating), 0) AS avg_rating,
        COUNT(DISTINCT b.id)       AS total_bookings,
        COUNT(DISTINCT r.id)       AS review_count
      FROM providers p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN bookings b ON b.provider_id = p.id
      LEFT JOIN reviews r ON r.provider_id = p.id
      WHERE p.is_active = 1
    `;
    const params = [];

    if (serviceType) { query += ` AND p.service_type LIKE ?`; params.push(`%${serviceType}%`); }
    if (area)        { query += ` AND (p.service_area LIKE ? OR u.city LIKE ?)`; params.push(`%${area}%`, `%${area}%`); }

    query += ` GROUP BY p.id ORDER BY avg_rating DESC, total_bookings DESC LIMIT ?`;
    params.push(Number(limit) * 3); // fetch more to re-rank

    const [rows] = await db.query(query, params);

    // ── AI Scoring ──────────────────────────────────────────
    const scored = rows.map(p => {
      const ratingScore    = (p.avg_rating / 5) * 40;          // 40 pts
      const bookingScore   = Math.min(p.total_bookings / 200, 1) * 25; // 25 pts
      const reviewScore    = Math.min(p.review_count / 50, 1) * 15;   // 15 pts
      const verifiedScore  = p.nid_verified ? 15 : 0;          // 15 pts
      const freshnessScore = p.last_active
        ? Math.max(0, 5 - Math.floor((Date.now() - new Date(p.last_active)) / 86400000)) : 0; // 5 pts

      const aiScore = ratingScore + bookingScore + reviewScore + verifiedScore + freshnessScore;

      return {
        ...p,
        ai_score:   Math.round(aiScore),
        ai_tag:     aiScore >= 80 ? "🏆 শীর্ষ বাছাই" : aiScore >= 60 ? "⭐ প্রস্তাবিত" : null,
        ai_tag_en:  aiScore >= 80 ? "🏆 Top Pick"     : aiScore >= 60 ? "⭐ Recommended" : null,
      };
    });

    scored.sort((a, b) => b.ai_score - a.ai_score);
    res.json({ providers: scored.slice(0, Number(limit)), scored: true });
  } catch (err) {
    console.error("AI match error:", err.message);
    res.status(500).json({ error: "Match failed" });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/ai/dynamic-price
   body: { serviceType, area, scheduledTime }
   Returns: { basePrice, dynamicPrice, surgeReason }
═══════════════════════════════════════════════════════════ */
router.post("/dynamic-price", async (req, res) => {
  try {
    const { serviceType = "general", area = "", scheduledTime } = req.body;

    // Base prices per service type
    const BASE = {
      electrical: 500, plumbing: 450, cleaning: 350, nursing: 800,
      cooking: 600, driving: 400, repair: 550, tutoring: 400, default: 400,
    };
    const key = Object.keys(BASE).find(k => serviceType.toLowerCase().includes(k)) || "default";
    const basePrice = BASE[key];

    // Demand multiplier from recent bookings
    const [demandRows] = await db.query(
      `SELECT COUNT(*) AS cnt FROM bookings 
       WHERE service LIKE ? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [`%${serviceType}%`]
    );
    const demandCount = demandRows[0]?.cnt || 0;

    // Time-based surge
    const hour = scheduledTime ? new Date(scheduledTime).getHours() : new Date().getHours();
    const isRushHour = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20);
    const isWeekend  = [0, 6].includes(new Date().getDay());

    let multiplier   = 1.0;
    let surgeReasons = [];

    if (demandCount > 20) { multiplier += 0.20; surgeReasons.push("উচ্চ চাহিদা | High demand"); }
    if (isRushHour)       { multiplier += 0.15; surgeReasons.push("ব্যস্ত সময় | Rush hour"); }
    if (isWeekend)        { multiplier += 0.10; surgeReasons.push("সাপ্তাহিক ছুটি | Weekend"); }

    // Area-based adjustment
    const premiumAreas = ["gulshan", "banani", "baridhara", "uttara", "dhanmondi"];
    if (premiumAreas.some(a => area.toLowerCase().includes(a))) {
      multiplier += 0.15;
      surgeReasons.push("প্রিমিয়াম এলাকা | Premium area");
    }

    const dynamicPrice = Math.round(basePrice * multiplier / 50) * 50; // round to nearest 50

    res.json({
      basePrice,
      dynamicPrice,
      multiplier: Math.round(multiplier * 100) / 100,
      surgeActive: multiplier > 1.0,
      surgeReason: surgeReasons.join(", ") || null,
      discount: dynamicPrice < basePrice ? basePrice - dynamicPrice : 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/ai/fraud-check
   body: { userId, providerId, amount, serviceType, scheduledTime }
   Returns: { riskScore, riskLevel, flags }
═══════════════════════════════════════════════════════════ */
router.post("/fraud-check", async (req, res) => {
  try {
    const { userId, providerId, amount, serviceType, scheduledTime } = req.body;
    const flags = [];
    let score = 0;

    // 1. Multiple bookings in short time by same user
    const [recentByUser] = await db.query(
      `SELECT COUNT(*) AS cnt FROM bookings WHERE customer_id=? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [userId]
    );
    if (recentByUser[0]?.cnt >= 3) { flags.push("একজন ব্যবহারকারী ১ ঘণ্টায় ৩+ বুকিং"); score += 40; }

    // 2. Unusual amount
    const [avgAmount] = await db.query(
      `SELECT AVG(amount) AS avg FROM bookings WHERE service LIKE ?`,
      [`%${serviceType}%`]
    );
    const avg = avgAmount[0]?.avg || 500;
    if (amount > avg * 3) { flags.push("অস্বাভাবিক বেশি পরিমাণ (গড়ের ৩x+)"); score += 30; }

    // 3. New user with large amount
    const [userInfo] = await db.query(
      `SELECT created_at FROM users WHERE id=?`, [userId]
    );
    const ageHours = userInfo[0]
      ? (Date.now() - new Date(userInfo[0].created_at)) / 3600000 : 999;
    if (ageHours < 2 && amount > 1000) { flags.push("নতুন একাউন্ট + বড় পেমেন্ট"); score += 25; }

    // 4. Off-hours booking
    const hour = new Date().getHours();
    if (hour < 6 || hour > 23) { flags.push("অস্বাভাবিক সময়ে বুকিং"); score += 15; }

    const riskLevel = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
    res.json({ riskScore: Math.min(score, 100), riskLevel, flags, blocked: score >= 80 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/ai/review-check
   body: { providerId, rating, comment, userId }
   Returns: { isSuspicious, confidence, reasons }
═══════════════════════════════════════════════════════════ */
router.post("/review-check", async (req, res) => {
  try {
    const { providerId, rating, comment = "", userId } = req.body;
    const reasons = [];
    let suspicionScore = 0;

    // 1. Duplicate comment check
    const [dupComment] = await db.query(
      `SELECT COUNT(*) AS cnt FROM reviews WHERE provider_id=? AND comment=? AND comment != ''`,
      [providerId, comment]
    );
    if (dupComment[0]?.cnt > 0) { reasons.push("একই মন্তব্য আগে দেওয়া হয়েছে"); suspicionScore += 60; }

    // 2. Same user reviewed this provider multiple times
    const [dupUser] = await db.query(
      `SELECT COUNT(*) AS cnt FROM reviews WHERE provider_id=? AND customer_id=?`,
      [providerId, userId]
    );
    if (dupUser[0]?.cnt > 0) { reasons.push("একই provider-কে একাধিকবার রেটিং"); suspicionScore += 40; }

    // 3. Extreme ratings cluster
    const [ratingCluster] = await db.query(
      `SELECT COUNT(*) AS cnt FROM reviews WHERE provider_id=? AND rating=? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [providerId, rating]
    );
    if (ratingCluster[0]?.cnt > 5) { reasons.push("১ ঘণ্টায় একই রেটিং ৫+ বার"); suspicionScore += 50; }

    // 4. Very short comment with perfect/terrible rating
    if (comment.length < 5 && (rating === 5 || rating === 1)) {
      reasons.push("অতি সংক্ষিপ্ত মন্তব্য সাথে চরম রেটিং");
      suspicionScore += 20;
    }

    // 5. No booking record for this provider
    const [hasBooking] = await db.query(
      `SELECT COUNT(*) AS cnt FROM bookings WHERE customer_id=? AND provider_id=? AND status='completed'`,
      [userId, providerId]
    );
    if (hasBooking[0]?.cnt === 0) { reasons.push("এই provider-এর সাথে কোনো completed বুকিং নেই"); suspicionScore += 35; }

    const isSuspicious = suspicionScore >= 50;
    res.json({
      isSuspicious,
      confidence: Math.min(suspicionScore, 100),
      reasons,
      recommendation: isSuspicious ? "manual_review" : "approve",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/ai/forecast
   Returns: demand forecast, revenue forecast, top services
═══════════════════════════════════════════════════════════ */
router.get("/forecast", async (req, res) => {
  try {
    // Monthly revenue last 6 months
    const [monthlyRevenue] = await db.query(`
      SELECT DATE_FORMAT(created_at,'%Y-%m') AS month,
             COUNT(*) AS bookings,
             COALESCE(SUM(amount), 0) AS revenue
      FROM bookings
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 6 MONTH)
        AND status != 'cancelled'
      GROUP BY month
      ORDER BY month
    `);

    // Service demand
    const [serviceDemand] = await db.query(`
      SELECT service, COUNT(*) AS count
      FROM bookings
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY service
      ORDER BY count DESC
      LIMIT 8
    `);

    // Area demand
    const [areaDemand] = await db.query(`
      SELECT address AS area, COUNT(*) AS count
      FROM bookings
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND address IS NOT NULL
      GROUP BY address
      ORDER BY count DESC
      LIMIT 10
    `);

    // Simple linear forecast (next 3 months based on trend)
    const revenues = monthlyRevenue.map(r => Number(r.revenue));
    const growth   = revenues.length >= 2
      ? (revenues[revenues.length - 1] - revenues[revenues.length - 2]) / Math.max(revenues[revenues.length - 2], 1)
      : 0.05;

    const lastRev    = revenues[revenues.length - 1] || 50000;
    const forecastRevenue = [1, 2, 3].map(i => Math.round(lastRev * (1 + growth) ** i));

    // Peak hours analysis
    const [peakHours] = await db.query(`
      SELECT HOUR(created_at) AS hour, COUNT(*) AS count
      FROM bookings
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 5
    `);

    res.json({
      monthlyRevenue,
      serviceDemand,
      areaDemand,
      forecastRevenue: forecastRevenue.map((v, i) => ({
        label: `+${i + 1}m`,
        value: v,
        growth: `${(growth * 100).toFixed(1)}%`,
      })),
      peakHours,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/ai/churn
   Returns: at-risk providers and customers
═══════════════════════════════════════════════════════════ */
router.get("/churn", async (req, res) => {
  try {
    // Providers at risk: active but no booking in 30 days
    const [providerChurn] = await db.query(`
      SELECT p.id, u.name, u.phone, p.service_type,
             MAX(b.created_at) AS last_booking,
             COUNT(b.id) AS total_bookings,
             DATEDIFF(NOW(), COALESCE(MAX(b.created_at), p.created_at)) AS days_inactive
      FROM providers p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN bookings b ON b.provider_id = p.id
      WHERE p.is_active = 1
      GROUP BY p.id
      HAVING days_inactive > 14
      ORDER BY days_inactive DESC
      LIMIT 10
    `);

    // Customers at risk: booked before but not in 45 days
    const [customerChurn] = await db.query(`
      SELECT u.id, u.name, u.phone,
             MAX(b.created_at) AS last_booking,
             COUNT(b.id) AS total_bookings,
             DATEDIFF(NOW(), MAX(b.created_at)) AS days_since_last
      FROM users u
      JOIN bookings b ON b.customer_id = u.id
      WHERE u.role = 'customer'
      GROUP BY u.id
      HAVING days_since_last > 30 AND total_bookings > 1
      ORDER BY days_since_last DESC
      LIMIT 10
    `);

    // Assign churn risk score
    const addRisk = (rows, daysField) => rows.map(r => ({
      ...r,
      churnRisk: r[daysField] > 60 ? "high" : r[daysField] > 30 ? "medium" : "low",
      churnScore: Math.min(Math.round(r[daysField] / 90 * 100), 100),
    }));

    res.json({
      providerChurn: addRisk(providerChurn, "days_inactive"),
      customerChurn: addRisk(customerChurn, "days_since_last"),
      total: providerChurn.length + customerChurn.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/ai/heatmap
   Returns service demand count per area/city
═══════════════════════════════════════════════════════════ */
router.get("/heatmap", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        COALESCE(u.city, 'অজানা') AS area,
        COUNT(*) AS total_bookings,
        COUNT(DISTINCT b.customer_id) AS unique_customers,
        ROUND(AVG(b.amount), 0) AS avg_amount
      FROM bookings b
      JOIN users u ON u.id = b.customer_id
      WHERE b.created_at > DATE_SUB(NOW(), INTERVAL 90 DAY)
      GROUP BY area
      ORDER BY total_bookings DESC
      LIMIT 20
    `);

    // Provider supply per area
    const [supply] = await db.query(`
      SELECT COALESCE(u.city, 'অজানা') AS area, COUNT(*) AS provider_count
      FROM providers p
      JOIN users u ON u.id = p.user_id
      WHERE p.is_active = 1
      GROUP BY area
    `);

    const supplyMap = Object.fromEntries(supply.map(s => [s.area, s.provider_count]));

    const heatmap = rows.map(r => ({
      ...r,
      provider_count: supplyMap[r.area] || 0,
      demand_gap:     r.total_bookings - (supplyMap[r.area] || 0) * 10,
      status:         (supplyMap[r.area] || 0) < r.total_bookings / 10 ? "undersupplied" : "balanced",
    }));

    res.json({ heatmap, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/ai/bundle-suggest
   body: { serviceType }
   Returns: suggested complementary services
═══════════════════════════════════════════════════════════ */
router.post("/bundle-suggest", async (req, res) => {
  try {
    const { serviceType = "" } = req.body;
    const svc = serviceType.toLowerCase();

    // Find customers who booked this service, what else did they book?
    const [coBookings] = await db.query(`
      SELECT b2.service, COUNT(*) AS cnt
      FROM bookings b1
      JOIN bookings b2 ON b2.customer_id = b1.customer_id AND b2.id != b1.id
      WHERE b1.service LIKE ?
        AND b1.created_at > DATE_SUB(NOW(), INTERVAL 90 DAY)
      GROUP BY b2.service
      ORDER BY cnt DESC
      LIMIT 5
    `, [`%${svc}%`]);

    // Static fallback bundles
    const BUNDLES = {
      electrical: ["AC Repair", "Ceiling Fan Install", "Solar Panel Check"],
      plumbing:   ["Water Tank Cleaning", "Bathroom Fitting", "Pipe Insulation"],
      cleaning:   ["Pest Control", "Carpet Washing", "Sofa Cleaning"],
      nursing:    ["Physiotherapy", "Medicine Delivery", "Blood Test"],
      cooking:    ["Kitchen Cleaning", "Grocery Purchase", "Serving Staff"],
    };
    const key = Object.keys(BUNDLES).find(k => svc.includes(k));
    const fallbackBundles = key ? BUNDLES[key] : ["AC Repair", "Deep Cleaning", "Plumbing"];

    const suggestions = coBookings.length >= 3
      ? coBookings.map(b => ({ service: b.service, popularity: b.cnt }))
      : fallbackBundles.map((s, i) => ({ service: s, popularity: 10 - i }));

    res.json({ suggestions, basedOn: serviceType });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
