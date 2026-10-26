/*
 * Edge-refraction map for liquid glass, consumed by an SVG feDisplacementMap.
 * Red/green encode the x/y sampling offset (128 = none). Inside a bevel band along the
 * rounded-rect edge, samples are pulled inward along the surface normal with a convex
 * (circular) profile, so the rim magnifies and bends the backdrop like a thick lens while
 * the centre stays undistorted.
 */

export interface DisplacementMapSpec {
  width: number;
  height: number;
  radius: number;
  /** Width of the refracting band along the edge, in px. */
  bevel: number;
}

/** Signed distance from (px, py) (relative to the centre) to a rounded rect; negative inside. */
function roundedRectSdf(px: number, py: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/** Fills RGBA pixels for the map. Pure, so it can be unit tested without a canvas. */
export function fillDisplacementMap(
  data: Uint8ClampedArray,
  { width, height, radius, bevel }: DisplacementMapSpec,
): void {
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      const depth = -roundedRectSdf(px, py, hw, hh, r);
      let dx = 0;
      let dy = 0;

      if (depth >= 0 && depth < bevel) {
        // Outward normal = gradient of the SDF (central differences, 1px apart).
        const nx = roundedRectSdf(px + 0.5, py, hw, hh, r) - roundedRectSdf(px - 0.5, py, hw, hh, r);
        const ny = roundedRectSdf(px, py + 0.5, hw, hh, r) - roundedRectSdf(px, py - 0.5, hw, hh, r);
        const length = Math.hypot(nx, ny) || 1;
        const t = 1 - depth / bevel;
        // Circular lens profile: flat inside the band, steepening toward the edge.
        const strength = 1 - Math.sqrt(1 - t * t);
        dx = (-nx / length) * strength;
        dy = (-ny / length) * strength;
      }

      const i = (y * width + x) * 4;
      data[i] = 128 + dx * 127;
      data[i + 1] = 128 + dy * 127;
      data[i + 2] = 128;
      // Fully opaque: Chromium premultiplies by alpha, which would zero a transparent map.
      data[i + 3] = 255;
    }
  }
}

/** Renders the map to a PNG data URL. Browser only. */
export function displacementMapDataUrl(spec: DisplacementMapSpec): string {
  const canvas = document.createElement("canvas");
  canvas.width = spec.width;
  canvas.height = spec.height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(spec.width, spec.height);
  fillDisplacementMap(image.data, spec);
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
