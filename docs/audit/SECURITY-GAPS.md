# IMAP — Security Gaps

> **STATUS UPDATE — 2026-08-09 (Phase 0.5).** The findings below are the
> Phase 0 baseline and are preserved unchanged for traceability. Many have
> since been contained on branch `imap/phase-0.5-containment`. For current
> status see [`PHASE-0.5-SECURITY-REGRESSION.md`](PHASE-0.5-SECURITY-REGRESSION.md)
> — **all 12 P0 findings fixed and verified; 19 P1 fixed.** Do not read the
> text below as a description of the code as it stands today.

**Audit date:** 2026-08-09 · **Commit:** `726cc87` · **Scope:** read-only. Nothing was fixed.

Severity: **P0** = exploitable now, direct account/money/safety loss · **P1** = high, needs a precondition or yields PII/integrity loss · **P2** = medium · **P3** = low/hardening.

**Counts: 12 P0 · 18 P1 · 11 P2 · 6 P3.**

> The recent commit history (`b573de9`, `01766f1`, `de55ce5`, `0730e55`, `c44e826`, `1c40426`, `5f869aa`) shows sustained, competent security work on input validation, socket spoofing, XSS in print windows, and payment race conditions. That work has not yet reached the authentication and money-authority layers, which is where every P0 below lives.

---

## P0 findings

### P0-1 — Authentication bypass: any password works for password-less accounts

```
File:      backend/routes/auth.js
Function:  POST /api/auth/login
Lines:     92-116 (guard at 105-108); account creation at 56
Behavior:
  const hash = password ? await bcrypt.hash(password, 10) : null;   // :56
  ...
  if (user.password_hash) {                                          // :105
    const ok = await bcrypt.compare(password || "", user.password_hash);
    if (!ok) return res.status(401).json({ error: "Wrong password" });
  }
  res.json({ user: safeUser, token: makeToken(user) });              // :111
```

Every account created through phone-OTP (`/verify-otp`, :179 returns `isNew`, the client then calls `/register` without a password), Google (`/google`, :229), or social (`/social-login`, :137) has `password_hash = NULL`. The `if` block is skipped entirely and a 7-day JWT is issued.

**Impact:** Full account takeover of any OTP or social user given only their email or phone number, which `GET /api/providers` publishes unauthenticated (P1-1). Includes provider accounts, therefore includes their wallet.
**Recommended future fix:** Reject login when `password_hash` is null and route the user to the OTP/social flow that owns that identity.

---

### P0-2 — Unverified social login issues a session token

```
File:      backend/routes/auth.js
Function:  POST /api/auth/social-login
Lines:     119-142
Behavior:
  const { socialId, provider, ... } = req.body;
  if (!socialId || !provider) return res.status(400)...
  const [rows] = await pool.query("SELECT * FROM users WHERE social_id = ?", [socialId]);
  if (rows.length) return res.json({ user: safeUser, token: makeToken(rows[0]), isNew: false });
```

No ID token, no signature, no audience, no provider-side verification. `social_id` is populated by `/api/auth/google` with Google's `sub` claim (`auth.js:216`), which is a stable public identifier, not a secret.

**Impact:** Full account takeover from a known `social_id`. Compounds with P0-1.
**Recommended future fix:** Remove the endpoint, or require a provider-issued token verified server-side (as `/auth/google` already does correctly at :193-200).

---

### P0-3 — Booking price is client-supplied and never validated

```
File:      backend/routes/bookings.js
Function:  POST /api/bookings
Lines:     10-20 (validation rules), 33-46, 60-70
Behavior:
  body("amount").optional({checkFalsy:true}).isFloat({min:1})        // :12 — only a floor
  const { ..., amount, total_amount, platform_fee = 0, ... } = req.body;   // :25-36
  const finalAmount = amount || total_amount;                        // :38
  const total = parseFloat(finalAmount) + parseFloat(platform_fee);  // :46
  INSERT INTO bookings (... amount, platform_fee ...) VALUES (?...)  // :60-70
Client:    frontend/src/App.jsx:546 — total_amount: dynPrice?.dynamicPrice || baseAmount
```

