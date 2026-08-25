/**
 * I-07 — the verification schema and lifecycle, against a real engine
 *
 * §36: a constraint is not verified by reading the DDL. Every invariant below
 * is asserted by trying to violate it and watching the database refuse, and
 * the lifecycle runs through the real repository against real rows.
 *
 * Runs ONLY against an explicitly nominated disposable instance:
 *
 *   IMAP_TEST_DB_HOST=127.0.0.1 IMAP_TEST_DB_PORT=3399 \
 *   IMAP_TEST_DB_USER=root IMAP_TEST_DB_PASSWORD=... npm test
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const HOST = process.env.IMAP_TEST_DB_HOST;
const PORT = process.env.IMAP_TEST_DB_PORT || "3306";
const USER = process.env.IMAP_TEST_DB_USER || "root";
const PASS = process.env.IMAP_TEST_DB_PASSWORD || "";
const BACKEND = path.join(__dirname, "..", "..");
const SUITE = `imap_verify_${process.pid}`;
const configured = Boolean(HOST);

const LOCAL = new Set(["127.0.0.1", "localhost", "::1", "host.docker.internal"]);
if (configured && !LOCAL.has(String(HOST).toLowerCase())) {
  throw new Error(
    `IMAP_TEST_DB_HOST=${HOST} is not a loopback address. ` +
    "These tests create and drop databases and must never address a shared server."
  );
}

async function connect(database) {
  const mysql = require("mysql2/promise");
  return mysql.createConnection({
    host: HOST, port: Number(PORT), user: USER, password: PASS,
    database, multipleStatements: false, ssl: false,
  });
}

/**
 * Did the database refuse, and for the reason we expected?
 *
 * Matched on the error MESSAGE rather than on `err.code`. mysql2 maps errno
 * numbers through MySQL's table, and MariaDB's 4025 is "CONSTRAINT failed"
 * where MySQL's is `ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE` — so a CHECK
 * violation arrives under a name about tablespace sizing. Verified by probe
 * on MariaDB 12.2.2; recorded in I-07-PROVIDER-VERIFICATION.md §10.
 */
async function refuses(conn, sql, params, expected) {
  try {
    await conn.query(sql, params);
  } catch (err) {
    assert.match(err.message, expected, `refused with "${err.message}" (errno ${err.errno})`);
    return err;
  }
  assert.fail(`the database ACCEPTED a row it should have refused: ${sql}`);
}

/** A CHECK constraint failing, whichever name the client library gives it. */
const CHECK_FAILED = /CONSTRAINT `\w+` failed|CHECK constraint/i;
const DUPLICATE = /Duplicate entry/i;
const TRUNCATED = /Data truncated|Incorrect \w+ value/i;

