# IMAP — AI Gaps

> **STATUS UPDATE — 2026-08-09 (Phase 0.5).** The findings below are the
> Phase 0 baseline and are preserved unchanged for traceability. Many have
> since been contained on branch `imap/phase-0.5-containment`. For current
> status see [`PHASE-0.5-SECURITY-REGRESSION.md`](PHASE-0.5-SECURITY-REGRESSION.md)
> — **all 12 P0 findings fixed and verified; 19 P1 fixed.** Do not read the
> text below as a description of the code as it stands today.

**Audit date:** 2026-08-09 · **Commit:** `726cc87` · **Scope:** read-only.

Primary source: `backend/routes/ai.js` (751 L), `frontend/src/api.js:217-294`, `frontend/src/components/VoiceCommand.jsx` (342 L), and the AI call sites in `frontend/src/App.jsx`.

---

## 1. Classification of every AI surface

| Endpoint / feature | Classification | Evidence |
|---|---|---|
| `POST /api/ai/chat` | **REAL AI** → **FALLBACK** | `ai.js:186` Gemini 2.5 Flash Lite → `:190` OpenAI `gpt-4o-mini` → `:194` `smartFallback()` keyword table |
| `POST /api/ai/chat/stream` | **REAL AI** → **MOCK** | `ai.js:253-260` Gemini SSE; when `GEMINI_API_KEY` is unset, `:229-236` replays the keyword-table answer 3 characters at a time with a 22 ms delay to *simulate* streaming |
| `POST /api/ai/match` | **RULE-BASED** | `ai.js:336-352` — `rating/5*40 + min(bookings/200,1)*25 + min(reviews/50,1)*15 + nid_verified*15 + freshness*5`; labelled "AI Scoring", tagged "🏆 Top Pick" |
| `POST /api/ai/dynamic-price` | **RULE-BASED + STATIC** | `ai.js:374-380` hardcoded base-price map; `:397-406` fixed multipliers for demand>20, rush hour, weekend, and a hardcoded premium-area list |
| `POST /api/ai/fraud-check` | **RULE-BASED** | `ai.js:436-462` — four thresholds; **advisory only**, see §3 |
| `POST /api/ai/review-check` | **RULE-BASED** | `ai.js:482-514` — five heuristics; **never called** before `POST /api/reviews` |
| `POST /api/ai/bundle-suggest` | **PARTIAL** | `ai.js:719-728` real co-booking SQL, but falls back to a hardcoded `BUNDLES` map (`:731-737`) whenever fewer than 3 co-bookings exist |
| `GET /api/ai/forecast` | **RULE-BASED** | `ai.js:568-574` — growth = last month vs previous month, then compounded 3× |
| `GET /api/ai/churn` | **RULE-BASED** | `ai.js:613-647` — `DATEDIFF` thresholds |
| `GET /api/ai/heatmap` | **RULE-BASED** | `ai.js:669-698` — grouped by raw free-text `bookings.address` |
| Voice command | **RULE-BASED** | `VoiceCommand.jsx:62-70` — Web Speech transcript → `String.includes()` against a keyword map → page navigation. The transcript never reaches an LLM. |
| NID OCR | **REAL (client-side)** | `App.jsx:1388` dynamic-imports `tesseract.js` to prefill one field |

**Summary: 2 real AI endpoints (both chat), 8 rule-based scorers presented as AI, 1 client-side OCR.**

---

## 2. Model / provider layer

**CURRENT.**

