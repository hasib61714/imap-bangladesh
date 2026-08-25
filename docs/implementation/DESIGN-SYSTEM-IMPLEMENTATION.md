# IMAP 2.0 — Design System Implementation

**Status:** BLUEPRINT · **Phase:** 3 · **Date:** 2026-08-09
**Governed by:** `UX-CONSTITUTION.md` §8 · `INFORMATION-ARCHITECTURE.md` §6

---

## 1. Starting position

| Asset | State |
|---|---|
| `constants/theme.js` (322 L) | **A genuine, consistently-used token set, light and dark.** The best asset in the frontend — kept as the foundation |
| `components/ui.jsx` (82 L) | 4 primitives. Correct direction, radically incomplete |
| Everything else | **Inline style objects**, hundreds of them, across 11,332 lines |
| Ant Design | Admin only (~135 KB gz) — and it must stay there |

**Two systems run today**: inline styles for consumer, Ant Design for admin, with four shared primitives in total. The consumer product picks one, and it is the token set that already exists.

The cost of inline styles is not aesthetic. **Accessibility, theming and performance fixes have to be made in hundreds of places instead of one** — which is why A-01…A-09 are all currently unmet.

---

## 2. Decision: extend what exists

| Option | Verdict |
|---|---|
| Adopt a component library (MUI, Chakra) | **No.** 80–150 KB gz against a 150 KB budget for the entire core loop, plus a second token system |
| Ant Design for consumer too | **No.** 135 KB gz; desktop-first; Bangla typography untested |
| Tailwind | **No.** Rewrites every surface at once, and the token set already exists |
| **Extend `theme.js` + build the primitives IMAP needs** | **Yes** |

Roughly 25 components are needed. Written against tokens that already exist and are already used consistently, that is bounded, budget-controllable and Bangla-first by construction.

---

## 3. Tokens

`constants/theme.js` → `shared/ui/tokens.js`. Structure kept; three additions.

| Group | Status |
|---|---|
| Colour — semantic | **exists** (`C_LIGHT` / `C_DARK`) |
| Spacing | **exists** |
| Radius, shadow | **exists** |
| Typography scale | **exists** — retuned for Bengali line-height |
| **Motion** | **new** — durations, easings, `prefers-reduced-motion` variants |
| **Z-index scale** | **new** — replaces scattered magic numbers |
| **Focus ring** | **new** — the current `outline: none` has no replacement (A-01) |

### 3.1 Semantic, never literal

```js
// wrong — the value is right, the name is a lie
color: '#EF4444'

// right
color: tokens.color.status.failed
```

Status colours are named by **meaning**, so the nine-state vocabulary and the palette cannot drift:

```
status.suggested · available · requested · pending
     · confirmed · completed · failed · unavailable · unknown
```

### 3.2 Contrast is a test, not a review

Every foreground/background token pair used together is asserted at WCAG AA **in a unit test**. A pair failing the ratio fails the build. Contrast checked by eye regresses; checked by CI does not.

---

## 4. Components (~25)

### Foundation
`Box` · `Stack` · `Text` · `Icon`

### Controls
`Button` (primary · secondary · ghost · danger; **loading and disabled are distinct**) · `IconButton` · `Link` · `Input` · `TextArea` · `Select` · `Checkbox` · `Radio` · `Switch` · `DatePicker` · `TimeSlotPicker`

### Feedback
`Spinner` · **`Skeleton`** · `Toast` · `Alert` · `EmptyState` · `ErrorState` · `StatusBadge`

### Structure
`Card` · `List` · `Dialog` · `Sheet` (bottom sheet — the primary mobile pattern) · `Tabs` · `Nav`

### Domain
`PriceBreakdown` · `ProviderCard` · `BookingStateCard` · `TrustFacts` · `MoneyAmount` · `AreaPicker`

### Map
`MapView` — Leaflet, **lazy-loaded**, only on routes that need it

**Four of these carry rules rather than styling:**

| Component | Rule |
|---|---|
| **`Skeleton`** | Must **not** resemble content. Bars and blocks, never a fake provider card — the audit found placeholder content indistinguishable from real content |
| **`EmptyState`** | Requires a `message` **and** at least one `action`. An empty state with no way forward is a dead end |
| **`StatusBadge`** | Accepts a status **and its evidence**. A claim without evidence throws in development, renders `Unknown` in production |
| **`MoneyAmount`** | Accepts `{amount_minor, currency}`. **A number cannot be passed** — this is where the currency assumption stops returning |

### 4.1 Every component has every state

`default · hover · focus-visible · active · disabled · loading · error · empty`

A component missing one does not merge. This is enforced by the component's own test file, which renders each state.

