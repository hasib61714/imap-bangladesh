/**
 * I-07 — trusted provider, KYC and the verification lifecycle
 *
 * §33's list, and §34's rule about negative controls: where a property is
 * protected by more than one independent layer, the lever removes ALL of
 * them, because a control that another layer would have caught anyway proves
 * nothing about the control under test.
 *
 * The levers are named in comments above each block. Every one was reverted,
 * the failure observed, and the file restored — the evidence is in
 * I-07-PROVIDER-VERIFICATION.md §11.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makePool, installFakeDb, resetModules, serve, call, asUser } = require("./helpers/harness");

process.env.APP_ENV = process.env.APP_ENV || "test";
process.env.DATABASE_ENV = process.env.DATABASE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const V = require("../src/modules/identity/domain/verificationCase");
const L = require("../src/modules/marketplace/domain/listingEligibility");
const store = require("../src/modules/platform/storage/sealedDocumentStore");

const BACKEND = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(BACKEND, rel), "utf8");

/**
 * The file with its comments removed.
 *
 * Every scan below is looking for what the code DOES, and these files
 * deliberately quote the SQL they no longer issue — `routes/kyc.js` says
 * "this is NOT `UPDATE verification_case SET state = ?`" precisely so a
 * reader knows it was considered. A scanner that cannot tell a prohibition
 * from an occurrence would force those explanations out of the codebase.
 */
const readCode = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** `assert.throws` matches the MESSAGE; an AppError's contract is its `code`. */
const throwsCode = (code) => (err) => {
  assert.equal(err.code, code, `expected code ${code}, got ${err.code}`);
  return true;
};

const SUBJECT = { id: "u-subject", name: "Karim", role: "customer", is_active: 1 };
const REVIEWER = { id: "u-ops", name: "Ops", role: "admin", is_active: 1 };
const NOW = new Date("2026-08-09T12:00:00Z");