```js
// ai.js:41-51   — Gemini, inline fetch, model in the URL string
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`
// ai.js:254     — a DIFFERENT Gemini model for streaming
`.../models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`
// ai.js:67-84   — OpenAI, inline fetch, model literal
model: "gpt-4o-mini"
```

**GAP.**
* No abstraction — three separate inline `fetch` calls with hardcoded URLs and model names.
* Two different Gemini models used for the same conversation depending on whether the caller chose streaming; answers will differ in quality between the two paths for identical input.
* The API key is interpolated into the URL query string (`ai.js:42, 164, 254`), so it lands in any HTTP client log or proxy access log.
* No timeout, no retry, no circuit breaker on either provider call. `ai.js:41` has no `AbortController`; a hung Gemini request holds the Node request open until the platform kills it.
* `max_tokens` is 300 (`:48`, `:72`) / 400 (`:258`) — no configuration, no per-user budget.
* No token accounting, no cost tracking, no usage record. The only control is a 20-request/minute rate limit (`server.js:31-38`).

**TARGET.** Provider-agnostic client with model registry, timeouts, retries, streaming parity, structured outputs, and per-tenant cost accounting.

**RECOMMENDATION.** A single `LLMClient` interface is a prerequisite for tool calling (§5) since both providers express tools differently. Do this before adding any AI capability.

---

## 3. AI actions — the central gap

**Brief §14 requires:** `AI → Tool → Authorization → Business Rules → Transaction → Database`

**CURRENT: AI cannot perform any action.** `POST /api/ai/chat` returns `{reply: string, source: string}`. There is no tool definition in either provider call, no function-calling configuration, no dispatcher, and no consumer of an AI decision anywhere in the backend.

The three places where an AI output *could* influence the system all route through the client and are advisory:

```
Finding:  AI pricing output is round-tripped through the client and becomes authoritative.
Evidence: frontend/src/App.jsx:512   ai.dynamicPrice(...).then(d => setDynPrice(d))
          frontend/src/App.jsx:546   total_amount: dynPrice?.dynamicPrice || baseAmount
          backend/routes/bookings.js:38,60-70  — stores whatever the client sent
Behavior: The server computes a price, sends it to the browser, and then accepts
          whatever number the browser sends back as the booking amount.
Impact:   The "AI pricing" has no effect on what is actually charged. See SECURITY-GAPS P0-3.
```

```
Finding:  Fraud check is advisory and user-dismissable.
Evidence: frontend/src/App.jsx:529-538   client calls /ai/fraud-check before booking
          frontend/src/App.jsx:603        <button ... onClick={()=>handleConfirm(true)}>
                                            "Proceed Anyway"
          backend/routes/bookings.js      — never calls fraud-check
Behavior: /ai/fraud-check returns { blocked: score >= 80 }. Nothing reads `blocked`.
          The booking endpoint has no fraud gate at all.
Impact:   The fraud signal is decorative. A scripted client skips the call entirely.
```

```
Finding:  Fake-review detection is never invoked on the write path.
Evidence: backend/routes/ai.js:474-525    POST /ai/review-check exists
          backend/routes/reviews.js:16-67 POST /api/reviews — no call to review-check
          frontend/src/App.jsx:755        comment "// Fake review check via AI" — client-side only
Behavior: Reviews are inserted without any suspicion scoring.
Impact:   The heuristic (which is reasonable) protects nothing.
```

**Every link in the required chain is missing:**

| Link | Present | What is needed |
|---|---|---|
| Tool registry | ❌ | Named tools with JSON-Schema inputs/outputs, declared read/write, declared side effects |
| Authorization | ❌ | Per-tool permission tied to the caller's role and resource ownership; no policy layer exists anywhere (`SECURITY-GAPS.md §Cross-cutting`) |
| Business rules | ❌ | Rules live inside Express handlers and are not callable from a non-HTTP context |
| Transaction | ❌ | Zero transactions in the codebase (P0-11) |
| Confirmation / approval | ❌ | The brief's "User Approval" step has no representation in the API or schema |
| Idempotency | ❌ | No keys; an agent retry double-books (compare P0-5, P0-6) |
| Audit | ❌ | No `audit_logs` table; an AI action would be untraceable |
| Structured errors | ❌ | Handlers return `{error:"Server error"}` — an agent cannot distinguish "insufficient balance" from "DB down" |

---

## 4. AI safety violations

The brief §15 asks specifically whether AI can falsely claim an outcome. **It can, and it does — in the fallback path, unconditionally.**

```
Finding:  The keyword fallback asserts a fabricated, user-specific financial fact.
Evidence: backend/routes/ai.js:100
            লোন: "💹 আপনার credit score IMAP-এ ৮২/১০০। এই স্কোর দিয়ে ৳৫০,০০০ পর্যন্ত
                  instant microloan নেওয়া সম্ভব!"
          backend/routes/ai.js:126
            loan: "💹 Your IMAP credit score is 82/100 — eligible for instant
                   microloan up to ৳50,000!"
