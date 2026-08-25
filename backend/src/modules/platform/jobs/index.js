/**
 * Jobs — platform module public surface (I-05).
 *
 * AD-016: a durable job table in the same database, consumed by a worker,
 * with attempts, backoff and a dead-letter state. I-05 ships the mechanism
 * and registers no business job (§26).
 */
"use strict";

const backoff = require("./domain/backoff");
const registry = require("./registry");
const repository = require("./infrastructure/jobRepository");
const worker = require("./worker");

module.exports = {
  ...registry,
  backoff,
  enqueue: repository.enqueue,
  claim: repository.claim,
  renew: repository.renew,
  complete: repository.complete,
  fail: repository.fail,
  stats: repository.stats,
  JobStoreUnavailable: repository.JobStoreUnavailable,
  DEFAULT_LEASE_MS: repository.DEFAULT_LEASE_MS,
  runOnce: worker.runOnce,
  startWorker: worker.start,
  workerId: worker.workerId,
};
