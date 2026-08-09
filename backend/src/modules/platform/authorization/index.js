/**
 * Authorization — platform module public surface
 *
 * I-04. Everything outside `modules/platform/authorization` uses this file.
 * The boundary checker enforces it: another module reaching past `index.js`
 * into `kernel.js` is a violation, which is what keeps the number of
 * authorization implementations at one.
 *
 * Requiring this module INSTALLS the register: the loaders, then the
 * policies. It is idempotent and it happens at require time, so a route that
 * binds an unregistered action fails while the process is still starting
 * rather than on the first request that reaches it.
 */
"use strict";

const { authorize } = require("./kernel");
const { installResourceLoaders } = require("./infrastructure/resourceLoaders");
const { installPolicies } = require("./policies");
const registry = require("./registry");
const resources = require("./resources");
const { registerStartupCheck } = require("../../../composition/startup-checks");

// Loaders first: `assertRegistryIsSound` checks that every instance policy
// has one, and a policy registered against a missing loader should fail the
// assertion rather than the install order.
installResourceLoaders();
installPolicies();

/**
 * A-2's startup assertion, registered into the seam I-01 built for it.
 *
 * "the last two do not exist yet. This module is the seam they plug into, so
 *  they arrive as a registered check rather than as a new startup path."
 *  — src/composition/startup-checks.js, I-01
 */
let checkRegistered = false;
function registerAuthorizationStartupCheck() {
  if (checkRegistered) return;
  checkRegistered = true;
  registerStartupCheck("authorization-register", () => {
    registry.assertRegistryIsSound({ hasLoader: resources.hasLoader });
  });
}
registerAuthorizationStartupCheck();

module.exports = {
  authorize,

  // Composition
  registerPolicy: registry.registerPolicy,
  getPolicy: registry.getPolicy,
  hasPolicy: registry.hasPolicy,
  registeredActions: registry.registeredActions,
  allPolicies: registry.allPolicies,
  assertRegistryIsSound: () => registry.assertRegistryIsSound({ hasLoader: resources.hasLoader }),
  AuthorizationConfigError: registry.AuthorizationConfigError,

  // Actors
  ...require("./actor"),
  legacy: require("./legacy"),
  membership: require("./membership"),

  // Vocabulary
  ...require("./actions"),
  ...require("./roles"),
  ...require("./decision"),
  relationships: require("./relationships"),

  // Audit
  recordDecision: require("./authorizationAudit").recordDecision,
};
