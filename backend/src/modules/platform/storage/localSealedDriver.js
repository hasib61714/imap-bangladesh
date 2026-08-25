/**
 * Local private driver for the sealed document store — platform / storage
 *
 * The object-storage driver needs R2 or S3 credentials. Without them the
 * store fails closed, which is correct for a misconfigured PRODUCTION
 * deployment and useless for everything else: a developer, a CI run, a
 * self-hosted deployment and a pilot without a cloud account could not
 * accept an identity document at all, so the entire verification lifecycle
 * was unreachable. That is not a safe default; it is a broken feature.
 *
 * This driver stores the bytes on the local filesystem and keeps every
 * control the S3 driver has:
 *
 *   private    the root is OUTSIDE any directory express serves. There is
 *              no static mount over it and no route that takes a path.
 *              §14's rule was "not public"; it was never "not local".
 *   signed     a read needs an HMAC over (key, expiry) using the server's
 *              secret. Same shape as an S3 presigned URL, same lifetime,
 *              same property: the URL IS the capability, and it expires.
 *   audited    unchanged — the audit record is written by the use case that
 *              mints the URL, whichever driver is behind it.
 *
 * WHAT IT IS NOT
 * ──────────────
 * It is not durable across hosts, it does not replicate, and a container
 * with an ephemeral filesystem loses it on restart. Those are real
 * limitations and they are why `requireDriver()` refuses to select this
 * driver in production unless an operator names the directory explicitly:
 * a production deployment that silently wrote identity documents to a
 * disappearing disk would lose evidence it had told people it was keeping.
 */
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const BACKEND_ROOT = path.join(__dirname, "..", "..", "..", "..");

/**
 * Where the bytes live.
 *
 * `.private/` rather than `uploads/`: nothing in this repository serves a
 * dot-directory, `express.static` is never pointed at it, and the name says
 * what it is to anyone who lists the tree.
 */
function resolveRoot() {
  return process.env.SEALED_LOCAL_DIR || path.join(BACKEND_ROOT, ".private", "sealed");
}

/** The secret the read tokens are signed with. */
function signingSecret() {
  const secret = process.env.SEALED_URL_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 16) return null;
  // Derived rather than reused directly, so a leaked document URL cannot be
  // taken apart to say anything about the token signing key.
  return crypto.createHmac("sha256", secret).update("imap:sealed-document-url:v1").digest();
}

const available = () => Boolean(signingSecret());

/**
 * An object key is not a path, and this is where that is enforced.
 *
 * The key comes from our own `buildObjectKey`, but this function is what a
 * future caller would reach for with a key from somewhere else. It rejects
 * anything that could climb out of the root — `..`, an absolute path, a
 * drive letter, a backslash, a null byte — and then verifies the resolved
 * path is still inside the root, which catches whatever the pattern missed.
 */
function safePath(objectKey) {
  const key = String(objectKey || "");
  if (!key || key.length > 500) throw new Error("invalid object key");
  if (!/^[A-Za-z0-9/_.-]+$/.test(key)) throw new Error("invalid object key");
  if (key.includes("..") || key.startsWith("/") || /^[A-Za-z]:/.test(key)) throw new Error("invalid object key");

  const root = path.resolve(resolveRoot());
  const full = path.resolve(root, key);
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("invalid object key");
  return full;
}

async function put({ objectKey, buffer }) {
  const full = safePath(objectKey);
  await fs.mkdir(path.dirname(full), { recursive: true });
  // 0o600: on a POSIX host, only the process owner. Windows ignores the mode
  // and inherits the directory ACL, which is why the root is under the
  // application directory rather than somewhere world-readable.
  await fs.writeFile(full, buffer, { mode: 0o600 });
}

async function remove(objectKey) {
  try {
    await fs.unlink(safePath(objectKey));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

async function read(objectKey) {
  return fs.readFile(safePath(objectKey));
}

const exists = (objectKey) => {
  try { return fsSync.existsSync(safePath(objectKey)); } catch { return false; }
};

// ── the signed URL ─────────────────────────────────────────

const b64url = (buf) => Buffer.from(buf).toString("base64url");

/**
 * Mint a capability for one object, for a bounded time.
 *
 * The token carries the key and the expiry in the clear and an HMAC over
 * both. Nothing is encrypted, and nothing needs to be: an object key names
 * no person (see `buildObjectKey`), and possession of a valid signature is
 * the whole authorisation — exactly as it is for an S3 presigned URL.
 */
function signUrl(objectKey, ttlSeconds) {
  const secret = signingSecret();
  if (!secret) throw new Error("no signing secret");
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = b64url(JSON.stringify({ k: objectKey, e: expiresAt }));
  const sig = b64url(crypto.createHmac("sha256", secret).update(payload).digest());
  // Relative: the caller is the browser that just authenticated against this
  // origin. An absolute URL would need a host this process may not know
  // behind a proxy, and getting it wrong produces a link to nowhere.
  return `/api/verification/blob/${payload}.${sig}`;
}

/**
 * Verify a token and return the key it authorises.
 *
 * Returns null for anything wrong — bad shape, bad signature, expired. The
 * caller turns that into one 404 for every failure, so a probe cannot tell
 * "expired" from "forged" from "no such object".
 */
function verifyToken(token) {
  const secret = signingSecret();
  if (!secret || typeof token !== "string") return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let expected;
  try {
    expected = b64url(crypto.createHmac("sha256", secret).update(payload).digest());
  } catch { return null; }

  // Constant-time: a timing oracle on a signature check is how a signature
  // check stops being one.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let claims;
  try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
  if (!claims || typeof claims.k !== "string" || typeof claims.e !== "number") return null;
  if (claims.e * 1000 <= Date.now()) return null;

  try { safePath(claims.k); } catch { return null; }
  return claims.k;
}

module.exports = {
  available, resolveRoot, safePath,
  put, remove, read, exists,
  signUrl, verifyToken,
};