Behavior: Returned to ANY user who types a message containing "loan"/"লোন", with no
          database read. The real score is computed by calcLoanScore() in
          routes/loans.js:44-81 and is not consulted here.
Impact:   The assistant states a specific credit score and loan eligibility as fact.
          A user with a real score below 40 would be rejected at routes/loans.js:127
          after being told they qualify.
Severity: P0 (AI safety) — a false financial claim about the user's own account.
```

```
Finding:  The fallback fabricates provider inventory and response times.
Evidence: backend/routes/ai.js:92-114 (Bengali) and :118-141 (English), e.g.
            "45+ verified electricians. Average response: 30 min"
            "28+ skilled plumbers are ready 24/7. Emergency dispatch in 15 minutes!"
            "32+ NID-verified nursing professionals"
            "56+ trained cleaners"
            "Emergency? ... Nearest professional dispatched within 3 minutes."
            "IMAP offers 50+ service types."
            "You can cancel a booking up to 1 hour before ... at no charge."
            "Refunds are processed within 3-5 business days."
Behavior: All static strings. None read the database. The cancellation and refund
          policies described do not exist in code — routes/bookings.js:268 refunds
          only from 'pending'/'confirmed' with no time window, and there is no
          gateway refund path at all.
Impact:   Users receive invented inventory figures, invented SLAs, and invented
          consumer-protection policies from the platform's assistant.
Severity: P0 (AI safety)
```

**Additional safety gaps:**

| Gap | Evidence |
|---|---|
| No system-prompt protection against prompt injection | `ai.js:26-28, 77-79` — a short persona string; user content is concatenated directly (`:35-38`, `:246-249`) |
| No output validation or content filtering | The model's reply is returned verbatim (`ai.js:187, 191`) |
| No grounding | The system prompt names four service types; no retrieval, no DB context, no citation |
| No refusal or escalation path | Emergency, medical, legal, and financial questions are answered by the same generic assistant |
| No conversation logging | Nothing is persisted; an unsafe answer cannot be reviewed after the fact |
| No user-facing indication of which path answered | The response carries `source: "gemini"｜"openai"｜"fallback"`, and `App.jsx` does not surface it |
| No PII handling policy | `messages` are forwarded to Google/OpenAI unredacted; there is no consent, no notice, and no data-processing statement anywhere in the repo |
| Emergency claims outside AI | `routes/sos.js:44` "sent to admin & call center"; `routes/blood.js:141` "Request sent to available donors" — both false (see `SECURITY-GAPS.md` P0-10) |

---

## 5. Missing AI architecture

| Component (brief §5 "AI" doc set) | Status | Notes |
|---|---|---|
| AI Constitution / safety policy | **MISSING** | No document, no code-level policy |
| AI Architecture doc | **MISSING** | |
| Orchestrator | **MISSING** | No planner, no router, no multi-step execution |
| Agent architecture | **MISSING** | Single-turn request/response only |
| Tool catalog | **MISSING** | §3 |
| Memory architecture | **MISSING** | No table, no store, no retrieval. Chat history exists only in React state and is lost on reload; `ai.js:179` caps the client-sent history at the last 20 messages. |
| Context architecture | **MISSING** | The only context passed is `lang`. No user id, location, active booking, or history reaches the model — `POST /ai/chat` is unauthenticated so the server does not even know who is asking. |
| Retrieval / RAG | **MISSING** | No embeddings, no vector store, no document corpus |
| Recommendation architecture | **MISSING** | "Recommendation" = `ORDER BY avg_rating DESC, total_bookings DESC` (`ai.js:330`) |
| Matching architecture | **PARTIAL** | The weighted scorer in `ai.js:336-352` is a reasonable v0, but: it re-ranks only within a `LIKE '%type%'` prefilter, ignores distance entirely (lat/lng unused), ignores availability windows, ignores price fit, and scores `p.last_active` — **a column that does not exist on `providers`** (`schema.sql:50-77`), so `freshnessScore` is always 0 (`ai.js:341-342`). |
| AI evaluation | **MISSING** | No golden set, no regression suite, no offline eval, no human review queue |
| AI observability | **MISSING** | No traces, no latency/cost metrics, no per-model success rate. `GET /ai/debug` (`ai.js:159-172`) is a one-shot connectivity probe, admin-gated. |
| Model/provider abstraction | **MISSING** | §2 |
| Guardrails | **MISSING** | No input classifier, no output classifier, no jailbreak detection |
| Cost controls | **PARTIAL** | Rate limit only (`server.js:31-38`), keyed on `req.headers.authorization ?? ip` — see §6 |

---

## 6. Access control and abuse

```
Finding:  The LLM proxy is unauthenticated.
Evidence: backend/routes/ai.js:174  router.post("/chat", async (req, res) => {...})
          backend/routes/ai.js:208  router.post("/chat/stream", async (req, res) => {...})
          — neither uses authMiddleware. Compare :159 (/debug) and :531 (/forecast),
            which correctly use [...adminOnly].
          backend/server.js:175   app.use("/api/ai", aiLimiter, require("./routes/ai"));
          backend/server.js:37    keyGenerator: (req) => req.headers["authorization"] || ipKeyGenerator(req)
