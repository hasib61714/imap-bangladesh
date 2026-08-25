# IMAP 2.0 — I-05 Reliability Map

**Status:** IMPLEMENTATION RECORD · **Phase:** 4 / I-05 · **Date:** 2026-08-09
**Required by:** I-05 §4, §7, §9, §17, §35, §36, §37 · **Governed by:** AD-006, AD-010, AD-013, AD-016, `SECURITY-ARCHITECTURE.md` §3 §9, `GATE-1-ARCHITECTURE.md` §9

---

## 1. The inventory that came first (§4)

Read before anything was edited. "Multi-instance" is the column that matters: the question is not whether something scales but whether a second instance makes it **wrong**.

| Concern | Was | Multi-instance behaviour | Now |
|---|---|---|---|
| OTP storage | `Map` in `utils/otp-store.js` | **incorrect** — a code issued by A did not exist on B | `otp_challenge` |
| OTP expiry | timestamp in the Map entry | per instance | `expires_at`, checked under lock |
| OTP attempts | counter in the Map entry | **incorrect** — 5 attempts × N instances | `attempts` on one row |
| OTP single-use | `store.delete()` | per instance | conditional `UPDATE`, three layers |
| OTP generation | `Math.random()` | — | **`crypto.randomInt`** |
| OTP purpose | none | — | closed set, server-side (§10) |
| OTP principal binding | none | — | resolved at issue (§11) |
| Login rate limit | `express-rate-limit` MemoryStore | **incorrect** — 20/instance | `rate_limit_counter` |
| Registration rate limit | the same shared `/api/auth` limiter | as above | `auth.register` scope |
| OTP rate limit | none beyond the resend cooldown | — | `auth.otp_request`, `auth.otp_verify` |
| Password-reset rate limit | **the endpoint does not exist** | — | unchanged; the purpose is registered for it |
| Session storage | JWT only | stateless, so consistent — and unrevocable | `session` table, **not live** (§5) |
| Refresh tokens | `refresh_tokens` table, read and written by nothing | — | replaced by `session`, not live |
| Logout | client deletes a token | — | `revoke()`, not live |
| Session revocation | none | — | `revokeAllForPrincipal()`, not live |
| Refresh lifetime | **unbounded** (F-10) | — | `sae` claim, live |
| Background jobs | none; 20+ `.catch(() => {})` | — | `job` table + worker, no handler registered |
| Retry / backoff | none | — | bounded, jittered, dead-letter |
| Timers | `setInterval` in `cache.js`, `setTimeout` per OTP | per instance | the OTP timer is gone with its Map |
| Locks | none | — | job leases only |
| Idempotency | none (P2-7) | — | job-level only; HTTP `Idempotency-Key` deferred |
| Redis | none | — | **still none** — §2 |
| Read cache | `Map` in `utils/cache.js` | **stale, not incorrect** | unchanged — §2.1 |

---

## 2. The shared store is the database (§7)

**Redis was not introduced.** The brief says to read the architecture rather than reach for it, and the architecture says this:

| Source | What it says |
|---|---|
| `GATE-1-ARCHITECTURE.md` §9 — **FROZEN**, "the implementation boundary" | external dependencies are TiDB, SSLCommerz, SMS, R2, Socket.io, Web Push, the LLM providers. **Redis is not in the table** |
| `SYSTEM-ARCHITECTURE.md` §9 | Redis is the action at the **10K** scale point. 1K is "1 API + 1 worker · first constraint: None · Correctness, not capacity" |
| **AD-006** | a polled outbox **table** over a broker, because it needs "no extra infrastructure" |
| **AD-016** | "a durable job table (**same database**)" over a hosted queue |
| **AD-010** | an `idempotency_key` **table** |
| **AD-013** | Redis for the Socket.io adapter and cache, framed as horizontal scale |

So the architecture's own pattern for durable shared state is the database, twice over, and Redis's approved role is cache plus socket fan-out — neither of which is security state.

One argument settles it independently of scale. **An OTP verification must be single-use and audited; a rate-limit decision must be recorded.** AD-009 requires the record to share the transaction with the change, and two stores cannot share one transaction. Putting this state next to `audit_log` keeps `writeAudit(conn, …)` usable.

