/**
 * Audit actor — platform
 *
 * Builds the "who" half of an audit record from an Express request.
 *
 * THIS IS NOT THE AUTHORIZATION ACTOR. §36 reserves that for I-04, and the
 * two are deliberately different objects: this one is a description of who
 * did something, for the record. It carries no capability, answers no
 * question about permission, and is never consulted by a decision.
 *
 * When the authorization kernel lands it will own the richer Actor, and this
 * will derive from it rather than the reverse.
 */
"use strict";

/**
 * @param {import('express').Request} req
 * @param {{ principalId?: string, role?: string, accountId?: string }} [override]
 *        Used where the request is not yet authenticated but the subject is
 *        known — a failed login knows which identifier was attempted.
 */
function auditActorFromRequest(req, override = {}) {
  return {
    // server.js generates this per request and sets X-Request-ID. Until now
    // nothing read it; it is what ties one user action across HTTP, the audit
    // log and (later) events and jobs.
    correlationId: req.requestId || null,
    principalId: override.principalId ?? req.user?.id ?? null,
    accountId: override.accountId ?? null,
    // A request with no authenticated user still has a role: "anonymous" is a
    // fact, not a missing value.
    role: override.role ?? req.user?.role ?? "anonymous",
    via: "http",
    onBehalfOf: null,
  };
}

/**
 * The client's address, honouring the proxy Render sits behind.
 * `app.set("trust proxy", 1)` is already configured, so req.ip is correct.
 */
function requestIp(req) {
  return req.ip || req.headers["x-forwarded-for"] || null;
}

function requestUserAgent(req) {
  return req.headers["user-agent"] || null;
}

module.exports = { auditActorFromRequest, requestIp, requestUserAgent };
