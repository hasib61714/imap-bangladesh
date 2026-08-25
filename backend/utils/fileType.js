// ─────────────────────────────────────────────────────────────
//  Magic-byte file-type sniffing.
//
//  The client-supplied Content-Type (multer's `file.mimetype`) is
//  attacker-controlled and must NEVER be trusted for a security decision —
//  a malicious payload can be uploaded with a spoofed `image/*` type. These
//  checks read the actual file signature from the buffer instead.
// ─────────────────────────────────────────────────────────────

const SIGNATURES = [
  { mime: "image/jpeg",     test: (b) => b.length >= 3  && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png",      test: (b) => b.length >= 8  && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a },
  { mime: "image/webp",     test: (b) => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
  { mime: "application/pdf", test: (b) => b.length >= 5  && b.toString("ascii", 0, 5) === "%PDF-" },
];

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/** Return the detected MIME from the buffer's magic bytes, or null. */
function detectMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  for (const sig of SIGNATURES) if (sig.test(buffer)) return sig.mime;
  return null;
}

/**
 * Verify an uploaded file is a REAL allowed type by its bytes. Throws a 400
 * on mismatch/corruption. Returns the trustworthy detected MIME, which callers
 * should use for storage instead of the client-declared one.
 */
function assertAllowedUpload(file) {
  const detected = detectMime(file && file.buffer);
  if (!detected || !ALLOWED.has(detected)) {
    const e = new Error("অসমর্থিত বা ক্ষতিগ্রস্ত ফাইল। শুধুমাত্র প্রকৃত JPG, PNG, WEBP বা PDF গ্রহণযোগ্য।");
    e.status = 400;
    throw e;
  }
  return detected;
}

module.exports = { detectMime, assertAllowedUpload, ALLOWED };