Behavior: Anyone on the internet can send 20 requests/minute per IP (or per arbitrary
          Authorization header value — the header is used as the key without being
          verified, so sending a random Authorization string creates a fresh bucket).
Impact:   Unbounded consumption of the project's Gemini/OpenAI quota; the platform pays
          for arbitrary third-party inference. The header-based key is trivially rotated.
Severity: P1
```

`/api/ai/match`, `/dynamic-price`, `/fraud-check`, `/review-check`, and `/bundle-suggest` are likewise unauthenticated. `/fraud-check` and `/review-check` accept `userId` and `providerId` in the body (`ai.js:430`, `:476`) and query the database with them, leaking whether a user has 3+ bookings in the last hour and how old their account is.

---

## 7. Gap summary against brief §2.1 (multimodal)

| Modality | Brief expects | Current |
|---|---|---|
| Text | ✅ | ✅ chat |
| Voice | ✅ | ❌ Web Speech → keyword → navigation only (`VoiceCommand.jsx:114-140`); the transcript never reaches a model |
| Image | ✅ | ❌ client-side OCR for one NID field only (`App.jsx:1388`); no image is ever sent to a model |
| Video | where appropriate | ❌ absent |
| Location | ✅ | ❌ collected for the map (`App.jsx:4038`) and socket tracking; never passed to AI |
| Documents | ✅ | ❌ KYC uploads go to storage/DB; never analysed |
| Previous context | ✅ | ❌ no persistence |
| Current task state | ✅ | ❌ AI has no view of the active booking |

---

## 8. What is worth keeping

Not everything here needs replacing. Preserve in Phase 1:

* **The three-tier degradation *pattern*** (primary model → secondary model → deterministic answer) is sound operational design. What must change is the content of tier 3: it should say "I don't have that information" rather than invent figures.
* **The heuristic scorers** in `/match`, `/fraud-check`, and `/review-check` encode real domain knowledge and make reasonable baselines. They should be moved into a `risk`/`ranking` service, invoked server-side on the write path, and *renamed* — calling deterministic arithmetic "AI" is what makes the fabricated numbers in §4 credible to users.
* **SSE streaming plumbing** (`ai.js:219-292`, `api.js:226-264`) works and handles partial-line buffering correctly.
* **`aiLimiter`** as a concept — it needs an authenticated key, not removal.

---

## 9. Recommended Phase 1 sequence (proposal)

1. **Delete or neutralise the fabricated fallback strings** (`ai.js:92-142`). This is a P0 safety issue and a one-file change.
2. **Authenticate `/ai/chat` and `/ai/chat/stream`**; key the limiter on the verified user id.
3. **Write `docs/ai/TOOL-CATALOG.md`** before writing code. Defining tools forces a service layer, an authorization policy, transaction boundaries, and an audit log into existence — all four are required independently.
4. **Build the `LLMClient` abstraction** (§2) — a prerequisite for tools, since Gemini and OpenAI express them differently.
5. **Move the heuristic scorers server-side onto the write path** so fraud and fake-review signals actually gate something.
6. **Design the context envelope** (§7) and the memory store — both blocked on the schema work in `DATABASE-GAPS.md §7`.
7. **Stand up evaluation** before shipping any agentic behaviour: a golden set of Bengali and English intents with expected tool calls, run in CI.
