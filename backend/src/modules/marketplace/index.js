/**
 * Marketplace — module public surface
 *
 * `TARGET-REPOSITORY-STRUCTURE.md` §3.1: `index.js` IS the public surface —
 * commands, queries, events, policies. Another module reaching past it into
 * `application/` or `infrastructure/` is a boundary violation the import
 * checker fails the build on, and it is what stops five modules becoming one.
 *
 * Requiring this file INSTALLS the module: its loaders, its policies, its use
 * cases. Nothing is registered by a side effect somewhere else, so "what does
 * marketplace add to the process" is answerable by reading one file.
 */
"use strict";

const { registerUseCase } = require("../../application/registry");
const { installMarketplaceLoaders } = require("./infrastructure/resourceLoaders");
const { installMarketplacePolicies } = require("./policies");

const providers = require("./infrastructure/repositories/providerRepository");
const activity = require("./infrastructure/repositories/providerActivityRepository");
const schedule = require("./infrastructure/repositories/scheduleRepository");

const SearchFulfillmentCandidates = require("./application/queries/SearchFulfillmentCandidates");
const ReadProviderProfile = require("./application/queries/ReadProviderProfile");
const ReadOwnProviderProfile = require("./application/queries/ReadOwnProviderProfile");
const ReadOwnEarnings = require("./application/queries/ReadOwnEarnings");
const ReadOwnJobs = require("./application/queries/ReadOwnJobs");
const ReadListingEligibility = require("./application/queries/ReadListingEligibility");
const ApplyAsProvider = require("./application/commands/ApplyAsProvider");
const UpdateOwnProviderProfile = require("./application/commands/UpdateOwnProviderProfile");
const SetOwnAvailability = require("./application/commands/SetOwnAvailability");
const listing = require("./application/commands/decideProviderListing");

const USE_CASES = [
  SearchFulfillmentCandidates,
  ReadProviderProfile,
  ReadOwnProviderProfile,
  ReadOwnEarnings,
  ReadOwnJobs,
  ReadListingEligibility,
  ApplyAsProvider,
  UpdateOwnProviderProfile,
  SetOwnAvailability,
  // I-07 / F-12: the approval path that did not exist.
  listing.ApproveProviderListing,
  listing.RejectProviderListing,
  listing.SuspendProviderListing,
];

/** The repositories this module's use cases are handed. */
const repositories = Object.freeze({ providers, activity, schedule });

let installed = false;
function installMarketplace() {
  if (installed) return { repositories };
  installed = true;

  // Loaders before policies: the authorization register's startup assertion
  // checks that every instance policy has one.
  installMarketplaceLoaders();
  installMarketplacePolicies();
  for (const useCase of USE_CASES) registerUseCase(useCase);

  return { repositories };
}

module.exports = {
  installMarketplace,
  repositories,
  useCaseNames: USE_CASES.map((u) => u.name),
  ACTION: require("./actions").ACTION,
  // Domain vocabulary other modules may legitimately need. Finance will ask
  // whether a candidate is commission-eligible; booking will ask whether one
  // is offerable. Neither reaches into `domain/` to find out.
  PROVIDER_SOURCE: require("./domain/providerSource").PROVIDER_SOURCE,
  isCommissionEligible: require("./domain/providerSource").isCommissionEligible,
  isOfferable: require("./domain/fulfillmentCandidate").isOfferable,
  // I-07: booking and pricing both ask "may this provider be offered", and
  // they ask through here rather than reading `is_approved` for themselves.
  LISTING: require("./domain/listingEligibility").LISTING,
  evaluateEligibility: require("./domain/listingEligibility").evaluateEligibility,
};
