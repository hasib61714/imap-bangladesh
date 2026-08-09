# I-07 — Trusted Provider, KYC and Verification

**Branch** `imap/phase-4-foundation` · **Status** complete · **Tests** 665 passing, none skipped

I-07 gives IMAP an auditable, state-driven verification lifecycle, and closes
F-12 — the finding that no endpoint could approve a provider at all.

Two sentences summarise it. **A person's verification state is a case, not a
column, and every move it makes is a use case with an action, a policy, a
reason and a record.** **A provider's listing eligibility is a conjunction
computed from that case, not a boolean somebody set.**

---

## 1. What changed

| Before | After |
|---|---|
| `POST /api/kyc` wrote up to four ~5 MB base64 LONGTEXT columns into the primary database | bytes go to private object storage; `identity_document` holds a reference and has no column a byte could go in |
| `utils/storage.js` returned `${R2_PUBLIC_URL}/${key}` — permanent, unauthenticated | a signed URL, minted per authorised read, valid five minutes, never stored |
| `kyc_docs.status` moved by two route handlers writing SQL directly | five use cases over one state machine; no route writes verification state |
| a rejection could be recorded with no reason | `chk_reason_when_refused`, the policy's `reasonRequired`, and the domain's `requireReason` — three layers |
| reading a KYC document was a page view | Tier C, `trust_safety` only, a stated reason **required by the kernel**, audited on every mint (V-07) |
| `providers.is_approved` written by `scripts/seedDemo.js` and nothing else (**F-12**) | `listing_state`, moved by three authorised, audited use cases |
| listable = `is_approved = 1` | TRUST §5's six-clause conjunction, each clause reported by name |
| `pending → verified` in one opaque jump | claim, then decide — two recorded steps |

---

## 2. Files

**New — identity module** (`backend/src/modules/identity/`)

| File | What it is |
|---|---|
| `domain/verificationCase.js` | STATE-MACHINES §9, transcribed. Transitions, actors, reason rules, expiry |
| `actions.js` | 11 action ids |
| `policies.js` | 11 policies into the I-04 kernel |
| `infrastructure/resourceLoaders.js` | `verification_case`, `own_verification_case`, `identity_document` |
| `infrastructure/verificationRepository.js` | the only verification SQL |
| `application/commands/SubmitIdentityVerification.js` | the base64-to-object-storage fix |
| `application/commands/decideVerification.js` | one guarded transition, five times |
| `application/commands/verificationDecisions.js` | claim · approve · reject · request-info · revoke |
| `application/queries/ReadOwnVerification.js` | the subject's view |
| `application/queries/ListVerificationQueue.js` | metadata, no evidence |
| `application/queries/ReadVerificationCase.js` | audited read (V-07) |
| `application/queries/GetIdentityDocumentUrl.js` | the only way a document leaves storage |
| `application/queries/GetLegacyDocumentImage.js` | the migrated backlog, same four controls |
| `transport/routes.js` | `/api/verification/*` |
| `index.js` | the module's public surface |

**New — platform** · `storage/sealedDocumentStore.js`
**New — marketplace** · `domain/listingEligibility.js`, `application/commands/decideProviderListing.js`, `application/queries/ReadListingEligibility.js`
**New — migrations** · `011_verification.sql`, `012_active_slot_null_safe.sql`
**New — tests** · `test/i07-verification.test.js` (52), `test/integration/verification.integration.test.js` (20)

**Rewritten** · `routes/kyc.js` (an adapter; no verification SQL)
**Changed** · `routes/admin.js` (the KYC decision delegates), `providerRepository`, `fulfillmentCandidate`, `marketplace/policies.js`, `marketplace/resourceLoaders.js`, `ApplyAsProvider`, `src/application/execute.js`, `src/composition/modules.js`, `server.js`

---

## 3. The state model, and the naming discrepancy

`STATE-MACHINES.md` §9 is the authority and is implemented verbatim:

