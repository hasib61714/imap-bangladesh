/**
 * In-Memory OTP Store with TTL — IMAP Bangladesh
 * For production, replace with Redis: client.setEx(`otp:${phone}`, 300, otp)
 */
const store = new Map();

const OTP_TTL      = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const RESEND_WAIT  = 60 * 1000;     // 1 min before resend

function setOtp(phone, otp) {
  const existing = store.get(phone);
  if (existing && Date.now() < existing.expiry - (OTP_TTL - RESEND_WAIT)) return false;
  const expiry = Date.now() + OTP_TTL;
  store.set(phone, { otp, expiry, attempts: 0 });
  // I-03: unref'd. Each pending OTP scheduled a 5-minute timer that held the
  // event loop open, so a process could not exit until the last OTP expired —
  // graceful shutdown waited up to five minutes, and any test that requested
  // an OTP never terminated. Expiry is enforced by the `expiry` check in
  // verifyOtp() regardless; this timer only reclaims memory.
  const sweep = setTimeout(() => {
    const e = store.get(phone);
    if (e && e.expiry === expiry) store.delete(phone);
  }, OTP_TTL + 1000);
  if (typeof sweep.unref === "function") sweep.unref();
  return true;
}

function verifyOtp(phone, otp) {
  const entry = store.get(phone);
  if (!entry)                      return "expired";
  if (Date.now() > entry.expiry) { store.delete(phone); return "expired"; }
  if (entry.attempts >= MAX_ATTEMPTS) return "blocked";
  if (entry.otp !== String(otp)) { entry.attempts += 1; return "invalid"; }
  store.delete(phone);
  return "ok";
}

function hasPendingOtp(phone) {
  const entry = store.get(phone);
  return !!(entry && Date.now() < entry.expiry);
}

function getSecondsLeft(phone) {
  const entry = store.get(phone);
  if (!entry) return 0;
  return Math.max(0, Math.ceil((entry.expiry - Date.now()) / 1000));
}

module.exports = { setOtp, verifyOtp, hasPendingOtp, getSecondsLeft };
