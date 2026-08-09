/**
 * Rate-limit transport adapter — HTTP
 *
 * I-05 §14–§17. The route declares a scope and where its dimensions come
 * from; the shared counter decides.
 *
 *     router.post("/login",
 *       rateLimit("auth.login", (req) => ({ identifier: req.body?.identifier })),
 *       handler);
 *
 * `ip` is always supplied by this adapter — a route cannot forget it, and a
 * route cannot substitute something the caller controls for it.
 *
 * FAIL CLOSED (§17)
 * ─────────────────
 * If the counter cannot be reached the request is refused with 503. There is
 * no in-memory fallback (§35): a limiter that lets a request through because
 * it could not count is not a limiter, and the one moment it matters is
 * exactly the moment something is wrong.
 *
 * It costs nothing extra. Authentication needs the same database to look the
 * user up, so a store that cannot answer is a database that cannot
 * authenticate anyone anyway — 503 is the honest response either way.
 */
"use strict";

const pool = require("../db");
const logger = require("../utils/logger");
const limiter = require("../src/modules/platform/ratelimit");
const { writeAuditOutOfBand } = require("../src/modules/platform/audit/writeAudit");
const { auditActorFromRequest, requestIp, requestUserAgent } =
  require("../src/modules/platform/audit/auditActor");

/**
 * @param {string} scope        a scope from the policy table
 * @param {(req) => object} [dimensionsFrom]  the non-IP dimensions
 */
function rateLimit(scope, dimensionsFrom = () => ({})) {
  if (!limiter.isKnownScope(scope)) {
    // At module load, so a typo stops the process rather than producing an
    // endpoint that refuses everything in production.
    throw new Error(`unknown rate-limit scope "${scope}". Known: ${limiter.SCOPES.join(", ")}`);
  }

  return async function enforceRateLimit(req, res, next) {
    const dimensions = { ip: requestIp(req), ...dimensionsFrom(req) };

    let decision;
    try {
      decision = await limiter.consume(pool, scope, dimensions);
    } catch (err) {
      logger.error("rate-limit store unavailable — refusing", { scope, err: err.message });
      return res.status(503).json({
        error: "Service temporarily unavailable. Please try again shortly.",
        retryAfter: 30,
      });
    }

    if (decision.allowed) {
      req.rateLimit = decision;
      return next();
    }

    // §33: record the moment abuse crosses a limit, and only that moment. A
    // row for every subsequent 429 from the same blocked caller would bury
    // the signal in the noise it generates.
    if (decision.blockedNow) {
      writeAuditOutOfBand(pool, {
        actor: auditActorFromRequest(req),
        action: `ratelimit.${scope}`,
        resourceType: "rate_limit",
        // The dimension that tripped, never the value: the value is a phone
        // number or an IP address and this record does not need it.
        resourceId: null,
        outcome: "denied",
        reason: `limited by ${decision.limitedBy}`,
        ip: requestIp(req),
        userAgent: requestUserAgent(req),
        denyReason: "rate_limited",
      });
    }

    res.setHeader("Retry-After", String(decision.retryAfterSeconds));
    return res.status(429).json({
      error: "Too many attempts. Please wait and try again.",
      retryAfter: decision.retryAfterSeconds,
    });
  };
}

module.exports = { rateLimit };
