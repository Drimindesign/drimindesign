import type { Camera } from "../engine/camera";
import { ART, PPM } from "../engine/config";
import { hash, random } from "../engine/noise";
import type { Terrain } from "../engine/terrain";
import { fillRuns, makeCanvas, paste, Painter, snap } from "./painter";
import { blit, glow, STREETLIGHT, type Sprite } from "./props";

const TILE = 256;
/** Streetlights every this many metres. */
const LAMP_SPACING = 22;

const NIGHT = {
  sky: ["#0b0d1c", "#13162c", "#1e1f3d", "#2f2a4f", "#4a3558", "#71425a", "#9a5560"],
  star: "#d8dcf0",
  far: "#1c1d36",
  mid: "#191a2e",
  near: "#111222",
  windowWarm: ["#ffd27a", "#f6b660", "#ffe7b3"],
  windowCool: ["#9fd4ff", "#cfe9ff"],
  asphaltTop: "#646a73",
  asphalt: "#2b2e35",
  asphaltDark: "#23262c",
  dash: "#e9e4d6",
  curb: "#15161b",
  beacon: "#ff4d4d",
} as const;

interface Skyline {
  id: number;
  parallax: number;
  /** Vertical parallax share. */
  lift: number;
  color: string;
  minHeight: number;
  maxHeight: number;
  /** Share of windows lit. */
  lit: number;
}

const LAYERS: readonly Skyline[] = [
  { id: 0, parallax: 0.12, lift: 0.1, color: NIGHT.far, minHeight: 40, maxHeight: 110, lit: 0.04 },
  { id: 1, parallax: 0.3, lift: 0.25, color: NIGHT.mid, minHeight: 50, maxHeight: 150, lit: 0.12 },
  { id: 2, parallax: 0.55, lift: 0.45, color: NIGHT.near, minHeight: 70, maxHeight: 190, lit: 0.18 },
];

/*
 * The modern city at dusk, for the second half of stage 2: a deep evening sky, three layers of
 * skyline (further ones fainter and fewer windows lit), an asphalt street with lane markings,
 * and streetlights pooling soft light on the road. Like the forest, layers are painted once
 * per tile and only composited per frame; the light itself is smooth, not dithered.
 */
export class City {
  private width = 0;
  private height = 0;
  /** Road height of each fine column this frame (art px), reused between frames. */
  private tops = new Float32Array(0);
  private sky: HTMLCanvasElement | null = null;
  private readonly tiles = new Map<string, HTMLCanvasElement>();
  private readonly lamp: Sprite = STREETLIGHT();