```
[*] → not_submitted → submitted → under_review → verified
                          ↑            ├→ rejected
                          │            └→ more_info
                          └────────────────┘        (resubmit)
      verified → expired → submitted
      verified → revoked → submitted                (appeal accepted)
      rejected → submitted                          (resubmit)
```

**No state was invented.** The I-07 brief §8 offers a candidate vocabulary and
asks that it be compared against the authoritative machine first. It maps
exactly, and §9's names are used:

| Brief | STATE-MACHINES §9 |
|---|---|
| `PENDING_REVIEW` | `submitted` |
| `CHANGES_REQUESTED` | `more_info` |
| `SUSPENDED` | `revoked` |
| `APPROVED` | `verified` |

**A discrepancy between two architecture documents, recorded rather than
resolved.** `GATE-1-ARCHITECTURE.md` §5 summarises the same machine as
"submitted → in_review → approved | rejected; expired" — two names differ
(`in_review`, `approved`) and two states are missing (`more_info`, `revoked`).
The dedicated document wins on vocabulary because it is the one that
enumerates the transitions and their rules. **This needs an owner's ruling if
GATE-1 §5 is meant to be normative**; until then the code follows §9 and
`ListVerificationQueue` returns a 400 for `?state=approved` rather than
silently returning an empty page.

`not_submitted` is deliberately **absent from the column enum**. It is the
machine's initial state and it means "there is no case"; a row holding it
would be a case asserting its own absence. `stateOf(null)` derives it, and a
test asserts the column enum and the domain's stored-state list are equal, so
they cannot drift.

### Provider listing is a separate axis

`GATE-1-ARCHITECTURE.md` §5 (FROZEN) lists provider approval among the
"validated enums, not machines", so `providers.listing_state` is a column with
guarded transitions rather than a second case table.

| STATE-MACHINES §2 | Where it lives |
|---|---|
| `applied`, `approved`, `rejected`, `suspended` | `providers.listing_state` |
| `listed`, `paused` | `providers.is_available` — already exists, already the provider's own switch |
| `under_review` | the verification case's `under_review`. A second review queue over the same person is a claim step nobody specified |
| `removed` | not an enum value: no use case grants it, and I-06 §6 forbids speculative states |

A test asserts every enum value is reachable from `applied` through the
transition table — an enum value nothing can produce is a claim the schema
makes and the code cannot keep.

---

## 4. The storage boundary (§32, answered in order)

**1 — the current boundary.** `utils/storage.js` has one write path ending in
`const url = publicBase ? \`${publicBase}/${key}\` : key`, a permanent
unauthenticated URL. `POST /api/upload/kyc` used it with `folder:
kyc/${req.user.id}`, putting a user id in a path a public base would expose.
`POST /api/kyc` ignored storage entirely and wrote base64 into
`kyc_docs.front_image` / `back_image` / `selfie_image` (7,168,000 chars each).

**2 — what is safe.** The credential handling, the bucket resolution across
all four env spellings (P1-17), and the multipart upload. All reused.

**3 — what is implemented.** Signing, via `@aws-sdk/s3-request-presigner
^3.1106.0` — the official companion to the `@aws-sdk/client-s3 ^3.995.0`
already present, so this adds an algorithm rather than a vendor.

**4 — the abstraction.** `sealedDocumentStore`: `putSealed` (returns a
reference, and **has no code path that can produce a URL** — asserted by a
test), `signedReadUrl` (five minutes), `deleteSealed`, `capability()`.

**5 — the capability gap, stated rather than papered over.** This process
cannot read a bucket ACL, so **it does not claim an object it writes is
private.** What it can do is refuse the one configuration provably unsafe:

> `R2_PUBLIC_URL` set with no dedicated sealed bucket means identity documents
> would share a bucket that serves unauthenticated reads. Submission fails
> closed with `CapabilityUnavailableError` (503) rather than succeeding into
> it.

**Operator prerequisite, not a control this code provides:** the sealed bucket
must have public access blocked at the bucket level. Set
`R2_SEALED_BUCKET` (or `S3_SEALED_BUCKET`) to a bucket configured that way.

Object keys carry the **case** id and 16 random bytes and nothing that
identifies a person — `sealed/verification/<caseId>/<docType>-<32 hex>.jpg`.

