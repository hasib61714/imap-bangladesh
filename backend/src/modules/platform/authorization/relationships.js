/**
 * Relationship predicates — platform / authorization
 *
 * I-04 §16. The check the audit found missing everywhere: not "what role does
 * this actor have" but "what is this actor TO THIS ROW".
 *
 * Every predicate here takes a resource that a loader produced from the
 * database. None of them can be handed a request.
 *
 * Gate-1 relationships only (§16): consumer → booking, provider → booking,
 * subject → verification case, payer → payment, raiser → case. Organisation
 * membership, provider → service and business → service arrive with their
 * modules.
 */
"use strict";

const { DENY } = require("./decision");
const { isPlatformRole } = require("./roles");

/**
 * An actor identified enough to be compared to a row.
 *
 * This guard is why the predicates below can compare ids without checking for
 * null: an anonymous actor has `principalId === null`, and a resource column
 * that is also null would otherwise make `null === null` a match. On a booking
 * with no assigned provider, that single comparison would have handed an
 * unauthenticated caller the provider's seat.
 */
const isIdentified = (actor) => Boolean(actor && actor.authenticated && actor.principalId);

const holdsPlatformRole = (actor) => Boolean(actor && actor.roles.some(isPlatformRole));

const same = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

/** The customer who booked. */
const isBookingCustomer = (actor, booking) => isIdentified(actor) && same(actor.principalId, booking.customerId);

/** The provider assigned to it, resolved through providers.user_id. */
const isBookingProvider = (actor, booking) => isIdentified(actor) && same(actor.principalId, booking.providerUserId);

const isBookingParticipant = (actor, booking) => isBookingCustomer(actor, booking) || isBookingProvider(actor, booking);

/**
 * Participant, or a platform role acting in an operational capacity.
 *
 * Returns `true`, or a DENY reason. Distinguishing `not_owner` from
 * `wrong_account` matters in the audit log and nowhere else — the caller is
 * told the same thing for both.
 */
function bookingParticipantOrPlatform(actor, booking) {
  if (!isIdentified(actor)) return DENY.UNAUTHENTICATED;
  if (isBookingParticipant(actor, booking)) return true;
  if (holdsPlatformRole(actor)) return true;
  return DENY.NOT_OWNER;
}

/** The customer only. Used where the provider must be excluded by name. */
function bookingCustomerOrPlatform(actor, booking) {
  if (!isIdentified(actor)) return DENY.UNAUTHENTICATED;
  if (isBookingCustomer(actor, booking)) return true;
  if (holdsPlatformRole(actor)) return true;
  return DENY.NOT_OWNER;
}

/** The person a payment was taken from. */
function paymentPayerOrPlatform(actor, payment) {
  if (!isIdentified(actor)) return DENY.UNAUTHENTICATED;
  if (same(actor.principalId, payment.payerUserId)) return true;
  if (holdsPlatformRole(actor)) return true;
  return DENY.NOT_OWNER;
}

/**
 * An ownerless platform resource — a catalogue entry, a promotion, a
 * verification queue item, a user record as the subject of an administrative
 * action.
 *
 * AUTHORIZATION-ARCHITECTURE §8 lists resources nobody owns, so this shape is
 * legitimate rather than a loophole. Stated plainly: for these, the ROLE is
 * the capability and this predicate contributes only that **the row exists**.
 *
 * That is not nothing. `PUT /api/services/99999`, `PATCH /api/admin/users/<no
 * such id>` and `DELETE /api/admin/promos/99999` all updated zero rows and
 * returned `{ success: true }` before this. An operator could believe they had
 * suspended an account that they had not.
 */
function platformScoped(actor) {
  if (!isIdentified(actor)) return DENY.UNAUTHENTICATED;
  if (holdsPlatformRole(actor)) return true;
  return DENY.MISSING_PERMISSION;
}

module.exports = {
  isIdentified,
  holdsPlatformRole,
  isBookingCustomer,
  isBookingProvider,
  isBookingParticipant,
  bookingParticipantOrPlatform,
  bookingCustomerOrPlatform,
  paymentPayerOrPlatform,
  platformScoped,
  same,
};
