// Unit tests for the Redis abstraction's in-memory fallback (no Redis, no DB).
// With REDIS_URL unset, every op uses the memory store — verifying current
// single-instance behavior is preserved.
delete process.env.REDIS_URL;
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const redis    = require("../utils/redis");

test("falls back to memory when Redis is not configured", () => {
  assert.equal(redis.isEnabled(), false);
  assert.equal(redis.getClient(), null);
  assert.equal(redis.createRateLimitStore(), undefined, "no store → express default memory");
});

test("set/get/del round-trip (memory)", async () => {
  await redis.set("k1", "hello");
  assert.equal(await redis.get("k1"), "hello");
  await redis.del("k1");
  assert.equal(await redis.get("k1"), null);
});

test("TTL expiry works (memory)", async () => {
  await redis.set("k2", "v", 1);
  assert.ok((await redis.ttl("k2")) <= 1);
  await new Promise(r => setTimeout(r, 1100));
  assert.equal(await redis.get("k2"), null, "expired");
});

test("incr counts (memory)", async () => {
  await redis.del("c");
  assert.equal(await redis.incr("c"), 1);
  assert.equal(await redis.incr("c"), 2);
});

test("assertReady does not throw unless REQUIRE_REDIS=true in production", () => {
  assert.doesNotThrow(() => redis.assertReady());
});

test("attachSocketAdapter is a no-op without Redis", async () => {
  assert.equal(await redis.attachSocketAdapter({ adapter: () => { throw new Error("should not attach"); } }), false);
});