---

## 5. Authorization

Eleven identity policies and four marketplace ones, all in the I-04 register.

| Action | Roles | Tier | Audit | Reason |
|---|---|---|---|---|
| `verification_case.submit` | customer, provider (own) | B | required | — |
| `verification_case.read_own` | customer, provider (own) | A | none | — |
| `verification_case.list` | trust_safety, operations | B | on_deny | — |
| `verification_case.read` | **trust_safety** | C | **required** (V-07) | — |
| `identity_document.read` | **trust_safety** | C | **required** (V-07) | **required** |
| `identity_document.read_legacy` | **trust_safety** | C | **required** (V-07) | **required** |
| `verification_case.start_review` | trust_safety | C | required | — |
| `verification_case.approve` | trust_safety | C | required | — |
| `verification_case.reject` | trust_safety | C | required | **required** |
| `verification_case.request_info` | trust_safety | C | required | **required** |
| `verification_case.revoke` | trust_safety | C | required | **required** |
| `provider.approve_listing` | trust_safety, operations | C | required | — |
| `provider.reject_listing` | trust_safety, operations | C | required | **required** |
| `provider.suspend_listing` | trust_safety, operations | C | required | **required** |
| `provider.read_eligibility` | subject + platform roles | A | none | — |

**Only `trust_safety` may open a document.** Not support, not finance, not
operations, not `platform_owner` — I-04 §6's list, unchanged. `operations`
sees the queue, because running a marketplace means knowing how long people
wait, and that is answerable without anybody's identity card.

**"Required reason" is a DENIAL, not a validation error.** The kernel refuses
with `reason_required` before the handler runs. A reviewer who will not say
why they are opening a national ID does not get to open it (R-1103, D-03).

**New action ids, not I-04's three.** `verification.list`,
`verification.decide` and `verification.read_document` already exist in
`audit_log` against the legacy `kyc_document` resource. Reusing them would
make a row mean one thing before this release and another after it, with
nothing in the row to say which. The legacy three still guard the legacy
`/api/admin/kyc*` surfaces.

**The separation-of-duties gap is counted, not claimed away.** At Gate 1 one
person holds every platform role, so the same human can be a case's subject
and its reviewer. Every decision policy carries `sameActor`, the kernel marks
the decision `sod_bypass`, and migration 008's `idx_sod` makes "how often" one
query. This is **not** separation of duties and is not represented as such.

---

## 6. Eligibility

`TRUST-ARCHITECTURE.md` §5, transcribed:

```
listable = identity_verified ∧ ≥1 capability ∧ ≥1 coverage area
         ∧ ≥1 price ∧ not suspended ∧ approved by a human reviewer
```

`evaluateEligibility` returns **every clause and its verdict**, not a boolean,
because an operator asking "why is this provider not showing up" needs the
answer and a support agent guessing is how a provider gets told the wrong
thing. `GET /api/providers/:id/eligibility` is that answer, and the subject
may ask about themselves.

| Clause | Source | Real or stand-in |
|---|---|---|
| `identity_verified` | `verification_case` (state + expiry) | real |
| `has_capability` | `providers.service_type_*` | **stand-in** — `ProviderCapability` is I-09 |
| `has_coverage` | `providers.area_*` | **stand-in** — the area hierarchy is I-10 and an owner decision |
| `has_price` | `providers.hourly_rate` | real |
| `not_suspended` | `listing_state` + `users.is_active` | real |
| `human_approved` | `listing_state` | real |

The two stand-ins carry `approximate: true` and a `gap` string, and the API
returns an `approximated` list. **§19 is explicit that a verified identity is
not a qualified electrician**; nothing here reads "has_capability: ok" as
"verified electrician", and the surface that reports it says so.

`is_approved` survives as a **compatibility mirror**, written in the same
UPDATE as `listing_state` so the two cannot disagree. No policy, no filter and
no domain rule reads it — a test asserts that a candidate carrying
`isApproved: true` with `listingState: "applied"` is not offerable.

---

