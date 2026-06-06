// ─────────────────────────────────────────────────────────────
//  IMAP – Ledger: atomic, idempotent payment settlement
//
//  Single place where a `payments` row transitions to "success" and
//  the corresponding value (booking confirmation OR wallet credit) is
//  applied. Uses a transaction + SELECT ... FOR UPDATE so a payment can
//  never be settled twice (idempotent across IPN + redirect + retries).
//
//  This is the ONLY code path that may credit a wallet from a payment,
//  which is what makes "no API call can mint money" enforceable.
// ─────────────────────────────────────────────────────────────
const pool   = require("../db");
const logger = require("./logger");
const { audit } = require("./audit");

/**
 * Settle a payment by id. Idempotent: a second call after success is a no-op.
 * @param {string} payId        payments.id (== gateway tran_id)
 * @param {string|null} valId   gateway validation id (optional)
 * @returns {Promise<{ok:boolean, already?:boolean, reason?:string, payment?:object, credited?:number}>}
 */
async function finalizePayment(payId, valId = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[pay]] = await conn.query("SELECT * FROM payments WHERE id = ? FOR UPDATE", [payId]);
    if (!pay) { await conn.rollback(); return { ok: false, reason: "not_found" }; }
    if (pay.status === "success") { await conn.rollback(); return { ok: true, already: true, payment: pay }; }

    await conn.query(
      "UPDATE payments SET status='success', gateway_val_id=COALESCE(?, gateway_val_id), paid_at=NOW() WHERE id=?",
      [valId, payId]
    );

    let credited = 0;
    if (pay.purpose === "wallet_topup") {
      // Lock the user row, credit, and write an auditable wallet transaction
      const [[u]] = await conn.query("SELECT balance FROM users WHERE id = ? FOR UPDATE", [pay.user_id]);
      const newBal = parseFloat(u?.balance || 0) + parseFloat(pay.amount);
      await conn.query("UPDATE users SET balance = ? WHERE id = ?", [newBal, pay.user_id]);
      await conn.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, description_bn, description_en, method, ref_id, balance_after)
         VALUES (?,?,?,?,?,?,?,?)`,
        [pay.user_id, "credit", pay.amount, "ওয়ালেট টপ-আপ", "Wallet top-up", pay.method, payId, newBal]
      );
      credited = parseFloat(pay.amount);
    } else if (pay.booking_id) {
      await conn.query(
        "UPDATE bookings SET payment_status='paid', status='confirmed' WHERE id=?",
        [pay.booking_id]
      );
    }

    await conn.commit();

    audit({
      actor_id: pay.user_id, action: "payment.settled",
      target_type: "payment", target_id: payId,
      meta: { purpose: pay.purpose || "booking", amount: pay.amount, credited },
    }).catch(() => {});

    return { ok: true, payment: pay, credited };
  } catch (err) {
    await conn.rollback().catch(() => {});
    logger.error("finalizePayment:", { payId, err: err.message });
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { finalizePayment };
