import { ART } from "../engine/config";
import { hash } from "../engine/noise";
import type { Terrain } from "../engine/terrain";
import { makeCanvas, Painter } from "./painter";

/*
 * Thruster exhaust and dust, simulated in world metres. Exhaust is steam-white hydrogen
 * exhaust: it leaves the nozzle fast, keeps almost none of the car's speed (so the plume stays
 * where it was made and streams out behind a moving car), slows hard in the air, rises a
 * little as it warms, swells into big soft puffs and lingers for a couple of seconds before it
 * thins out. Hitting the ground it fans out sideways: the cushion under a hovering craft.
 * Dust is heavier: it arcs and settles.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  gas: boolean;
  seed: number;
}

const POOL = 1600;
/** Share of the emitter's velocity the exhaust keeps. */
const INHERIT = 0.1;
/** Puff diameter (art px): at birth and fully grown. */
const PUFF = { born: 2, grown: 15 } as const;
const GAS = ["#ffffff", "#f1f4f6", "#dde3e8", "#c3ccd3", "#a6b1ba"] as const;
const DUST = ["#9a8a7a", "#7a6a5c", "#5a4c42"] as const;
/** Puff sprites are cached at these diameters (art px). */
const SIZES = 14;

/* Fine-pixel discs in each exhaust shade and size, drawn once: drawing a puff is one blit. */
let puffs: HTMLCanvasElement[][] | null = null;
function puffSprites(): HTMLCanvasElement[][] {
  puffs ??= GAS.map((color) =>
    Array.from({ length: SIZES }, (_, i) => {
      const d = PUFF.born + ((PUFF.grown - PUFF.born) * i) / (SIZES - 1);
      const [canvas, ctx] = makeCanvas(d + 1, d + 1);
      new Painter(ctx).disc(d / 2 + 0.5, d / 2 + 0.5, d / 2, color);
      return canvas;
    }),
  );
  return puffs;
}

export class Particles {
  private readonly pool: Particle[] = Array.from({ length: POOL }, (_, i) => ({
    x: 0, y: 0, vx: 0, vy: 0, age: 1, life: 0, size: 1, gas: true, seed: i,
  }));
  private next = 0;

  private take(): Particle {
    const particle = this.pool[this.next];
    this.next = (this.next + 1) % POOL;
    return particle;
  }

  /** A jet of exhaust along (dx, dy) from a nozzle moving with (vx, vy). */
  gas(x: number, y: number, dx: number, dy: number, vx: number, vy: number, strength: number): void {
    const p = this.take();
    const speed = (8 + Math.random() * 6) * strength;
    const spread = (Math.random() - 0.5) * 0.6;
    p.x = x + (Math.random() - 0.5) * 0.2;
    p.y = y + (Math.random() - 0.5) * 0.2;
    p.vx = vx * INHERIT + (dx - dy * spread) * speed;
    p.vy = vy * INHERIT + (dy + dx * spread) * speed;
    p.age = 0;
    p.life = 1.4 + Math.random() * 1.4;
    p.size = 0;
    p.gas = true;
  }

  dust(x: number, y: number, vx: number, count: number, force: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.take();
      p.x = x + (Math.random() - 0.5) * 0.6;
      p.y = y + 0.02;
      p.vx = vx * 0.2 + (Math.random() - 0.5) * 3 * force;
      p.vy = (0.6 + Math.random() * 1.8) * force;
      p.age = 0;
      p.life = 0.35 + Math.random() * 0.4;
      p.size = 1;
      p.gas = false;
    }
  }

  update(dt: number, terrain: Terrain, gravity: number): void {
    for (const p of this.pool) {
      if (p.age >= p.life) continue;
      p.age += dt;
      if (p.gas) {
        // Hard drag (the jet spends itself in a metre or two), a little buoyancy, and growth
        // that is fast at first and slows as the puff thins.
        const drag = Math.exp(-4.2 * dt);
        p.vx *= drag;
        p.vy = p.vy * drag + 0.9 * dt;
        p.size = Math.sqrt(Math.min(1, p.age / (p.life * 0.75)));
      } else {
        p.vy -= gravity * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const ground = terrain.height(p.x);
      if (p.y < ground) {
        p.y = ground;
        if (p.gas) {
          // Ground effect: the jet flattens and fans out sideways.
          const push = Math.abs(p.vy) * 0.9;
          p.vx += (p.seed % 2 ? 1 : -1) * push;
          p.vy = push * 0.15;
        } else {
          p.vy = 0;
          p.vx *= 0.5;
        }
      }
    }
  }

  draw(painter: Painter, toScreen: (x: number, y: number) => [number, number], frame: number): void {
    const ctx = painter.ctx;
    const sprites = puffSprites();
    for (const p of this.pool) {
      if (p.age >= p.life) continue;
      const t = p.age / p.life;
      const [x, y] = toScreen(p.x, p.y);
      if (p.gas) {
        const shade = sprites[Math.min(GAS.length - 1, Math.floor(t * GAS.length))];
        const sprite = shade[Math.min(SIZES - 1, Math.floor(p.size * (SIZES - 1)))];
        const w = sprite.width / ART;
        ctx.globalAlpha = (1 - t) ** 1.6 * 0.8;
        ctx.drawImage(sprite, Math.round((x - w / 2) * ART) / ART, Math.round((y - w / 2) * ART) / ART, w, w);
      } else {
        if (hash(p.seed * 7 + frame, 9) < t * t) continue;
        painter.rect(x, y, 0.5, 0.5, DUST[Math.min(DUST.length - 1, Math.floor(t * DUST.length))]);
      }
    }
    ctx.globalAlpha = 1;
  }
}