## 7. Migrations

### 011 — REVERSIBLE

Creates `verification_case` and `identity_document`, adds
`providers.listing_state`, and **migrates the whole legacy backlog into one
queue**.

Two queues or one is the whole question. Two means a reviewer has to know
which screen a person's evidence is on, `users.kyc_status` has two writers,
and the first decision on either side puts them permanently out of step. So
every `kyc_docs` row becomes a case, keyed by the **same id**, so an existing
client's link keeps working.

| `kyc_docs.status` | `verification_case.state` |
|---|---|
| `pending` | `submitted` — not `under_review`: nothing in the old table records a reviewer having picked the case up, and claiming otherwise would put work in progress that nobody is doing |
| `verified` | `verified` |
| `rejected` | `rejected` |

A legacy rejection with no recorded reason gets `[migrated] the legacy
kyc_docs row recorded no reason`. **R-1103 starts here and cannot be applied
retroactively** — the marker states the absence rather than fabricating a
reason a reviewer never gave.

Only the newest submission per person becomes the case (`uniq_open_case`
allows one). Older `kyc_docs` rows are left in place, unreferenced — the
migration does not delete history it merely stopped pointing at.

`providers` rows with `is_approved = 1` become `listing_state = 'approved'`,
carrying migration 002's grandfathering forward so **no provider is de-listed
by a structural change**.

**Not here:** M-14's byte copy out of `kyc_docs`. It needs production data,
and `DATABASE-IMPLEMENTATION-PLAN.md` separates it from M-15 (nulling the
source columns, IRREVERSIBLE) by a full release cycle so an object-storage
misconfiguration is found while the original still exists.

### 012 — REVERSIBLE

Closes a hole in migration 009. See §10.

### Retention

**None is implemented and none is invented.** How long an identity document
may be kept after a decision is a legal question for Bangladesh with an owner.
`identity_document.deleted_at` and `idx_case` make a retention job one range
scan when the answer exists. `listRetiredObjectKeys` is the seam.

---

## 8. Deployment: a business impact that must be measured first

**The public directory filter changed and this de-lists providers.**

```sql
-- before
WHERE p.is_approved = 1 AND u.is_active = 1 AND p.is_available = 1
-- after
WHERE p.listing_state = 'approved' AND u.is_active = 1 AND p.is_available = 1
  AND EXISTS (SELECT 1 FROM verification_case v
               WHERE v.principal_id = p.user_id AND v.kind = 'identity'
                 AND v.state = 'verified'
                 AND (v.expires_at IS NULL OR v.expires_at > NOW()))
```

A provider carrying `is_approved = 1` from migration 002's grandfathering but
no verified identity case stops appearing. That is TRUST §5's rule and P1-7's
precedent — the homepage says "KYC-verified providers", and listing unverified
ones under that copy is the defect.

**The count has not been measured, because measuring it means querying
production and production is untouched by this phase.** Run this before
deploying:

```sql
SELECT
  SUM(is_approved = 1) AS listed_today,
  SUM(is_approved = 1 AND NOT EXISTS (
        SELECT 1 FROM verification_case v
         WHERE v.principal_id = providers.user_id
           AND v.kind = 'identity' AND v.state = 'verified')) AS would_be_delisted
FROM providers;
```

Run it **after** migration 011 so the backfill has created the cases. If
`would_be_delisted` is material, the owner decides the sequencing — a
verification drive before the filter flips is a legitimate answer, and it is
their call, not this phase's.

`GET /api/providers/:id/eligibility` answers "why did X disappear" for any
individual case.

---

## 9. API

### New — `/api/verification`

