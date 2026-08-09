# IMAP 2.0 — Performance Architecture

**Status:** PROPOSED · **Phase:** 2 · **Date:** 2026-08-09
**Targets:** `docs/product/PRD.md` §6 (N-01…N-08) · `docs/ux/UX-CONSTITUTION.md` §7

---

## 1. The constraint that sets every target

> **A mid-range Android phone with 2 GB RAM on a congested 3G/4G network in Dhaka.**

Not a laptop on office wifi. Every budget below derives from that device and that network. Optimising for anything else optimises for a user IMAP does not have.

**Nothing is currently instrumented.** Every "current" figure below is either measured statically (bundle size) or explicitly unknown. Targets are provisional until baselined — treating them as SLAs before measurement would be inventing numbers, which is the failure mode this project is correcting.

---

## 2. Targets

| ID | Metric | Target | Measurement | Current |
|---|---|---|---|---|
| N-01 | First contentful paint | ≤3 s p75 | RUM | **Unmeasured.** ~540 KB gzip JS total |
| N-02 | Need → first provider results | ≤4 s p75 | Trace | Unmeasured |
| N-03 | AI first token | ≤2 s p75 | AI telemetry | Unmeasured |
| N-04 | Booking confirmation round trip | ≤2 s p95 | Trace | Unmeasured |
| N-05 | Realtime propagation | ≤3 s p95 | Event trace | Unmeasured |
| N-06 | API availability | ≥99% month one, ≥99.5% after | Uptime | Render free tier sleeps on idle |
| N-07 | Usable on 2 GB Android | Core loop completes | Device test | Untested |
| N-08 | Offline-degraded | Cached reads; **nothing financial queued** | Manual | Network-first SW |

### 2.1 Derived API budgets

| Operation | p95 | Why |
|---|---|---|
| Auth (OTP verify) | 500 ms | bcrypt dominates |
| Service catalogue read | 200 ms | Cacheable |
| Provider discovery | 800 ms | The core query |
| Availability check | 300 ms | On the booking path |
| Quote issue | 400 ms | Pricing resolution |
| Booking creation | 1.5 s | Transaction + hold + ledger |
| Payment initiation | 2 s | External gateway call |
| Booking read | 200 ms | |
| Intent classification | 500 ms | Cheap model |

---

## 3. Frontend

### 3.1 Bundle budget

| Bundle | Budget (gzip) | Current |
|---|---|---|
| Initial route (home + shell) | **≤150 KB** | Not separable — no routing exists |
| Any single lazy route | ≤80 KB | — |
| Provider route group | ≤120 KB | In the same bundle as consumer |
| Admin | Separate build | **~135 KB Ant Design in the consumer bundle** |
| Total consumer JS | ≤400 KB | ~540 KB |

**Enforced in CI.** A route that exceeds its budget does not merge. Without a gate, bundles only grow — and the current 5,567-line `App.jsx` producing a 403 KB raw `index` chunk is the evidence.

### 3.2 Strategy

| Technique | Application |
|---|---|
| Route-level code splitting | Every route lazy except home (AD-012) |
| Admin as a separate build | Ant Design never reaches a consumer |
| Component-level splitting | Map (Leaflet), OCR (tesseract.js), charts — loaded on demand |
| Bangla font subsetting | The largest non-JS asset; `font-display: swap` |
| **No base64 media in JSON** | Avatars up to ~2 MB and KYC images up to ~5 MB are inline today (AD-011) |
| Responsive images from object storage | Width-appropriate variants |
| Prefetch on intent | Next route prefetched on hover/touch-start, **only on unmetered connections** |
| List virtualisation | Beyond ~50 rows |
| `React.memo` / `useMemo` | Where profiled, not speculatively |

### 3.3 Perceived performance

| Technique | Rule |
|---|---|
| Skeletons | Must **not** resemble real content (`UX-CONSTITUTION.md` U1) |
| Optimistic updates | Only where reversion is shown |
| Stale-while-revalidate on reads | Stale data is **labelled with its age** |
| Progressive disclosure | Above-the-fold first |
| Explicit progress > 1 s | With what is happening |

### 3.4 Data-cost awareness

Data is a real cost for the C3 persona.

* No autoplaying media, ever (`BEHAVIORAL-DESIGN.md` §8).
* Images lazy-load below the fold.
* Proof-of-work media loads on explicit tap on metered connections.
* The app must be usable without loading any media at all.

---

## 4. Backend

### 4.1 Query strategy

| Pattern | Rule |
|---|---|
| Every hot query has a supporting index | `DATA-ARCHITECTURE.md` §5 |
| **No `LIKE '%q%'`** | No index can serve it — the current discovery implementation |
| Projections for hot reads | `provider_service_area` (`SERVICE-GRAPH.md` §4), `balance_projection`, `service_edge_closure` |
| No N+1 | Batch loading; reviewed at PR |
| Cursor pagination | Offset on growing tables produces duplicates and skips |
| Bounded results | Every list endpoint has a max limit — three are unbounded today |
| Query timeouts | Statement-level; a slow query fails rather than holding a connection |

