/**
 * Use-case register — application
 *
 * I-06, and `SYSTEM-ARCHITECTURE.md` §4.2:
 *
 *   "Every use case declares its authorization policy — runtime assertion in
 *    the composition root; a use case with no declared policy throws at
 *    startup."
 *
 * `defineUseCase` enforces that a policy is NAMED. This file enforces that it
 * EXISTS, which is the half that catches a typo — a use case pointing at
 * `provider.updat_own` would otherwise deny every request in production and
 * nowhere else.
 *
 * It is the third register in the codebase with the same shape (authorization
 * policies, job handlers, use cases) and the repetition is deliberate: one
 * pattern to learn, one place to look, and the process refuses to start when
 * any of them is unsound.
 */
"use strict";

const { StartupError } = require("../shared/errors");

const useCases = new Map();

function registerUseCase(useCase) {
  if (!useCase || !useCase.name) throw new StartupError("registerUseCase received something that is not a use case");
  if (useCases.has(useCase.name)) throw new StartupError(`use case "${useCase.name}" is already registered`);
  useCases.set(useCase.name, useCase);
  return useCase;
}

const getUseCase = (name) => useCases.get(name) || null;
const hasUseCase = (name) => useCases.has(name);
const registeredUseCases = () => [...useCases.keys()].sort();
const allUseCases = () => [...useCases.values()];

/**
 * The startup assertion. Throws to refuse startup.
 *
 * @param {{ getPolicy: (action: string) => object|null }} deps
 *        the authorization register, injected rather than imported so this
 *        file has no opinion about which register is in use and the test can
 *        drive an unsound one.
 */
function assertUseCaseRegistryIsSound(deps) {
  const problems = [];

  for (const uc of useCases.values()) {
    const policy = deps.getPolicy(uc.action);

    if (!policy) {
      problems.push(
        `"${uc.name}" declares action "${uc.action}", which no policy registers. ` +
        "Nothing ships unguarded (AUTHORIZATION-ARCHITECTURE §3)."
      );
      continue;
    }

    // An instance policy decides against a ROW. A use case that names one and
    // cannot say which row leaves the kernel with nothing to load, and the
    // kernel's answer to that is `wrong_resource` — a denial at request time
    // for a defect that is visible at startup.
    if (policy.cardinality === "instance" && typeof uc.resource !== "function") {
      problems.push(
        `"${uc.name}" uses "${uc.action}", which acts on one ${policy.resource}, ` +
        "but declares no resource(input)."
      );
    }
    if (policy.cardinality === "collection" && typeof uc.resource === "function") {
      problems.push(`"${uc.name}" declares a resource for "${uc.action}", which is a collection policy`);
    }

    // A command whose policy is a read verb, or a query whose policy mutates,
    // means one of the two declarations is wrong — and the one that is wrong
    // is not knowable from here, so both are named.
    if (uc.kind === "query" && policy.permission !== "read") {
      problems.push(`"${uc.name}" is a query but "${uc.action}" carries permission "${policy.permission}"`);
    }
  }

  if (problems.length) {
    throw new StartupError(
      ["Refusing to start — the use-case register is unsound:", "", ...problems.map((p) => `  • ${p}`)].join("\n")
    );
  }
  return { useCases: useCases.size };
}

/** Test-only. */
function __resetUseCaseRegistryForTests() {
  useCases.clear();
}

module.exports = {
  registerUseCase, getUseCase, hasUseCase, registeredUseCases, allUseCases,
  assertUseCaseRegistryIsSound, __resetUseCaseRegistryForTests,
};
