// Unit tests for metrics + error tracker (no DB / no Sentry).
const { test } = require("node:test");
const assert   = require("node:assert/strict");
const metrics  = require("../utils/metrics");
const errorTracker = require("../utils/errorTracker");

test("metrics record requests, status classes and latency", () => {
  const before = metrics.snapshot().requests;
  metrics.record({ status: 200, ms: 10 });
  metrics.record({ status: 404, ms: 5 });
  metrics.record({ status: 500, ms: 42 });
  const s = metrics.snapshot();
  assert.equal(s.requests, before + 3);
  assert.ok(s.serverErrors >= 1);
  assert.ok(s.clientErrors >= 1);
  assert.ok(s.byStatusClass["2xx"] >= 1);
  assert.ok(s.latencyMs.max >= 42);
  assert.ok(typeof s.uptimeSec === "number");
  assert.ok(s.memoryMB.heapUsed > 0);
});

test("error tracker is disabled without SENTRY_DSN and never throws", () => {
  assert.equal(errorTracker.isEnabled(), false);
  assert.doesNotThrow(() => errorTracker.captureException(new Error("test"), { url: "/x" }));
});
