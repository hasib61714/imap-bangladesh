#!/usr/bin/env node
/**
 * Opt-in data migration: move legacy base64 media (stored inline in the DB)
 * into object storage (R2/S3) and replace the column with the CDN URL.
 *
 *   node scripts/migrate-media.js            # DRY RUN (reports what it would do)
 *   node scripts/migrate-media.js --apply    # actually upload + rewrite rows
 *
 * Requirements: storage must be configured (R2_* or AWS_*). Safe to re-run —
 * only rows whose value still starts with "data:" are processed.
 */
require("dotenv").config();
const pool    = require("../db");
const storage = require("../utils/storage");
const { v4: uuidv4 } = require("uuid");

const APPLY = process.argv.includes("--apply");
const LIMIT = parseInt(process.env.MIGRATE_LIMIT || "500", 10);

function isBase64(v) { return typeof v === "string" && v.startsWith("data:"); }

function decode(dataUri) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUri);
  if (!m) return null;
  return { mimetype: m[1], buffer: Buffer.from(m[2], "base64") };
}

async function recordAsset(owner_id, kind, key, url, mimetype, size) {
  await pool.query(
    "INSERT INTO media_assets (id, owner_id, kind, object_key, cdn_url, mime_type, size) VALUES (?,?,?,?,?,?,?)",
    [uuidv4(), owner_id, kind, key, url, mimetype || null, size || null]
  );
}

async function migrateColumn({ table, idCol, ownerCol, column, kind, folder }) {
  const [rows] = await pool.query(
    `SELECT ${idCol} AS id, ${ownerCol} AS owner, ${column} AS val
       FROM ${table} WHERE ${column} LIKE 'data:%' LIMIT ?`, [LIMIT]
  );
  let moved = 0;
  for (const r of rows) {
    if (!isBase64(r.val)) continue;
    if (!APPLY) { moved++; continue; }
    const dec = decode(r.val);
    if (!dec) continue;
    const { key, url } = await storage.uploadFile({
      buffer: dec.buffer, mimetype: dec.mimetype, originalname: `${kind}.bin`, folder,
    });
    await pool.query(`UPDATE ${table} SET ${column}=? WHERE ${idCol}=?`, [url, r.id]);
    await recordAsset(r.owner, kind, key, url, dec.mimetype, dec.buffer.length);
    moved++;
  }
  console.log(`${table}.${column}: ${APPLY ? "migrated" : "would migrate"} ${moved} row(s)`);
  return moved;
}

(async () => {
  if (!storage.isConfigured()) {
    console.error("❌ Object storage is not configured (set R2_* or AWS_* env). Aborting.");
    process.exit(1);
  }
  console.log(APPLY ? "▶ Applying media migration…" : "🔎 DRY RUN (pass --apply to execute)");
  try {
    let total = 0;
    total += await migrateColumn({ table: "users",    idCol: "id", ownerCol: "id",      column: "avatar",            kind: "avatar", folder: "avatars" });
    for (const col of ["front_image", "back_image", "selfie_image", "certificate_image"]) {
      total += await migrateColumn({ table: "kyc_docs", idCol: "id", ownerCol: "user_id", column: col, kind: "kyc", folder: "kyc" });
    }
    total += await migrateColumn({ table: "bookings", idCol: "id", ownerCol: "customer_id", column: "completion_proof", kind: "proof", folder: "proof" });
    console.log(`\nDone. ${APPLY ? "Migrated" : "Would migrate"} ${total} value(s).`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  }
})();
