# IMAP — UX Gaps

> **STATUS UPDATE — 2026-08-09 (Phase 0.5).** The findings below are the
> Phase 0 baseline and are preserved unchanged for traceability. Many have
> since been contained on branch `imap/phase-0.5-containment`. For current
> status see [`PHASE-0.5-SECURITY-REGRESSION.md`](PHASE-0.5-SECURITY-REGRESSION.md)
> — **all 12 P0 findings fixed and verified; 19 P1 fixed.** Do not read the
> text below as a description of the code as it stands today.

**Audit date:** 2026-08-09 · **Commit:** `726cc87` · **Scope:** read-only, code inspection. No live user testing or device testing was performed; findings marked *(unverified)* would need a running session to confirm.

---

## 1. Behavioural UX scorecard (brief §16)

Scale: **0** absent · **1** conceptual · **2** partial · **3** implemented · **4** strong · **5** production-grade.

### Discovery

| Capability | Score | Evidence |
|---|---:|---|
| Personalised feed | **0** | No personalisation anywhere. Home renders a fixed category grid from `constants/data.js:1-96`. `GET /api/providers` sorts by `rating DESC` for everyone (`providers.js:42-43`). |
| Contextual recommendations | **1** | `/ai/bundle-suggest` runs *after* booking (`App.jsx:555`) and falls back to a hardcoded map (`ai.js:731-737`). No pre-booking recommendation. |
| Nearby discovery | **2** | `NearbyPage` (`App.jsx:4029-4054`) requests geolocation and computes haversine **client-side** over already-fetched providers. `providers.latitude/longitude` are never used in any query — there is no server-side geo filter, so "nearby" only re-sorts page 1. |
| Visual discovery | **1** | Category tiles with emoji icons. No provider photos (`users.avatar` is optional and usually empty), no portfolio browsing surface, no short-form media. `PortfolioPage` (`App.jsx:2848`) renders an emoji "gallery" from `PF_PROVIDERS`, a 2-element hardcoded array. |

### Interaction

| Capability | Score | Evidence |
|---|---:|---|
| Natural language | **2** | Chat panel exists and reaches a real model when `GEMINI_API_KEY` is set. It cannot see the current page, the user, or any booking — `/ai/chat` is unauthenticated (`ai.js:174`). |
| Voice | **1** | `VoiceCommand.jsx` uses Web Speech API, matches the transcript against a keyword list (`:62-70`), and navigates. No LLM, no dictation into forms, no voice booking. Bengali recognition (`rec.lang = "bn-BD"`, `:107`) has limited browser support. *(unverified on device)* |
| Multimodal input | **1** | Client-side OCR prefills one NID field (`App.jsx:1388`). No image, document, or location input reaches AI. |
| One-tap actions | **2** | Provider availability toggle (`ProviderPortal.jsx:300`) and accept/decline job (`:233-243`) are genuine one-tap. Customer booking is a 3-step modal plus a fake OTP step. |
| Quick actions | **2** | Landing and home surface category shortcuts; `ElderlyMode` (`App.jsx:1521-1566`) is a genuinely good large-target simplified mode. |

### Continuity

| Capability | Score | Evidence |
|---|---:|---|
| Continue previous task | **0** | No resume state. Closing the booking modal discards all progress; `BookModal` state is local (`App.jsx:491-505`). |
| Active task state | **1** | `MyBookings` lists bookings with status. There is no persistent "active job" surface, no progress timeline, no ETA that reflects reality (the ETA shown is `p.eta`, a static string from `constants/data.js`). |
| History | **2** | Bookings, payments, wallet transactions, and loyalty history all have real endpoints. Wallet history is capped at 50 rows with no pagination (`users.js:79`). |
| Saved state | **1** | Only the JWT and `imap_user` in `localStorage` (`api.js:10-12`, `:60-61`). Favourites (`FavsCtx`) are in-memory and lost on reload. |

### AI

| Capability | Score | Evidence |
|---|---:|---|
| Proactive assistance | **0** | Nothing initiates. All AI is user-prompted. |
| Memory | **0** | No store. History is capped at the last 20 client-sent messages (`ai.js:179`) and lost on reload. |
| Contextual suggestions | **1** | Only post-booking bundles. |
| Agentic execution | **0** | AI cannot perform any action — see `AI-GAPS.md §3`. |

