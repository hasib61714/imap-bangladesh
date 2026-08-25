"""
Take generated images from anywhere, and put them where the app looks.

    pip install Pillow
    python scripts/prepare-images.py ~/imap-images
    python scripts/prepare-images.py ~/imap-images --apply
    python scripts/prepare-images.py ~/imap-images --numbered --apply

Without `--apply` it only reports: what it matched, what it would write, and
which slots are still empty. Nothing is touched until you ask.

WHY THIS EXISTS
───────────────
The manual path is: crop to the right aspect ratio, resize to the right pixel
size, convert to WebP, get it under 180 KB, rename it exactly, and put it in
the right one of six folders. Twenty-seven times. Every one of those is a
place to make a small mistake that shows up as a stretched photograph or a
four-second blank on a phone.

This does all six, and refuses to write a file it cannot name confidently.

MATCHING
────────
Files are matched to slots by the slot name appearing anywhere in the
filename, case- and separator-insensitive. All of these land in
`category/cleaning.webp`:

    cleaning.png
    3. cleaning.webp
    ChatGPT Image Aug 26 2026 - cleaning service.png
    Cleaning_Services_final.jpeg

A file matching nothing is listed and skipped, never guessed at. A slot
matched by more than one file is reported rather than resolved — picking one
arbitrarily is how the wrong photograph ends up on a category.

CROPPING
────────
Centre crop to the target aspect ratio, then resize down. Never stretched, and
never upscaled: an image smaller than its target is reported and written at
its own size rather than enlarged into softness. `AppImage` scales it to fit,
and a slightly small photograph looks better than a blurry one.
"""
import sys
import pathlib
import re

try:
    from PIL import Image