// ════════════════════════════════════════════════════════════
//  §5, §8 — the state model is the architecture's, not a new one
// ════════════════════════════════════════════════════════════
test("§5, §8 the verification states are STATE-MACHINES §9's", async (t) => {
  await t.test("every state in the machine is one the document names", () => {
    // Transcribed from `docs/architecture/STATE-MACHINES.md` §9. If this list
    // and the document ever disagree, one of them invented a state.
    assert.deepEqual(Object.values(V.STATE).sort(), [
      "expired", "more_info", "not_submitted", "rejected",
      "revoked", "submitted", "under_review", "verified",
    ]);
  });

  await t.test("the brief's candidate names map onto the machine rather than adding to it", () => {
    // §8: "Do not add these states blindly. First compare against the
    // authoritative state machine."
    const MAPPING = {
      PENDING_REVIEW: V.STATE.SUBMITTED,
      CHANGES_REQUESTED: V.STATE.MORE_INFO,
      SUSPENDED: V.STATE.REVOKED,
      APPROVED: V.STATE.VERIFIED,
    };
    for (const [candidate, actual] of Object.entries(MAPPING)) {
      assert.ok(V.STORED_STATES.includes(actual), `${candidate} has no home in the machine`);
    }
  });

  await t.test("`not_submitted` is derived, never stored", () => {
    assert.equal(V.STORED_STATES.includes(V.STATE.NOT_SUBMITTED), false);
    assert.equal(V.stateOf(null), V.STATE.NOT_SUBMITTED);
    // The column enum in the migration must agree with the domain's list.
    const sql = read("migrations/011_verification.sql");
    const enumLine = sql.match(/state\s+ENUM\(([^)]+)\)/)[1];
    const columnStates = enumLine.split(",").map((s) => s.trim().replace(/'/g, ""));
    assert.deepEqual(columnStates.sort(), [...V.STORED_STATES].sort(),
      "the column and the domain must not disagree about what a row may hold");
  });

  // NEGATIVE CONTROL: make `assertTransition` return instead of throwing on an
  // unknown edge and every one of these passes.
  await t.test("an edge the machine does not have is refused", () => {
    for (const [from, to] of [
      ["submitted", "verified"],      // the jump the old endpoint made
      ["not_submitted", "verified"],
      ["rejected", "verified"],
      ["verified", "verified"],
      ["revoked", "verified"],
    ]) {
      assert.throws(() => V.assertTransition(from, to, "trust_safety"),
        /cannot move from/, `${from} → ${to} was permitted`);
    }
  });

  await t.test("an edge that exists is refused to the wrong actor", () => {
    // The subject may resubmit; the subject may not approve.
    assert.doesNotThrow(() => V.assertTransition("rejected", "submitted", "subject"));
    assert.throws(() => V.assertTransition("under_review", "verified", "subject"),
      /may not move/);
    assert.throws(() => V.assertTransition("rejected", "submitted", "trust_safety"),
      /may not move/, "a reviewer does not resubmit on somebody's behalf");
  });

  // NEGATIVE CONTROL: delete REJECTED and REVOKED from REASON_REQUIRED_INTO
  // and both of these pass — R-1103 gone, and a refusal nobody can appeal.
  await t.test("a refusal without a reason is refused", () => {
    for (const to of [V.STATE.REJECTED, V.STATE.REVOKED, V.STATE.MORE_INFO]) {
      assert.throws(() => V.requireReason(to, ""), /requires a stated reason/);
      assert.throws(() => V.requireReason(to, "   "), /requires a stated reason/);
      assert.throws(() => V.requireReason(to, "too short"), /requires a stated reason/);
    }
    assert.equal(V.requireReason(V.STATE.VERIFIED, null), null, "an approval needs no excuse");
  });

  await t.test("expiry is checked, not trusted", () => {
    const base = { kind: "identity", state: "verified", expires_at: null };
    assert.equal(V.grantsIdentityVerified(base, NOW), true);
    assert.equal(V.grantsIdentityVerified({ ...base, expires_at: "2026-01-01T00:00:00Z" }, NOW), false,
      "a case that expired before anything ran to mark it expired grants nothing");
    assert.equal(V.grantsIdentityVerified({ ...base, expires_at: "2027-01-01T00:00:00Z" }, NOW), true);
    assert.equal(V.grantsIdentityVerified({ ...base, kind: "capability" }, NOW), false,
      "a capability case is not an identity case");
    assert.equal(V.grantsIdentityVerified(null, NOW), false);
  });

  await t.test("the subject is told the decision and never the decider", () => {
    const view = V.toSubjectView({
      state: "rejected", kind: "identity", submitted_at: "x", decided_at: "y",
      decision_reason: "the photo is unreadable", decided_by: "u-ops", expires_at: null,
    }, NOW);
    assert.equal(view.reason, "the photo is unreadable");
    assert.equal(Object.prototype.hasOwnProperty.call(view, "decidedBy"), false,
      "R-406 gives the subject a decision they can act on, not a name to pursue");
  });
});

// ════════════════════════════════════════════════════════════
//  §14, §32 — the storage boundary
// ════════════════════════════════════════════════════════════
test("§14, §32 identity documents are not public and cannot become public", async (t) => {
  const env = { ...process.env };
  t.afterEach(() => { process.env = { ...env }; });

  // NEGATIVE CONTROL: delete `assertSealedBucketIsNotPublic`'s throw and this
  // passes — every identity document then sits behind a permanent
  // unauthenticated URL derived from R2_PUBLIC_URL.
  await t.test("a bucket that serves unauthenticated reads is refused, not used", () => {
    process.env.R2_PUBLIC_URL = "https://pub-abc.r2.dev";
    delete process.env.R2_SEALED_BUCKET;
    delete process.env.S3_SEALED_BUCKET;
    assert.throws(() => store.assertSealedBucketIsNotPublic(), throwsCode("SEALED_STORAGE_MISCONFIGURED"));

    process.env.R2_SEALED_BUCKET = "imap-sealed";
    assert.doesNotThrow(() => store.assertSealedBucketIsNotPublic(),
      "a dedicated bucket is the configuration this is asking for");
  });

  await t.test("an unconfigured store fails closed rather than pretending", async () => {
    for (const key of ["R2_ACCOUNT_ID", "AWS_ACCESS_KEY_ID", "R2_PUBLIC_URL",
                       "R2_SEALED_BUCKET", "S3_SEALED_BUCKET", "R2_BUCKET_NAME",
                       "R2_BUCKET", "S3_BUCKET_NAME", "AWS_S3_BUCKET"]) {
      delete process.env[key];
    }
    assert.deepEqual(store.capability(), { available: false, reason: "no_credentials" });
    await assert.rejects(() => store.putSealed({ caseId: "c", docType: "id_front", buffer: Buffer.from("x"), mime: "image/jpeg" }),
      (err) => { assert.equal(err.code, "SEALED_STORAGE_UNAVAILABLE"); assert.equal(err.status, 503); return true; });
    // P0-12's rule: a capability the platform cannot provide is a 503 and
    // never a mock success.
    await assert.rejects(() => store.signedReadUrl("sealed/x"), throwsCode("SEALED_STORAGE_UNAVAILABLE"));
  });

  await t.test("an object key names no person", () => {
    const key = store.buildObjectKey({ caseId: "case-7", docType: "id_front", mime: "image/jpeg" });
    assert.match(key, /^sealed\/verification\/case-7\/id_front-[0-9a-f]{32}\.jpg$/);
    assert.equal(key.includes(SUBJECT.id), false, "a key must not carry a user id");
  });

  // NEGATIVE CONTROL: return `declared` from sniffMime without comparing and
  // the second of these passes — an HTML file stored as image/jpeg, which is
  // how a storage bucket becomes a phishing host.
  await t.test("a declared type is checked against the bytes", () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(20)]);
    assert.equal(store.sniffMime(jpeg, "image/jpeg"), "image/jpeg");
    assert.throws(() => store.sniffMime(Buffer.from("<html>not an image at all</html>"), "image/jpeg"),
      /does not match its declared type/);
    assert.throws(() => store.sniffMime(jpeg, "text/html"), /unsupported document type/);
    assert.throws(() => store.requireDetectedMime(Buffer.from("<html>hello there</html>")),
      /not a JPEG, PNG, WebP or PDF/);
  });

  await t.test("a payload that is not base64 is not a document", () => {
    assert.throws(() => store.decodeDocument(""), /is required/);
    assert.throws(() => store.decodeDocument("!!!! not base64 !!!!"), /not valid base64/);
    const big = "A".repeat(Math.ceil((store.MAX_DOCUMENT_BYTES / 3) * 4) + 64);
    assert.throws(() => store.decodeDocument(big), /exceeds/);
    // The data-URI prefix the current client sends is stripped, not rejected.
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(9)]);
    const decoded = store.decodeDocument(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
    assert.deepEqual(decoded, jpeg);
  });

  await t.test("the write path cannot return a URL", () => {
    const src = read("src/modules/platform/storage/sealedDocumentStore.js");
    const put = src.slice(src.indexOf("async function putSealed"), src.indexOf("async function signedReadUrl"));
    assert.equal(/R2_PUBLIC_URL|publicBase|https?:\/\//.test(put), false,
      "a caller that cannot obtain a URL from a write cannot store one");
  });

  await t.test("identity_document has no column a byte could go in", () => {
    const sql = read("migrations/011_verification.sql");
    const table = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS identity_document"),
                            sql.indexOf("providers.listing_state"));
    assert.equal(/LONGTEXT|BLOB|MEDIUMTEXT|TEXT/.test(table), false,
      "AD-011: the reference lives in the database and the bytes do not");
  });
});

