/**
 * The five verification decisions — identity / application
 *
 * I-07 §12. Each is a separate use case with a separate action, so "who may
 * approve" and "who may revoke" can diverge later without a schema change,
 * and so the audit log answers "who has ever revoked a verification" with a
 * filter rather than a scan.
 *
 * The `from` lists are `STATE-MACHINES.md` §9's, narrowed to what THIS use
 * case claims. The domain's transition table is checked as well — both have
 * to agree, so a wrong list here fails loudly rather than widening the
 * machine.
 */
"use strict";

const { ACTION } = require("../../actions");
const { STATE } = require("../../domain/verificationCase");
const { decisionUseCase } = require("./decideVerification");

/**
 * submitted → under_review.
 *
 * Not a decision — `decided_by` stays null, because taking a case is not
 * deciding it and a case picked up by three reviewers before one decides
 * should not claim three deciders. Who looked is the audit log's answer.
 */
const StartVerificationReview = decisionUseCase({
  name: "identity.StartVerificationReview",
  action: ACTION.VERIFICATION_START_REVIEW,
  from: [STATE.SUBMITTED],
  to: STATE.UNDER_REVIEW,
  isDecision: false,
  why: "Taking a case makes 'who was looking at this identity document' answerable.",
});

const ApproveVerification = decisionUseCase({
  name: "identity.ApproveVerification",
  action: ACTION.VERIFICATION_APPROVE,
  from: [STATE.UNDER_REVIEW],
  to: STATE.VERIFIED,
  isDecision: true,
  // The only decision that accepts an expiry, because it is the only one that
  // grants something that could lapse.
  allowsExpiry: true,
  why: "A human decision on Sealed evidence that grants provider listing eligibility (TRUST §6). Never automated.",
});

const RejectVerification = decisionUseCase({
  name: "identity.RejectVerification",
  action: ACTION.VERIFICATION_REJECT,
  from: [STATE.UNDER_REVIEW],
  to: STATE.REJECTED,
  isDecision: true,
  why: "A refusal a person can appeal only if it carries a reason (R-1103).",
});

const RequestVerificationInfo = decisionUseCase({
  name: "identity.RequestVerificationInfo",
  action: ACTION.VERIFICATION_REQUEST_INFO,
  from: [STATE.UNDER_REVIEW],
  to: STATE.MORE_INFO,
  isDecision: true,
  why: "The reason IS the instruction — without it the subject cannot know what to resubmit.",
});

/**
 * verified → revoked.
 *
 * The one decision that takes something away from someone who has it. A
 * revoked provider stops being listable the moment this commits, because
 * eligibility is computed from the case rather than cached on the row.
 */
const RevokeVerification = decisionUseCase({
  name: "identity.RevokeVerification",
  action: ACTION.VERIFICATION_REVOKE,
  from: [STATE.VERIFIED],
  to: STATE.REVOKED,
  isDecision: true,
  why: "Withdrawing standing already granted. It delists a working provider, so it is never unexplained.",
});

module.exports = {
  StartVerificationReview, ApproveVerification, RejectVerification,
  RequestVerificationInfo, RevokeVerification,
};
