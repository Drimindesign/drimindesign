import { ART } from "../engine/config";

/*
 * Pixel-art drawing: every call paints whole pixels (no anti-aliased edges), so the art stays
 * crisp when the canvas is scaled up. Coordinates are in art pixels, but shapes are rasterised
 * on a grid ART times finer (each canvas carries scale(ART) as its base transform), so edges
 * and curves step in small pixels. Soft things (sky, light, haze) are dithered with an ordered
 * Bayer pattern on that fine grid rather than blended.
 */

/** One fine pixel, in art units. */
const G = 1 / ART;
const fine = (v: number): number => Math.round(v * ART) / ART;

export type Point = readonly [number, number];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Ordered-dither threshold (0 … 1) for a pixel. */
export function bayer(x: number, y: number): number {
  return BAYER[((y & 3) << 2) | (x & 3)];
}

export class Painter {
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(fine(x), fine(y), Math.max(G, fine(w)), Math.max(G, fine(h)));
  }

  /** One fine pixel. */
  px(x: number, y: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.floor(x * ART) / ART, Math.floor(y * ART) / ART, G, G);
  }

  /** Fills every fine pixel whose centre lies inside the polygon (even-odd). */
  poly(points: readonly Point[], color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const crossings: number[] = [];
    for (let row = Math.floor(minY * ART); row <= Math.ceil(maxY * ART); row++) {
      const yc = (row + 0.5) / ART;
      crossings.length = 0;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [x0, y0] = points[j];
        const [x1, y1] = points[i];
        if ((y0 <= yc && yc < y1) || (y1 <= yc && yc < y0)) crossings.push(x0 + ((yc - y0) * (x1 - x0)) / (y1 - y0));
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const start = Math.ceil(crossings[k] * ART - 0.5);
        const end = Math.floor(crossings[k + 1] * ART - 0.5);
        if (end >= start) ctx.fillRect(start / ART, row / ART, (end - start + 1) / ART, G);
      }
    }
  }

  disc(cx: number, cy: number, r: number, color: string): void {
    this.poly(circle(cx, cy, r, Math.max(8, Math.ceil(r * 4))), color);
  }

  /** A tapered limb: two round ends joined by their tangents. */
  capsule(ax: number, ay: number, bx: number, by: number, ra: number, rb: number, color: string): void {
    this.poly(capsulePoints(ax, ay, bx, by, ra, rb), color);
  }

  /** A one-art-pixel-wide line, stepped on the fine grid so diagonals stay smooth. */
  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    this.ctx.fillStyle = color;
    let x = Math.round(x0 * ART);
    let y = Math.round(y0 * ART);
    const xe = Math.round(x1 * ART);
    const ye = Math.round(y1 * ART);
    const dx = Math.abs(xe - x);
    const dy = -Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.ctx.fillRect(x / ART, y / ART, 1, 1);
      if (x === xe && y === ye) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Dithered fill: a fine pixel is painted where its coverage beats the Bayer threshold. */
  dither(x0: number, y0: number, w: number, h: number, color: string, coverage: (x: number, y: number) => number): void {
    this.ctx.fillStyle = color;
    const left = Math.floor(x0 * ART);
    const right = Math.ceil((x0 + w) * ART);
    for (let row = Math.floor(y0 * ART); row < (y0 + h) * ART; row++) {
      let run = -1;
      const y = (row + 0.5) / ART;
      for (let col = left; col <= right; col++) {
        const on = col < right && coverage((col + 0.5) / ART, y) > bayer(col, row);
        if (on && run < 0) run = col;
        if (!on && run >= 0) {
          this.ctx.fillRect(run / ART, row / ART, (col - run) / ART, G);
          run = -1;
        }
      }
    }
  }
}

export function circle(cx: number, cy: number, r: number, segments: number): Point[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
  });
}

export function capsulePoints(ax: number, ay: number, bx: number, by: number, ra: number, rb: number): Point[] {
  const angle = Math.atan2(by - ay, bx - ax);
  const points: Point[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const a = angle + Math.PI / 2 + (i / steps) * Math.PI;
    points.push([ax + Math.cos(a) * ra, ay + Math.sin(a) * ra]);
  }
  for (let i = 0; i <= steps; i++) {
    const a = angle - Math.PI / 2 + (i / steps) * Math.PI;
    points.push([bx + Math.cos(a) * rb, by + Math.sin(a) * rb]);
  }
  return points;
}

/** A canvas width x height art pixels (ART times as many screen pixels), drawn in art units. */
export function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * ART));
  canvas.height = Math.max(1, Math.ceil(height * ART));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is not available");
  ctx.setTransform(ART, 0, 0, ART, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

/** Draws a canvas made by makeCanvas at art position (x, y), at its art size, on the fine grid. */
export function paste(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, x: number, y: number): void {
  ctx.drawImage(canvas, fine(x), fine(y), canvas.width / ART, canvas.height / ART);
}

/** Snaps an art coordinate to the fine grid. */
export function snap(v: number): number {
  return fine(v);
}

/*
 * Ground drawn in fine columns, batched: runs of neighbouring columns at the same height (and
 * passing `keep`) fill as one rect, and each call sets its colour once. A road that would be
 * thousands of 1-column fills a frame becomes a few dozen.
 * `tops[i]` is the ground's screen y for column `first + i`; the band starts `dy` below it and
 * is `rows` tall, or reaches the bottom of the view when `rows` is null.
 */
export function fillRuns(
  ctx: CanvasRenderingContext2D,
  tops: Float32Array,
  first: number,
  bottom: number,
  color: string,
  dy: number,
  rows: number | null,
  keep?: (column: number) => boolean,
): void {
  ctx.fillStyle = color;
  const columns = tops.length;
  let start = 0;
  while (start < columns) {
    const top = tops[start];
    if (top >= bottom || (keep && !keep(first + start))) {
      start++;
      continue;
    }
    let end = start + 1;
    while (end < columns && tops[end] === top && (!keep || keep(first + end))) end++;
    ctx.fillRect(start / ART, top + dy, (end - start) / ART, rows ?? bottom - top - dy);
    start = end;
  }
}

/*
 * Outline and sun rim for a sprite: transparent pixels touching the shape become a dark
 * outline; shape pixels whose neighbour toward the sun is empty catch a warm rim of light.
 * This is what seats a sprite in the scene's light.
 */
export function outlineAndRim(ctx: CanvasRenderingContext2D, _w: number, _h: number, outline: number, rim: [number, number, number], sunLeft: boolean): void {
  // Works on the canvas's real pixels: a one-fine-pixel outline and rim.
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : solid[y * w + x]);
  const or = (outline >> 16) & 255;
  const og = (outline >> 8) & 255;
  const ob = outline & 255;
  const side = sunLeft ? -1 : 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!solid[y * w + x]) {
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
          data[i] = or;
          data[i + 1] = og;
          data[i + 2] = ob;
          data[i + 3] = 255;
        }
      } else {
        data[i + 3] = 255;
        if (!at(x + side, y) || !at(x, y - 1)) {
          // Light from the sun's side and from above: mix 45% toward the warm rim colour.
          data[i] = Math.round(data[i] * 0.55 + rim[0] * 0.45);
          data[i + 1] = Math.round(data[i + 1] * 0.55 + rim[1] * 0.45);
          data[i + 2] = Math.round(data[i + 2] * 0.55 + rim[2] * 0.45);
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}
