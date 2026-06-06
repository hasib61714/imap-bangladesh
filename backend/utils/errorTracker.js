// ─────────────────────────────────────────────────────────────
//  IMAP – Error tracking hook
//  Sends exceptions to Sentry when SENTRY_DSN is set (+ @sentry/node
//  installed); always logs structured. Lazy-required → no hard dependency.
// ─────────────────────────────────────────────────────────────
const logger = require("./logger");

let sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    sentry = require("@sentry/node");
    sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
    logger.info("Error tracking enabled (Sentry)");
  } catch (e) {
    logger.warn("SENTRY_DSN set but @sentry/node not installed — logging only", { err: e.message });
    sentry = null;
  }
}

/** Capture an exception with optional context. Never throws. */
function captureException(err, context = {}) {
  try { if (sentry) sentry.captureException(err, { extra: context }); } catch {}
  logger.error("captured exception", { err: err?.message, stack: err?.stack, ...context });
}

function isEnabled() { return !!sentry; }

module.exports = { captureException, isEnabled };
