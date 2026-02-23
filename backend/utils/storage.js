/**
 * Cloudflare R2 / AWS S3 Storage Utility — IMAP Bangladesh
 *
 * Required .env (R2):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME=imap-media, R2_PUBLIC_URL=https://pub-xxx.r2.dev
 *
 * AWS S3 alternative:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME
 */
const { S3Client, DeleteObjectCommand, HeadBucketCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const path   = require("path");
const crypto = require("crypto");

function buildClient() {
  if (process.env.R2_ACCOUNT_ID) {
    return new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    });
  }
  if (process.env.AWS_ACCESS_KEY_ID) {
    return new S3Client({
      region: process.env.AWS_REGION || "ap-southeast-1",
      credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
    });
  }
  return null;
}

const client = buildClient();
const BUCKET = process.env.R2_BUCKET_NAME || process.env.S3_BUCKET_NAME || "imap-media";

function generateKey(folder, originalName) {
  const ext  = path.extname(originalName || ".jpg").toLowerCase();
  const hash = crypto.randomBytes(8).toString("hex");
  const d    = new Date();
  return `${folder}/${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${hash}${ext}`;
}

async function uploadFile({ buffer, mimetype, originalname, folder = "uploads" }) {
  if (!client) throw new Error("Storage not configured. Add R2_ACCOUNT_ID or AWS_ACCESS_KEY_ID to .env");
  const key    = generateKey(folder, originalname);
  const upload = new Upload({ client, params: { Bucket: BUCKET, Key: key, Body: buffer, ContentType: mimetype || "application/octet-stream" } });
  await upload.done();
  const publicBase = process.env.R2_PUBLIC_URL ||
    (process.env.S3_BUCKET_NAME ? `https://${BUCKET}.s3.${process.env.AWS_REGION||"ap-southeast-1"}.amazonaws.com` : null);
  const url = publicBase ? `${publicBase}/${key}` : key;
  return { key, url };
}

async function deleteFile(key) {
  if (!client) return;
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

function isConfigured() { return !!(client && (process.env.R2_ACCOUNT_ID || process.env.AWS_ACCESS_KEY_ID)); }

async function testConnection() {
  if (!client) return { ok: false, reason: "No credentials" };
  try { await client.send(new HeadBucketCommand({ Bucket: BUCKET })); return { ok: true, bucket: BUCKET }; }
  catch (err) { return { ok: false, reason: err.message }; }
}

module.exports = { uploadFile, deleteFile, isConfigured, testConnection, generateKey };