A second store would also be a second availability dependency on the authentication path, with its own failure mode where the safe answer is to refuse every login. The database is already required for authentication, so fail-closed there costs nothing.

**Revisit trigger:** the one the architecture already names — a second API instance needing shared cache and socket fan-out (`SYSTEM-ARCHITECTURE.md` §9, 10K).

### 2.1 What was deliberately left in the process

`utils/cache.js` is still a `Map`. It caches read results under 10–60 second TTLs, so a second instance makes it **stale, not incorrect** — authorization is re-decided per request from the database, so nothing it holds can grant access. Moving it is the Redis decision above, not a correctness fix. §3 of the brief: do not build an entire distributed platform.

`express-rate-limit`'s general and AI limiters also stay in-process. They are capacity guards, not security state; the authentication limits that ARE security state moved.

### 2.2 No new dependency (§47)

Nothing was added to `package.json`. `bcryptjs`, `node:crypto` and `mysql2` were already present, which is what the brief means by preferring existing dependencies.

---

## 3. OTP (§8–§14)

### 3.1 Lifecycle

```
        issue                verify(correct)
  ∅ ──────────► active ──────────────────────► verified
                  │
                  ├── expires_at passes ─────► expired
                  ├── attempts exhausted ────► invalidated
                  └── superseded by resend ──► invalidated
```

Only `active` verifies. Everything else is terminal, and a terminal challenge is indistinguishable from no challenge to the caller.

### 3.2 What the engine enforces, not the code

| Property | Mechanism |
|---|---|
| One live challenge per (destination, purpose) | `uniq_active_challenge` over a nullable slot column |
| The slot cannot disagree with the status | `chk_active_slot` |
| Single use | the candidate filter, the locked-row check **and** the guarded `UPDATE` — see §8.1 |

The slot column is the **mirror image** of the defect migration 007 records. There, NULLs failing to collide *broke* a constraint. Here it is exactly the wanted behaviour: spent, expired and invalidated rows all carry NULL and never conflict, while two active ones collide.

### 3.3 The hash, and what it is not

bcrypt cost 10 over a 10⁶ space is roughly 18 CPU-hours per code. That is real and it is **not the control**. What protects a six-digit code is `max_attempts` and `expires_at`. The hash stops a *casual* read of the table — an operator glancing at it, a backup, a support query, a log dump — from yielding live codes, which is the exposure `SECURITY-ARCHITECTURE.md` §3 means by "hashed at rest".

### 3.4 Math.random was generating the codes

`routes/auth.js` used `Math.floor(100000 + Math.random() * 900000)`. V8 seeds xorshift128+ from a weak source and its internal state is recoverable from a modest number of outputs, so an attacker requesting codes for **their own** number could predict the next one issued to somebody else. §3 of the security architecture says "cryptographically random". It is `crypto.randomInt` now, rejection-sampled so the distribution is uniform and `000000` is reachable — `randomBytes % 900000` would be neither.

### 3.5 Every failure answers the same way (§13)

`/verify-otp` returned three distinguishable messages. "Expired" versus "wrong code" tells a caller whether a challenge exists for a number **right now** — whether its owner is mid-sign-in — which is a useful window for a real-time phishing or SIM-swap attempt. One message now; the precise reason goes to the audit log. `/login` has answered uniformly since Phase 0.5 for the same reason.

---

## 4. Rate limiting (§14–§18)

### 4.1 The rules

| Scope | Dimensions | Limit | Window | Block |
|---|---|---|---|---|
| `auth.login` | identifier · ip | 5 · 20 | 15 min | 15 min |
| `auth.otp_request` | destination · ip | 5 · 15 | 1 h | 1 h |
| `auth.otp_verify` | destination · ip | 10 · 30 | 15 min | 15 min |
| `auth.register` | ip | 10 | 1 h | 1 h |
| `auth.social` | ip | 30 | 15 min | 15 min |

Not looser than the production limiter it replaces (20 per 15 min per IP across all of `/api/auth`) on any dimension. SMS is the tightest budget in the table because every OTP costs money and rings somebody's phone.

**Both dimensions, always** (§15). Per-IP alone never trips for a botnet spreading one account's attempts across thousands of addresses; per-identifier alone never trips for one attempt sprayed at ten thousand accounts. `auth.social` is IP-only, and that is stated as a limitation rather than an oversight: the identifier is inside the provider's token and is unknown at the point the limit must apply.

