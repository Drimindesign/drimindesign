import { ART, PPM } from "../engine/config";
import { fbm1, hash, random } from "../engine/noise";
import type { Terrain } from "../engine/terrain";
import { fillRuns, makeCanvas, paste, Painter, snap, type Point } from "./painter";
import { DAWN, type Palette } from "./palette";

/** Camera centre in world metres. */
export interface Camera {
  x: number;
  y: number;
}

const TILE = 256;

interface Layer {
  id: number;
  /** Share of the camera's horizontal motion the layer follows. */
  parallax: number;
  /** Share of its vertical motion. */
  lift: number;
  /** Ground line of the layer on screen, as a fraction of the view height. */
  anchor: number;
  build(p: Painter, tile: number, w: number, base: number, h: number, c: Palette): void;
}

/* A pine in profile: tiers that widen downward, drawn twice to leave a sunlit rim on the left. */
function pine(x: number, base: number, height: number, width: number): Point[] {
  const tiers = 5;
  const right: Point[] = [];
  const left: Point[] = [];
  for (let k = 1; k <= tiers; k++) {
    const y = base - height + (height * k) / tiers;
    const half = (width / 2) * (0.35 + (0.65 * k) / tiers);
    right.push([x + half * 0.55, y - height / tiers / 2], [x + half, y]);
    left.unshift([x - half * 0.55, y - height / tiers / 2], [x - half, y]);
  }
  return [[x, base - height], ...right, [x + 1, base], [x - 1, base], ...left];
}

function rimmed(p: Painter, points: Point[], color: string, rim: string): void {
  p.poly(points, rim);
  p.poly(points.map(([x, y]) => [x + 1, y + 1] as const), color);
}

function rimmedDisc(p: Painter, x: number, y: number, r: number, color: string, rim: string): void {
  p.disc(x, y, r, rim);
  p.disc(x + 1, y + 1, r, color);
}

/* Objects are seeded per tile and drawn into their neighbours too, so nothing is cut at a seam. */
function neighbours(tile: number, each: (t: number, offset: number) => void, w: number): void {
  for (let t = tile - 1; t <= tile + 1; t++) each(t, (t - tile) * w);
}