`providers.hourly_rate` and `categories.base_price` exist in the schema and are never consulted. `/api/ai/dynamic-price` computes a price server-side and returns it to the client, which then sends a number back — that number is what is stored and charged.

**Impact:** Any booking can be created at ৳1. Provider earnings, platform revenue, and admin reporting all derive from an attacker-controlled field.
**Recommended future fix:** Derive `amount` server-side from provider/category/schedule; treat any client-sent price as a display-only quote to be re-validated.

---

### P0-4 — Negative `platform_fee` inflates the wallet balance

```
File:      backend/routes/bookings.js
Function:  POST /api/bookings
Lines:     10-20 (no rule for platform_fee), 46, 48-55
Behavior:
  const total = parseFloat(finalAmount) + parseFloat(platform_fee);        // :46
  UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?     // :49
       params: [total, req.user.id, total]
  if (deductResult.affectedRows === 0) return 400 "Insufficient balance"   // :52
```

`createBookingRules` (:10-20) validates `provider_id`, `amount`, `total_amount`, `payment_method`, and four string lengths. It has **no rule for `platform_fee`**. With `amount = 1` and `platform_fee = -100000`, `total = -99999`; the guard `balance >= -99999` is always true; `balance - (-99999)` **adds** ৳99,999.

The same negative value is then written into `bookings.platform_fee` and credited to the provider on completion via `amount - platform_fee` (`bookings.js:236`), i.e. `1 - (-100000)` = ৳100,001.

**Impact:** Unbounded wallet creation by any authenticated user; unbounded provider payout. Compounds with P0-5.
**Recommended future fix:** Server-derive `platform_fee`; never accept it from the client. Add a `CHECK (balance >= 0)` equivalent and a non-negative constraint on all money columns.

---

### P0-5 — `status = completed` is repeatable and pays out every time

```
File:      backend/routes/bookings.js
Function:  PATCH /api/bookings/:id/status
Lines:     177-265
Behavior:
  await pool.query("UPDATE bookings SET status = ? WHERE id = ?", [status, id]);  // :197
  ...
  if (status === "completed") {                                                   // :229
    UPDATE providers SET total_jobs = total_jobs + 1 WHERE id = ?                 // :230
    const earnings = parseFloat(booking.amount) - parseFloat(booking.platform_fee||0);
    UPDATE users SET balance = balance + ? WHERE id = ?                           // :239
    INSERT INTO wallet_transactions (...)                                          // :242
  }
```

There is no check that `booking.status !== 'completed'` before applying the payout. Authorization at :188-195 permits the **customer**, the provider, or an admin to set any of the five statuses — so the customer can drive the provider's payout too.

**Impact:** N calls → N payouts and N `total_jobs` increments for one job. Combined with P0-4, an attacker who controls both sides of a booking mints unlimited balance.
**Recommended future fix:** A booking state machine with allowed transitions per role, an idempotency guard (`WHERE id = ? AND status <> 'completed'` with `affectedRows` checked), and the whole payout inside one transaction.

---

### P0-6 — Loan disbursement is not idempotent

```
File:      backend/routes/loans.js
Function:  PATCH /api/loans/:id   (admin only)
Lines:     226-277
Behavior:
  UPDATE microloans SET status=?, admin_note=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?  // :232
  const [[loan]] = await pool.query("SELECT * FROM microloans WHERE id=?", [id]);            // :238
  if (status === "disbursed") {                                                              // :265
    UPDATE users SET balance = balance + ? WHERE id=?     // :266 — loan.amount
    INSERT INTO wallet_transactions (...)                  // :270
  }
```

No prior-status check. Setting `disbursed` twice credits twice. Not atomic — the status update and the credit are separate autocommit statements.

**Impact:** Duplicate disbursement up to ৳100,000 per repeat (the apply-time cap, `loans.js:110`). Requires an admin session, but a double-click or a retried request is enough — there is no client-side guard either.
**Recommended future fix:** `WHERE id = ? AND status <> 'disbursed'`, check `affectedRows`, wrap in a transaction, and record disbursement in a ledger rather than mutating `balance`.

