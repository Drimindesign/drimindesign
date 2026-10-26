"""
Builds the app-screen strips for the project pages from the originals in assets/projects/.
(The photographic case images come from scripts/prepare-generated-images.py.)

Each original is cut into the details a case study shows (the card and the flyer side by
side, close-ups of a print, each screen of an app flow) and written as WebP at two widths:
public/projects/<slug>/<name>-<width>.webp. The aspect ratio of every image is printed so
src/content/projects.ts can declare it (next/image needs it to reserve space: no layout shift).

When the client sends more photos, add them to assets/projects/<slug>/ and list them in
DETAILS with crop (0, 0, 1, 1).

Usage:  python scripts/prepare-project-details.py      (needs Pillow and PyMuPDF)
"""

from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "projects"
OUTPUT = ROOT / "public" / "projects"

WIDTHS = (800, 1600)
QUALITY = 84

# slug -> list of (name, source file, crop box as fractions: left, top, right, bottom)
DETAILS = {
    "shreeram-milks": [
        ("welcome", "shreeram-milks.png", (0.0, 0.0, 0.225, 1.0)),
        ("sign-in", "shreeram-milks.png", (0.252, 0.0, 0.477, 1.0)),
        ("verify", "shreeram-milks.png", (0.504, 0.0, 0.729, 1.0)),
        ("address", "shreeram-milks.png", (0.765, 0.0, 0.99, 1.0)),
    ],
    "speakora-onboarding": [
        ("username", "speakora-onboarding.pdf", (0.066, 0.15, 0.235, 0.885)),
        ("interests", "speakora-onboarding.pdf", (0.25, 0.15, 0.419, 0.885)),
        ("english-test", "speakora-onboarding.pdf", (0.425, 0.15, 0.594, 0.885)),
        ("reading-test", "speakora-onboarding.pdf", (0.595, 0.15, 0.764, 0.885)),
        ("done", "speakora-onboarding.pdf", (0.768, 0.15, 0.937, 0.885)),
    ],
}


def load(name: str) -> Image.Image:
    path = SOURCE / name
    if path.suffix == ".pdf":
        page = pymupdf.open(path)[0]
        pix = page.get_pixmap(dpi=220)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    return Image.open(path).convert("RGB")


def main() -> None:
    cache: dict[str, Image.Image] = {}
    for slug, details in DETAILS.items():
        folder = OUTPUT / slug
        folder.mkdir(parents=True, exist_ok=True)
        for name, source, (left, top, right, bottom) in details:
            image = cache.setdefault(source, load(source))
            w, h = image.size
            crop = image.crop((round(left * w), round(top * h), round(right * w), round(bottom * h)))
            for width in WIDTHS:
                scaled = crop if crop.width <= width else crop.resize((width, round(crop.height * width / crop.width)), Image.LANCZOS)
                scaled.save(folder / f"{name}-{width}.webp", "WEBP", quality=QUALITY, method=6)
            print(f"{slug}/{name}  ratio {crop.width / crop.height:.4f}  source {crop.width}x{crop.height}")


if __name__ == "__main__":
    main()
