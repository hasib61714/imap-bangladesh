const logger = require('../utils/logger');
const router = require("express").Router();
const pool   = require("../db");
const { withTransaction } = require("../db");
const cache  = require("../utils/cache");
const { authMiddleware } = require("../middleware/auth");
// I-04 (§21, §31): `requireRole("admin")` is gone from this file. Every
// endpoint declares the ACTION it performs and the kernel decides. The
// endpoints below are no longer uniform — reading the platform's counters and
// changing someone's role were the same permission until this commit, and
// they are not the same permission.
const { requireAuthorization, wasAuthorized } = require("../middleware/authorize");
const { ACTION } = require("../src/modules/platform/authorization");
const { writeAudit } = require("../src/modules/platform/audit/writeAudit");
// I-07: the KYC decision no longer happens in this file. It calls the use
// cases that own the verification state machine, so there is one path that
// can move a case rather than one here and one in the identity module.
const { execute } = require("../src/application/execute");
const paymentGateway = require("../utils/payment");
const platform = require("../src/modules/platform");
const env = require("../config/environment");
const identity = require("../src/modules/identity");

/**
 * P1-11: the admin panel sent `is_active = -1` for "suspend", and
 * middleware/auth.js tests `!rows[0].is_active` — -1 is truthy, so the
 * suspended user kept full access while the UI showed them as blocked.
 * Only a strict 0/1 is accepted. Returns null for anything else.
 */
function normaliseActiveFlag(value) {
  if (value === undefined || value === null) return null;
  if (value === 0 || value === false || value === "0" || value === "false") return 0;
  if (value === 1 || value === true || value === "1" || value === "true") return 1;
  return undefined;   // supplied, and not a valid flag
}

/** The audit actor for an authorized administrative write. */
const auditActor = (req) => ({
  correlationId: req.requestId || null,
  principalId: req.authorization.actor.principalId,
  accountId: req.authorization.actor.accountId,
  role: req.authorization.actor.primaryRole,
  via: "http",
  onBehalfOf: null,
});

/**
 * GET /api/admin/readiness — is this deployment actually configured?
 *
 * WHY THIS EXISTS
 * ───────────────
 * Several capabilities are configured entirely through environment variables
 * set by hand in a hosting dashboard, and until now there was no way to learn
 * whether that had been done correctly except by exercising the capability
 * against a real customer: a payment that fails at the gateway, or a KYC
 * submission that 503s. `/api/health` answers "is the process up and can it
 * reach the database", which stays green through every one of these.
 *
 * Two failures this would have caught immediately:
 *
 *   - `SSL_IS_SANDBOX=false` with sandbox credentials. The gateway answers
 *     "Store Credential Error", every payment fails, and nothing in the app
 *     says why. `mode` below says `live` while the store id is a sandbox one.
 *   - No sealed bucket. Identity documents are refused in production rather
 *     than written to a container filesystem that a restart discards. That is
 *     deliberate, but it should be a thing an operator can SEE.
 *
 * WHAT IT DOES NOT CONTAIN
 * ────────────────────────
 * No secret, and no value that could be reassembled into one. `describe()`
 * returns the store id truncated to six characters and never the password —
 * `test/i0*` covers that ("describe() exposes no credential"). The storage
 * capability reports a bucket NAME, which is not a credential and is the
 * thing an operator needs to check against what they typed.
 *
 * It is admin-only regardless. Which capabilities a deployment is missing is
 * a map of where it is weakest, and that is not public information.
 */