---

### P0-7 — Socket room join has no authorization (realtime IDOR)

```
File:      backend/server.js
Function:  io.on("connection") → socket.on("join_room")
Lines:     72-113
Behavior:
  socket.on("join_room", (bookingId) => {
    if (!socket.user) return;              // :78 — only checks "is authenticated"
    socket.join(`booking_${bookingId}`);   // :79
  });
```

No check that `socket.user.id` is the booking's customer or provider. Once joined, the socket receives:
* `new_message` — full chat content, sender name and avatar (`routes/chat.js:86-90`)
* `provider_location` — live GPS coordinates (`server.js:104`)
* `booking_updated` — status changes (`server.js:112`, `routes/bookings.js:202`)

The REST equivalents are correctly guarded (`routes/chat.js:29-39` and `:65-75` verify participation) — the socket path bypasses that guard entirely. Booking ids are UUIDv4, but `bookings.id` is returned to the customer at creation (`bookings.js:110`) and to the provider in `GET /providers/me/jobs`, and ids are relayed through several client surfaces.

**Impact:** Read any booking's private chat and the provider's live location. `location_update` (:99) is also unrestricted to participants, so a joined attacker can *inject* false coordinates into someone else's live tracking.
**Recommended future fix:** Look up the booking on `join_room` and verify `socket.user.id ∈ {customer_id, provider.user_id}` or role `admin`. Apply the same check to `location_update` and `booking_status`.

---

### P0-8 — SOS alerts are broadcast to every connected socket

```
File:      backend/routes/sos.js
Function:  POST /api/sos
Lines:     29-42
Behavior:
  io.emit("sos_alert", {
    id, user_id, user_name: req.user.name, user_phone: req.user.phone,
    type, description, booking_id, lat, lng, created_at
  });
```

`io.emit` sends to **all** connected clients, not to an admin room. `server.js:58-70` explicitly allows tokenless connections (`socket.user = null; next();`), so unauthenticated guests are among the recipients.

**Impact:** Real-time disclosure of a person's name, phone number, GPS position, and the nature of their emergency (`harassment`, `unsafe`, `fraud`, `emergency`) to any party connected to the socket server. For the harassment/unsafe categories this is a direct physical-safety risk.
**Recommended future fix:** Have admin sockets `join('admins')` after a verified role check and emit to that room only. Consider whether tokenless socket connections are needed at all.

---

### P0-9 — Known credentials seeded into production; seed endpoint reachable without a secret

```
File:      backend/schema.sql:353-356
Behavior:  INSERT IGNORE INTO users (...) VALUES ('admin-001','Admin User','admin@imap.bd',
             '01700000000','$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
             'admin','verified',1,0,0,'ADMIN001');
File:      backend/scripts/resetAdmin.js:6-9, 25
Behavior:  Header comment and console output state the password is `admin123`.

File:      backend/server.js:231-269
Behavior:  const hash = await bcrypt.hash("demo1234", 10);
           6 provider users, phones 01700000001 … 01700000006, is_available=1,
           nid_verified=1, trust_score=90, ratings 4.6–4.9, total_jobs up to 847.

File:      backend/server.js:189-202
Function:  GET /api/admin/seed-demo
Behavior:  const hasValidSecret = expected && req.query.secret === expected;
           if (!hasValidSecret) {
             const [[{cnt}]] = await pool.query("SELECT COUNT(*) AS cnt FROM providers
               WHERE service_type_bn IS NOT NULL AND service_type_bn <> ''")
               .catch(() => [[{ cnt: 99 }]]);
             if (cnt >= 4) return res.status(403).json({ error: "Forbidden" });
           }
           // falls through and seeds
```

`SEED_SECRET` is `generateValue: true` in `render.yaml:106-107`, so a secret does exist in the deployed environment. But the fallback path runs whenever fewer than four providers have a service type — the exact state of a fresh or lightly-populated database. The route is registered at `server.js:189`, after the `/api/admin` router (`:174`), which does not define `/seed-demo`, so Express falls through and the handler is reachable.

