/**
 * Verification case — identity / domain
 *
 * I-07 §5, §8, §21. `STATE-MACHINES.md` §9, implemented as written.
 *
 *     [*] → not_submitted → submitted → under_review → verified
 *                              ↑            ├→ rejected
 *                              │            └→ more_info
 *                              └────────────────┘  (resubmit)
 *           verified → expired → submitted
 *           verified → revoked → submitted   (appeal accepted)
 *           rejected → submitted             (resubmit)
 *
 * NO STATE WAS INVENTED. The I-07 brief §8 offers a candidate vocabulary
 * (`PENDING_REVIEW`, `CHANGES_REQUESTED`, `SUSPENDED`) and instructs that it
 * be compared against the authoritative machine first. It maps onto §9
 * exactly, and §9's names are used:
 *
 *   PENDING_REVIEW      → `submitted`
 *   CHANGES_REQUESTED   → `more_info`
 *   SUSPENDED           → `revoked`   (trust & safety, with a reason)
 *   APPROVED            → `verified`
 *
 * `GATE-1-ARCHITECTURE.md` §5 lists this machine as "VerificationCase |
 * submitted → in_review → approved | rejected; expired" — a compressed
 * summary with two names that differ (`in_review`, `approved`). The
 * dedicated document wins on vocabulary; the mapping is recorded in
 * I-07-PROVIDER-VERIFICATION.md §3 rather than resolved silently.
 *
 * WHY `not_submitted` IS NOT A ROW STATE
 * ──────────────────────────────────────
 * It is the machine's initial state and it means "there is no case". A row
 * holding it would be a case asserting its own absence. The column's enum
 * omits it and `stateOf(null)` returns it, so the two representations cannot
 * disagree.
 */
"use strict";

const { ConflictError, ValidationError } = require("../../../shared/errors");

const STATE = Object.freeze({
  NOT_SUBMITTED: "not_submitted",
  SUBMITTED: "submitted",
  UNDER_REVIEW: "under_review",
  VERIFIED: "verified",
  REJECTED: "rejected",
  MORE_INFO: "more_info",
  EXPIRED: "expired",
  REVOKED: "revoked",
});

/** What a row may hold. `not_submitted` is derived, never stored. */
const STORED_STATES = Object.freeze([
  STATE.SUBMITTED, STATE.UNDER_REVIEW, STATE.VERIFIED,
  STATE.REJECTED, STATE.MORE_INFO, STATE.EXPIRED, STATE.REVOKED,
]);

const KIND = Object.freeze({ IDENTITY: "identity", CAPABILITY: "capability" });

/**
 * from → { to → who may } , transcribed from §9's diagram and its rule table.
 *
 * `provider` means the subject of the case acting on their own; the platform
 * roles are `AUTHORIZATION-ARCHITECTURE.md` §7's. The kernel decides who an
 * actor is — this table only says which transitions exist and for whom, so
 * the two answers cannot be given in one place and drift.
 */
const TRANSITIONS = Object.freeze({
  [STATE.NOT_SUBMITTED]: { [STATE.SUBMITTED]: ["subject"] },
  [STATE.SUBMITTED]: {
    [STATE.UNDER_REVIEW]: ["trust_safety"],
    // A resubmission while still queued replaces the evidence rather than
    // creating a second case.
    [STATE.SUBMITTED]: ["subject"],
  },
  [STATE.UNDER_REVIEW]: {
    [STATE.VERIFIED]: ["trust_safety"],
    [STATE.REJECTED]: ["trust_safety"],
    [STATE.MORE_INFO]: ["trust_safety"],
  },
  [STATE.MORE_INFO]: { [STATE.SUBMITTED]: ["subject"] },
  [STATE.REJECTED]: { [STATE.SUBMITTED]: ["subject"] },
  [STATE.VERIFIED]: {
    [STATE.EXPIRED]: ["system"],
    [STATE.REVOKED]: ["trust_safety"],
  },
  [STATE.EXPIRED]: { [STATE.SUBMITTED]: ["subject"] },
  [STATE.REVOKED]: { [STATE.SUBMITTED]: ["subject"] },
});