### 4.2 Connection pool

| Setting | Value | Reason |
|---|---|---|
| `connectionLimit` | Tuned per instance | 20 today |
| `queueLimit` | **Bounded** | `0` today = unbounded; a slow database becomes unbounded memory growth |
| Acquire timeout | Explicit | Fail fast rather than queue forever |
| Statement timeout | Explicit | |

### 4.3 Caching

| Layer | What | TTL | Invalidation |
|---|---|---|---|
| CDN | Static assets | Long, content-hashed | Filename |
| HTTP | Public catalogue, service detail | Minutes | ETag |
| Redis | Session, principal + memberships, service graph, feature availability | Minutes–hours | **Event-driven** |
| In-process | Service graph projection | Request | Pub/sub invalidation |
| Query result | Discovery for identical filters | Seconds | Time |

**Invalidation is event-driven, not manual.** The current code has 60+ literal cache keys deleted by hand across 9 files, provably incompletely — `bookings.js` busts `provider:jobs` but not `provider:analytics`. Cache keys are derived from the event that changes the data.

**Never cached:** money values, booking state, availability at booking time, anything Sealed.

### 4.4 Async boundaries

Moved off the request path (AD-016): notifications, push, SMS, email · analytics ingestion · trust recomputation · discovery projection updates · reconciliation · document processing · AI background tasks · cold-storage export.

**Stays synchronous:** authentication, authorization, pricing, booking transaction, payment initiation, availability holds. Anything a user is waiting on and anything that must be transactional.

---

## 5. AI performance

| Lever | Effect |
|---|---|
| Model tier routing | The largest lever on both latency and cost |
| Streaming | Perceived latency — first token is what the user feels (`N-03`) |
| Parallel Tier A tool calls | Independent reads issued together |
| Context budgeting | Smaller context = faster and cheaper |
| Prompt caching | Stable system prompt + catalogue |
| Intent result caching | Identical normalised text, short TTL |
| Deterministic paths never call a model | Ranking, pricing, fraud, trust |
| Timeout with graceful degradation | Falls back to the structured path, never to a fabricated answer |

---

## 6. Realtime performance

| Aspect | Design |
|---|---|
| Propagation | Outbox poll ≤1 s + Redis fan-out, within `N-05` (3 s p95) |
| Connection memory | Monitored; the extraction trigger is measured effect on API latency, not a projected number |
| Location updates | Throttled server-side; a client cannot flood a room |
| Reconnect | Exponential backoff with jitter; re-join authorized rooms; **refetch state** |
| Payload size | Ids and minimal fields |

---

## 7. Scale behaviour

Per `SYSTEM-ARCHITECTURE.md` §9. What breaks first at each stage:

| Scale | First constraint | Response |
|---|---|---|
| 1K | Render free-tier cold starts | Paid tier; the client-side wake ping is a workaround, not a fix |
| 10K | In-process cache and OTP | Redis (already required by R-1107) |
| 100K | Discovery queries; media bandwidth | Read replica; CDN; pooler |
| 1M | Table growth: `bookings`, `notifications`, `ledger_entry`, `audit_log` | Time partitioning; archival |
| 10M | Cross-domain coupling | Extraction per the trigger table |

---

## 8. Testing

| Test | When | Gate |
|---|---|---|
| Bundle size | Every PR | **Blocks merge** |
| Lighthouse on the core loop, throttled | Every PR | Blocks on regression |
| API load test on the core loop | Pre-release | Meets §2.1 budgets |
| Database query analysis on hot paths | Pre-release | No unindexed scans |
| Real-device test (2 GB Android, throttled) | Pre-release | Core loop completes (`N-07`) |
| Soak test | Before scale events | No leaks, stable latency |

---

## 9. Anti-patterns forbidden

| Anti-pattern | Why |
|---|---|
| Optimising before measuring | Nothing is instrumented; measurement comes first |
| Bundle growth without a budget gate | Bundles only grow |
| `LIKE '%q%'` | Unindexable |
| Unbounded list endpoints | Three exist today |
| Manual cache invalidation | Provably incomplete today |
| Caching money or state | Correctness beats latency |
| Base64 media in API responses | Uncacheable, uncompressible, huge |
| Synchronous external calls on critical paths | Third-party latency becomes IMAP's latency |
| Unbounded connection queue | A slow database becomes an OOM |
| Autoplaying media | Data cost |
| Skeletons that resemble real content | U1 |
| Optimising desktop-first | The wrong user |

---

## 10. Priority

If effort is limited, in this order:

1. **Bundle budget + admin separation** — the largest single win, and it protects itself in CI.
2. **Discovery query + index** — replaces the unindexable scan on the core path.
3. **Media out of the database** — removes megabyte payloads and unblocks caching.
4. **Event-driven cache invalidation** — correctness *and* speed.
5. **Async boundaries** — takes notifications off the request path.
6. **Route splitting** — falls out of the frontend decomposition.
7. **AI routing and streaming** — only matters once AI is on the path.

Everything else waits for measurement.
