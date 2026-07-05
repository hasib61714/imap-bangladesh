// ─────────────────────────────────────────────────────────────
//  IMAP – Background jobs public API
//
//    const jobs = require("./jobs");
//    jobs.startWorkers();                       // once, at startup
//    jobs.enqueue("sms",  { phone, message });  // fire-and-forget
//    jobs.enqueue("push", { userId, payload });
// ─────────────────────────────────────────────────────────────
const queues = require("./queues");

const WORKERS = [
  require("./workers/sms.worker"),
  require("./workers/push.worker"),
  require("./workers/email.worker"),
  require("./workers/ai.worker"),
  require("./workers/cleanup.worker"),
];

let started = false;

/** Register all worker handlers with their queues (idempotent). */
function startWorkers() {
  if (started) return;
  started = true;
  for (const w of WORKERS) {
    const q = queues[w.queue];
    if (q) q.process(w.handler);
  }
}

/** Enqueue a job onto a named queue. */
function enqueue(name, payload, opts) {
  const q = queues[name];
  if (!q) throw new Error(`Unknown queue: ${name}`);
  return q.add(payload, opts);
}

module.exports = { startWorkers, enqueue, queues };
