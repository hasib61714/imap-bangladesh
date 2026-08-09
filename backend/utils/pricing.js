/**
 * Server-authoritative pricing — IMAP
 *
 * Phase 0.5 containment for P0-3.
 *
 * The audited failure: `POST /api/bookings` read `amount`, `total_amount`
 * and `platform_fee` straight from the request body, so the client chose
 * what it paid and what the provider earned.
 *
 * The rule from here on: the client may express *what* it wants to book.
 * It may never express *what it costs*.
 *
 *   provider.hourly_rate  →  category.base_price  →  FAIL CLOSED
 *
 * There is deliberately no client-supplied override and no fallback
 * constant: if the server cannot determine a price it refuses the
 * booking rather than accepting an attacker's number.
 */
const { round2, MAX_AMOUNT } = require("./money");

class PricingError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.name = "PricingError";
    this.status = status;
  }
}

/** Platform commission, percent of the service amount. Server-controlled. */
function feePercent() {
  const raw = process.env.PLATFORM_FEE_PCT;
  if (raw === undefined || raw === "") return 0;   // preserves current economics
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new PricingError("PLATFORM_FEE_PCT is misconfigured", 500);
  }
  return n;
}

/**
 * Resolve the authoritative price for a booking.
 *
 * @param {import('mysql2/promise').Pool|object} db  pool or transaction connection
 * @param {{ providerId: string, categoryId?: number|null }} input
 * @returns {Promise<{amount:number, platform_fee:number, total:number,
 *                    category_id:number|null, provider_row_id:string,
 *                    provider_user_id:string, source:string}>}
 * @throws {PricingError} when the provider is unusable or no price exists
 */
async function quoteBooking(db, { providerId, categoryId = null }) {
  if (!providerId || typeof providerId !== "string") {
    throw new PricingError("provider_id is required", 400);
  }

  const [rows] = await db.query(
    `SELECT p.id, p.user_id, p.hourly_rate, p.category_id, p.is_available,
            p.is_approved, u.is_active,
            c.base_price
       FROM providers p
       LEFT JOIN users u      ON u.id = p.user_id
       LEFT JOIN categories c ON c.id = COALESCE(?, p.category_id)
      WHERE p.id = ?
      LIMIT 1`,
    [categoryId, providerId]
  );
  if (!rows.length) throw new PricingError("Provider not found", 404);

  const p = rows[0];
  if (!p.is_active)    throw new PricingError("Provider account is inactive", 409);
  if (!p.is_available) throw new PricingError("Provider is not currently available", 409);
  if (!p.is_approved)  throw new PricingError("Provider is not approved for bookings", 409);

  // Price source, in order. No client input participates.
  let amount = null;
  let source = null;
  const rate = Number(p.hourly_rate);
  const base = Number(p.base_price);

  if (Number.isFinite(rate) && rate > 0)      { amount = rate; source = "provider.hourly_rate"; }
  else if (Number.isFinite(base) && base > 0) { amount = base; source = "category.base_price"; }

  if (amount === null) {
    // Fail closed. Historically this is where a client value was accepted.
    throw new PricingError(
      "No server-side price is configured for this provider or category. Booking refused.",
      409
    );
  }

  amount = round2(amount);
  if (amount > MAX_AMOUNT) throw new PricingError("Configured price exceeds the platform maximum", 409);

  const platform_fee = round2(amount * (feePercent() / 100));
  const total = round2(amount + platform_fee);

  return {
    amount,
    platform_fee,
    total,
    category_id: categoryId ?? p.category_id ?? null,
    provider_row_id: p.id,
    provider_user_id: p.user_id,
    source,
  };
}

module.exports = { quoteBooking, feePercent, PricingError };