**Impact:** `admin@imap.bd` / `admin123` is administrator access to every user record, KYC document, payment, and loan. `demo1234` accounts are provider accounts with wallets. Additionally the seeded providers are indistinguishable from real ones in the public directory.
**Recommended future fix:** Delete the seeded admin from `schema.sql`; move demo seeding out of `server.js` entirely; require `SEED_SECRET` with no fallback and disable the endpoint when `NODE_ENV === "production"`. Rotate the live admin credential — treat it as compromised, since the bcrypt hash and its plaintext are both in the repository.

---

### P0-10 — Fabricated emergency information served as real

```
File:      backend/routes/disaster.js:24-31
Behavior:  Seeds disaster_reports on an empty table with 4 rows including
           ('cyclone','সাইক্লোন সতর্কতা জারি','কক্সবাজার','critical','pending', NOW()-5h)
           served publicly at GET /api/disaster/alerts (:36-49, no auth).

File:      frontend/src/App.jsx:3547-3562
Behavior:  const ALERTS = [ ...flood/cyclone/earthquake with severity levels and
           instructions such as "Evacuate coastal areas immediately" ];
           const SHELTERS = [ 3 named shelters with capacities and distances ];
           const HOTLINES = [ 999, 10941, 01755-614420, 16321 ];

File:      backend/routes/blood.js:33-44 and frontend/src/App.jsx:3780-3789
Behavior:  8 fabricated blood donors with names, blood groups, phone numbers,
           donation counts and GPS coordinates — seeded server-side and duplicated
           client-side.

File:      backend/routes/blood.js:131-145
Function:  POST /api/blood/request
Behavior:  logger.info(`[BLOOD REQUEST] ${name} needs ${blood_group} — ${message}`);
           res.json({ success: true, message: "Request sent to available donors" });
           // no donor is contacted; comment at :140 says "Could add to ... a dedicated table"

File:      backend/routes/sos.js:44
Behavior:  res.json({ ok:true, alert_id, message: "SOS alert sent to admin & call center." });
           // no call-centre integration exists anywhere in the repository
```

**Impact:** A user in an actual emergency may act on a fabricated cyclone warning, call a fabricated donor's phone number, or believe a blood request or SOS has been dispatched when nothing was sent. This is the most severe class of defect in the product because the harm is physical and lands on the most vulnerable users.
**Recommended future fix:** Remove all seeded emergency content. Blood and disaster data must come from a verified source or the feature must be disabled. Response messages must describe what actually happened. If demo content is retained for a sandbox, gate it behind `NODE_ENV !== "production"` and label it in the UI.

---

### P0-11 — No database transactions anywhere

```
Evidence:  grep -rn "beginTransaction|COMMIT|ROLLBACK" backend/  →  no matches
           (only backend/db.js:25 pool.getConnection(), a startup connectivity ping)
```

Every multi-statement money path is a sequence of independent autocommit statements:

| Path | Statements that can partially apply | File |
|---|---|---|
| Create booking | balance debit → booking insert → wallet_transactions insert → notification → points update → loyalty_log insert | `bookings.js:48-96` |
| Complete booking | status update → total_jobs increment → provider balance credit → wallet_transactions insert | `bookings.js:197-249` |
| Cancel booking | status update → customer balance credit → wallet_transactions insert | `bookings.js:197, 268-279` |
| Wallet top-up (IPN) | payment status CAS → balance credit → balance read → wallet_transactions insert | `payments.js:110-127` |
| Loan disbursement | loan status update → balance credit → wallet_transactions insert | `loans.js:232-276` |
| Points redemption | points/balance update → loyalty_log insert | `users.js:297-305` |
| KYC review | kyc_docs update → users.kyc_status update → providers.nid_verified update → notification | `kyc.js:103-128` |

