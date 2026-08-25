/**
 * Identity / verification HTTP routes — identity / transport
 *
 * I-06 §8's shape, unchanged: read the request, build the actor, call a use
 * case, shape the result, let the error boundary map a failure. No `if` about
 * who may do what, no SQL, no transaction, no audit write, no business rule.
 *
 * §21 IN PRACTICE
 * ───────────────
 * There is no `PATCH /cases/:id` taking a target state in the body. Every
 * transition is its own verb-named route calling its own use case with its
 * own action and its own policy — so "who may approve" and "who may revoke"
 * are two answers the register holds separately, and an opaque
 * `{"status": "verified"}` cannot be constructed.
 *
 * WHERE THE REASON COMES FROM
 * ───────────────────────────
 * `reason` in the body, or the `X-Reason` header for the GETs that require
 * one. It reaches the POLICY, which denies without it — so a reviewer who
 * will not say why they are opening somebody's national identity card is
 * refused by the kernel rather than by a check in a handler (R-1103, D-03).
 */
"use strict";

const router = require("express").Router();
const pool = require("../../../../db");
const { authMiddleware } = require("../../../../middleware/auth");
const platform = require("../../platform");
const { execute } = require("../../../application/execute");
const { repositories } = require("../index");

const { anonymousActor } = platform.authorization;
const { legacyActorFromUser } = platform.authorization.legacy;
const { requestIp, requestUserAgent } = platform.audit;

/** The stated reason, from wherever the verb makes it natural to put it. */
const reasonFrom = (req) =>
  (req.body && req.body.reason) || req.query.reason || req.get("x-reason") || null;

function contextFor(req) {
  return {
    actor: req.user
      ? legacyActorFromUser(req.user, { correlationId: req.requestId || null })
      : anonymousActor({ correlationId: req.requestId || null }),
    db: pool,
    repositories,
    correlationId: req.requestId || null,
    ip: requestIp(req),
    userAgent: requestUserAgent(req),
    reason: reasonFrom(req),
  };
}

const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// ══════════════════════════════════════════════════════════
//  the subject's own verification
// ══════════════════════════════════════════════════════════

/**
 * POST /api/verification/identity
 *
 * Body: { documents: { id_front: {data, mime}, id_back?: {...}, selfie: {...} } }
 *
 * `data` is base64 because that is what the current client sends and §27 of
 * I-06 froze the frontend. What changed is where the bytes come to REST:
 * private object storage, with a reference in the database. Multipart is the
 * better wire format and it is a frontend change, not this phase's.
 */
router.post("/identity", authMiddleware, handle(async (req, res) => {
  const out = await execute("identity.SubmitIdentityVerification", req.body || {}, contextFor(req));
  res.status(201).json({
    success: true,
    case_id: out.caseId,
    state: out.state,
    documents: out.documents,
    message: "Identity documents submitted for review",
  });
}));

/** GET /api/verification/me — my state, my decision reason, nothing else. */
router.get("/me", authMiddleware, handle(async (req, res) => {
  const out = await execute("identity.ReadOwnVerification", {}, contextFor(req));
  res.json({
    state: out.state,
    kind: out.kind,
    is_verified: out.isVerified,
    can_submit: out.canSubmit,
    submitted_at: out.submittedAt,
    decided_at: out.decidedAt,
    // The reason a decision was made. Never who made it (R-406).
    reason: out.reason,
    expires_at: out.expiresAt,
    document_count: out.documentCount,
  });
}));

// ══════════════════════════════════════════════════════════
//  the reviewer's surfaces
// ══════════════════════════════════════════════════════════

/** GET /api/verification/queue?state=submitted — metadata only. */
router.get("/queue", authMiddleware, handle(async (req, res) => {
  res.json(await execute("identity.ListVerificationQueue", {
    state: req.query.state, kind: req.query.kind,
    page: req.query.page, limit: req.query.limit,
  }, contextFor(req)));
}));

/** GET /api/verification/cases/:id — the case. Audited (V-07). */
router.get("/cases/:id", authMiddleware, handle(async (req, res) => {
  res.json(await execute("identity.ReadVerificationCase",
    { case_id: req.params.id }, contextFor(req)));
}));

