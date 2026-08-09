/**
 * Gate-1 policy register — platform / authorization
 *
 * I-04 §9, §10, §16, §18. One policy per action; the register is the answer
 * to "who may do what", in one file, readable end to end.
 *
 * ROLES ARE THE SIX, FROM THE FIRST COMMIT
 * ────────────────────────────────────────
 * Not one `admin`. Today one person holds all six through `legacy.js`, so
 * every policy below permits today's administrator — but each states which
 * capability it actually needs. The day a second operator exists, restricting
 * them to `finance` is a membership change and this file does not move.
 *
 * WHERE THE DOCUMENTS DISAGREE, THE NARROWER READING WINS
 * ──────────────────────────────────────────────────────
 * `verification.decide` is granted to `trust_safety, operations` by
 * AUTHORIZATION-ARCHITECTURE §3.1 and AUTHORIZATION-IMPLEMENTATION-PLAN §5,
 * and DOMAIN-ARCHITECTURE §6 says operations "may not make verification
 * decisions". That is a real conflict and §46 makes it an owner decision, so
 * it is not resolved here — it is registered at the narrower reading
 * (trust_safety only), which changes nothing live because the Gate-1
 * administrator holds both, and reported. Fail closed while the question is
 * open.
 *
 * STATUS MODES
 * ────────────
 * `statusMode: "legacy"` marks a policy whose denial keeps today's HTTP
 * status. `/api/*` answers 403 when a resource exists and the caller may not
 * see it, and 404 when it does not — an enumeration oracle that
 * CRITICAL-TEST-MATRIX row 16 wants closed. Closing it changes responses the
 * frontend and the existing P0-7/P0-8 tests both depend on, which is a
 * product decision with an owner. The exception is declared per policy and
 * counted by a test rather than assumed.
 */
"use strict";

const { registerPolicy } = require("./registry");
const { ACTION, PERMISSION } = require("./actions");
const { ROLE } = require("./roles");
const R = require("./relationships");

const {
  CUSTOMER, PROVIDER, SUPPORT, FINANCE, TRUST_SAFETY, OPERATIONS,
  EMERGENCY_RESPONDER, PLATFORM_OWNER,
} = ROLE;

/** A platform-wide collection: this actor sees the whole set. */
const ALL = () => ({ all: true });

/** Terminal booking states — nothing further happens to the booking. */
const TERMINAL_BOOKING = new Set(["completed", "cancelled"]);

let installed = false;

