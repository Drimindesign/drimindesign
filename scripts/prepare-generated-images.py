"""
Builds the site's project images from the generated set in assets/generated-projects/.

Per project (display, wide, detail-a, detail-b, all PNG):
  - display  -> the 7:5 panel used by the ring, the Projects grid, the tissue pull and the
                case hero: public/projects/<slug>-v2-<700|1000|1400>.webp (centre crop, never enlarged).
  - wide     -> public/projects/<slug>/showcase-<800|1536>.webp
  - detail-a -> public/projects/<slug>/detail-a-<800|1024>.webp
  - detail-b -> public/projects/<slug>/detail-b-<800|1024>.webp

The largest case file is the source's own width, written without resizing, so nothing is
enlarged or double-resampled. WebP quality is high (88-90, near-visually-lossless); the site
serves them through next/image, which delivers the width and format each screen needs.

Run after replacing images in assets/generated-projects/ (the app projects' real screen
exports still come from scripts/prepare-project-details.py).

Usage:  python scripts/prepare-generated-images.py      (needs Pillow)
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "generated-projects"
OUTPUT = ROOT / "public" / "projects"

# The projects currently on the site (the other generated sets wait for their case studies).
SLUGS = ("munsey-pharmacy", "breeze-and-mist", "breeze-and-grains", "shreeram-milks", "speakora-onboarding")

# In the panel file names, so a changed image is a new URL (the files are cached for a week).
# Keep in sync with PROJECT_IMAGE_VERSION in src/content/projects.ts.
VERSION = "v2"
PANEL_ASPECT = 7 / 5  # the ring's panel shape (src/features/project-cylinder/scene/dimensions.ts)
PANEL_WIDTHS = (1400, 1000, 700)  # keep in sync with PROJECT_IMAGE_WIDTHS in src/content/projects.ts
CASE_SMALL = 800
QUALITY_LARGE = 90
QUALITY_SMALL = 88


def save(image: Image.Image, path: Path, quality: int) -> None:
    image.save(path, "WEBP", quality=quality, method=6)
    print(f"  {path.relative_to(ROOT)}  {image.width}x{image.height}  {path.stat().st_size / 1024:.0f} KB")


def resized(image: Image.Image, width: int) -> Image.Image:
    if image.width <= width:
        return image
    return image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)


def centre_crop(image: Image.Image, aspect: float) -> Image.Image:
    width, height = image.size
    if width / height > aspect:
        target = round(height * aspect)
        left = (width - target) // 2
        return image.crop((left, 0, left + target, height))
    target = round(width / aspect)
    top = (height - target) // 2
    return image.crop((0, top, width, top + target))


def main() -> None:
    for slug in SLUGS:
        print(slug)
        folder = OUTPUT / slug
        folder.mkdir(parents=True, exist_ok=True)

        panel = centre_crop(Image.open(SOURCE / slug / f"{slug}-display.png").convert("RGB"), PANEL_ASPECT)
        for width in PANEL_WIDTHS:
            save(resized(panel, width), OUTPUT / f"{slug}-{VERSION}-{width}.webp", QUALITY_LARGE if width >= 1400 else QUALITY_SMALL)

        for name, file in (("showcase", "wide"), ("detail-a", "detail-a"), ("detail-b", "detail-b")):
            image = Image.open(SOURCE / slug / f"{slug}-{file}.png").convert("RGB")
            save(resized(image, CASE_SMALL), folder / f"{name}-{CASE_SMALL}.webp", QUALITY_SMALL)
            save(image, folder / f"{name}-{image.width}.webp", QUALITY_LARGE)


if __name__ == "__main__":
    main()
