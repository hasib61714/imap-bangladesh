// ─────────────────────────────────────────────────────────────
//  IMAP – Winston structured logger
//  Usage: const logger = require('./utils/logger');
//         logger.info("message", { meta });
//         logger.error("error", { err });
// ─────────────────────────────────────────────────────────────
const { createLogger, format, transports } = require("winston");

const { combine, timestamp, printf, colorize, errors } = format;
const env = require("../config/environment");

// Phase 2.75: log level and redaction follow the *declared* process
// environment, not the widened data-safety predicate — a developer
// running locally should still get readable logs.
const isProd = env.isProductionEnvironment();

// ── Simple line format for dev ────────────────────────────
const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const extra = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
    return `${ts} [${level}] ${stack || message}${extra}`;
  })
);

// ── JSON format for production (Render log drain / Datadog) ─
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  format.json()
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  format: isProd ? prodFormat : devFormat,
  transports: [new transports.Console()],
  exitOnError: false,
});

module.exports = logger;
