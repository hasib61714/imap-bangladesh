# IMAP 2.0 — Security Architecture

**Status:** PROPOSED · **Phase:** 2 · **Date:** 2026-08-09
**Baseline:** `docs/audit/SECURITY-GAPS.md` (12 P0, 18 P1) · `docs/audit/PHASE-0.5-SECURITY-REGRESSION.md` (all P0 fixed)
**Companions:** `AUTHORIZATION-ARCHITECTURE.md`, `AUDIT-LOG-ARCHITECTURE.md`

---

## 1. Position

Phase 0 found twelve P0 vulnerabilities. Phase 0.5 fixed all twelve and 19 P1s, with 31 regression tests that were negative-control verified. **This architecture's job is to make those defect *classes* structurally unreachable**, not to keep patching instances.

Each class below names the historic defect, because a control whose rationale is forgotten gets removed.

---

## 2. Threat model

| Actor | Capability | Primary concern |
|---|---|---|
| Unauthenticated internet | Public endpoints, sockets, webhooks | Enumeration, PII harvesting, free LLM use, forged callbacks |
| Authenticated user | Own session | IDOR, price manipulation, self-dealing, other users' data |
| Malicious provider | Provider account | Fake completion, review manipulation, customer data harvesting |
| Compromised admin | Elevated role | Mass data access, fund movement, trust manipulation |
| Prompt injector | Content that reaches a prompt | Tool abuse, Sealed disclosure, instruction hijack |
| Payment fraudster | Gateway interaction | Forged callbacks, amount manipulation, chargebacks |
| Insider | Direct database access | Undetected modification |
| Automated abuse | Volume | Credential stuffing, scraping, OTP flooding, inference cost |

**Highest-impact assets:** identity documents · the ledger · emergency and donor data · session material · the audit log · the AI tool registry.

---

## 3. Authentication

| Control | Design | Historic defect |
|---|---|---|
| **Password login fails closed** | Requires a stored credential. No credential ⇒ no password authentication, ever | **P0-1** — a null `password_hash` accepted any password, so knowing a phone number was full account takeover |
| Uniform failure response | Constant-time compare against a dummy hash; identical response for no-account, no-credential and wrong-password | Prevented enumeration and credential-type discovery |
| **Social login requires provider verification** | Server-verified ID token, audience checked, `email_verified` required before matching an existing account by email | **P0-2** — a client-supplied `socialId` minted a session |
| No client-asserted identity at registration | `socialId` and `loginMethod` are not accepted from the client | Pre-registration binding attack |
| Password hashing | bcrypt cost ≥12, migrating on login | Cost 10 today |
| OTP | Server-generated, cryptographically random, hashed at rest, TTL, attempt limit, resend throttle, **never returned in a response** | `mockOtp` was correctly gated in Phase 0.5 |
| Sessions | Short-lived access token + rotating refresh; `session` rows revocable | `refresh_tokens` exists and was never read or written |
| Revocation | Session revocation disconnects sockets and invalidates tokens | Sessions were unrevocable |
| MFA | FUTURE for admin and finance roles | — |

---

## 4. Authorization

Full design in `AUTHORIZATION-ARCHITECTURE.md`. The structural guarantees:

| Guarantee | Enforcement |
|---|---|
| One kernel, one entry point | Three implementations existed |
| A policy without a resource is rejected at registration | Role-only checks caused the IDOR class |
| A use case without a policy throws at startup | Nothing ships unguarded |
| Same policy across HTTP, socket, AI tools and jobs | **P0-7** — the socket layer had no check at all |
| AI acts as the user, never elevated | **D-002** |
| Roles read from the database, never from a token claim | **P0-8** — a JWT role claim was enough to join the admin room |
| Separation of duties on financial and punitive actions | — |

---

## 5. Money-path security

| Control | Design | Historic defect |
|---|---|---|
| Client never sends an amount | Requests carry a `quoteId`; the server resolves the price | **P0-3** |
| Money validation at every boundary | Bounded non-negative integers; `NaN`, `Infinity`, negatives, over-cap rejected | **P0-4** — a negative `platform_fee` turned a deduction into a credit |
| Guarded state transitions | Conditional update on observed state, `affectedRows` checked | **P0-5** — repeat completion paid a provider unboundedly |
| Deterministic ledger references under unique constraints | Second attempt fails the transaction | **P0-6** — repeat loan disbursement |
| All money paths transactional | `withTransaction` | **P0-11** — zero transactions existed |
| Gateway fails closed in production | Unconfigured ⇒ 503, never a mock settlement | **P0-12** |
| IPN is the only crediting path | Redirect endpoints redirect only | **P1-3** |
| Amount reconciliation before settlement | Gateway-reported vs stored; mismatch refuses and alerts | **P1-4** |
| Double-charge prevention | Wallet settlement marks the booking paid; re-charge returns 409 | **P1-5** |
| No customer stored value | D-010 — the account kind exists, none issuable | Cluster of the worst money defects |

