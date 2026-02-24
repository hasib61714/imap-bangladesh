require("dotenv").config();
const express      = require("express");
const cors         = require("cors");
const http         = require("http");
const { Server }   = require("socket.io");
const jwt          = require("jsonwebtoken");
const helmet       = require("helmet");
const rateLimit    = require("express-rate-limit");

const isProd = process.env.NODE_ENV === "production";

// ── Rate limiters ─────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: isProd ? 200 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please wait." },
});

const app    = express();
const server = http.createServer(app);

// ── Socket.io setup ───────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const allowed = process.env.FRONTEND_URL;
      if (allowed && origin === allowed) return cb(null, true);
      if (!isProd && (/^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin))) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  },
});

// JWT auth middleware for Socket.io
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("No token"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch {
    // Allow connection without token (read-only)
    socket.user = null;
    next();
  }
});

io.on("connection", (socket) => {
  const uid = socket.user?.id || "guest";
  console.log(`🔌 Socket connected: ${uid}`);

  // Join a booking chat room
  socket.on("join_room", (bookingId) => {
    socket.join(`booking_${bookingId}`);
    console.log(`👥 ${uid} joined room: booking_${bookingId}`);
  });

  // Leave a booking chat room
  socket.on("leave_room", (bookingId) => {
    socket.leave(`booking_${bookingId}`);
  });

  // User typing indicator
  socket.on("typing", ({ bookingId, name }) => {
    socket.to(`booking_${bookingId}`).emit("user_typing", { name });
  });

  socket.on("stop_typing", ({ bookingId }) => {
    socket.to(`booking_${bookingId}`).emit("user_stop_typing");
  });

  // Provider location update (live tracking)
  socket.on("location_update", ({ bookingId, lat, lng }) => {
    io.to(`booking_${bookingId}`).emit("provider_location", { lat, lng });
  });

  // Booking status update broadcast
  socket.on("booking_status", ({ bookingId, status }) => {
    io.to(`booking_${bookingId}`).emit("booking_updated", { bookingId, status });
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Socket disconnected: ${uid}`);
  });
});

// Export io so routes can use it
app.set("io", io);

// ── Middleware ────────────────────────────────────────────
// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // disabled — React app uses inline styles / Ant Design
  crossOriginEmbedderPolicy: false,
}));

// CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://hasib61714.github.io",  // gh-pages (always allowed)
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / server-to-server / curl
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Allow any localhost or LAN in dev
    if (/^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api", generalLimiter);

// ── Routes ────────────────────────────────────────────────
app.use("/api/auth",      authLimiter, require("./routes/auth"));
app.use("/api/users",     require("./routes/users"));
app.use("/api/providers", require("./routes/providers"));
app.use("/api/bookings",  require("./routes/bookings"));
app.use("/api/kyc",       require("./routes/kyc"));
app.use("/api/reviews",   require("./routes/reviews"));
app.use("/api/services",  require("./routes/services"));
app.use("/api/admin",     require("./routes/admin"));
app.use("/api/ai",        require("./routes/ai"));
app.use("/api/blood",     require("./routes/blood"));
app.use("/api/disaster",  require("./routes/disaster"));
app.use("/api/chat",      require("./routes/chat"));
app.use("/api/promos",    require("./routes/promos"));
app.use("/api/schedule",  require("./routes/schedule"));
app.use("/api/sos",       require("./routes/sos"));
app.use("/api/payments",  require("./routes/payments"));
app.use("/api/upload",    require("./routes/upload"));

// ── One-time demo seed endpoint ───────────────────────────
// GET /api/admin/seed-demo?secret=<SEED_SECRET>
// Also auto-runs if fewer than 4 providers have service data (safe bootstrap)
app.get("/api/admin/seed-demo", async (req, res) => {
  const expected = process.env.SEED_SECRET;
  const hasValidSecret = expected && req.query.secret === expected;

  // If a secret is set, require it; if no secret is configured allow public bootstrap
  // (safe because it only inserts demo data, never deletes)
  if (!hasValidSecret) {
    // Abort unless DB is essentially empty (< 4 real providers)
    const pool = require("./db");
    const [[{ cnt }]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM providers WHERE service_type_bn IS NOT NULL AND service_type_bn <> ''"
    ).catch(() => [[{ cnt: 99 }]]);
    if (cnt >= 4) return res.status(403).json({ error: "Forbidden" });
  }
  const pool = require("./db");
  const bcrypt   = require("bcryptjs");
  const { v4: uuidv4 } = require("uuid");

  try {
    const log = [];

    // ── Categories ────────────────────────────────────────
    const cats = [
      { id: "cat-electric",  name_bn: "ইলেকট্রিক",         name_en: "Electrical",      slug: "electrical", icon: "⚡" },
      { id: "cat-plumber",   name_bn: "প্লাম্বার",           name_en: "Plumbing",        slug: "plumbing",   icon: "🔧" },
      { id: "cat-cleaning",  name_bn: "পরিষ্কার",            name_en: "Cleaning",        slug: "cleaning",   icon: "🧹" },
      { id: "cat-nurse",     name_bn: "নার্সিং / চিকিৎসা",   name_en: "Medical / Nurse", slug: "medical",    icon: "🏥" },
      { id: "cat-tutor",     name_bn: "গৃহশিক্ষক",           name_en: "Tutoring",        slug: "tutoring",   icon: "📚" },
      { id: "cat-carpenter", name_bn: "কাঠমিস্ত্রি",         name_en: "Carpentry",       slug: "carpentry",  icon: "🪚" },
      { id: "cat-painting",  name_bn: "রঙের কাজ",            name_en: "Painting",        slug: "painting",   icon: "🎨" },
      { id: "cat-ac",        name_bn: "এসি মেরামত",          name_en: "AC Repair",       slug: "ac_repair",  icon: "❄️" },
    ];
    for (const c of cats) {
      await pool.query(
        `INSERT INTO categories (id, name_bn, name_en, slug, icon) VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name_bn=VALUES(name_bn), name_en=VALUES(name_en), icon=VALUES(icon)`,
        [c.id, c.name_bn, c.name_en, c.slug, c.icon]
      ).catch(() => {});
    }
    log.push(`Categories: ${cats.length} upserted`);

    // ── Demo providers ────────────────────────────────────
    const hash = await bcrypt.hash("demo1234", 10);
    const providers = [
      { phone:"01700000001", name:"মো. রাকিব হোসেন",
        svc_bn:"ইলেকট্রিক মেরামত ও ওয়্যারিং",  svc_en:"Electrical Repair & Wiring",
        area_bn:"মিরপুর, ঢাকা",  area_en:"Mirpur, Dhaka",
        bio_bn:"৭ বছরের অভিজ্ঞ ইলেকট্রিশিয়ান। ঢাকার সকল এলাকায় সেবা দেই।",
        bio_en:"7-year experienced electrician serving all Dhaka areas.",
        rate:450, exp:7, rating:4.9, jobs:847, cat:"electrical" },
      { phone:"01700000002", name:"ফারজানা বেগম",
        svc_bn:"নার্সিং ও হোম কেয়ার",  svc_en:"Nursing & Home Care",
        area_bn:"গুলশান, উত্তরা, ঢাকা",  area_en:"Gulshan, Uttara, Dhaka",
        bio_bn:"পেশাদার নার্স — বয়স্ক সেবা ও পোস্ট-অপারেটিভ কেয়ারে বিশেষজ্ঞ।",
        bio_en:"Professional nurse specialising in elderly and post-operative care.",
        rate:600, exp:5, rating:4.8, jobs:631, cat:"medical" },
      { phone:"01700000003", name:"আলী হোসেন",
        svc_bn:"প্লাম্বিং ও পানির লাইন মেরামত",  svc_en:"Plumbing & Water Line Repair",
        area_bn:"ধানমন্ডি, মোহাম্মদপুর",  area_en:"Dhanmondi, Mohammadpur",
        bio_bn:"১০ বছরের অভিজ্ঞ প্লাম্বার — তাৎক্ষণিক সেবা পাওয়া যায়।",
        bio_en:"10-year experienced plumber — emergency service available.",
        rate:380, exp:10, rating:4.7, jobs:512, cat:"plumbing" },
      { phone:"01700000004", name:"নাসরিন আক্তার",
        svc_bn:"গভীর পরিষ্কার ও হাউসকিপিং",  svc_en:"Deep Cleaning & Housekeeping",
        area_bn:"বনানী, বারিধারা",  area_en:"Banani, Baridhara",
        bio_bn:"পেশাদার পরিষ্কারকর্মী — শতভাগ সন্তুষ্টি নিশ্চিত।",
        bio_en:"Professional cleaner with 100% satisfaction guarantee.",
        rate:300, exp:5, rating:4.7, jobs:285, cat:"cleaning" },
      { phone:"01700000005", name:"কামাল উদ্দিন",
        svc_bn:"গণিত ও বিজ্ঞান শিক্ষক",  svc_en:"Math & Science Tutor",
        area_bn:"লালমাটিয়া, আজিমপুর",  area_en:"Lalmatia, Azimpur",
        bio_bn:"SSC-HSC বিশেষজ্ঞ শিক্ষক — ৮ বছরের অভিজ্ঞতা।",
        bio_en:"SSC-HSC specialist teacher — 8 years experience.",
        rate:350, exp:8, rating:4.8, jobs:198, cat:"tutoring" },
      { phone:"01700000006", name:"রশিদ মিয়া",
        svc_bn:"কাঠের আসবাবপত্র ও মেরামত",  svc_en:"Furniture Carpentry & Repair",
        area_bn:"পুরান ঢাকা, কামরাঙ্গীরচর",  area_en:"Old Dhaka, Kamrangirchar",
        bio_bn:"দক্ষ কাঠমিস্ত্রি — কাস্টম আসবাবপত্র ও মেরামতে বিশেষজ্ঞ।",
        bio_en:"Skilled carpenter specialising in custom furniture and repair.",
        rate:420, exp:12, rating:4.6, jobs:340, cat:"carpentry" },
    ];

    let created = 0, updated = 0;
    for (const p of providers) {
      const [ex] = await pool.query("SELECT id FROM users WHERE phone = ?", [p.phone]);
      let userId;
      if (ex.length) {
        userId = ex[0].id;
      } else {
        userId = uuidv4();
        const refCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        await pool.query(
          `INSERT INTO users (id, name, phone, password_hash, role, is_active, referral_code)
           VALUES (?,?,?,?,'provider',1,?)`,
          [userId, p.name, p.phone, hash, refCode]
        );
        created++;
      }
      const [catRow] = await pool.query("SELECT id FROM categories WHERE slug = ?", [p.cat]);
      const catId = catRow[0]?.id || null;
      const [provEx] = await pool.query("SELECT id FROM providers WHERE user_id = ?", [userId]);
      if (provEx.length) {
        await pool.query(
          `UPDATE providers SET service_type_bn=?,service_type_en=?,area_bn=?,area_en=?,
           bio_bn=?,bio_en=?,hourly_rate=?,experience_yrs=?,rating=?,total_jobs=?,
           is_available=1,nid_verified=1,trust_score=90,category_id=? WHERE user_id=?`,
          [p.svc_bn,p.svc_en,p.area_bn,p.area_en,p.bio_bn,p.bio_en,
           p.rate,p.exp,p.rating,p.jobs,catId,userId]
        );
        updated++;
      } else {
        await pool.query(
          `INSERT INTO providers (id,user_id,service_type_bn,service_type_en,area_bn,area_en,
           bio_bn,bio_en,hourly_rate,experience_yrs,rating,total_jobs,
           is_available,nid_verified,trust_score,category_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,1,90,?)`,
          [uuidv4(),userId,p.svc_bn,p.svc_en,p.area_bn,p.area_en,
           p.bio_bn,p.bio_en,p.rate,p.exp,p.rating,p.jobs,catId]
        );
        created++;
      }
      log.push(`  ${p.name} (${p.svc_en})`);
    }

    // ── Fix existing providers with empty service/area ────
    const [empties] = await pool.query(
      `SELECT p.id, u.name FROM providers p LEFT JOIN users u ON u.id=p.user_id
       WHERE (p.service_type_bn IS NULL OR p.service_type_bn='')
         AND (p.service_type_en IS NULL OR p.service_type_en='')`
    );
    for (const ep of empties) {
      await pool.query(
        `UPDATE providers SET
           service_type_bn='সাধারণ সেবা', service_type_en='General Service',
           area_bn='ঢাকা', area_en='Dhaka',
           bio_bn='অভিজ্ঞ পেশাদার সেবাদাতা।', bio_en='Experienced professional.',
           hourly_rate=400, is_available=1, trust_score=80
         WHERE id=?`,
        [ep.id]
      );
      log.push(`  Fixed empty profile: ${ep.name}`);
      updated++;
    }

    res.json({ ok: true, created, updated, log });
  } catch (err) {
    console.error("seed-demo error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({
  status: "ok",
  time: new Date().toISOString(),
  socketio: "enabled",
  connectedSockets: io.engine.clientsCount,
}));

// ── 404 handler ───────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

// ── Global error handler ──────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🚀 IMAP Backend   : http://localhost:${PORT}`);
  console.log(`🔌 Socket.io      : enabled`);
  console.log(`📡 Health check   : http://localhost:${PORT}/api/health`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});