**Impact:** A failure or connection drop between statements leaves money debited with no booking, or a booking with no debit, or a balance credited with no ledger row. The `wallet_transactions` table cannot be used to reconstruct `users.balance`, so there is no way to detect or repair the drift.
**Recommended future fix:** `pool.getConnection()` + `beginTransaction/commit/rollback` around every money path, and move to an append-only ledger where `balance` is derived rather than mutated.

---

### P0-12 — Unconfigured payment gateway credits wallets for free

```
File:      backend/routes/payments.js
Function:  POST /api/payments/initiate
Lines:     65, 78-94
Behavior:
  if (payment.isConfigured()) { ...real gateway... }                            // :65
  // Mock (dev mode)
  UPDATE payments SET status='success', gateway_val_id=?, paid_at=NOW() WHERE id=?  // :79
  if (type === "wallet_topup") {
    UPDATE users SET balance = balance + ? WHERE id = ?                          // :81
  } else {
    UPDATE bookings SET payment_status='paid', status='confirmed' WHERE id=?     // :90
  }
File:      backend/utils/payment.js:46
Behavior:  isConfigured() = !!(SSLCOMMERZ_STORE_ID && SSLCOMMERZ_STORE_PASSWORD)
```

Mock mode is selected purely by the presence of two env vars — `NODE_ENV` is not consulted. Both are `sync: false` in `render.yaml:53-56`, i.e. they must be set manually in the Render dashboard and are absent until someone does so. Worse, `.env.example:35-36` documents the variables as `SSL_STORE_ID` / `SSL_STORE_PASSWORD`, names nothing in the code reads — anyone following the documented setup lands in mock mode while believing payments are live.

**Impact:** `POST /api/payments/initiate {type:"wallet_topup", topup_amount:100000}` credits ৳100,000 instantly, repeatably, to any authenticated user. The cap at `:32-33` is ৳1,00,000 *per call*, not in total.
**Note:** The mock branch also inserts `wallet_transactions.type = 'topup'`, which is not in the column's enum (P1-10) — under strict mode the ledger insert throws after the balance has already been credited, producing an unlogged credit and a 500 response.
**Recommended future fix:** Refuse to start, or hard-fail `/payments/initiate`, when `NODE_ENV === "production"` and the gateway is unconfigured. Fix `.env.example`.

---

## P1 findings

