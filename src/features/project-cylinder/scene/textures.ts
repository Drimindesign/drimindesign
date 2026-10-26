import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { stagePalette } from "./palette";

/*
 * Procedural textures for the ring's room, drawn once on a canvas (no image downloads).
 * Grain is added on purpose: large dark gradients band visibly without it.
 */

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const context = element.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  return [element, context];
}

function addGrain(context: CanvasRenderingContext2D, width: number, height: number, amount: number): void {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  context.putImageData(image, 0, 0);
}

/*
 * The floor's own light (used as its emissive map): bright lavender under and around the
 * ring where the panels shine on it, falling off to near black. `ringFraction` is the ring's
 * radius as a fraction of the floor's half-size.
 */
export function createFloorGlowTexture(ringFraction: number): CanvasTexture {
  const size = 1024;
  const [element, context] = canvas(size, size);
  const c = size / 2;
  context.fillStyle = stagePalette.floorDark;
  context.fillRect(0, 0, size, size);
  const glow = context.createRadialGradient(c, c, 0, c, c, c * ringFraction * 3.6);
  glow.addColorStop(0, stagePalette.floorLit);
  glow.addColorStop(0.3, stagePalette.floorLit);
  glow.addColorStop(0.65, stagePalette.floorMid);
  glow.addColorStop(1, stagePalette.floorDark);
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);
  addGrain(context, size, size, 4);
  const texture = new CanvasTexture(element);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/* Tileable value noise for the floor's roughness: satin, not a perfect mirror. */
export function createFloorRoughnessTexture(repeat: number): CanvasTexture {
  const size = 512;
  const [element, context] = canvas(size, size);
  context.fillStyle = "#b8b8b8";
  context.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 24 + Math.random() * 90;
    const shade = Math.random() > 0.5 ? 255 : 0;
    const blotch = context.createRadialGradient(x, y, 0, x, y, r);
    blotch.addColorStop(0, `rgba(${shade}, ${shade}, ${shade}, 0.1)`);
    blotch.addColorStop(1, `rgba(${shade}, ${shade}, ${shade}, 0)`);
    context.fillStyle = blotch;
    // Wrapped copies so the tile has no seams.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        context.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
      }
    }
  }
  addGrain(context, size, size, 24);
  const texture = new CanvasTexture(element);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  return texture;
}

/*
 * A figure's cast shadow (alpha only), long and soft: the ring behind the figures is their
 * light, so shadows stretch away from it. Dark and narrow at the feet (top of the texture),
 * widening and fading toward the far end, like a penumbra growing with distance.
 */
export function createCastShadowTexture(): CanvasTexture {
  const width = 128;
  const height = 512;
  const [element, context] = canvas(width, height);
  for (let y = 0; y < height; y++) {
    const t = y / height;
    const alpha = 0.78 * (1 - t) ** 1.6;
    const half = (0.22 + 0.5 * t) * (width / 2);
    const row = context.createLinearGradient(width / 2 - half, 0, width / 2 + half, 0);
    row.addColorStop(0, "rgba(255, 255, 255, 0)");
    row.addColorStop(0.5, `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
    row.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = row;
    context.fillRect(0, y, width, 1);
  }
  return new CanvasTexture(element);
}

/* Soft round shadow for the figures' feet (alpha only, white = shadow). */
export function createSoftShadowTexture(): CanvasTexture {
  const size = 128;
  const [element, context] = canvas(size, size);
  const c = size / 2;
  const shadow = context.createRadialGradient(c, c, 0, c, c, c);
  shadow.addColorStop(0, "rgba(255, 255, 255, 0.85)");
  shadow.addColorStop(0.5, "rgba(255, 255, 255, 0.35)");
  shadow.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = shadow;
  context.fillRect(0, 0, size, size);
  return new CanvasTexture(element);
}

