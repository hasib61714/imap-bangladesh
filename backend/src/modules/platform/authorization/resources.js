/**
 * Resource loaders — platform / authorization
 *
 * I-04 §15, §17. The rule the audit found broken everywhere:
 *
 *   Ownership is LOADED FROM THE RESOURCE. It is never read from the request.
 *
 * A loader takes an id and returns the authoritative row, or null. It cannot
 * take a body, a query string or a header, because it is called with one
 * argument and that argument is an id. The shape enforces the rule rather
 * than documenting it — there is no parameter through which
 * `req.body.owner_id` could arrive.
 *
 * The loaded resource is handed back on the decision so the caller does not
 * query it a second time (§36).
 */
"use strict";

const loaders = new Map();

class ResourceError extends Error {
  constructor(message) {
    super(message);
    this.name = "ResourceError";
  }
}

/**
 * @param {string} type
 * @param {(id: string, deps: {db: object}) => Promise<object|null>} load
 */
function registerLoader(type, load) {
  if (typeof load !== "function") throw new ResourceError(`loader for "${type}" is not a function`);
  if (loaders.has(type)) throw new ResourceError(`loader for "${type}" is already registered`);
  loaders.set(type, load);
}

const hasLoader = (type) => loaders.has(type);
const registeredResourceTypes = () => [...loaders.keys()].sort();

/**
 * Load one resource.
 *
 * An id that cannot be one is rejected before the database is touched: every
 * id in this schema is a UUID or an integer, so a 4 KB string is an attack,
 * not a lookup.
 */
async function loadResource(type, id, deps) {
  const load = loaders.get(type);
  if (!load) throw new ResourceError(`no loader registered for resource type "${type}"`);
  if (id === null || id === undefined) return null;
  const key = String(id);
  if (!key || key.length > 64) return null;
  return load(key, deps);
}

/** Test-only. */
function __resetLoadersForTests() {
  loaders.clear();
}

module.exports = {
  registerLoader,
  hasLoader,
  loadResource,
  registeredResourceTypes,
  ResourceError,
  __resetLoadersForTests,
};
