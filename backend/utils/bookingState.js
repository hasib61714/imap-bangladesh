/**
 * Booking state machine — IMAP
 *
 * Phase 0.5 containment for P0-5 / P1-6.
 *
 * The audited failure: `PATCH /api/bookings/:id/status` wrote the new
 * status unconditionally and then ran the payout block whenever the new
 * status was "completed". There was no check that the booking was not
 * already completed, and every role could set every status — so a
 * customer could pay a provider an unlimited number of times.
 *
 * This is deliberately the *minimum* safe policy, not the future IMAP
 * workflow. It answers two questions and nothing else:
 *   1. is this transition legal at all?
 *   2. is this actor allowed to make it?
 *
 * Enforcement of "only once" is not done here — it is done in the route
 * by applying the transition as a conditional UPDATE guarded on the
 * expected current status. This module only decides legality.
 */

const STATUSES = ["pending", "confirmed", "active", "completed", "cancelled"];

/** Terminal states can never transition again. */
const TERMINAL = new Set(["completed", "cancelled"]);

/**
 * from → { to → roles allowed to make that transition }
 * Roles: "customer" (booking owner), "provider" (assigned provider), "admin".
 */
const TRANSITIONS = {
  pending: {
    confirmed: ["provider", "admin"],
    cancelled: ["customer", "provider", "admin"],
  },
  confirmed: {
    active:    ["provider", "admin"],
    cancelled: ["customer", "provider", "admin"],
  },
  active: {
    completed: ["provider", "admin"],
    cancelled: ["admin"],           // work has started: only an admin may void it
  },
  completed: {},                    // terminal
  cancelled: {},                    // terminal
};

/** Transitions that move money, and the ledger key prefix each one uses. */
const FINANCIAL_EFFECT = {
  completed: "payout",   // credit provider earnings
  cancelled: "refund",   // return the customer's debit
};

class TransitionError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.name = "TransitionError";
    this.status = status;
  }
}

const isValidStatus = (s) => STATUSES.includes(s);

/**
 * Decide whether `actorRole` may move a booking from `from` to `to`.
 * @param {string} from  current persisted status
 * @param {string} to    requested status
 * @param {"customer"|"provider"|"admin"} actorRole
 * @throws {TransitionError} with a message safe to return to the caller
 * @returns {{ financialEffect: string|null }}
 */
function assertTransition(from, to, actorRole) {
  if (!isValidStatus(to))   throw new TransitionError(`Invalid status: ${to}`, 400);
  if (!isValidStatus(from)) throw new TransitionError(`Booking has an unknown status: ${from}`, 409);

  if (from === to) {
    throw new TransitionError(`Booking is already ${to}`, 409);
  }
  if (TERMINAL.has(from)) {
    throw new TransitionError(`Booking is ${from} and can no longer be changed`, 409);
  }

  const allowedRoles = TRANSITIONS[from]?.[to];
  if (!allowedRoles) {
    throw new TransitionError(`Cannot change a booking from ${from} to ${to}`, 409);
  }
  if (!allowedRoles.includes(actorRole)) {
    throw new TransitionError("You are not allowed to make this change", 403);
  }

  return { financialEffect: FINANCIAL_EFFECT[to] || null };
}

/** Deterministic ledger key, so a repeat can never insert a second row. */
const ledgerRef = (kind, id) => `booking:${id}:${kind}`;

module.exports = {
  STATUSES,
  TERMINAL,
  TRANSITIONS,
  assertTransition,
  isValidStatus,
  ledgerRef,
  TransitionError,
};
