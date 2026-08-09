/**
 * SSLCommerz Payment Utility — IMAP Bangladesh
 * Supports: bKash, Nagad, Rocket, uPay, CelFin, SureCash, Visa, MasterCard, etc.
 *
 * Required .env:
 *   SSLCOMMERZ_STORE_ID       = your_store_id
 *   SSLCOMMERZ_STORE_PASSWORD = your_store_password
 *   BACKEND_URL               = https://imap-backend-mghb.onrender.com
 *   FRONTEND_URL              = https://hasib61714.github.io/imap-bangladesh
 */
const SSLCommerz = require("sslcommerz-lts");

// P1-17: backend/.env.example documented these as SSL_STORE_ID /
// SSL_STORE_PASSWORD while the code only ever read SSLCOMMERZ_*. Anyone
// following the documented setup silently ran with no gateway, which was
// the precondition for P0-12 (free wallet top-ups). Both spellings are
// accepted now and .env.example has been corrected.
const storeId   = process.env.SSLCOMMERZ_STORE_ID       || process.env.SSL_STORE_ID;
const storePass = process.env.SSLCOMMERZ_STORE_PASSWORD || process.env.SSL_STORE_PASSWORD;

// P1-17: render.yaml provisions SSL_IS_SANDBOX and nothing read it, so
// sandbox mode was inferred from NODE_ENV alone. The explicit flag now
// wins when it is set.
//
// Phase 2.75: the fallback follows the *declared* process environment,
// deliberately NOT the widened env.isProduction(). Every other guard was
// widened so that a development process on production data behaves as
// production — but doing that here would switch a developer's run onto
// the live gateway and move real money. The correct response to that
// configuration is db.js refusing to start, not live charges.
const env = require("../config/environment");
const isSandbox = process.env.SSL_IS_SANDBOX !== undefined && process.env.SSL_IS_SANDBOX !== ""
  ? String(process.env.SSL_IS_SANDBOX).toLowerCase() === "true"
  : !env.isProductionEnvironment();

async function initiatePayment({ orderId, amount, currency = "BDT", customer, product, successUrl, failUrl, cancelUrl }) {
  if (!storeId || !storePass) throw new Error("SSLCommerz credentials not set");
  const sslcz      = new SSLCommerz(storeId, storePass, isSandbox);
  const backendUrl  = process.env.BACKEND_URL  || "http://localhost:5000";
  const frontendUrl = process.env.FRONTEND_APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  const data = {
    total_amount: parseFloat(amount).toFixed(2), currency, tran_id: orderId,
    success_url:  successUrl || `${backendUrl}/api/payments/success`,
    fail_url:     failUrl    || `${frontendUrl}?payment=failed&tran_id=${orderId}`,
    cancel_url:   cancelUrl  || `${frontendUrl}?payment=cancelled&tran_id=${orderId}`,
    ipn_url:      `${backendUrl}/api/payments/ipn`,
    product_name: product?.name || "IMAP Service", product_category: product?.category || "Service", product_profile: "service",
    cus_name:     customer?.name    || "IMAP Customer",
    cus_email:    customer?.email   || "customer@imap.com.bd",
    cus_phone:    customer?.phone   || "unknown",
    cus_add1:     customer?.address || "Dhaka, Bangladesh",
    cus_city:     customer?.city    || "Dhaka",
    cus_country:  "Bangladesh",
    shipping_method: "NO", num_of_item: 1,
  };
  return await sslcz.init(data);
}

async function validatePayment(valId) {
  if (!storeId || !storePass) throw new Error("SSLCommerz credentials not set");
  const sslcz = new SSLCommerz(storeId, storePass, isSandbox);
  return await sslcz.validate({ val_id: valId });
}

function isConfigured() { return !!(storeId && storePass); }

module.exports = { initiatePayment, validatePayment, isConfigured };