router.get("/readiness", authMiddleware, requireAuthorization(ACTION.STATS_READ), async (req, res) => {
  const payment = paymentGateway.describe();
  const sealed  = platform.sealedStorage.capability();

  // A sandbox store id in live mode, or the reverse. The id itself carries no
  // marker, so this is a heuristic on the environment pair rather than proof —
  // it points at the question rather than answering it.
  const sandboxCredsInLiveMode =
    payment.configured && payment.mode === "live" &&
    String(process.env.SSL_IS_SANDBOX || "").toLowerCase() !== "true" &&
    /sandbox/i.test(String(payment.base || ""));

  const warnings = [];
  if (!payment.configured) {
    warnings.push("SSLCommerz is not configured — paid bookings will be refused, not mocked.");
  }
  if (sandboxCredsInLiveMode) {
    warnings.push("Payment mode is `live` but the gateway base is a sandbox host. Check SSL_IS_SANDBOX.");
  }
  if (!process.env.APP_ENV || !process.env.DATABASE_ENV) {
    warnings.push(
      "APP_ENV and/or DATABASE_ENV are not set — the environment is being inferred rather than declared. " +
      "It resolves to " + resolved.processEnv + "/" + resolved.databaseEnv + " and is correct, but declare both.");
  }
  if (!sealed.available) {
    warnings.push("Sealed storage is unavailable — identity documents will be refused (503).");
  } else if (sealed.driver === "local" && !sealed.durable) {
    warnings.push("Sealed storage is a local directory with no SEALED_LOCAL_DIR set. On a container filesystem, submitted documents do not survive a restart.");
  }

  /**
   * The RESOLVED environment, and whether it was declared or inferred.
   *
   * This reported `process.env.APP_ENV` directly, which came back `null` from
   * the first production deployment and said nothing useful: null does not
   * mean "development", it means the variable is unset and the environment
   * was worked out some other way. `config/environment.js` falls back to
   * NODE_ENV and then fails closed to production, so the process was correct —
   * but a report that cannot distinguish "declared production" from "inferred
   * production" cannot tell you that.
   *
   * `render.yaml` declares both explicitly and says why: so that the
   * production deployment "never depends on a hostname pattern". `declared`
   * below is how you check that the declaration actually arrived.
   */
  const resolved = env.describe();

  res.json({
    environment: {
      app: resolved.processEnv,
      database: resolved.databaseEnv,
      declared: {
        APP_ENV: process.env.APP_ENV || null,
        DATABASE_ENV: process.env.DATABASE_ENV || null,
        NODE_ENV: process.env.NODE_ENV || null,
      },
      productionBehaviour: resolved.productionBehaviour,
      backendUrl: process.env.BACKEND_URL || null,
    },
    payment,
    sealedStorage: sealed,
    warnings,
  });
});