**Privacy** (§15). Every value is hashed into the bucket key, so the table holds no phone number, email or address in clear, and no device fingerprint is collected.

### 4.2 Atomic, not merely quick

`INSERT … ON DUPLICATE KEY UPDATE hits = hits + 1` takes an exclusive row lock for the rest of the transaction, so a concurrent request for the same bucket blocks and then reads a value that already includes it. A read-then-write would let two instances both read 4, both decide 5 is under a limit of 5, and both write 5. **Twelve concurrent attempts across three pools permit exactly five** — asserted, not assumed.

Fixed windows keyed by window index. The trade-off is stated rather than discovered: a caller can spend the limit at the end of one window and again at the start of the next, so the worst case across a boundary is 2× the limit.

---

## 5. Sessions (§19–§25)

### 5.1 F-10, closed

`/auth/refresh` exchanged any still-valid token for a fresh seven-day one with nothing bounding how many times, so "seven days" described the interval between refreshes and not the life of the session.

Tokens carry `sae` — an absolute deadline, **carried across refreshes rather than recomputed**. Thirty days after sign-in the session ends whatever the client does. Thirty because that is `REFRESH_TTL_MS`, the lifetime I-03 already chose.

The claim is **additive**: a token issued before this deploy has no `sae`, keeps working, and acquires one on its first refresh. Nobody is signed out and every session is bounded within one cycle.

### 5.2 The session rows are blocked, and by a foreign key

`session.principal_id` REFERENCES `principal(id)`. `principal` is populated by `scripts/backfill-identity.js`, which has not been applied (I-03 §32 — the cutover is owner-coordinated). **A session row cannot be written for a live user at all**: the insert fails on the foreign key.

Found by reading the schema, not by trying it against anything real. It is why the refresh is bounded by a token claim in this phase, and why rotation, reuse detection and server-side revocation are built, proven against a real engine, and called by nothing on the request path.

| Capability | Built | Live |
|---|---|---|
| Bounded session lifetime | ✓ | **✓** |
| Rotation | ✓ | blocked on the backfill |
| Reuse detection → revoke the principal's sessions | ✓ | blocked |
| Server-side logout | ✓ | blocked |
| Security-event mass revocation | ✓ | blocked |

### 5.3 Reuse detection

Rotation makes a captured refresh token usable once. Reuse detection is what turns that from an inconvenience into an alarm: if a token that has already been rotated is presented again, **two parties hold it and neither can be identified as the user**, so every live session for that principal ends. No `family_id` column was added — `principal_id` is the family, and `revoked_reason = 'rotated'` is the marker, both already in migration 007.

---

## 6. Jobs (§26–§31)

AD-016's durable table. **No business job is registered** (§26); the mechanism ships and the jobs arrive with the modules that need them.

| Property | How |
|---|---|
| Claim | conditional `UPDATE` guarded on the observed state, `affectedRows` checked — the P0-5 pattern applied to work |
| Lease, not lock | an owner and an expiry. An infinite lock plus one crashed worker is a job nobody can run again, silently |
| Crash recovery | the reclaim branch is in the **same** claim query, so there is no separate reaper to forget to run |
| Release | `WHERE … AND lease_owner = ?` on every write. Releasing another worker's lease is the classic defect |
| Retry | exponential, full jitter, capped at 15 min, bounded by `max_attempts`, then `dead_letter` |
| Non-retryable | goes straight to dead-letter — spending four more tries on a malformed payload only delays the moment an operator finds out |
| Idempotency | `uniq_job_idempotency`; a NULL key does not collide, which is what "no natural key" should mean |

**At-least-once, not exactly-once** (§28). A worker can commit a job's effect and lose its connection before recording success; no table prevents that. The consequence lands on the handler, so `registerJobHandler` **requires** a declared idempotency property and the process refuses to start without one — the same shape as the authorization register.

`SELECT … FOR UPDATE SKIP LOCKED` would be one statement instead of two. It is not used because its behaviour on TiDB is not something this project may assert (`PHASE-2.75-DATABASE-REHEARSAL.md` §5).

---

## 7. What happens when a store is unavailable (§35)

