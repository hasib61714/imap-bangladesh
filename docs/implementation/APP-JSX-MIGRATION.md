# IMAP 2.0 — `App.jsx` Migration Plan

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Target structure:** `TARGET-REPOSITORY-STRUCTURE.md` §4 · **IA:** `INFORMATION-ARCHITECTURE.md` §3.3

**5,567 lines. 43 top-level components. 208 `useState`. 32 `useEffect`. ~30 page keys. No routing.**
31% of the codebase in one module, and the single largest item in the whole programme.

---

## 1. The finding that changes the plan

**Ten of `App.jsx`'s data sources are hardcoded arrays rendered as product data** (`CURRENT-SYSTEM-INVENTORY.md` §1.1). Nine surfaces are built entirely on them: analytics, loyalty, referral, portfolio, provider analytics, skill certification, promos, wallet transactions, calendar. None has a backend, an API namespace or a table.

`pseudoBooked()` is the clearest: it hashes a provider id and a date into a boolean and renders the result as whether a slot is booked.

**Consequence: these surfaces are not migrated. They are deleted.**

Every one is already outside Gate-1 scope — `INFORMATION-ARCHITECTURE.md` §3.3 lists them under "Not routes". Deleting them removes **~1,900 lines (34%)** before any decomposition begins, and it is the cheapest, lowest-risk, highest-value move available.

```
5,567  today
-1,900  Step 0 — delete fabricated surfaces
-1,150  Steps 2-4 — extract to features
-1,400  Steps 5-7 — extract to features
-1,100  Steps 8-9 — extract remainder
──────
    ~0  App.jsx deleted
```

---

## 2. Principles

| # | Principle | Why |
|---|---|---|
| 1 | **Never a big-bang rewrite.** One route group at a time | A three-week rewrite with nothing shippable in between is how migrations get abandoned |
| 2 | **The app is deployable after every step** | Each step is a commit that could ship |
| 3 | **Delete before extracting** | Nine surfaces are deleted, not moved — extracting them first would be wasted work |
| 4 | **Routing before features** | Without routes there is no seam; feature extraction into a page-key switch produces a second `App.jsx` |
| 5 | **Every extracted surface gets full/degraded/empty/error states** | U10 — a surface with no empty state re-imports the defect |
| 6 | **No fallback constants survive the move** | U1 — the defining defect |
| 7 | **Each step has a verification** | Named per step below |

---

## 3. Steps

### Step 0 — Delete the fabricated surfaces · **~1,900 lines** · S

Remove the nine components, their ten constant arrays, their page keys and their navigation entries.

`AnalyticsPage` · `LoyaltyPage` · `ReferralPage` · `PortfolioPage` · `ProviderAnalyticsPage` · `SkillCertPage` · `PromosPage` · `WalletPage` · `CalendarPage` — and `pseudoBooked()`.

**`WalletPage` needs a word.** Customer stored value is withdrawn by D-010, so the surface has no future in this form. **Existing loyalty points must not silently disappear**: R-611 records that earning is paused and existing balances are honoured when the per-booking discount ships. That is a communication obligation, and it is listed in `PHASE-3-IMPLEMENTATION-ROADMAP.md` §Owner actions.

| | |
|---|---|
| **Verify** | Build succeeds; no dead imports; no navigation entry leads nowhere; `data.js` consumers reduced to a known list |
| **Rollback** | Revert the commit |
| **Risk** | **Low** — nothing behind these surfaces is real |

### Step 1 — Routing, shell, providers · **M**

Introduce a real router. Move layout, navigation, error boundary and offline banner into `app/shell/`. Split `contexts/index.jsx` into session, locale, theme — **each with no mock seed**.

`App.jsx` becomes a route table; page keys become URLs per `INFORMATION-ARCHITECTURE.md` §3.3.

| | |
|---|---|
| **Delivers** | Deep links, browser back, SEO-addressable routes, per-route code splitting, analytics attribution — **none of which exist today** |
| **Verify** | Every previously reachable surface has a URL; back/forward work; refresh restores the surface |
| **Rollback** | Revert; the page-key switch is unchanged underneath |
| **Risk** | **Medium** — the highest-leverage step; nothing else can proceed without it |

