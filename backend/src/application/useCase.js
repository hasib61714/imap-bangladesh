/**
 * Use-case contract — application
 *
 * I-06. `SYSTEM-ARCHITECTURE.md` §4.1 gives the application layer four
 * responsibilities and two prohibitions:
 *
 *   owns    one use case per file · opens the transaction · calls
 *           authorization · enforces idempotency · emits events via the outbox
 *   may not contain domain rules · know about HTTP, sockets or AI
 *
 * A use case here is a DECLARATION plus a function. The declaration is what
 * makes §4.2's two startup assertions possible:
 *
 *   "Every use case declares its authorization policy"
 *   "Every mutating use case declares idempotency behaviour"
 *   — enforced by "a runtime assertion in the composition root"
 *
 * That is the same shape as the authorization register (I-04) and the job
 * register (I-05), for the same reason: a rule the process refuses to start
 * without cannot decay, and a rule in a review checklist can.
 *
 * WHAT A USE CASE MUST NOT TOUCH (§15)
 * ────────────────────────────────────
 * `req`, `res`, `next`, express, socket.io, HTTP status codes, SQL. It
 * receives a plain input object and a context; it returns a plain value or
 * throws an AppError. An import-boundary rule fails the build on the rest.
 *
 * The point is not tidiness. `AUTHORIZATION-ARCHITECTURE.md` §5 requires the
 * same use case to be reachable from HTTP, a socket, a job and (at Gate 2) an
 * AI tool — "there is no path to state that bypasses it". A use case that
 * knows about `res` is a use case only HTTP can call.
 */
"use strict";

const { StartupError } = require("../shared/errors");

/**
 * A command changes state; a query does not.
 *
 * The distinction is not decoration — it decides whether a transaction opens
 * and whether an audit record is required, and it lets the boundary rules say
 * "a query must not write".
 */
const KINDS = Object.freeze(["command", "query"]);

/**
 * How this use case survives being called twice with the same input.
 *
 * `read_only` is the only value a query may take. The other three mirror the
 * job register's vocabulary (I-05) deliberately: the same question is being
 * asked, and one answer set is easier to review than two.
 *
 * `idempotency_key` declares that the caller's `Idempotency-Key` decides.
 * Nothing may declare it yet — AD-010's key table is I-11 — and the registry
 * refuses it, so the value cannot be used as a promise nothing keeps.
 */
const IDEMPOTENCY = Object.freeze([
  "read_only",
  "naturally_idempotent",
  "at_most_once_effect",
  "idempotency_key",
]);

const AUDIT = Object.freeze(["required", "on_deny", "none"]);

/**
 * Declare a use case.
 *
 * @param {string} name  `module.Verb`, e.g. `marketplace.UpdateProviderProfile`
 * @param {object} spec
 * @param {"command"|"query"} spec.kind
 * @param {string} spec.action           an action from the authorization register
 * @param {(input, ctx) => string|null} [spec.resource]
 *        the id the policy acts on. Required for an instance policy, and the
 *        registry checks that against the policy rather than trusting this.
 *
 *        It receives the context as well as the input so that a "my own
 *        profile" use case can name the actor's own id — server-side, from
 *        the verified actor — instead of taking one from the request. A
 *        resource id a caller supplies for their own resource is the
 *        client-controlled-ownership defect wearing a different hat.
 * @param {(input, ctx) => object} [spec.context]
 *        extra context for the policy's conditions — state, a target status
 * @param {"read_only"|"naturally_idempotent"|"at_most_once_effect"|"idempotency_key"} spec.idempotency
 * @param {"required"|"on_deny"|"none"} spec.audit
 * @param {(input, ctx) => Promise<any>} spec.run
 * @param {string} spec.why  one line. What this use case is for, in review.
 */
function defineUseCase(name, spec) {
  const fail = (message) => { throw new StartupError(`use case "${name}": ${message}`); };

  if (typeof name !== "string" || !/^[a-z][a-z0-9_]*\.[A-Z][A-Za-z0-9]+$/.test(name)) {
    throw new StartupError(`use-case name "${name}" must be "module.VerbNoun"`);
  }
  if (!spec || typeof spec !== "object") fail("has no specification");
  if (!KINDS.includes(spec.kind)) fail(`must declare kind: ${KINDS.join(" | ")}`);
  if (typeof spec.run !== "function") fail("has no run function");
  if (!String(spec.why || "").trim()) fail("has no \"why\"");

  // §4.2's first assertion. There is no "public" escape hatch: a genuinely
  // public action is a POLICY with `roles: ["*"]`, which keeps the answer to
  // "who may do this" in one register instead of two.
  if (typeof spec.action !== "string" || !spec.action.trim()) {
    fail("declares no authorization action. A public use case is a policy with roles ['*'], not an omission.");
  }

  // §4.2's second assertion.
  if (!IDEMPOTENCY.includes(spec.idempotency)) {
    fail(`must declare idempotency: ${IDEMPOTENCY.join(" | ")}`);
  }
  if (spec.kind === "query" && spec.idempotency !== "read_only") {
    fail("is a query and must declare idempotency \"read_only\"");
  }
  if (spec.kind === "command" && spec.idempotency === "read_only") {
    fail("is a command and cannot be \"read_only\"");
  }
  if (spec.idempotency === "idempotency_key") {
    // AD-010 layer (a) is I-11. Accepting the declaration now would be a
    // promise with no mechanism behind it.
    fail("declares \"idempotency_key\", and the key table does not exist yet (AD-010, I-11)");
  }

  if (!AUDIT.includes(spec.audit)) fail(`must declare audit: ${AUDIT.join(" | ")}`);
  if (spec.kind === "query" && spec.audit === "required") {
    // Not forbidden by the architecture — V-07 requires exactly this for a
    // Sealed read — but it is unusual enough to be worth a deliberate opt-in
    // rather than a default, so the flag is separate.
    if (!spec.auditedRead) {
      fail("is a query with audit \"required\"; set auditedRead: true to confirm that is intended (V-07)");
    }
  }

  return Object.freeze({
    name,
    kind: spec.kind,
    action: spec.action,
    resource: spec.resource || null,
    context: spec.context || null,
    idempotency: spec.idempotency,
    audit: spec.audit,
    auditedRead: Boolean(spec.auditedRead),
    run: spec.run,
    why: spec.why,
    /** A command opens a transaction; a query does not. */
    get transactional() { return spec.kind === "command"; },
  });
}

module.exports = { defineUseCase, KINDS, IDEMPOTENCY, AUDIT };
