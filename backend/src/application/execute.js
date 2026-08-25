/**
 * Use-case executor — application
 *
 * I-06 §5, §11, §12, §13, §24. The one place authorization, the transaction,
 * the audit record and the observability of a use case are composed.
 *
 *     authorize → BEGIN → run → audit → COMMIT
 *
 * WHY ONE EXECUTOR AND NOT A CONVENTION
 * ─────────────────────────────────────
 * Every one of those steps exists somewhere in the current codebase and no
 * two route files do them the same way. `bookings.js` opens a transaction and
 * checks `affectedRows`; `users.js` opens one for the wallet and not for the
 * profile; `admin.js` had none at all until I-04. The audit writer has three
 * call sites with three shapes. That is not a discipline problem to be
 * solved by review — it is what happens when the composition is written out
 * by hand at every call site.
 *
 * AD-009, MADE STRUCTURAL
 * ───────────────────────
 * "Every state change writes its audit record inside the same transaction,
 *  and a state change without one fails."
 *
 * A use case declaring `audit: "required"` that returns without staging a
 * record does not commit. The transaction is rolled back and the caller gets
 * a 500 — deliberately, because the alternative is a state change nobody can
 * account for, and that is the exposure `CREDENTIAL-INCIDENT.md` §2 is still
 * unable to answer.
 *
 * AUTHORIZATION RUNS INSIDE THE TRANSACTION
 * ─────────────────────────────────────────
 * For a command the kernel is given the transaction's connection, so the row
 * authorization decided against is the row the use case then mutates. The
 * I-04 middleware authorizes before the handler opens its own transaction,
 * which leaves a window; this closes it. Both call the same kernel — there is
 * still exactly one place that decides.
 */
"use strict";

const logger = require("../../utils/logger");
const { systemClock } = require("../shared/clock");
const { AppError, ForbiddenError, NotFoundError, UnauthenticatedError, UnprocessableError, StartupError } =
  require("../shared/errors");
const { getUseCase } = require("./registry");
const platform = require("../modules/platform");

const { authorize, DENY, recordDecision } = platform.authorization;
const { writeAudit, writeAuditOutOfBand } = platform.audit;

/**
 * A denial becomes an error of the right CLASS, and the transport maps the
 * class to a status. Nothing here knows what 403 is.
 *
 * `not_owner` and `not_found` both become NotFoundError where the policy asks
 * for the indistinguishable mapping, so a caller cannot use the difference to
 * discover that a resource exists (`API-ARCHITECTURE.md` §4.1).
 */
function denialToError(decision) {
  const reason = decision.reason;
  if (reason === DENY.UNAUTHENTICATED) return new UnauthenticatedError();
  if (reason === DENY.NOT_FOUND || reason === DENY.WRONG_RESOURCE) {
    return new NotFoundError(decision.policy ? decision.policy.resource : "resource");
  }
  /**
   * I-07. `toHttpStatus` has mapped `reason_required` to 422 since I-04, and
   * this function did not — so the same denial answered 422 through the
   * middleware and 403 through a use case, for the same policy and the same
   * actor. 403 says "you may not"; the truth is "you may, once you say why",
   * and a client cannot tell the difference from a 403.
   *
   * Found by the first I-07 test to exercise a `reasonRequired` policy
   * through the executor rather than through the middleware.
   */
  if (reason === DENY.REASON_REQUIRED) {
    return new UnprocessableError(
      "REASON_REQUIRED",
      `${decision.action} requires a stated reason`,
      { userMessage: { en: "Please give a reason for this decision.",
                       bn: "অনুগ্রহ করে এই সিদ্ধান্তের কারণ লিখুন।" },
        fields: [{ field: "reason", code: "REASON_REQUIRED" }] }
    );
  }
  const opaque = decision.policy && decision.policy.statusMode === "indistinguishable";
  if (opaque) return new NotFoundError(decision.policy.resource);
  return new ForbiddenError(decision.action, reason);
}

/**
 * Run a use case.
 *
 * @param {string} name
 * @param {object} input   already shape-validated by the transport
 * @param {object} ctx
 * @param {object} ctx.actor         from the authorization module
 * @param {object} ctx.db            pool
 * @param {object} ctx.repositories  the module's repositories
 * @param {string|null} [ctx.correlationId]
 * @param {string|null} [ctx.ip]
 * @param {string|null} [ctx.userAgent]
 * @param {string|null} [ctx.reason] the operator's stated reason (R-1103)
 * @param {object} [ctx.clock]
 */
