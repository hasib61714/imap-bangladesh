/**
 * Bundle budget — IMAP
 *
 * `UX-CONSTITUTION.md` §7: "a route that exceeds its budget does not ship."
 * As a build step, not an aspiration.
 *
 * A RATCHET, NOT A WALL — and the distinction matters.
 *
 * The Gate-1 target for the consumer initial load is 150 KB gzip. The build
 * measured on 2026-08-09 is ~335 KB. Setting the target as the build ceiling
 * today would fail every build and block the deploy, so it would be turned off
 * within a day and stop protecting anything.
 *
 * Instead each entry carries two numbers:
 *
 *   ceiling  what the build must not exceed. Set from measurement. Enforced.
 *   target   the Gate-1 budget. Reported as a gap on every build.
 *
 * The ceiling can only be lowered. It is lowered as APP-JSX-MIGRATION steps
 * land — Step 0 alone deletes ~1,900 lines of fabricated surfaces. Regression
 * is impossible today; the target arrives by subtraction.
 *
 * This is the same principle the import-boundary checker uses: enforce what
 * the code satisfies now so it cannot get worse, and report the distance to
 * where it must get to.
 */
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUDGET_FILE = path.join(HERE, "..", "bundle-budget.json");

const KB = 1024;
const gzipKb = (source) => gzipSync(typeof source === "string" ? Buffer.from(source) : source, { level: 9 }).length / KB;

/**
 * Every chunk loaded before the entry can render: the entry itself plus its
 * transitive STATIC imports. Dynamic imports are excluded — that is the whole
 * point of route-level splitting, and counting them would make lazy loading
 * look like it achieved nothing.
 *
 * Exported so it can be unit-tested without running a build.
 */
export function initialChunksFor(entryName, bundle) {
  const seen = new Set();
  const walk = (fileName) => {
    if (!fileName || seen.has(fileName)) return;
    const chunk = bundle[fileName];
    if (!chunk) return;
    seen.add(fileName);
    for (const imported of chunk.imports || []) walk(imported);
  };
  const entryFile = Object.keys(bundle).find(
    (f) => bundle[f].type === "chunk" && bundle[f].isEntry && bundle[f].name === entryName
  );
  walk(entryFile);
  return [...seen];
}

/**
 * Pure evaluation, so the rule is testable without a build.
 *
 * @param {Array<{name: string, kind: 'entry'|'chunk', sizeKb: number}>} measured
 * @param {object} budget  contents of bundle-budget.json
 * @param {number} [scale] multiplies every ceiling — used only to prove the
 *                         gate fails on a deliberate overrun
 * @returns {{ rows: Array, failures: Array }}
 */
export function evaluateBudget(measured, budget, scale = 1) {
  const rows = [];
  const failures = [];

  for (const item of measured) {
    const spec = (item.kind === "entry" ? budget.entries : budget.chunks)?.[item.name];
    if (!spec) {
      // An ungoverned chunk is not a failure, but it is worth saying out loud:
      // a new large chunk should be a deliberate decision.
      rows.push({ ...item, ceilingKb: null, targetKb: null, state: "ungoverned" });
      continue;
    }
    if (spec.ungoverned) {
      rows.push({ ...item, ceilingKb: null, targetKb: null, state: "ungoverned", why: spec.why });
      continue;
    }
    const ceiling = spec.ceilingKb * scale;
    const over = item.sizeKb > ceiling;
    rows.push({
      ...item,
      ceilingKb: spec.ceilingKb,
      targetKb: spec.targetKb ?? null,
      state: over ? "over" : "ok",
      gapToTargetKb: spec.targetKb != null ? Math.max(0, item.sizeKb - spec.targetKb) : null,
    });
    if (over) {
      failures.push(
        `${item.kind} "${item.name}" is ${item.sizeKb.toFixed(1)} KB gzip, ceiling ${ceiling.toFixed(1)} KB` +
        (spec.why ? ` — ${spec.why}` : "")
      );
    }
  }

  return { rows, failures };
}

export function bundleBudgetPlugin() {
  return {
    name: "imap-bundle-budget",
    apply: "build",
    generateBundle(_options, bundle) {
      let budget;
      try {
        budget = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
      } catch (err) {
        this.error(`bundle-budget.json could not be read: ${err.message}`);
        return;
      }

      const measured = [];

      // Entries: the initial load, which is the number a user actually waits for.
      for (const entryName of Object.keys(budget.entries || {})) {
        const files = initialChunksFor(entryName, bundle);
        if (files.length === 0) continue;
        let sizeKb = 0;
        for (const f of files) sizeKb += gzipKb(bundle[f].code);
        // Stylesheets emitted by the build load with the shell.
        for (const [f, asset] of Object.entries(bundle)) {
          if (asset.type === "asset" && f.endsWith(".css")) sizeKb += gzipKb(asset.source);
        }
        measured.push({ name: entryName, kind: "entry", sizeKb, files: files.length });
      }

      // Individually governed lazy chunks.
      for (const [, chunk] of Object.entries(bundle)) {
        if (chunk.type !== "chunk" || chunk.isEntry) continue;
        if (!budget.chunks?.[chunk.name]) continue;
        measured.push({ name: chunk.name, kind: "chunk", sizeKb: gzipKb(chunk.code) });
      }

      const scale = Number(process.env.IMAP_BUNDLE_BUDGET_SCALE || "1");
      const { rows, failures } = evaluateBudget(measured, budget, scale);

      const line = (r) => {
        const size = `${r.sizeKb.toFixed(1)} KB`.padStart(10);
        if (r.state === "ungoverned") return `  · ${r.name.padEnd(16)} ${size}   (ungoverned${r.why ? ` — ${r.why}` : ""})`;
        const mark = r.state === "over" ? "✖" : "✔";
        const gap = r.gapToTargetKb ? `  ${r.gapToTargetKb.toFixed(1)} KB above the Gate-1 target of ${r.targetKb} KB` : "";
        return `  ${mark} ${r.name.padEnd(16)} ${size}   ceiling ${String(r.ceilingKb).padStart(5)} KB${gap}`;
      };

      console.log("\nbundle budget (gzip)");
      for (const r of rows.filter((x) => x.kind === "entry")) console.log(line(r));
      for (const r of rows.filter((x) => x.kind === "chunk")) console.log(line(r));
      if (scale !== 1) console.log(`  (ceilings scaled by ${scale} — IMAP_BUNDLE_BUDGET_SCALE is set)`);

      if (failures.length) {
        this.error(
          "bundle budget exceeded — a route that exceeds its budget does not ship:\n" +
          failures.map((f) => `  • ${f}`).join("\n")
        );
      }
      console.log("");
    },
  };
}