| Method | Path | Use case |
|---|---|---|
| `POST` | `/identity` | `SubmitIdentityVerification` |
| `GET` | `/me` | `ReadOwnVerification` |
| `GET` | `/queue?state=&kind=` | `ListVerificationQueue` |
| `GET` | `/cases/:id` | `ReadVerificationCase` — audited |
| `GET` | `/documents/:id` | `GetIdentityDocumentUrl` — audited, `X-Reason` required |
| `GET` | `/cases/:id/legacy/:docType` | `GetLegacyDocumentImage` — audited, `X-Reason` required |
| `POST` | `/cases/:id/review` | `StartVerificationReview` |
| `POST` | `/cases/:id/approve` | `ApproveVerification` |
| `POST` | `/cases/:id/reject` | `RejectVerification` |
| `POST` | `/cases/:id/request-info` | `RequestVerificationInfo` |
| `POST` | `/cases/:id/revoke` | `RevokeVerification` |

### New — `/api/providers`

| Method | Path | Use case |
|---|---|---|
| `POST` | `/:id/approve` | `ApproveProviderListing` — **F-12** |
| `POST` | `/:id/reject` | `RejectProviderListing` |
| `POST` | `/:id/suspend` | `SuspendProviderListing` |
| `GET` | `/:id/eligibility` | `ReadListingEligibility` |

**There is no `PATCH` taking a target state in a body.** Five verb-named
routes, five actions, five policies (§12, §21).

### Compatibility

| Endpoint | Contract | Behaviour |
|---|---|---|
| `POST /api/kyc` | unchanged body, unchanged `{id, status}` response (plus `state`) | bytes now go to object storage; `doc_type`/`doc_number` accepted, validated, **not stored** |
| `GET /api/kyc` | still an array of legacy-shaped rows | derived from the case; at most one element |
| `PATCH /api/kyc/:id` | unchanged | delegates to the use cases |
| `PATCH /api/admin/kyc/:id` | unchanged | delegates; keeps its I-04 middleware, so **both** grants are required |
| `GET /api/admin/kyc`, `GET /api/admin/kyc/:id` | unchanged | legacy READ surfaces over `kyc_docs`, for the backlog |

**Two deliberate breaks, both narrowing:**

1. `PATCH /api/kyc/:id` and `/api/admin/kyc/:id` no longer accept
   `status: "pending"`. It was a decision that undid a decision with no record
   of why, and §9 has no reviewer edge back to `submitted` — the **subject**
   resubmits. Callers get a 400 rather than a silent state rewrite.
2. `doc_type` and `doc_number` are no longer stored for new submissions.
   Neither has a field on the authoritative `verification_case` in
   `ENTITY-IMPLEMENTATION-MAP.md`, a reviewer reads both off the image, and
   §16 asks for data minimisation rather than a second copy of a national ID
   number. Historical `kyc_docs.doc_number` values are untouched — removing
   them is M-15's, and it is irreversible.

**One behaviour deliberately not reproduced.** The old handler ran
`providers.trust_score = LEAST(trust_score + 30, 100)` on every approval, so
approve → revoke → approve added 60 for one verified identity. A score that
ratchets upward on repeated review is not a measurement. Trust score is left
untouched by verification until `TRUST-ARCHITECTURE.md` §4's formula is
implemented, which is not this phase.

---

## 10. Two defects found while testing

### A CHECK constraint rejects only FALSE, and NULL is not FALSE

Migration 011's first draft, and migration 009's `chk_active_slot`, both read:

```sql
CHECK ((a IS NULL AND slot = '1') OR (a IS NOT NULL AND slot IS NULL))
```

For a row with `a IS NULL` and `slot IS NULL`: `(TRUE AND NULL) OR (FALSE AND
TRUE)` → `NULL OR FALSE` → **NULL → accepted**. The one shape the constraint
existed to prevent was the one shape it let through — and because the
accompanying UNIQUE index includes the slot, NULLs do not collide, so *that*
did not catch it either.

For `identity_document`: two LIVE front-of-ID images on one case, with no way
to know which the reviewer was shown. For `otp_challenge`: an `active`
challenge with no slot, which is F-9 (two live OTPs for one destination)
reachable through a different door. Nothing writes that shape today —
`otpRepository` always sets both together — so the hole was latent.

Fixed with `<=>`, which is null-safe: `NULL <=> '1'` is FALSE, so the
constraint rejects. Verified by probe on MariaDB 12.2.2, including that
MariaDB accepts `<=>` inside a CHECK at all. 011 corrected in place (never
applied to a persistent database); 009 gets forward-only **migration 012**,
whose data repair **expires** any violating challenge rather than back-filling
a slot that could collide with a genuinely active one.

