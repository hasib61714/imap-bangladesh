/**
 * Job handler registry — platform / jobs
 *
 * I-05 §28, and the startup assertion `src/composition/startup-checks.js`
 * reserved for this phase:
 *
 *   "(I-05) every registered job declares an idempotency property"
 *
 * WHY A DECLARATION AND NOT A COMMENT
 * ───────────────────────────────────
 * Delivery is AT-LEAST-ONCE. A worker can commit a job's effect and lose its
 * connection before recording success; no table prevents that, and claiming
 * exactly-once would be a promise the infrastructure cannot keep (§28). The
 * consequence lands on the handler: it will sometimes run twice on the same
 * input, and it must be written for that.
 *
 * "Must be written for that" is a code review note, and code review notes
 * decay. This makes it a registration argument the process refuses to start
 * without — the same shape as the authorization register, for the same
 * reason.
 *
 * I-05 REGISTERS NO HANDLER (§26). The mechanism ships; the jobs arrive with
 * the modules that need them.
 */
"use strict";

const { DEFAULT_MAX_ATTEMPTS } = require("./domain/backoff");

class JobConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "JobConfigError";
  }
}

/**
 * How a handler survives running twice.
 *
 *   idempotency_key      the effect is guarded by a unique constraint on a
 *                        deterministic key — the P0-6 ledger-ref shape
 *   naturally_idempotent setting a value that is already set, sending to a
 *                        provider that deduplicates, a conditional UPDATE
 *   at_most_once_effect  the effect is guarded on observed state, so a second
 *                        run finds the state already moved and does nothing
 */
const IDEMPOTENCY = Object.freeze(["idempotency_key", "naturally_idempotent", "at_most_once_effect"]);

const handlers = new Map();

/**
 * @param {string} kind
 * @param {object} spec
 * @param {(payload, ctx) => Promise<void>} spec.handler
 * @param {"idempotency_key"|"naturally_idempotent"|"at_most_once_effect"} spec.idempotency
 * @param {string} spec.why      one line: how running twice is safe
 * @param {number} [spec.maxAttempts]
 * @param {number} [spec.leaseMs] how long this kind may hold a job
 */
function registerJobHandler(kind, spec) {
  if (typeof kind !== "string" || !/^[a-z][a-z0-9_.]{2,59}$/.test(kind)) {
    throw new JobConfigError(`job kind "${kind}" must be lower snake/dotted case, 3-60 characters`);
  }
  if (handlers.has(kind)) throw new JobConfigError(`job kind "${kind}" is already registered`);
  if (!spec || typeof spec.handler !== "function") {
    throw new JobConfigError(`job "${kind}" has no handler function`);
  }
  if (!IDEMPOTENCY.includes(spec.idempotency)) {
    throw new JobConfigError(
      `job "${kind}" must declare idempotency as one of: ${IDEMPOTENCY.join(", ")}. ` +
      "Delivery is at-least-once, so a handler that has not been written to run twice will run twice anyway."
    );
  }
  if (!String(spec.why || "").trim()) {
    throw new JobConfigError(`job "${kind}" declares idempotency "${spec.idempotency}" but does not say how`);
  }

  const entry = Object.freeze({
    kind,
    handler: spec.handler,
    idempotency: spec.idempotency,
    why: spec.why,
    maxAttempts: spec.maxAttempts || DEFAULT_MAX_ATTEMPTS,
    leaseMs: spec.leaseMs || 60_000,
  });
  handlers.set(kind, entry);
  return entry;
}

const getJobHandler = (kind) => handlers.get(kind) || null;
const registeredJobKinds = () => [...handlers.keys()].sort();

/**
 * The startup assertion. Throws to refuse startup.
 *
 * It passes vacuously today because nothing is registered — so a test
 * registers a handler with no idempotency declaration and asserts the throw,
 * because an assertion that has only ever seen an empty set proves nothing.
 */
function assertJobRegistryIsSound() {
  const problems = [];
  for (const entry of handlers.values()) {
    if (!IDEMPOTENCY.includes(entry.idempotency)) {
      problems.push(`"${entry.kind}" declares no idempotency property`);
    }
    if (entry.maxAttempts < 1 || entry.maxAttempts > 50) {
      problems.push(`"${entry.kind}" has maxAttempts ${entry.maxAttempts}; a retry must be bounded and reachable`);
    }
  }
  if (problems.length) {
    throw new JobConfigError(
      ["Refusing to start — the job register is unsound:", "", ...problems.map((p) => `  • ${p}`)].join("\n")
    );
  }
  return { handlers: handlers.size };
}

/** Test-only. */
function __resetJobRegistryForTests() {
  handlers.clear();
}

module.exports = {
  IDEMPOTENCY, registerJobHandler, getJobHandler, registeredJobKinds,
  assertJobRegistryIsSound, JobConfigError, __resetJobRegistryForTests,
};