### Trust

| Capability | Score | Evidence |
|---|---:|---|
| Ratings | **3** | Real: gated on a completed, unrated, own booking (`reviews.js:20-27`); provider average recalculated on write (`:37-44`). |
| Reviews | **3** | Real text + tags, displayed on the provider detail page (`providers.js:127-132`). |
| Verification | **1** | KYC submit/review works. But `POST /api/providers/apply` lists a provider publicly with **no** verification (`providers.js:263-328`), while `index.html:9` markets "KYC-verified providers" and the applicant is told review takes 24–48 hours (`providers.js:316-318`). The badge shown is `nid_verified`, which only an admin KYC approval sets. |
| Transparent pricing | **1** | The price shown comes from `/ai/dynamic-price` with a surge reason, which reads well — but the client then sends its own number as authoritative (`App.jsx:546`), promo codes are validated and never applied to any total (`promos.js:57-84`; no booking code reads a promo), and `platform_fee` defaults to 0 and is invisible. |
| Provider reliability | **2** | `rating`, `total_jobs`, `trust_score`, `experience_yrs` are displayed. `trust_score` is written in exactly one place (`kyc.js:117`) and has no defined meaning. Response-time and completion-rate metrics do not exist. |

### Real-time

| Capability | Score | Evidence |
|---|---:|---|
| Instant feedback | **2** | Optimistic UI is used in the admin panel (`AdminPanel.jsx:145-172`) — but with `.catch(e => console.warn(...))`, so a failed action still shows as succeeded. |
| Live tracking | **2** | Real Socket.io location streaming (`server.js:99-105`, `hooks/useSocket.js:53`) rendered on Leaflet. Unauthorized (`SECURITY-GAPS.md` P0-7) and spoofable. |
| Status updates | **3** | Genuine: REST PATCH → `io.to(room).emit("booking_updated")` (`bookings.js:200-207`) plus Web Push (`utils/push.js`). |

**Average across 21 capabilities: 1.4 / 5.**

---

## 2. Data-source audit (brief §10)

| Surface | Classification | Evidence |
|---|---|---|
| Landing page statistics | **STATIC (fabricated)** | `LandingPage.jsx:112` — counters animate to `{svc:500, cust:10000, prov:1200, rat:4.8}` |
| Landing "LIVE ACTIVITY TICKER" | **STATIC (fabricated)** | `LandingPage.jsx:715-737` — CSS marquee over an 8-element literal array, doubled for seamless looping |
| Landing testimonial stats | **STATIC** | `LandingPage.jsx:698-706` — "১০,০০০+ / 10,000+ Satisfied Customers" |
| schema.org aggregateRating | **STATIC (fabricated)** | `index.html:55-59` — `ratingValue 4.8, reviewCount 10000` published as structured data |
| Service categories | **STATIC** | `constants/data.js:1-96` — 19 categories; `count` fields sum to 2,142 and are rendered as "2,142+ service providers available" (`App.jsx:5162`). `GET /api/services` returns the DB's 12 categories and is **not** used for this grid. |
| Provider cards | **PARTIAL API** | `App.jsx:4371` `useState(PROVIDERS)`; live data replaces it only if the API returns a non-empty array |
| My bookings | **PARTIAL API** | `App.jsx:4372` `useState(MY_BOOKINGS)` — 4 fabricated bookings including "BK-4521 Completed" |
| Notifications | **PARTIAL API** | `App.jsx:1822` `useState(NOTIFS_DATA)`, `:4377` again — 5 fabricated notifications including "Flood warning in your area" |
| Wallet transactions | **PARTIAL API** | `App.jsx:3305-3314` — 8 fabricated transactions with bKash/Nagad/Rocket methods |
| Promo codes | **PARTIAL API** | `App.jsx:3166-3173` — 6 coupons with fabricated redemption counts; `promos.js:14-23` seeds the same six server-side with `used_count` up to 1,890 |
| Blood donors | **PARTIAL API + SEEDED FAKE** | `App.jsx:3780-3789` 8 hardcoded donors; `blood.js:33-44` seeds 8 more into the DB |
| Disaster alerts | **STATIC + SEEDED FAKE** | `App.jsx:3547-3552` `ALERTS` with evacuation instructions; `disaster.js:24-31` seeds 4 into the DB |
| Shelters, hotlines | **STATIC** | `App.jsx:3552-3562` |
| Loyalty history | **PARTIAL API** | `App.jsx:2639` `LY_HISTORY` — 4 fabricated entries |
| Portfolio | **STATIC** | `App.jsx:2846` `PF_PROVIDERS` — 2 providers with emoji galleries |
| Admin KYC queue | **PARTIAL API** | `AdminPanel.jsx:118-126` initialised with 5 fabricated applications |
| Admin support tickets | **STATIC** | `AdminPanel.jsx:127-133` — 4 fabricated tickets; `loadComplaints` (`:435`) replaces them only if non-empty |
| Admin providers / users / bookings | **PARTIAL API** | `AdminPanel.jsx:296, 320, 340, 361` — every loader is `if (d?.x?.length) setX(...)` |
| Booking payment OTP | **HARDCODED FAKE FLOW** | `App.jsx:503-504` generates the code and a fake recipient phone in the browser; `:570` renders it labelled "Demo OTP" |
| Provider "views" metric | **HARDCODED FORMULA** | `providers.js:174` — `views: total_jobs * 4` |
| AI chat fallback answers | **HARDCODED** | `ai.js:92-142` — see `AI-GAPS.md §4` |
| Base prices for AI pricing | **HARDCODED** | `ai.js:374-380` |
| Bundle suggestions | **PARTIAL API** | `ai.js:731-737` static fallback |
| Blood-donor distance | **DERIVED FROM A FIXED POINT** | `blood.js:61-65` — haversine from Dhaka city centre `(23.8103, 90.4125)`, not from the user. Displayed as "dist" next to each donor. |

