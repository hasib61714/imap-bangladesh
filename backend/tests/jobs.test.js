// Unit tests for the background job queue (no DB).
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { InMemoryQueue } = require("../jobs/queue");

const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

test("a queued job is handed to the worker handler", async () => {
  const q = new InMemoryQueue("t1");
  const seen = [];
  q.process(async (p) => { seen.push(p.n); });
  q.add({ n: 1 }); q.add({ n: 2 });
  await tick(20);
  assert.deepEqual(seen.sort(), [1, 2]);
});

test("failed jobs retry up to maxRetries then give up", async () => {
  const q = new InMemoryQueue("t2", { maxRetries: 2, backoffMs: 5 });
  let calls = 0;
  q.process(async () => { calls++; throw new Error("boom"); });
  q.add({});
  await tick(120);
  assert.equal(calls, 3, "1 initial + 2 retries");
});

test("a transient failure eventually succeeds via retry", async () => {
  const q = new InMemoryQueue("t3", { maxRetries: 3, backoffMs: 5 });
  let calls = 0, ok = false;
  q.process(async () => { calls++; if (calls < 2) throw new Error("transient"); ok = true; });
  q.add({});
  await tick(60);
  assert.equal(ok, true);
});

test("concurrency is bounded", async () => {
  const q = new InMemoryQueue("t4", { concurrency: 2 });
  let active = 0, maxActive = 0;
  q.process(async () => { active++; maxActive = Math.max(maxActive, active); await tick(15); active--; });
  for (let i = 0; i < 6; i++) q.add({ i });
  await tick(120);
  assert.ok(maxActive <= 2, `max concurrent ${maxActive} should be <= 2`);
});

test("jobs registry wires all expected queues", () => {
  const queues = require("../jobs/queues");
  for (const name of ["sms", "push", "email", "ai", "cleanup"]) {
    assert.ok(queues[name], `queue ${name} exists`);
  }
});
