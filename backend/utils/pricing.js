// ─────────────────────────────────────────────────────────────
//  IMAP – Server-side price authority
//
//  The client NEVER sets the price. The server derives it from the
//  provider's rate / category base price, duration, urgency and any
//  server-validated promo. priceFromInputs() is pure (unit-testable);
//  computeBookingPrice() resolves the inputs from the DB.
// ─────────────────────────────────────────────────────────────

const PLATFORM_FEE_PCT    = clampPct(process.env.PLATFORM_FEE_PCT, 0.10); // commission on service amount
const URGENT_SURCHARGE_PCT = 0.20; // +20% for urgent dispatch
const MIN_AMOUNT          = 50;    // floor service amount (৳)
const DEFAULT_RATE        = 400;   // fallback hourly rate when none known
const MAX_HOURS           = 24;

function clampPct(v, dflt) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : dflt;
}

/**
 * Pure pricing math. No client-supplied amount is accepted here by design.
 * @param {object} i
 * @param {number} i.baseRate   server-known hourly/base rate
 * @param {number} [i.hours]    requested duration (clamped 1..24)
 * @param {boolean}[i.isUrgent] urgent dispatch surcharge
 * @param {number} [i.discount] server-validated discount amount (>=0)
 * @returns {{amount:number, platform_fee:number, total:number, base_rate:number, hours:number, discount:number}}
 */
function priceFromInputs({ baseRate, hours = 1, isUrgent = false, discount = 0 }) {
  const rate = Number.isFinite(baseRate) && baseRate > 0 ? baseRate : DEFAULT_RATE;
  let h = parseFloat(hours);
  if (!Number.isFinite(h) || h < 1) h = 1;
  if (h > MAX_HOURS) h = MAX_HOURS;

  let subtotal = rate * h;
  if (isUrgent) subtotal *= (1 + URGENT_SURCHARGE_PCT);
  subtotal = Math.round(subtotal);

  const safeDiscount = Math.max(0, Math.min(Number(discount) || 0, subtotal));
  const amount = Math.max(MIN_AMOUNT, subtotal - safeDiscount);
  const platform_fee = Math.round(amount * PLATFORM_FEE_PCT);

  return {
    amount,
    platform_fee,
    total: amount + platform_fee,
    base_rate: rate,
    hours: h,
    discount: safeDiscount,
  };
}

/**
 * Resolve a server-validated promo discount. Returns 0 on any miss so a
 * forged/expired code can never increase value or error the booking.
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function resolvePromoDiscount(conn, code, subtotal) {
  if (!code) return 0;
  try {
    const [[promo]] = await conn.query(
      `SELECT discount_pct, discount_amt, min_order, max_uses, used_count
       FROM promos
       WHERE code = ? AND is_active = 1
         AND (valid_from  IS NULL OR valid_from  <= CURDATE())
         AND (valid_until IS NULL OR valid_until >= CURDATE())
       LIMIT 1`,
      [String(code).toUpperCase()]
    );
    if (!promo) return 0;
    if (promo.max_uses != null && promo.used_count >= promo.max_uses) return 0;
    if (promo.min_order != null && subtotal < parseFloat(promo.min_order)) return 0;
    let d = 0;
    if (promo.discount_pct) d += Math.round(subtotal * (parseFloat(promo.discount_pct) / 100));
    if (promo.discount_amt) d += parseFloat(promo.discount_amt);
    return Math.max(0, Math.min(d, subtotal));
  } catch {
    return 0; // promos table absent / malformed → no discount, never throw
  }
}

/**
 * Compute the authoritative booking price from trusted DB state.
 * Throws a 404-tagged error if the provider does not exist.
 * @param {import('mysql2/promise').PoolConnection} conn  (use inside the booking txn)
 */
async function computeBookingPrice(conn, { provider_id, category_id, duration_hours, is_urgent, promo_code }) {
  const [[prov]] = await conn.query(
    "SELECT hourly_rate, category_id FROM providers p WHERE p.id = ?",
    [provider_id]
  );
  if (!prov) { const e = new Error("Provider not found"); e.status = 404; throw e; }

  let baseRate = parseFloat(prov.hourly_rate) || 0;
  const catId = category_id || prov.category_id;
  if (!baseRate && catId) {
    const [[cat]] = await conn.query("SELECT base_price FROM categories WHERE id = ?", [catId]);
    if (cat) baseRate = parseFloat(cat.base_price) || 0;
  }

  const isUrgent = Boolean(is_urgent && Number(is_urgent) !== 0);
  let h = parseFloat(duration_hours);
  if (!Number.isFinite(h) || h < 1) h = 1;
  if (h > MAX_HOURS) h = MAX_HOURS;

  const rate = baseRate > 0 ? baseRate : DEFAULT_RATE;
  let subtotal = Math.round((isUrgent ? rate * (1 + URGENT_SURCHARGE_PCT) : rate) * h);
  const discount = await resolvePromoDiscount(conn, promo_code, subtotal);

  return priceFromInputs({ baseRate: rate, hours: h, isUrgent, discount });
}

module.exports = {
  priceFromInputs,
  computeBookingPrice,
  resolvePromoDiscount,
  PLATFORM_FEE_PCT,
  URGENT_SURCHARGE_PCT,
  MIN_AMOUNT,
};