except ImportError:
    sys.exit("This needs Pillow:  pip install Pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "public" / "img"

MAX_KB = 180

# slot name -> (folder, width, height)
SLOTS = {}
for name in ["emergency", "home-maintenance", "cleaning", "healthcare", "education",
             "moving", "food", "professional", "security", "errands", "elderly",
             "childcare", "agro", "events", "lifestyle", "repair", "digital",
             "utility", "beauty"]:
    SLOTS[name] = ("category", 1600, 1000)
SLOTS["hero-bg"] = ("hero", 1920, 1080)
for n in ["step-1-browse", "step-2-register", "step-3-book", "step-4-service"]:
    SLOTS[n] = ("steps", 1800, 1200)
SLOTS["verification"] = ("trust", 1400, 980)
SLOTS["portfolio"] = ("empty", 1600, 1000)
SLOTS["og-share"] = ("social", 1200, 630)

# The same order as docs/IMAGE-PROMPTS.md, so a file saved as "7.png" lands in
# the slot prompt 7 was written for. Generators name their output after the
# date, which carries no slot name at all — typing "7" while saving is the
# shortest path from a download dialog to the right folder.
ORDER = [
    "emergency", "home-maintenance", "cleaning", "healthcare", "education",
    "moving", "food", "professional", "security", "errands", "elderly",
    "childcare", "agro", "events", "lifestyle", "repair", "digital",
    "utility", "beauty",
    "hero-bg",
    "step-1-browse", "step-2-register", "step-3-book", "step-4-service",
    "verification", "portfolio", "og-share",
]
assert len(ORDER) == len(SLOTS) == 27


def normalise(s):
    """Lowercase, and every run of non-letters becomes one hyphen."""
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def match_slot(filename, numbered=False):
    """The slot this file belongs to, or None.

    By name: the slot name appearing anywhere in the filename. Longest wins,
    so `home-maintenance` is not beaten by `home`.

    By number (--numbered): a filename that is ENTIRELY a number, optionally
    with a suffix in brackets — "7.png", "7 (1).png". Deliberately strict:
    a generator's default filename is full of dates, and matching a loose
    number in one of those would put a photograph in whichever slot the year
    happened to land on.
    """
    stem = pathlib.Path(filename).stem
    if numbered:
        m = re.fullmatch(r"\s*(\d{1,2})\s*(?:\(\d+\))?\s*", stem)
        if m:
            i = int(m.group(1))
            if 1 <= i <= len(ORDER):
                return ORDER[i - 1]
            return None
    hits = [s for s in SLOTS if s in normalise(stem)]
    return max(hits, key=len) if hits else None


def cover_crop(im, tw, th):
    """Centre crop to the target ratio. Nothing is stretched."""
    w, h = im.size
    target = tw / th
    current = w / h
    if abs(current - target) < 0.001:
        box = (0, 0, w, h)
    elif current > target:                 # too wide: trim the sides
        new_w = int(h * target)
        x = (w - new_w) // 2
        box = (x, 0, x + new_w, h)
    else:                                  # too tall: trim top and bottom
        new_h = int(w / target)
        y = (h - new_h) // 2
        box = (0, y, w, y + new_h)
    return im.crop(box)


def write_webp(im, path, max_kb=MAX_KB):
    """Step quality down until it fits. Returns (kb, quality)."""
    for q in (86, 82, 78, 74, 70, 66, 60):
        path.parent.mkdir(parents=True, exist_ok=True)
        im.save(path, "WEBP", quality=q, method=6)
        kb = path.stat().st_size / 1024
        if kb <= max_kb:
            return kb, q
    return kb, q


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__.strip().split("\n\n")[1])
    src = pathlib.Path(sys.argv[1]).expanduser()
    apply = "--apply" in sys.argv
    numbered = "--numbered" in sys.argv
    if not src.is_dir():
        sys.exit(f"Not a folder: {src}")

    found = {}
    unmatched = []
    for f in sorted(src.iterdir()):
        if f.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        slot = match_slot(f.name, numbered)
        if slot is None:
            unmatched.append(f.name)
        else:
            found.setdefault(slot, []).append(f)

    ambiguous = {s: v for s, v in found.items() if len(v) > 1}
    ready = {s: v[0] for s, v in found.items() if len(v) == 1}

    print(f"\n  source : {src}")
    print(f"  target : {OUT}")
    mode_note = "  · matching by number" if numbered else ""
    print(f"  mode   : {'APPLYING' if apply else 'dry run'}{mode_note}")
    print()

    if ambiguous:
        print("  MORE THAN ONE FILE MATCHES THESE SLOTS — none will be written:")
        for s, files in ambiguous.items():
            print(f"    {s}: {', '.join(f.name for f in files)}")
        print("    Rename or move the ones you do not want, then run again.\n")

    if not ready:
        print("  Nothing matched. Filenames must contain the slot name —")
        print("  see docs/IMAGE-PROMPTS.md for the list.\n")

    written = 0
    for slot, f in sorted(ready.items()):
        folder, tw, th = SLOTS[slot]
        dest = OUT / folder / f"{slot}.webp"
        im = Image.open(f).convert("RGB")
        w, h = im.size
        cropped = cover_crop(im, tw, th)
        small = cropped.size[0] < tw
        final = cropped if small else cropped.resize((tw, th), Image.LANCZOS)

        note = ""
        if small:
            note = f"  (source is only {cropped.size[0]}px wide, target {tw} — kept, not enlarged)"

        if apply:
            kb, q = write_webp(final, dest)
            over = "  ⚠ still over budget" if kb > MAX_KB else ""
            print(f"  ✔ {folder}/{slot}.webp   {final.size[0]}×{final.size[1]}  {kb:.0f} KB  q{q}{over}{note}")
            written += 1
        else:
            print(f"  → {folder}/{slot}.webp   from {f.name}  ({w}×{h} → {final.size[0]}×{final.size[1]}){note}")

    if unmatched:
        print(f"\n  {len(unmatched)} file(s) matched no slot and were ignored:")
        for n in unmatched[:10]:
            print(f"    {n}")
        if len(unmatched) > 10:
            print(f"    … and {len(unmatched) - 10} more")

    missing = [s for s in SLOTS if not (OUT / SLOTS[s][0] / f"{s}.webp").exists() and s not in ready]
    if missing:
        print(f"\n  {len(missing)} slot(s) still empty:")
        for s in missing:
            print(f"    {SLOTS[s][0]}/{s}.webp")
    else:
        print("\n  Every slot is filled.")

    if not apply and ready:
        print(f"\n  Re-run with --apply to write {len(ready)} file(s).")
    print()


if __name__ == "__main__":
    main()
