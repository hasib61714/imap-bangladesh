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

const storeId   = process.env.SSLCOMMERZ_STORE_ID;
const storePass = process.env.SSLCOMMERZ_STORE_PASSWORD;
const isSandbox = process.env.NODE_ENV !== "production";

async function initiatePayment({ orderId, amount, currency = "BDT", customer, product, successUrl, failUrl, cancelUrl }) {
  if (!storeId || !storePass) throw new Error("SSLCommerz credentials not set");
  const sslcz      = new SSLCommerz(storeId, storePass, isSandbox);
  const backendUrl = process.env.BACKEND_URL  || "http://localhost:5000";
  const frontendUrl= process.env.FRONTEND_URL || "http://localhost:5173";
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
