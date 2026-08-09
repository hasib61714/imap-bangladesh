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
});

const ACTIONS = Object.freeze(Object.values(ACTION));

module.exports = { ACTION, ACTIONS };
