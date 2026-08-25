// ─────────────────────────────────────────────────────────────
//  IMAP – Lightweight background job queue
//
//  In-process async queue with concurrency + retry/backoff. Durable across a
//  single instance only; swap for BullMQ/Redis (utils/redis.js) when running
//  multiple instances. Used to move SMS / push / email / AI / cleanup work off
//  the request path.
// ─────────────────────────────────────────────────────────────
const { randomUUID } = require("crypto");
const logger = require("../utils/logger");

class InMemoryQueue {
  constructor(name, { concurrency = 2, maxRetries = 3, backoffMs = 2000 } = {}) {
    this.name = name;
    this.concurrency = concurrency;
    this.maxRetries = maxRetries;
    this.backoffMs = backoffMs;
    this.jobs = [];
    this.handler = null;
    this.active = 0;
  }

  /** Register the worker handler for this queue. */
  process(handler) { this.handler = handler; this._drain(); }

  /** Enqueue a job; returns its id. */
  add(payload, opts = {}) {
    const job = { id: randomUUID(), payload, attempts: 0, maxRetries: opts.maxRetries ?? this.maxRetries };
    this.jobs.push(job);
    this._drain();
    return job.id;
  }

  _drain() {
    if (!this.handler) return;
    while (this.active < this.concurrency && this.jobs.length) {
      const job = this.jobs.shift();
      this.active++;
      this._run(job).finally(() => { this.active--; this._drain(); });
    }
  }

  async _run(job) {
    try {
      await this.handler(job.payload, job);
    } catch (e) {
      job.attempts++;
      if (job.attempts <= job.maxRetries) {
        logger.warn(`job:${this.name} retry ${job.attempts}/${job.maxRetries}`, { err: e.message });
        setTimeout(() => { this.jobs.push(job); this._drain(); }, this.backoffMs * job.attempts).unref();
      } else {
        logger.error(`job:${this.name} failed permanently`, { err: e.message });
      }
    }
  }

  /** Pending + in-flight count (for tests / metrics). */
  size() { return this.jobs.length + this.active; }
}

const registry = new Map();
function createQueue(name, opts) {
  const q = new InMemoryQueue(name, opts);
  registry.set(name, q);
  return q;
}
function getQueue(name) { return registry.get(name); }

module.exports = { InMemoryQueue, createQueue, getQueue, registry };
