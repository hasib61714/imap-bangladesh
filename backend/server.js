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
