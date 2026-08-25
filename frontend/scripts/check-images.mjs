/**
 * The image set, checked against the slots that reference it.
 *
 *   node scripts/check-images.mjs
 *
 * WHY THIS IS A BUILD STEP
 * ────────────────────────
 * `components/AppImage.jsx` draws the brand tile when a file is absent. That
 * is the correct runtime behaviour — a missing photograph must not leave a
 * hole in a grid — but it means every mistake in this folder is silent. A file
 * saved under the wrong name is not an error, it is a slot that quietly stays
 * empty. A file nobody references is not an error either; it just ships.
 *
 * Two defects have reached main through this folder already:
 *
 *   1. `utility.webp` and `home-maintenance.webp` were the SAME photograph.
 *      Two categories in one grid showed one picture. Nothing objected,
 *      because a duplicate file is a perfectly valid file.
 *   2. A delivered batch was written under names that matched no slot at all.
 *
 * So this checks the three things that are cheap to check from bytes alone:
 * every file is referenced, every reference that exists is under budget, and
 * no two files are byte-identical.
 *
 * WHAT THIS DELIBERATELY DOES NOT CATCH
 * ─────────────────────────────────────
 * The same scene re-encoded or re-cropped into two slots. Those files differ
 * in every byte and look identical on the page, and finding them needs the
 * pixels, which needs a decoder this build does not have. `scripts/
 * check-image-duplicates.py` does that, and is the thing to run when a batch
 * arrives — this guard is the floor, not the ceiling.
 *
 * Exits non-zero on a failure, so `npm run build` stops.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.join(HERE, "..", "public", "img");
const SLOTS_FILE = path.join(HERE, "..", "src", "constants", "images.js");

/** A phone on mobile data in Bangladesh is the budget this exists to protect. */
const MAX_KB = 180;

// ── Which paths the app actually asks for ────────────────────────
// Read as text rather than imported: this runs before the bundler, and the
// module is a plain map of string literals, so a regex over `/img/...` is
// both sufficient and immune to the module resolving differently here than
// it does in the app.
const slotSrc = fs.readFileSync(SLOTS_FILE, "utf8");
const referenced = new Set(
  [...slotSrc.matchAll(/`\$\{BASE\}(\/[a-z0-9/-]+\.webp)`/g)].map((m) => m[1])
);
if (referenced.size === 0) {
  console.error("  check-images: parsed 0 slots out of constants/images.js — the format changed.");
  process.exit(1);
}

// ── What is on disk ──────────────────────────────────────────────
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(webp|png|jpe?g)$/i.test(e.name)) out.push(full);
  }
  return out;
}

const files = walk(IMG);
const rel = (f) => "/" + path.relative(IMG, f).split(path.sep).join("/");

const problems = [];

// ── 1. A file nobody asks for ────────────────────────────────────
// Dead weight: it is served, it is committed, and no screen will ever show
// it. Usually a name that missed its slot by a character.
const orphans = files.filter((f) => !referenced.has(rel(f)));
if (orphans.length) {
  problems.push([
    `${orphans.length} image(s) match no slot in constants/images.js`,
    orphans.map((f) => `img${rel(f)}`),
    "Rename to the slot name, or add the slot. See docs/IMAGE-BRIEF.md.",
  ]);
}

// ── 2. Over budget ───────────────────────────────────────────────
const heavy = files
  .map((f) => [f, fs.statSync(f).size / 1024])
  .filter(([, kb]) => kb > MAX_KB);
if (heavy.length) {
  problems.push([
    `${heavy.length} image(s) exceed the ${MAX_KB} KB budget`,
    heavy.map(([f, kb]) => `img${rel(f)}  ${kb.toFixed(0)} KB`),
    "Re-encode: python scripts/prepare-images.py <folder> --apply",
  ]);
}

/**
 * Duplicates the owner has looked at and accepted, pending a replacement.
 *
 * This is not a way to make the check quiet. An entry here still prints on
 * every build; it only stops the build failing. The point is that an accepted
 * duplicate stays VISIBLE and attributable, instead of being resolved by
 * re-encoding one of the pair until the hashes differ — which would leave two
 * categories showing one photograph and nothing saying so.
 *
 * Remove an entry the moment that slot gets its own picture. An entry naming
 * a pair that is no longer duplicated fails the build, so this list cannot
 * quietly outlive the thing it excuses.
 */
const ACCEPTED_DUPLICATES = [
  // Owner's call, 2026-08-26: ship the delivered set now, replace later.
  // `utility` needs a rooftop water tank — see prompt 18 in docs/IMAGE-PROMPTS.md.
  ["/category/home-maintenance.webp", "/category/utility.webp"],
];

// ── 3. The same file in two slots ────────────────────────────────
const byHash = new Map();
for (const f of files) {
  const h = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  byHash.set(h, [...(byHash.get(h) || []), f]);
}
const key = (g) => g.map(rel).sort().join(" == ");
const accepted = new Set(ACCEPTED_DUPLICATES.map((p) => [...p].sort().join(" == ")));

const dupes = [...byHash.values()].filter((g) => g.length > 1);
const unexpected = dupes.filter((g) => !accepted.has(key(g)));
const tolerated = dupes.filter((g) => accepted.has(key(g)));

if (unexpected.length) {
  problems.push([
    `${unexpected.length} photograph(s) are used in more than one slot`,
    unexpected.map((g) => g.map((f) => `img${rel(f)}`).join("  ==  ")),
    "One picture per slot. Regenerate that slot, or add the pair to ACCEPTED_DUPLICATES with a reason.",
  ]);
}

// A stale entry is its own failure: it claims a duplicate that no longer
// exists, so the list has stopped describing the repository.
const stale = [...accepted].filter((k) => !dupes.some((g) => key(g) === k));
if (stale.length) {
  problems.push([
    `${stale.length} entr(y/ies) in ACCEPTED_DUPLICATES no longer match a duplicate`,
    stale,
    "That slot has its own picture now. Delete the entry from check-images.mjs.",
  ]);
}

if (problems.length) {
  for (const [headline, lines, fix] of problems) {
    console.error(`\n  ${headline}:\n`);
    for (const l of lines) console.error(`    ${l}`);
    console.error(`\n  ${fix}`);
  }
  console.error();
  process.exit(1);
}

// Empty slots are NOT a failure. The set is meant to be filled one image at a
// time, and AppImage renders a designed tile for the rest.
const empty = [...referenced].filter((r) => !fs.existsSync(path.join(IMG, r.slice(1))));
const filled = referenced.size - empty.length;
console.log(`  images: ${filled}/${referenced.size} slot(s) filled, all within ${MAX_KB} KB.`);
if (empty.length) {
  console.log(`          ${empty.length} still on the fallback tile: ${empty.map((e) => e.split("/").pop().replace(".webp", "")).join(", ")}`);
}
for (const g of tolerated) {
  console.log(`          accepted duplicate, awaiting its own picture: ${g.map((f) => `img${rel(f)}`).join("  ==  ")}`);
}