const LAYERS: Layer[] = [
  {
    id: 0,
    parallax: 0.04,
    lift: 0.06,
    anchor: 0.52,
    build(p, tile, w, base, h, c) {
      for (let x = 0; x < w; x++) {
        const gx = tile * w + x;
        const ridge = Math.round(base - 16 - 36 * fbm1(gx / 120, 11, 3) - 9 * fbm1(gx / 26, 12, 2));
        const before = Math.round(base - 16 - 36 * fbm1((gx - 1) / 120, 11, 3) - 9 * fbm1((gx - 1) / 26, 12, 2));
        p.rect(x, ridge, 1, h - ridge, c.mountain);
        // Slopes facing the low sun on the left catch light.
        p.rect(x, ridge, 1, ridge < before ? 2 : 1, c.mountainRim);
      }
      p.dither(0, base - 30, w, 44, c.haze, (_x, y) => (y - (base - 30)) / 40);
      p.rect(0, base + 14, w, h, c.haze);
    },
  },
  {
    id: 1,
    parallax: 0.13,
    lift: 0.14,
    anchor: 0.6,
    build(p, tile, w, base, h, c) {
      neighbours(tile, (t, offset) => {
        const rand = random(t * 7919 + 3);
        for (let i = 0; i < 20; i++) {
          const x = offset + rand() * w;
          const height = 24 + rand() * 38;
          rimmed(p, pine(x, base + 2, height, height * 0.34), c.farPine, c.farPineRim);
        }
      }, w);
      p.rect(0, base, w, h - base, c.farPine);
      p.dither(0, base - 16, w, 26, c.mist, (_x, y) => Math.min(0.7, (y - (base - 16)) / 26));
    },
  },
  {
    id: 2,
    parallax: 0.3,
    lift: 0.3,
    anchor: 0.64,
    build(p, tile, w, base, h, c) {
      neighbours(tile, (t, offset) => {
        const rand = random(t * 104729 + 5);
        for (let i = 0; i < 9; i++) {
          const x = offset + rand() * w;
          const color = rand() < 0.5 ? c.midTree : c.midTreeAlt;
          if (rand() < 0.55) {
            const height = 56 + rand() * 46;
            rimmed(p, pine(x, base, height, height * 0.32), color, c.midRim);
          } else {
            const height = 46 + rand() * 30;
            p.rect(x - 1, base - height * 0.55, 3, height * 0.55, c.trunkDark);
            for (let k = 0; k < 7; k++) {
              rimmedDisc(p, x + (rand() - 0.5) * 22, base - height + rand() * height * 0.45, 7 + rand() * 7, color, c.midRim);
            }
          }
        }
      }, w);
      p.rect(0, base - 2, w, 3, c.midTree);
      // The lake: the dawn sky mirrored, the tree line reflected in it, ripples catching light.
      const lake = base + 1;
      c.lake.forEach((color, i) => p.rect(0, lake + i * 8, w, 8, color));
      p.rect(0, lake + 32, w, h, c.lake[3]);
      const [copy, copyCtx] = makeCanvas(w, base + 1);
      copyCtx.setTransform(1, 0, 0, 1, 0, 0);
      copyCtx.drawImage(p.ctx.canvas, 0, 0);
      p.ctx.save();
      p.ctx.globalAlpha = 0.32;
      p.ctx.translate(0, lake * 2);
      p.ctx.scale(1, -1);
      p.ctx.drawImage(copy, 0, (base - 70) * ART, w * ART, 70 * ART, 0, base - 70, w, 70);
      p.ctx.restore();
      const rand = random(tile * 31 + 9);
      for (let i = 0; i < 40; i++) {
        const y = lake + 2 + Math.floor(rand() * 26);
        p.rect(rand() * w, y, 3 + rand() * 12, 1, rand() < 0.6 ? c.lake[0] : c.lake[3]);
      }
      p.dither(0, base - 5, w, 9, c.mist, (_x, y) => 0.45 - Math.abs(y - base) * 0.08);
    },
  },
  {
    id: 3,
    parallax: 0.6,
    lift: 0.55,
    anchor: 0.8,
    build(p, tile, w, base, h, c) {
      neighbours(tile, (t, offset) => {
        const rand = random(t * 15485863 + 7);
        const trunks = rand() < 0.4 ? 0 : rand() < 0.6 ? 1 : 2;
        for (let i = 0; i < trunks; i++) {
          const x = Math.round(offset + rand() * w);
          const width = Math.round(12 + rand() * 12);
          p.rect(x, 0, width, base + 4, c.trunk);
          for (let k = 0; k < 70; k++) {
            p.rect(x + rand() * width, rand() * base, 1, 2 + rand() * 7, rand() < 0.55 ? c.trunkDark : c.trunkLight);
          }
          for (let k = 0; k < 45; k++) p.px(x + width * (0.45 + rand() * 0.55), base * (0.55 + rand() * 0.45), c.moss);
          // Backlit edge: bright where the sun reaches, breaking up lower down.
          p.dither(x, 0, 2, base, c.trunkRim, (_x, y) => 0.95 - (y / base) * 0.55);
          p.poly([[x - 4, base + 4], [x + 2, base - 6], [x + width - 2, base - 6], [x + width + 5, base + 4]], c.trunk);
          if (rand() < 0.7) {
            const by = base * (0.2 + rand() * 0.3);
            const dir = rand() < 0.5 ? -1 : 1;
            const ex = x + (dir > 0 ? width : 0) + dir * (20 + rand() * 20);
            p.line(x + (dir > 0 ? width : 0), by, ex, by - 14, c.trunk);
            p.line(x + (dir > 0 ? width : 0), by + 1, ex, by - 13, c.trunk);
            for (let k = 0; k < 6; k++) rimmedDisc(p, ex + (rand() - 0.5) * 18, by - 16 + (rand() - 0.5) * 10, 4 + rand() * 4, c.leafDark, c.leafRim);
          }
          for (let k = 0; k < 4; k++) rimmedDisc(p, x - 10 + rand() * (width + 20), base - 2 - rand() * 6, 5 + rand() * 5, c.bush, c.leafRim);
        }
      }, w);
    },
  },
];

