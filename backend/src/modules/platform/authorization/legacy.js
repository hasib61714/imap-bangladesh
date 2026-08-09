/**
 * Legacy authorization boundary — platform / authorization
 *
 * I-04 §22. THE ONLY PLACE `users.role` IS INTERPRETED.
 *
 * I-03 established that `users` remains authoritative and `users.role`
 * remains the live authorization source until an owner-coordinated cutover.
 * So the kernel has to be able to decide against the legacy column without
 * the legacy column leaking into it — otherwise the six platform roles become
 * decoration around an `if (role === "admin")` spread across the codebase,
 * which is what I-04 exists to remove.
 *
 * The translation is here and nowhere else. A test asserts that the string
 * "admin" appears in no other kernel file.
 *
 * THE MAPPING IS TOTAL, AND IT IS NOT A GUESS
 * ───────────────────────────────────────────
 * `users.role` is `ENUM('customer','provider','admin')` — verified in
 * migrations/001_baseline.sql, not assumed — so there are three values plus
 * NULL and the mapping covers all four. §10 requires a STOP on an ambiguous
 * legacy role; there is no ambiguity to stop on, because the database has
 * been refusing anything else since the schema was created.
 *
 * WHY `admin` BECOMES ALL SIX
 * ───────────────────────────
 * Not because "admin means everything", but because each of the six is
 * exercised by an endpoint that `requireRole("admin")` guards today:
 *
 *   support             /admin/complaints, /admin/bookings
 *   finance             /payments/admin/all, /admin/revenue, /loans/admin
 *   trust_safety        /admin/kyc, /kyc/:id
 *   operations          /services, /admin/providers, /admin/promos
 *   emergency_responder /sos
 *   platform_owner      /admin/users/:id (role change), /admin/settings
 *
 * Granting fewer would break operations today; granting them as one opaque
 * `admin` is the anti-pattern. Granting all six, named, means the day a
 * second operator exists the tightening is a membership change and not a code
 * change (AUTHORIZATION-IMPLEMENTATION-PLAN §6).
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ──────────────────────────────────
 * A legacy `provider` does NOT also receive `customer`. The account model
 * gives one person both — that is the point of I-03's two accounts — but
 * granting it here would widen live access beyond what `users.role` permits
 * today, which is a cutover, not a compatibility shim.
 */
"use strict";

const { ROLE, PLATFORM_ROLES } = require("./roles");
const { makeActor, anonymousActor } = require("./actor");

/** The legacy column's closed set. */
const LEGACY_ROLES = Object.freeze(["customer", "provider", "admin"]);

const LEGACY_ROLE_GRANT = Object.freeze({
  customer: Object.freeze([ROLE.CUSTOMER]),
  provider: Object.freeze([ROLE.PROVIDER]),
  admin: Object.freeze([...PLATFORM_ROLES]),
});

/**
 * True when this legacy role is the Gate-1 all-six grant. Used by policies
 * that must record the separation-of-duties exception (§12).
 */
const isLegacyPlatformGrant = (legacyRole) => legacyRole === "admin";

/**
 * Build an actor from the row `middleware/auth.js` puts on `req.user`.
 *
 * Fail closed on every unexpected input: no user, no id, an inactive user, or
 * a role string outside the enum all produce an anonymous actor rather than a
 * partially-privileged one. §7: unknown role must never become admin, and it
 * must not become "some role" either.
 */
function legacyActorFromUser(user, { correlationId = null, via = "http", sessionId = null } = {}) {
  if (!user || !user.id) return anonymousActor({ correlationId, via });

  // authMiddleware already refuses an inactive user; repeating it here means
  // the kernel does not depend on which middleware ran first.
  if (user.is_active !== undefined && !isActiveFlag(user.is_active)) {
    return anonymousActor({ correlationId, via });
  }

  const legacyRole = typeof user.role === "string" ? user.role : null;
  const granted = LEGACY_ROLE_GRANT[legacyRole];
  if (!granted) {
    // A NULL or unrecognised role authenticates but holds nothing. It is not
    // downgraded to `customer`: inventing a role for a row whose role is
    // unreadable is exactly the silent-mapping §10 forbids.
    return makeActor({
      principalId: String(user.id),
      roles: [],
      primaryRole: legacyRole || "unknown",
      via,
      correlationId,
      sessionId,
      source: "legacy",
    });
  }

  return makeActor({
    principalId: String(user.id),
    // Legacy has no accounts. Account isolation belongs to the membership
    // actor; stating null here is honest, and any policy that needs an
    // account will deny rather than silently accept a request-supplied one.
    accountId: null,
    roles: [...granted],
    // The audit log records the role AS IT WAS HELD. For a legacy
    // administrator that is `admin`, not one of the six — and that mismatch,
    // visible in every record, IS the Gate-1 limitation.
    primaryRole: legacyRole,
    via,
    correlationId,
    sessionId,
    source: "legacy",
  });
}

/**
 * P1-11 made this worth spelling out: the admin panel sent `is_active = -1`
 * for "suspend", and `!(-1)` is false, so a suspended user kept full access.
 * Only a strict 1 is active.
 */
function isActiveFlag(value) {
  return value === 1 || value === true || value === "1";
}

module.exports = {
  LEGACY_ROLES,
  LEGACY_ROLE_GRANT,
  legacyActorFromUser,
  isLegacyPlatformGrant,
  isActiveFlag,
};