async function execute(name, input = {}, ctx = {}) {
  const useCase = getUseCase(name);
  if (!useCase) {
    // The startup assertion cannot see a name that is only ever built at
    // runtime, so this remains reachable. It is a programming error, not a
    // configuration one, and it must not look like a denial.
    throw new StartupError(`no use case registered as "${name}"`);
  }

  const clock = ctx.clock || systemClock;
  const startedAt = Date.now();
  const db = ctx.db;

  const runInside = async (conn) => {
    // ── authorization ──────────────────────────────────────
    const resourceRef = useCase.resource ? useCase.resource(input, ctx) : null;
    const policyContext = useCase.context ? useCase.context(input, ctx) : {};
    const decision = await authorize(ctx.actor, useCase.action, resourceRef, {
      db: conn,
      reason: ctx.reason ?? null,
      ...policyContext,
    });

    if (!decision.allowed) {
      // Out of band, on the pool: a denial changes no state, and recording it
      // on the transaction would lose it to the rollback that follows.
      recordDecision(db, {
        actor: ctx.actor, decision, action: useCase.action,
        resourceId: resourceRef ? String(resourceRef) : null,
        reason: ctx.reason ?? null, ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null,
      });
      throw denialToError(decision);
    }

    // ── the use case's own context ─────────────────────────
    const staged = [];
    const useCaseCtx = {
      actor: ctx.actor,
      /**
       * The transaction, for a command. Repositories take it so their writes
       * join it — and it is also the seam the transactional outbox plugs into
       * (AD-006): an event is appended here, inside the same transaction as
       * the state change and its audit record. The outbox table and its
       * dispatcher are the events phase; the boundary is this parameter.
       */
      tx: conn,
      db,
      repositories: ctx.repositories || {},
      correlationId: ctx.correlationId ?? null,
      clock,
      /** What the kernel loaded and decided against. Never re-fetched. */
      authorized: { decision, resource: decision.resource, scope: decision.scope },
      /**
       * Stage an audit record. Written inside this transaction, before the
       * commit, by the executor — so a use case cannot forget the connection
       * and cannot write one that survives a rollback.
       */
      recordAudit(record) {
        staged.push(record);
      },
    };

    const result = await useCase.run(input, useCaseCtx);

    // ── AD-009 ─────────────────────────────────────────────
    if (useCase.audit === "required" && staged.length === 0) {
      throw new StartupError(
        `use case "${name}" declares audit "required" and staged no record. ` +
        "A state change nobody can account for is the exposure the audit log exists to close."
      );
    }

    for (const record of staged) {
      const write = useCase.transactional
        ? writeAudit(conn, buildRecord(useCase, ctx, decision, record), clock)
        : writeAuditOutOfBand(db, buildRecord(useCase, ctx, decision, record), clock);
      await write;
    }

    return result;
  };

  try {
    const result = useCase.transactional
      ? await db.withTransaction(runInside)
      : await runInside(db);
    log(useCase, ctx, startedAt, "ok", null);
    return result;
  } catch (err) {
    log(useCase, ctx, startedAt, err instanceof AppError ? "denied" : "failed", err);
    throw err;
  }
}

/**
 * Fill in what the use case should not have to repeat.
 *
 * The actor, the correlation id and the request metadata are the executor's;
 * the resource, the diff and the reason are the use case's, because only it
 * knows what changed.
 */
function buildRecord(useCase, ctx, decision, record) {
  return {
    actor: {
      correlationId: ctx.correlationId ?? null,
      principalId: ctx.actor ? ctx.actor.principalId : null,
      accountId: ctx.actor ? ctx.actor.accountId : null,
      role: ctx.actor ? ctx.actor.primaryRole : "anonymous",
      via: ctx.actor ? ctx.actor.via : "http",
      onBehalfOf: null,
    },
    action: record.action || useCase.action,
    resourceType: record.resourceType,
    resourceId: record.resourceId ?? null,
    resourceOwner: record.resourceOwner ?? null,
    outcome: record.outcome || "permitted",
    before: record.before ?? null,
    after: record.after ?? null,
    reason: record.reason ?? ctx.reason ?? null,
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
    sodBypass: decision.sodBypass,
  };
}

/**
 * §24. What happened, how long it took, and nothing about the payload.
 *
 * The input is never logged: it carries phone numbers, bios and prices, and a
 * log line is the least controlled place any of those could end up.
 */
function log(useCase, ctx, startedAt, outcome, err) {
  const line = {
    useCase: useCase.name,
    kind: useCase.kind,
    outcome,
    durationMs: Date.now() - startedAt,
    correlationId: ctx.correlationId ?? null,
    actor: ctx.actor ? ctx.actor.primaryRole : "anonymous",
    ...(err ? { failure: err.code || err.name } : {}),
  };
  if (outcome === "ok" && useCase.kind === "query") logger.debug("use case", line);
  else if (outcome === "failed") logger.error("use case", line);
  else logger.info("use case", line);
}

module.exports = { execute, denialToError };
