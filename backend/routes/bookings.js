const logger = require('../utils/logger');
const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const pool   = require("../db");
const { withTransaction } = require("../db");
const cache  = require("../utils/cache");
const { authMiddleware } = require("../middleware/auth");
const { sendPush } = require("../utils/push");
const { validate, body } = require("../middleware/validate");
const { quoteBooking, PricingError } = require("../utils/pricing");
const { MoneyError } = require("../utils/money");
const { assertTransition, isValidStatus, ledgerRef, TransitionError } = require("../utils/bookingState");
const { participantRole } = require("../utils/bookingAccess");
// I-04: the participation check is no longer performed in this file. The
// route declares an action; the kernel loads the booking and decides. What
// remains here is `participantRole`, which answers a different question —
// which side of the booking this actor is on — for the state machine.
const { requireAuthorization } = require("../middleware/authorize");
const { ACTION, authorizeLoaded } = require("../src/modules/platform/authorization");

// NOTE (P0-3): `amount`, `total_amount` and `platform_fee` are deliberately
// absent from this schema. They are no longer read from the request at all —
// the server derives every money value from the provider and category.
// See backend/utils/pricing.js.
const createBookingRules = validate([
  body("provider_id").isString().trim().notEmpty().isLength({ max: 36 }).withMessage("provider_id required"),
  body("payment_method").optional().isIn(["bKash","Nagad","Rocket","card","cash","wallet"]).withMessage("Invalid payment method"),
  body("service_name_en").optional().isString().isLength({ max: 120 }).withMessage("service_name_en too long"),
  body("service_name_bn").optional().isString().isLength({ max: 120 }).withMessage("service_name_bn too long"),
  body("service_type").optional().isString().isLength({ max: 120 }).withMessage("service_type too long"),
  body("address").optional().isString().isLength({ max: 300 }).withMessage("address too long"),
  body("note").optional().isString().isLength({ max: 1000 }).withMessage("note too long"),
  body("category_id").optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage("category_id must be a positive integer"),
]);

/**
 * How a booking is paid for. Three kinds, and they are not the same thing.
 *
 * WHAT WAS WRONG
 * ──────────────
 * `WALLET_METHODS` used to be {bKash, Nagad, Rocket, card, wallet}, so
 * choosing "bKash" DEBITED THE IN-APP WALLET. It did not open bKash and it
 * did not reach a gateway — it spent an internal balance the customer had
 * never funded, and a customer with an empty wallet (which is every new
 * customer, because P0-6 stopped accounts being created with money) got
 *
 *     400 "Insufficient wallet balance. Please top up first."
 *
 * with no way forward from that screen. The most common way to pay in
 * Bangladesh was a dead end.
 *
 * WHAT IT IS NOW
 * ──────────────
 *   wallet   settles immediately against the in-app balance
 *   cash     pay the provider on completion; the booking is unpaid
 *   gateway  bKash / Nagad / Rocket / card — the booking is created UNPAID
 *            and the customer is sent to POST /api/payments/initiate, which
 *            already exists, already derives the amount server-side, already
 *            refuses to charge twice (P1-5) and already fails closed when
 *            the gateway is unconfigured in production (P0-12).
 *
 * The response says which of the three happened, so the client never has to
 * infer it from the method name.
 */
const WALLET_METHODS = new Set(["wallet"]);
const GATEWAY_METHODS = new Set(["bKash", "Nagad", "Rocket", "card"]);
const isCash = (m) => String(m || "").toLowerCase() === "cash";

/** Map a thrown domain error onto an HTTP response; returns true if handled. */
function sendDomainError(res, err) {
  if (err instanceof PricingError || err instanceof MoneyError || err instanceof TransitionError) {
    return res.status(err.status || 400).json({ error: err.message }), true;
  }
  return false;
}