const FOREGROUND: Layer = {
  id: 4,
  parallax: 1.3,
  lift: 1,
  anchor: 1.02,
  build(p, tile, w, base, h, c) {
    neighbours(tile, (t, offset) => {
      const rand = random(t * 2654435 + 11);
      if (rand() < 0.45) return;
      const cx = offset + rand() * w;
      for (let i = 0; i < 16; i++) {
        const x = cx + (rand() - 0.5) * 30;
        const height = 14 + rand() * 34;
        const lean = (rand() - 0.5) * 16;
        rimmed(p, [[x - 2, base], [x + lean, base - height], [x + 2, base]], c.front, c.frontRim);
      }
    }, w);
  },
};

/*
 * The dawn forest in pixel art: a dithered sky with a low sun, violet mountains, far pines in
 * mist, a tree line over a lake that mirrors the sky, big backlit trunks, the road, and dark
 * grass in front. Every layer is painted once per tile from seeded shapes (the same forest on
 * every visit), then only composited; god rays, ripples, grass, glints and motes are live.
 */
export class World {
  private width = 0;
  private height = 0;
  /** Ground height of each fine column this frame (art px), reused between frames. */
  private tops = new Float32Array(0);
  private sky: HTMLCanvasElement | null = null;
  private rays: HTMLCanvasElement | null = null;
  private readonly tiles = new Map<string, HTMLCanvasElement>();
  private readonly origin = { y: 0 };

  constructor(
    private readonly terrain: Terrain,
    private readonly c: Palette = DAWN,
  ) {}

  get sun(): { x: number; y: number } {
    return { x: Math.round(this.width * 0.17), y: Math.round(this.height * this.c.sunHeight) };
  }

  resize(width: number, height: number, cameraY: number): void {
    this.width = width;
    this.height = height;
    this.origin.y = cameraY;
    this.tiles.clear();
    this.sky = this.paintSky();
    this.rays = this.paintRays();
  }

  private paintSky(): HTMLCanvasElement {
    const { width: w, height: h } = this;
    const [canvas, ctx] = makeCanvas(w, h);
    const p = new Painter(ctx);
    const stops = this.c.sky;
    const span = h * 0.62;
    for (let y = 0; y < h; y++) {
      const t = Math.min(0.999, y / span) * (stops.length - 1);
      const i = Math.floor(t);
      p.rect(0, y, w, 1, stops[i]);
      if (i + 1 < stops.length) p.dither(0, y, w, 1, stops[i + 1], () => t - i);
    }
    // Stars on a night sky, a few of them bright.
    const starRand = random(23);
    const stars = Math.round((w * h * 0.55 * this.c.stars) / 10000);
    for (let i = 0; i < stars; i++) p.px(starRand() * w, starRand() * h * 0.55, starRand() < 0.1 ? "#ffffff" : "#8f9ec4");
    // Long thin clouds lit from below near the horizon.
    const rand = random(17);
    for (let i = 0; i < 7; i++) {
      const cx = rand() * w;
      const cy = h * (0.22 + rand() * 0.24);
      const len = 40 + rand() * 120;
      p.dither(cx - len / 2, cy - 2, len, 5, this.c.cloud, (x, y) => 0.55 * (1 - Math.abs((x - cx) / (len / 2))) - Math.abs(y - cy) * 0.15);
    }
    const { x: sx, y: sy } = this.sun;
    this.c.sunHalo.forEach((color, i) => {
      const r = 34 - i * 9;
      p.dither(sx - r, sy - r, r * 2, r * 2, color, (x, y) => (1 - Math.hypot(x - sx, y - sy) / r) * 0.9);
    });
    p.disc(sx, sy, 6, this.c.sun);
    return canvas;
  }

