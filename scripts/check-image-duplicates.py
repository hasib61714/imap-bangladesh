"""Find the same photograph sitting in two slots.

    python scripts/check-image-duplicates.py                    # the repo's set
    python scripts/check-image-duplicates.py ~/Downloads/batch  # an incoming batch

WHY A SECOND CHECK
──────────────────
`frontend/scripts/check-images.mjs` runs in the build and compares file bytes.
That catches a file literally copied into two slots, which is one of the two
ways this has gone wrong.

It cannot catch the other way, which is the one that keeps happening: the SAME
SCENE generated or cropped twice. Those files differ in every byte, pass every
byte-level check, and look identical in the grid. A delivered set of
twenty-seven images turned out to be about twelve distinct photographs — one
kitchen-floor shot filling `cleaning`, `hero-bg` and `og-share`, one office
shot filling `professional`, `verification` and `step-3-book`. Nothing
automated objected, because nothing was comparing pictures.

Comparing pictures needs a decoder, and the frontend build has none. So this
lives here, next to `prepare-images.py`, which already depends on Pillow.

HOW IT COMPARES
───────────────
An 8x8 grid of mean colour. Deliberately coarse: it survives re-encoding, a
quality change and a modest re-crop — all the things that make two copies of
one photograph differ byte for byte — while still telling two genuinely
different photographs apart. It is a screening tool, not a verdict. Look at
what it reports before deleting anything.

Exits non-zero when it finds something, so it can be a CI step or a hook.
"""
import sys
import pathlib

try:
    from PIL import Image
except ImportError:
    sys.exit("This needs Pillow:  pip install Pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO_IMG = ROOT / "frontend" / "public" / "img"

# Below this the two are the same picture; up to ~26 they are worth a look.
# Both were read off the real failure: the identical pair scored 0.0 and the
# three-way office-scene group scored 13.9 to 25.1, while the closest genuinely
# different pair in the same set scored well above 30.
SAME = 12.0
CLOSE = 26.0


def signature(path):
    """An 8x8 grid of mean RGB, flattened."""
    with Image.open(path) as im:
        return list(im.convert("RGB").resize((8, 8), Image.LANCZOS).getdata())


def distance(a, b):
    """Mean absolute channel difference across the grid. 0 = identical."""
    return sum(abs(x - y) for pa, pb in zip(a, b) for x, y in zip(pa, pb)) / 192


def slot(path, base):
    rel = path.relative_to(base)
    return f"{rel.parent.name}/{rel.stem}" if rel.parent.name else rel.stem


def collect(base):
    return sorted(p for p in base.rglob("*") if p.suffix.lower() in (".webp", ".png", ".jpg", ".jpeg"))


def main():
    batch = pathlib.Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else None

    if batch:
        if not batch.is_dir():
            sys.exit(f"Not a folder: {batch}")
        files = collect(batch)
        base = batch
        print(f"\n  batch : {batch}  ({len(files)} image(s))")
    else:
        files = collect(REPO_IMG)
        base = REPO_IMG
        print(f"\n  set   : {REPO_IMG}  ({len(files)} image(s))")

    if len(files) < 2:
        print("  Nothing to compare.\n")
        return 0

    sig = {f: signature(f) for f in files}

    same, close = [], []
    for i, a in enumerate(files):
        for b in files[i + 1:]:
            d = distance(sig[a], sig[b])
            if d < SAME:
                same.append((d, a, b))
            elif d < CLOSE:
                close.append((d, a, b))

    # An incoming batch is also compared against what is already committed, so
    # a new file that merely repeats an existing photograph is caught before it
    # lands rather than after.
    #
    # A match on the SAME slot name is skipped: that is a batch REPLACING an
    # image, which is the normal case and not a duplicate. Only a new file that
    # repeats a photograph already committed under a DIFFERENT name is a fault.
    against_repo = []
    if batch and REPO_IMG.exists():
        for r in collect(REPO_IMG):
            sr = signature(r)
            for f in files:
                if slot(r, REPO_IMG) == slot(f, base):
                    continue
                d = distance(sr, sig[f])
                if d < SAME:
                    against_repo.append((d, r, f))

    def report(rows, headline, base_a, base_b):
        if not rows:
            return
        print(f"\n  {headline}:")
        for d, a, b in sorted(rows):
            print(f"    {d:5.1f}   {slot(a, base_a):30s} == {slot(b, base_b)}")

    report(same, "SAME PICTURE — one of these slots needs a different photograph", base, base)
    report(close, "Close enough to look alike in a grid — worth a look", base, base)
    report(against_repo, "Already in the repo under another name", REPO_IMG, base)

    total = len(same) + len(against_repo)
    if total:
        print(f"\n  {total} duplicate pair(s). One picture per slot — regenerate, do not reuse.\n")
        return 1

    print("\n  No duplicates. Every image is its own picture.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
