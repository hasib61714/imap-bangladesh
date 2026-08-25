/**
 * No asset URL may ignore the deployment base.
 *
 * WHAT WENT WRONG
 * ───────────────
 * The site is served from a subpath — https://…github.io/imap-bangladesh/ —
 * and `base` in vite.config.js says so. Vite applies that base to everything
 * it can see at build time: `<link href="/manifest.json">` in index.html comes
 * out as `/imap-bangladesh/manifest.json`, and so does any imported asset.
 *
 * A string assembled at runtime is invisible to it. `constants/images.js` had
 *
 *     const BASE = "/img";
 *
 * so the app asked for `/img/category/cleaning.webp`, the browser resolved
 * that against the DOMAIN root, and all twenty-seven images 404'd — while the
 * files sat correctly deployed one directory along, returning 200 to anyone
 * who typed the right URL.
 *
 * WHY NOTHING CAUGHT IT
 * ─────────────────────
 * Every layer had a good reason to stay quiet. `vite build` succeeded, because
 * a string is a string. The tests passed, because they do not fetch. Dev was
 * fine, because in dev the base IS "/" and the literal happens to be correct —
 * the bug only exists in the artifact nobody runs locally. And `AppImage`
 * renders its brand tile whenever a file will not load, which is exactly right
 * for a missing photograph and an excellent disguise for a broken URL: the
 * grid was intact, the tiles were the right colours, and the page looked
 * finished. It shipped, and it was found by a person looking at the site and
 * asking where the pictures were.
 *
 * WHAT THIS CHECKS
 * ────────────────
 * The BUILT bundle, not the source — so a path inside a comment or a docstring
 * is already gone, and what is left is what the browser will actually request.
 * A literal starting `/img/`, `/icons/`, `/assets/` or `/uploads/` in the
 * output means something bypassed the base again.
 *
 * THE FIX, when this fires: build the URL from Vite's own base.
 *
 *     const BASE = `${import.meta.env.BASE_URL}img`;
 *
 * `BASE_URL` is "/" in dev and "/imap-bangladesh/" in a production build, and
 * always ends in a slash.
 *
 * Runs only when a non-root base is configured; with base "/" there is nothing
 * to get wrong.
 */
import fs from "node:fs";
import path from "node:path";

/** Directories served from the site root that a runtime string might name. */
const ASSET_ROOTS = ["img", "icons", "assets", "uploads"];

export function basePathPlugin() {
  let base = "/";
  let outDir = "dist";

  return {
    name: "base-path-guard",
    apply: "build",

    configResolved(config) {
      base = config.base;
      outDir = config.build.outDir;
    },

    closeBundle() {
      if (base === "/" || base === "./") return;

      const dir = path.resolve(outDir);
      if (!fs.existsSync(dir)) return;

      const files = [];
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, e.name);
          if (e.isDirectory()) walk(full);
          else if (/\.(js|css|html)$/.test(e.name)) files.push(full);
        }
      };
      walk(dir);

      /**
       * A quoted literal that begins at the domain root.
       *
       * The quote on BOTH sides is what makes this precise. The opening quote
       * separates a whole URL from the tail of a based one — `"/img/x.webp"`
       * is the bug, `"/imap-bangladesh/img/x.webp"` is not, and only the
       * preceding character tells them apart.
       *
       * The trailing part must be OPTIONAL, and that is not a detail. The
       * original defect was `const BASE = "/img"` with the rest concatenated
       * on, so after minification the output holds `q="/img"` and every real
       * path is assembled from `q` at runtime. A pattern demanding a slash
       * after `img` matches none of it — the first version of this guard
       * required one, passed the reintroduced bug, and reported "every asset
       * URL carries the base" while the build it had just inspected was
       * broken. It was caught by putting the bug back and watching the guard
       * stay silent, which is the only way that class of mistake surfaces.
       */
      const pattern = new RegExp(
        `(["'\`])/(${ASSET_ROOTS.join("|")})(/[^"'\`]*)?\\1`,
        "g"
      );

      const found = [];
      for (const f of files) {
        const src = fs.readFileSync(f, "utf8");
        for (const m of src.matchAll(pattern)) {
          // Report the URL without the quotes that delimited it.
          found.push([path.relative(dir, f), m[0].slice(1, -1)]);
        }
      }

      if (found.length) {
        console.error(`\n  base path: ${found.length} asset URL(s) ignore the configured base "${base}":\n`);
        for (const [f, url] of found.slice(0, 12)) {
          console.error(`    ${f}\n      ${url}`);
        }
        if (found.length > 12) console.error(`    … and ${found.length - 12} more`);
        console.error(`\n  These resolve against the domain root and will 404 in production.`);
        console.error(`  Build them from Vite's base instead:\n`);
        console.error("    const BASE = `${import.meta.env.BASE_URL}img`;\n");
        throw new Error("base-path-guard: asset URL does not carry the deployment base");
      }

      console.log(`  base path: every asset URL carries "${base}".`);
    },
  };
}
