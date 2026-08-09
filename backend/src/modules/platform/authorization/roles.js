/**
 * Role catalogue — platform / authorization
 *
 * I-04. The roles the kernel understands, and nothing else.
 *
 * WHY THE STRING "admin" IS NOT HERE
 * ──────────────────────────────────
 * `users.role` is ENUM('customer','provider','admin') and one person holds
 * `admin`. AUTHORIZATION-ARCHITECTURE §7 defines six *distinct* platform
 * roles precisely because "one admin permission" is the anti-pattern that
 * produced the audited defect: a single flag that means "may do everything",
 * so nobody can say what any particular endpoint actually requires.
 *
 * The six exist here from the first commit. The Gate-1 grant — one person
 * holding all six — is a MEMBERSHIP fact, not a code fact
 * (AUTHORIZATION-IMPLEMENTATION-PLAN §6). Tightening it later is a grant
 * change, not a rewrite.
 *
 * `admin` therefore appears in exactly one file, `legacy.js`, which is the
 * boundary where the legacy column is translated. A test asserts it appears
 * nowhere else in the kernel.
 *
 * ORGANISATION ROLES ARE DEFERRED
 * ───────────────────────────────
 * `org_member` / `org_approver` / `org_admin` are marked LATER in §7 and are
 * not created here. §10: do not invent roles the architecture defers.
 */
"use strict";

const ROLE = Object.freeze({
  /** Not authenticated. An actor, not the absence of one (§7). */
  ANONYMOUS: "anonymous",
  /**
   * A job or event consumer with no human behind it. Never granted to a
   * person and never obtainable from a request — `via` alone cannot produce
   * it, or an HTTP caller could claim it.
   */
  SYSTEM: "system",

  CUSTOMER: "customer",
  PROVIDER: "provider",

  // ── the six platform roles (AUTHORIZATION-ARCHITECTURE §7) ──
  SUPPORT: "support",
  FINANCE: "finance",
  TRUST_SAFETY: "trust_safety",
  OPERATIONS: "operations",
  EMERGENCY_RESPONDER: "emergency_responder",
  PLATFORM_OWNER: "platform_owner",
});

/**
 * The six. Order is the architecture's, kept stable so the legacy grant and
 * the documentation read in the same sequence.
 */
const PLATFORM_ROLES = Object.freeze([
  ROLE.SUPPORT,
  ROLE.FINANCE,
  ROLE.TRUST_SAFETY,
  ROLE.OPERATIONS,
  ROLE.EMERGENCY_RESPONDER,
  ROLE.PLATFORM_OWNER,
]);

/** Roles a membership may carry. `anonymous` and `system` are not grantable. */
const GRANTABLE_ROLES = Object.freeze([ROLE.CUSTOMER, ROLE.PROVIDER, ...PLATFORM_ROLES]);

/** Every role an actor may legitimately hold. */
const ALL_ROLES = Object.freeze([ROLE.ANONYMOUS, ROLE.SYSTEM, ...GRANTABLE_ROLES]);

const PLATFORM_SET = new Set(PLATFORM_ROLES);
const GRANTABLE_SET = new Set(GRANTABLE_ROLES);
const ALL_SET = new Set(ALL_ROLES);

const isPlatformRole = (role) => PLATFORM_SET.has(role);
const isGrantableRole = (role) => GRANTABLE_SET.has(role);
const isKnownRole = (role) => ALL_SET.has(role);

/**
 * Fail closed on an unrecognised role.
 *
 * §7: "unknown role → admin" is never acceptable. Neither is "unknown role →
 * ignore it", which is the quieter version of the same mistake: a policy
 * listing a misspelt role would then simply never match, and the endpoint
 * would look guarded while being unreachable — or, worse, a *deny* list built
 * from misspelt roles would silently permit.
 */
function assertKnownRole(role, where) {
  if (!isKnownRole(role)) {
    throw new TypeError(
      `unknown role "${role}" in ${where}. Known roles: ${ALL_ROLES.join(", ")}. ` +
      "Legacy role strings are translated in modules/platform/authorization/legacy.js and nowhere else."
    );
  }
  return role;
}

module.exports = {
  ROLE,
  PLATFORM_ROLES,
  GRANTABLE_ROLES,
  ALL_ROLES,
  isPlatformRole,
  isGrantableRole,
  isKnownRole,
  assertKnownRole,
};