### The critical pattern

Every list loader in the app follows this shape:

```js
// AdminPanel.jsx:296-312, :320-333, :340-355, :361-378 — and equivalents in App.jsx
const d = await adminApi.providers(...);
if (d?.providers?.length) { setProviders(...); }   // ← empty response leaves fake rows
```

**An empty database, a failed request, an expired token, or a cold-started backend all produce the same result: the user sees fabricated data presented as real, with no error and no empty state.** This is the single highest-impact UX defect in the product, because it makes every other correctness problem invisible.

---

## 3. Information architecture

**CURRENT.** Navigation lives inside `App.jsx` as a page-key state machine (~30 page keys) plus a modal stack. There are no URL routes — the app is a single path with client-side page switching, so:

* No deep linking. A booking, a provider, or a promo cannot be shared as a URL.
* No browser back/forward. *(unverified — no history integration found in `App.jsx`)*
* No SEO beyond the landing page. `index.html` markets "500+ services" but no service or provider page is crawlable.
* `vercel.json:6-8` rewrites everything to `index.html`, which is correct for an SPA but confirms there are no server-rendered routes.

**TARGET (brief §5 UX).** Information architecture, navigation architecture, and user flows as documented artifacts.

**GAP.** None of the three exist as documents, and the implementation has no route table to reverse-engineer them from — the IA is implicit in a 5,538-line file.

---

## 4. Design system

**CURRENT.**
* `constants/theme.js` (322 L) defines `C_LIGHT`/`C_DARK` token objects (`p`, `pdk`, `bg`, `card`, `bdr`, `text`, `sub`, `muted`, `plt`) — a real, consistently-used token set. Dark mode works throughout.
* `components/ui.jsx` contains exactly **four** shared components: `Av`, `Stars`, `PBar`, `MiniBar` (82 L total).
* Everything else is inline `style={{...}}` objects. There is no `Button`, `Card`, `Input`, `Modal`, `Badge`, or `EmptyState` primitive in the customer app.
* `pages/AdminPanel.jsx` uses Ant Design 6 components — a **second, unrelated design system** used only in admin.

**GAP.** Two design languages, four shared primitives, and inline styles for everything else. A visual change (spacing, radius, focus ring) requires editing hundreds of literal style objects. Ant Design (457 KB gzipped 135 KB) is bundled for a surface only admins see; it is code-split (`vite.config.js:36`) but still shipped.