  /*
   * Sunbeams fanning down to the right from the low sun. Light is the one thing drawn smooth
   * rather than in pixels: soft shafts that fade with distance, like light in morning haze
   * (dithered beams read as noise at this resolution).
   */
  private paintRays(): HTMLCanvasElement {
    const { width: w, height: h } = this;
    const [canvas, ctx] = makeCanvas(w, h);
    ctx.imageSmoothingEnabled = true;
    const { x: sx, y: sy } = this.sun;
    const reach = Math.hypot(w, h);
    // A high sun throws its beams more steeply down than a low one.
    const tilt = (0.47 - this.c.sunHeight) * 1.4;
    const beams = [0.14, 0.31, 0.45, 0.63, 0.8, 0.97].map((angle, i) => ({ angle: angle + tilt, spread: 0.028 + (i % 3) * 0.014, strength: (0.16 + (i % 2) * 0.07) * this.c.rays }));
    ctx.filter = "blur(2px)";
    for (const beam of beams) {
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, reach * 0.85);
      glow.addColorStop(0, `rgba(${this.c.rayRgb}, ${beam.strength})`);
      glow.addColorStop(0.45, `rgba(${this.c.rayRgb}, ${beam.strength * 0.45})`);
      glow.addColorStop(1, `rgba(${this.c.rayRgb}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(beam.angle - beam.spread) * reach, sy + Math.sin(beam.angle - beam.spread) * reach);
      ctx.lineTo(sx + Math.cos(beam.angle + beam.spread) * reach, sy + Math.sin(beam.angle + beam.spread) * reach);
      ctx.closePath();
      ctx.fill();
    }
    ctx.filter = "none";
    return canvas;
  }

  private screenY(wy: number, camera: Camera): number {
    return snap(this.height / 2 - (wy - camera.y) * PPM);
  }

  private tile(layer: Layer, index: number): HTMLCanvasElement {
    const key = `${layer.id}:${index}`;
    const cached = this.tiles.get(key);
    if (cached) return cached;
    const h = Math.ceil(this.height * 1.6);
    const [canvas, ctx] = makeCanvas(TILE, h);
    layer.build(new Painter(ctx), index, TILE, Math.round(this.height), h, this.c);
    this.tiles.set(key, canvas);
    const own = [...this.tiles.keys()].filter((k) => k.startsWith(`${layer.id}:`));
    if (own.length > 6) this.tiles.delete(own[0]);
    return canvas;
  }

  private drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, camera: Camera): void {
    const offset = snap(camera.x * PPM * layer.parallax);
    const baseline = snap(this.height * layer.anchor + (camera.y - this.origin.y) * PPM * layer.lift);
    const top = baseline - Math.round(this.height);
    const first = Math.floor((offset - this.width / 2) / TILE);
    const last = Math.floor((offset + this.width / 2) / TILE);
    for (let i = first; i <= last; i++) {
      paste(ctx, this.tile(layer, i), i * TILE - offset + Math.round(this.width / 2), top);
    }
  }

  drawBack(ctx: CanvasRenderingContext2D, camera: Camera, time: number): void {
    if (this.sky) paste(ctx, this.sky, 0, 0);
    this.drawLayer(ctx, LAYERS[0], camera);
    this.drawLayer(ctx, LAYERS[1], camera);
    this.drawLayer(ctx, LAYERS[2], camera);
    // Sun glints dancing on the lake under the sun.
    const lake = Math.round(this.height * LAYERS[2].anchor + (camera.y - this.origin.y) * PPM * LAYERS[2].lift) + 2;
    const p = new Painter(ctx);
    const frame = Math.floor(time * 7);
    for (let i = 0; i < 18; i++) {
      const spread = 6 + i * 1.6;
      const x = this.sun.x + (hash(i * 31 + frame, 3) - 0.5) * spread * 2;
      p.rect(x, lake + i * 1.4, 2 + hash(i + frame, 4) * 4, 1, this.c.lakeGlint);
    }
    this.drawLayer(ctx, LAYERS[3], camera);
    if (this.rays) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.7 + Math.sin(time * 0.5) * 0.12;
      paste(ctx, this.rays, 0, 0);
      ctx.restore();
    }
  }

  /** The road: sunlit grass edge, packed dirt, soil, and grass blades swaying in the breeze. */
  drawGround(ctx: CanvasRenderingContext2D, camera: Camera, time: number): void {
    const { width: w, height: h } = this;
    const c = this.c;
    const g = 1 / ART;
    const columns = Math.ceil(w * ART);
    if (this.tops.length !== columns) this.tops = new Float32Array(columns);
    const tops = this.tops;
    const first = Math.floor(camera.x * PPM * ART) - Math.round((w * ART) / 2);
    for (let i = 0; i < columns; i++) tops[i] = this.screenY(this.terrain.height((first + i) / (PPM * ART)), camera);
    // Bands keep their art-pixel thickness; texture varies per art column so it reads at that scale.
    fillRuns(ctx, tops, first, h, c.grassTop, 0, 1);
    fillRuns(ctx, tops, first, h, c.grass, 1, 2);
    fillRuns(ctx, tops, first, h, c.grassDark, 1, 2, (column) => hash(Math.floor(column / ART), 41) < 0.3);
    fillRuns(ctx, tops, first, h, c.path, 3, 4);
    fillRuns(ctx, tops, first, h, c.soil, 7, null);
    // Sparse detail, one colour at a time: path grit, stones, then grass blades and their tips.
    const scatter = (color: string, draw: (column: number, x: number, top: number) => void): void => {
      ctx.fillStyle = color;
      for (let i = 0; i < columns; i++) if (tops[i] < h) draw(first + i, i / ART, tops[i]);
    };
    const dot = (x: number, y: number): void => ctx.fillRect(Math.floor(x * ART) / ART, Math.floor(y * ART) / ART, g, g);
    scatter(c.pathLight, (column, x, top) => {
      if (hash(column, 42) < 0.12) dot(x, top + 3 + hash(column, 43) * 4);
    });
    scatter(c.stone, (column, x, top) => {
      if (hash(column, 44) < 0.18 && hash(column, 46) < 0.5) dot(x, top + 9 + hash(column, 45) * 30);
    });
    scatter(c.soilDark, (column, x, top) => {
      if (hash(column, 44) < 0.18 && hash(column, 46) >= 0.5) dot(x, top + 9 + hash(column, 45) * 30);
    });
    scatter(c.blade, (column, x, top) => {
      if (hash(column, 47) <= 0.5) return;
      const height = 1 + hash(column, 48) * 5;
      if (height > 1) ctx.fillRect(x, snap(top - height + 1), g, snap(height - 1) || g);
    });
    const tip = (column: number, x: number, top: number): void => {
      const height = 1 + hash(column, 48) * 5;
      const sway = height >= 3 ? Math.sin(time * 2.1 + column * 0.19) * 0.7 : 0;
      dot(x + sway, top - height);
    };
    scatter(c.bladeTip, (column, x, top) => {
      const blade = hash(column, 47);
      if (blade > 0.5 && blade <= 0.985) tip(column, x, top);
    });
    for (let f = 0; f < 3; f++) {
      scatter(c.flower[f], (column, x, top) => {
        if (hash(column, 47) > 0.985 && Math.floor(column / ART) % 3 === f) tip(column, x, top);
      });
    }
  }


  /** Dark backlit grass in front of everything, and motes drifting in the light. */
  drawFront(ctx: CanvasRenderingContext2D, camera: Camera, time: number, still: boolean): void {
    this.drawLayer(ctx, FOREGROUND, camera);
    const p = new Painter(ctx);
    const t = still ? 0 : time;
    for (let i = 0; i < 46; i++) {
      const x = (((hash(i, 61) * this.width * 1.2 + t * (4 + hash(i, 62) * 6) - camera.x * PPM * 0.5) % (this.width * 1.2)) + this.width * 1.2) % (this.width * 1.2) - this.width * 0.1;
      const y = this.height * (0.12 + hash(i, 63) * 0.62) + Math.sin(t * 0.7 + i) * 6;
      if (Math.sin(t * 2.3 + i * 1.7) > -0.2) p.px(x, y, this.c.mote);
    }
  }
}