### `reason_required` answered 422 through middleware and 403 through a use case

`toHttpStatus` has mapped `DENY.REASON_REQUIRED` to 422 since I-04.
`denialToError` in I-06's executor did not, so the same policy denying the
same actor produced a different status depending on which door the request
came through. 403 says "you may not"; the truth is "you may, once you say
why", and a client cannot tell those apart. Fixed in
`src/application/execute.js`.

### One tooling note for the next person

`err.code` is not usable for MariaDB constraint failures. mysql2 maps errno
through **MySQL's** table, and MariaDB's 4025 is "CONSTRAINT failed" where
MySQL's 4025 is `ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE` — so a CHECK
violation arrives under a name about tablespace sizing. Match on the message.

---

## 11. Verification

### Tests

**665 passing, none skipped** — 593 historical, 72 new (52 unit, 20
integration). Boundary checker: **0 errors**.

The integration tests do not read DDL. Every schema invariant is asserted by
trying to violate it and watching the database refuse.

### Negative controls — 17 of 17 detected

Each lever applied, the named test run, the failure observed, the file
restored and verified byte-identical by SHA-256.

| # | Lever | Test that fails |
|---|---|---|
| NC-1 | `assertTransition` falls back to allowing any edge | an edge the machine does not have is refused |
| NC-2 | `REASON_REQUIRED_INTO` emptied | a refusal without a reason is refused |
| NC-3 | `assertSealedBucketIsNotPublic` throw disabled | a bucket that serves unauthenticated reads is refused |
| NC-4 | `sniffMime` stops comparing bytes to the claim | a declared type is checked against the bytes |
| NC-5 | `identity_verified` clause always true | each clause can fail on its own |
| NC-6 | `assertApprovable` throw disabled | a listing cannot be approved before the identity is verified |
| NC-7 | `operations` added to the document policy | only trust_safety may open an identity document |
| NC-8 | `reasonRequired: false` on the document policy | opening a document requires a stated reason, as a DENIAL |
| NC-9 | `ReadVerificationCase` drops `audit`/`auditedRead` | V-07: reading Sealed data is audited |
| NC-10 | decision policies widened to the subject **and** `platformScoped` removed | the subject cannot decide their own case |
| NC-11 | `denialToError`'s 422 mapping removed | a rejection with no reason is refused, at two layers |
| NC-12 | `isOfferable` reads availability only | D-005 offerability |
| NC-13 | the directory filter reverts to `is_approved = 1` | the public scope filters on approval |
| NC-14 | `chk_reason_when_refused` removed | the DATABASE refuses a refusal with no reason |
| NC-15 | `uniq_open_case` weakened to a plain index | one open case per person per kind |
| NC-16 | `chk_live_slot` uses `=` instead of `<=>` | the live marker and the deletion cannot drift apart |
| NC-17 | migration 012 uses `=` instead of `<=>` | an active OTP challenge cannot hold a NULL active slot |

**NC-10 is the one worth reading.** Its first version widened only the `roles`
list and **the test kept passing** — `R.platformScoped` was refusing the
subject regardless. Reported as detected, it would have been a vacuous control
claiming the roles list guards something it does not guard alone. §34 requires
the lever to remove every independent layer, so it now removes both, and the
test fails.

The same rule applies to NC-11 and NC-16, where two layers exist by design:
a rejection with no reason is refused by the policy *and* by the domain, and
a live-slot violation by the CHECK *and* by the unique index. The tests say so
in their names.

### Environment

```
$ node -e "require('./db')"
EnvironmentSafetyError: Refusing to start.
  process environment : development  (APP_ENV / NODE_ENV)
  database class      : production
```

**Production is untouched.** `backend/.env` is unmodified. No migration has
been run against production; no cutover has been performed.

### Disposable database