### Step 2 — `shared/` foundation · **M**

`ui/` from `constants/theme.js` (kept — the best asset in the frontend) · `api/` generated from OpenAPI · `realtime/` merging the **two** socket clients into one · `i18n/` · `money/` · `state/` with the four kinds physically separated.

| | |
|---|---|
| **Verify** | **One socket connection per user** (two today); money rendered from `{amount_minor, currency}`; no component imports `constants/data.js` |
| **Risk** | Low |

### Step 3 — `features/auth` · ~470 lines · **S**

`AuthPage.jsx` moves largely intact — Phase 0.5 already removed the fabricated Facebook flow and the hidden `admin123` quick-login.

| | |
|---|---|
| **Verify** | Login, register, OTP, Google; **return to the exact surface the user left** (F9) |
| **Risk** | Low |

### Step 4 — `features/discovery` · ~680 lines · **L**

`SearchFilter`, `PCard`, `PDetail`, `NearbyPage` → `/services`, `/services/:slug`, `/providers`, `/providers/:id`.

**`constants/data.js` is deleted in this step.** Every consumer must first have a real empty state — that is the ordering constraint, and it is why this step is L rather than M.

| | |
|---|---|
| **Verify** | Empty results render an **empty state with alternatives**, never fabricated rows; filter state lives in the URL; ranking basis is displayed (R-302); `/providers/:id` is shareable and phone-free |
| **Risk** | **High** — this is where the defining defect is removed. Every list loader shaped `if (d?.x?.length) setX(...)` must become explicit `loading`/`error`/`empty` |

### Step 5 — `features/booking` · ~900 lines · **L**

`BookModal`, `MyBookings`, `RatingModal`, `DisputeModal`, `GuaranteeModal`, `LiveMap` → `/book/:providerId/:serviceId`, `/activity`, `/activity/:bookingId`.

The **approval surface** is the highest-stakes screen in the product: itemised price, cancellation policy in full, one primary button, **never pre-selected, never auto-advancing, no countdown** (F1·N).

| | |
|---|---|
| **Verify** | Total visible without scrolling; price change since results stated explicitly before confirm; per-state customer views (F2); **location visible only between `active` and `arrived`** |
| **Risk** | **High** — money and state |

### Step 6 — `features/provider` · ~790 lines + portal · **M**

`ProviderPortal.jsx`, `ProviderDash`, `ProviderRegPage` → `/provider`, `/provider/schedule`, `/provider/earnings`, `/provider/profile`, `/provider/apply`.

| | |
|---|---|
| **Verify** | **Earnings show gross, commission and net** (R-904) — never an unexplained deduction; availability editable in under 30 seconds (R-905); incoming request is a full surface, not a toast (F5) |
| **Risk** | Medium |

### Step 7 — `features/emergency` · ~600 lines · **M**

`DisasterPage`, `BloodDonationPage`, SOS → `/emergency`, `/emergency/blood`, `/emergency/disaster`.

| | |
|---|---|
| **Verify** | **999 is the largest element and appears before any input** (R-1001); the capability statement precedes the form (R-1002); **zero exclamation marks**; no `dispatched` state; blood donors show masked contact; **on any failure the hotline is surfaced** |
| **Risk** | Medium — highest consequence of getting it wrong |

### Step 8 — `features/account` + `features/activity` · ~800 lines · **M**

`CustomerProfilePage`, `SettingsPage`, `NotifPage`, `FavoritesPage`, `Chat`, `LiveChatPage`, `KYCPage` → `/account` and its four sections, `/activity`.

Five separate destinations today collapse into `/account` sections (IA §3.3). `KYCPage` uploads **direct to object storage** instead of base64 (AD-011).

| | |
|---|---|
| **Verify** | Four nav items total; no orphaned destination; KYC upload never base64 in production |
| **Risk** | Low |

### Step 9 — Remainder, then delete `App.jsx` · **M**