/**
 * GET /api/verification/documents/:id — one short-lived signed URL.
 *
 * Requires `X-Reason`. The kernel denies without it; this route does not
 * check, deliberately, so there is one place the rule lives.
 */
router.get("/documents/:id", authMiddleware, handle(async (req, res) => {
  const out = await execute("identity.GetIdentityDocumentUrl",
    { document_id: req.params.id }, contextFor(req));
  // Never cached. A signed URL in a shared cache is a signed URL somebody
  // else can use for the rest of its five minutes.
  res.set("Cache-Control", "no-store, private");
  res.json({
    document_id: out.documentId,
    doc_type: out.docType,
    mime: out.mime,
    url: out.url,
    expires_in: out.expiresInSeconds,
  });
}));

/** GET /api/verification/cases/:id/legacy/:docType — the migrated backlog. */
router.get("/cases/:id/legacy/:docType", authMiddleware, handle(async (req, res) => {
  const out = await execute("identity.GetLegacyDocumentImage",
    { case_id: req.params.id, doc_type: req.params.docType }, contextFor(req));
  res.set("Cache-Control", "no-store, private");
  res.json({ case_id: out.caseId, doc_type: out.docType, legacy: true, image: out.image });
}));

/**
 * GET /api/verification/blob/:token — the local driver's signed read.
 *
 * DELIBERATELY UNAUTHENTICATED, for the same reason an S3 presigned URL is:
 * the token IS the capability. A browser does not attach an Authorization
 * header to an `<img src>`, so a route that demanded one could not display
 * the document it exists to display — the reviewer would be sent a link
 * their own browser could not open.
 *
 * What guards it instead:
 *
 *   · an HMAC over (object key, expiry) using a key derived from the server
 *     secret, compared in constant time
 *   · a five-minute expiry, checked on every request
 *   · a key that names no person, so a leaked URL identifies nobody
 *   · minting is the audited, authorised, reason-carrying step — this is
 *     only the delivery of a decision already recorded (V-07)
 *
 * Every failure answers 404. "Expired", "forged" and "no such object" are
 * indistinguishable, so the endpoint cannot be probed.
 */
router.get("/blob/:token", handle(async (req, res) => {
  const store = platform.sealedStorage;
  const objectKey = store.local.verifyToken(req.params.token);
  if (!objectKey) return res.status(404).json({ error: "Not found" });

  let bytes;
  try {
    bytes = await store.local.read(objectKey);
  } catch {
    return res.status(404).json({ error: "Not found" });
  }

  const ext = objectKey.slice(objectKey.lastIndexOf("."));
  const type = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" }[ext]
    || "application/octet-stream";

  res.set({
    "Content-Type": type,
    // Never cached anywhere but this browser's memory, and not for long: a
    // shared cache holding a national identity card is the whole problem.
    "Cache-Control": "no-store, private, max-age=0",
    "X-Content-Type-Options": "nosniff",
    // A document is displayed, never executed, and never framed by anyone.
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
    "Content-Disposition": "inline",
  });
  res.send(bytes);
}));

// ══════════════════════════════════════════════════════════
//  decisions — one route, one use case, one policy each (§21)
// ══════════════════════════════════════════════════════════

const decision = (path, useCase) =>
  router.post(path, authMiddleware, handle(async (req, res) => {
    const out = await execute(useCase, {
      case_id: req.params.id,
      reason: reasonFrom(req),
      expires_at: req.body ? req.body.expires_at : undefined,
    }, contextFor(req));
    res.json({ success: true, case_id: out.caseId, state: out.state, decided_at: out.decidedAt });
  }));

decision("/cases/:id/review", "identity.StartVerificationReview");
decision("/cases/:id/approve", "identity.ApproveVerification");
decision("/cases/:id/reject", "identity.RejectVerification");
decision("/cases/:id/request-info", "identity.RequestVerificationInfo");
decision("/cases/:id/revoke", "identity.RevokeVerification");

module.exports = router;