---

## 5. Forms

Forms are where accessibility is usually lost, so the primitives carry the rules:

| Rule | Implementation |
|---|---|
| Every input has a visible label | `Input` requires a `label` prop; no placeholder-as-label |
| Errors linked to fields | `aria-describedby`, wired by the primitive |
| Errors announced | `role="alert"` on the error region |
| Required marked in text | Not by colour alone (A-06) |
| Bangla input works | Tested with a Bangla IME |
| Number inputs use the right keyboard | `inputmode` per field type |

---

## 6. Bangla-first typography

| Concern | Decision |
|---|---|
| Font stack | Bengali face first, Latin fallback second — not the reverse |
| Line height | Tuned for Bengali conjuncts; **taller than a Latin-first default** |
| Loading | `font-display: swap`; **Bangla subset only** |
| Numerals | One convention per locale, from `shared/i18n/format.js`. **Bengali and Western numerals never appear on the same screen** — they do today |
| Scaling | Every scale step verified at 200% |

---

## 7. Dark mode

Already implemented and **kept as a peer, not an afterthought**. Both palettes exist in `theme.js`; every component is verified in both; contrast tests run against both.

---

## 8. Motion

| Rule | Detail |
|---|---|
| Motion communicates **state change** | Not decoration |
| `prefers-reduced-motion` honoured | Tokens collapse to zero duration |
| Decorative animation is out of budget on the core loop | It stays on the landing page, which is not the core loop |
| No animation blocks interaction | |

The Phase-2 landing-page animation work is good and stays. **The counters animating to 10,000 customers and 1,200 providers from constants do not** — they are fabricated statistics (`UX-CONSTITUTION.md` §10).

---

## 9. Not copied

The brief is explicit: **use behavioural patterns, not visual identity.**

| Pattern | Adopted | Rejected |
|---|---|---|
| Bottom sheet for mobile actions | ✔ | — |
| Pull-to-refresh | ✔ | — |
| Skeleton loading | ✔ (**must not resemble content**) | — |
| Optimistic UI | ✔ **only where reversion is shown** | — |
| Infinite scroll | — | ✗ U8 |
| Engagement streaks, badges | — | ✗ U8 |
| Autoplaying video | — | ✗ |
| Any platform's visual identity, iconography or colour language | — | ✗ |
| Notification badges for non-actionable events | — | ✗ U8 |

---

## 10. Build order

| # | Step | Delivers | Verify |
|---|---|---|---|
| **DS-1** | Tokens moved and extended | motion, z-index, focus ring | contrast tests pass on both palettes |
| **DS-2** | Foundation + controls | Box, Stack, Text, Button, Input, Select | keyboard + screen reader on a form |
| **DS-3** | Feedback | Skeleton, EmptyState, ErrorState, StatusBadge, Toast, Alert | **`StatusBadge` without evidence throws** |
| **DS-4** | Structure | Card, List, Dialog, Sheet, Tabs, Nav | **`Dialog` traps and restores focus** (A-07) |
| **DS-5** | Domain | PriceBreakdown, ProviderCard, BookingStateCard, TrustFacts, MoneyAmount | **`MoneyAmount` refuses a bare number** |
| **DS-6** | Map | lazy `MapView` | not in the initial bundle |
| **DS-7** | Bangla typography | stack, line height, numerals | verified by a native speaker at 200% |

DS-1 through DS-3 land before `APP-JSX-MIGRATION.md` Step 3 (auth), because every extracted feature depends on them.

---

## 11. Governance

| Rule | Enforced by |
|---|---|
| No inline `style={{…}}` under `features/` | Lint rule, error |
| No colour literal outside `tokens.js` | Lint rule, error |
| No `px` font size outside the type scale | Lint rule, warn |
| Every component has all eight states | Its own test file |
| Every component is keyboard-operable | axe in CI |
| Contrast pairs verified | Unit test |
| **Ant Design imported only under `src/admin/`** | Lint rule + bundle assertion |

The last one is the boundary `UX-CONSTITUTION.md` §7 depends on, and it is asserted at build time rather than trusted.

---

## 12. Budget

| Item | Budget (gzip) |
|---|---|
| Tokens | ≤2 KB |
| Foundation + controls | ≤15 KB |
| Feedback + structure | ≤12 KB |
| Domain | ≤8 KB |
| **Design system total** | **≤37 KB** |
| Leaves for shell, router, home, ask | ~113 KB of the 150 KB budget |
| `MapView` | lazy, ungoverned by the initial budget |

Today's consumer bundle is ~540 KB total with a ~102 KB `index` chunk. The budget is met by not adding a library, not by optimising one afterwards.