---

## 6. AI security

| Control | Design |
|---|---|
| No database access | The model emits tool calls; the runtime executes them |
| No service account | Injection would become privilege escalation |
| Tier C has no tool | Absence of capability, not policy |
| Tier B cannot commit | Proposal objects with no commit path |
| Double authorization | Proposal and execution |
| Sealed context never assembled | The assembler has no query for it — not a filter |
| Injection defence | User, provider and message content delimited as data; detection on retrieved content; refusal + logging |
| Evidence binding | Unbound factual claims are stripped; state degrades to Unknown |
| Endpoints authenticated | **P1-16** — the LLM proxy was public |
| Per-user quotas | Cost abuse |
| Full audit | Every tool call, proposal, confirmation and execution |

---

## 7. Data protection

| Class | Controls |
|---|---|
| **Identity documents** | Private object storage, encrypted, short-lived signed URLs, every access logged with reason. **Never in the primary database** (`D-02`, `D-03`) — currently base64 `LONGTEXT` up to ~5 MB each |
| **Financial** | Restricted roles, no full records in logs, statutory retention |
| **Emergency and donor** | Isolated context, Sealed, never in AI context or analytics, short retention, instant consent revocation |
| **Location** | Purpose-scoped, time-bounded, not persisted beyond the booking (`D-04`) |
| **Message content** | Guarded; participants only; never in event payloads |
| **Contact details** | Not on public endpoints — **P1-1** (provider phones), **P1-2** (donor phones) |
| **Credentials** | Hashed, never returned by any query |
| In transit | TLS everywhere; HSTS |
| At rest | Database encryption at rest; object storage encryption; application-level encryption for the highest class |

---

## 8. Application security

| Area | Control | Note |
|---|---|---|
| Input validation | Schema validation generated from the API contract, at the transport boundary | |
| SQL injection | Parameterised queries only; SQL confined to `infrastructure/` by lint | No injection found in the audit — this preserves that |
| XSS | React escaping; **no `dangerouslySetInnerHTML`**; strict escaping in any generated document | Phase 0.5 fixed stored XSS in print windows |
| **CSP** | **Deferred, and named as an open item.** Enabling it requires auditing inline styles, Ant Design, Google GSI and Google Translate. A wrong CSP breaks the app; guessing is worse than the current state | **P1-13, still open** |
| Security headers | Helmet: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy | Present |
| CORS | Explicit allow-list from configuration; no hardcoded origin | One is hardcoded today |
| CSRF | Bearer tokens in headers, not cookies ⇒ not applicable. If cookies are ever introduced, SameSite + tokens become mandatory | |
| File upload | Magic-byte validation (not client MIME), size limits, virus scanning for identity documents, no execution, served from a separate origin | Client MIME is trusted today |
| Body size | Per-route limits | A global 10 MB limit applies to every route today |
| Dependencies | Automated scanning, pinned versions, review on major bumps | None today |
| Secrets | Environment-provided, validated at boot, never in the repository, rotated on exposure | `admin123`/`demo1234` were committed |
| Error responses | One contract; no stack traces, SQL or internal ids | Raw `err.message` was returned from AI routes |

---

## 9. Rate limiting and abuse

| Surface | Limit | Reason |
|---|---|---|
| Authentication | Per identifier **and** per IP, with backoff | Credential stuffing |
| OTP request | Per phone, per IP, with resend cooldown | SMS cost and harassment |
| AI | Per authenticated principal, per tier | **P1-16** — the header-keyed limiter was trivially rotated because the endpoint was public |
| Payment initiation | Per principal | Card testing |
| Discovery | Generous per IP | Scraping |
| Emergency | **Rate-limited and flagged, never auto-blocked** | The false-positive cost is someone unable to get help |
| Donor contact release | Strict per principal | Harvesting |
| Webhooks | Per source | |

