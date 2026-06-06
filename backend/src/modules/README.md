# Backend modules (clean architecture)

Target layering for each domain module. **`auth/` is the reference implementation.**

```
modules/<domain>/
  <domain>.controller.js   # HTTP only      — maps req → service → res
  <domain>.service.js      # Business logic  — pure, dependency-injected, unit-testable
  <domain>.repository.js   # Database only   — SQL, no rules
  <domain>.validation.js   # express-validator rules
  index.js                 # composition root — wires repo→service→controller→router
```

## Layer rules (enforced by tests/architecture.test.js)
- **Controllers** import services/validation — never `db` directly.
- **Services** import repositories — never `express` or `db`.
- **Repositories** are the only layer that imports `db`.

## Migration strategy (non-breaking)
The legacy `routes/*.js` files remain mounted and unchanged. Migrate one
endpoint at a time:

1. Move its SQL into `<domain>.repository.js`.
2. Move its logic into `<domain>.service.js` (inject the repo + helpers).
3. Add a thin `<domain>.controller.js` handler.
4. Mount via `index.js#buildRouter()` and remove the legacy handler.

Because the service is dependency-injected, each step is covered by fast unit
tests with a fake repository (no DB) — see `tests/auth-module.test.js`.

Planned modules: auth · booking · wallet · payment · provider · admin · ai.
(Money modules — booking/wallet/payment — migrate last and only with the
full P0 integration-test suite green, to protect the financial guarantees.)
