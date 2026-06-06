// ─────────────────────────────────────────────────────────────
//  IMAP – HTTP request logger middleware (Winston-backed)
//  Logs: method, url, status, duration, IP, userId (if authed)
//  Mount BEFORE routes in server.js:
//    app.use(require('./middleware/requestLogger'));
// ─────────────────────────────────────────────────────────────
const logger  = require("../utils/logger");
const metrics = require("../utils/metrics");

const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const ms      = Date.now() - start;
    const status  = res.statusCode;
    const userId  = req.user?.id || "-";
    const ip      = req.ip || req.headers["x-forwarded-for"] || "-";
    const method  = req.method;
    const url     = req.originalUrl;

    metrics.record({ status, ms });

    const level = status >= 500 ? "error"
                : status >= 400 ? "warn"
                : "info";

    // requestId ties this log line to the X-Request-ID response header (tracing)
    logger[level](`${method} ${url}`, { status, ms, ip, userId, requestId: req.requestId });
  });

  next();
};

module.exports = requestLogger;
