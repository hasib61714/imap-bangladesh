/**
 * HTTP error boundary — transport
 *
 * I-06 §23. The one place an application or domain error becomes a status
 * code. Nothing below this layer knows what 403 is.
 *
 * WHAT IT REFUSES TO EMIT
 * ───────────────────────
 * Stack traces, SQL, database schema details, internal identifiers,
 * authorization internals. `AppError.toEnvelope()` already builds a narrow
 * shape; anything that is not an AppError is a defect, and a defect's message
 * is the least controlled string in the process, so it is logged and replaced.
 *
 * A DELIBERATE DEVIATION FROM API-ARCHITECTURE §4, AND ITS TRIGGER
 * ───────────────────────────────────────────────────────────────
 * §4 specifies a NESTED envelope: `{ error: { code, message, user_message,
 * retryable, correlation_id, fields } }`.
 *
 * `frontend/src/api.js:65` does `new Error(data.error || "Request failed")`.
 * Handed an object, that produces the string "[object Object]" — so shipping
 * the nested envelope now would turn every error message in the app into
 * that, and §27 forbids the frontend migration that would fix it.
 *
 * So the fields are emitted FLAT, with `error` remaining the human-readable
 * string the client already reads. Every field §4 requires is present and
 * machine-readable; only the nesting waits.
 *
 * Trigger for adopting the nested shape: the frontend's shared API client
 * (`APP-JSX-MIGRATION.md`, `shared/api/`). One reader, one change.
 */
"use strict";

const logger = require("../../../utils/logger");
const { isAppError } = require("../../shared/errors");
const env = require("../../../config/environment");

/**
 * The message a user is shown.
 *
 * `userMessage.en` when the error carries one — those are written for people.
 * Otherwise the developer-facing message, which is safe because every
 * AppError's message is authored here rather than derived from a driver.
 */
function publicMessage(err) {
  if (err.userMessage && err.userMessage.en) return err.userMessage.en;
  return err.message;
}

function errorBoundary(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (isAppError(err)) {
    const envelope = err.toEnvelope(req.requestId || null);
    const body = {
      // Flat, and a string — see the header. `error` is what the current
      // client reads.
      error: publicMessage(err),
      code: envelope.error.code,
      retryable: envelope.error.retryable,
      correlation_id: envelope.error.correlation_id,
      ...(envelope.error.user_message ? { user_message: envelope.error.user_message } : {}),
      ...(envelope.error.fields ? { fields: envelope.error.fields } : {}),
      ...(envelope.error.details ? { details: envelope.error.details } : {}),
    };
    if (err.retryAfterSeconds) res.setHeader("Retry-After", String(err.retryAfterSeconds));

    // A denial is not an incident. Logging every 403 at error level buries
    // the ones that are — the authorization module already records the
    // denials that matter, on the policy's terms.
    logger.debug("request refused", {
      method: req.method, url: req.originalUrl,
      code: err.code, status: err.status, correlationId: req.requestId || null,
    });
    return res.status(err.status).json(body);
  }

  // Not an AppError: nobody decided this, so it is a defect.
  logger.error("unhandled error", {
    method: req.method, url: req.originalUrl,
    err: err.message, stack: err.stack, correlationId: req.requestId || null,
  });
  return res.status(err.status || 500).json({
    error: env.isProduction() ? "Internal server error" : err.message,
    code: "INTERNAL",
    retryable: false,
    correlation_id: req.requestId || null,
  });
}

module.exports = { errorBoundary, publicMessage };