// ── GET /api/admin/stats ──────────────────────────────────
router.get("/stats", authMiddleware, requireAuthorization(ACTION.STATS_READ), async (req, res) => {
  try {
    const stats = await cache.getOrSet("admin:stats", async () => {
      const [[users]]     = await pool.query("SELECT COUNT(*) AS v FROM users WHERE role = 'customer'");
      const [[providers]] = await pool.query("SELECT COUNT(*) AS v FROM users WHERE role = 'provider'");
      const [[bookings]]  = await pool.query("SELECT COUNT(*) AS v FROM bookings");
      const [[revenue]]   = await pool.query("SELECT COALESCE(SUM(amount+platform_fee),0) AS v FROM bookings WHERE status = 'completed'");
      const [[kycPending]]= await pool.query("SELECT COUNT(*) AS v FROM kyc_docs WHERE status = 'pending'");
      const [[complaints]]= await pool.query("SELECT COUNT(*) AS v FROM complaints WHERE status = 'open'");
      const [[avgRating]] = await pool.query("SELECT ROUND(AVG(rating),2) AS v FROM reviews");
      const [[todayBooks]]= await pool.query("SELECT COUNT(*) AS v FROM bookings WHERE DATE(created_at) = CURDATE()");
      return {
        users:      users.v,
        providers:  providers.v,
        bookings:   bookings.v,
        revenue:    revenue.v,
        kycPending: kycPending.v,
        complaints: complaints.v,
        avgRating:  avgRating.v || 0,
        todayBookings: todayBooks.v,
      };
    }, 30); // 30-second TTL — cached across 8 parallel-capable DB queries
    res.json(stats);
  } catch (err) {
    logger.error("admin stats:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/users ──────────────────────────────────
// ── GET /api/admin/providers ─────────────────────────────
router.get("/providers", authMiddleware, requireAuthorization(ACTION.PROVIDER_LIST_ALL), async (req, res) => {
  try {
    const { q, status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ["1=1"], params = [];
    if (q) { where.push("(u.name LIKE ? OR u.phone LIKE ? OR p.service_type_en LIKE ? OR p.service_type_bn LIKE ?)"); const l = `%${q}%`; params.push(l,l,l,l); }
    if (status) { where.push("u.is_active = ?"); params.push(status === "active" ? 1 : status === "suspended" ? 0 : null); }

    const isDefault = !q && !status && parseInt(page) === 1 && parseInt(limit) === 30;
    const fetchProviders = async () => {
      const [rows] = await pool.query(
        `SELECT p.id, u.id AS user_id, u.name, u.phone, u.email, u.kyc_status,
                u.is_active, p.service_type_en AS service_slug, p.service_type_bn,
                p.area_en AS area, p.area_bn, p.rating, p.total_jobs,
                p.bio_en AS bio, p.bio_bn, p.nid_verified,
                u.joined_at, p.hourly_rate,
                -- I-07: the operator's queue needs the state that actually
                -- decides listing, and whether the identity clause is met.
                -- Without these the panel could only show is_active, which
                -- is the ACCOUNT, so "approve provider" was activating an
                -- account and calling it an approval.
                p.listing_state,
                EXISTS (SELECT 1 FROM verification_case v
                         WHERE v.principal_id = p.user_id AND v.kind = 'identity'
                           AND v.state = 'verified'
                           AND (v.expires_at IS NULL OR v.expires_at > NOW())) AS identity_verified,
                (SELECT COALESCE(SUM(b.amount+COALESCE(b.platform_fee,0)),0)
                 FROM bookings b WHERE b.provider_id = p.id AND b.status = 'completed') AS earned
         FROM providers p LEFT JOIN users u ON u.id = p.user_id
         WHERE ${where.join(" AND ")} ORDER BY p.rating DESC, p.total_jobs DESC LIMIT ? OFFSET ?`,
        [...params.filter(x=>x!==null), parseInt(limit), offset]
      );
      const [[total]] = await pool.query(
        `SELECT COUNT(*) AS v FROM providers p LEFT JOIN users u ON u.id=p.user_id WHERE ${where.join(" AND ")}`,
        params.filter(x=>x!==null)
      );
      return { providers: rows, total: total.v };
    };
    const data = isDefault
      ? await cache.getOrSet("admin:providers:default", fetchProviders, 15)
      : await fetchProviders();
    res.json(data);
  } catch (err) {
    logger.error("admin providers:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/users ──────────────────────────────────
router.get("/users", authMiddleware, requireAuthorization(ACTION.USER_LIST), async (req, res) => {
  try {
    const { q, role, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ["1=1"], params = [];
    if (q) { where.push("(name LIKE ? OR email LIKE ? OR phone LIKE ?)"); const l = `%${q}%`; params.push(l,l,l); }
    if (role) { where.push("role = ?"); params.push(role); }

    // Short-lived cache for default (no filter) page-1 queries only
    const isDefault = !q && !role && parseInt(page) === 1 && parseInt(limit) === 30;
    const fetchUsers = async () => {
      const [rows] = await pool.query(
        `SELECT id, name, email, phone, role, kyc_status, verified, balance, points, is_active, joined_at
         FROM users WHERE ${where.join(" AND ")} ORDER BY joined_at DESC LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset]
      );
      const [[total]] = await pool.query(
        `SELECT COUNT(*) AS v FROM users WHERE ${where.join(" AND ")}`, params
      );
      return { users: rows, total: total.v };
    };
    const data = isDefault
      ? await cache.getOrSet("admin:users:default", fetchUsers, 10)
      : await fetchUsers();
    res.json(data);
  } catch (err) {
    logger.error("admin users:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/admin/users/:id ────────────────────────────
//
// ONE ENDPOINT, TWO ACTIONS, AND THEY ARE NOT THE SAME PERMISSION.
//
// Suspending an account is trust & safety's; granting a role is the platform
// owner's, and is the one operation that can create another actor as powerful
// as the caller. `requireRole("admin")` could not tell them apart. Each is
// authorized separately below, and the UPDATE applies ONLY the change whose
// action was permitted — so a skipped authorization removes a capability
// rather than leaving one unguarded.
//
// The self-lockout rule moved out of this handler and into the policy: it is
// a condition on the actor's relationship to the subject, which makes it
// authorization rather than validation (§20).
router.patch("/users/:id", authMiddleware,
  requireAuthorization(ACTION.ACCOUNT_SET_STATUS, {
    auditedByHandler: true,
    when: (req) => req.body?.is_active !== undefined && req.body?.is_active !== null,
    resource: (req) => req.params.id,
    context: (req) => ({ targetStatus: normaliseActiveFlag(req.body.is_active) === 0 ? "suspended" : "active" }),
  }),
  requireAuthorization(ACTION.MEMBERSHIP_GRANT, {
    auditedByHandler: true,
    when: (req) => Boolean(req.body?.role),
    resource: (req) => req.params.id,
    context: (req) => ({ reason: req.body?.reason || null }),
  }),
  async (req, res) => {
  try {
    const { is_active, role } = req.body;
    const validRoles = ["customer", "provider", "admin"];
    if (role && !validRoles.includes(role))
      return res.status(400).json({ error: "Invalid role" });

    const activeFlag = normaliseActiveFlag(is_active);
    if (activeFlag === undefined) return res.status(400).json({ error: "is_active must be 0 or 1" });
    if (activeFlag === null && !role) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    // Fail closed: apply only what the kernel permitted.
    const maySetStatus = wasAuthorized(req, ACTION.ACCOUNT_SET_STATUS);
    const mayGrantRole = wasAuthorized(req, ACTION.MEMBERSHIP_GRANT);
    const nextActive = maySetStatus ? activeFlag : null;
    const nextRole = mayGrantRole ? (role || null) : null;
    if (nextActive === null && nextRole === null) {
      return res.status(403).json({ error: "Access denied" });
    }

    // The subject as it was, loaded by the kernel — not re-queried, and not
    // taken from the request (§17).
    const before = (req.authorizations[ACTION.MEMBERSHIP_GRANT] || req.authorizations[ACTION.ACCOUNT_SET_STATUS]).resource;

    // §27: a privilege change and its audit record are one unit. An audit
    // record that can be lost while the role change succeeds is not an audit
    // record — and this is the single most consequential write in the system,
    // because it is how another administrator comes into existence.
    await withTransaction(async (conn) => {
      await conn.query(
        "UPDATE users SET is_active = COALESCE(?, is_active), role = COALESCE(?, role) WHERE id = ?",
        [nextActive, nextRole, req.params.id]
      );
      await writeAudit(conn, {
        actor: auditActor(req),
        action: nextRole ? ACTION.MEMBERSHIP_GRANT : ACTION.ACCOUNT_SET_STATUS,
        resourceType: "user",
        resourceId: String(req.params.id),
        resourceOwner: String(req.params.id),
        outcome: "permitted",
        before: { role: before.legacyRole, is_active: before.isActive ? 1 : 0 },
        after: {
          role: nextRole ?? before.legacyRole,
          is_active: nextActive === null ? (before.isActive ? 1 : 0) : nextActive,
        },
        reason: req.body?.reason || null,
        ip: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
        sodBypass: Boolean(
          (req.authorizations[ACTION.MEMBERSHIP_GRANT]?.decision.sodBypass) ||
          (req.authorizations[ACTION.ACCOUNT_SET_STATUS]?.decision.sodBypass)
        ),
      });
    });

    cache.del("admin:stats");
    cache.del("admin:users:default");
    cache.del("admin:providers:default");
    cache.del(`user:profile:${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    logger.error("admin update user:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/bookings ───────────────────────────────
router.get("/bookings", authMiddleware, requireAuthorization(ACTION.BOOKING_LIST_ALL), async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ["1=1"], params = [];
    if (status) { where.push("b.status = ?"); params.push(status); }

    // Short-lived cache for default (no filter) page-1 queries only
    const isDefault = !status && parseInt(page) === 1 && parseInt(limit) === 30;
    const fetchBookings = async () => {
      const [rows] = await pool.query(
        `SELECT b.*, cu.name AS customer_name, pu.name AS provider_name
         FROM bookings b
         LEFT JOIN users cu ON cu.id = b.customer_id
         LEFT JOIN providers p ON p.id = b.provider_id
         LEFT JOIN users pu ON pu.id = p.user_id
         WHERE ${where.join(" AND ")}
         ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset]
      );
      const [[total]] = await pool.query(
        `SELECT COUNT(*) AS v FROM bookings b WHERE ${where.join(" AND ")}`, params
      );
      return { bookings: rows, total: total.v };
    };
    const data = isDefault
      ? await cache.getOrSet("admin:bookings:default", fetchBookings, 10)
      : await fetchBookings();
    res.json(data);
  } catch (err) {
    logger.error("admin bookings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/kyc ────────────────────────────────────
router.get("/kyc", authMiddleware, requireAuthorization(ACTION.VERIFICATION_LIST), async (req, res) => {
  try {
    const { status = "pending", page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const isDefault = parseInt(page) === 1 && parseInt(limit) === 30;
    const fetchKyc = async () => {
      // Image columns are deliberately excluded here (P1-12): they are
      // LONGTEXT base64 blobs of up to ~5 MB each. Fetch one document's
      // images through GET /api/admin/kyc/:id when a reviewer opens it.
      const [rows] = await pool.query(
        `SELECT k.id, k.user_id, k.doc_type, k.doc_number, k.status,
                k.rejection_reason, k.reviewed_by, k.submitted_at, k.reviewed_at,
                (k.front_image  IS NOT NULL) AS has_front,
                (k.back_image   IS NOT NULL) AS has_back,
                (k.selfie_image IS NOT NULL) AS has_selfie,
                u.name, u.email, u.phone
           FROM kyc_docs k
           LEFT JOIN users u ON u.id = k.user_id
          WHERE k.status = ? ORDER BY k.submitted_at DESC LIMIT ? OFFSET ?`,
        [status, parseInt(limit), offset]
      );
      const [[total]] = await pool.query(
        "SELECT COUNT(*) AS v FROM kyc_docs WHERE status = ?", [status]
      );
      return { docs: rows, total: total.v };
    };
    const data = isDefault
      ? await cache.getOrSet(`admin:kyc:${status}`, fetchKyc, 15)
      : await fetchKyc();
    res.json(data);
  } catch (err) {
    logger.error("admin kyc:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/kyc/:id — one document, including its images ──
// Split out from the list (P1-12) so reviewers load images one at a time.
router.get("/kyc/:id", authMiddleware,
  requireAuthorization(ACTION.VERIFICATION_READ_DOCUMENT, { resource: (req) => req.params.id }), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT k.*, u.name, u.email, u.phone
         FROM kyc_docs k LEFT JOIN users u ON u.id = k.user_id
        WHERE k.id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "KYC document not found" });
    // The read itself is the audit record now: VERIFICATION_READ_DOCUMENT is
    // audit: "required", so every open of Sealed evidence writes a row whether
    // or not it changed anything (V-07). The log line stays for operators.
    logger.info("admin viewed KYC document", {
      adminId: req.authorization.actor.principalId, kycId: req.params.id,
    });
    res.json(rows[0]);
  } catch (err) {
    logger.error("admin kyc detail:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/admin/kyc/:id — approve or reject KYC ────
//
// I-07 §21, §24. This handler used to write `kyc_docs.status` and
// `users.kyc_status` itself. It no longer writes verification state at all —
// it calls the use cases that own those transitions, so there is exactly ONE
// path that can move a verification case and every guard on it applies:
// the state machine, the mandatory reason on a refusal, the trust_safety-only
// policy, and the audit record that must commit with the decision.
//
// The `requireAuthorization` middleware STAYS in front. The use case
// authorizes too, on the new `verification_case` resource, so a caller needs
// both — the legacy policy still guards the legacy id space and still marks
// the Gate-1 `sod_bypass` on the kyc_docs resource. Two independent grants
// for one operation is strictly stronger than one; it is not redundancy that
// can be dropped without deciding which of the two to keep.
//
// `auditedByHandler` stays true and now means what it says: the USE CASE
// writes the record, inside the transaction that carries the decision. A
// second record from the middleware would count one decision twice, and an
// audit log that overstates is as unusable as one that omits.
//
// The migrated backlog only. A case submitted after I-07 has no `kyc_docs`
// row, so the kernel's loader will not resolve it here — those are decided
// through `/api/verification/cases/:id/{approve,reject}`.
router.patch("/kyc/:id", authMiddleware,
  requireAuthorization(ACTION.VERIFICATION_DECIDE, {
    auditedByHandler: true,
    resource: (req) => req.params.id,
    context: (req) => ({ reason: req.body?.rejection_reason || null }),
  }), async (req, res, next) => {
  try {
    const { status, rejection_reason } = req.body;
    // `pending` is gone from the accepted set. It was a decision that undid a
    // decision with no record of why, and `STATE-MACHINES.md` §9 has no edge
    // back to `submitted` for a reviewer — the SUBJECT resubmits. Callers
    // sending it now get a 400 instead of a silent state rewrite.
    const valid = ["verified", "rejected"];
    if (!status || !valid.includes(status)) {
      return res.status(400).json({ error: "Valid status required: " + valid.join(", ") });
    }

    const doc = req.authorization.resource;
    const ctx = {
      actor: req.authorization.actor,
      db: pool,
      repositories: identity.repositories,
      correlationId: req.requestId || null,
      ip: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
      reason: rejection_reason || null,
    };

    // The machine has no `submitted → verified` edge. The old endpoint made
    // that jump; it is now two recorded steps, which is the difference
    // between "someone approved this" and "someone reviewed it, then
    // approved it". A case another reviewer already claimed refuses the
    // first step, and that is the one failure worth continuing past.
    try {
      await execute("identity.StartVerificationReview", { case_id: req.params.id }, ctx);
    } catch (err) {
      if (!err || err.code !== "VERIFICATION_TRANSITION_INVALID") throw err;
    }

    await (status === "verified"
      ? execute("identity.ApproveVerification", { case_id: req.params.id }, ctx)
      : execute("identity.RejectVerification",
          { case_id: req.params.id, reason: rejection_reason }, ctx));

    if (doc.subjectUserId) {
      cache.del(`user:profile:${doc.subjectUserId}`);
      cache.del(`kyc:user:${doc.subjectUserId}`);
    }
    cache.del("admin:stats");
    cache.del("admin:users:default");
    cache.del("admin:kyc:pending"); cache.del("admin:kyc:verified"); cache.del("admin:kyc:rejected");
    res.json({ success: true });
  } catch (err) {
    // AppErrors from the use case carry their own status; the transport error
    // boundary maps them. Only a genuine failure becomes a 500 here.
    if (err && typeof err.status === "number") return next(err);
    logger.error("admin kyc review:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/complaints ─────────────────────────────
router.get("/complaints", authMiddleware, requireAuthorization(ACTION.COMPLAINT_LIST), async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ["1=1"], params = [];
    if (status) { where.push("c.status = ?"); params.push(status); }

    const isDefault = !status && parseInt(page) === 1 && parseInt(limit) === 30;
    const fetchComplaints = async () => {
      const [rows] = await pool.query(
        `SELECT c.*, u.name AS user_name FROM complaints c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE ${where.join(" AND ")} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset]
      );
      return rows;
    };
    const data = isDefault
      ? await cache.getOrSet("admin:complaints:default", fetchComplaints, 15)
      : await fetchComplaints();
    res.json(data);
  } catch (err) {
    logger.error("admin complaints:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/admin/complaints/:id ──────────────────────
router.patch("/complaints/:id", authMiddleware,
  requireAuthorization(ACTION.COMPLAINT_RESOLVE, { resource: (req) => req.params.id }), async (req, res) => {
  try {
    const { status, resolved_note } = req.body;
    const validStatuses = ["open", "in_progress", "resolved", "closed"];
    if (status && !validStatuses.includes(status))
      return res.status(400).json({ error: "Invalid status" });
    if (resolved_note && resolved_note.length > 2000)
      return res.status(400).json({ error: "resolved_note too long (max 2000)" });
    await pool.query(
      "UPDATE complaints SET status = COALESCE(?, status), resolved_note = COALESCE(?, resolved_note), assigned_to = ? WHERE id = ?",
      [status || null, resolved_note || null, req.authorization.actor.principalId, req.params.id]
    );
    cache.del("admin:stats");
    cache.del("admin:complaints:default");
    res.json({ success: true });
  } catch (err) {
    logger.error("admin resolve complaint:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/admin/notify ────────────────────────────────
router.post("/notify", authMiddleware, requireAuthorization(ACTION.NOTIFICATION_BROADCAST), async (req, res) => {
  try {
    const { user_id, title_bn, title_en, body_bn, body_en, type = "system", icon = "📣" } = req.body;
    const validTypes = ["system", "booking", "payment", "kyc", "promo", "sos", "alert"];
    if (!validTypes.includes(type)) return res.status(400).json({ error: "Invalid notification type" });
    if (title_bn && title_bn.length > 200) return res.status(400).json({ error: "title_bn too long (max 200)" });
    if (title_en && title_en.length > 200) return res.status(400).json({ error: "title_en too long (max 200)" });
    if (body_bn  && body_bn.length  > 1000) return res.status(400).json({ error: "body_bn too long (max 1000)" });
    if (body_en  && body_en.length  > 1000) return res.status(400).json({ error: "body_en too long (max 1000)" });
    if (icon.length > 20) return res.status(400).json({ error: "icon too long" });
    if (user_id) {
      await pool.query(
        "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
        [user_id, icon, type, title_bn, title_en, body_bn, body_en]
      );
    } else {
      // Broadcast to all
      const [users] = await pool.query("SELECT id FROM users WHERE is_active = 1");
      const inserts = users.map(u => [u.id, icon, type, title_bn, title_en, body_bn, body_en]);
      if (inserts.length) {
        await pool.query(
          "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES ?",
          [inserts]
        );
      }
    }
    if (type === "system") cache.del("admin:announcements");
    res.json({ success: true });
  } catch (err) {
    logger.error("admin notify:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/revenue ────────────────────────────────
router.get("/revenue", authMiddleware, requireAuthorization(ACTION.REVENUE_READ), async (req, res) => {
  try {
    const data = await cache.getOrSet("admin:revenue", async () => {
      const [monthly] = await pool.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
                SUM(amount + platform_fee) AS revenue,
                COUNT(*) AS bookings
         FROM bookings WHERE status = 'completed'
         GROUP BY month ORDER BY month DESC LIMIT 12`
      );
      const [[total]] = await pool.query(
        "SELECT COALESCE(SUM(amount+platform_fee),0) AS v FROM bookings WHERE status='completed'"
      );
      const [[fees]] = await pool.query(
        "SELECT COALESCE(SUM(platform_fee),0) AS v FROM bookings WHERE status='completed'"
      );
      return { monthly, totalRevenue: total.v, totalFees: fees.v };
    }, 60);
    res.json(data);
  } catch (err) {
    logger.error("admin revenue:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/promos ────────────────────────────────
router.get("/promos", authMiddleware, requireAuthorization(ACTION.PROMO_LIST), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, COALESCE(title_bn, code) AS title_bn,
              COALESCE(title_en, code) AS title_en,
              discount_pct, discount_amt,
              max_uses AS \`limit\`, used_count AS uses,
              COALESCE(valid_until,'') AS expires, is_active AS active
       FROM promos ORDER BY id DESC`
    );
    res.json(rows);
  } catch(e) { logger.error("admin promos list:", e); res.status(500).json({ error: "Server error" }); }
});

// ── POST /api/admin/promos ────────────────────────────────
router.post("/promos", authMiddleware, requireAuthorization(ACTION.PROMO_CREATE), async (req, res) => {
  try {
    const { code, discount_pct, discount_amt, max_uses, valid_until } = req.body;
    if (!code) return res.status(400).json({ error: "code required" });
    if (code.length > 30) return res.status(400).json({ error: "code too long (max 30)" });
    await pool.query(
      `INSERT INTO promos (code, title_bn, title_en, discount_pct, discount_amt, max_uses, valid_until, is_active)
       VALUES (?,?,?,?,?,?,?,1)`,
      [code.toUpperCase(), code, code, discount_pct||0, discount_amt||0, max_uses||999,
       valid_until||null]
    );
    cache.del("promos:active");
    res.status(201).json({ success: true });
  } catch(e) { logger.error("admin promos create:", e); res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/admin/promos/:id ───────────────────────────
router.patch("/promos/:id", authMiddleware,
  requireAuthorization(ACTION.PROMO_UPDATE, { resource: (req) => req.params.id }), async (req, res) => {
  try {
    const { is_active } = req.body;
    await pool.query("UPDATE promos SET is_active=? WHERE id=?", [is_active ? 1 : 0, req.params.id]);
    cache.del("promos:active");
    res.json({ success: true });
  } catch(e) { logger.error("admin promos update:", e); res.status(500).json({ error: "Server error" }); }
});

// ── DELETE /api/admin/promos/:id ──────────────────────────
router.delete("/promos/:id", authMiddleware,
  requireAuthorization(ACTION.PROMO_DELETE, { resource: (req) => req.params.id }), async (req, res) => {
  try {
    await pool.query("DELETE FROM promos WHERE id=?", [req.params.id]);
    cache.del("promos:active");
    res.json({ success: true });
  } catch(e) { logger.error("admin promos delete:", e); res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/admin/settings ─────────────────────────────
// I-01: ensureSettingsTable() used to CREATE TABLE system_settings on
// import. The table is migration 003; the function is gone with it.

const defaultSettings = [
  { key_name: "system_online",         val: 1 },
  { key_name: "maintenance_mode",       val: 0 },
  { key_name: "sms_notifications",      val: 1 },
  { key_name: "ai_matching",            val: 1 },
  { key_name: "payment_gateway",        val: 1 },
  { key_name: "nid_verification",       val: 0 },
];

router.get("/settings", authMiddleware, requireAuthorization(ACTION.SETTING_READ), async (req, res) => {
  try {
    // Seed defaults if table is empty
    const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM system_settings");
    if (cnt === 0) {
      for (const s of defaultSettings) {
        await pool.query("INSERT IGNORE INTO system_settings (key_name, val) VALUES (?, ?)", [s.key_name, s.val]);
      }
    }
    const [rows] = await pool.query("SELECT key_name, val FROM system_settings ORDER BY id");
    // Return ordered array matching sysSettingsList order
    const order = defaultSettings.map(d => d.key_name);
    const map   = Object.fromEntries(rows.map(r => [r.key_name, r.val]));
    const result = order.map(k => ({ key: k, val: map[k] !== undefined ? !!map[k] : true }));
    res.json(result);
  } catch (err) {
    logger.error("admin settings get:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/admin/settings ────────────────────────────
router.patch("/settings", authMiddleware, requireAuthorization(ACTION.SETTING_UPDATE), async (req, res) => {
  try {
    const { key, val } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    const allowedKeys = defaultSettings.map(s => s.key_name);
    if (!allowedKeys.includes(key)) return res.status(400).json({ error: "Unknown setting key" });
    await pool.query(
      "INSERT INTO system_settings (key_name, val) VALUES (?, ?) ON DUPLICATE KEY UPDATE val = ?",
      [key, val ? 1 : 0, val ? 1 : 0]
    );
    res.json({ success: true });
  } catch (err) {
    logger.error("admin settings patch:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/admin/announcements ─────────────────────────
router.get("/announcements", authMiddleware, requireAuthorization(ACTION.ANNOUNCEMENT_LIST), async (req, res) => {
  try {
    const rows = await cache.getOrSet("admin:announcements", async () => {
      const [r] = await pool.query(
        `SELECT MIN(id) AS id, icon, type, title_bn, title_en, body_bn, body_en,
                MIN(created_at) AS created_at, COUNT(*) AS reach
         FROM notifications
         WHERE type = 'system'
         GROUP BY title_bn, body_bn
         ORDER BY created_at DESC
         LIMIT 30`
      );
      return r;
    }, 30);
    res.json(rows);
  } catch (e) { logger.error("admin announcements:", e); res.status(500).json({ error: "Server error" }); }
});


module.exports = router;
