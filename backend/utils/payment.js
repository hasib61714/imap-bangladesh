/**
 * SSLCommerz Payment Utility — IMAP Bangladesh
 * Supports: bKash, Nagad, Rocket, uPay, CelFin, SureCash, Visa, MasterCard, etc.
 *
 * Credentials/mode are resolved by config/payment.js (canonical: SSL_STORE_ID,
 * SSL_STORE_PASSWORD, SSL_IS_SANDBOX; legacy SSLCOMMERZ_* accepted). Other .env:
 *   BACKEND_URL      = https://imap-backend-mghb.onrender.com
 *   FRONTEND_APP_URL = https://hasib61714.github.io/imap-bangladesh
 */
const SSLCommerz = require("sslcommerz-lts");
const cfg        = require("../config/payment");

async function initiatePayment({ orderId, amount, currency = "BDT", customer, product, successUrl, failUrl, cancelUrl }) {
  const storeId = cfg.storeId, storePass = cfg.storePass;
  if (!storeId || !storePass) throw new Error("SSLCommerz credentials not set");
  const sslcz      = new SSLCommerz(storeId, storePass, cfg.isSandbox);
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
  const storeId = cfg.storeId, storePass = cfg.storePass;
  if (!storeId || !storePass) throw new Error("SSLCommerz credentials not set");
  const sslcz = new SSLCommerz(storeId, storePass, cfg.isSandbox);
  return await sslcz.validate({ val_id: valId });
}

function isConfigured() { return cfg.isConfigured(); }
function allowMock()   { return cfg.allowMock(); }

module.exports = { initiatePayment, validatePayment, isConfigured, allowMock };
