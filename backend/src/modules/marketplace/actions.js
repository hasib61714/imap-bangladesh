/**
 * Marketplace action ids — marketplace
 *
 * I-04's rule holds: an action id is a contract. It appears in
 * `audit_log.action`, in the policy register, in the use-case declaration and
 * in the route binding, so renaming one breaks the audit history. Named for
 * the operation, not for the endpoint.
 */
"use strict";

const ACTION = Object.freeze({
  /** The public directory: a need in, candidates out. */
  DISCOVERY_SEARCH: "discovery.search",
  /** One provider's public profile. */
  PROVIDER_READ: "provider.read",

  /** A provider's own profile, with the contact details the public shape omits. */
  PROVIDER_READ_OWN: "provider.read_own",
  PROVIDER_APPLY: "provider.apply",
  PROVIDER_UPDATE_OWN: "provider.update_own",
  PROVIDER_SET_AVAILABILITY: "provider.set_availability",
  /** Their earnings and their booked work. */
  PROVIDER_READ_OWN_ACTIVITY: "provider.read_own_activity",

  // ── the listing decision (I-07, F-12) ──────────────────
  //
  // Three actions rather than one `provider.set_listing_state`, for the
  // reason identity's five decisions are five: approving somebody and
  // suspending them are operations a real trust team separates, and one
  // permission covering both cannot express that.
  //
  // These are what F-12 was missing. Before them, `providers.is_approved`
  // was written by `scripts/seedDemo.js` and by nothing else — a genuine
  // applicant could never become listable by any path the API offered.
  /** applied | rejected | suspended → approved. Also the restore path. */
  PROVIDER_APPROVE_LISTING: "provider.approve_listing",
  /** applied → rejected. Reason mandatory. */
  PROVIDER_REJECT_LISTING: "provider.reject_listing",
  /** approved → suspended. Takes a working provider off the marketplace. */
  PROVIDER_SUSPEND_LISTING: "provider.suspend_listing",
  /** "Why is this provider not showing up?" — the conjunction, clause by clause. */
  PROVIDER_READ_ELIGIBILITY: "provider.read_eligibility",
});

const ACTIONS = Object.freeze(Object.values(ACTION));

module.exports = { ACTION, ACTIONS };
