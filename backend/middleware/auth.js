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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Fetch fresh user from DB.
    // NOTE: `avatar` is intentionally NOT selected here — it can be a large
    // base64 LONGTEXT blob and this runs on EVERY authenticated request.
    // Consumers that need the avatar fetch it explicitly (e.g. /users/profile).
    const [rows] = await pool.query(
      "SELECT id, name, email, phone, role, kyc_status, verified, balance, points, is_active FROM users WHERE id = ?",
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

// Role guard — use after authMiddleware
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole };
