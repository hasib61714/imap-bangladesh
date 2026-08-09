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
const env          = require("./config/environment");

const isProd = env.isProduction();

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

// JWT auth middleware for Socket.io.
// Tokenless connections are still permitted so the client can connect
// before sign-in, but such a socket can no longer join any room or emit
// any event that carries data (see the handlers below).
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) { socket.user = null; return next(); }
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    socket.user = null;
    next();
  }
});

// Socket handlers live in ./realtime.js so their authorization rules can
// be unit-tested (P0-7, P0-8).
const { registerHandlers, ADMIN_ROOM } = require("./realtime");

io.on("connection", (socket) => {
  logger.debug(`Socket connected: ${socket.user?.id || "guest"}`);
  registerHandlers(io, socket);
});

// Expose the admin room name to routes that need to reach administrators.
app.set("adminRoom", ADMIN_ROOM);

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

// ── Demo seed endpoint — REMOVED in Phase 0.5 (P0-9) ──────
// GET /api/admin/seed-demo used to run without any secret whenever fewer
// than four providers had a service type — i.e. on a fresh database. It
// created six provider accounts sharing the password `demo1234` and it
// was reachable by anyone on the internet.
//
// Seeding now lives only in `scripts/seedDemo.js`, which refuses to run
// when NODE_ENV=production and must be invoked deliberately from a shell.

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
  // Hoist one-time DDL so per-request handlers don't repeat it
  const _pool = require("./db");
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
