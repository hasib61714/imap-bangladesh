/**
 * Clock — IMAP
 *
 * `TESTING-STRATEGY.md` §6: no wall-clock dependence in tests. Time is
 * injected rather than read ambiently, so the behaviours that turn on time
 * are testable without sleeping:
 *
 *   - the auto-confirm window that completes a booking (R-505)
 *   - quote expiry
 *   - payout clearance
 *   - slot-hold expiry
 *   - session and OTP lifetimes
 *
 * Every one of those decides money or state. A test that has to sleep to
 * exercise them is a test nobody runs.
 *
 * `DATA-ARCHITECTURE.md` rule 10: storage is UTC. Display timezone is a
 * presentation concern — the current connection pool sets `timezone: "+06:00"`
 * globally, which is a display decision embedded in the data layer.
 */

/** The real clock. Production always uses this one. */
const systemClock = {
  now: () => new Date(),
  epochMs: () => Date.now(),
};

/**
 * A clock a test controls. Never reachable from production code: the
 * composition root wires `systemClock` and nothing else constructs one.
 *
 * @param {Date|number} start
 */
function fixedClock(start) {
  let ms = start instanceof Date ? start.getTime() : Number(start);
  return {
    now: () => new Date(ms),
    epochMs: () => ms,
    /** Move time forward. Tests assert on behaviour at a boundary, not around it. */
    advance(byMs) {
      ms += Number(byMs);
      return this;
    },
    set(to) {
      ms = to instanceof Date ? to.getTime() : Number(to);
      return this;
    },
  };
}

/** MySQL DATETIME(3) in UTC. The only format written to the database. */
function toSqlUtc(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 23).replace("T", " ");
}

/** RFC 3339 with offset — the wire format (`API-ARCHITECTURE.md` §2). */
function toRfc3339(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
}

module.exports = { systemClock, fixedClock, toSqlUtc, toRfc3339 };
