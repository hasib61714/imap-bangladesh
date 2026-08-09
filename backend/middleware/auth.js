const jwt  = require("jsonwebtoken");
const pool = require("../db");

// Verify JWT from Authorization header: Bearer <token>
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = header.split(" ")[1];
  try {
    // I-03 (§16): never accept an arbitrary algorithm. Without this list,
    // any HS* variant verifies against a service that only issues HS256.
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    // Fetch fresh user from DB
    const [rows] = await pool.query(
      "SELECT id, name, email, phone, role, avatar, kyc_status, verified, balance, points, is_active FROM users WHERE id = ?",
      [decoded.id]
    );
    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ error: "User not found or inactive" });
    }
    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// I-04: `requireRole(...roles)` is DELETED, not deprecated.
//
// It was the mechanism behind the audited defect: a role check with no
// resource, so `/api/admin/users/:id` and `/api/admin/stats` required exactly
// the same thing, and nothing anywhere asked whether the caller had any
// relationship to what they were acting on.
//
// Its replacement is middleware/authorize.js#requireAuthorization, which
// takes an ACTION rather than a role and hands the decision to the kernel. A
// boundary rule (scripts/check-boundaries.js, no-adhoc-authorization) fails
// the build if this function — or an inline comparison against a role string
// — reappears anywhere outside the authorization module.
//
// Keeping it exported "just in case" would have left the old path available
// and made the migration reversible one route at a time, which is how three
// authorization implementations came to exist in the first place.

module.exports = { authMiddleware };
