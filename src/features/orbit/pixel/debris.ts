import type { ToScreen } from "../engine/camera";
import { PPM } from "../engine/config";
import type { Terrain } from "../engine/terrain";

/** At most this many pieces at once; the oldest resting ones are recycled first. */
const POOL = 220;
/** Bounce off the ground (share of speed kept), sliding friction (1/s), spin damping on the ground (1/s). */
const RESTITUTION = 0.32;
const FRICTION = 6;
const ROLL_DAMP = 5;
/** Below this speed (m/s) on the ground a piece goes to sleep. */
const SLEEP = 0.25;
/** A resting piece stays this long (s), then fades over the last second. */
const REST_LIFE = 14;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  /** Size (m) and colour. */
  w: number;
  h: number;
  color: string;
  /** Seconds since it came to rest, or -1 while moving; -2 = unused. */
  rest: number;
}

/*
 * Debris as rigid pieces: planks, crate boards, canvas and poles thrown out of whatever broke,
 * each with its own velocity and spin. They fall under the planet's gravity, bounce and slide
 * on the ground with friction until they sleep, and stay on the road a while before fading,
 * so the street remembers what you hit. The car shoves the pieces it drives through.
 */
export class Debris {
  private readonly pieces: Piece[] = Array.from({ length: POOL }, () => ({ x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0, w: 0, h: 0, color: "", rest: -2 }));
  private next = 0;

  /**
   * Shatters something at (x, y) into `count` pieces of the given palette and size (m), thrown
   * with the hitter's velocity (vx, vy) plus a burst of `force` (m/s).
   */
  burst(x: number, y: number, vx: number, vy: number, count: number, force: number, colors: readonly string[], size: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.take();
      const a = Math.random() * Math.PI;
      const kick = force * (0.4 + Math.random() * 0.8);
      p.x = x + (Math.random() - 0.5) * size * 2;
      p.y = y + Math.random() * size * 2;
      p.vx = vx * (0.5 + Math.random() * 0.5) + Math.cos(a) * kick;
      p.vy = Math.max(0, vy) * 0.5 + Math.sin(a) * kick + 1;
      p.angle = Math.random() * Math.PI * 2;
      p.spin = (Math.random() - 0.5) * 18;
      p.w = size * (0.5 + Math.random());
      p.h = size * (0.15 + Math.random() * 0.25);
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.rest = -1;
    }
  }

  /** The car (centre x, y, velocity) ploughs through: pieces within its length are kicked along. */
  shove(x: number, y: number, vx: number): void {
    if (Math.abs(vx) < 1.5) return;
    for (const p of this.pieces) {
      if (p.rest === -2 || Math.abs(p.x - x) > 2.3 || Math.abs(p.y - (y - 0.5)) > 0.9) continue;
      p.vx = vx * (0.8 + Math.random() * 0.4);
      p.vy = 1 + Math.random() * Math.abs(vx) * 0.12;
      p.spin = (Math.random() - 0.5) * 14;
      p.rest = -1;
    }
  }

  update(dt: number, terrain: Terrain, gravity: number): void {
    for (const p of this.pieces) {
      if (p.rest === -2) continue;
      if (p.rest >= 0) {
        p.rest += dt;
        if (p.rest > REST_LIFE) p.rest = -2;
        continue;
      }
      p.vy -= gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      const ground = terrain.height(p.x) + p.h / 2;
      if (p.y <= ground) {
        p.y = ground;
        // Bounce, slide, and settle flat-ish onto the ground.
        p.vy = p.vy < -1.5 ? -p.vy * RESTITUTION : 0;
        p.vx *= Math.exp(-FRICTION * dt);
        p.spin *= Math.exp(-ROLL_DAMP * dt);
        if (p.vy === 0) p.angle += (Math.round(p.angle / Math.PI) * Math.PI - p.angle) * Math.min(1, 8 * dt);
        if (p.vy === 0 && Math.abs(p.vx) < SLEEP && Math.abs(p.spin) < 0.5) p.rest = 0;
      }
      if (p.y < -60) p.rest = -2;
    }
  }

  draw(ctx: CanvasRenderingContext2D, toScreen: ToScreen, width: number): void {
    for (const p of this.pieces) {
      if (p.rest === -2) continue;
      const [x, y] = toScreen(p.x, p.y);
      if (x < -20 || x > width + 20) continue;
      ctx.save();
      ctx.globalAlpha = p.rest > REST_LIFE - 1 ? REST_LIFE - p.rest : 1;
      ctx.translate(x, y);
      ctx.rotate(-p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect((-p.w * PPM) / 2, (-p.h * PPM) / 2, Math.max(0.5, p.w * PPM), Math.max(0.5, p.h * PPM));
      ctx.restore();
    }
  }

  private take(): Piece {
    // A free slot if there is one, else the oldest resting piece, else the next in turn.
    for (let i = 0; i < POOL; i++) {
      const j = (this.next + i) % POOL;
      if (this.pieces[j].rest === -2) {
        this.next = (j + 1) % POOL;
        return this.pieces[j];
      }
    }
    let oldest = this.next;
    for (let i = 0; i < POOL; i++) if (this.pieces[i].rest > this.pieces[oldest].rest) oldest = i;
    this.next = (oldest + 1) % POOL;
    return this.pieces[oldest];
  }
}
