/**
 * Platform composition — the root that pulls the cross-cutting modules in
 *
 * Requiring a module is what registers its startup check, and a check that is
 * never registered is a check that never runs. The authorization register
 * gets pulled in by every route that binds an action; the job register has no
 * such path yet, because I-05 registers no business job (§26) — so without
 * this file its assertion would sit there proving nothing.
 *
 * One place that says which platform modules exist, required by server.js
 * before the checks run.
 */
"use strict";

const { registerStartupCheck } = require("./startup-checks");
const authorization = require("../modules/platform/authorization");
const jobs = require("../modules/platform/jobs");

let registered = false;
function composePlatform() {
  if (registered) return { authorization, jobs };
  registered = true;

  // The seam I-01 reserved: "(I-05) every registered job declares an
  // idempotency property". Delivery is at-least-once, so a handler that has
  // not been written to run twice will run twice anyway.
  registerStartupCheck("job-register", () => {
    jobs.assertJobRegistryIsSound();
  });

  return { authorization, jobs };
}

module.exports = { composePlatform, authorization, jobs };
