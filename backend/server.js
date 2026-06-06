require("dotenv").config();
const express      = require("express");
const cors         = require("cors");
const http         = require("http");
const { Server }   = require("socket.io");
const jwt          = require("jsonwebtoken");
const helmet       = require("helmet");
const rateLimit    = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const compression  = require("compression");
const logger       = require("./utils/logger");
const requestLogger = require("./middleware/requestLogger");

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
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,           // 1-minute sliding window
  max: isProd ? 20 : 200,        // 20 AI calls / minute in prod
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests, please wait a moment." },
  keyGenerator: (req) => req.headers["authorization"] || ipKeyGenerator(req),
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

// ── Socket.io authentication (strict) ─────────────────────
// Reject missing / invalid / expired tokens and inactive users at connect time.
const socketPool = require("./db");
const { authenticateSocket, canAccessBooking, createRateLimiter, isValidBookingId } = require("./utils/socketSecurity");
const socketEventLimiter = createRateLimiter({ points: 40, windowMs: 10_000 });

io.use((socket, next) => authenticateSocket(socketPool, socket, next));

io.on("connection", (socket) => {
  const uid = socket.user.id; // guaranteed by io.use
  logger.debug(`Socket connected: ${uid}`);

  // Join a booking room — ONLY the booking's customer, assigned provider, or admin.
  socket.on("join_room", async (bookingId, ack) => {
    const reply = (o) => { if (typeof ack === "function") ack(o); };
    if (!isValidBookingId(bookingId))   return reply({ ok: false, error: "invalid_booking" });
    if (!socketEventLimiter(socket))    return reply({ ok: false, error: "rate_limited" });
    try {
      if (!(await canAccessBooking(socketPool, socket.user, bookingId))) {
        logger.warn(`Socket ${uid} denied join booking_${bookingId}`);
        return reply({ ok: false, error: "forbidden" });
      }
      socket.join(`booking_${bookingId}`);
      logger.debug(`${uid} joined room: booking_${bookingId}`);
      reply({ ok: true });
    } catch (e) {
      logger.error("join_room error", { err: e.message });
      reply({ ok: false, error: "server_error" });
    }
  });

  socket.on("leave_room", (bookingId) => {
    if (isValidBookingId(bookingId)) socket.leave(`booking_${bookingId}`);
  });

  // An event is only honoured if the socket has JOINED (=was authorized for) the room.
  // This binds every realtime action to the booking-access check above (spoof prevention).
  const inRoom = (bookingId) => isValidBookingId(bookingId) && socket.rooms.has(`booking_${bookingId}`);

  // Typing — server-supplied name, never client-supplied
  socket.on("typing", ({ bookingId } = {}) => {
    if (!inRoom(bookingId) || !socketEventLimiter(socket)) return;
    socket.to(`booking_${bookingId}`).emit("user_typing", { name: socket.user.name || "User" });
  });
  socket.on("stop_typing", ({ bookingId } = {}) => {
    if (!inRoom(bookingId)) return;
    socket.to(`booking_${bookingId}`).emit("user_stop_typing");
  });

  // Live location — participant-only, validated coordinates
  socket.on("location_update", ({ bookingId, lat, lng } = {}) => {
    if (!inRoom(bookingId) || !socketEventLimiter(socket)) return;
    const safeLat = parseFloat(lat), safeLng = parseFloat(lng);
    if (Number.isNaN(safeLat) || Number.isNaN(safeLng) ||
        safeLat < -90 || safeLat > 90 || safeLng < -180 || safeLng > 180) return;
    io.to(`booking_${bookingId}`).emit("provider_location", { lat: safeLat, lng: safeLng });
  });

  // Booking status broadcast — participant-only, validated status
  const VALID_BOOKING_STATUSES = ["pending", "confirmed", "active", "ongoing", "completed", "cancelled"];
  socket.on("booking_status", ({ bookingId, status } = {}) => {
    if (!inRoom(bookingId) || !socketEventLimiter(socket)) return;
    if (!VALID_BOOKING_STATUSES.includes(status)) return;
    io.to(`booking_${bookingId}`).emit("booking_updated", { bookingId, status });
  });

  socket.on("disconnect", () => {
    logger.debug(`Socket disconnected: ${uid}`);
  });
});

// Export io so routes can use it
app.set("io", io);

// ── Trust proxy (Render sits behind a load balancer) ────────
// Must be set AFTER app is created but BEFORE rate-limiters are applied
app.set("trust proxy", 1);

// ── X-Request-ID (tracing header) ────────────────────────────
app.use((req, res, next) => {
  const id = req.headers["x-request-id"] ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
});

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

