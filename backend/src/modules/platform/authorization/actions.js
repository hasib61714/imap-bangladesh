/**
 * Action and permission catalogue — platform / authorization
 *
 * I-04 §9. Two levels, and they are not the same thing:
 *
 *   PERMISSION   a verb. Twelve of them. What KIND of thing is being done.
 *   ACTION       resource + verb, e.g. `booking.observe`. Exactly one policy.
 *
 * §9 says not to invent hundreds of permissions. The verbs below are the
 * architecture's list, unchanged. The actions below are not invented either:
 * every one has a live call site in this repository today, or is named in
 * AUTHORIZATION-IMPLEMENTATION-PLAN §5 for a surface migrated by I-04.
 *
 * WHAT IS DELIBERATELY ABSENT
 * ───────────────────────────
 * The plan's §5 register is 84 actions covering Gate 1 in full. Most of those
 * name use cases that do not exist yet — `booking.confirm_completion` has no
 * `awaiting_confirmation` state to condition on, `payout.execute` has no
 * payout. Registering a policy for a use case that cannot be called produces
 * a register that looks complete and guards nothing, and it would make the
 * startup completeness assertion meaningless. They arrive with their use
 * cases.
 */
"use strict";

/**
 * The verbs. A policy names one; a test asserts no policy names a verb that
 * is not here, which is the "unknown permission" case in §37.
 */
const PERMISSION = Object.freeze({
  READ: "read",
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  APPROVE: "approve",
  REJECT: "reject",
  CANCEL: "cancel",
  COMPLETE: "complete",
  REFUND: "refund",
  PAYOUT: "payout",
  MANAGE_MEMBERSHIP: "manage_membership",
  MANAGE_SERVICE: "manage_service",
});

const PERMISSIONS = Object.freeze(Object.values(PERMISSION));
const PERMISSION_SET = new Set(PERMISSIONS);
const isKnownPermission = (p) => PERMISSION_SET.has(p);

/**
 * Action ids, grouped by the module that owns the resource.
 *
 * The id is a contract: it appears in `audit_log.action`, in the policy
 * register, and in the route binding. Renaming one breaks the audit history,
 * so they are named for the operation rather than for the endpoint.
 */
const ACTION = Object.freeze({
  // ── booking ────────────────────────────────────────────────
  /** Read a booking. Participant or platform. */
  BOOKING_OBSERVE: "booking.observe",
  /**
   * Read the completion OTP carried on a booking. Separate from
   * `booking.observe` because it is a DIFFERENT decision: the assigned
   * provider may read the booking and must not read the customer's proof of
   * delivery. Today that is a `delete booking.otp_code` line in the handler.
   */
  BOOKING_READ_COMPLETION_OTP: "booking.read_completion_otp",
  /**
   * Attempt a status change. Whether the transition is LEGAL is the state
   * machine's question and stays there (§19) — this decides only whether the
   * actor may attempt it at all.
   */
  BOOKING_TRANSITION: "booking.transition",
  /** Attach a completion photo to a booking. */
  BOOKING_ATTACH_PROOF: "booking.attach_proof",
  /** Read a booking's conversation. */
  MESSAGE_READ: "message.read",
  /** Post to a booking's conversation. */
  MESSAGE_SEND: "message.send",

  // ── identity ───────────────────────────────────────────────
  /** List platform users. */
  USER_LIST: "user.list",
  /**
   * Change what role a user holds. This is the privilege-change action, and
   * it is `manage_membership` rather than `update` because it is the one
   * operation that can create another actor as powerful as the caller.
   */
  MEMBERSHIP_GRANT: "membership.grant",
  /** Activate or suspend an account. */
  ACCOUNT_SET_STATUS: "account.set_status",
  /** List verification cases. */
  VERIFICATION_LIST: "verification.list",
  /**
   * Open one identity document. Sealed evidence: audited on every read
   * whether or not it changes anything (GATE-1-ARCHITECTURE §8, V-07).
   */
  VERIFICATION_READ_DOCUMENT: "verification.read_document",
  /** Approve or reject a verification case. */
  VERIFICATION_DECIDE: "verification.decide",

  // ── marketplace ────────────────────────────────────────────
  SERVICE_CREATE: "service.create",
  SERVICE_UPDATE: "service.update",
  SERVICE_DELETE: "service.delete",
  /** List provider profiles with operational detail. */
  PROVIDER_LIST_ALL: "provider.list_all",

  // ── finance ────────────────────────────────────────────────
  /** Read one payment. */
  PAYMENT_OBSERVE: "payment.observe",
  /** Read every payment on the platform. */
  PAYMENT_READ_ALL: "payment.read_all",
  /** Read platform revenue aggregates. */
  REVENUE_READ: "revenue.read",
  /** Read every credit application. */
  LOAN_READ_ALL: "loan.read_all",
  /** Decide a credit application. */
  LOAN_DECIDE: "loan.decide",

  // ── platform / operations ──────────────────────────────────
  EMERGENCY_LIST: "emergency.list",
  EMERGENCY_UPDATE: "emergency.update",
  COMPLAINT_LIST: "complaint.list",
  COMPLAINT_RESOLVE: "complaint.resolve",
  PROMO_LIST: "promo.list",
  PROMO_CREATE: "promo.create",
  PROMO_UPDATE: "promo.update",
  PROMO_DELETE: "promo.delete",
  NOTIFICATION_BROADCAST: "notification.broadcast",
  ANNOUNCEMENT_LIST: "announcement.list",
  SETTING_READ: "setting.read",
  SETTING_UPDATE: "setting.update",
  BOOKING_LIST_ALL: "booking.list_all",
  STATS_READ: "stats.read",
  /** Operational analytics surfaces. Not AI capability — see policies. */
  ANALYTICS_READ: "analytics.read",
  DIAGNOSTIC_READ: "diagnostic.read",
});

const ACTIONS = Object.freeze(Object.values(ACTION));

module.exports = { PERMISSION, PERMISSIONS, isKnownPermission, ACTION, ACTIONS };
