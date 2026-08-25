# Frontend architecture (target & migration)

The app is being moved off the single `App.jsx` monolith into a feature-based
structure. This is **incremental and non-breaking** — `App.jsx` keeps working
while slices move out one at a time.

## Target tree
```
src/
  app/         App.jsx · router.jsx · providers.jsx · ProtectedRoute.jsx
  features/    auth/ booking/ provider/ wallet/ admin/ chat/ ai/ kyc/
               (each: components/ · hooks/ · <feature>.api.js · index.js)
  shared/      components/ · hooks/ · utils/ · constants/
  services/    api/ · socket/
```

## Landed in this phase (safe, additive)
- `services/api`, `services/socket` — canonical import paths (re-export the
  existing `src/api.js` / `src/socket.js`; no behavior change).
- `shared/components/ErrorBoundary.jsx` — extracted from `main.jsx` (identical
  behavior) and now imported there.
- `app/ProtectedRoute.jsx` — `RequireAuth` / `RequireRole` guards.

## Migration plan (per feature, reviewable in isolation)
1. Create `features/<name>/` and move that feature's components out of `App.jsx`.
2. Point its data calls at `services/api`.
3. Lazy-load the heavy, route-level screens:
   ```jsx
   const AdminPanel = React.lazy(() => import("../features/admin/AdminPanel.jsx"));
   // render inside <Suspense fallback={<Splash/>}> ... </Suspense>
   ```
   (`pages/AdminPanel.jsx`, `pages/ProviderPortal.jsx`, `pages/KYCPage.jsx` are
   already separate and are the first lazy-loading candidates.)
4. Introduce `app/router.jsx` and wrap protected screens with `ProtectedRoute`.

UI/visual output must remain identical at every step.