// ── POST /api/bookings ────────────────────────────────────
router.post("/", authMiddleware, createBookingRules, async (req, res) => {
  try {
    const {
      provider_id, category_id,
      service_name_bn, service_name_en,
      service_type,                       // legacy field name from some pages
      address,
      scheduled_time, scheduled_at,
      // Cash by default. A default that silently spends a balance is the
      // wrong kind of convenient; cash on completion is both the safest
      // default and the most common arrangement in this market.
      payment_method = "cash",
      is_urgent = 0, note = ""
    } = req.body;

    const finalServiceEn = service_name_en || service_type || null;
    const finalServiceBn = service_name_bn || null;
    const finalScheduled = scheduled_time || scheduled_at || null;

    // ── P0-3 / P0-4: the price is computed here, from server data only.
    // Fails closed (409) when no price can be resolved.
    const quote = await quoteBooking(pool, {
      providerId: provider_id,
      categoryId: category_id ? parseInt(category_id, 10) : null,
    });

    if (quote.provider_user_id === req.user.id) {
      return res.status(400).json({ error: "You cannot book your own service" });
    }

    const id  = uuidv4();
    const otp = String(require("crypto").randomInt(100000, 1000000));
    const settleFromWallet = !isCash(payment_method) && WALLET_METHODS.has(payment_method);
    const needsGateway = GATEWAY_METHODS.has(payment_method);

    // ── P0-11: one transaction covers the debit, the booking row, the
    // ledger entry and the loyalty award. Previously these were four
    // independent autocommit statements, so a failure after the debit
    // took the customer's money without creating a booking.
    const result = await withTransaction(async (conn) => {
      if (settleFromWallet) {
        const [deduct] = await conn.query(
          "UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?",
          [quote.total, req.user.id, quote.total]
        );
        if (deduct.affectedRows === 0) {
          const e = new Error("Insufficient wallet balance. Please top up first.");
          e.status = 400;
          throw e;
        }
      }

      await conn.query(
        `INSERT INTO bookings
          (id, customer_id, provider_id, category_id, service_name_bn, service_name_en,
           address, scheduled_time, amount, platform_fee, payment_method, payment_status,
           is_urgent, otp_code, note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, req.user.id, quote.provider_row_id, quote.category_id,
         finalServiceBn, finalServiceEn,
         address || null, finalScheduled,
         quote.amount, quote.platform_fee, payment_method,
         // P1-5: recording the wallet settlement here stops
         // /api/payments/initiate from charging the same booking again.
         settleFromWallet ? "paid" : "pending",
         is_urgent ? 1 : 0, otp, note]
      );

      if (settleFromWallet) {
        await conn.query(
          `INSERT INTO wallet_transactions
             (user_id, type, amount, description_bn, description_en, method, ref_id)
           VALUES (?,?,?,?,?,?,?)`,
          [req.user.id, "debit", quote.total,
           `সেবা বুকিং #${id.slice(0, 8)}`, `Service Booking #${id.slice(0, 8)}`,
           payment_method, ledgerRef("charge", id)]
        );
      }

      // Loyalty is derived from the server-side amount, so it can no
      // longer be inflated by a client-chosen price.
      const pts = Math.floor(quote.amount / 100);
      if (pts > 0) {
        await conn.query("UPDATE users SET points = points + ? WHERE id = ?", [pts, req.user.id]);
        await conn.query(
          "INSERT INTO loyalty_log (user_id, points, reason_bn, reason_en, booking_id) VALUES (?,?,?,?,?)",
          [req.user.id, pts, "বুকিং পয়েন্ট", "Booking points", id]
        );
      }
      return { pts };
    });

    // ── Post-commit, best-effort side effects. Deliberately outside the
    // transaction: a failed notification must not undo a paid booking.
    pool.query(
      "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
      [quote.provider_user_id, "💼", "booking", "নতুন বুকিং", "New Booking",
       `${req.user.name} সেবা বুক করেছে`, `${req.user.name} booked a service`]
    ).catch(e => logger.warn("booking notify failed", { err: e.message }));

    cache.del("admin:stats");
    cache.del("admin:revenue");
    cache.del("admin:bookings:default");
    cache.delPattern(new RegExp(`^bookings:user:${req.user.id}:`));
    cache.del(`user:wallet:${req.user.id}`);
    cache.del(`user:loyalty:${req.user.id}`);
    cache.del(`user:profile:${req.user.id}`);
    cache.del(`provider:jobs:${quote.provider_user_id}`);

    res.status(201).json({
      id,
      otp,
      status: "pending",
      // The authoritative figures, echoed back so the client can reconcile
      // whatever it displayed against what was actually charged.
      amount: quote.amount,
      platform_fee: quote.platform_fee,
      total: quote.total,
      payment_status: settleFromWallet ? "paid" : "pending",
      /**
       * What the customer has to do next, said plainly rather than implied.
       *
       * The client used to have to know which method names meant "already
       * paid" — the same knowledge that was wrong on the server. Now the
       * server says it.
       */
      payment: {
        method: payment_method,
        settled: settleFromWallet,
        // `initiate` is the only one of the three that needs another call.
        next: settleFromWallet ? "none" : (needsGateway ? "initiate" : "pay_on_completion"),
      },
      points_awarded: result.pts,
      message: "Booking created",
    });
  } catch (err) {
    if (sendDomainError(res, err)) return;
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error("create booking:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/bookings  (my bookings) ─────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const safePage  = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
    if (status && status !== "all" && !isValidStatus(status)) {
      return res.status(400).json({ error: "Invalid status filter" });
    }
    const cacheKey = `bookings:user:${req.user.id}:${status || 'all'}:${safePage}:${safeLimit}`;
    const result = await cache.getOrSet(cacheKey, async () => {
      const offset = (safePage - 1) * safeLimit;

      let where = ["b.customer_id = ?"];
      let params = [req.user.id];

      if (status && status !== "all") {
        where.push("b.status = ?");
        params.push(status);
      }

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM bookings b WHERE ${where.join(" AND ")}`,
        params
      );

      const [rows] = await pool.query(
        `SELECT b.*, u.name AS provider_name, u.avatar AS provider_avatar, u.phone AS provider_phone
         FROM bookings b
         LEFT JOIN providers p ON p.id = b.provider_id
         LEFT JOIN users u ON u.id = p.user_id
         WHERE ${where.join(" AND ")}
         ORDER BY b.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, safeLimit, offset]
      );
      return { bookings: rows, total, page: safePage, limit: safeLimit };
    }, 30);
    res.json(result);
  } catch (err) {
    logger.error("my bookings:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/bookings/:id ─────────────────────────────────
// Readable by either participant or an admin. Previously customer-only,
// which left the assigned provider unable to read their own booking.
router.get("/:id", authMiddleware,
  requireAuthorization(ACTION.BOOKING_OBSERVE, { resource: (req) => req.params.id }),
  async (req, res) => {
  try {
    const part = req.authorization.resource;
    const role = participantRole(req.authorization.actor, part);

    const [rows] = await pool.query(
      `SELECT b.*, u.name AS provider_name, u.avatar AS provider_avatar, u.phone AS provider_phone
       FROM bookings b
       LEFT JOIN providers p ON p.id = b.provider_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE b.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Booking not found" });

    const booking = rows[0];
    // The completion OTP is the customer's proof of delivery, and reading it
    // is a SEPARATE decision from reading the booking: the assigned provider
    // may see one and not the other. So it is a second authorization, not an
    // `if` on the role — a field-level rule written as an `if` is a rule no
    // policy test can find.
    //
    // authorizeLoaded, not authorize: the booking is already in hand from the
    // decision above, and the same row must not be fetched twice to answer a
    // second question about it (§36).
    const otp = await authorizeLoaded(
      req.authorization.actor, ACTION.BOOKING_READ_COMPLETION_OTP, part, { db: pool }
    );
    if (!otp.allowed) delete booking.otp_code;
    res.json(booking);
  } catch (err) {
    logger.error("booking detail:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── PATCH /api/bookings/:id/status ───────────────────────
// P0-5 / P0-11: the transition is validated against an explicit state
// machine, applied as a conditional UPDATE guarded on the status we read,
// and any financial effect happens in the same transaction. A repeated
// request loses the race on `affectedRows` and returns 409 without moving
// money. Previously every repeat of `completed` paid the provider again.
router.patch("/:id/status", authMiddleware,
  requireAuthorization(ACTION.BOOKING_TRANSITION, { resource: (req) => req.params.id }),
  async (req, res) => {
  try {
    const { status } = req.body;
    if (!isValidStatus(status)) return res.status(400).json({ error: "Invalid status" });

    // §19: the kernel decided whether this actor may ATTEMPT a transition.
    // Whether pending -> active is legal, and which side of the booking may
    // make it, remains utils/bookingState.js. Two answers to two questions,
    // and neither table is written twice.
    const part = {
      ...req.authorization.resource,
      role: participantRole(req.authorization.actor, req.authorization.resource),
      customerId: req.authorization.resource.customerId,
      providerUserId: req.authorization.resource.providerUserId,
    };

    const outcome = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        "SELECT id, customer_id, provider_id, amount, platform_fee, status, payment_status FROM bookings WHERE id = ? FOR UPDATE",
        [req.params.id]
      );
      if (!rows.length) { const e = new Error("Booking not found"); e.status = 404; throw e; }
      const booking = rows[0];

      // Throws TransitionError (403/409) for illegal or unauthorized moves.
      const { financialEffect } = assertTransition(booking.status, status, part.role);

      const [upd] = await conn.query(
        "UPDATE bookings SET status = ? WHERE id = ? AND status = ?",
        [status, req.params.id, booking.status]
      );
      if (upd.affectedRows === 0) {
        // Another request changed the status between our read and write.
        const e = new Error("Booking was updated by another request. Please retry.");
        e.status = 409;
        throw e;
      }

      const amount = Number(booking.amount) || 0;
      const fee    = Number(booking.platform_fee) || 0;

      if (financialEffect === "payout") {
        await conn.query("UPDATE providers SET total_jobs = total_jobs + 1 WHERE id = ?", [booking.provider_id]);
        const earnings = Math.max(0, amount - fee);
        if (earnings > 0 && part.providerUserId) {
          await conn.query("UPDATE users SET balance = balance + ? WHERE id = ?", [earnings, part.providerUserId]);
          // Unique ref_id — a duplicate payout aborts the transaction
          // instead of crediting twice, even if the status guard is
          // somehow bypassed.
          await conn.query(
            `INSERT INTO wallet_transactions
               (user_id, type, amount, description_bn, description_en, method, ref_id)
             VALUES (?,?,?,?,?,?,?)`,
            [part.providerUserId, "payout", earnings,
             `সেবা সম্পন্ন - বুকিং #${booking.id.slice(0, 8)}`,
             `Service completed - Booking #${booking.id.slice(0, 8)}`,
             "wallet", ledgerRef("payout", booking.id)]
          );
        }
        return { financialEffect, earnings };
      }

      if (financialEffect === "refund") {
        // Only refund what was actually taken. A booking that never
        // settled from the wallet has nothing to return.
        if (booking.payment_status === "paid") {
          const refundAmt = amount + fee;
          if (refundAmt > 0) {
            await conn.query("UPDATE users SET balance = balance + ? WHERE id = ?", [refundAmt, booking.customer_id]);
            await conn.query(
              `INSERT INTO wallet_transactions
                 (user_id, type, amount, description_bn, description_en, method, ref_id)
               VALUES (?,?,?,?,?,?,?)`,
              [booking.customer_id, "refund", refundAmt,
               `বুকিং বাতিল রিফান্ড #${booking.id.slice(0, 8)}`,
               `Booking cancellation refund #${booking.id.slice(0, 8)}`,
               "refund", ledgerRef("refund", booking.id)]
            );
            await conn.query("UPDATE bookings SET payment_status = 'refunded' WHERE id = ?", [booking.id]);
          }
          return { financialEffect, refunded: refundAmt };
        }
        return { financialEffect, refunded: 0 };
      }

      return { financialEffect: null };
    });

    // ── Post-commit side effects (never inside the transaction) ──
    const io = req.app.get("io");
    if (io) {
      io.to(`booking_${req.params.id}`).emit("booking_updated", {
        bookingId: req.params.id,
        status,
        updatedAt: new Date().toISOString(),
      });
    }

    const pushMessages = {
      confirmed: { title: "✅ বুকিং নিশ্চিত",  body: "আপনার বুকিং নিশ্চিত হয়েছে।" },
      active:    { title: "🔄 সেবা শুরু হয়েছে", body: "সেবা প্রদানকারী কাজ শুরু করেছেন।" },
      completed: { title: "🎉 সেবা সম্পন্ন",  body: "আপনার সেবা সম্পন্ন হয়েছে। রিভিউ দিন!" },
      cancelled: { title: "❌ বুকিং বাতিল",   body: "আপনার বুকিং বাতিল করা হয়েছে।" },
    };
    const pushMsg = pushMessages[status];
    if (pushMsg) {
      sendPush(part.customerId, { ...pushMsg, url: "/" }).catch(() => {});
      pool.query(
        "INSERT INTO notifications (user_id, icon, type, title_bn, title_en, body_bn, body_en) VALUES (?,?,?,?,?,?,?)",
        [part.customerId, pushMsg.title.slice(0, 2), "booking",
         pushMsg.title, pushMsg.title, pushMsg.body, pushMsg.body]
      ).catch(() => {});
    }

    cache.del("admin:stats");
    cache.del("admin:revenue");
    cache.del("admin:bookings:default");
    cache.delPattern(new RegExp(`^bookings:user:${part.customerId}:`));
    if (part.providerUserId) {
      cache.del(`provider:jobs:${part.providerUserId}`);
      cache.del(`user:wallet:${part.providerUserId}`);
      cache.del(`user:profile:${part.providerUserId}`);
    }
    cache.del(`user:wallet:${part.customerId}`);
    cache.del(`user:profile:${part.customerId}`);

    res.json({ success: true, status, ...outcome });
  } catch (err) {
    if (sendDomainError(res, err)) return;
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error("update booking status:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