| Store | Behaviour | Why |
|---|---|---|
| Rate-limit counter | **fail closed** — 503, request refused | A limiter that permits because it could not count is not a limiter. Costs nothing extra: authentication needs the same database to look the user up |
| OTP store | **fail closed** — 503, no SMS sent | A code nobody else can verify is worse than no code |
| Session store | **fail closed** — 503 | Not on the live path yet |
| Job store | **degrade** — the worker logs and keeps polling | A worker that exits on the first blip needs an operator to restart it; no request is waiting on it |
| Lock store | n/a — the lease lives in the job table | |

**No in-memory fallback exists anywhere**, and a boundary rule at error severity fails the build on a `new Map(` in any module that holds security state, or on any import of the deleted `utils/otp-store.js`.

---

## 8. Negative controls (§37) — 21 of 21 detected

Each lever reverted, the failure observed, the file restored and verified byte-identical.

| # | Reverted | Result |
|---|---|---|
| NC-1 | `crypto.randomInt` → `Math.random` | 2 failing |
| NC-2 | OTP single-use — **all three layers** | 2 failing |
| NC-3 | the expiry check | 2 failing |
| NC-4 | the purpose filter | 2 failing |
| NC-5 | the attempt-exhaustion branch | 2 failing |
| NC-6 | the supersede update | 3 failing |
| NC-7 | atomic increment → read-then-write | 4 failing |
| NC-8a | the limiter's connect failure → permit | 2 failing |
| NC-8b | the limiter's query failure → permit | 2 failing |
| NC-9 | a missing dimension → skip | 2 failing |
| NC-10 | revoked-session rotation — **both layers** | 2 failing |
| NC-11 | rotation resets the deadline | 2 failing |
| NC-12 | reuse detection | 2 failing |
| NC-13 | lease-owner guard on release | 2 failing |
| NC-14 | the crash-recovery branch | 2 failing |
| NC-15 | the retry bound | 2 failing |
| NC-16 | the backoff cap | 2 failing |
| NC-17 | the production gate on `mockOtp` | 3 failing |
| NC-18 | uniform verify failure | 2 failing |
| NC-19 | the refresh deadline check | 2 failing |
| NC-20 | the job idempotency declaration | 2 failing |

### 8.1 Two properties are over-determined, and that is worth writing down

Five levers initially reported NOT DETECTED. In each case the reversion changed nothing **because another layer caught it** — which is a result about the code, not a failure of the exercise.

| Property | Layers that each stop it independently |
|---|---|
| **OTP single-use** | the candidate read's `status = 'active'` filter · the locked-row status check · the consuming `UPDATE`'s guard |
| **A revoked session cannot rotate** | the early return on `revoked_at` · the rotation `UPDATE`'s `revoked_at IS NULL` |

Both are proven by a multi-part lever that removes every layer at once. The other three were mine aiming at defence in depth instead of at the load-bearing line; the corrected levers are in the table.

---

## 9. Multi-instance testing, and its honest limit (§36)

Every concurrency test drives **two or three independent connection pools** against one MariaDB 12.2.2 — separate connections, separate transactions, separate locks, which is what the engine sees when there are two application instances.

**They are not two operating-system processes.** A bug in module-level caching would escape this harness. That is stated rather than glossed.

It does catch what mattered. The defect this phase exists to fix is invisible to a single pool and fails immediately against two, and the harness found a second one nobody was looking for — §9.1.

| Scenario | Result |
|---|---|
| OTP issued on A, verified on B | ✓ |
| four wrong guesses alternating A/B block the fifth | ✓ |
| three instances verifying one code | exactly one success |
| three instances issuing at once | exactly one SMS |
| twelve attempts across three pools | exactly the limit |
| session created on A, revoked on B, refused on A | ✓ |
| two instances rotating one token | exactly one rotation |
| job enqueued on A, claimed by one of two workers | exactly one claim |
| worker stops renewing, another reclaims after the lease | ✓ |

### 9.1 A deadlock the concurrency suite found

Three instances verifying one OTP intermittently returned **503** instead of one success and two refusals. A user double-tapping "verify" would have seen it.

`SELECT … FOR UPDATE` through a secondary index, then `UPDATE` on the clustered index: two transactions can acquire that pair in an order that cycles. `sessionRepository.rotate` had the identical shape through `uniq_refresh`.