// ════════════════════════════════════════════════════════════
//  §9, §18 — eligibility
// ════════════════════════════════════════════════════════════
test("§9, §18 listing eligibility is TRUST §5's conjunction", async (t) => {
  const eligible = {
    identityVerified: true, listingState: L.LISTING.APPROVED, accountActive: true,
    serviceType: "Electrician", area: "Mirpur", hourlyRate: 450,
  };

  await t.test("all six clauses are evaluated and named", () => {
    const r = L.evaluateEligibility(eligible);
    assert.equal(r.listable, true);
    assert.deepEqual(r.clauses.map((c) => c.clause), [
      "identity_verified", "has_capability", "has_coverage",
      "has_price", "not_suspended", "human_approved",
    ]);
  });

  // NEGATIVE CONTROL: each of these needs its own clause removed from
  // `evaluateEligibility` to pass. There is no single lever, because there is
  // no single clause — that is the point of a conjunction.
  await t.test("each clause can fail on its own, and says so", () => {
    const cases = [
      [{ identityVerified: false }, "identity_verified"],
      [{ serviceType: "  " }, "has_capability"],
      [{ area: null }, "has_coverage"],
      [{ hourlyRate: 0 }, "has_price"],
      [{ accountActive: false }, "not_suspended"],
      [{ listingState: L.LISTING.SUSPENDED }, "not_suspended"],
      [{ listingState: L.LISTING.APPLIED }, "human_approved"],
    ];
    for (const [over, clause] of cases) {
      const r = L.evaluateEligibility({ ...eligible, ...over });
      assert.equal(r.listable, false, `${clause} did not block listing`);
      assert.ok(r.failing.includes(clause), `expected ${clause} in ${r.failing.join(",")}`);
    }
  });

  await t.test("a Gate-1 stand-in is reported as a stand-in", () => {
    const r = L.evaluateEligibility(eligible);
    assert.deepEqual([...r.approximated].sort(), ["has_capability", "has_coverage"]);
    // §19: a verified identity is not a qualified electrician, and nothing
    // here may read as if it were.
    const capability = r.clauses.find((c) => c.clause === "has_capability");
    assert.equal(capability.approximate, true);
    assert.match(capability.gap, /I-09/);
  });

  // NEGATIVE CONTROL: delete `assertApprovable`'s throw and this passes — a
  // provider becomes listable with no identity evidence at all.
  await t.test("a listing cannot be approved before the identity is verified", () => {
    assert.throws(() => L.assertApprovable({ identityVerified: false }),
      throwsCode("LISTING_REQUIRES_VERIFIED_IDENTITY"));
    assert.throws(() => L.assertApprovable({ identityVerified: undefined }),
      throwsCode("LISTING_REQUIRES_VERIFIED_IDENTITY"));
    assert.doesNotThrow(() => L.assertApprovable({ identityVerified: true }));
  });

  await t.test("the listing transitions are guarded the same way the case's are", () => {
    assert.throws(() => L.assertListingTransition(L.LISTING.APPLIED, L.LISTING.SUSPENDED, "trust_safety"),
      /cannot move from/, "you cannot suspend somebody who was never approved");
    assert.throws(() => L.assertListingTransition(L.LISTING.APPROVED, L.LISTING.APPLIED, "trust_safety"),
      /cannot move from/);
    assert.throws(() => L.assertListingTransition(L.LISTING.APPROVED, L.LISTING.SUSPENDED, "subject"),
      /may not move/, "a provider does not suspend or unsuspend themselves");
    assert.doesNotThrow(() => L.assertListingTransition(L.LISTING.REJECTED, L.LISTING.APPLIED, "subject"));
    assert.throws(() => L.requireListingReason(L.LISTING.SUSPENDED, "no"), /requires a stated reason/);
  });

  await t.test("every listing_state the enum allows is reachable", () => {
    const sql = read("migrations/011_verification.sql");
    const enumLine = sql.match(/listing_state ENUM\(([^)]+)\)/)[1];
    const columnStates = enumLine.split(",").map((s) => s.trim().replace(/'/g, "")).sort();
    assert.deepEqual(columnStates, Object.values(L.LISTING).sort());

    const reachable = new Set([L.LISTING.APPLIED]);   // the column default
    for (const targets of Object.values(L.LISTING_TRANSITIONS)) {
      for (const to of Object.keys(targets)) reachable.add(to);
    }
    assert.deepEqual([...reachable].sort(), columnStates,
      "an enum value nothing can produce is a claim the schema makes and the code cannot keep");
  });
});

// ════════════════════════════════════════════════════════════
//  §20, §21 — the register
// ════════════════════════════════════════════════════════════
test("§20, §21 who may do what is in the register and nowhere else", async (t) => {
  resetModules();
  installFakeDb(makePool([{ match: "SELECT", rows: [] }]));
  require("../src/composition/modules").composeModules();
  const platform = require("../src/modules/platform");
  const { ACTION } = require("../src/modules/identity/actions");
  const M = require("../src/modules/marketplace/actions").ACTION;
  const policy = (a) => platform.authorization.getPolicy(a);

  await t.test("every I-07 action has exactly one policy", () => {
    for (const action of [...Object.values(ACTION), M.PROVIDER_APPROVE_LISTING,
                          M.PROVIDER_REJECT_LISTING, M.PROVIDER_SUSPEND_LISTING,
                          M.PROVIDER_READ_ELIGIBILITY]) {
      assert.ok(policy(action), `${action} has no policy`);
      assert.ok(policy(action).resource, `${action} names no resource`);
    }
  });

  // NEGATIVE CONTROL: add SUPPORT, OPERATIONS or PLATFORM_OWNER to the
  // `roles` list on either document policy and this fails.
  await t.test("only trust_safety may open an identity document", () => {
    for (const action of [ACTION.DOCUMENT_READ, ACTION.DOCUMENT_READ_LEGACY]) {
      assert.deepEqual(policy(action).roles, ["trust_safety"],
        `${action} is readable by more than the one role I-04 §6 allows`);
    }
    // The queue is wider on purpose, and carries no evidence.
    assert.deepEqual([...policy(ACTION.VERIFICATION_LIST).roles].sort(), ["operations", "trust_safety"]);
    assert.equal(policy(ACTION.VERIFICATION_LIST).scope().documents, false);
  });

  // NEGATIVE CONTROL: set `reasonRequired: false` on either and this fails —
  // D-03's "every access is logged with reason" becomes "logged".
  await t.test("opening a document requires a stated reason, as a DENIAL", () => {
    assert.equal(policy(ACTION.DOCUMENT_READ).reasonRequired, true);
    assert.equal(policy(ACTION.DOCUMENT_READ_LEGACY).reasonRequired, true);
    // …and so does every refusal.
    for (const action of [ACTION.VERIFICATION_REJECT, ACTION.VERIFICATION_REVOKE,
                          ACTION.VERIFICATION_REQUEST_INFO, M.PROVIDER_REJECT_LISTING,
                          M.PROVIDER_SUSPEND_LISTING]) {
      assert.equal(policy(action).reasonRequired, true, `${action} may refuse without a reason`);
    }
  });

  // NEGATIVE CONTROL: change `audit` to "none" on either read policy and
  // this fails; `useCase.js` additionally refuses the query unless
  // `auditedRead` is set, so BOTH have to go for a Sealed read to go
  // unrecorded.
  await t.test("V-07: reading Sealed data is audited even though it changes nothing", () => {
    const registry = require("../src/application/registry");
    for (const [action, name] of [
      [ACTION.VERIFICATION_READ, "identity.ReadVerificationCase"],
      [ACTION.DOCUMENT_READ, "identity.GetIdentityDocumentUrl"],
      [ACTION.DOCUMENT_READ_LEGACY, "identity.GetLegacyDocumentImage"],
    ]) {
      assert.equal(policy(action).audit, "required", `${action} is an unaudited Sealed read`);
      const useCase = registry.getUseCase(name);
      assert.equal(useCase.kind, "query");
      assert.equal(useCase.audit, "required");
      assert.equal(useCase.auditedRead, true, `${name} lost its V-07 opt-in`);
    }
  });

  await t.test("every decision is Tier C and carries the SOD marker", () => {
    for (const action of [ACTION.VERIFICATION_APPROVE, ACTION.VERIFICATION_REJECT,
                          ACTION.VERIFICATION_REVOKE, ACTION.VERIFICATION_REQUEST_INFO,
                          ACTION.VERIFICATION_START_REVIEW]) {
      const p = policy(action);
      assert.equal(p.tier, "C", `${action} is not Tier C`);
      assert.equal(p.audit, "required");
      assert.equal(typeof p.sameActor, "function",
        `${action} would let somebody decide their own case without it being counted`);
    }
  });

  await t.test("a provider does not decide their own listing", () => {
    for (const action of [M.PROVIDER_APPROVE_LISTING, M.PROVIDER_REJECT_LISTING, M.PROVIDER_SUSPEND_LISTING]) {
      const p = policy(action);
      assert.equal(p.roles.includes("provider"), false, `${action} is grantable to a provider`);
      assert.equal(p.roles.includes("customer"), false);
      assert.equal(p.tier, "C");
      assert.equal(typeof p.sameActor, "function");
    }
  });
});

// ════════════════════════════════════════════════════════════
//  §21 — no opaque status write anywhere
// ════════════════════════════════════════════════════════════
test("§21 verification state is written in one place", async (t) => {
  const FILES = [
    "routes/kyc.js", "routes/admin.js", "routes/users.js",
    "src/modules/identity/transport/routes.js",
    "src/modules/marketplace/transport/routes.js",
  ];

  await t.test("no route issues an UPDATE against verification_case", () => {
    for (const file of FILES) {
      const src = readCode(file);
      assert.equal(/UPDATE\s+verification_case/i.test(src), false,
        `${file} writes verification state directly`);
      assert.equal(/UPDATE\s+identity_document/i.test(src), false, `${file} writes document state directly`);
    }
  });

  await t.test("no route flips providers.listing_state or is_approved", () => {
    for (const file of FILES) {
      const src = readCode(file);
      assert.equal(/UPDATE\s+providers\s+SET[^;]*\b(listing_state|is_approved)\b/i.test(src), false,
        `${file} grants listing eligibility directly`);
    }
  });

  await t.test("the transport offers verb-named transitions, not a status body", () => {
    const src = readCode("src/modules/identity/transport/routes.js");
    for (const verb of ["/cases/:id/review", "/cases/:id/approve", "/cases/:id/reject",
                        "/cases/:id/request-info", "/cases/:id/revoke"]) {
      assert.ok(src.includes(verb), `${verb} is missing`);
    }
    assert.equal(/router\.patch\(/.test(src), false,
      "an opaque PATCH with a target state in the body is what §12 forbids");
  });

  await t.test("the legacy KYC routes hold no verification SQL at all", () => {
    const src = readCode("routes/kyc.js");
    assert.equal(/INSERT INTO kyc_docs/i.test(src), false, "base64 still reaches the database");
    // The three names DO still appear — as REQUEST fields, because the client
    // sends `front_image` and this route is the adapter that keeps sending
    // working. What must not appear is either of them inside a statement.
    assert.equal(/(INSERT|UPDATE)[^;]*\b(front_image|back_image|selfie_image)\b/i.test(src), false,
      "an image column is still named by a write");
    assert.equal(/UPDATE users SET kyc_status/i.test(src), false,
      "the derived column is still written outside the decision's transaction");
    assert.equal(/UPDATE kyc_docs/i.test(src), false,
      "the legacy status is still written outside the decision's transaction");
  });
});

// ════════════════════════════════════════════════════════════
//  §30 — zero AI
// ════════════════════════════════════════════════════════════
test("§30 nothing in the verification path reaches a model", async (t) => {
  const TREE = ["src/modules/identity", "src/modules/platform/storage"];
  const walk = (dir) => fs.readdirSync(path.join(BACKEND, dir), { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

  await t.test("no import of an AI client, and no autonomous decision", () => {
    const forbidden = /require\(["'][^"']*(openai|anthropic|gemini|langchain|\.\.\/ai|utils\/ai)/i;
    for (const file of TREE.flatMap(walk)) {
      const src = readCode(file);
      assert.equal(forbidden.test(src), false, `${file} imports an AI client`);
      assert.equal(/autoApprove|aiReview|classifyDocument|scoreApplicant|ocr\(/i.test(src), false,
        `${file} contains an automated verification decision`);
    }
  });

  await t.test("every decision names a human decider", () => {
    const registry = require("../src/application/registry");
    for (const name of ["identity.ApproveVerification", "identity.RejectVerification",
                        "identity.RevokeVerification"]) {
      const src = read(`src/modules/identity/application/commands/decideVerification.js`);
      assert.ok(src.includes("decidedBy: ctx.actor.principalId"),
        `${name} does not record who decided`);
    }
  });
});

// ════════════════════════════════════════════════════════════
//  §13, §16 — telemetry and payload discipline
// ════════════════════════════════════════════════════════════
test("§13 nothing sensitive is logged, echoed or audited", async (t) => {
  await t.test("no file in the verification path logs a document or a number", () => {
    const files = [
      "src/modules/identity/application/commands/SubmitIdentityVerification.js",
      "src/modules/identity/application/queries/GetIdentityDocumentUrl.js",
      "src/modules/identity/application/queries/GetLegacyDocumentImage.js",
      "src/modules/platform/storage/sealedDocumentStore.js",
      "routes/kyc.js",
    ];
    for (const file of files) {
      const src = read(file);
      const logCalls = src.match(/logger\.\w+\([^)]*\)/g) || [];
      for (const call of logCalls) {
        assert.equal(/base64|buffer|image|doc_number|nid|objectKey|object_key/i.test(call), false,
          `${file} logs sensitive content: ${call}`);
      }
    }
  });

  await t.test("the audit record for a document read names no object key", () => {
    const src = read("src/modules/identity/application/queries/GetIdentityDocumentUrl.js");
    const record = src.slice(src.indexOf("ctx.recordAudit"), src.indexOf("return {"));
    assert.equal(/objectKey|object_key/.test(record), false,
      "a key plus a signing credential is the document, and support staff read audit_log");
    assert.match(record, /doc_type/);
  });

  await t.test("the audit record for a submission names kinds, not content", () => {
    const src = read("src/modules/identity/application/commands/SubmitIdentityVerification.js");
    const record = src.slice(src.indexOf("ctx.recordAudit"), src.length);
    assert.equal(/objectKey|object_key|buffer|\.data\b/.test(record), false);
    assert.match(record, /document_kinds/);
  });
});

// ════════════════════════════════════════════════════════════
//  §12, §22 — the lifecycle over HTTP
// ════════════════════════════════════════════════════════════
test("§12, §22 the review lifecycle end to end", async (t) => {
  const caseRow = (over = {}) => ({
    id: "case-1", principal_id: SUBJECT.id, kind: "identity", state: "submitted",
    submitted_at: "2026-08-01", decided_by: null, decided_at: null,
    decision_reason: null, expires_at: null, legacy_kyc_id: null,
    correlation_id: null, created_at: "2026-08-01", updated_at: "2026-08-01", ...over,
  });

  const pool = (rows = {}) => makePool([
    { match: "FROM verification_case v WHERE v.id", rows: [rows.loaded || caseRow()] },
    { match: "FROM verification_case v WHERE v.principal_id", rows: rows.own === null ? [] : [rows.own || caseRow()] },
    { match: "FROM verification_case WHERE id", rows: [rows.locked || caseRow()] },
    { match: "FROM verification_case WHERE principal_id", rows: rows.own === null ? [] : [rows.own || caseRow()] },
    { match: "UPDATE verification_case", rows: { affectedRows: 1 } },
    { match: "FROM identity_document", rows: rows.documents || [] },
    { match: "SELECT COUNT(*) AS v FROM verification_case", rows: [{ v: 1 }] },
    { match: "UPDATE", rows: { affectedRows: 1 } },
    { match: "INSERT", rows: { affectedRows: 1 } },
    { match: "SELECT", rows: [] },
  ]);

  async function boot(p, user) {
    resetModules();
    installFakeDb(p);
    const authMw = require.resolve("../middleware/auth");
    require.cache[authMw] = {
      id: authMw, filename: authMw, loaded: true,
      exports: { authMiddleware: (req, _res, next) => { req.user = user; next(); } },
    };
    require("../src/composition/modules").composeModules();
    return serve(require("../src/modules/identity/transport/routes"), { middleware: [asUser(user)] });
  }

  // NEGATIVE CONTROL: widen `roles` on the decision policies to include
  // CUSTOMER and every one of these becomes 200.
  await t.test("the subject cannot decide their own case through any route", async (tt) => {
    const p = pool();
    const srv = await boot(p, SUBJECT);
    tt.after(() => srv.close());
    for (const verb of ["review", "approve", "reject", "request-info", "revoke"]) {
      const res = await call(srv.url, "POST", `/cases/case-1/${verb}`, { reason: "because I say so" });
      assert.equal(res.status, 403, `/${verb} answered ${res.status}`);
    }
    assert.equal(p.ran("UPDATE verification_case"), false, "a denied decision wrote anyway");
  });

  await t.test("a reviewer must claim a case before deciding it", async (tt) => {
    const p = pool();
    const srv = await boot(p, REVIEWER);
    tt.after(() => srv.close());
    // `submitted` → approve is not an edge the machine has.
    const early = await call(srv.url, "POST", "/cases/case-1/approve", {});
    assert.equal(early.status, 409);
    assert.equal(p.ran("UPDATE verification_case"), false);

    const claimed = await call(srv.url, "POST", "/cases/case-1/review", {});
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.state, "under_review");
  });

  // NEGATIVE CONTROL: this needs BOTH `reasonRequired` on the policy AND
  // `requireReason` in the domain removed. Two independent layers refuse a
  // rejection with no reason, and §34 says the lever must remove all of them.
  await t.test("a rejection with no reason is refused, at two layers", async (tt) => {
    const p = pool({ loaded: caseRow({ state: "under_review" }), locked: caseRow({ state: "under_review" }) });
    const srv = await boot(p, REVIEWER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "POST", "/cases/case-1/reject", {});
    assert.equal(res.status, 422, "the POLICY denies with reason_required before the domain sees it");
    assert.equal(p.ran("UPDATE verification_case"), false);

    // With a reason, the same call succeeds — so the refusal above was about
    // the reason and not about anything else.
    const ok = await call(srv.url, "POST", "/cases/case-1/reject", { reason: "the ID photo is unreadable" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.state, "rejected");
  });

  await t.test("a decision commits with its audit record, inside one transaction", async (tt) => {
    const p = pool({ loaded: caseRow({ state: "under_review" }), locked: caseRow({ state: "under_review" }) });
    const srv = await boot(p, REVIEWER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "POST", "/cases/case-1/approve", {});
    assert.equal(res.status, 200);

    const order = p.queries.map((q) => q.sql.trim().split(/\s+/).slice(0, 3).join(" "));
    const begin = order.indexOf("BEGIN");
    const commit = order.indexOf("COMMIT");
    assert.ok(begin >= 0 && commit > begin);
    for (const needle of ["UPDATE verification_case SET", "UPDATE users SET", "INSERT INTO audit_log"]) {
      const at = order.findIndex((s) => s.startsWith(needle.split(/\s+/).slice(0, 3).join(" ")));
      assert.ok(at > begin && at < commit, `${needle} is outside the transaction`);
    }
    // AD-009: the record is the decision's, not a side effect after it.
    const audit = p.all("INSERT INTO audit_log");
    assert.equal(audit.length, 1);
    assert.equal(audit[0].params[8], "verification_case.approve");
  });

  await t.test("the subject sees their state and never the reviewer", async (tt) => {
    const p = pool({ own: caseRow({ state: "rejected", decision_reason: "photo unreadable", decided_by: REVIEWER.id }) });
    const srv = await boot(p, SUBJECT);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", "/me");
    assert.equal(res.status, 200);
    assert.equal(res.body.state, "rejected");
    assert.equal(res.body.reason, "photo unreadable");
    assert.equal(res.body.can_submit, true, "a rejected applicant may try again");
    assert.equal(JSON.stringify(res.body).includes(REVIEWER.id), false,
      "R-406 gives the subject a decision, not a name");
  });

  await t.test("a person who has never submitted has a state, not an error", async (tt) => {
    const p = pool({ own: null });
    const srv = await boot(p, SUBJECT);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", "/me");
    assert.equal(res.status, 200);
    assert.equal(res.body.state, "not_submitted");
    assert.equal(res.body.is_verified, false);
    assert.equal(res.body.can_submit, true);
  });

  // NEGATIVE CONTROL: remove the `documents: false` scope AND the column list
  // in `listQueue`. Either alone keeps evidence out of the queue, so §34
  // requires both to come out for this to mean anything.
  await t.test("the queue carries no evidence", async (tt) => {
    const p = pool();
    const srv = await boot(p, REVIEWER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", "/queue?state=submitted");
    assert.equal(res.status, 200);
    const listed = p.all("FROM verification_case v")
      .map((q) => q.sql).filter((s) => /LIMIT/.test(s))[0];
    assert.equal(/object_key|front_image|selfie_image|back_image/.test(listed), false,
      "the queue query selects evidence");
    assert.equal(JSON.stringify(res.body).includes("object_key"), false);
  });

  await t.test("an unknown queue state is a validation error, not an empty page", async (tt) => {
    const p = pool();
    const srv = await boot(p, REVIEWER);
    tt.after(() => srv.close());
    const res = await call(srv.url, "GET", "/queue?state=approved");
    assert.equal(res.status, 400, "GATE-1 §5's compressed name must not silently return nothing");
  });
});
