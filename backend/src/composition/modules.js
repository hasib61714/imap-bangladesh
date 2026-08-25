/**
 * Module composition — the root that installs the domain modules
 *
 * I-06. `src/composition/platform.js` installs the cross-cutting substrate
 * (authorization, jobs); this installs the modules that stand on it, and
 * registers the use-case assertion `SYSTEM-ARCHITECTURE.md` §4.2 requires:
 *
 *   "Every use case declares its authorization policy — a runtime assertion
 *    in the composition root; a use case with no declared policy throws at
 *    startup."
 *
 * Order matters and is stated rather than implied: platform first, because a
 * module registers policies into the authorization register and use cases
 * that name them.
 */
"use strict";

const { registerStartupCheck } = require("./startup-checks");
const { composePlatform } = require("./platform");
const useCaseRegistry = require("../application/registry");
const authorization = require("../modules/platform/authorization");

const marketplace = require("../modules/marketplace");
const identity = require("../modules/identity");

let composed = false;

function composeModules() {
  if (composed) return { marketplace, identity };
  composed = true;

  composePlatform();
  // Identity before marketplace, and it is not arbitrary: marketplace's
  // listing eligibility is computed from a verification case, so the module
  // that owns that concept installs first. Neither imports the other's
  // internals — the dependency is on the vocabulary, through `index.js`.
  identity.installIdentity();
  marketplace.installMarketplace();

  registerStartupCheck("use-case-register", () => {
    useCaseRegistry.assertUseCaseRegistryIsSound({ getPolicy: authorization.getPolicy });
  });

  // The authorization register gained policies and loaders from the modules
  // above, so its own assertion has to run after they are installed rather
  // than at the moment `platform` was required.
  registerStartupCheck("authorization-register-after-modules", () => {
    authorization.assertRegistryIsSound();
  });

  return { marketplace, identity };
}

module.exports = { composeModules, marketplace, identity };
