// ─────────────────────────────────────────────────────────────
//  IMAP – Lightweight in-process performance metrics
//  Fed by the request logger; exposed via GET /api/metrics.
// ─────────────────────────────────────────────────────────────
const state = {
  requests: 0,
  serverErrors: 0,   // 5xx
  clientErrors: 0,   // 4xx
  byStatusClass: { "1xx": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
  latency: { count: 0, totalMs: 0, maxMs: 0 },
};

/** Record a finished request. */
function record({ status, ms }) {
  state.requests++;
  const cls = `${Math.floor(status / 100)}xx`;
  if (state.byStatusClass[cls] !== undefined) state.byStatusClass[cls]++;
  if (status >= 500) state.serverErrors++;
  else if (status >= 400) state.clientErrors++;
  state.latency.count++;
  state.latency.totalMs += ms;
  if (ms > state.latency.maxMs) state.latency.maxMs = ms;
}

/** Non-sensitive aggregate snapshot (no PII). */
function snapshot() {
  const mem = process.memoryUsage();
  return {
    uptimeSec: Math.floor(process.uptime()),
    requests: state.requests,
    serverErrors: state.serverErrors,
    clientErrors: state.clientErrors,
    byStatusClass: state.byStatusClass,
    latencyMs: {
      avg: state.latency.count ? Math.round(state.latency.totalMs / state.latency.count) : 0,
      max: state.latency.maxMs,
    },
    memoryMB: { heapUsed: Math.round(mem.heapUsed / 1048576), rss: Math.round(mem.rss / 1048576) },
  };
}

module.exports = { record, snapshot };
