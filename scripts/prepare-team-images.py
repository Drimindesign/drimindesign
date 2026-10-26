"""
Builds the ID-card portraits from the team photos in public/team/.

Each portrait is cropped around the face to the card's photo window (src/features/about-team/
scene/card-art.ts, 1.04 : 1) and written as public/team/<slug>.webp. The photos keep their own
tones: no colour or contrast changes.

Usage:  python scripts/prepare-team-images.py      (needs Pillow)
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FOLDER = ROOT / "public" / "team"

ASPECT = 1.04
WIDTH = 832
QUALITY = 84

# slug -> (source file, crop centre x, centre y, crop width), all as fractions of the source.
PORTRAITS = {
    "founder": ("founder.png", 0.49, 0.5, 0.92),
    "brand-designer": ("team2.jpg", 0.54, 0.42, 0.6),
    "developer": ("team3.jpg", 0.52, 0.38, 0.80),
    "motion-designer": ("team5.jpg", 0.49, 0.29, 0.62),
}


def crop(image: Image.Image, cx: float, cy: float, width: float) -> Image.Image:
    w = image.width * width
    h = w / ASPECT
    left = min(max(image.width * cx - w / 2, 0), image.width - w)
    top = min(max(image.height * cy - h / 2, 0), image.height - h)
    return image.crop((round(left), round(top), round(left + w), round(top + h)))


def main() -> None:
    for slug, (name, cx, cy, width) in PORTRAITS.items():
        source = Image.open(FOLDER / name).convert("RGB")
        portrait = crop(source, cx, cy, width).resize((WIDTH, round(WIDTH / ASPECT)), Image.LANCZOS)
        out = FOLDER / f"{slug}.webp"
        portrait.save(out, "WEBP", quality=QUALITY, method=6)
        print(f"{out.relative_to(ROOT)}  {portrait.size}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