app.use(compression());
app.use(requestLogger);
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
app.use("/api/ai",        aiLimiter, require("./routes/ai"));
app.use("/api/blood",     require("./routes/blood"));
app.use("/api/disaster",  require("./routes/disaster"));
app.use("/api/chat",      require("./routes/chat"));
app.use("/api/promos",    require("./routes/promos"));
app.use("/api/schedule",  require("./routes/schedule"));
app.use("/api/sos",       require("./routes/sos"));
app.use("/api/payments",  require("./routes/payments"));
app.use("/api/upload",    require("./routes/upload"));
app.use("/api/loans",     require("./routes/loans"));

// (Removed: public /api/admin/seed-demo backdoor — use scripts/seedDemo.js via CLI instead.)

// ── Health check ──────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  let dbStatus = "ok";
  let dbLatencyMs = null;
  try {
    const pool = require("./db");
    const t0 = Date.now();
    await pool.query("SELECT 1");
    dbLatencyMs = Date.now() - t0;
  } catch (e) {
    dbStatus = `error: ${e.message}`;
  }
  const mem = process.memoryUsage();
  res.json({
    status: dbStatus === "ok" ? "ok" : "degraded",
    db: { status: dbStatus, latencyMs: dbLatencyMs },
    uptime: Math.floor(process.uptime()),
    memory: { heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024), rssMB: Math.round(mem.rss / 1024 / 1024) },
    time: new Date().toISOString(),
    socketio: { status: "enabled", clients: io.engine.clientsCount },
  });
});

// ── 404 handler ───────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

// ── Global error handler ──────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error("Unhandled error", { method: req.method, url: req.originalUrl, err: err.message, stack: err.stack });
  res.status(err.status || 500).json({ success: false, error: isProd ? "Internal server error" : err.message });
});

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", async () => {
  logger.info(`IMAP Backend started`, { port: PORT, env: process.env.NODE_ENV || "development" });
  logger.info(`Health check: http://localhost:${PORT}/api/health`);

  // Payment gateway posture (logs without leaking secrets; warns on prod misconfig)
  require("./config/payment").logStartup(logger);

  // Hoist one-time DDL so per-request handlers don't repeat it
  const _pool = require("./db");

  // ── P0 migrations (idempotent, TiDB-compatible) ───────────
  await _pool.query(
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) DEFAULT 'booking'"
  ).catch(e => logger.warn("payments.purpose migration:", e.message));
  await _pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id    VARCHAR(36),
    actor_role  VARCHAR(20),
    action      VARCHAR(60) NOT NULL,
    target_type VARCHAR(40),
    target_id   VARCHAR(80),
    ip          VARCHAR(60),
    meta        JSON,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_action (action),
    INDEX idx_actor  (actor_id),
    INDEX idx_created (created_at)
  ) ENGINE=InnoDB`).catch(e => logger.warn("audit_log DDL:", e.message));

  // ── P1 migrations (idempotent, TiDB-compatible) ───────────
  // Refresh-token rotation columns (store hash only; family + reuse tracking)
  for (const ddl of [
    "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64)",
    "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id VARCHAR(36)",
    "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked TINYINT(1) DEFAULT 0",
    "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by VARCHAR(64)",
    "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS used_at TIMESTAMP NULL",
    "ALTER TABLE refresh_tokens MODIFY COLUMN token VARCHAR(512) NULL",
  ]) {
    await _pool.query(ddl).catch(e => logger.warn("refresh_tokens migration:", e.message));
  }
  await _pool.query("CREATE INDEX idx_rt_token_hash ON refresh_tokens (token_hash)").catch(() => {});
  await _pool.query("CREATE INDEX idx_rt_family ON refresh_tokens (family_id)").catch(() => {});

  // KYC: widen doc_type from a rigid ENUM to VARCHAR (canonical set in config/kyc.js)
  await _pool.query("ALTER TABLE kyc_docs MODIFY COLUMN doc_type VARCHAR(30) NOT NULL")
    .catch(e => logger.warn("kyc doc_type migration:", e.message));

  await _pool.query(`CREATE TABLE IF NOT EXISTS loyalty_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    points INT NOT NULL,
    reason_bn VARCHAR(200),
    reason_en VARCHAR(200),
    booking_id VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`).catch(e => logger.warn("loyalty_log DDL:", e.message));
  await _pool.query(`CREATE TABLE IF NOT EXISTS referrals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    referrer_id VARCHAR(36) NOT NULL,
    referred_id VARCHAR(36) NOT NULL,
    status ENUM('pending','active') DEFAULT 'pending',
    bonus_paid DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_ref (referrer_id, referred_id)
  ) ENGINE=InnoDB`).catch(e => logger.warn("referrals DDL:", e.message));
});

// ── Graceful shutdown ─────────────────────────────────────
const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    logger.info("HTTP server closed");
    try {
      const pool = require("./db");
      await pool.end();
      logger.info("DB pool closed");
    } catch (e) {
      logger.warn("DB pool close error", { err: e.message });
    }
    process.exit(0);
  });
  // Force exit after 10 s if something hangs
  setTimeout(() => {
    logger.error("Forced exit after timeout");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { err: err.message, stack: err.stack });
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason: String(reason) });
});
