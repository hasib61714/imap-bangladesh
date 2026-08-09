/**
 * Fulfillment candidate — marketplace / domain
 *
 * I-06 §16. One shape a need can be met by, whoever meets it.
 *
 *     provider · source · capability · verification · availability ·
 *     location · quality · pricing eligibility
 *
 * This is the abstraction §16 asks for and the reason the internal/external
 * distinction does not fork the architecture: discovery, booking and
 * completion all deal in candidates, and `source` is a field on one.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * ─────────────────────────────
 * No ranking, no score, no weights. §19 is explicit that "cheapest wins" must
 * not be hardcoded, and the alternative — a weighting across quality,
 * distance, availability, reliability, verification, price and customer
 * preference — is a product decision nobody has made. Inventing one here
 * would put a number in the codebase that no document supports.
 *
 * So a candidate carries the INPUTS a ranking will need and produces no
 * order. `SearchFulfillmentCandidates` returns them in the ordering the
 * caller asked for, which is what the endpoint does today.
 */
"use strict";

const { assertProviderSource, isCommissionEligible } = require("./providerSource");

/**
 * Build a candidate from a repository row.
 *
 * The row is the database's; this is the domain's. The mapping is here rather
 * than in the repository so that a column rename does not reach discovery,
 * and so the invariants below hold for every candidate however it was loaded.
 */
function toCandidate(row) {
  const source = assertProviderSource(row.providerSource, `provider ${row.id}`);

  return Object.freeze({
    providerId: row.id,
    userId: row.userId,
    source,

    // ── who they are ──────────────────────────────────────
    displayName: row.displayName ?? null,
    avatar: row.avatar ?? null,

    // ── what they can do ──────────────────────────────────
    // A free-text service type and one category today. `provider_capability`
    // against the catalogue is I-09/I-10; the shape does not change when it
    // arrives, only what fills it.
    capability: Object.freeze({
      serviceTypeBn: row.serviceTypeBn ?? null,
      serviceTypeEn: row.serviceTypeEn ?? null,
      categoryId: row.categoryId ?? null,
      categorySlug: row.categorySlug ?? null,
    }),

    // ── whether they may be offered at all ────────────────
    // D-005: eligibility is trust-granted, never self-declared. `isApproved`
    // is a human decision recorded on the row; `isAvailable` is the
    // provider's own switch. Both must be true, and the two are separate
    // because one is the platform's and one is theirs.
    verification: Object.freeze({
      isApproved: Boolean(row.isApproved),
      nidVerified: Boolean(row.nidVerified),
      kycStatus: row.kycStatus ?? null,
    }),
    availability: Object.freeze({
      isAvailable: Boolean(row.isAvailable),
      accountActive: Boolean(row.accountActive),
    }),

    // ── where ─────────────────────────────────────────────
    area: row.area || null,

    // ── how well ──────────────────────────────────────────
    quality: Object.freeze({
      rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
      completedJobs: Number(row.totalJobs) || 0,
      reviewCount: Number(row.reviewCount) || 0,
    }),

    // ── what it costs ─────────────────────────────────────
    //
    // A DECIMAL, not minor units, and named for what it is. `providers`
    // stores DECIMAL(10,2) and `DATA-ARCHITECTURE` wants integer minor units
    // everywhere; that conversion is a financial change and belongs to the
    // ledger phase, not to a structural one. Calling this `Minor` here would
    // be a lie that reads as a fact for as long as nobody checks.
    pricing: Object.freeze({
      hourlyRate: row.hourlyRate ?? null,
      currency: "BDT",
      commissionEligible: isCommissionEligible(source),
    }),
  });
}

/**
 * May this candidate be offered to a customer?
 *
 * The one invariant that is decided and enforceable today, and the one P1-7
 * was about: a provider who has applied is not a provider who may be booked.
 * `utils/pricing.js` refuses to price an unapproved provider (409) — this is
 * the same rule, one step earlier, so an unapproved provider is never
 * offered rather than being offered and then refused at the quote.
 */
const isOfferable = (candidate) =>
  candidate.verification.isApproved &&
  candidate.availability.isAvailable &&
  candidate.availability.accountActive;

module.exports = { toCandidate, isOfferable };
