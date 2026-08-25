// ─────────────────────────────────────────────────────────────
//  IMAP – Refresh token rotation (enterprise auth)
//
//  - Tokens are cryptographically random; only their SHA-256 HASH is stored.
//  - Every refresh rotates the token (old one is revoked, new one issued in
//    the same "family").
//  - Presenting an already-rotated/revoked token = reuse → the whole family is
//    revoked (stolen-token containment); the user must log in again.
// ─────────────────────────────────────────────────────────────
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const REFRESH_TTL_DAYS = parseInt(process.env.REFRESH_TTL_DAYS || "30", 10);

/** Cryptographically random opaque token (returned to the client once). */
function generateToken() { return crypto.randomBytes(48).toString("base64url"); }

/** SHA-256 hex of a token — only this is ever stored. */
function hashToken(t) { return crypto.createHash("sha256").update(String(t)).digest("hex"); }

function expiryDate() { return new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000); }

/** Issue a brand-new refresh token (new family unless one is supplied). */
async function issue(pool, userId, familyId = null) {
  const token = generateToken();
  const fam   = familyId || uuidv4();
  await pool.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, revoked) VALUES (?,?,?,?,0)",
    [userId, hashToken(token), fam, expiryDate()]
  );
  return { token, familyId: fam };
}

/**
 * Rotate a presented refresh token.
 * @returns {Promise<{ok:boolean, token?:string, userId?:string, reuse?:boolean, expired?:boolean}>}
 */
async function rotate(pool, presented) {
  if (!presented) return { ok: false };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      "SELECT * FROM refresh_tokens WHERE token_hash = ? FOR UPDATE",
      [hashToken(presented)]
    );
    if (!row) { await conn.rollback(); return { ok: false }; }

    // Reuse of an already-rotated/revoked token → revoke the whole family.
    if (row.revoked || row.replaced_by) {
      await conn.query("UPDATE refresh_tokens SET revoked = 1 WHERE family_id = ?", [row.family_id]);
      await conn.commit();
      return { ok: false, reuse: true, userId: row.user_id };
    }
    if (new Date(row.expires_at) < new Date()) {
      await conn.query("UPDATE refresh_tokens SET revoked = 1 WHERE id = ?", [row.id]);
      await conn.commit();
      return { ok: false, expired: true };
    }

    const newToken = generateToken();
    const newHash  = hashToken(newToken);
    await conn.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, revoked) VALUES (?,?,?,?,0)",
      [row.user_id, newHash, row.family_id, expiryDate()]
    );
    await conn.query(
      "UPDATE refresh_tokens SET revoked = 1, replaced_by = ?, used_at = NOW() WHERE id = ?",
      [newHash, row.id]
    );
    await conn.commit();
    return { ok: true, token: newToken, userId: row.user_id };
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

/** Revoke the family of a presented token (logout). Best-effort. */
async function revoke(pool, presented) {
  if (!presented) return false;
  const [[row]] = await pool.query(
    "SELECT family_id FROM refresh_tokens WHERE token_hash = ?",
    [hashToken(presented)]
  );
  if (!row) return false;
  await pool.query("UPDATE refresh_tokens SET revoked = 1 WHERE family_id = ?", [row.family_id]);
  return true;
}

module.exports = { generateToken, hashToken, issue, rotate, revoke, REFRESH_TTL_DAYS };