| # | Finding | Evidence | Impact |
|---|---|---|---|
| P1-1 | Provider phone numbers exposed unauthenticated | `routes/providers.js:72` (`u.phone` in list), `:114` (in detail); both routes have no `authMiddleware` | Bulk harvest of every provider's phone; enables P0-1 |
| P1-2 | Blood-donor phone numbers and coordinates exposed unauthenticated | `routes/blood.js:49-92` — `GET /api/blood` has no auth, returns `phone`, `lat`, `lng` | PII of health-context individuals |
| P1-3 | Payment success redirect is publicly POSTable | `routes/payments.js:144-172` — no auth; `tran_id`, `val_id`, `status` all from the body | Attacker-triggered state transition; the `validatePayment` call is the only gate and its failure is swallowed at `:169` |
| P1-4 | IPN has no source authentication or amount reconciliation | `routes/payments.js:102-141` — no IP allow-list, no signature; `pay.amount` is never compared to the gateway's `amount` | Forged IPN if `validatePayment` can be satisfied; no detection of amount mismatch |
| P1-5 | Double charging: wallet debited at booking creation *and* gateway charged for the same booking | `bookings.js:47-55` debits for every non-cash method; `payments.js:44-63` then charges `booking.amount + platform_fee` | User pays twice; no reconciliation exists to detect it |
| P1-6 | Booking status has no state machine and no role separation | `bookings.js:180-197` — any of customer/provider/admin may set any of the 5 statuses | Customer can mark `completed` (triggering payout); provider can `cancel` (triggering refund) |
| P1-7 | Provider onboarding has no verification gate | `providers.js:263-328`; `schema.sql:61` `is_available TINYINT(1) DEFAULT 1`; notification at `:313-319` claims "reviewed within 24–48 hours" | Any authenticated user is publicly listed as a service provider immediately, contradicting the "KYC-verified providers" claim in `index.html:9` |
| P1-8 | `providers` INSERT omits the primary key | `providers.js:297-304` inserts without `id`; `schema.sql:51` `id VARCHAR(36) PRIMARY KEY` with no default | Under strict mode the insert errors → 500; in permissive mode the first row gets `''` and the second collides |
| P1-9 | KYC `doc_type` enum mismatch | `routes/kyc.js:10-12` accepts `birth_cert`, `driving_license`; `schema.sql:139` defines `ENUM('nid','driving','passport','birth')` | Two of four accepted document types fail at insert |
| P1-10 | `wallet_transactions.type` enum mismatch | `payments.js:85,126,161` insert `'topup'`; `schema.sql:158` `ENUM('credit','debit')` | Ledger row lost or query throws *after* the balance was already changed |
| P1-11 | Admin "suspend" does not suspend | `AdminPanel.jsx:157` always sends `{is_active:-1}`; `admin.js:117-120` writes it; `middleware/auth.js:18` tests `!rows[0].is_active` and `-1` is truthy | A suspended user keeps full access; the UI shows them as suspended |
| P1-12 | KYC ID images stored as base64 in the primary DB and shipped whole in listings | `schema.sql:141-143` `LONGTEXT`; `kyc.js:62-66`; `admin.js:176` selects `k.*` | Government ID scans in DB backups and logs; a 30-row admin page can exceed 100 MB |
| P1-13 | Content Security Policy disabled | `server.js:139` `contentSecurityPolicy: false` | No defence-in-depth against injected script; the app also loads Google GSI and Google Translate scripts (`index.html`) |
| P1-14 | OTP store and cache are in-process | `utils/otp-store.js:5` `new Map()`; `utils/cache.js:12` `new Map()` | OTPs lost on restart (Render free tier sleeps); a second instance breaks verification and serves divergent cached data |
| P1-15 | Phone and email changeable with no verification | `users.js:37-46` `PUT /api/users/profile` updates `phone`/`email` via `COALESCE`, no OTP, no uniqueness pre-check | Identity change without proof of control; unique-key violation surfaces as a 500 |
| P1-16 | LLM proxy is unauthenticated | `routes/ai.js:174` `POST /chat`, `:208` `POST /chat/stream` — no `authMiddleware`; limiter keys on `req.headers.authorization || ip` (`server.js:37`) | Anyone can burn the project's Gemini/OpenAI quota; a rotating IP pool defeats the 20/min limit |
| P1-17 | Five environment-variable names in code do not match what is provisioned | `storage.js:34` vs `render.yaml:88,101`; `sms.js:43` vs `render.yaml:73,75`; `sms.js:57` vs `render.yaml:63`; `payment.js:15` vs `render.yaml:57`; `payment.js:13-14` vs `.env.example:35-36` | Silent misconfiguration: wrong storage bucket, broken SMS, payments stuck in mock mode (see P0-12) |
| P1-18 | Schema mutated from application code at import time, errors swallowed | `providers.js:261`, `admin.js:391-401`, `chat.js:8-21`, `loans.js:17-41`, `blood.js:8-46`, `disaster.js:8-33`, `promos.js:7-25`, `users.js:347-360`, `server.js:379-396` | No migration history, no rollback, no failure signal; two instances can race on DDL |

---

## P2 findings

| # | Finding | Evidence |
|---|---|---|
| P2-1 | 10 MB JSON body limit on every route including unauthenticated ones | `server.js:162` `express.json({ limit: "10mb" })` |
| P2-2 | Admin broadcast loads every active user into memory and bulk-inserts | `admin.js:296-303` `SELECT id FROM users WHERE is_active = 1` then one multi-row INSERT |
| P2-3 | Unpaginated list endpoints | `providers.js:243-248` (`/me/jobs`), `reviews.js:73-78` (`/provider/:id`), `users.js:78-81` (wallet, LIMIT 50 fixed) |
| P2-4 | Raw error messages returned regardless of `NODE_ENV` | `ai.js:419, 465, 523, 601, 658, 704, 747` — `res.status(500).json({ error: err.message })` |
| P2-5 | JWT has no `jti`, no revocation, 7-day lifetime | `auth.js:12-15`; `refresh_tokens` table (`schema.sql:252-260`) is never read or written |
| P2-6 | `/api/auth/refresh` re-issues a token from an existing valid token indefinitely | `auth.js:244-257` — no rotation, no family tracking, no absolute expiry |
| P2-7 | No idempotency keys on any mutating endpoint | Repo-wide; compounds P0-5, P0-6, P1-5 |
| P2-8 | File uploads trust the client-declared MIME type | `upload.js:19-23` `fileFilter` checks `file.mimetype` only; no magic-byte check; PDFs accepted for the avatar field |
| P2-9 | `/api/ai/fraud-check` and `/review-check` take `userId`/`providerId` from the body with no auth | `ai.js:428-467`, `:474-525` | Lets an unauthenticated caller probe another user's recent-booking count and account age |
| P2-10 | `location_update` accepts any `bookingId` from any authenticated socket | `server.js:99-105` — validates coordinate ranges but not membership | Inject false GPS into another booking's live tracking |
| P2-11 | Notifications broadcast by event name | `bookings.js:259, 289` `io.emit(\`user_${id}\`, …)`; client subscribes at `socket.js:98` | Any client listening on `user_<victimId>` receives that user's notification payloads |

---

## P3 findings

| # | Finding | Evidence |
|---|---|---|
| P3-1 | `Math.random()` used for booking OTP codes | `bookings.js:58`, `auth.js:148` — not cryptographically secure |
| P3-2 | Referral codes generated with `Math.random().toString(36)` and no collision retry | `auth.js:11`; `users.referral_code` is UNIQUE, so a collision is a 500 |
| P3-3 | `crossOriginEmbedderPolicy: false` | `server.js:140` |
| P3-4 | CORS hardcodes an allowed origin in addition to the env var | `server.js:144-147` `"https://hasib61714.github.io"` is always allowed |
| P3-5 | Request-id generated with `Math.random()`; client-supplied `x-request-id` echoed unvalidated | `server.js:128-134` |
| P3-6 | `frontend/.vite/deps/` build cache committed to git | `git ls-files` |

---

## Cross-cutting observations

**Authorization model.** There is no policy layer. Authorization is expressed as ad-hoc `if` statements inside handlers, and the same check is re-implemented per route — correctly in `chat.js:29-39`, incompletely in `bookings.js:188-195`, and not at all in `server.js:77-81`. There is no ABAC, no resource-ownership abstraction, and no way to audit "who may do what" without reading all 19 route files.

**Money authority.** The system treats the client as authoritative for price (`amount`), fee (`platform_fee`), and — in mock mode — payment success. Section 12 of the audit brief requires the opposite. Every P0 in the money cluster reduces to this single missing principle.

**Audit trail.** There is none. No `audit_logs` table, no admin action log, no KYC decision log beyond `reviewed_by`/`reviewed_at` on the row itself, no payment reconciliation record. After any of the P0 exploits above, there would be no reliable way to determine what happened or to compute the loss — `wallet_transactions` is written on a best-effort basis outside a transaction and is missing rows wherever an enum mismatch or partial failure occurred.

**What is done well** (worth preserving in Phase 1): parameterised queries throughout (no SQL injection found); `bcrypt` with cost 10; `authMiddleware` re-reading the user from the DB on every request so role and `is_active` changes take effect immediately; the atomic compare-and-swap on payment status (`payments.js:110-114, 150`); the atomic balance guards on withdraw and points redemption (`users.js:133-137, 297-301`); correct REST-side chat participation checks; `helmet`, `express-rate-limit`, and `express-validator` all present and used; Google ID-token verification with audience check (`auth.js:193-200`); OTP attempt limiting and resend throttling (`utils/otp-store.js`); `mockOtp` correctly gated behind `NODE_ENV !== "production"` (`auth.js:156`).
