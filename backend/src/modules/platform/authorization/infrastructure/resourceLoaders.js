/**
 * Resource loaders — platform / authorization / infrastructure
 *
 * I-04 §17. Every loader takes an id and returns the authoritative row, or
 * null. None of them takes a request, a body or a role.
 *
 * WHAT EACH ONE RETURNS
 * ─────────────────────
 * The minimum the policies need, named for what it means rather than for the
 * column it came from — `providerUserId` rather than `user_id`, because the
 * whole point of the loader is that the reader does not have to remember
 * which of the three ids on a booking is the one that grants access.
 *
 * SELECT lists are explicit. `SELECT *` on `kyc_docs` would drag up to four
 * multi-megabyte base64 images through an authorization check that only needs
 * to know whose document it is (P1-12).
 *
 * These read legacy tables — `bookings`, `users`, `kyc_docs`. That is
 * deliberate: `users` is authoritative until the cutover (I-03 §32), so the
 * kernel must decide against the same rows the application writes. When the
 * cutover happens, these loaders change and the policies do not.
 */
"use strict";

const { registerLoader } = require("../resources");

/**
 * A booking, with both parties resolved.
 *
 * `providers.user_id` is the join the socket layer was missing when any
 * authenticated user could join any booking room (P0-7). Loading it here
 * means the relationship function cannot forget it.
 */
async function loadBooking(id, { db }) {
  const [rows] = await db.query(
    `SELECT b.id, b.customer_id, b.provider_id, b.status, b.payment_status,
            p.user_id AS provider_user_id
       FROM bookings b
       LEFT JOIN providers p ON p.id = b.provider_id
      WHERE b.id = ?
      LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    type: "booking",
    id: String(r.id),
    customerId: r.customer_id === null ? null : String(r.customer_id),
    providerId: r.provider_id === null ? null : String(r.provider_id),
    providerUserId: r.provider_user_id === null ? null : String(r.provider_user_id),
    status: r.status,
    paymentStatus: r.payment_status,
  };
}

/** An identity document. Sealed evidence — images are never selected here. */
async function loadKycDocument(id, { db }) {
  const [rows] = await db.query(
    "SELECT id, user_id, status, doc_type FROM kyc_docs WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    type: "kyc_document",
    id: String(r.id),
    subjectUserId: r.user_id === null ? null : String(r.user_id),
    status: r.status,
    docType: r.doc_type,
  };
}

async function loadPayment(id, { db }) {
  const [rows] = await db.query(
    "SELECT id, user_id, booking_id, status FROM payments WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    type: "payment",
    id: String(r.id),
    payerUserId: r.user_id === null ? null : String(r.user_id),
    bookingId: r.booking_id === null ? null : String(r.booking_id),
    status: r.status,
  };
}

/**
 * A user, as the SUBJECT of an action — the target of a role change or a
 * suspension, not the actor performing it.
 */
async function loadUser(id, { db }) {
  const [rows] = await db.query(
    "SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    type: "user",
    id: String(r.id),
    legacyRole: r.role,
    isActive: r.is_active === 1 || r.is_active === true,
  };
}

async function loadComplaint(id, { db }) {
  const [rows] = await db.query(
    "SELECT id, user_id, status, assigned_to FROM complaints WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    type: "complaint",
    id: String(r.id),
    raisedByUserId: r.user_id === null ? null : String(r.user_id),
    status: r.status,
    assignedToUserId: r.assigned_to === null ? null : String(r.assigned_to),
  };
}

async function loadEmergencyAlert(id, { db }) {
  const [rows] = await db.query(
    "SELECT id, user_id, status FROM sos_alerts WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    type: "emergency_alert",
    id: String(r.id),
    raisedByUserId: r.user_id === null ? null : String(r.user_id),
    status: r.status,
  };
}

/** `loans` is the route; `microloans` is the table (migration 003). */
async function loadLoan(id, { db }) {
  const [rows] = await db.query(
    "SELECT id, user_id, status FROM microloans WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    type: "loan",
    id: String(r.id),
    applicantUserId: r.user_id === null ? null : String(r.user_id),
    status: r.status,
  };
}

/**
 * A catalogue service. Nobody owns it — AUTHORIZATION-ARCHITECTURE §8 has
 * ownerless resources and this is one. What the loader contributes is
 * EXISTENCE: `PUT /api/services/does-not-exist` previously updated zero rows
 * and returned `{ success: true }`.
 *
 * `/api/services` reads and writes `categories`. The route name and the table
 * name diverged before this phase; the loader follows the table, because the
 * table is what the authorization decision has to be true about.
 */
async function loadService(id, { db }) {
  const [rows] = await db.query("SELECT id, slug, is_active FROM categories WHERE id = ? LIMIT 1", [id]);
  if (!rows.length) return null;
  const r = rows[0];
  return { type: "service", id: String(r.id), slug: r.slug, isActive: r.is_active === 1 };
}

async function loadPromo(id, { db }) {
  const [rows] = await db.query("SELECT id, code, is_active FROM promos WHERE id = ? LIMIT 1", [id]);
  if (!rows.length) return null;
  const r = rows[0];
  return { type: "promo", id: String(r.id), code: r.code, isActive: r.is_active === 1 };
}

let installed = false;

/** Idempotent so a test may call it after resetting the loader table. */
function installResourceLoaders() {
  if (installed) return;
  registerLoader("booking", loadBooking);
  registerLoader("kyc_document", loadKycDocument);
  registerLoader("payment", loadPayment);
  registerLoader("user", loadUser);
  registerLoader("complaint", loadComplaint);
  registerLoader("emergency_alert", loadEmergencyAlert);
  registerLoader("loan", loadLoan);
  registerLoader("service", loadService);
  registerLoader("promo", loadPromo);
  installed = true;
}

/** Test-only: lets a suite re-install after __resetLoadersForTests(). */
function __markUninstalled() {
  installed = false;
}

module.exports = {
  installResourceLoaders,
  __markUninstalled,
  loadBooking,
  loadKycDocument,
  loadPayment,
  loadUser,
  loadComplaint,
  loadEmergencyAlert,
  loadLoan,
  loadService,
  loadPromo,
};
