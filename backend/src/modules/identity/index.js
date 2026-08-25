/**
 * Identity — module public surface
 *
 * `TARGET-REPOSITORY-STRUCTURE.md` §3.1: `index.js` IS the public surface.
 * Another module reaching past it into `application/` or `infrastructure/` is
 * a boundary violation the import checker fails the build on.
 *
 * Requiring this file INSTALLS the module: its loaders, its policies, its use
 * cases. Nothing is registered by a side effect somewhere else, so "what does
 * identity add to the process" is answerable by reading one file.
 *
 * The I-05 session repository lives here too and is deliberately NOT
 * installed by this function — it has no use cases yet, because the I-03
 * backfill has not run and `fk_session_principal` refuses every insert until
 * it does. It is exported so the composition root can hand it to whatever
 * calls it first.
 */
"use strict";

const { registerUseCase } = require("../../application/registry");
const { installIdentityLoaders } = require("./infrastructure/resourceLoaders");
const { installIdentityPolicies } = require("./policies");

const verification = require("./infrastructure/verificationRepository");
const sessions = require("./infrastructure/sessionRepository");

const SubmitIdentityVerification = require("./application/commands/SubmitIdentityVerification");
const ReadOwnVerification = require("./application/queries/ReadOwnVerification");
const ListVerificationQueue = require("./application/queries/ListVerificationQueue");
const ReadVerificationCase = require("./application/queries/ReadVerificationCase");
const GetIdentityDocumentUrl = require("./application/queries/GetIdentityDocumentUrl");
const GetLegacyDocumentImage = require("./application/queries/GetLegacyDocumentImage");
const decisions = require("./application/commands/verificationDecisions");

const USE_CASES = [
  SubmitIdentityVerification,
  ReadOwnVerification,
  ListVerificationQueue,
  ReadVerificationCase,
  GetIdentityDocumentUrl,
  GetLegacyDocumentImage,
  decisions.StartVerificationReview,
  decisions.ApproveVerification,
  decisions.RejectVerification,
  decisions.RequestVerificationInfo,
  decisions.RevokeVerification,
];

/** The repositories this module's use cases are handed. */
const repositories = Object.freeze({ verification });

let installed = false;
function installIdentity() {
  if (installed) return { repositories };
  installed = true;

  // Loaders before policies: the authorization register's startup assertion
  // checks that every instance policy has one.
  installIdentityLoaders();
  installIdentityPolicies();
  for (const useCase of USE_CASES) registerUseCase(useCase);

  return { repositories };
}

module.exports = {
  installIdentity,
  repositories,
  sessions,
  useCaseNames: USE_CASES.map((u) => u.name),
  ACTION: require("./actions").ACTION,
  /**
   * Domain vocabulary other modules legitimately need.
   *
   * Marketplace asks whether a provider's identity is verified in order to
   * compute listing eligibility, and it asks THROUGH here — it does not read
   * `verification_case.state` and decide for itself what counts, because two
   * definitions of "verified" is how a revoked provider stays listed.
   */
  VERIFICATION_STATE: require("./domain/verificationCase").STATE,
  VERIFICATION_KIND: require("./domain/verificationCase").KIND,
  grantsIdentityVerified: require("./domain/verificationCase").grantsIdentityVerified,
};
