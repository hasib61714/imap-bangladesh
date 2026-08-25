/**
 * Verification decisions — identity / application
 *
 * I-07 §12, §21. Five use cases, one transition, because five hand-written
 * copies of "lock, check the state machine, update, mirror, audit" is five
 * places for one of them to lose a step.
 *
 * WHAT THIS FACTORY GUARANTEES FOR EVERY DECISION
 * ───────────────────────────────────────────────
 *   · the case is locked by PRIMARY KEY as the transaction's first statement
 *   · the domain's transition table says the move is legal, not the caller
 *   · a reason exists where the transition demands one (R-1103)
 *   · the UPDATE is conditional on the state the domain just checked, so two
 *     reviewers deciding at once produce one decision and one 409
 *   · the legacy mirror moves in the same transaction (§23)
 *   · an audit record is staged — and the executor refuses to commit without
 *     one (AD-009)
 *
 * ZERO AI (§30). Every one of these is Tier C. Nothing here scores, ranks,
 * suggests or pre-fills a decision, and no code path reaches a model.
 */
"use strict";

const { defineUseCase } = require("../../../../application/useCase");
const { ConflictError, NotFoundError, ValidationError } = require("../../../../shared/errors");
const V = require("../../domain/verificationCase");

/**
 * An optional expiry the operator supplies.
 *
 * NO DEFAULT PERIOD IS INVENTED. `TRUST-ARCHITECTURE.md` §6 says verification
 * is time-bounded; how long a Bangladeshi NID check stays good is a legal and
 * commercial question with an owner, and §15 of this phase's brief forbids
 * guessing it. NULL means "no expiry set", which the domain treats as
 * currently valid — and `idx_expiry` makes applying a period, once decided,
 * a range scan rather than a migration.
 */
function optionalExpiry(value, now) {
  if (value === null || value === undefined || value === "") return null;
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) {
    throw new ValidationError("expires_at must be a date", {
      fields: [{ field: "expires_at", code: "INVALID" }],
    });
  }
  if (when.getTime() <= now.getTime()) {
    throw new ValidationError("expires_at must be in the future", {
      fields: [{ field: "expires_at", code: "NOT_FUTURE" }],
    });
  }
  return when;
}

/**
 * Build one decision use case.
 *
 * @param {object} spec
 * @param {string} spec.name
 * @param {string} spec.action
 * @param {string} spec.to               the target state
 * @param {string[]} spec.from           states this decision may be made from
 * @param {boolean} spec.isDecision      writes decided_by / decided_at
 * @param {boolean} [spec.allowsExpiry]
 * @param {string} spec.why
 */
function decisionUseCase(spec) {
  return defineUseCase(spec.name, {
    kind: "command",
    action: spec.action,
    resource: (input) => (input.case_id ? String(input.case_id) : null),
    /**
     * The reason reaches the POLICY, not just the handler.
     *
     * `reasonRequired` on the policy turns a missing reason into a kernel
     * DENIAL rather than a validation error — so a reviewer cannot reject
     * somebody by calling an endpoint that forgot to check (R-1103).
     */
    context: (input) => ({ reason: input.reason ?? null, targetState: spec.to }),
    /**
     * Deciding the same case twice with the same target is a no-op the second
     * time: the conditional UPDATE finds the case already moved and the
     * caller gets a 409 rather than a second audit record claiming a second
     * decision.
     */
    idempotency: "at_most_once_effect",
    audit: "required",
    why: spec.why,

    async run(input, ctx) {
      const repo = ctx.repositories.verification;
      const now = ctx.clock.now();
      const caseId = String(input.case_id);

      // FIRST STATEMENT, BY PRIMARY KEY. I-05's locking discipline: a locking
      // read that reaches the row through a secondary index and is then
      // followed by an UPDATE on the clustered index takes locks in two
      // orders and deadlocks — as ER_LOCK_DEADLOCK on InnoDB and ER_CHECKREAD
      // on MariaDB.
      const row = await repo.lockById(ctx.tx, caseId);
      if (!row) throw new NotFoundError("verification_case");

      if (!spec.from.includes(row.state)) {
        throw new ConflictError(
          "VERIFICATION_TRANSITION_INVALID",
          `a verification case in state ${row.state} cannot move to ${spec.to}`,
          { userMessage: { en: "That is not possible in the case's current state.",
                           bn: "এই অবস্থায় এটি সম্ভব নয়।" } }
        );
      }

      // The domain decides, again — the `from` list above is this use case's
      // narrower claim, and the transition table is the machine's. Both have
      // to agree or the move does not happen.
      V.assertTransition(row.state, spec.to, "trust_safety");
      const reason = V.requireReason(spec.to, input.reason);
      const expiresAt = spec.allowsExpiry ? optionalExpiry(input.expires_at, now) : null;

      const moved = await repo.transition(ctx.tx, {
        caseId, from: row.state, to: spec.to,
        decidedBy: ctx.actor.principalId, reason, expiresAt, now,
        isDecision: spec.isDecision,
      });
      if (!moved) {
        // Someone else decided between the lock and the update. Not possible
        // with the lock held — which is exactly why this is worth asserting:
        // if it ever fires, the locking discipline has been broken somewhere.
        throw new ConflictError("VERIFICATION_CASE_MOVED", "the case changed while being decided");
      }

      // §23: the legacy columns the existing frontend reads move with the
      // decision, inside the same transaction. They are DERIVED — nothing
      // I-07 adds ever reads them back as authority.
      await repo.mirrorLegacyStatus(ctx.tx, {
        principalId: row.principal_id,
        legacyKycId: row.legacy_kyc_id,
        state: spec.to,
        reason,
        decidedBy: ctx.actor.principalId,
        now,
      });

      ctx.recordAudit({
        resourceType: "verification_case",
        resourceId: caseId,
        resourceOwner: row.principal_id === null ? null : String(row.principal_id),
        before: { state: row.state },
        after: { state: spec.to, expires_at: expiresAt ? expiresAt.toISOString() : null },
        // The reason is recorded because it IS the decision's justification.
        // What is NOT recorded, here or anywhere: the NID number, the document
        // bytes, or any object key — AUDIT-LOG-ARCHITECTURE §3.2 records the
        // metadata of sensitive evidence and never the evidence.
        reason,
      });

      return {
        caseId,
        subjectId: row.principal_id === null ? null : String(row.principal_id),
        state: spec.to,
        decidedAt: now.toISOString(),
      };
    },
  });
}

module.exports = { decisionUseCase, optionalExpiry };
