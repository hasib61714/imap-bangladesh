/**
 * Identity authorization policies — identity
 *
 * I-07 §20, §21. Registered into the I-04 kernel; there is no second
 * authorization system and these are policies, not checks.
 *
 * WHO MAY SEE AN IDENTITY DOCUMENT
 * ────────────────────────────────
 * `trust_safety`. Nobody else — not support, not finance, not operations, and
 * not `platform_owner`. That is I-04 §6's list and it is unchanged here,
 * because a national identity card is the single most sensitive object this
 * platform holds and the number of people who can open one should be the
 * number who have to.
 *
 * `operations` may see the QUEUE (metadata: whose case, what state, how long
 * it has waited) because running a marketplace means knowing how long people
 * are waiting. It may not open the evidence. That split is the reason the
 * queue and the document are two actions rather than one.
 *
 * THE SEPARATION-OF-DUTIES GAP, STILL COUNTED
 * ───────────────────────────────────────────
 * At Gate 1 one person holds every platform role, so the same human can be
 * the subject of a case and the reviewer who approves it. I-04 §12 forbids
 * hiding that: every decision policy carries `sameActor`, the kernel marks
 * the decision `sod_bypass`, and migration 008's `idx_sod` makes "how many
 * times has this happened" one query. It is a limitation that is counted, not
 * a control that is claimed.
 */
"use strict";

const platform = require("../platform");
const { ACTION } = require("./actions");

const { registerPolicy, PERMISSION, ROLE, relationships: R, DENY } = platform.authorization;
const { CUSTOMER, PROVIDER, TRUST_SAFETY, OPERATIONS } = ROLE;

/** The case is about this actor. */
const isSubject = (actor, subject) =>
  R.isIdentified(actor) && R.same(actor.principalId, subject.subjectPrincipalId);

/**
 * A decision policy, five times over.
 *
 * Written as a factory because five near-identical policy literals is five
 * places for one of them to quietly lose its `sameActor` or drop to tier B.
 * The differences that matter — the action, the verb, whether a reason is
 * required — are arguments, and everything they share is shared by
 * construction.
 */
const decisionPolicy = (permission, why, { reasonRequired = false } = {}) => ({
  resource: "verification_case",
  permission,
  roles: [TRUST_SAFETY],
  cardinality: "instance",
  relationship: R.platformScoped,
  // Deciding your own case. Permitted at Gate 1 because one person holds
  // every role; marked so it can be counted (§12).
  sameActor: isSubject,
  reasonRequired,
  tier: "C",
  audit: "required",
  // A reviewer who reached this action already knows the case exists — they
  // opened it from the queue. There is nothing to hide behind a 404, and a
  // 403 tells them the truth about why the button did not work.
  statusMode: "legacy",
  why,
});

let installed = false;