const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 10)}`;

test("I-07 verification schema", { skip: configured ? false : "IMAP_TEST_DB_HOST not set" }, async (t) => {
  const admin = await connect(undefined);
  await admin.query(`DROP DATABASE IF EXISTS \`${SUITE}\``);
  await admin.query(`CREATE DATABASE \`${SUITE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  // Built by the migration chain alone — 011 included, in order.
  execFileSync(process.execPath, ["scripts/migrate.js"], {
    cwd: BACKEND,
    env: {
      ...process.env, APP_ENV: "test", DATABASE_ENV: "test",
      DB_HOST: HOST, DB_PORT: PORT, DB_USER: USER, DB_PASSWORD: PASS,
      DB_NAME: SUITE, DB_SSL: "false",
    },
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });

  const db = await connect(SUITE);
  t.after(async () => {
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${SUITE}\``);
    await admin.end();
  });

  const newUser = async (over = {}) => {
    const id = uid("u");
    await db.query(
      "INSERT INTO users (id, name, phone, password_hash, role) VALUES (?,?,?,?,?)",
      [id, over.name || "Test", over.phone || uid("01").slice(0, 15), "x", over.role || "customer"]
    );
    return id;
  };
  const newCase = async (principalId, over = {}) => {
    const id = uid("c");
    await db.query(
      `INSERT INTO verification_case (id, principal_id, kind, state, decision_reason)
       VALUES (?,?,?,?,?)`,
      [id, principalId, over.kind || "identity", over.state || "submitted", over.reason ?? null]
    );
    return id;
  };

  await t.test("migration 011 created both tables and the listing column", async () => {
    const [tables] = await db.query(
      `SELECT table_name AS t FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name IN ('verification_case','identity_document')`
    );
    assert.deepEqual(tables.map((r) => r.t).sort(), ["identity_document", "verification_case"]);

    const [[col]] = await db.query(
      `SELECT column_type AS ct, is_nullable AS n, column_default AS d
         FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'providers' AND column_name = 'listing_state'`
    );
    assert.ok(col, "providers.listing_state is missing");
    assert.equal(col.n, "NO");
    // MariaDB quotes an enum default in information_schema; MySQL does not.
    assert.equal(String(col.d).replace(/'/g, ""), "applied");
  });

  // NEGATIVE CONTROL: remove `chk_reason_when_refused` from the migration and
  // this INSERT succeeds — a rejection nobody can appeal, which is R-1103
  // failing silently.
  await t.test("a refusal with no reason is refused by the DATABASE", async () => {
    const u = await newUser();
    await refuses(db,
      "INSERT INTO verification_case (id, principal_id, kind, state) VALUES (?,?,?,?)",
      [uid("c"), u, "identity", "rejected"], CHECK_FAILED);
    await refuses(db,
      "INSERT INTO verification_case (id, principal_id, kind, state) VALUES (?,?,?,?)",
      [uid("c"), u, "identity", "revoked"], CHECK_FAILED);
    // With one, the same row is accepted — so the refusal was about the reason.
    const id = await newCase(u, { state: "rejected", reason: "the ID photo is unreadable" });
    const [[row]] = await db.query("SELECT state, decision_reason FROM verification_case WHERE id = ?", [id]);
    assert.equal(row.state, "rejected");
  });

  await t.test("an UPDATE cannot strip the reason from a refusal either", async () => {
    const u = await newUser();
    const id = await newCase(u, { state: "rejected", reason: "the ID photo is unreadable" });
    await refuses(db, "UPDATE verification_case SET decision_reason = NULL WHERE id = ?", [id],
      CHECK_FAILED);
  });

  // NEGATIVE CONTROL: drop `uniq_open_case` and this succeeds — two cases for
  // one person, so "what is this person's verification state" has two answers.
  await t.test("one open case per person per kind", async () => {
    const u = await newUser();
    await newCase(u);
    await refuses(db,
      "INSERT INTO verification_case (id, principal_id, kind, state) VALUES (?,?,?,?)",
      [uid("c"), u, "identity", "submitted"], DUPLICATE);
    // A different KIND is a different case, and that is deliberate.
    const capability = await newCase(u, { kind: "capability" });
    assert.ok(capability);
  });

  await t.test("`not_submitted` cannot be stored, because a row cannot assert its own absence", async () => {
    const u = await newUser();
    await refuses(db,
      "INSERT INTO verification_case (id, principal_id, kind, state) VALUES (?,?,?,?)",
      [uid("c"), u, "identity", "not_submitted"], TRUNCATED);
  });

  // NEGATIVE CONTROL: drop `uniq_live_document` and the second insert
  // succeeds — two live front-of-ID images on one case, and no way to know
  // which the reviewer was shown.
  await t.test("one live document of each kind per case", async () => {
    const u = await newUser();
    const c = await newCase(u);
    const insert = (over = {}) => db.query(
      `INSERT INTO identity_document (id, case_id, doc_type, object_key, mime, bytes, live_slot)
       VALUES (?,?,?,?,?,?,?)`,
      [over.id || uid("d"), c, over.docType || "id_front", over.key || uid("sealed/k"),
       "image/jpeg", 1024, over.slot === undefined ? "1" : over.slot]
    );
    await insert();
    await refuses(db,
      `INSERT INTO identity_document (id, case_id, doc_type, object_key, mime, bytes, live_slot)
       VALUES (?,?,?,?,?,?,'1')`,
      [uid("d"), c, "id_front", uid("sealed/k"), "image/jpeg", 1024], DUPLICATE);

    // Retiring the first frees the slot, which is how a replacement works.
    await db.query("UPDATE identity_document SET deleted_at = NOW(3), live_slot = NULL WHERE case_id = ? AND doc_type = 'id_front'", [c]);
    await insert({ id: uid("d"), key: uid("sealed/k2") });
    const [rows] = await db.query("SELECT deleted_at FROM identity_document WHERE case_id = ?", [c]);
    assert.equal(rows.length, 2, "a replaced document is retired, not erased");
    assert.equal(rows.filter((r) => r.deleted_at === null).length, 1);
  });

  /**
   * NEGATIVE CONTROL: drop `chk_live_slot` and both of these succeed.
   *
   * The SECOND is the one that matters, and it is why the constraint uses
   * `<=>` rather than `=`. A CHECK rejects only on FALSE, so with `=` the
   * live-but-unslotted row evaluates to NULL and is ACCEPTED — and
   * `uniq_live_document` does not catch it either, because NULLs do not
   * collide. Two live front-of-ID images on one case, with no way to know
   * which the reviewer was shown.
   *
   * Reverting `<=>` to `=` in migration 011 makes exactly this assertion
   * fail and nothing else. Migration 012 carries the same fix to
   * `otp_challenge`, where I-05 wrote the same shape.
   */
  await t.test("the live marker and the deletion cannot drift apart", async () => {
    const u = await newUser();
    const c = await newCase(u);
    await refuses(db,
      `INSERT INTO identity_document (id, case_id, doc_type, object_key, mime, bytes, deleted_at, live_slot)
       VALUES (?,?,?,?,?,?,NOW(3),'1')`,
      [uid("d"), c, "selfie", uid("sealed/k"), "image/jpeg", 10], CHECK_FAILED);
    await refuses(db,
      `INSERT INTO identity_document (id, case_id, doc_type, object_key, mime, bytes, deleted_at, live_slot)
       VALUES (?,?,?,?,?,?,NULL,NULL)`,
      [uid("d"), c, "selfie", uid("sealed/k"), "image/jpeg", 10], CHECK_FAILED);
  });

  // The same hole, in the table I-05 wrote it into first. Migration 012.
  await t.test("an active OTP challenge cannot hold a NULL active slot", async () => {
    const err = await refuses(db,
      `INSERT INTO otp_challenge
         (id, purpose, channel, destination_hash, code_hash, status, active_slot,
          issued_at, expires_at, resend_after)
       VALUES (?,?, 'phone', ?, ?, 'active', NULL, NOW(3),
               DATE_ADD(NOW(3), INTERVAL 5 MINUTE), DATE_ADD(NOW(3), INTERVAL 1 MINUTE))`,
      [uid("o"), "login", "a".repeat(64), "x"], CHECK_FAILED);
    assert.match(err.message, /chk_active_slot/);
  });

  await t.test("identity_document has no column a byte could go in (AD-011)", async () => {
    const [cols] = await db.query(
      `SELECT column_name AS c, data_type AS t FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'identity_document'`
    );
    const blobby = cols.filter((r) => /text|blob/i.test(r.t));
    assert.deepEqual(blobby, [], `these columns could hold a document: ${blobby.map((r) => r.c).join(", ")}`);
  });

  await t.test("deleting a case takes its document references with it", async () => {
    const u = await newUser();
    const c = await newCase(u);
    await db.query(
      `INSERT INTO identity_document (id, case_id, doc_type, object_key, mime, bytes, live_slot)
       VALUES (?,?,?,?,?,?,'1')`, [uid("d"), c, "id_front", uid("sealed/k"), "image/jpeg", 10]);
    await db.query("DELETE FROM verification_case WHERE id = ?", [c]);
    const [rows] = await db.query("SELECT id FROM identity_document WHERE case_id = ?", [c]);
    assert.equal(rows.length, 0, "a reference to a case that does not exist is not a reference");
  });

  await t.test("the queue index answers the queue question without a scan", async () => {
    const [plan] = await db.query(
      "EXPLAIN SELECT id FROM verification_case WHERE kind = 'identity' AND state = 'submitted' ORDER BY submitted_at ASC LIMIT 30"
    );
    assert.ok(plan.length);
    assert.notEqual(plan[0].type, "ALL", `the review queue is a full table scan: ${JSON.stringify(plan[0])}`);
  });

  await t.test("providers.listing_state accepts only the four reachable values", async () => {
    const [[col]] = await db.query(
      `SELECT column_type AS ct FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'providers' AND column_name = 'listing_state'`
    );
    assert.equal(col.ct, "enum('applied','approved','rejected','suspended')");
  });
});