MariaDB 12.2.2, own datadir (`%TEMP%\claude\imap-i07-disposable\data`), port
**3399**, own root credential, own database per test suite, loopback only —
the integration suite refuses a non-loopback host. Shut down and the datadir
destroyed after use; the machine's own MariaDB service was verified running
and untouched before and after.

### TiDB — **VERIFICATION BLOCKED**

No TiDB instance was reachable in this environment. Migrations 011 and 012 are
verified on **MariaDB 12.2.2 only**. MariaDB verification is not substituted
for TiDB verification.

Specifically unverified on TiDB:

- whether `CHECK` constraints are enforced (`chk_reason_when_refused`,
  `chk_live_slot`, `chk_active_slot`) — TiDB historically parsed and ignored
  them. Where they are not enforced, the repository and the domain remain the
  primary controls and these are defence in depth
- whether `<=>` is accepted inside a `CHECK`
- the plan chosen for `idx_queue` and for the eligibility `EXISTS`
- `ALTER TABLE … DROP CONSTRAINT` in migration 012

---

## 12. What I-07 deliberately did not do

- **No AI.** No document classifier, no OCR, no fraud score, no autonomous or
  suggested approval, no agent tool. Every decision is Tier C and a human
  makes it. A test walks the identity and storage trees asserting no AI client
  import and no `autoApprove`/`classifyDocument`/`ocr(` call.
- **No booking, payment, realtime or ledger work.**
- **No capability verification surface.** `kind = 'capability'` exists in the
  enum because `ENTITY-IMPLEMENTATION-MAP.md` defines it; no use case creates
  one. §19: skill certification is deferred and **no fake certificate is
  issued**.
- **No retention period**, no statutory claim, no compliance claim.
- **No frontend migration.** `App.jsx` is untouched (I-06 §27).
- **No production migration or cutover.**
- **No invented business decision** — the KYC document set, the review SLA,
  the verification validity period, the de-listing sequencing and the GATE-1
  §5 vocabulary ruling are all owner decisions and all recorded as open.

---

## 13. Findings

| # | Finding | Owner |
|---|---|---|
| **F-12** | **CLOSED.** `marketplace.ApproveProviderListing` is the approval path, requiring a verified identity case | — |
| **F-26** | The sealed bucket's public-access configuration cannot be verified from this process. The code refuses the provably-unsafe shape and records the rest as an operator prerequisite (§4) | ops |
| **F-27** | M-14's byte copy out of `kyc_docs` has not run. Migrated cases are reviewed through `GetLegacyDocumentImage`, which returns base64 through the API — the shape the old architecture left behind | I-08+ |
| **F-28** | `GATE-1-ARCHITECTURE.md` §5 and `STATE-MACHINES.md` §9 give different names for the verification states. §9 is followed; a ruling is needed if §5 is normative (§3) | owner |
| **F-29** | The de-listing impact of the new directory filter is unmeasured, because measuring it means querying production. The query and the decision are in §8 | owner |
| **F-30** | `kyc_docs.doc_number` still holds national ID numbers in clear for historical rows. New submissions store none. Removal is M-15, which is irreversible | owner |
| **F-31** | `routes/admin.js` still holds `GET /api/admin/kyc` and `/kyc/:id` as legacy read surfaces with direct SQL. They clear when M-14/M-15 retire `kyc_docs` | I-08+ |
| **F-32** | Migration 012 repairs `otp_challenge` rows that violate the corrected constraint by expiring them. If the pre-check count is non-trivial, OTP single-use was relying on the repository alone and that deserves review before running it | ops |
| **F-33** | `openapi/imap.v1.yaml` does not describe I-07's 15 operations. Its `servers` block declares `/api/v1`, which is not mounted — the live surface is `/api`. Documenting these paths under `/api/v1` would be a contract for endpoints nothing serves, which is a worse defect than an honest gap. The spec should gain them in the same change that mounts `/api/v1` (API-CONTRACT-BLUEPRINT §6.1). The endpoint tables in §9 above are the interim contract | I-08+ |
| **F-21**–**F-25**, **F-16**–**F-20** | carried unchanged from I-04, I-05 and I-06 | — |
