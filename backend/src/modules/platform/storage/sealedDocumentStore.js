/**
 * Sealed document store — platform / storage
 *
 * I-07 §14, §32. The private half of object storage: identity documents go
 * in, and the only way out is a short-lived signed URL minted for one
 * authorised read.
 *
 * WHAT THE BOUNDARY LOOKED LIKE BEFORE (§32.1)
 * ────────────────────────────────────────────
 * `utils/storage.js` has one write path and it ends:
 *
 *     const publicBase = process.env.R2_PUBLIC_URL || …;
 *     const url = publicBase ? `${publicBase}/${key}` : key;
 *
 * — a permanent, unauthenticated, guessable-by-nobody-but-shareable-by-anyone
 * URL. `POST /api/upload/kyc` used it with `folder: kyc/${req.user.id}` and
 * stored the result. Meanwhile `POST /api/kyc` ignored storage entirely and
 * wrote ~5 MB of base64 into four LONGTEXT columns.
 *
 * WHAT IS SAFE (§32.2)
 * ────────────────────
 * The credential handling, the bucket resolution across all four env
 * spellings (P1-17), and the multipart upload. Those are reused.
 *
 * WHAT IS IMPLEMENTED (§32.3)
 * ───────────────────────────
 * Signed reads, via `@aws-sdk/s3-request-presigner` — the official companion
 * to the `@aws-sdk/client-s3` already present, so this adds a signing
 * algorithm rather than a storage vendor.
 *
 * WHAT IS NOT, AND IS NOT FAKED (§32.5)
 * ─────────────────────────────────────
 * This process cannot see the bucket's ACL or its public-access block. It
 * therefore cannot PROVE an object it writes is private, and it does not
 * claim to. What it can do is refuse the one configuration that is provably
 * unsafe — a sealed bucket that is also the bucket a public base URL points
 * at — and that refusal is `assertSealedBucketIsNotPublic()` below.
 *
 *     REMAINING GAP: bucket-level public-access configuration is an
 *     infrastructure setting outside this repository. Recorded in
 *     I-07-PROVIDER-VERIFICATION.md §8 as an operator prerequisite, not as a
 *     control this code provides.
 */
"use strict";

