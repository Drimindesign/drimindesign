import type { Camera } from "../engine/camera";
import { ART, PPM } from "../engine/config";
import { fbm1, hash, random } from "../engine/noise";
import type { Terrain } from "../engine/terrain";
import { fillRuns, makeCanvas, paste, Painter, snap } from "./painter";

const MOON = {
  sky: "#04050b",
  star: ["#ffffff", "#c9cfe6", "#8d95b3"],
  farHill: "#2b2c33",
  nearHill: "#3c3d45",
  rimLit: "#e7e4dc",
  lit: "#b9b7b2",
  dust: "#8e8c88",
  shade: "#5f5e5c",
  deep: "#2e2d2c",
  pebble: "#6f6d6a",
  ocean: "#2f64b0",
  land: "#5a8f4c",
  cloud: "#eef4ff",
} as const;

/*
 * The Moon: black sky with hard stars, Earth hanging over the horizon, two ranges of grey
 * hills, and the ground lit by a low sun from the left: slopes that face it are bright, the
 * far sides of crater rims fall into shadow. No air, so no haze and no soft edges except the
 * thin glow around Earth.
 */
export class MoonScene {
  private width = 0;
  private height = 0;
  /** Ground height and slope of each fine column this frame, reused between frames. */
  private tops = new Float32Array(0);
  private slopes = new Float32Array(0);
  private backdrop: HTMLCanvasElement | null = null;

  constructor(private readonly terrain: Terrain) {}

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const [canvas, ctx] = makeCanvas(width, height);
    const p = new Painter(ctx);
    p.rect(0, 0, width, height, MOON.sky);
    const rand = random(29);
    for (let i = 0; i < (width * height) / 380; i++) p.px(rand() * width, rand() * height * 0.8, MOON.star[Math.floor(rand() * 3)]);
    // Earth: ocean, continents, clouds, its night side in shadow.
    const ex = Math.round(width * 0.78);
    const ey = Math.round(height * 0.2);
    const r = Math.round(Math.min(width, height) * 0.075);
    const g = ctx.createRadialGradient(ex, ey, r, ex, ey, r + 8);
    g.addColorStop(0, "rgba(120, 180, 255, 0.45)");
    g.addColorStop(1, "rgba(120, 180, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(ex - r - 8, ey - r - 8, (r + 8) * 2, (r + 8) * 2);
    p.disc(ex, ey, r, MOON.ocean);
    for (let i = 0; i < 9; i++) p.disc(ex - r + rand() * r * 2, ey - r + rand() * r * 2, 1 + rand() * r * 0.35, MOON.land);
    for (let i = 0; i < 7; i++) p.rect(ex - r + rand() * r * 2, ey - r + rand() * r * 2, 2 + rand() * r * 0.5, 1, MOON.cloud);
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    p.disc(ex + r * 2.2, ey - r * 0.2, r * 2.1, "#000");
    ctx.restore();
    ctx.globalCompositeOperation = "destination-over";
    p.disc(ex, ey, r, "#0d1830");
    ctx.globalCompositeOperation = "source-over";
    this.backdrop = canvas;
  }

  /** Two ranges of hills at different depths. */
  drawBack(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.backdrop) paste(ctx, this.backdrop, 0, 0);
    const p = new Painter(ctx);
    const { width: w, height: h } = this;
    for (const [parallax, color, scale, amp] of [
      [0.1, MOON.farHill, 140, 42],
      [0.25, MOON.nearHill, 70, 30],
    ] as const) {
      const base = Math.round(h * 0.66 + (camera.y - (0.2 * h) / PPM) * PPM * parallax);
      for (let i = 0; i < w * ART; i++) {
        const x = i / ART;
        const wx = x + camera.x * PPM * parallax;
        const top = snap(base - fbm1(wx / scale, scale, 3) * amp);
        p.rect(x, top, 1 / ART, h - top, color);
      }
    }
  }

  /** The ground: lit and shaded by slope, with pebbles. */
  drawGround(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const { width: w, height: h } = this;
    const g = 1 / ART;
    const columns = Math.ceil(w * ART);
    if (this.tops.length !== columns) {
      this.tops = new Float32Array(columns);
      this.slopes = new Float32Array(columns);
    }
    const { tops, slopes } = this;
    const first = Math.floor(camera.x * PPM * ART) - Math.round((w * ART) / 2);
    for (let i = 0; i < columns; i++) {
      const wx = (first + i) / (PPM * ART);
      tops[i] = snap(h / 2 - (this.terrain.height(wx) - camera.y) * PPM);
      slopes[i] = this.terrain.slope(wx);
    }
    // Sun low on the left: slopes rising to the right face it.
    const slope = (column: number): number => slopes[column - first];
    fillRuns(ctx, tops, first, h, MOON.lit, 0, 1, (column) => slope(column) <= 0.15 && slope(column) >= -0.35);
    fillRuns(ctx, tops, first, h, MOON.rimLit, 0, 1, (column) => slope(column) > 0.15);
    fillRuns(ctx, tops, first, h, MOON.dust, 1, 3, (column) => slope(column) >= -0.35);
    fillRuns(ctx, tops, first, h, MOON.shade, 0, 4, (column) => slope(column) < -0.35);
    fillRuns(ctx, tops, first, h, MOON.shade, 4, 6);
    fillRuns(ctx, tops, first, h, MOON.deep, 10, null);
    ctx.fillStyle = MOON.pebble;
    for (let i = 0; i < columns; i++) {
      const column = first + i;
      const top = tops[i];
      if (top >= h) continue;
      if (hash(column, 81) < 0.12) ctx.fillRect(i / ART, top + 2 + Math.floor(hash(column, 82) * 10), g, g);
      if (hash(column, 83) < 0.04) ctx.fillRect(i / ART, top - 1, g, g);
    }
  }

}
