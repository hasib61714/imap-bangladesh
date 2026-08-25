# Running IMAP locally

Everything below runs against a database on your own machine. Nothing here
can reach production: `config/environment.js` refuses to let a
development-class process connect to a production database, and the dev
database listens on loopback only.

---

## 1. Start the database

A MariaDB instance with its own datadir, its own port (3399) and its own
credentials, separate from any machine-wide MariaDB service.

```powershell
.\scripts\dev-db.ps1 up        # initialise (first time) and start
.\scripts\dev-db.ps1 status
.\scripts\dev-db.ps1 down      # stop, keep the data
.\scripts\dev-db.ps1 reset     # stop and destroy the datadir
```

If PowerShell script execution is blocked, run the equivalent by hand — the
script is short and every command in it is a plain `mariadbd` invocation.

## 2. Create the schema and some data

`scripts/dev.sh` loads `scripts/dev.env` and runs a command with it. Those
variables are exported before node starts, and dotenv does not override an
already-set value, so they win over `backend/.env` without that file being
touched.

```bash
./scripts/dev.sh node scripts/migrate.js          # apply all migrations
./scripts/dev.sh node scripts/seedDemo.js         # six demo providers
ADMIN_BOOTSTRAP_PHONE=01700000000 \
ADMIN_BOOTSTRAP_PASSWORD='choose-your-own' \
  ./scripts/dev.sh node scripts/resetAdmin.js     # an administrator
```

The demo providers are given verified identity cases so the marketplace is
not empty on first run. Each carries `demo seed — not a human verification
decision` in its `decision_reason`, so a seeded row is never mistaken for a
review that happened.

## 3. Start the two servers

```bash
./scripts/dev.sh node server.js     # backend on :5001
cd frontend && npm run dev          # frontend on :5173
```

The frontend talks to `/api`, which the vite dev server proxies to the
backend — including `/socket.io`, so realtime works without a second URL to
get wrong. If port 5001 is taken, set `PORT` in `scripts/dev.env` and
`VITE_DEV_API_ORIGIN` for vite.

> `frontend/.env` carries the deployed backend URL and vite loads it in every
> mode. `src/api.js` therefore defaults to the relative `/api` in development
> regardless, so `npm run dev` cannot quietly talk to production.

## 4. Check that it works

```bash
IMAP_SMOKE_RESET_LIMITS=1 SMOKE_ADMIN_PASSWORD='...' \
  ./scripts/dev.sh node ../scripts/smoke.mjs
```

54 steps covering registration, login, the directory, applying as a provider,
KYC submission through both routes, the review queue, the four verification
decisions, listing approval, the three payment kinds, bookings, the wallet,
and the authorization boundaries.

It creates about six accounts per run and `auth.register` is rate-limited to
ten per IP per hour. `IMAP_SMOKE_RESET_LIMITS=1` clears the local counters
before running — it refuses to do so against anything but a loopback
database, and it does not change the limits themselves.

---

## The other checks

```bash
cd backend  && npm test                 # 588 unit tests
cd backend  && npm run lint:boundaries  # import boundaries
cd frontend && npm run lint             # eslint; build runs it first
cd frontend && npm run build            # lint, bundle, enforce the budget
```

Integration tests are skipped unless you point them at a disposable database:

```bash
IMAP_TEST_DB_HOST=127.0.0.1 IMAP_TEST_DB_PORT=3399 \
IMAP_TEST_DB_USER=root IMAP_TEST_DB_PASSWORD=imap-dev-only \
  npm --prefix backend test             # 700 tests
```

They create and drop their own databases and refuse any host that is not
loopback.

---

## Identity documents in development

Object storage is deliberately unconfigured locally, so the sealed document
store falls back to its local driver and writes to `backend/.private/sealed`
— outside anything express serves, gitignored, and readable only through a
five-minute HMAC-signed URL minted by an audited use case.

A **production-behaving** process refuses that fallback unless an operator
sets `SEALED_LOCAL_DIR` to a durable path, because a container filesystem is
usually ephemeral and quietly writing identity documents to a disappearing
disk would lose evidence the platform said it was keeping. Configure
`R2_SEALED_BUCKET` with credentials for a real deployment.

## Ports

| What | Port |
|---|---|
| dev database | 3399 |
| backend | 5001 |
| frontend | 5173 |

5000 is avoided deliberately: it is commonly held by another service on
Windows, and the old socket client hardcoded it.
