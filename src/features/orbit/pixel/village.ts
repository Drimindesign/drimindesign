import type { Camera } from "../engine/camera";
import { ART, PPM } from "../engine/config";
import { hash, random } from "../engine/noise";
import type { RoadFeature, Terrain } from "../engine/terrain";
import { fillRuns, makeCanvas, paste, Painter, snap } from "./painter";
import { glow } from "./props";

const TILE = 256;
/** Lanterns on bamboo poles along the road, every this many metres. */
const LANTERN_SPACING = 26;
/** Rain streaks on screen at once, and how fast they fall (art px/s). */
const RAIN = { count: 90, speed: 340 } as const;

const MONSOON = {
  sky: ["#0a0f1a", "#0f1826", "#152234", "#1c2d40", "#26394b", "#334553", "#44525a"],
  cloud: "#1a2635",
  moon: "#dfe6f0",
  far: "#142029",
  mid: "#0f1820",
  near: "#0b1218",
  roof: "#16212a",
  doorWarm: ["#ffb34d", "#ffd27a", "#f39a3a"],
  mudTop: "#86664a",
  mud: "#4e3a2a",
  mudDark: "#3e2e22",
  rut: "#5c4532",
  puddle: "#7d8fa1",
  puddleShine: "#c3d0dc",
  verge: "#1e3020",
  soil: "#18120d",
} as const;

interface Layer {
  id: number;
  parallax: number;
  lift: number;
  color: string;
  kind: "hills" | "palms" | "huts";
}

const LAYERS: readonly Layer[] = [
  { id: 0, parallax: 0.12, lift: 0.1, color: MONSOON.far, kind: "hills" },
  { id: 1, parallax: 0.3, lift: 0.25, color: MONSOON.mid, kind: "palms" },
  { id: 2, parallax: 0.55, lift: 0.45, color: MONSOON.near, kind: "huts" },
];

/*
 * An Indian village at night in the monsoon: a low cloudy sky with the moon breaking through,
 * hills with temple towers, coconut palms, and near the road thatched huts whose doorways glow
 * with lamplight. The road is mud: ruts, and wide puddles that hold the sky. Lanterns hang from
 * bamboo poles; rain slants across everything. Like the city, layers are painted once per tile
 * and composited per frame; the road is drawn in batched column runs.
 */