  constructor(private readonly terrain: Terrain) {}

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.tiles.clear();
    const [canvas, ctx] = makeCanvas(width, height);
    const p = new Painter(ctx);
    const stops = NIGHT.sky;
    const span = height * 0.72;
    for (let y = 0; y < height; y++) {
      const t = Math.min(0.999, y / span) * (stops.length - 1);
      const i = Math.floor(t);
      p.rect(0, y, width, 1, stops[i]);
      if (i + 1 < stops.length) p.dither(0, y, width, 1, stops[i + 1], () => t - i);
    }
    const rand = random(41);
    for (let i = 0; i < 70; i++) p.px(rand() * width, rand() * height * 0.5, NIGHT.star);
    this.sky = canvas;
  }

  private base(camera: Camera, lift: number): number {
    return Math.round(this.height * 0.7 + (camera.y - (0.2 * this.height) / PPM) * PPM * lift);
  }

  private tile(layer: Skyline, index: number): HTMLCanvasElement {
    const key = `${layer.id}:${index}`;
    const cached = this.tiles.get(key);
    if (cached) return cached;
    const h = Math.ceil(layer.maxHeight + 8);
    const [canvas, ctx] = makeCanvas(TILE, h);
    const p = new Painter(ctx);
    const rand = random(index * 7919 + layer.id * 104729);
    let x = -4;
    while (x < TILE) {
      const w = 14 + Math.floor(rand() * 26);
      const bh = layer.minHeight + Math.floor(rand() * (layer.maxHeight - layer.minHeight));
      const top = h - bh;
      p.rect(x, top, w, bh, layer.color);
      if (rand() < 0.35) p.rect(x + Math.floor(w / 2) - 1, top - 6, 2, 6, layer.color);
      if (rand() < 0.15) p.px(x + Math.floor(w / 2), top - 7, NIGHT.beacon);
      for (let wy = top + 4; wy < h - 4; wy += 4) {
        for (let wx = x + 2; wx < x + w - 2; wx += 3) {
          if (rand() < layer.lit) {
            const warm = rand() < 0.75;
            const palette = warm ? NIGHT.windowWarm : NIGHT.windowCool;
            p.px(wx, wy, palette[Math.floor(rand() * palette.length)]);
          }
        }
      }
      x += w + Math.floor(rand() * 3);
    }
    this.tiles.set(key, canvas);
    return canvas;
  }

  drawBack(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.sky) paste(ctx, this.sky, 0, 0);
    // A warm glow over the city from the street below.
    const g = ctx.createLinearGradient(0, this.height * 0.45, 0, this.height * 0.75);
    g.addColorStop(0, "rgba(255, 140, 90, 0)");
    g.addColorStop(1, "rgba(255, 140, 90, 0.16)");
    ctx.fillStyle = g;
    ctx.fillRect(0, this.height * 0.45, this.width, this.height * 0.3);
    for (const layer of LAYERS) {
      const offset = camera.x * PPM * layer.parallax;
      const base = this.base(camera, layer.lift);
      const first = Math.floor((offset - this.width / 2) / TILE);
      const last = Math.floor((offset + this.width / 2) / TILE);
      for (let i = first; i <= last; i++) {
        const tile = this.tile(layer, i);
        paste(ctx, tile, i * TILE - offset + this.width / 2, base - tile.height / ART + 2);
      }
      // The layer's lower floors continue to the bottom of the view, so a high camera never
      // shows the sky's horizon glow under the buildings.
      ctx.fillStyle = layer.color;
      ctx.fillRect(0, base + 1, this.width, Math.max(0, this.height - base - 1));
    }
  }

  /** The street: lit kerb edge, lane dashes, asphalt, and the dark verge below. */
  drawGround(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const { width: w, height: h } = this;
    const columns = Math.ceil(w * ART);
    if (this.tops.length !== columns) this.tops = new Float32Array(columns);
    const tops = this.tops;
    const first = Math.floor(camera.x * PPM * ART) - Math.round((w * ART) / 2);
    for (let i = 0; i < columns; i++) tops[i] = snap(h / 2 - (this.terrain.height((first + i) / (PPM * ART)) - camera.y) * PPM);
    fillRuns(ctx, tops, first, h, NIGHT.asphaltTop, 0, 1);
    fillRuns(ctx, tops, first, h, NIGHT.asphalt, 1, 7);
    fillRuns(ctx, tops, first, h, NIGHT.asphaltDark, 1, 7, (column) => hash(Math.floor(column / ART), 71) < 0.08);
    fillRuns(ctx, tops, first, h, NIGHT.dash, 3, 1, (column) => {
      const art = Math.floor(column / ART);
      return ((art % 48) + 48) % 48 < 24;
    });
    fillRuns(ctx, tops, first, h, NIGHT.curb, 8, null);
  }


  /** Streetlights with soft cones of light on the road. */
  drawLamps(ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => [number, number], camera: Camera, from: number): void {
    const view = this.width / PPM;
    const first = Math.max(from, Math.floor((camera.x - view) / LAMP_SPACING) * LAMP_SPACING);
    for (let x = first; x < camera.x + view; x += LAMP_SPACING) {
      if (x < from) continue;
      const [sx, sy] = toScreen(x, this.terrain.height(x));
      const lx = sx + 11;
      const ly = sy - 57;
      const g = ctx.createLinearGradient(lx, ly, lx, sy + 4);
      g.addColorStop(0, "rgba(255, 220, 160, 0.34)");
      g.addColorStop(1, "rgba(255, 220, 160, 0.04)");
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(lx - 2, ly);
      ctx.lineTo(lx + 2, ly);
      ctx.lineTo(lx + 22, sy + 4);
      ctx.lineTo(lx - 22, sy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      blit(ctx, this.lamp, sx, sy);
      glow(ctx, lx, ly + 1, 9, "255, 226, 170", 0.6);
    }
  }
}