`ElderlyMode` (**a genuine strength — it raises the accessibility floor everywhere rather than being a mode**), `Onboarding`, `ServiceRequestPage`, `NIDPage`, `LoanScore` (**deleted — D-011**), `VoiceCommand` (wrapped, Gate-2 rewrite).

| | |
|---|---|
| **Verify** | `App.jsx` no longer exists; no import references it; full E2E suite passes |
| **Risk** | Low by this point |

### Step 10 — Admin separation · **M**

`AdminPanel.jsx` (1,600 L) → `src/admin/` behind `admin.html`.

| | |
|---|---|
| **Verify** | **The consumer bundle contains no `antd` module — asserted in CI**; fixture fallback rows removed (the panel still renders fake rows when the API returns empty); every mutating action records a reason and appears in the audit log |
| **Risk** | Medium |

---

## 4. Order and why

```
Step 0  delete            ← removes 34% before any work
Step 1  routing           ← the seam everything else needs
Step 2  shared/           ← the foundation features import
Step 3  auth              ← smallest real feature; proves the pattern
Step 4  discovery         ← deletes data.js; the defining defect
Step 5  booking           ← the core loop
Step 6  provider
Step 7  emergency
Step 8  account/activity
Step 9  remainder → delete App.jsx
Step 10 admin separation  ← independent; can run in parallel from Step 2
```

Steps 0 and 1 are non-negotiably first. Step 3 is deliberately the smallest real feature: the extraction pattern gets proven on something low-risk before it is applied to money.

---

## 5. Per-step definition of done

1. The route renders from the router, not a page key.
2. **Full, degraded and empty/error states all implemented** (U10).
3. **No fallback constant on any data path** (U1).
4. Server state uses the query cache with explicit `loading`/`error`/`empty`.
5. Every displayed number traces to a server value.
6. Every state claim maps to one of the nine states.
7. Completable by keyboard; visible focus; modals trap and restore focus (A-01, A-07).
8. Bangla and English both render; `<html lang>` tracks the selection (A-08).
9. The route is within its bundle budget.
10. The old code is **deleted in the same commit**.

Point 10 is what prevents a half-migrated tree. There is never a moment where two implementations of a surface are both live.

---

## 6. What is deliberately kept

| Kept | Why |
|---|---|
| `constants/theme.js` | A genuine, consistently-used token set — the best asset in the frontend |
| `ElderlyMode` | A real accessibility strength; it raises the default floor |
| Landing-page animation work | Good, and cheap to keep — **but the counters animating to 10,000 customers from a constant go** |
| `AuthPage` structure | Sound since Phase 0.5 |
| `ProviderPortal` structure | Functionally close to right |
| Error boundary in `main.jsx` | Works, with its auto-reload cap |
| `sw.js` | Works; upgraded to stale-while-revalidate for the shell |
| `VoiceCommand` | Genuinely useful; the transcript reaches a model at Gate 2 instead of a keyword table |

---

## 7. Risks

| Risk | P | Impact | Mitigation | Detection |
|---|:--:|:--:|---|---|
| A surface is lost in the move | Med | Med | Step 0's inventory is the checklist; every page key is accounted for | Route-coverage test |
| Fallback data reintroduced | **Med** | **High** | Lint rule forbidding `constants/data.js` and object-array exports under `features/` | CI |
| Bundle budget exceeded | Med | Med | Build fails on the entry that exceeds it | CI |
| Routing changes break the PWA cache | Med | Med | Service-worker version bump; `/api/*` kept alive 30 days (`API-CONTRACT-BLUEPRINT.md` §6.1) | Error rate after deploy |
| Users notice the deleted surfaces | **High** | Low | They render fabricated data today — **removing them is a correction**. Loyalty points need the R-611 communication |
| The migration stalls half-done | Med | **High** | Every step ships; no step depends on a later one | Step-completion tracking |
| Ant Design leaks into the consumer bundle | Low | Med | CI asserts its absence | CI |

The stall risk is the real one. It is mitigated structurally: after Step 0 the app is already better, after Step 1 it has routing, and every subsequent step is independently valuable. There is no point at which stopping leaves the product worse than it started.
