// ─────────────────────────────────────────────────────────────
//  IMAP – Simple in-process TTL cache
//  Zero dependencies — suitable for single-process server (Render)
//
//  Usage:
//    const cache = require('./utils/cache');
//    const data  = await cache.getOrSet('key', fn, 60);  // TTL 60s
//    cache.del('key');
//    cache.flush();
// ─────────────────────────────────────────────────────────────

const store = new Map(); // key → { value, expiresAt }

/**
 * Return cached value if fresh, otherwise call fn() and cache the result.
 * @param {string}   key    - cache key
 * @param {Function} fn     - async factory; must return a value to cache
 * @param {number}   ttlSec - time-to-live in seconds (default 30)
 */
const getOrSet = async (key, fn, ttlSec = 30) => {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlSec * 1000 });
  return value;
};

/** Force-expire a key */
const del = (key) => store.delete(key);

/** Flush all cached entries */
const flush = () => store.clear();

/** How many entries are currently cached */
const size = () => store.size;

/** Evict expired entries (call periodically if memory is a concern) */
const evictExpired = () => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
};

// Evict stale entries every 5 minutes
setInterval(evictExpired, 5 * 60 * 1000).unref();

module.exports = { getOrSet, del, flush, size };
