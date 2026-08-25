// Queue definitions (names + concurrency/retry policy).
const { createQueue } = require("../queue");

module.exports = {
  sms:     createQueue("sms",     { concurrency: 3, maxRetries: 3 }),
  push:    createQueue("push",    { concurrency: 5, maxRetries: 2 }),
  email:   createQueue("email",   { concurrency: 2, maxRetries: 3 }),
  ai:      createQueue("ai",      { concurrency: 2, maxRetries: 1 }),
  cleanup: createQueue("cleanup", { concurrency: 1, maxRetries: 1 }),
};
