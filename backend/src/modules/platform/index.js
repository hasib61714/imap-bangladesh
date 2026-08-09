/**
 * Platform — module public surface
 *
 * `TARGET-REPOSITORY-STRUCTURE.md` §3.1 gives every module an `index.js` that
 * IS its public surface, and §3.2 says what this one owns: audit, the
 * authorization kernel, the outbox, jobs, idempotency, feature flags,
 * correlation. It has no domain of its own; it is the substrate the other
 * four modules stand on.
 *
 * WHY THIS FILE APPEARS AT I-06 AND NOT EARLIER
 * ─────────────────────────────────────────────
 * Until now every caller of platform WAS platform, or was a route file
 * outside `src/modules/` — so the import-boundary rule had nothing to check.
 * Marketplace is the first module to depend on it, and the rule immediately
 * caught eight imports reaching past the component directories into
 * `authorization/registry`, `authorization/decision` and `audit/auditActor`.
 *
 * That is the rule working. A module's internals are private, and the way
 * five modules become one is a hundred imports like those.
 */
"use strict";

module.exports = {
  authorization: require("./authorization"),
  audit: require("./audit"),
  otp: require("./otp"),
  rateLimit: require("./ratelimit"),
  jobs: require("./jobs"),
};