/** §9: "Every state change is audited with actor and reason" — R-1103. */
const REASON_REQUIRED_INTO = Object.freeze([STATE.REJECTED, STATE.REVOKED, STATE.MORE_INFO]);

/** Terminal for the subject's purposes; nothing is terminal forever here. */
const GRANTS_IDENTITY_VERIFIED = STATE.VERIFIED;

/** The state of a principal's case, including when there is no case. */
const stateOf = (row) => (row ? row.state : STATE.NOT_SUBMITTED);

/**
 * May `from → to` happen at all, and may this role make it happen?
 *
 * Throws rather than returning false: a refused transition is a conflict the
 * caller must not be able to ignore, and returning a boolean invites
 * `if (canTransition(...)) { }` with an empty else.
 */
function assertTransition(from, to, actorRole) {
  if (!STORED_STATES.includes(to)) {
    throw new ValidationError(`"${to}" is not a verification state a case can hold`, {
      fields: [{ field: "state", code: "UNKNOWN_STATE" }],
    });
  }
  const allowed = TRANSITIONS[from] && TRANSITIONS[from][to];
  if (!allowed) {
    throw new ConflictError(
      "VERIFICATION_TRANSITION_INVALID",
      `a verification case cannot move from ${from} to ${to}`,
      { userMessage: { en: "That is not possible in the case's current state.",
                       bn: "এই অবস্থায় এটি সম্ভব নয়।" } }
    );
  }
  if (!allowed.includes(actorRole)) {
    throw new ConflictError(
      "VERIFICATION_TRANSITION_ACTOR",
      `${actorRole} may not move a verification case from ${from} to ${to}`
    );
  }
  return { reasonRequired: REASON_REQUIRED_INTO.includes(to) };
}

/**
 * The reason, where the transition demands one.
 *
 * R-1103 is the rule and this is where it bites: a rejection with no stated
 * reason is one the subject cannot answer, and "the reviewer will remember"
 * is not a record.
 */
function requireReason(to, reason) {
  if (!REASON_REQUIRED_INTO.includes(to)) return reason ? String(reason).slice(0, 500) : null;
  const text = String(reason ?? "").trim();
  if (text.length < 10) {
    throw new ValidationError(
      `moving a verification case to ${to} requires a stated reason of at least 10 characters`,
      { fields: [{ field: "reason", code: "REASON_REQUIRED" }] }
    );
  }
  return text.slice(0, 500);
}

/**
 * Is this case currently granting identity verification?
 *
 * Expiry is checked here rather than trusted from the column, because a case
 * expires by the passage of time and nothing runs at that instant. A case
 * that says `verified` with a past `expires_at` grants nothing, and the job
 * that writes `expired` is a tidy-up rather than the control.
 */
function grantsIdentityVerified(row, now) {
  if (!row || row.kind !== KIND.IDENTITY) return false;
  if (row.state !== GRANTS_IDENTITY_VERIFIED) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return false;
  return true;
}

/** What a subject may see about their own case. Never the reviewer's identity. */
function toSubjectView(row, now) {
  return Object.freeze({
    state: stateOf(row),
    kind: row ? row.kind : KIND.IDENTITY,
    submittedAt: row ? row.submitted_at : null,
    decidedAt: row ? row.decided_at : null,
    // R-406: a subject must be able to understand a decision well enough to
    // act on it. The reason is theirs; who wrote it is not.
    reason: row ? row.decision_reason : null,
    expiresAt: row ? row.expires_at : null,
    isVerified: grantsIdentityVerified(row, now),
  });
}

module.exports = {
  STATE, STORED_STATES, KIND, TRANSITIONS, REASON_REQUIRED_INTO,
  stateOf, assertTransition, requireReason, grantsIdentityVerified, toSubjectView,
};
