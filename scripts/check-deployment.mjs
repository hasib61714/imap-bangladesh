/**
 * Did the deployment actually come up configured?
 *
 *   node scripts/check-deployment.mjs                    # production
 *   node scripts/check-deployment.mjs http://localhost:5001/api
 *
 * WHY
 * ───
 * `/api/health` reports that the process is up and can reach the database. It
 * stays green through a missing payment credential, a sandbox store id
 * deployed in live mode, and an unconfigured document bucket — every one of
 * which is invisible until a real customer hits it.
 *
 * This checks the public surface without credentials, then asks the backend
 * what configuration it actually read. That second part is admin-only, so it
 * prompts for a password. The password is read with the terminal echo off,
 * used once, and never written anywhere.
 */
import readline from "node:readline";
import { stdin, stdout } from "node:process";

const API = (process.argv[2] || "https://imap-backend-mghb.onrender.com/api").replace(/\/$/, "");
const c = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };
const ok = `${c.g}✔${c.x}`, bad = `${c.r}✘${c.x}`, warn = `${c.y}○${c.x}`;

async function call(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { ...opts, signal: AbortSignal.timeout(45_000) });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: r.status, body };
}

const ask = (q, hidden = false) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
  if (hidden) {
    // Echo off: the prompt is written once and every keystroke after it is
    // swallowed, so the password does not appear on screen or in scrollback.
    const onData = (char) => {
      if (["\n", "\r", ""].includes(char.toString())) stdin.removeListener("data", onData);
      else stdout.write("\x1b[2K\x1b[200D" + q);
    };
    stdin.on("data", onData);
  }
  rl.question(q, (a) => { rl.close(); if (hidden) stdout.write("\n"); resolve(a); });
});

console.log(`\n  ${c.b}${API}${c.x}\n`);

// ── Public surface: no credentials, nothing created ──────────
console.log(`  ${c.b}PUBLIC${c.x}`);
const health = await call("/health");
console.log(`    ${health.status === 200 && health.body?.db?.status === "ok" ? ok : bad} health` +
            `  ${c.d}uptime ${health.body?.uptime ?? "?"}s, db ${health.body?.db?.status ?? "?"}${c.x}`);

const dir = await call("/providers");
const listed = dir.body?.total ?? 0;
console.log(`    ${dir.status === 200 ? ok : bad} directory responds  ${c.d}${listed} provider(s) listed${c.x}`);
if (dir.status === 200 && listed === 0) {
  console.log(`      ${c.d}0 is correct where nobody has passed identity verification yet.${c.x}`);
  console.log(`      ${c.d}TRUST-ARCHITECTURE §5 — listing requires a verified case.${c.x}`);
}

// The new routes answer 401 rather than 404 once they are mounted, which is
// how you tell a deployed build from the one before it without logging in.
for (const p of ["/verification/me", "/admin/readiness"]) {
  const r = await call(p);
  console.log(`    ${r.status === 401 ? ok : bad} ${p.padEnd(22)} ${c.d}${r.status}` +
              `${r.status === 404 ? " — this build predates the route" : ""}${c.x}`);
}

// The gateway posts the customer back from its OWN origin, which is not on
// the CORS allowlist. A 302 means the exemption is in place; a 403 means every
// customer who pays lands on a CORS error instead of the app.
const ret = await call("/payments/success", {
  method: "POST",
  headers: { "Origin": "https://sandbox.sslcommerz.com", "Content-Type": "application/x-www-form-urlencoded" },
  body: "tran_id=deployment-check",
  redirect: "manual",
});
console.log(`    ${[302, 303].includes(ret.status) ? ok : bad} gateway return POST  ${c.d}${ret.status}` +
            `${ret.status === 403 ? " — CORS is rejecting the gateway" : ""}${c.x}`);

// ── Configuration: admin only ────────────────────────────────
console.log(`\n  ${c.b}CONFIGURATION${c.x}  ${c.d}(admin sign-in required)${c.x}`);
const identifier = await ask("    admin phone or email: ");
if (!identifier.trim()) {
  console.log(`\n    ${warn} skipped — the public checks above still stand.\n`);
  process.exit(0);
}
const password = await ask("    password: ", true);

const login = await call("/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identifier: identifier.trim(), password }),
});
const token = login.body?.token || login.body?.accessToken;
if (!token) {
  console.log(`\n    ${bad} sign-in failed (${login.status}) — ${JSON.stringify(login.body).slice(0, 120)}\n`);
  process.exit(1);
}

const rd = await call("/admin/readiness", { headers: { Authorization: `Bearer ${token}` } });
if (rd.status !== 200) {
  console.log(`\n    ${bad} readiness returned ${rd.status} — is that account an administrator?\n`);
  process.exit(1);
}

const { environment, payment, sealedStorage, warnings } = rd.body;
console.log(`\n    environment   ${environment.app} / data ${environment.database}`);
console.log(`    backend url   ${environment.backendUrl || c.r + "NOT SET" + c.x}`);
console.log(`\n    ${payment.configured ? ok : bad} payment gateway  ${c.d}${payment.configured
  ? `mode=${payment.mode}  store=${payment.storeId}  ${payment.base}` : "not configured"}${c.x}`);
console.log(`    ${sealedStorage.available ? ok : bad} sealed storage   ${c.d}${sealedStorage.available
  ? `driver=${sealedStorage.driver}${sealedStorage.bucket ? ` bucket=${sealedStorage.bucket}` : ""}`
  : sealedStorage.reason}${c.x}`);

if (warnings?.length) {
  console.log(`\n  ${c.y}WARNINGS${c.x}`);
  for (const w of warnings) console.log(`    ${warn} ${w}`);
  console.log();
} else {
  console.log(`\n  ${c.g}No warnings. Everything this can check is configured.${c.x}\n`);
}
