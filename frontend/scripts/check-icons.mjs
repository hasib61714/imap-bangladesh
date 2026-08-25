/**
 * Every icon name the app uses must exist in the registry.
 *
 *   node scripts/check-icons.mjs
 *
 * WHY THIS IS A BUILD STEP
 * ────────────────────────
 * `components/Icon.jsx` renders an unknown name as an empty box of the right
 * size. That is the correct runtime behaviour — a typo must not blank a row or
 * throw inside a list — but it means a misspelled name is INVISIBLE. The
 * category tile still lays out, the menu row still has its gap, and nobody
 * notices until someone looks closely at a screen they had no reason to open.
 *
 * The names mostly do not appear at the call site, which is what makes this
 * worth automating. They come from data:
 *
 *     <Icon name={c.icon} />        ← constants/data.js
 *     <Icon name={ic} />            ← an array three hundred lines away
 *
 * So the check reads BOTH ends: every `icon:"…"` field in the data and every
 * literal `<Icon name="…">`, against the registry's keys. Renaming a registry
 * entry without updating the data now fails the build instead of quietly
 * emptying nineteen tiles.
 *
 * Exits non-zero on a mismatch, so `npm run build` stops.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Every .js/.jsx under src, so a new file is covered without being listed. */
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.jsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);

// ── What the registry knows ──────────────────────────────────
const registry = fs.readFileSync(path.join(SRC, "components", "Icon.jsx"), "utf8");
const known = new Set(
  [...registry.matchAll(/^\s*"([a-z0-9-]+)":\s+[A-Za-z]+(?:Outlined|Filled|TwoTone),/gm)]
    .map((m) => m[1])
);
if (known.size === 0) {
  console.error("  check-icons: parsed 0 names out of the registry — the format changed.");
  process.exit(1);
}

// ── What the app asks for ────────────────────────────────────
const used = new Map();               // name → where it came from
const note = (name, where) => {
  if (!used.has(name)) used.set(name, where);
};

for (const f of files) {
  if (f.endsWith(path.join("components", "Icon.jsx"))) continue;
  const src = fs.readFileSync(f, "utf8");
  const rel = path.relative(SRC, f);

  // A literal at the call site.
  for (const m of src.matchAll(/<Icon\s+name="([^"]+)"/g)) note(m[1], rel);

  // A data field. Only lower-kebab values are icon NAMES — anything else in
  // an `icon:` field is a leftover emoji or a URL, and is reported separately
  // below rather than mistaken for a missing registry entry.
  for (const m of src.matchAll(/\bicon:\s*"([^"]*)"/g)) note(m[1], rel);
}

const missing = [];
const notNames = [];
for (const [name, where] of used) {
  if (known.has(name)) continue;
  (/^[a-z0-9-]+$/.test(name) ? missing : notNames).push([name, where]);
}

if (missing.length) {
  console.error(`\n  ${missing.length} icon name(s) are used but not registered:\n`);
  for (const [n, w] of missing) console.error(`    "${n}"  — ${w}`);
  console.error(`\n  Add them to src/components/Icon.jsx, or fix the spelling.\n`);
  process.exit(1);
}

if (notNames.length) {
  // Not a failure: an `icon:` field holding an emoji is a place the icon set
  // has not reached yet, which is worth seeing without blocking the build.
  console.log(`  ${notNames.length} icon field(s) still hold something other than a registry name:`);
  const byFile = new Map();
  for (const [n, w] of notNames) byFile.set(w, (byFile.get(w) || 0) + 1);
  for (const [w, n] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${String(n).padStart(4)}  ${w}`);
  }
}

console.log(`  icons: ${used.size - notNames.length} name(s) used, all present in a registry of ${known.size}.`);
