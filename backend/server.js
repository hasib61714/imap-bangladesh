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
const redis        = require("./utils/redis");

const isProd = process.env.NODE_ENV === "production";

// ── Rate limiters ─────────────────────────────────────────
// Backed by Redis when available (shared across instances); otherwise the
// default in-process memory store (identical single-instance behavior).
const rlStore = redis.createRateLimitStore();
const withStore = (cfg) => (rlStore ? { ...cfg, store: rlStore } : cfg);

const generalLimiter = rateLimit(withStore({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: isProd ? 200 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
}));
const authLimiter = rateLimit(withStore({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please wait." },
}));
const aiLimiter = rateLimit(withStore({
  windowMs: 60 * 1000,           // 1-minute sliding window
  max: isProd ? 20 : 200,        // 20 AI calls / minute in prod
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests, please wait a moment." },
  keyGenerator: (req) => req.headers["authorization"] || ipKeyGenerator(req),
}));

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

// Multi-instance fan-out via Redis adapter (no-op single-instance / no Redis)
redis.attachSocketAdapter(io).catch(() => {});

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

// ── Metrics (non-sensitive aggregate counters) ────────────
const metrics = require("./utils/metrics");
app.get("/api/metrics", (_req, res) => res.json(metrics.snapshot()));

// ── 404 handler ───────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

// ── Global error handler ──────────────────────────────────
const errorTracker = require("./utils/errorTracker");
app.use((err, req, res, _next) => {
  // Report to the error tracker (Sentry if configured) + structured log.
  // Response shape is unchanged.
  errorTracker.captureException(err, { method: req.method, url: req.originalUrl, requestId: req.requestId });
  res.status(err.status || 500).json({ success: false, error: isProd ? "Internal server error" : err.message });
});

// ── Start ─────────────────────────────────────────────────
// Enforce Redis only when explicitly required (REQUIRE_REDIS=true); otherwise
// the in-memory fallback keeps single-instance deployments working unchanged.
try { redis.assertReady(); }
catch (e) { logger.error(e.message); process.exit(1); }

const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", async () => {
  logger.info(`IMAP Backend started`, { port: PORT, env: process.env.NODE_ENV || "development" });
  logger.info(`Health check: http://localhost:${PORT}/api/health`);

  // Payment gateway posture (logs without leaking secrets; warns on prod misconfig)
  require("./config/payment").logStartup(logger);

  // ── Schema migrations ─────────────────────────────────────
  // Single source of truth = database/migrations/*.sql, applied by the shared
  // migrator (idempotent; safe on a fresh DB and on the existing prod DB).
  // Best-effort: a migration failure is logged but never blocks startup.
  try {
    const { runMigrations } = require("./database/migrator");
    const { applied } = await runMigrations({ log: (m) => logger.info(`[migrate] ${m}`) });
    if (applied.length) logger.info("Migrations applied", { count: applied.length });
  } catch (e) {
    logger.error("Startup migrations failed (continuing on existing schema):", e.message);
  }

  // Validate Web-Push (VAPID) configuration — warn if partially/incorrectly set
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    logger.warn("Web-Push disabled: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set");
  } else {
    try {
      require("web-push").setVapidDetails(
        process.env.VAPID_MAILTO || "mailto:admin@imap.com.bd",
        VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
      );
      logger.info("Web-Push configured", { publicKeyPresent: true });
    } catch (e) {
      logger.warn("Web-Push VAPID config invalid:", e.message);
    }
  }

  // ── Background workers ────────────────────────────────────
  const jobs = require("./jobs");
  jobs.startWorkers();
  // Periodic housekeeping (expired tokens, old notifications)
  jobs.enqueue("cleanup", {});
  setInterval(() => jobs.enqueue("cleanup", {}), 6 * 60 * 60 * 1000).unref();
  logger.info("Background workers started");
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
  errorTracker.captureException(err, { source: "uncaughtException" });
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason: String(reason) });
});