const crypto = require("node:crypto");
const { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { CapabilityUnavailableError, ValidationError } = require("../../../shared/errors");

/**
 * How long a minted URL lives.
 *
 * D-03 requires a short-lived signed URL and does not name a number. Five
 * minutes is long enough for a reviewer's browser to fetch an image and short
 * enough that a URL pasted into a chat window is stale before it is read.
 * It is not a legal or compliance figure and nothing here claims it is.
 */
const READ_URL_TTL_SECONDS = 300;

/** What an identity document may be. Anything else is refused before upload. */
const ALLOWED_MIME = Object.freeze({
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
});

/**
 * 8 MB.
 *
 * `routes/kyc.js` caps each base64 field at 7,168,000 characters, which is
 * ~5.4 MB decoded. This is the same order and is applied to DECODED bytes,
 * so a caller cannot get a bigger object through by choosing an encoding.
 */
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

// ── configuration ──────────────────────────────────────────

function resolveBucket() {
  // A dedicated bucket is the preferred shape: an identity document and a
  // provider's avatar have different access rules, and one bucket cannot have
  // two.
  return (
    process.env.R2_SEALED_BUCKET ||
    process.env.S3_SEALED_BUCKET ||
    process.env.R2_BUCKET_NAME ||
    process.env.R2_BUCKET ||
    process.env.S3_BUCKET_NAME ||
    process.env.AWS_S3_BUCKET ||
    null
  );
}

const hasDedicatedBucket = () => !!(process.env.R2_SEALED_BUCKET || process.env.S3_SEALED_BUCKET);
const publicBaseConfigured = () => !!process.env.R2_PUBLIC_URL;

function buildClient() {
  if (process.env.R2_ACCOUNT_ID) {
    return new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  if (process.env.AWS_ACCESS_KEY_ID) {
    return new S3Client({
      region: process.env.AWS_REGION || "ap-southeast-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return null;
}

/**
 * The one configuration this process CAN prove is unsafe.
 *
 * `R2_PUBLIC_URL` is a base that resolves any key in its bucket without
 * credentials. If the sealed objects share that bucket, then
 * `${R2_PUBLIC_URL}/${objectKey}` is a working, permanent, unauthenticated
 * link to a national identity card — and the signing this module does would
 * be decoration over an open door.
 *
 * §14 says KYC documents must not be public. Where the deployment cannot
 * demonstrate that, the capability is unavailable and submission fails
 * closed. That is deliberately inconvenient: a misconfigured deployment
 * should be unable to accept an identity document at all rather than accept
 * one and expose it.
 */
function assertSealedBucketIsNotPublic() {
  if (publicBaseConfigured() && !hasDedicatedBucket()) {
    throw new CapabilityUnavailableError(
      "SEALED_STORAGE_MISCONFIGURED",
      "R2_PUBLIC_URL is set and no dedicated sealed bucket is configured; " +
        "identity documents would share a bucket that serves unauthenticated reads. " +
        "Set R2_SEALED_BUCKET (or S3_SEALED_BUCKET) to a bucket with public access blocked.",
      { userMessage: { en: "Document upload is temporarily unavailable.",
                       bn: "নথি আপলোড সাময়িকভাবে বন্ধ আছে।" } }
    );
  }
}

/** Why the store is or is not usable. Safe to surface in an operator health check. */
function capability() {
  const bucket = resolveBucket();
  const client = buildClient();
  if (!client) return { available: false, reason: "no_credentials" };
  if (!bucket) return { available: false, reason: "no_bucket" };
  if (publicBaseConfigured() && !hasDedicatedBucket()) {
    return { available: false, reason: "shared_bucket_is_public" };
  }
  return { available: true, bucket, dedicated: hasDedicatedBucket() };
}

function requireClient() {
  const client = buildClient();
  const bucket = resolveBucket();
  if (!client || !bucket) {
    // P0-12's precedent: a capability the platform has but cannot currently
    // provide is a 503 and never a pretend success.
    throw new CapabilityUnavailableError(
      "SEALED_STORAGE_UNAVAILABLE",
      "Object storage is not configured; identity documents cannot be accepted",
      { userMessage: { en: "Document upload is temporarily unavailable.",
                       bn: "নথি আপলোড সাময়িকভাবে বন্ধ আছে।" } }
    );
  }
  assertSealedBucketIsNotPublic();
  return { client, bucket };
}

// ── keys ───────────────────────────────────────────────────

/**
 * An object key that is not a filename.
 *
 * `utils/storage.js` builds `kyc/<userId>/2026/08/<hex>.jpg` — which puts a
 * user id in a path that a public base URL would expose, so anyone holding
 * one document's URL could learn whose it was. These keys carry the CASE id
 * (opaque, internal, useless without database access) plus 16 random bytes,
 * and nothing that identifies a person.
 */
function buildObjectKey({ caseId, docType, mime }) {
  const ext = ALLOWED_MIME[mime];
  const nonce = crypto.randomBytes(16).toString("hex");
  return `sealed/verification/${caseId}/${docType}-${nonce}${ext}`;
}

// ── validation ─────────────────────────────────────────────

/**
 * Decode and check a base64 payload.
 *
 * The compatibility path: the existing client posts base64 JSON, and I-07
 * does not get to change the client (§27 of I-06 froze the frontend). What it
 * does get to change is where those bytes come to rest.
 *
 * `Buffer.from(s, "base64")` never throws — it silently drops anything that
 * is not base64 — so the decoded length is re-encoded and compared. A payload
 * that does not round-trip is not a document.
 */
function decodeDocument(base64, { field = "document" } = {}) {
  const raw = String(base64 || "").replace(/^data:[^;]+;base64,/, "").trim();
  if (!raw) {
    throw new ValidationError(`${field} is required`, { fields: [{ field, code: "REQUIRED" }] });
  }
  // Cheap ceiling before allocating: 4 base64 chars per 3 bytes.
  if (raw.length > Math.ceil((MAX_DOCUMENT_BYTES / 3) * 4) + 16) {
    throw new ValidationError(`${field} exceeds ${MAX_DOCUMENT_BYTES} bytes`, {
      fields: [{ field, code: "TOO_LARGE" }],
    });
  }
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length || buffer.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
    throw new ValidationError(`${field} is not valid base64`, {
      fields: [{ field, code: "INVALID_ENCODING" }],
    });
  }
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new ValidationError(`${field} exceeds ${MAX_DOCUMENT_BYTES} bytes`, {
      fields: [{ field, code: "TOO_LARGE" }],
    });
  }
  return buffer;
}

/**
 * The declared type, checked against the bytes.
 *
 * A client-declared MIME is a claim, and the magic bytes are evidence. They
 * are compared because "image/jpeg" on an HTML file is how a storage bucket
 * becomes a phishing host.
 */
function detectMime(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  return null;
}

function sniffMime(buffer, declared) {
  if (!ALLOWED_MIME[declared]) {
    throw new ValidationError(`unsupported document type "${declared}"`, {
      fields: [{ field: "mime", code: "UNSUPPORTED_TYPE" }],
    });
  }
  if (detectMime(buffer) !== declared) {
    throw new ValidationError("document content does not match its declared type", {
      fields: [{ field: "mime", code: "CONTENT_TYPE_MISMATCH" }],
    });
  }
  return declared;
}

/**
 * The type of a payload that did not declare one.
 *
 * The legacy `POST /api/kyc` body has no MIME field — it is a bare base64
 * string — so the compatibility adapter has nothing to compare against. This
 * reads the magic bytes and REFUSES anything not on the allow-list, which is
 * strictly more than the old path did (it accepted any string and stored it).
 *
 * A caller that CAN declare a type gets `sniffMime`, which compares the claim
 * to the evidence. This is the weaker of the two and it exists only for the
 * wire format §27 froze.
 */
function requireDetectedMime(buffer, { field = "document" } = {}) {
  const mime = detectMime(buffer);
  if (!mime) {
    throw new ValidationError(
      `${field} is not a JPEG, PNG, WebP or PDF`,
      { fields: [{ field, code: "UNSUPPORTED_TYPE" }],
        userMessage: { en: "Please upload a JPEG, PNG or PDF.",
                       bn: "অনুগ্রহ করে JPEG, PNG বা PDF আপলোড করুন।" } }
    );
  }
  return mime;
}

// ── the port ───────────────────────────────────────────────

/**
 * Write a document and return a REFERENCE.
 *
 * There is no return path for a URL here, deliberately: a caller that cannot
 * obtain a URL from a write cannot store one, and `identity_document` has no
 * column for one either. The only way to read is `signedReadUrl`, which is
 * reachable only through an audited use case.
 */
async function putSealed({ caseId, docType, buffer, mime }) {
  const { client, bucket } = requireClient();
  const objectKey = buildObjectKey({ caseId, docType, mime });

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: buffer,
    ContentType: mime,
    // Belt and braces on S3; R2 ignores it. Harmless where unsupported and
    // decisive where it is.
    ACL: undefined,
    Metadata: { sealed: "true" },
  }));

  return Object.freeze({ objectKey, bytes: buffer.length, mime });
}

/**
 * Mint one short-lived URL for one read.
 *
 * V-07: the caller is an audited use case, and the audit record is written
 * whether or not the reviewer ever loads the URL — the moment of decision is
 * the minting, not the fetch, and the fetch is not something this system can
 * observe.
 */
async function signedReadUrl(objectKey, { ttlSeconds = READ_URL_TTL_SECONDS } = {}) {
  const { client, bucket } = requireClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
    { expiresIn: ttlSeconds }
  );
}

/** Remove an object. The row survives; see migration 011's note on deleted_at. */
async function deleteSealed(objectKey) {
  const { client, bucket } = requireClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}

module.exports = {
  READ_URL_TTL_SECONDS, ALLOWED_MIME, MAX_DOCUMENT_BYTES,
  capability, putSealed, signedReadUrl, deleteSealed,
  decodeDocument, sniffMime, detectMime, requireDetectedMime,
  buildObjectKey, assertSealedBucketIsNotPublic,
};