function installIdentityPolicies() {
  if (installed) return;
  installed = true;

  // ── the subject's own case ───────────────────────────────
  registerPolicy(ACTION.VERIFICATION_SUBMIT, {
    resource: "own_verification_case",
    permission: PERMISSION.CREATE,
    // Both legacy roles: `POST /api/providers/apply` never changes
    // `users.role`, so somebody who signed up as a customer and later applied
    // is a provider whose stored role still says `customer`. The RELATIONSHIP
    // decides; the role list only says who may plausibly try.
    roles: [CUSTOMER, PROVIDER],
    cardinality: "instance",
    // The loader keys on the actor's own principal id, so this is true by
    // construction — and it is written out rather than omitted, because a
    // relationship that is trivially true still has to be stated for the
    // registry to accept the policy at all.
    relationship: (actor, subject) => (isSubject(actor, subject) ? true : DENY.NOT_OWNER),
    /**
     * A case under review is not re-submittable.
     *
     * The domain's transition table is the authority and it refuses
     * `under_review → submitted`. This makes the same refusal at the
     * authorization layer so the attempt never reaches a transaction —
     * belt and braces on the one operation that replaces evidence a reviewer
     * may be looking at right now.
     */
    conditions: (actor, subject) => subject.state !== "under_review",
    conditionMessage: "Your verification is being reviewed and cannot be changed right now",
    tier: "B",
    audit: "required",
    statusMode: "legacy",
    why: "Submitting identity evidence starts the review that decides whether someone may be booked.",
  });

  registerPolicy(ACTION.VERIFICATION_READ_OWN, {
    resource: "own_verification_case",
    permission: PERMISSION.READ,
    roles: [CUSTOMER, PROVIDER],
    cardinality: "instance",
    relationship: (actor, subject) => (isSubject(actor, subject) ? true : DENY.NOT_OWNER),
    tier: "A",
    // Reading your OWN state is not a Sealed read: it returns a state and a
    // reason, never a document. V-07 is about the evidence, and this never
    // touches it.
    audit: "none",
    statusMode: "legacy",
    why: "A person is entitled to know their own verification state and why it was decided (R-406).",
  });

  // ── the reviewer's surfaces ──────────────────────────────
  registerPolicy(ACTION.VERIFICATION_LIST, {
    resource: "verification_case",
    permission: PERMISSION.READ,
    roles: [TRUST_SAFETY, OPERATIONS],
    cardinality: "collection",
    /**
     * Metadata only, and the scope says so out loud.
     *
     * P1-12's lesson stated as policy: the queue carries no images and no
     * object keys, so no amount of paging through it produces evidence.
     * Opening one case is a separate action with a narrower role list.
     */
    scope: () => ({ all: true, documents: false }),
    tier: "B",
    audit: "on_deny",
    statusMode: "legacy",
    why: "Running a marketplace means knowing how long people wait. The queue is metadata; evidence is not.",
  });

  registerPolicy(ACTION.VERIFICATION_READ, {
    resource: "verification_case",
    permission: PERMISSION.READ,
    roles: [TRUST_SAFETY],
    cardinality: "instance",
    relationship: R.platformScoped,
    sameActor: isSubject,
    tier: "C",
    // V-07: every Sealed read is audited whether or not it changes anything.
    // Opening a case lists what evidence exists and who it belongs to, which
    // is the thing an investigation into misuse needs to find.
    audit: "required",
    statusMode: "legacy",
    why: "Opening an identity case is an event. Sealed data, so the read itself is the record (V-07).",
  });

  registerPolicy(ACTION.DOCUMENT_READ, {
    resource: "identity_document",
    permission: PERMISSION.READ,
    // §6: finance, support, operations and platform_owner may NOT read
    // identity documents. One role, and the platform owner is not it.
    roles: [TRUST_SAFETY],
    cardinality: "instance",
    relationship: R.platformScoped,
    /**
     * A deleted document is gone, and the row that remains is a record that
     * it existed. Minting a URL for it would either 404 at the storage layer
     * or — worse, if the object survived a partial delete — hand over
     * evidence the platform has said it destroyed.
     */
    conditions: (actor, doc) => doc.deleted !== true,
    conditionMessage: "That document is no longer available",
    sameActor: isSubject,
    /**
     * R-1103, enforced by the policy rather than by the handler.
     *
     * D-03 requires the reason for opening a document to be recorded. A
     * reviewer who cannot say why they are looking at somebody's national ID
     * does not get to look at it, and `reason_required` is a DENIAL — the
     * kernel's, not a validation error the handler could forget to raise.
     */
    reasonRequired: true,
    tier: "C",
    audit: "required",
    statusMode: "legacy",
    why: "Sealed evidence. The narrowest grant in the system, and every read is a record with a stated reason.",
  });

  /**
   * The same read for the migrated backlog, with the same four controls.
   *
   * It is a policy on `verification_case` rather than on `identity_document`
   * because a legacy case has no document row to name — the bytes are in
   * `kyc_docs`. Nothing else about it is relaxed: one role, a stated reason,
   * Tier C, audited. A compatibility path with a weaker guard than the path
   * it is compatible with would be the hole (§25).
   */
  registerPolicy(ACTION.DOCUMENT_READ_LEGACY, {
    resource: "verification_case",
    permission: PERMISSION.READ,
    roles: [TRUST_SAFETY],
    cardinality: "instance",
    relationship: R.platformScoped,
    // Only a migrated case has legacy evidence. A case created after this
    // release has none, and asking for it is a client bug rather than a
    // request to satisfy.
    conditions: (actor, subject) => subject.legacyKycId !== null,
    conditionMessage: "That case has no legacy evidence",
    sameActor: isSubject,
    reasonRequired: true,
    tier: "C",
    audit: "required",
    statusMode: "legacy",
    why: "The pre-object-storage backlog, reviewed under exactly the controls the new path uses.",
  });

  // ── decisions ────────────────────────────────────────────
  registerPolicy(
    ACTION.VERIFICATION_START_REVIEW,
    decisionPolicy(PERMISSION.UPDATE, "Taking a case is what makes 'who was looking at this' answerable.")
  );

  registerPolicy(
    ACTION.VERIFICATION_APPROVE,
    decisionPolicy(PERMISSION.APPROVE,
      "A human decision on Sealed evidence that grants provider listing eligibility (TRUST §6). Tier C, never automated.")
  );

  registerPolicy(
    ACTION.VERIFICATION_REJECT,
    decisionPolicy(PERMISSION.REJECT,
      "A refusal a person can appeal only if it has a reason (R-1103).",
      { reasonRequired: true })
  );

  registerPolicy(
    ACTION.VERIFICATION_REQUEST_INFO,
    decisionPolicy(PERMISSION.UPDATE,
      "The reason IS the instruction — without it the subject cannot know what to resubmit.",
      { reasonRequired: true })
  );

  registerPolicy(
    ACTION.VERIFICATION_REVOKE,
    decisionPolicy(PERMISSION.REJECT,
      "Withdrawing standing already granted. It delists a working provider, so it is never unexplained.",
      { reasonRequired: true })
  );
}

module.exports = { installIdentityPolicies, isSubject };