export class Village {
  private width = 0;
  private height = 0;
  private tops = new Float32Array(0);
  private sky: HTMLCanvasElement | null = null;
  private readonly tiles = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly terrain: Terrain,
    private readonly features: readonly RoadFeature[],
  ) {}

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.tiles.clear();
    const [canvas, ctx] = makeCanvas(width, height);
    const p = new Painter(ctx);
    const stops = MONSOON.sky;
    const span = height * 0.72;
    for (let y = 0; y < height; y++) {
      const t = Math.min(0.999, y / span) * (stops.length - 1);
      const i = Math.floor(t);
      p.rect(0, y, width, 1, stops[i]);
      if (i + 1 < stops.length) p.dither(0, y, width, 1, stops[i + 1], () => t - i);
    }
    // The moon behind thin cloud, and long cloud banks across it.
    const g = ctx.createRadialGradient(width * 0.72, height * 0.18, 2, width * 0.72, height * 0.18, 40);
    g.addColorStop(0, "rgba(223, 230, 240, 0.35)");
    g.addColorStop(1, "rgba(223, 230, 240, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height * 0.5);
    p.disc(width * 0.72, height * 0.18, 6, MONSOON.moon);
    const rand = random(17);
    for (let i = 0; i < 14; i++) {
      const y = rand() * height * 0.45;
      p.rect(rand() * width - 40, y, 60 + rand() * 140, 2 + rand() * 3, MONSOON.cloud);
    }
    this.sky = canvas;
  }

  private base(camera: Camera, lift: number): number {
    return Math.round(this.height * 0.7 + (camera.y - (0.2 * this.height) / PPM) * PPM * lift);
  }

  drawBack(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.sky) paste(ctx, this.sky, 0, 0);
    for (const layer of LAYERS) {
      const offset = camera.x * PPM * layer.parallax;
      const base = this.base(camera, layer.lift);
      const first = Math.floor((offset - this.width / 2) / TILE);
      const last = Math.floor((offset + this.width / 2) / TILE);
      for (let i = first; i <= last; i++) {
        const tile = this.tile(layer, i);
        paste(ctx, tile, i * TILE - offset + this.width / 2, base - tile.height / ART + 2);
      }
      // The layer continues to the bottom of the view, so a high camera never shows sky under it.
      ctx.fillStyle = layer.color;
      ctx.fillRect(0, base + 1, this.width, Math.max(0, this.height - base - 1));
    }
  }

  private tile(layer: Layer, index: number): HTMLCanvasElement {
    const key = `${layer.id}:${index}`;
    const cached = this.tiles.get(key);
    if (cached) return cached;
    const h = 120;
    const [canvas, ctx] = makeCanvas(TILE, h);
    const p = new Painter(ctx);
    const rand = random(index * 7919 + layer.id * 104729 + 7);
    if (layer.kind === "hills") {
      // Rolling hills, and now and then a temple tower stepping up to a point.
      const points: [number, number][] = [[0, h]];
      for (let x = 0; x <= TILE; x += 8) points.push([x, h - 34 - Math.sin((index * TILE + x) / 70) * 14 - hash(Math.floor((index * TILE + x) / 8), 3) * 6]);
      points.push([TILE, h]);
      p.poly(points, layer.color);
      if (rand() < 0.6) {
        const tx = 40 + rand() * (TILE - 80);
        const ty = h - 44;
        for (let s = 0; s < 6; s++) p.rect(tx - 12 + s * 2, ty - s * 6, 24 - s * 4, 6, layer.color);
        p.rect(tx - 1, ty - 40, 2, 6, layer.color);
      }
    } else if (layer.kind === "palms") {
      let x = -10;
      while (x < TILE) {
        if (rand() < 0.65) {
          // A coconut palm: a leaning trunk and a crown of drooping fronds.
          const lean = (rand() - 0.5) * 16;
          const top = h - 50 - rand() * 30;
          p.line(x, h, x + lean, top, layer.color);
          p.line(x + 1, h, x + lean + 1, top, layer.color);
          for (let f = 0; f < 6; f++) {
            const a = (f / 6) * Math.PI * 2;
            p.line(x + lean, top, x + lean + Math.cos(a) * 12, top + Math.abs(Math.sin(a)) * 6 + 2, layer.color);
          }
        } else {
          const w = 18 + rand() * 14;
          p.rect(x, h - 14, w, 14, layer.color);
          p.poly([[x - 3, h - 14], [x + w / 2, h - 26], [x + w + 3, h - 14]], layer.color);
        }
        x += 16 + rand() * 26;
      }
    } else {
      let x = -6;
      while (x < TILE) {
        if (rand() < 0.75) {
          // A hut: mud walls under a thatched roof, the doorway lit from inside.
          const w = 26 + Math.floor(rand() * 18);
          const wall = 14 + Math.floor(rand() * 6);
          p.rect(x, h - wall, w, wall, layer.color);
          p.poly([[x - 4, h - wall + 1], [x + w / 2, h - wall - 14], [x + w + 4, h - wall + 1]], MONSOON.roof);
          p.line(x - 4, h - wall + 1, x + w / 2, h - wall - 14, "#22303a");
          if (rand() < 0.7) {
            const door = MONSOON.doorWarm[Math.floor(rand() * MONSOON.doorWarm.length)];
            p.rect(x + w / 2 - 2, h - 9, 5, 9, door);
            if (rand() < 0.5) p.rect(x + 4, h - wall + 4, 4, 3, door);
          }
          x += w + 6 + Math.floor(rand() * 20);
        } else {
          // A haystack, or a stretch of fence.
          if (rand() < 0.5) p.poly([[x, h], [x + 9, h - 13], [x + 18, h]], layer.color);
          else for (let k = 0; k < 5; k++) p.rect(x + k * 5, h - 7, 1, 7, layer.color);
          x += 22 + Math.floor(rand() * 16);
        }
      }
    }
    this.tiles.set(key, canvas);
    return canvas;
  }

  /* The mud road: a wet top edge, rutted mud, puddles in the mud stretches, a dark verge below. */
  drawGround(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const { width: w, height: h } = this;
    const columns = Math.ceil(w * ART);
    if (this.tops.length !== columns) this.tops = new Float32Array(columns);
    const tops = this.tops;
    const first = Math.floor(camera.x * PPM * ART) - Math.round((w * ART) / 2);
    for (let i = 0; i < columns; i++) tops[i] = snap(h / 2 - (this.terrain.height((first + i) / (PPM * ART)) - camera.y) * PPM);
    const mud = (column: number): boolean => {
      const x = column / (PPM * ART);
      return this.features.some((f) => f.kind === "mud" && x > f.x && x < f.x + f.size);
    };
    fillRuns(ctx, tops, first, h, MONSOON.mudTop, 0, 1);
    fillRuns(ctx, tops, first, h, MONSOON.mud, 1, 6);
    fillRuns(ctx, tops, first, h, MONSOON.mudDark, 1, 6, (column) => hash(Math.floor(column / ART), 73) < 0.12);
    fillRuns(ctx, tops, first, h, MONSOON.rut, 3, 1, (column) => Math.floor(column / ART) % 9 < 6);
    // Puddles in the mud stretches: they hold the night sky, with a glint of moonlight.
    fillRuns(ctx, tops, first, h, MONSOON.puddle, 0, 2, (column) => mud(column) && hash(Math.floor(column / (ART * 6)), 74) < 0.7);
    fillRuns(ctx, tops, first, h, MONSOON.puddleShine, 0, 1, (column) => mud(column) && hash(Math.floor(column / ART), 75) < 0.08);
    fillRuns(ctx, tops, first, h, MONSOON.verge, 7, 2);
    fillRuns(ctx, tops, first, h, MONSOON.soil, 9, null);
  }

  /* Lanterns on bamboo poles by the road, pooling warm light. */
  drawLanterns(ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => [number, number], camera: Camera, time: number): void {
    const view = this.width / PPM;
    const first = Math.floor((camera.x - view) / LANTERN_SPACING) * LANTERN_SPACING;
    const p = new Painter(ctx);
    for (let x = first; x < camera.x + view; x += LANTERN_SPACING) {
      if (x < 8) continue;
      const [sx, sy] = toScreen(x, this.terrain.height(x));
      p.rect(sx, sy - 34, 1, 34, "#3b2c1c");
      p.line(sx, sy - 34, sx + 6, sy - 33, "#3b2c1c");
      const flicker = 0.5 + Math.sin(time * 9 + x) * 0.06;
      p.rect(sx + 5, sy - 32, 3, 4, "#ffcf7a");
      glow(ctx, sx + 6, sy - 30, 22, "255, 190, 110", flicker);
    }
  }

  /* Rain slanting across the view, in front of everything. */
  drawRain(ctx: CanvasRenderingContext2D, time: number, still: boolean): void {
    if (still) return;
    const { width: w, height: h } = this;
    ctx.save();
    ctx.strokeStyle = "rgba(170, 195, 220, 0.28)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i < RAIN.count; i++) {
      const x = (hash(i, 91) * (w + 40) + time * 60) % (w + 40) - 20;
      const y = (hash(i, 92) * h + time * RAIN.speed * (0.8 + hash(i, 93) * 0.4)) % h;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + 7);
    }
    ctx.stroke();
    ctx.restore();
  }
}
