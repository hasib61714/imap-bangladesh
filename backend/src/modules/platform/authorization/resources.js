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

/**
 * Stamped on every row a loader produced.
 *
 * `authorizeLoaded()` lets a caller re-authorize a DIFFERENT action against a
 * resource it already holds, so reading a booking and then deciding whether
 * its completion OTP is readable costs one query rather than two (§36). That
 * entry point would be a hole if any object could be passed to it — the
 * request body would be back in the decision. This symbol is the difference:
 * it is not enumerable, not serialisable, and cannot survive JSON, so an
 * object that came from a client cannot carry it.
 */
const LOADED = Symbol("authorization.loadedFromDatabase");

const stampLoaded = (row) => {
  if (row && typeof row === "object") Object.defineProperty(row, LOADED, { value: true, enumerable: false });
  return row;
};

const wasLoadedFromDatabase = (row) => Boolean(row && row[LOADED] === true);

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
  return stampLoaded(await load(key, deps));
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
  wasLoadedFromDatabase,
  ResourceError,
  __resetLoadersForTests,
};