function installPolicies() {
  if (installed) return;
  installed = true;

  // ══════════════════════════════════════════════════════════
  //  booking
  // ══════════════════════════════════════════════════════════

  registerPolicy(ACTION.BOOKING_OBSERVE, {
    resource: "booking",
    permission: PERMISSION.READ,
    roles: [CUSTOMER, PROVIDER, SUPPORT],
    cardinality: "instance",
    relationship: R.bookingParticipantOrPlatform,
    tier: "A",
    audit: "none",
    statusMode: "legacy",
    why: "P0-7: any authenticated user could read any booking over the socket. Participation is the check.",
  });

  registerPolicy(ACTION.BOOKING_READ_COMPLETION_OTP, {
    resource: "booking",
    permission: PERMISSION.READ,
    roles: [CUSTOMER, SUPPORT],
    cardinality: "instance",
    // The assigned provider may read the booking and must NOT read this. It
    // is the customer's proof that the work was delivered; a provider who can
    // read it can close a job the customer never confirmed.
    relationship: R.bookingCustomerOrPlatform,
    tier: "A",
    audit: "none",
    statusMode: "legacy",
    why: "The completion OTP is the customer's evidence, not a booking field.",
  });

  registerPolicy(ACTION.BOOKING_TRANSITION, {
    resource: "booking",
    permission: PERMISSION.UPDATE,
    roles: [CUSTOMER, PROVIDER, SUPPORT],
    cardinality: "instance",
    relationship: R.bookingParticipantOrPlatform,
    // NO state condition here, deliberately (§19). Whether pending → active
    // is legal, and which role may make it, is utils/bookingState.js — the
    // state machine remains the authority on transitions. This policy answers
    // only "may this actor attempt a transition on this booking at all".
    // Duplicating the table here would create two answers that drift.
    tier: "B",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Authorization to attempt; the state machine decides legality (§19).",
  });

  registerPolicy(ACTION.BOOKING_ATTACH_PROOF, {
    resource: "booking",
    permission: PERMISSION.UPDATE,
    roles: [CUSTOMER, PROVIDER, SUPPORT],
    cardinality: "instance",
    relationship: R.bookingParticipantOrPlatform,
    // §18, and a case where state genuinely belongs in the policy rather than
    // in the state machine: attaching a completion photo is not a transition,
    // so no machine covers it, and a photo attached to a cancelled booking is
    // evidence for an event that did not happen.
    conditions: (actor, booking) => booking.status === "active" || booking.status === "completed",
    tier: "B",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Completion evidence belongs to a booking that reached the work.",
  });

  registerPolicy(ACTION.MESSAGE_READ, {
    resource: "booking",
    permission: PERMISSION.READ,
    roles: [CUSTOMER, PROVIDER, SUPPORT],
    cardinality: "instance",
    relationship: R.bookingParticipantOrPlatform,
    tier: "A",
    audit: "none",
    statusMode: "legacy",
    why: "A conversation is scoped to its booking's participants (P0-7).",
  });

  registerPolicy(ACTION.MESSAGE_SEND, {
    resource: "booking",
    permission: PERMISSION.CREATE,
    roles: [CUSTOMER, PROVIDER, SUPPORT],
    cardinality: "instance",
    relationship: R.bookingParticipantOrPlatform,
    // §23/§24. AUTHORIZATION-IMPLEMENTATION-PLAN §5 conditions this on
    // "booking not terminal". The live system does not, and switching it on
    // would stop people messaging about a job that has just finished — a
    // product change, not an authorization fix. Recorded, discarded, reported.
    shadowConditions: (actor, booking) => !TERMINAL_BOOKING.has(booking.status),
    shadowConditionsReason:
      "plan §5 conditions message.send on a non-terminal booking; /api/chat allows it in " +
      "every state today. Enforcing it would revoke a capability users have, which is an " +
      "owner decision (I-04-AUTHORIZATION-MAP.md §6).",
    tier: "B",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Only participants may post to a booking's conversation.",
  });

  // ══════════════════════════════════════════════════════════
  //  identity
  // ══════════════════════════════════════════════════════════

  registerPolicy(ACTION.USER_LIST, {
    resource: "user",
    permission: PERMISSION.READ,
    roles: [SUPPORT, OPERATIONS, TRUST_SAFETY, PLATFORM_OWNER],
    cardinality: "collection",
    scope: ALL,
    tier: "B",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Operational user search. Not finance: a payment question is answered from payments.",
  });

  registerPolicy(ACTION.MEMBERSHIP_GRANT, {
    resource: "user",
    permission: PERMISSION.MANAGE_MEMBERSHIP,
    // The narrowest grant in the register. This is the one action that can
    // create another actor as powerful as the caller.
    roles: [PLATFORM_OWNER],
    cardinality: "instance",
    relationship: R.platformScoped,
    // §12. Changing your OWN role is the same actor on both sides of the
    // control that is supposed to require two people.
    sameActor: (actor, subject) => R.same(actor.principalId, subject.id),
    // R-1103: an override with no stated reason is unappealable. Required
    // only for the self-directed case, because that is the one the Gate-1
    // single-operator limitation cannot otherwise constrain at all — and
    // requiring it everywhere would break the operator console today, which
    // is a change with an owner.
    reasonRequired: (actor, subject) => R.same(actor.principalId, subject.id),
    tier: "C",
    audit: "required",
    statusMode: "legacy",
    why: "Privilege change. No role grants itself another role (AUTHORIZATION-ARCHITECTURE §7).",
  });

  registerPolicy(ACTION.ACCOUNT_SET_STATUS, {
    resource: "user",
    permission: PERMISSION.UPDATE,
    roles: [TRUST_SAFETY, PLATFORM_OWNER],
    cardinality: "instance",
    relationship: R.platformScoped,
    // Was an inline `if` in the handler (§21). It is a condition on the
    // actor's relationship to the subject, which makes it a policy.
    conditions: (actor, subject, ctx) =>
      !(ctx.targetStatus === "suspended" && R.same(actor.principalId, subject.id)),
    sameActor: (actor, subject) => R.same(actor.principalId, subject.id),
    tier: "C",
    audit: "required",
    statusMode: "legacy",
    why: "Suspension is punitive and audited; an operator must not lock themselves out.",
  });

  registerPolicy(ACTION.VERIFICATION_LIST, {
    resource: "kyc_document",
    permission: PERMISSION.READ,
    roles: [TRUST_SAFETY, OPERATIONS],
    cardinality: "collection",
    // The list deliberately carries no images (P1-12); reading one is a
    // separate, Tier-C, individually audited action.
    scope: () => ({ all: true, images: false }),
    tier: "B",
    audit: "on_deny",
    statusMode: "legacy",
    why: "The review queue is metadata. Evidence is opened one case at a time.",
  });

  registerPolicy(ACTION.VERIFICATION_READ_DOCUMENT, {
    resource: "kyc_document",
    permission: PERMISSION.READ,
    // §6: finance, support, operations and platform_owner may NOT read
    // identity documents. One role, and the platform owner is not it.
    roles: [TRUST_SAFETY],
    cardinality: "instance",
    relationship: R.platformScoped,
    sameActor: (actor, doc) => R.same(actor.principalId, doc.subjectUserId),
    tier: "C",
    // V-07: every Sealed read is audited whether or not it changes anything.
    audit: "required",
    statusMode: "legacy",
    why: "Sealed evidence. The narrowest grant, and every read is a record.",
  });

  registerPolicy(ACTION.VERIFICATION_DECIDE, {
    resource: "kyc_document",
    permission: PERMISSION.APPROVE,
    // The documented conflict, registered narrow. See the header.
    roles: [TRUST_SAFETY],
    cardinality: "instance",
    relationship: R.platformScoped,
    // Deciding your own identity case. Permitted at Gate 1 because one person
    // holds every role; marked so it can be counted.
    sameActor: (actor, doc) => R.same(actor.principalId, doc.subjectUserId),
    tier: "C",
    audit: "required",
    statusMode: "legacy",
    why: "A human decision on Sealed evidence that gates provider eligibility.",
  });

  // ══════════════════════════════════════════════════════════
  //  marketplace
  // ══════════════════════════════════════════════════════════

  registerPolicy(ACTION.PROVIDER_LIST_ALL, {
    resource: "provider_profile",
    permission: PERMISSION.READ,
    roles: [OPERATIONS, TRUST_SAFETY, PLATFORM_OWNER],
    cardinality: "collection",
    scope: ALL,
    tier: "B",
    audit: "on_deny",
    statusMode: "legacy",
    why: "The provider approval queue carries contact details the public list does not (P1-1).",
  });

  registerPolicy(ACTION.SERVICE_CREATE, {
    resource: "service",
    permission: PERMISSION.MANAGE_SERVICE,
    roles: [OPERATIONS],
    cardinality: "collection",
    scope: ALL,
    tier: "C",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Catalogue editing is operations (DOMAIN-ARCHITECTURE §6).",
  });

  registerPolicy(ACTION.SERVICE_UPDATE, {
    resource: "service",
    permission: PERMISSION.MANAGE_SERVICE,
    roles: [OPERATIONS],
    cardinality: "instance",
    relationship: R.platformScoped,
    tier: "C",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Catalogue editing, against a service that exists.",
  });

  registerPolicy(ACTION.SERVICE_DELETE, {
    resource: "service",
    permission: PERMISSION.MANAGE_SERVICE,
    roles: [OPERATIONS],
    cardinality: "instance",
    relationship: R.platformScoped,
    tier: "C",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Withdrawing a service removes every provider under it from discovery.",
  });

  // ══════════════════════════════════════════════════════════
  //  finance
  // ══════════════════════════════════════════════════════════

  registerPolicy(ACTION.PAYMENT_OBSERVE, {
    resource: "payment",
    permission: PERMISSION.READ,
    roles: [CUSTOMER, PROVIDER, FINANCE],
    cardinality: "instance",
    relationship: R.paymentPayerOrPlatform,
    tier: "A",
    audit: "none",
    // This endpoint already answers 404 for both "no such payment" and "not
    // yours", so the architecture's indistinguishable mapping is what it
    // does today. No exception needed.
    statusMode: "indistinguishable",
    why: "A payment is readable by the person it was taken from, and by finance.",
  });

  registerPolicy(ACTION.PAYMENT_READ_ALL, {
    resource: "payment",
    permission: PERMISSION.READ,
    roles: [FINANCE],
    cardinality: "collection",
    scope: ALL,
    tier: "C",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Reconciliation. Not support: a support question does not need every payment.",
  });

  registerPolicy(ACTION.REVENUE_READ, {
    resource: "revenue_report",
    permission: PERMISSION.READ,
    roles: [FINANCE, PLATFORM_OWNER],
    cardinality: "collection",
    scope: ALL,
    tier: "B",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Platform revenue aggregates.",
  });

  registerPolicy(ACTION.LOAN_READ_ALL, {
    resource: "loan",
    permission: PERMISSION.READ,
    roles: [FINANCE],
    cardinality: "collection",
    scope: ALL,
    tier: "C",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Credit applications carry income and NID data. D-011 defers the FEATURE; the data exists.",
  });

  registerPolicy(ACTION.LOAN_DECIDE, {
    resource: "loan",
    permission: PERMISSION.APPROVE,
    roles: [FINANCE],
    cardinality: "instance",
    relationship: R.platformScoped,
    sameActor: (actor, loan) => R.same(actor.principalId, loan.applicantUserId),
    tier: "C",
    audit: "required",
    statusMode: "legacy",
    why: "Disbursement moves money to the applicant. Deciding your own is the SOD case.",
  });

  // ══════════════════════════════════════════════════════════
  //  platform / operations
  // ══════════════════════════════════════════════════════════

  registerPolicy(ACTION.EMERGENCY_LIST, {
    resource: "emergency_alert",
    permission: PERMISSION.READ,
    roles: [EMERGENCY_RESPONDER],
    cardinality: "collection",
    scope: ALL,
    tier: "C",
    audit: "on_deny",
    statusMode: "legacy",
    why: "The emergency queue. Nothing in marketplace or finance reaches it, and it reaches nothing there.",
  });

  registerPolicy(ACTION.EMERGENCY_UPDATE, {
    resource: "emergency_alert",
    permission: PERMISSION.UPDATE,
    roles: [EMERGENCY_RESPONDER],
    cardinality: "instance",
    relationship: R.platformScoped,
    tier: "C",
    audit: "required",
    statusMode: "legacy",
    why: "Dismissing an alert ends someone's expectation of help; it is a record.",
  });

  registerPolicy(ACTION.COMPLAINT_LIST, {
    resource: "complaint",
    permission: PERMISSION.READ,
    roles: [SUPPORT, TRUST_SAFETY],
    cardinality: "collection",
    scope: ALL,
    tier: "B",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Support raises and works cases; trust & safety decides the punitive ones.",
  });

  registerPolicy(ACTION.COMPLAINT_RESOLVE, {
    resource: "complaint",
    permission: PERMISSION.UPDATE,
    roles: [SUPPORT, TRUST_SAFETY],
    cardinality: "instance",
    relationship: R.platformScoped,
    // §7: "the raiser of a trust case is not its decider".
    sameActor: (actor, complaint) => R.same(actor.principalId, complaint.raisedByUserId),
    tier: "B",
    audit: "required",
    statusMode: "legacy",
    why: "Closing a complaint is the platform's answer to it.",
  });

  registerPolicy(ACTION.BOOKING_LIST_ALL, {
    resource: "booking",
    permission: PERMISSION.READ,
    roles: [SUPPORT, OPERATIONS, PLATFORM_OWNER],
    cardinality: "collection",
    scope: ALL,
    tier: "B",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Operational oversight of the booking pipeline.",
  });

  registerPolicy(ACTION.STATS_READ, {
    resource: "platform_metric",
    permission: PERMISSION.READ,
    roles: [SUPPORT, OPERATIONS, FINANCE, PLATFORM_OWNER],
    cardinality: "collection",
    scope: ALL,
    tier: "A",
    audit: "none",
    statusMode: "legacy",
    why: "Counters. No personal data, no money movement.",
  });

  registerPolicy(ACTION.PROMO_LIST, {
    resource: "promo",
    permission: PERMISSION.READ,
    roles: [OPERATIONS, FINANCE],
    cardinality: "collection",
    scope: ALL,
    tier: "B",
    audit: "none",
    statusMode: "legacy",
    why: "A promotion is a discount against revenue, so finance reads them too.",
  });

  registerPolicy(ACTION.PROMO_CREATE, {
    resource: "promo",
    permission: PERMISSION.CREATE,
    roles: [OPERATIONS],
    cardinality: "collection",
    scope: ALL,
    tier: "C",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Creating a discount code creates a liability.",
  });

  registerPolicy(ACTION.PROMO_UPDATE, {
    resource: "promo",
    permission: PERMISSION.UPDATE,
    roles: [OPERATIONS],
    cardinality: "instance",
    relationship: R.platformScoped,
    tier: "C",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Reactivating an expired code is the same act as creating one.",
  });

  registerPolicy(ACTION.PROMO_DELETE, {
    resource: "promo",
    permission: PERMISSION.DELETE,
    roles: [OPERATIONS],
    cardinality: "instance",
    relationship: R.platformScoped,
    tier: "C",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Removing a code in use changes prices customers were quoted.",
  });

  registerPolicy(ACTION.NOTIFICATION_BROADCAST, {
    resource: "notification",
    permission: PERMISSION.CREATE,
    roles: [OPERATIONS, PLATFORM_OWNER],
    cardinality: "collection",
    scope: ALL,
    tier: "C",
    audit: "on_deny",
    statusMode: "legacy",
    why: "A broadcast reaches every active user and cannot be recalled.",
  });

  registerPolicy(ACTION.ANNOUNCEMENT_LIST, {
    resource: "notification",
    permission: PERMISSION.READ,
    roles: [OPERATIONS, SUPPORT, PLATFORM_OWNER],
    cardinality: "collection",
    scope: ALL,
    tier: "A",
    audit: "none",
    statusMode: "legacy",
    why: "What was broadcast, and to how many.",
  });

  registerPolicy(ACTION.SETTING_READ, {
    resource: "system_setting",
    permission: PERMISSION.READ,
    roles: [PLATFORM_OWNER, OPERATIONS],
    cardinality: "collection",
    scope: ALL,
    tier: "B",
    audit: "none",
    statusMode: "legacy",
    why: "Configuration state, including maintenance mode.",
  });

  registerPolicy(ACTION.SETTING_UPDATE, {
    resource: "system_setting",
    permission: PERMISSION.UPDATE,
    roles: [PLATFORM_OWNER],
    cardinality: "collection",
    // The scope IS the allowlist. It was a hardcoded array in the handler;
    // here it is per-actor, which is what it will need to be when a second
    // operator exists who may toggle SMS but not the payment gateway.
    scope: () => ({
      keys: ["system_online", "maintenance_mode", "sms_notifications",
             "ai_matching", "payment_gateway", "nid_verification"],
    }),
    tier: "C",
    audit: "required",
    statusMode: "legacy",
    why: "maintenance_mode and payment_gateway change what the platform does for everyone.",
  });

  registerPolicy(ACTION.ANALYTICS_READ, {
    resource: "analytics_report",
    permission: PERMISSION.READ,
    roles: [OPERATIONS, PLATFORM_OWNER],
    cardinality: "collection",
    scope: ALL,
    tier: "B",
    audit: "none",
    statusMode: "legacy",
    why: "Operational analytics. Gate 1 has no AI capability; these are SQL aggregates.",
  });

  registerPolicy(ACTION.DIAGNOSTIC_READ, {
    resource: "diagnostic",
    permission: PERMISSION.READ,
    roles: [PLATFORM_OWNER],
    cardinality: "collection",
    scope: ALL,
    tier: "C",
    audit: "on_deny",
    statusMode: "legacy",
    why: "A diagnostic endpoint describes the server's configuration to whoever calls it.",
  });
}

/** Test-only: allows a suite to re-install after resetting the register. */
function __markUninstalled() {
  installed = false;
}

module.exports = { installPolicies, __markUninstalled, TERMINAL_BOOKING };
