#!/usr/bin/env python3
"""Center-crop band photos (named by musician_id) to squares in place.

For each image of size W×H, take N = min(W, H). Portrait shots are cropped
from the top center so faces stay in frame; landscape shots use a vertical
center crop. Overwrites each file as a square JPEG.

Expected filenames under ``img/band/``: ``0.jpg``, ``1.jpg``, … matching
``musician_id`` in the JazzSAMBA musicians table / site.js BAND list.

Usage (from processing repo root):

  uv run python jazzsamba-demo/scripts/crop_band_photos.py

  # Or pass files / a directory of ``{musician_id}.jpg``:
  uv run python jazzsamba-demo/scripts/crop_band_photos.py path/to/photos/
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
from pathlib import Path

from PIL import Image

DEMO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIR = DEMO_ROOT / "img" / "band"
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
ID_NAME = re.compile(r"^(\d+)$")


def center_square_crop(img: Image.Image) -> Image.Image:
    """Return an N×N crop where N = min(width, height), top-anchored for portraits."""
    w, h = img.size
    n = min(w, h)
    left = (w - n) // 2
    top = 0 if h >= w else (h - n) // 2
    return img.crop((left, top, left + n, top + n))


def process_one(path: Path, *, quality: int = 90) -> tuple[int, int, int]:
    """Crop ``path`` to a centered square and overwrite as JPEG. Return (w, h, n)."""
    with Image.open(path) as im:
        w, h = im.size
        n = min(w, h)
        square = center_square_crop(im.convert("RGB"))

    # Write via temp file in the same directory so overwrite is atomic-ish.
    dest = path.with_suffix(".jpg")
    with tempfile.NamedTemporaryFile(
        suffix=".jpg", delete=False, dir=dest.parent
    ) as tmp:
        tmp_path = Path(tmp.name)
    try:
        square.save(tmp_path, format="JPEG", quality=quality, optimize=True)
        tmp_path.replace(dest)
        if path.resolve() != dest.resolve() and path.is_file():
            path.unlink()
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise
    return w, h, n


def collect_inputs(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_file() and path.suffix.lower() in EXTS and ID_NAME.match(path.stem):
            files.append(path)
        elif path.is_dir():
            for child in sorted(path.iterdir()):
                if (
                    child.is_file()
                    and child.suffix.lower() in EXTS
                    and ID_NAME.match(child.stem)
                    and child.name != "README.md"
                ):
                    files.append(child)
    # Prefer numeric order.
    files.sort(key=lambda p: int(p.stem))
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "inputs",
        nargs="*",
        type=Path,
        help=f"Image files or directories (default: {DEFAULT_DIR})",
    )
    parser.add_argument("--quality", type=int, default=90)
    args = parser.parse_args()

    sources = (
        collect_inputs(args.inputs) if args.inputs else collect_inputs([DEFAULT_DIR])
    )
    if not sources:
        print(
            f"No musician-id images found under {DEFAULT_DIR} "
            f"(expected 0.jpg, 1.jpg, …). Drop them there and re-run.",
            file=sys.stderr,
        )
        return 1

    for src in sources:
        w, h, n = process_one(src, quality=args.quality)
        out = src.with_suffix(".jpg")
        print(f"{src.name}: {w}×{h} → {n}×{n} (overwrote {out.relative_to(DEMO_ROOT)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