// ════════════════════════════════════════════════════════════
//  the backfill, against real legacy rows
// ════════════════════════════════════════════════════════════
test("I-07 migration 011 backfill", { skip: configured ? false : "IMAP_TEST_DB_HOST not set" }, async (t) => {
  const SUITE_B = `${SUITE}_backfill`;
  const admin = await connect(undefined);
  await admin.query(`DROP DATABASE IF EXISTS \`${SUITE_B}\``);
  await admin.query(`CREATE DATABASE \`${SUITE_B}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  const env = (extra) => ({
    ...process.env, APP_ENV: "test", DATABASE_ENV: "test",
    DB_HOST: HOST, DB_PORT: PORT, DB_USER: USER, DB_PASSWORD: PASS,
    DB_NAME: SUITE_B, DB_SSL: "false", ...extra,
  });

  /**
   * The schema first, then legacy rows, then 011's DATA statements by hand.
   *
   * `migrate.js` has no "stop at 010" flag, and adding one to test a
   * migration would be changing the tool to suit the test. So the chain runs
   * in full — which leaves `verification_case` empty, because `kyc_docs` is —
   * and the two statements that DO the backfill are then extracted from the
   * migration file and executed verbatim against rows that exist. What is
   * under test is the SQL in the file, character for character.
   */
  execFileSync(process.execPath, ["scripts/migrate.js"], {
    cwd: BACKEND, env: env(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });

  const db = await connect(SUITE_B);
  t.after(async () => {
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${SUITE_B}\``);
    await admin.end();
  });

  const users = {};
  for (const [key, kyc] of Object.entries({
    verified: "verified", rejected: "rejected", pending: "pending",
    reasonless: "rejected", newest: "pending", grandfathered: "not_submitted",
  })) {
    const id = uid("u");
    users[key] = id;
    await db.query(
      "INSERT INTO users (id, name, phone, password_hash, role, kyc_status) VALUES (?,?,?,?,?,?)",
      [id, key, uid("01").slice(0, 15), "x", "provider", kyc]
    );
  }

  const kycDoc = async (userId, over = {}) => {
    const id = over.id || uid("k");
    await db.query(
      `INSERT INTO kyc_docs (id, user_id, doc_type, doc_number, status, rejection_reason, reviewed_by, submitted_at, reviewed_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, userId, "nid", "1234567890", over.status || "pending", over.reason ?? null,
       over.reviewedBy ?? null, over.submittedAt || "2026-01-01 10:00:00", over.reviewedAt ?? null]
    );
    return id;
  };

  const kVerified = await kycDoc(users.verified, { status: "verified", reviewedBy: "someone", reviewedAt: "2026-02-01 10:00:00" });
  const kRejected = await kycDoc(users.rejected, { status: "rejected", reason: "blurry photo", reviewedAt: "2026-02-01 10:00:00" });
  const kPending = await kycDoc(users.pending);
  const kReasonless = await kycDoc(users.reasonless, { status: "rejected", reason: null, reviewedAt: "2026-02-02 10:00:00" });
  // Two submissions from one person: the older, then the newer.
  await kycDoc(users.newest, { id: "k-old", submittedAt: "2026-01-01 09:00:00" });
  await kycDoc(users.newest, { id: "k-new", submittedAt: "2026-03-01 09:00:00" });

  // A provider grandfathered by migration 002, with the column at its
  // default so the backfill statement has something to do.
  const providerId = uid("p");
  await db.query(
    `INSERT INTO providers (id, user_id, service_type_en, area_en, hourly_rate, is_approved, is_available, listing_state)
     VALUES (?,?,?,?,?,1,1,'applied')`,
    [providerId, users.grandfathered, "Electrician", "Mirpur", 450]
  );

  // ── 011's data statements, lifted from the file ──────────
  const fs = require("node:fs");
  const MIGRATION = fs.readFileSync(path.join(BACKEND, "migrations", "011_verification.sql"), "utf8");
  const statement = (startsWith) => {
    const from = MIGRATION.indexOf(startsWith);
    assert.notEqual(from, -1, `migration 011 no longer contains "${startsWith}"`);
    return MIGRATION.slice(from, MIGRATION.indexOf(";", from));
  };
  const BACKFILL = statement("INSERT INTO verification_case\n  (id, principal_id");
  const GRANDFATHER = statement("UPDATE providers SET listing_state = 'approved'");

  await db.query(GRANDFATHER);
  await db.query(BACKFILL);

  await t.test("every legacy status maps onto a state the machine has", async () => {
    const rows = {};
    for (const [key, id] of Object.entries({ verified: kVerified, rejected: kRejected, pending: kPending })) {
      const [[row]] = await db.query("SELECT * FROM verification_case WHERE legacy_kyc_id = ?", [id]);
      assert.ok(row, `${key} was not migrated`);
      rows[key] = row;
    }
    assert.equal(rows.verified.state, "verified");
    assert.equal(rows.rejected.state, "rejected");
    // `pending` becomes `submitted`, not `under_review`: nothing in the old
    // table records a reviewer having picked the case up, and claiming
    // otherwise would put work in progress that nobody is doing.
    assert.equal(rows.pending.state, "submitted");
    assert.equal(rows.rejected.decision_reason, "blurry photo");
    assert.equal(rows.verified.decided_by, "someone");
    assert.equal(String(rows.verified.id), kVerified, "the case reuses the kyc_docs id, so old links keep working");
  });

  await t.test("a legacy rejection with no reason gets a marker, not an invented one", async () => {
    const [[row]] = await db.query("SELECT decision_reason FROM verification_case WHERE legacy_kyc_id = ?", [kReasonless]);
    assert.match(row.decision_reason, /^\[migrated\]/);
    assert.match(row.decision_reason, /recorded no reason/,
      "R-1103 cannot be applied retroactively; the record must say so rather than fabricate");
  });

  await t.test("one case per person, and it is the newest submission", async () => {
    const [rows] = await db.query(
      "SELECT legacy_kyc_id FROM verification_case WHERE principal_id = ? AND kind = 'identity'", [users.newest]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].legacy_kyc_id, "k-new");
    // The older row is not destroyed — it is simply unreferenced.
    const [[old]] = await db.query("SELECT id FROM kyc_docs WHERE id = 'k-old'");
    assert.ok(old, "the migration must not delete history it merely stopped pointing at");
  });

  await t.test("migration 002's grandfathering is carried into the new column", async () => {
    const [[p]] = await db.query("SELECT listing_state, is_approved FROM providers WHERE id = ?", [providerId]);
    assert.equal(p.listing_state, "approved", "a structural change must not de-list anybody by itself");
    assert.equal(p.is_approved, 1);
  });

  await t.test("re-running the backfill inserts nothing and changes nothing", async () => {
    const [[before]] = await db.query("SELECT COUNT(*) AS v FROM verification_case");
    const [before2] = await db.query("SELECT id, state, decision_reason FROM verification_case ORDER BY id");
    // The SQL itself must be idempotent, not merely the runner's ledger — a
    // half-applied migration is re-run by hand often enough that "it is
    // recorded as applied" is not the protection.
    await db.query(BACKFILL);
    await db.query(GRANDFATHER);

    const [[after]] = await db.query("SELECT COUNT(*) AS v FROM verification_case");
    const [after2] = await db.query("SELECT id, state, decision_reason FROM verification_case ORDER BY id");
    assert.equal(after.v, before.v, "the backfill is not idempotent");
    assert.deepEqual(after2, before2);
  });

  await t.test("the eligibility EXISTS agrees with the domain", async () => {
    const { IDENTITY_VERIFIED_SQL } = require("../../src/modules/marketplace/infrastructure/repositories/providerRepository");
    // Give the grandfathered provider a verified case, then take it away.
    const [rows] = await db.query(
      `SELECT p.id, ${IDENTITY_VERIFIED_SQL} AS identity_verified
         FROM providers p WHERE p.id = ?`, [providerId]
    );
    assert.equal(Number(rows[0].identity_verified), 0,
      "a grandfathered provider with no verification case is not identity-verified");

    await db.query(
      "INSERT INTO verification_case (id, principal_id, kind, state) VALUES (?,?,?,?)",
      [uid("c"), users.grandfathered, "identity", "verified"]
    );
    const [after] = await db.query(
      `SELECT ${IDENTITY_VERIFIED_SQL} AS identity_verified FROM providers p WHERE p.id = ?`, [providerId]
    );
    assert.equal(Number(after[0].identity_verified), 1);

    // An expired case grants nothing, and the SQL says so without a job
    // having run to write `expired`.
    await db.query(
      "UPDATE verification_case SET expires_at = '2020-01-01 00:00:00' WHERE principal_id = ? AND kind = 'identity'",
      [users.grandfathered]
    );
    const [expired] = await db.query(
      `SELECT ${IDENTITY_VERIFIED_SQL} AS identity_verified FROM providers p WHERE p.id = ?`, [providerId]
    );
    assert.equal(Number(expired[0].identity_verified), 0);
  });
});
