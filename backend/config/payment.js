// ─────────────────────────────────────────────────────────────
//  IMAP – Centralized payment-gateway configuration (SSLCommerz)
//
//  Single source of truth for gateway credentials and mode.
//  Canonical env names (match render.yaml):
//    SSL_STORE_ID, SSL_STORE_PASSWORD, SSL_IS_SANDBOX
//  Legacy names accepted as fallback for backward compatibility:
//    SSLCOMMERZ_STORE_ID, SSLCOMMERZ_STORE_PASSWORD
//
//  Security rule: a mock/auto-success payment path is ONLY permitted
//  outside production. In production, a missing gateway fails safely.
// ─────────────────────────────────────────────────────────────

/**
 * Pure evaluator — derive payment posture from an env-like object.
 * Kept side-effect free so it can be unit-tested without process.env.
 * @param {Record<string,string|undefined>} env
 */
function evaluateConfig(env = {}) {
  const storeId   = env.SSL_STORE_ID       || env.SSLCOMMERZ_STORE_ID       || "";
  const storePass = env.SSL_STORE_PASSWORD || env.SSLCOMMERZ_STORE_PASSWORD || "";
  const isProd    = env.NODE_ENV === "production";

  const sandboxFlag = String(env.SSL_IS_SANDBOX ?? "").trim().toLowerCase();
  // Explicit flag wins; otherwise sandbox in non-production, live in production.
  const isSandbox = sandboxFlag === "true"  ? true
                  : sandboxFlag === "false" ? false
                  : !isProd;

  const configured = Boolean(storeId && storePass);
  // Mock success is a development convenience only — never in production.
  const allowMock = !isProd;

  const problems = [];
  if (isProd && !configured) {
    problems.push("SSLCommerz credentials (SSL_STORE_ID / SSL_STORE_PASSWORD) missing in production — paid flows will be rejected.");
  }
  if (isProd && isSandbox) {
    problems.push("SSL_IS_SANDBOX is true in production — live transactions will not settle.");
  }

  return { storeId, storePass, isProd, isSandbox, configured, allowMock, problems };
}

const cfg = evaluateConfig(process.env);

/** True only when real gateway credentials are present. */
function isConfigured() { return cfg.configured; }

/** True only when a mock/auto-success path may be used (development only). */
function allowMock() { return cfg.allowMock; }

/** Log gateway posture at startup WITHOUT leaking secret values. */
function logStartup(logger) {
  const mode = cfg.configured
    ? (cfg.isSandbox ? "sslcommerz:sandbox" : "sslcommerz:live")
    : (cfg.allowMock ? "mock(dev-only)" : "DISABLED");
  logger.info("Payment gateway posture", {
    configured: cfg.configured,
    sandbox: cfg.isSandbox,
    mockAllowed: cfg.allowMock,
    mode,
    storeIdPresent: Boolean(cfg.storeId),
  });
  for (const p of cfg.problems) logger.warn(`Payment config: ${p}`);
}

module.exports = {
  evaluateConfig,
  isConfigured,
  allowMock,
  logStartup,
  get storeId()   { return cfg.storeId; },
  get storePass() { return cfg.storePass; },
  get isSandbox() { return cfg.isSandbox; },
  get isProd()    { return cfg.isProd; },
};
