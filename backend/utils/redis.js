// ─────────────────────────────────────────────────────────────
//  IMAP – Redis abstraction with in-memory fallback
//
//  - REDIS_URL set + `ioredis` installed → real Redis.
//  - Otherwise → process-local memory (dev / single instance).
//  - In production without Redis we warn loudly (set REQUIRE_REDIS=true to
//    make it a hard error at startup via assertReady()).
//
//  Optional drivers are lazy-required so the app has NO new hard dependency:
//    npm i ioredis @socket.io/redis-adapter rate-limit-redis   (to enable)
//
//  Use for: rate limiting, OTP storage, Socket.IO scaling, temporary AI cache.
// ─────────────────────────────────────────────────────────────
const logger = require("./logger");

const REDIS_URL = process.env.REDIS_URL;
const isProd    = process.env.NODE_ENV === "production";

let client = null;
let enabled = false;

if (REDIS_URL) {
  try {
    const IORedis = require("ioredis");
    client = new IORedis(REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: true });
    client.on("error", (e) => logger.warn("Redis error", { err: e.message }));
    enabled = true;
    logger.info("Redis enabled (cache/otp/rate-limit/socket scaling)");
  } catch (e) {
    logger.warn("REDIS_URL set but ioredis not installed — using memory fallback", { err: e.message });
  }
}
if (!enabled && isProd) {
  logger.warn("Redis NOT configured in production — using in-memory fallback (single instance only). Set REDIS_URL (+ npm i ioredis) for horizontal scaling.");
}

/** Throw if Redis is mandatory (REQUIRE_REDIS=true) but unavailable. */
function assertReady() {
  if (!enabled && isProd && process.env.REQUIRE_REDIS === "true") {
    throw new Error("Redis is required in production (REQUIRE_REDIS=true) but is not available.");
  }
}

// ── In-memory fallback store (TTL + counters) ─────────────
const mem = new Map(); // key -> { v: string, exp: number(0=never) }
function memGet(k) {
  const e = mem.get(k);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) { mem.delete(k); return null; }
  return e.v;
}

// ── Uniform async KV API (works for both backends) ────────
async function get(key) {
  return enabled ? client.get(key) : memGet(key);
}
async function set(key, value, ttlSec) {
  const v = String(value);
  if (enabled) return ttlSec ? client.set(key, v, "EX", ttlSec) : client.set(key, v);
  mem.set(key, { v, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  return "OK";
}
async function del(key) {
  return enabled ? client.del(key) : (mem.delete(key), 1);
}
async function incr(key) {
  if (enabled) return client.incr(key);
  const cur = parseInt(memGet(key) || "0", 10) + 1;
  const e = mem.get(key);
  mem.set(key, { v: String(cur), exp: e ? e.exp : 0 });
  return cur;
}
async function expire(key, ttlSec) {
  if (enabled) return client.expire(key, ttlSec);
  const e = mem.get(key);
  if (e) e.exp = Date.now() + ttlSec * 1000;
  return 1;
}
async function ttl(key) {
  if (enabled) return client.ttl(key);
  const e = mem.get(key);
  if (!e || !e.exp) return -1;
  return Math.max(0, Math.ceil((e.exp - Date.now()) / 1000));
}

/**
 * Build an express-rate-limit store backed by Redis when available.
 * Returns undefined → express-rate-limit uses its default memory store
 * (identical behavior to today on a single instance).
 */
function createRateLimitStore() {
  if (!enabled) return undefined;
  try {
    const { default: RedisStore } = require("rate-limit-redis");
    return new RedisStore({ sendCommand: (...args) => client.call(...args) });
  } catch (e) {
    logger.warn("rate-limit-redis not installed — using memory store", { err: e.message });
    return undefined;
  }
}

/**
 * Attach the Socket.IO Redis adapter for multi-instance fan-out.
 * No-op (single instance) when Redis or the adapter package is unavailable.
 */
async function attachSocketAdapter(io) {
  if (!enabled) return false;
  try {
    const { createAdapter } = require("@socket.io/redis-adapter");
    const pub = client.duplicate();
    const sub = client.duplicate();
    io.adapter(createAdapter(pub, sub));
    logger.info("Socket.IO Redis adapter attached (horizontal scaling enabled)");
    return true;
  } catch (e) {
    logger.warn("Socket.IO Redis adapter unavailable — single-instance mode", { err: e.message });
    return false;
  }
}

function isEnabled() { return enabled; }
function getClient() { return client; }

module.exports = {
  get, set, del, incr, expire, ttl,
  createRateLimitStore, attachSocketAdapter,
  isEnabled, getClient, assertReady,
};
