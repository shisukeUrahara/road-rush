#!/usr/bin/env python3
"""Slice one generated grid sheet into per-element sprite PNGs.

    tools/slice-sheet.py sheet.png energy,sand,rain,...     # names in reading order

Generating N icons in a single grid image is much faster than N separate
calls and keeps the art style consistent, because every icon is drawn in one
pass.

sprite-gen's own `slice-sheet` pads each cell into a fixed standing-figure
shape, which clips square icons — so this cuts on the sheet's real content
bands instead: it finds where the rows and columns of artwork actually are
rather than assuming a perfectly even grid, which generators rarely produce.

Run with sprite-gen's venv python (it has Pillow and NumPy):
    ~/.claude/skills/sprite-gen/.venv/bin/python3 tools/slice-sheet.py ...
"""
import sys
from pathlib import Path

from PIL import Image
import numpy as np

MAX_PX = 160  # icons never display larger than this
PAD = 6       # keep a few px around each cell so outlines are not shaved


def content_bands(occupied: np.ndarray, expected: int) -> list[tuple[int, int]]:
    """Split a 1-D occupancy profile into the `expected` widest runs of content."""
    runs: list[tuple[int, int]] = []
    start = None
    for i, filled in enumerate(occupied):
        if filled and start is None:
            start = i
        elif not filled and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(occupied)))
    runs.sort(key=lambda r: r[1] - r[0], reverse=True)
    return sorted(runs[:expected])


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2

    sheet_path = Path(sys.argv[1])
    names = [n.strip() for n in sys.argv[2].split(",") if n.strip()]
    out_dir = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("public/sprites")
    out_dir.mkdir(parents=True, exist_ok=True)

    cols = int(round(len(names) ** 0.5))
    if cols * cols != len(names):
        print(f"error: {len(names)} names is not a square grid", file=sys.stderr)
        return 1
    rows = cols

    src = Image.open(sheet_path).convert("RGBA")
    arr = np.array(src).astype(int)
    w, h = src.size

    # The generator returns either a magenta or a black backdrop depending on
    # the prompt, so detect which and key that one out. Magenta is matched on
    # "red and blue high, green low" rather than an exact colour, because the
    # exact shade varies per image.
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    magenta = (r > 150) & (b > 150) & (g < 120) & (abs(r - b) < 90)
    black = (r < 40) & (g < 40) & (b < 40)
    background = magenta if magenta.mean() > black.mean() else black
    print(f"keying {'magenta' if background is magenta else 'black'} "
          f"({100 * background.mean():.0f}% of the sheet)")
    foreground = ~background

    row_bands = content_bands(foreground.any(axis=1), rows)
    col_bands = content_bands(foreground.any(axis=0), cols)
    if len(row_bands) != rows or len(col_bands) != cols:
        print(
            f"error: expected a {cols}x{rows} grid but found "
            f"{len(col_bands)}x{len(row_bands)} bands of artwork",
            file=sys.stderr,
        )
        return 1

    rgba = np.array(src).copy()
    rgba[:, :, 3] = np.where(foreground, 255, 0)
    # Keying on black leaves a dark fringe where a sprite's antialiased edge
    # blended into the backdrop; drop edge pixels that are both very dark and
    # already partly transparent.
    if background is black:
        fringe = (rgba[:, :, 3] > 0) & (r < 55) & (g < 55) & (b < 55)
        edge = np.zeros_like(fringe)
        edge[1:-1, 1:-1] = ~foreground[:-2, 1:-1] | ~foreground[2:, 1:-1] | ~foreground[1:-1, :-2] | ~foreground[1:-1, 2:]
        rgba[:, :, 3] = np.where(fringe & edge, 0, rgba[:, :, 3])
    keyed = Image.fromarray(rgba)

    clipped = []
    for i, name in enumerate(names):
        y0, y1 = row_bands[i // cols]
        x0, x1 = col_bands[i % cols]
        cell = keyed.crop((max(0, x0 - PAD), max(0, y0 - PAD), min(w, x1 + PAD), min(h, y1 + PAD)))
        bbox = cell.getbbox()
        if bbox is None:
            print(f"  EMPTY  {name}", file=sys.stderr)
            continue
        # Artwork touching the cell wall means the grid is misaligned and the
        # icon is cut — worth reporting rather than silently shipping.
        cw, ch = cell.size
        if bbox[0] <= 1 or bbox[1] <= 1 or bbox[2] >= cw - 1 or bbox[3] >= ch - 1:
            clipped.append(name)
        cell = cell.crop(bbox)
        cell.thumbnail((MAX_PX, MAX_PX), Image.LANCZOS)
        dest = out_dir / f"{name}.png"
        cell.save(dest, optimize=True)
        print(f"  ok     {name} -> {dest} ({dest.stat().st_size // 1024} KB)")

    if clipped:
        print(f"\nWARNING: possibly clipped: {', '.join(clipped)}", file=sys.stderr)
        return 1
    print(f"\nsliced {len(names)} sprites into {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