The first attempt moved the lookup inside the transaction ahead of the locking read and traded the deadlock for MariaDB's **ER_CHECKREAD** — a plain read establishes the snapshot, and a locking read on a row committed to since then is refused. Same root: where the locks were taken.

**The fix is to resolve the id in autocommit and make the transaction's first statement a locking read on that primary key.** No snapshot to go stale, no secondary-index gaps to cycle on, one queue. Fifteen consecutive runs clean, against roughly one failure in eight before.

`withTransientRetry` remains as a backstop, with a deliberately small set: `ER_LOCK_DEADLOCK`, `ER_LOCK_WAIT_TIMEOUT`, `ER_CHECKREAD` — failures where the transaction is **known** not to have applied. A connection error mid-commit is not there, because retrying an ambiguous write is how a payment gets taken twice.

### 9.2 A defect found the same way

The repositories wrote DATETIME parameters as pre-formatted UTC strings. `db.js` sets the connection timezone to `+06:00`, so mysql2 stored them verbatim and read them back six hours earlier — **every freshly-issued OTP read as already expired**. Passing `Date` objects round-trips exactly, and is what `writeAudit` already did.

---

## 10. Open items

### Owner decisions

| # | Item | Blocks |
|---|---|---|
| 1 | **Run the I-03 backfill.** Until `principal` is populated, no session row can be written and rotation, reuse detection and server-side logout stay dark | §5.2 |
| 2 | **Retention for the three new tables.** `otp_challenge`, `rate_limit_counter` and `job` all need pruning; the indexes make each prune one range scan. No period is invented (`PHASE-3-READINESS.md` §7) | operations |
| 3 | **Where the worker runs.** `render.yaml` declares one web service and no worker. The job table is useless until a process polls it | AD-016 |
| 4 | Confirm the rate-limit numbers against real traffic. They are chosen against the limiter they replace, not measured | operations |
| 5 | Carried: the identity cutover, platform-role grants, the production collation, the `audit_log` grant | — |

### Findings recorded, not acted on

| # | Finding | Phase |
|---|---|---|
| **F-16** | **`SET TRANSACTION`/locking behaviour is verified on MariaDB only.** ER_CHECKREAD is MariaDB-specific and TiDB's locking reads differ; the primary-key locking discipline is engine-neutral, but the retry set and the deadlock behaviour are **UNVERIFIED on TiDB**. Carried with the standing TiDB block | TiDB verification |
| **F-17** | HTTP `Idempotency-Key` (AD-010 layer (a)) is **not** implemented. The dependency graph puts client-key idempotency with the mutating use cases; only job-level idempotency is here | I-11 |
| **F-18** | `utils/cache.js` remains an in-process `Map`. Stale rather than incorrect across instances, and moving it is the Redis decision at 10K | scale |
| **F-19** | There is no password-reset endpoint. The `password_reset` purpose is registered and unused; the rate-limit scope for it does not exist because the endpoint does not | I-06 |
| **F-20** | `makeReferralCode()` still uses `Math.random()`, deliberately: a referral code is meant to be shared, so predictability is not a vulnerability and `crypto` would be theatre. What is worth recording is the generator — `Math.random().toString(36).substring(2, 8)` yields **fewer than six characters** whenever the fractional part is short, and `users.referral_code` is `VARCHAR(12) UNIQUE` (verified), so a collision between two short codes surfaces as a failed registration with a 500 rather than as a wrong attribution | I-06 |
| **F-12** | Carried, untouched (§41): there is no provider-approval endpoint | I-10 |

---

## 11. What I-05 deliberately did not do

| | |
|---|---|
| Redis | not introduced — §2 |
| Booking · payments · ledger · payouts | none |
| Provider approval (F-12) | recorded only (§41) |
| Realtime | `realtime.js` untouched (§42) |
| AI | none. Gate 1 remains 0 AI tools |
| Frontend | unchanged. The response contract changed in two places — `/verify-otp` returns one message instead of three, and `/refresh` can return `SESSION_EXPIRED` — and both are handled by the existing generic error path |
| Production migration or cutover | none. `JWT_SECRET` unrotated, no global logout, `backend/.env` unmodified |
| Production database | not touched. `require('./db')` against the real `.env` still throws `EnvironmentSafetyError` |
