/**
 * Authorization transport adapter — HTTP
 *
 * I-04 §21. Routes do not decide; they declare an action and let the kernel
 * decide.
 *
 *     router.patch("/kyc/:id",
 *       authMiddleware,
 *       requireAuthorization(ACTION.VERIFICATION_DECIDE, { resource: (req) => req.params.id }),
 *       handler);
 *
 * WHY THIS IS NOT A SECOND AUTHORIZATION IMPLEMENTATION
 * ────────────────────────────────────────────────────
 * It makes no decision. It builds the actor, resolves the resource ID from
 * the request, calls `authorize()`, and translates the result into HTTP. Every
 * comparison of actor to resource happens in the kernel.
 *
 * AUTHORIZATION-IMPLEMENTATION-PLAN §7 says authorization belongs in the use
 * case rather than in middleware, "because middleware-only authorization is
 * bypassed by every other transport — which is exactly how the socket layer
 * ended up with no check at all". That is right, and there is no use-case
 * layer yet: it arrives with the domain modules from I-06. What makes the
 * warning survivable in the meantime is that the DECISION is not here. When
 * use cases exist they call `authorize()` directly and this file stops being
 * the caller; the socket layer already calls the same kernel through
 * `utils/bookingAccess.js`, so the two transports cannot diverge.
 *
 * WHAT IS ATTACHED ON A PERMIT
 * ────────────────────────────
 * `req.authorization = { actor, decision, resource, scope }`. The handler
 * reads the already-loaded resource instead of querying it again — §36, and
 * the reason chat.js no longer runs the participation query twice.
 */
"use strict";

const pool = require("../db");
const logger = require("../utils/logger");
const authz = require("../src/modules/platform/authorization");
const { legacyActorFromUser } = require("../src/modules/platform/authorization/legacy");
const { publicResponse } = require("../src/modules/platform/authorization/decision");
const { recordDecision } = require("../src/modules/platform/authorization/authorizationAudit");

/** Build the actor for this request. One place; §22's single boundary. */
function actorFor(req) {
  return legacyActorFromUser(req.user, { correlationId: req.requestId || null, via: "http" });
}

/**
 * @param {string} action  must already be registered — checked at module
 *        load, not per request, so a typo stops the process rather than
 *        producing an endpoint that denies everything in production.
 * @param {object} [opts]
 * @param {(req) => string|null} [opts.resource]  instance policies only
 * @param {(req) => object} [opts.context]        conditions and reason
 * @param {boolean} [opts.auditedByHandler]
 *        The handler writes its own record inside the transaction that
 *        carries the state change (§27). The adapter then records DENIALS
 *        only — two rows for one permitted action is not more evidence, it is
 *        the same event described twice, and an investigation reading the log
 *        has to work out which is which.
 * @param {(req) => boolean} [opts.when]
 *        For an endpoint that performs more than one distinct action —
 *        `PATCH /admin/users/:id` both suspends an account and grants a role.
 *        Each is authorized separately, and the handler applies ONLY the
 *        changes whose action appears in `req.authorizations`. A skipped
 *        authorization therefore removes a capability rather than leaving one
 *        unguarded.
 */
function requireAuthorization(action, opts = {}) {
  const policy = authz.getPolicy(action);
  if (!policy) {
    throw new authz.AuthorizationConfigError(
      `route binds "${action}", which has no registered policy. ` +
      "A use case with no policy must not ship (AUTHORIZATION-ARCHITECTURE §3)."
    );
  }
  if (policy.cardinality === "instance" && typeof opts.resource !== "function") {
    throw new authz.AuthorizationConfigError(
      `"${action}" acts on one ${policy.resource}; the route must say which one ` +
      "via { resource: (req) => id }."
    );
  }

  return async function authorizeRequest(req, res, next) {
    if (opts.when && !opts.when(req)) return next();

    const actor = actorFor(req);
    const resourceId = opts.resource ? opts.resource(req) : null;
    const ctx = { db: pool, ...(opts.context ? opts.context(req) : {}) };

    let decision;
    try {
      decision = await authz.authorize(actor, action, resourceId, ctx);
    } catch (err) {
      // The kernel returns denials rather than throwing, so reaching here is
      // a defect. It still fails closed.
      logger.error("authorization kernel error", { action, err: err.message });
      return res.status(403).json({ error: "Access denied" });
    }

    // Fire and forget: the record must not delay the response, and a failed
    // write must not turn a correct decision into a 500. `recordDecision`
    // never rejects.
    //
    // A permit whose handler audits the state change itself is not recorded
    // here; a denial always is, because there is no handler to reach.
    if (!(opts.auditedByHandler && decision.allowed)) {
      recordDecision(pool, {
        actor,
        decision,
        action,
        resourceId: resourceId ? String(resourceId) : null,
        reason: ctx.reason ?? null,
        ip: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      });
    }

    if (decision.shadow) {
      // §24. The kernel's stricter rule disagreed with the live behaviour.
      // The live behaviour wins; the disagreement is recorded.
      logger.info("authorization shadow mismatch", {
        action, correlationId: req.requestId || null, reason: decision.shadow.reason,
      });
    }

    if (!decision.allowed) {
      const { status, body } = publicResponse(decision, policy.statusMode);
      return res.status(status).json(body);
    }

    const granted = { actor, decision, resource: decision.resource, scope: decision.scope };
    req.authorization = granted;
    // Keyed as well as latest, so a handler that performs two actions can ask
    // which of them was permitted instead of assuming both were.
    req.authorizations = { ...(req.authorizations || {}), [action]: granted };
    return next();
  };
}

/** True when this request was permitted to perform `action`. */
const wasAuthorized = (req, action) => Boolean(req.authorizations && req.authorizations[action]);

module.exports = { requireAuthorization, actorFor, wasAuthorized };
