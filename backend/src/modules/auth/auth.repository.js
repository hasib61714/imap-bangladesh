// ── auth.repository — DATABASE ACCESS ONLY ────────────────
// No HTTP, no business rules. Just SQL.
const pool = require("../../../db");

module.exports = {
  findById:   (id)    => pool.query("SELECT * FROM users WHERE id = ?", [id]).then(([r]) => r[0] || null),
  findByEmail:(email) => pool.query("SELECT * FROM users WHERE email = ?", [email]).then(([r]) => r[0] || null),
  findByPhone:(phone) => pool.query("SELECT * FROM users WHERE phone = ?", [phone]).then(([r]) => r[0] || null),
  findBySocialId: (sid) => pool.query("SELECT * FROM users WHERE social_id = ?", [sid]).then(([r]) => r[0] || null),

  /** Login lookup: active user by email OR phone. */
  findActiveByIdentifier: (identifier) =>
    pool.query("SELECT * FROM users WHERE (email = ? OR phone = ?) AND is_active = 1", [identifier, identifier])
        .then(([r]) => r[0] || null),

  insertUser: (u) =>
    pool.query(
      `INSERT INTO users (id, name, email, phone, password_hash, role, avatar, login_method, social_id, referral_code)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [u.id, u.name, u.email, u.phone, u.password_hash, u.role, u.avatar, u.login_method, u.social_id, u.referral_code]
    ),

  insertProviderProfile: (p) =>
    pool.query(
      `INSERT INTO providers (id, user_id, service_type_bn, service_type_en, area_bn, area_en, hourly_rate)
       VALUES (?,?,?,?,?,?,?)`,
      [p.id, p.user_id, p.service_type_bn, p.service_type_en, p.area_bn, p.area_en, p.hourly_rate]
    ),

  publicProfileById: (id) =>
    pool.query(
      "SELECT id, name, email, phone, role, avatar, kyc_status, verified, balance, points, referral_code FROM users WHERE id = ?",
      [id]
    ).then(([r]) => r[0] || null),
};