---

## 5. State handling — loading, empty, error

| State | Status |
|---|---|
| **Loading** | Inconsistent. `PageLoader` exists (`App.jsx:21`) for lazy routes. `AdminPanel` has `dataLoading` (`:291`). Most customer surfaces render fallback data immediately with no skeleton, so there is nothing to load *into*. |
| **Empty** | **Absent by design.** Empty is indistinguishable from populated because of the fallback pattern in §2. There is no "no providers found", "no bookings yet", or "no donors in your area" state anywhere in the customer app. |
| **Error** | Largely swallowed. 20+ client call sites use `.catch(()=>{})` or `.catch(e=>console.warn(...))` — e.g. `App.jsx:512, 552, 557`, `ProviderPortal.jsx:30, 227, 233, 238, 243, 483`, `AdminPanel.jsx:63-64, 73, 147, 152, 158, 163, 171`. The user is not told the action failed. |

Genuine error handling that does exist and works well:
* `ErrorBoundary` in `main.jsx:6-65` with a bounded auto-reload (max 2) and a cache-clear recovery button — a thoughtful PWA-specific recovery path.
* `api.js:57-63` — 401 clears the token and dispatches an `imap-unauthorized` event instead of reloading.
* `api.js:45-52` — one retry after 1 s on network failure, for Render cold starts.
* `BookModal` surfaces booking errors properly (`App.jsx:499, 550`).

---

## 6. Accessibility

*(Assessed by code inspection only; no screen-reader or axe run was performed.)*

| Area | Finding |
|---|---|
| Semantic HTML | Mostly `<div>`. `LandingPage.jsx` uses `<section aria-label>`/`aria-labelledby` and `<h2 id>` correctly; `App.jsx` (the entire customer app) has almost no landmarks or headings hierarchy. |
| Interactive elements | Many are `<div onClick>` — e.g. `ProviderPortal.jsx:300` (availability toggle), `App.jsx` category tiles, `AdminPanel.jsx` list rows. Not focusable, not keyboard-activatable, no role. |
| Focus management | No `focus()` call on any modal open, no focus trap, no restore on close. Found across `BookModal`, `PDetail`, `RatingModal`, `DisputeModal`, `GuaranteeModal`. |
| Keyboard | No visible focus styles are defined in the token set; inline styles set `outline:"none"` on inputs (e.g. `App.jsx:577`, `:4305`) without a replacement indicator. |
| Colour contrast | `C.muted` used at `fontSize:8-11` in several places (`ui.jsx:60,79`, throughout `App.jsx`) — likely below WCAG AA. *(unverified — needs a contrast run against the actual token values)* |
| Status conveyed by colour alone | Booking/KYC/complaint status uses colour + emoji; the emoji does carry meaning, which partially mitigates this. |
| Images | Emoji-as-icon throughout with no `aria-label`; avatars are initials in a styled div with no alt text. |
| Language | `<html lang="bn">` fixed at `index.html:2` and never updated when the user switches to English. |
| Motion | `LandingPage.jsx` adds substantial scroll-reveal, float, counter, ticker, and pulse animation (commits `f26716a`, `726cc87`). No `prefers-reduced-motion` guard found. |
| Touch targets | Mobile-first layout with generally adequate sizes; `ElderlyMode` (`App.jsx:1521`) is an explicit large-target mode and is a genuine strength. |

---

## 7. Performance

Verified by build: **3,100 modules, ~1.85 MB raw / ~540 KB gzip**, split into `vendor` (181 KB gz), `antd` (135 KB gz), `index` (103 KB gz), `react-vendor` (46 KB gz), plus route chunks.

| Issue | Evidence |
|---|---|
| `index` chunk is 403 KB raw | `App.jsx` alone is 5,538 L and is not code-split internally |
| Ant Design shipped for an admin-only surface | 457 KB raw; code-split (`vite.config.js:36`) so only admins download it |
| Avatars and KYC images as base64 | Default when R2 is unconfigured — up to 2 MB per avatar inline in every profile response, uncacheable, uncompressible |
| No image optimisation, no responsive images, no CDN for user media | Media lives in the DB by default |
| Service worker is network-first for everything | `sw.js:29-48` — no stale-while-revalidate, so a cold Render backend blocks the shell too *(mitigated by `wakeBackend()` in `api.js:15`)* |
| Chat uses polling **and** sockets | `App.jsx` / `ProviderPortal.jsx:139` poll `chatApi.getMessages` while `socket.on("new_message")` is also active |
| Two socket connections per user | `socket.js` and `hooks/useSocket.js` are independent singletons |
| No `React.memo`, `useMemo`, or virtualisation on long lists | Provider list, booking list, admin tables all render fully |

---

## 8. Bilingual / localisation

**CURRENT.** Every user-facing surface is bilingual (Bengali default, English toggle) and the Bengali is idiomatic, not machine-translated. This is a real strength.

**GAP.**
* `constants/translations.js` holds ~108 keys; the overwhelming majority of strings are inline `lang==="en" ? "…" : "…"` ternaries scattered across all files. There is no extraction path, no translator workflow, and no way to add a third language without editing every file.
* Bengali numerals are used in some places (`"৳৩৫০"`, `"৮"` minutes) and Western numerals in others (`amount` from the API) — sometimes on the same screen.
* Dates are formatted with `toLocaleDateString("bn-BD")` in the admin panel (`AdminPanel.jsx:302, 328, 350, 366`) and with hardcoded Bengali relative strings ("৩ দিন আগে") in demo data.
* `<html lang>` never changes (§6).
* Currency is hardcoded `৳` in ~100 template literals; `payments.currency` defaults to `'BDT'` and is never read.

---

## 9. Journey-level gaps

| Journey | Break |
|---|---|
| **Sign up → first booking** | New user receives ৳500 balance with no explanation (`schema.sql:22`) and three fabricated welcome notifications including a promo claim (`users.js:163-169`). No onboarding of what IMAP does — `Onboarding` (`App.jsx:2087`) exists but is a slide deck, not a needs-capture step. |
| **Find a provider** | Search is `LIKE '%q%'` with no ranking, no typo tolerance, and no geo filter. The results page shows the static 19-category grid, not the DB's 12. |
| **Book** | Client sends its own price. A fake "Demo OTP" is displayed on screen. The provider's schedule is never checked, so a slot can be double-booked. |
| **Pay** | Wallet is debited at creation *and* the gateway is charged separately (P1-5). Promo codes validate but are never applied. |
| **Track** | Works, but any authenticated user can join the room (P0-7) and inject coordinates. |
| **Complete** | Either party can mark it complete, repeatedly, each time paying the provider (P0-5). |
| **Review** | Correct and well-gated — the best-implemented flow in the product. |
| **Dispute** | `complaints` row + an admin status field. No SLA, no evidence upload, no refund linkage, no user-visible timeline. |
| **Become a provider** | Immediately listed publicly with no review, while being told review takes 24–48 hours. The insert itself is likely broken (`DATABASE-GAPS.md §3`). |
| **Emergency (SOS)** | Told the alert went to "admin & call center"; it was broadcast to every connected socket instead. |
| **Blood request** | Told "Request sent to available donors"; a log line was written. |

---

## 10. Recommended Phase 1 UX work (proposal)

1. **Remove every silent fallback to fabricated data** and design real empty states. Until this is done, no other UX finding can be validated against a running system.
2. **Remove the fake payment OTP step** (`App.jsx:501-588`) — it teaches users to trust an on-screen code as a payment confirmation.
3. **Make trust claims true or remove them**: either gate provider listing behind KYC approval, or stop marketing "KYC-verified providers".
4. **Introduce URL routing** — deep linking is a prerequisite for sharing, SEO, and any short-form/social discovery pattern in brief §2.3.
5. **Extract a component library** from the inline styles and pick one design system, so the accessibility fixes in §6 can be made once instead of hundreds of times.
6. **Write the three missing UX documents** (`UX-CONSTITUTION.md`, `INFORMATION-ARCHITECTURE.md`, `USER-FLOWS.md`) — the IA currently exists only as implicit state in one file, which makes the IMAP 2.0 goal-based redesign impossible to plan.
