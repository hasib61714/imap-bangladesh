/**
 * SSLCommerz Payment Utility — IMAP Bangladesh
 * Supports: bKash, Nagad, Rocket, uPay, CelFin, SureCash, Visa, MasterCard, etc.
 *
 * Required .env:
 *   SSLCOMMERZ_STORE_ID       = your_store_id
 *   SSLCOMMERZ_STORE_PASSWORD = your_store_password
 *   SSL_IS_SANDBOX            = true | false
 *   BACKEND_URL               = https://imap-backend-mghb.onrender.com
 *   FRONTEND_URL              = https://hasib61714.github.io/imap-bangladesh
 *
 * WHY THIS TALKS TO THE API DIRECTLY INSTEAD OF USING `sslcommerz-lts`
 * ───────────────────────────────────────────────────────────────────
 * The SDK sends the session request as a MULTIPART body built with
 * `form-data` and posted through `node-fetch@2`. Against this store, on
 * Node 24, SSLCommerz answered every such request with
 *
 *     status: FAILED
 *     failedreason: "Store Credential Error Or Store is De-active"
 *
 * The credentials were correct. The same fields, same store, same endpoint,
 * sent as `application/x-www-form-urlencoded`, returned SUCCESS with a
 * gateway URL. So the failure was the encoding, and the message the gateway
 * chose for it pointed at the credentials — which is the worst possible
 * place to be sent looking, and cost real time.
 *
 * The SDK's entire job was building that body and posting it. Node has had
 * `fetch` and `URLSearchParams` built in since 18, so doing it here removes
 * a dependency that pulls in `node-fetch@2` and `form-data`, and removes the
 * layer that was corrupting the request.
 *
 * The two endpoints are the ones SSLCommerz documents:
 *   session    POST {base}/gwprocess/v4/api.php
 *   validation GET  {base}/validator/api/validationserverAPI.php
 */

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

const BASE = () => (isSandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com");

/** A gateway that does not answer must not hang a request forever. */
const TIMEOUT_MS = 20000;

async function postForm(url, fields) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    // SSLCommerz rejects a missing required field more clearly than an
    // empty one, so undefined is omitted rather than sent as "".
    if (v !== undefined && v !== null) body.append(k, String(v));
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // A gateway that answers with HTML is a gateway that is down or has
    // moved. Surface that rather than a JSON parse error from deep inside.
    throw new Error(`SSLCommerz returned a non-JSON response (HTTP ${res.status})`);
  }
}

async function initiatePayment({ orderId, amount, currency = "BDT", customer, product, successUrl, failUrl, cancelUrl }) {
  if (!storeId || !storePass) throw new Error("SSLCommerz credentials not set");

  const backendUrl  = process.env.BACKEND_URL  || "http://localhost:5001";
  const frontendUrl = process.env.FRONTEND_APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";

  return postForm(`${BASE()}/gwprocess/v4/api.php`, {
    store_id: storeId,
    store_passwd: storePass,

    total_amount: parseFloat(amount).toFixed(2),
    currency,
    tran_id: orderId,

    success_url: successUrl || `${backendUrl}/api/payments/success`,
    fail_url:    failUrl    || `${frontendUrl}?payment=failed&tran_id=${encodeURIComponent(orderId)}`,
    cancel_url:  cancelUrl  || `${frontendUrl}?payment=cancelled&tran_id=${encodeURIComponent(orderId)}`,
    // P1-3: the IPN is the ONLY path that moves money — the redirect
    // handlers just redirect. If this URL is not reachable from the public
    // internet, a payment will complete at the gateway and never settle here.
    ipn_url: `${backendUrl}/api/payments/ipn`,

    product_name:     product?.name     || "IMAP Service",
    product_category: product?.category || "Service",
    product_profile:  "service",

    cus_name:    customer?.name    || "IMAP Customer",
    cus_email:   customer?.email   || "customer@imap.com.bd",
    cus_phone:   customer?.phone   || "unknown",
    cus_add1:    customer?.address || "Dhaka, Bangladesh",
    cus_city:    customer?.city    || "Dhaka",
    cus_country: "Bangladesh",

    shipping_method: "NO",
    num_of_item: 1,
  });
}

/**
 * Ask the gateway what it actually settled.
 *
 * The caller must treat this as the authority over anything the IPN body
 * claimed — `routes/payments.js` does, using `validated.amount` rather than
 * the posted amount.
 */
async function validatePayment(valId) {
  if (!storeId || !storePass) throw new Error("SSLCommerz credentials not set");

  const url = new URL(`${BASE()}/validator/api/validationserverAPI.php`);
  url.searchParams.set("val_id", valId);
  url.searchParams.set("store_id", storeId);
  url.searchParams.set("store_passwd", storePass);
  url.searchParams.set("format", "json");

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`SSLCommerz validation returned a non-JSON response (HTTP ${res.status})`);
  }
}

/**
 * Ask the gateway what happened to one transaction, by OUR id.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The IPN is the only path that settles a payment (P1-3 — the redirect
 * handlers deliberately do nothing but redirect). That is the right shape
 * for security and the wrong shape for reliability on its own: an IPN is a
 * server-to-server callback, and it can be missed. A cold start, a deploy, a
 * network blip, a backend not reachable from the public internet — and the
 * customer has paid while the platform has no idea.
 *
 * This closes that without weakening anything, because it asks the SAME
 * authority the IPN handler asks. The browser tells us only which
 * transaction to look up; the gateway says whether it was paid and for how
 * much, and `settlePayment` reconciles that against the amount we recorded
 * when the session was created (P1-4).
 *
 * Returns the transaction element, or null when the gateway has never heard
 * of it.
 */
async function queryTransaction(tranId) {
  if (!storeId || !storePass) throw new Error("SSLCommerz credentials not set");

  const url = new URL(`${BASE()}/validator/api/merchantTransIDvalidationAPI.php`);
  url.searchParams.set("tran_id", tranId);
  url.searchParams.set("store_id", storeId);
  url.searchParams.set("store_passwd", storePass);
  url.searchParams.set("format", "json");

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`SSLCommerz transaction query returned a non-JSON response (HTTP ${res.status})`);
  }

  const elements = Array.isArray(body.element) ? body.element : [];
  // The gateway returns one element per attempt. A transaction can be tried,
  // fail, and be tried again, so the SETTLED one is what matters — not
  // whichever happens to be first.
  return elements.find((e) => e.status === "VALID" || e.status === "VALIDATED") || elements[0] || null;
}

function isConfigured() { return !!(storeId && storePass); }

/** What an operator health check can safely be told. Never the secret. */
function describe() {
  return {
    configured: isConfigured(),
    mode: isSandbox ? "sandbox" : "live",
    base: BASE(),
    storeId: storeId ? `${String(storeId).slice(0, 6)}…` : null,
  };
}

module.exports = { initiatePayment, validatePayment, queryTransaction, isConfigured, describe };
