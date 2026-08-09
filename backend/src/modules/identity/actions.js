/**
 * Identity action ids — identity
 *
 * I-04's rule: an action id is a contract. It appears in `audit_log.action`,
 * in the policy register, in the use-case declaration and in the route
 * binding, so renaming one breaks the audit history.
 *
 * WHY `verification_case.*` AND NOT `verification.*`
 * ──────────────────────────────────────────────────
 * I-04 registered three actions — `verification.list`,
 * `verification.read_document`, `verification.decide` — against the LEGACY
 * `kyc_document` resource, and they are in `audit_log` already. Reusing those
 * ids for the new model would make two different things indistinguishable in
 * the history: a row saying `verification.decide` would mean "a decision on a
 * kyc_docs row" before this release and "a decision on a verification case"
 * after it, with nothing in the row to say which.
 *
 * New model, new ids. The legacy three are retired by this phase — see
 * I-07-PROVIDER-VERIFICATION.md §6 — and their historical rows keep meaning
 * exactly what they meant when they were written.
 *
 * WHY THE DECISIONS ARE FOUR ACTIONS AND NOT ONE (§12)
 * ───────────────────────────────────────────────────
 * `verification_case.decide` with a target state in the body would be one
 * permission covering "approve this person" and "withdraw this person's
 * standing" — operations a real trust team separates. Four actions cost four
 * register entries and let that split happen later without a schema change or
 * an audit-history break.
 *
 * It also makes the audit log answer directly: "who has ever revoked a
 * verification" becomes a filter on `action`, not a scan of payloads.
 */
"use strict";

const ACTION = Object.freeze({
  /** The subject submits identity evidence. Starts or restarts the case. */
  VERIFICATION_SUBMIT: "verification_case.submit",
  /** The subject reads their own case: state, decision reason, nothing else. */
  VERIFICATION_READ_OWN: "verification_case.read_own",

  /** The review queue. A collection action — scoped, never unbounded. */
  VERIFICATION_LIST: "verification_case.list",
  /**
   * A reviewer opens one case. Sealed data (R-706), so the READ is audited —
   * V-07. Opening somebody's identity case is an event, not a page view.
   */
  VERIFICATION_READ: "verification_case.read",
  /**
   * Mint a short-lived signed URL for one document. The most sensitive read
   * in the system at Gate 1; D-03 requires the reason to be recorded.
   */
  DOCUMENT_READ: "identity_document.read",
  /**
   * The same read, for a case whose evidence predates object storage.
   *
   * A separate action because it is a separate resource — the row is in
   * `kyc_docs` and there is no `identity_document` to name — and because
   * "how much of the backlog is still being reviewed out of the old table"
   * becomes one query on `audit_log.action`. It disappears when M-15 runs.
   */
  DOCUMENT_READ_LEGACY: "identity_document.read_legacy",

  /** submitted → under_review. A reviewer taking the case. */
  VERIFICATION_START_REVIEW: "verification_case.start_review",
  /** under_review → verified. Tier C: a human decides, always. */
  VERIFICATION_APPROVE: "verification_case.approve",
  /** under_review → rejected. Reason mandatory (R-1103). */
  VERIFICATION_REJECT: "verification_case.reject",
  /** under_review → more_info. Reason mandatory: it IS the instruction. */
  VERIFICATION_REQUEST_INFO: "verification_case.request_info",
  /** verified → revoked. Withdrawing standing already granted. */
  VERIFICATION_REVOKE: "verification_case.revoke",
});

const ACTIONS = Object.freeze(Object.values(ACTION));

module.exports = { ACTION, ACTIONS };
