"""
NOTE: the panels in use now come from the generated display images (see
scripts/prepare-generated-images.py). Running this script would overwrite them with the
older ones built from assets/projects/.

Builds the ring's project panels from the originals in assets/projects/.

Every panel is 7:5 (the ring's panel shape, see src/features/project-cylinder/scene/dimensions.ts)
and is written as WebP at three widths, one per device tier: public/projects/<slug>-<width>.webp.

Images close to 7:5 are cropped to fill. Much wider or taller ones (side-by-side mockups,
screen flows) would lose half their content to a crop, so they are fitted whole instead:
on a solid fill when their background is plain (screen flows on white), or on a blurred,
darkened copy of themselves when it isn't (photos).

Usage:  python scripts/prepare-project-images.py      (needs Pillow and PyMuPDF)
"""

from pathlib import Path

import pymupdf
from PIL import Image, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "projects"
OUTPUT = ROOT / "public" / "projects"

ASPECT = 7 / 5
WIDTHS = (1400, 1000, 700)
QUALITY = 82
# Crop when the source is within this ratio of 7:5; otherwise fit it whole.
CROP_TOLERANCE = 1.18
# Breathing room around fitted images, as a fraction of the panel's width.
FIT_PADDING = 0.06

# slug -> source file and optional overrides:
#   box:  crop as fractions (left, top, right, bottom) before anything else
#   mode: force "cover" or "fit" instead of choosing by aspect ratio
#   fill: background colour for "fit" (default: detected plain border, else blurred copy)
PROJECTS: dict[str, dict] = {
    "munsey-pharmacy": {"file": "munsey-pharmacy.jpg"},
    # A repeating card pattern: cropping to fill loses nothing.
    "breeze-and-mist": {"file": "breeze-and-mist.webp", "mode": "cover"},
    "breeze-and-grains": {"file": "breeze-and-grains.jpg"},
    "shreeram-milks": {"file": "shreeram-milks.png", "fill": (255, 255, 255)},
    # The PDF artboard has a label and an outer frame; keep only the five screens.
    "speakora-onboarding": {
        "file": "speakora-onboarding.pdf",
        "box": (0.06, 0.13, 0.94, 0.92),
        "fill": (255, 255, 255),
    },
}


def load(path: Path) -> Image.Image:
    if path.suffix.lower() == ".pdf":
        page = pymupdf.open(path)[0]
        pixmap = page.get_pixmap(dpi=144)
        return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    image = Image.open(path)
    if image.mode in ("RGBA", "LA", "P"):
        image = image.convert("RGBA")
        flat = Image.new("RGB", image.size, (255, 255, 255))
        flat.paste(image, mask=image.split()[-1])
        return flat
    return image.convert("RGB")


def crop_fraction(image: Image.Image, box: tuple[float, float, float, float]) -> Image.Image:
    w, h = image.size
    return image.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))


def border_is_plain(image: Image.Image) -> tuple[bool, tuple[int, int, int]]:
    """True (and the colour) when the outer edge of the image is a near-uniform colour."""
    w, h = image.size
    strip = max(2, min(w, h) // 40)
    edges = [image.crop((0, 0, w, strip)), image.crop((0, h - strip, w, h)),
             image.crop((0, 0, strip, h)), image.crop((w - strip, 0, w, h))]
    stats = [ImageStat.Stat(edge) for edge in edges]
    mean = tuple(round(sum(s.mean[c] for s in stats) / len(stats)) for c in range(3))
    spread = max(max(s.stddev) for s in stats)
    return spread < 10, mean  # type: ignore[return-value]


def cover(image: Image.Image, width: int) -> Image.Image:
    height = round(width / ASPECT)
    w, h = image.size
    scale = max(width / w, height / h)
    resized = image.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    left = (resized.width - width) // 2
    top = (resized.height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def fit(image: Image.Image, width: int, fill: tuple[int, int, int] | None = None) -> Image.Image:
    height = round(width / ASPECT)
    plain, colour = border_is_plain(image)
    if fill or plain:
        canvas = Image.new("RGB", (width, height), fill or colour)
    else:
        backdrop = cover(image, width).filter(ImageFilter.GaussianBlur(width / 28))
        canvas = Image.eval(backdrop, lambda v: round(v * 0.55))
    pad = round(width * FIT_PADDING)
    w, h = image.size
    scale = min((width - 2 * pad) / w, (height - 2 * pad) / h)
    resized = image.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    canvas.paste(resized, ((width - resized.width) // 2, (height - resized.height) // 2))
    return canvas


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for slug, options in PROJECTS.items():
        image = load(SOURCE / options["file"])
        if options.get("box"):
            image = crop_fraction(image, options["box"])
        ratio = image.width / image.height
        auto = "cover" if max(ratio / ASPECT, ASPECT / ratio) <= CROP_TOLERANCE else "fit"
        mode = options.get("mode", auto)
        for width in WIDTHS:
            panel = cover(image, width) if mode == "cover" else fit(image, width, options.get("fill"))
            target = OUTPUT / f"{slug}-{width}.webp"
            panel.save(target, "WEBP", quality=QUALITY, method=6)
        print(f"{slug}: {image.width}x{image.height} ({ratio:.2f}) -> {mode}")


if __name__ == "__main__":
    main()