Bot defences (challenge on anomalous signup/login velocity) are FUTURE.

---

## 10. Realtime security

Detail in `REALTIME-ARCHITECTURE.md` §3.

| Control | Historic defect |
|---|---|
| Room join requires a participation check | **P0-7** — any authenticated user could read any booking's chat and GPS |
| Verified membership recorded separately from socket rooms | `join` is reachable from more than one place |
| Only the assigned provider publishes location, only in the active window | Coordinate injection into others' tracking |
| Admin room membership verified against the database | Stale/forged role claims |
| **`io.emit` forbidden by lint** | **P0-8** — victim name, phone, GPS and emergency type broadcast to every connected socket, guests included |
| No personal data in event payloads | Same |

---

## 11. Operations security

| Control | Design |
|---|---|
| Six distinct roles, not one `admin` | `DOMAIN-ARCHITECTURE.md` §6 |
| Reason mandatory on mutating ops actions | R-1103 |
| Every ops action audited | R-1101 |
| Identity documents load per record with a reason | **P1-12** — the KYC list shipped whole base64 documents |
| Separation of duties | Approver ≠ executor; case raiser ≠ decider |
| No self-service role grants | Tier C |
| Admin bundle separate from the consumer app | AD-012 |
| **Bootstrap requires a generated or provided password** | **P0-9** — `admin123` was seeded, published, and reachable from a hidden client button |

---

## 12. Secure defaults

| Default | Rationale |
|---|---|
| New provider: **not listed** | D-005 |
| New account balance: **zero** | ৳500 was granted with no ledger entry |
| Payment gateway unconfigured in production: **503** | P0-12 |
| Demo seeding: **refuses when `NODE_ENV=production`** | P0-9, P0-10 |
| Emergency dispatch: **unavailable** | It does not exist |
| AI tools: **allow-list**, empty by default | Unregistered tools refused |
| Context tier: **Open** unless declared otherwise | Guarded requires a grant |
| Notifications: **off** until the user has a reason to want them | P7 |
| Location sharing: **off** | Per-purpose grant |
| Config: **process refuses to start** on missing required variables | Five silent env-var mismatches |

---

## 13. Incident response

| Stage | Requirement |
|---|---|
| **Detect** | Error tracking, security alerts (Tier-C attempts, reconciliation mismatch, auth anomalies, injection detections) |
| **Triage** | Severity by data class and blast radius |
| **Contain** | Session revocation, role suspension, feature disable, gateway pause — all pre-built, not improvised |
| **Investigate** | Audit log by principal, resource or correlation id. **Only possible once the audit log exists** |
| **Remediate** | Fix, regression test, deploy |
| **Learn** | Every incident produces a regression test; AI incidents produce evaluation cases |
| **Disclose** | Per policy and legal obligation |

**Runbooks required before launch:** compromised credential · payment discrepancy · data exposure · AI safety incident · emergency-surface failure.

---

## 14. Known open items

Named rather than implied. All are carried from Phase 0.5.

| Item | Severity | Status |
|---|---|---|
| **Content-Security-Policy disabled** | P1-13 | Deferred — needs an inline-style and third-party-script audit |
| **Hotline numbers unverified** | R-1009 | Open risk. Phase A task |
| **Migration 002 never run against a live database** | — | Untested against production TiDB |
| **`admin123` may have been used** | P0-9 | **Unanswerable without an audit log.** The strongest argument for building it first |
| Identity documents still base64 in the database | P1-12 | Phase B |
| In-process cache and OTP block horizontal scaling | P1-14 | Phase B |
| No dependency or secret scanning | — | Phase B |
| No MFA for elevated roles | — | FUTURE |
| Insider risk from direct database access | — | Mitigated by cold-storage export, not eliminated |

---

## 15. Security quality gates

The architecture does not proceed to implementation unless:

1. Every sensitive operation crosses the authorization kernel.
2. Every mutating use case declares a policy and idempotency behaviour.
3. Every financial effect is transactional, idempotent and audited.
4. Every AI action passes through a tool with authorization at proposal and execution.
5. No Tier C tool is registered; attempted invocation alerts.
6. Sealed data is structurally unreachable from AI context — **verified by test, not review**.
7. Every realtime room and event is authorized.
8. Secrets are configuration; the process refuses to start without them.
9. The audit log records every state change with actor and reason.
10. The Phase 0.5 regression suite passes and has been extended to the new paths.
