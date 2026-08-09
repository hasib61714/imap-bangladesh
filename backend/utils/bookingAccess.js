/**
 * Booking participation — the socket transport's view of the kernel
 *
 * Phase 0.5 added this as the third authorization implementation in the
 * codebase, and it was the only correct one. I-04 keeps the function and
 * removes the implementation: `getParticipation` now asks the authorization
 * kernel and translates the answer into the shape `realtime.js` expects.
 *
 * WHY THIS FILE STILL EXISTS
 * ─────────────────────────
 * §42 defers realtime authorization to its own task, and rebuilding
 * `realtime.js` here would be exactly the rewrite that says not to do. But
 * "the kernel must be usable by realtime later" is not something to take on
 * faith, and this is the cheapest possible proof: the socket layer already
 * routes every `join_room` through this function, so pointing it at the
 * kernel makes the socket and HTTP transports decide the same way — today,
 * without touching a socket handler.
 *
 * That is CRITICAL-TEST-MATRIX row 17 ("denied over HTTP ⇒ denied over
 * socket") satisfied structurally rather than by two implementations that
 * agree until one of them is edited.
 *
 * THE `role` FIELD IS NOT AN AUTHORIZATION ROLE
 * ────────────────────────────────────────────
 * It is the actor's relationship TO THIS BOOKING — customer, provider, or a
 * platform operator. `realtime.js` branches on it to decide who may publish a
 * GPS position, and `bookingState.js` uses it to decide which transitions are
 * legal. The value "admin" is retained for those two consumers; it means "a
 * platform actor", and PARTICIPANT_ROLES below is the whole vocabulary.
 */
const pool = require("../db");
const { authorize, ACTION, relationships } = require("../src/modules/platform/authorization");
const { legacyActorFromUser } = require("../src/modules/platform/authorization/legacy");
const { DENY } = require("../src/modules/platform/authorization/decision");

/** The booking-relative roles. Not roles the kernel knows about. */
const PARTICIPANT_ROLES = Object.freeze(["customer", "provider", "admin"]);

/**
 * The actor's relationship to a loaded booking.
 *
 * Order matters and is the same as it always was: being the customer wins
 * over being a platform operator, so an administrator who books a service is
 * treated as its customer rather than as staff.
 */
function participantRole(actor, booking) {
  if (relationships.isBookingCustomer(actor, booking)) return "customer";
  if (relationships.isBookingProvider(actor, booking)) return "provider";
  if (relationships.holdsPlatformRole(actor)) return "admin";
  return null;
}

/**
 * Resolve a user's relationship to a booking.
 *
 * @param {string} bookingId
 * @param {{id: string, role?: string}} user  the row middleware/auth.js loads
 * @param {{action?: string, correlationId?: string, db?: object}} [opts]
 * @returns {Promise<{allowed: boolean, notFound: boolean,
 *                    role: "customer"|"provider"|"admin"|null,
 *                    customerId: string|null, providerUserId: string|null}>}
 *
 * `customerId` and `providerUserId` are populated ONLY on a permit. A denied
 * caller learns nothing about the booking, including whether the ids it holds
 * are the ones they guessed — which is why callers branch on `notFound`
 * rather than on whether an id came back.
 */
async function getParticipation(bookingId, user, opts = {}) {
  const deny = { allowed: false, notFound: false, role: null, customerId: null, providerUserId: null };
  if (!user?.id || !bookingId || typeof bookingId !== "string") return deny;
  // Booking ids are UUIDs; reject anything that cannot be one before the
  // kernel spends a round trip on it.
  if (bookingId.length > 36) return deny;

  const actor = legacyActorFromUser(user, { correlationId: opts.correlationId || null });
  const decision = await authorize(
    actor,
    opts.action || ACTION.BOOKING_OBSERVE,
    bookingId,
    { db: opts.db || pool }
  );

  if (!decision.allowed) {
    return { ...deny, notFound: decision.reason === DENY.NOT_FOUND };
  }

  const booking = decision.resource;
  return {
    allowed: true,
    notFound: false,
    role: participantRole(actor, booking),
    customerId: booking.customerId,
    providerUserId: booking.providerUserId,
  };
}

/** Express-friendly variant: resolves the actor role or throws a 403/404. */
async function requireParticipation(bookingId, user, opts = {}) {
  const p = await getParticipation(bookingId, user, opts);
  if (p.notFound) {
    const e = new Error("Booking not found");
    e.status = 404;
    throw e;
  }
  if (!p.allowed) {
    const e = new Error("Access denied");
    e.status = 403;
    throw e;
  }
  return p;
}

module.exports = { getParticipation, requireParticipation, participantRole, PARTICIPANT_ROLES };
