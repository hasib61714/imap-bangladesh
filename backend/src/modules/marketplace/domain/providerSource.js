/**
 * Provider source — marketplace / domain
 *
 * I-06 §3, §16, §20. IMAP fulfils a need from two workforces:
 *
 *   INTERNAL   IMAP's own service workforce
 *   EXTERNAL   independent verified providers operating through IMAP
 *
 * A customer must experience one service network. The platform must not.
 *
 * WHY THIS IS A VALUE OBJECT AND NOT TWO CODE PATHS
 * ─────────────────────────────────────────────────
 * §16 is explicit: do not create separate booking architectures. The
 * temptation is real — an employee and a marketplace seller are paid
 * differently, scheduled differently, and answerable differently — and giving
 * in to it produces two booking flows, two availability models and two
 * definitions of "completed", after which every feature is built twice.
 *
 * So the distinction is one field on one shape. Everything downstream —
 * discovery, availability, booking, completion — treats a candidate as a
 * candidate. What the field will later drive (§20) is payout, compensation,
 * commission, permissions, scheduling and reporting, and NONE of those rules
 * exist yet. Inventing them here would be inventing a business decision.
 *
 * WHERE THE VALUE COMES FROM
 * ──────────────────────────
 * `providers.provider_source`, added by migration 010 and defaulting to
 * `external` — which is factually what every existing row is: each came from
 * `POST /api/providers/apply` or from the demo seed. IMAP has no internal
 * workforce records yet, so there is nothing to migrate and nothing is
 * asserted about anyone.
 *
 * A derived value would have been cheaper and wrong. "Everything is external
 * until we build employees" is an assumption living in a mapping function; a
 * column is a fact the row states about itself, and the day IMAP hires a
 * technician the record can say so without a migration.
 */
"use strict";

const PROVIDER_SOURCE = Object.freeze({
  INTERNAL: "internal",
  EXTERNAL: "external",
});

const PROVIDER_SOURCES = Object.freeze(Object.values(PROVIDER_SOURCE));

const isProviderSource = (v) => PROVIDER_SOURCES.includes(v);

/**
 * Fail closed on an unrecognised value.
 *
 * Not "default to external": a row whose source cannot be read is a data
 * defect, and treating it as a marketplace provider would silently put an
 * employee under commission rules — or the reverse.
 */
function assertProviderSource(value, where) {
  if (!isProviderSource(value)) {
    throw new TypeError(
      `unknown provider source "${value}" in ${where}. Known: ${PROVIDER_SOURCES.join(", ")}`
    );
  }
  return value;
}

/**
 * Does IMAP take a commission on this candidate's work?
 *
 * The ANSWER is a business decision that does not exist (D-009 sets the rate
 * and is unset; `PLATFORM_FEE_PCT` defaults to 0 and stays there until
 * somebody with the authority sets it). What DOES exist is the shape of the
 * question, and it is here so that the day the rate is decided there is one
 * place to decide it — rather than a `=== "external"` appearing in the
 * finance module, the payout job and a report.
 *
 * Returns the source's commission ELIGIBILITY, not a rate. Internal work is
 * compensation, not a transaction between two parties, so no commission is
 * conceivable on it; external work is eligible, at a rate nobody has set.
 */
const isCommissionEligible = (source) =>
  assertProviderSource(source, "isCommissionEligible") === PROVIDER_SOURCE.EXTERNAL;

module.exports = {
  PROVIDER_SOURCE, PROVIDER_SOURCES, isProviderSource, assertProviderSource, isCommissionEligible,
};
