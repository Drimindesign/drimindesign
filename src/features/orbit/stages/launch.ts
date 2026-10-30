import type { Camera } from "../engine/camera";
import { projector } from "../engine/camera";
import { ART, PLANETS, PPM } from "../engine/config";
import type { InputSnapshot } from "../engine/input";
import { random, smoothstep } from "../engine/noise";
import { FlatTerrain } from "../engine/terrain";
import { createCarSprite, type CarSprite } from "../pixel/car-sprite";
import { City } from "../pixel/city";
import { BIRD, blit, CELL, DEBRIS, glow, LAUNCH_PAD, SATELLITE, type Sprite } from "../pixel/props";
import { Sky } from "../pixel/sky";
import { POINTS } from "../actors/score";
import { Pickups, type Stage, type StageContext, type StageHud, type View } from "./types";

/** Altitude that counts as orbit (m): the end of the stage. */
export const ORBIT = 900;
/** Thruster acceleration (m/s²) and top climbing speed (m/s). */
const THRUST = 27;
const MAX_CLIMB = 58;
/** How far the car tilts with ← → (rad), and how fast it gets there. */
const TILT = 0.5;
const TILT_RATE = 6;
/** Side limits of the flight corridor (m). */
const CORRIDOR = 26;
/** After a hit, the thrusters cut out for this long while the car tumbles (s). */
const STUN = 0.7;

interface Hazard {
  kind: "bird" | "satellite" | "debris";
  x: number;
  y: number;
  vx: number;
  radius: number;
}

/*
 * Stage 3, Launch: the car points its nose at the sky and climbs out of the atmosphere on its
 * thrusters. Hold Space to burn, ← → to lean; gravity fades with height. Birds low down and
 * satellites and debris near orbit cross your path: a hit knocks you into a tumble and you
 * lose height. Reach orbit to finish.
 */
export class Launch implements Stage {
  readonly id = "launch" as const;
  private readonly terrain = new FlatTerrain();
  private readonly city = new City(this.terrain);
  private readonly sky = new Sky();
  private readonly car: CarSprite = createCarSprite();
  private readonly sprites = { pad: LAUNCH_PAD(), cell: CELL(), bird: [BIRD(0), BIRD(1)] as [Sprite, Sprite], satellite: SATELLITE(), debris: DEBRIS() };
  private readonly hazards: Hazard[] = [];
  private readonly cells: Pickups;
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private angle = 0;
  private spin = 0;
  private stunned = 0;
  private burning = false;
  private lifted = false;
  private done = false;
  private readonly camera: Camera = { x: 0, y: 0 };
  /** Last step's pose, for drawing between physics steps. */
  private px = 0;
  private py = 0;
  private pangle = 0;
  private width = 480;
  private height = 270;
  fade = 0;

  constructor(private readonly context: StageContext) {
    const rand = random(17);
    for (let i = 0; i < 9; i++) {
      this.hazards.push({ kind: "bird", x: (rand() - 0.5) * CORRIDOR * 2, y: 45 + i * 22 + rand() * 10, vx: (rand() < 0.5 ? -1 : 1) * (3 + rand() * 3), radius: 1.1 });
    }
    for (let i = 0; i < 12; i++) {
      const kind = i % 3 === 0 ? "satellite" : "debris";
      this.hazards.push({ kind, x: (rand() - 0.5) * CORRIDOR * 2, y: 430 + i * 36 + rand() * 14, vx: (rand() < 0.5 ? -1 : 1) * (4 + rand() * 5), radius: kind === "satellite" ? 1.7 : 1 });
    }
    this.cells = new Pickups(Array.from({ length: 16 }, (_, i) => [(rand() - 0.5) * CORRIDOR * 1.4, 30 + i * 54] as const));
  }

  get collected(): number {
    return this.cells.taken;
  }

  get available(): number {
    return this.cells.items.length;
  }

  get cleanLandings(): number {
    return 0;
  }

  get complete(): boolean {
    return this.done;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.city.resize(width, height);
    this.sky.resize(width, height);
  }

  /** Gravity fades with height (m/s²). */
  private gravity(): number {
    return PLANETS.earth.gravity * (1 - 0.85 * smoothstep(0, ORBIT, this.y));
  }

  step(dt: number, input: InputSnapshot): void {
    this.fade = Math.max(0, this.fade - dt * 1.6);
    this.px = this.x;
    this.py = this.y;
    this.pangle = this.angle;
    if (this.done) return;
    this.stunned = Math.max(0, this.stunned - dt);
    const wasBurning = this.burning;
    this.burning = input.jumpHeld && this.stunned === 0;
    if (this.burning && !wasBurning && this.y < 1) this.context.audio.ignition();

    if (this.stunned > 0) {
      this.angle += this.spin * dt;
    } else {
      const target = input.move * TILT;
      this.angle += (target - this.angle) * (1 - Math.exp(-TILT_RATE * dt));
    }
    if (this.burning) {
      this.vx += Math.sin(this.angle) * THRUST * dt;
      this.vy += Math.cos(this.angle) * THRUST * dt;
      this.lifted = true;
      const tail = { x: this.x - Math.sin(this.angle) * 2.2, y: this.y - Math.cos(this.angle) * 2.2 };
      for (let i = 0; i < 2; i++) this.context.particles.gas(tail.x, tail.y, -Math.sin(this.angle), -Math.cos(this.angle), this.vx, this.vy, 1);
    }
    this.vy -= this.gravity() * dt;
    this.vx *= Math.exp(-0.7 * dt);
    this.vy = Math.min(MAX_CLIMB, this.vy);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (Math.abs(this.x) > CORRIDOR) {
      this.x = Math.sign(this.x) * CORRIDOR;
      this.vx = -this.vx * 0.4;
    }
    if (this.y < 0) {
      // Back on the pad: upright again, ready to try once more.
      this.y = 0;
      this.vy = 0;
      this.vx = 0;
      if (this.lifted) this.angle = 0;
    }

    for (const h of this.hazards) {
      h.x += h.vx * dt;
      if (Math.abs(h.x) > CORRIDOR + 8) h.x = -Math.sign(h.x) * (CORRIDOR + 8);
      if (this.stunned === 0 && Math.hypot(h.x - this.x, h.y - this.y) < h.radius + 1) {
        this.stunned = STUN;
        this.spin = (h.x < this.x ? 1 : -1) * 7;
        this.vy = Math.min(this.vy, -6);
        this.vx += (this.x - h.x) * 3;
        this.context.audio.land(0.8);
        if (h.kind === "bird") this.context.audio.grunt();
      }
    }
    const got = this.cells.collect(this.x, this.y, 1.8);
    if (got > 0) {
      this.context.audio.pickup();
      this.context.score.add(POINTS.cell * got, "Cell", this.x, this.y + 2);
    }
    this.context.particles.update(dt, this.terrain, this.gravity());
    if (this.y >= ORBIT) {
      this.done = true;
      this.context.audio.complete();
    }
  }

  /** Back on the pad, upright, to try the climb again. */
  respawn(): void {
    this.context.audio.respawn();
    this.fade = 1;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.stunned = 0;
    this.px = 0;
    this.py = 0;
    this.pangle = 0;
  }

  draw(view: View, alpha: number): void {
    const { ctx, painter, time, dt } = view;
    const w = this.width;
    const h = this.height;
    const x = this.px + (this.x - this.px) * alpha;
    const y = this.py + (this.y - this.py) * alpha;
    const angle = this.pangle + (this.angle - this.pangle) * alpha;
    // Car held a little below the middle of the view, the camera easing along beside it.
    const wantY = y + (0.1 * h) / PPM;
    this.camera.y += (Math.max((0.2 * h) / PPM, wantY) - this.camera.y) * (1 - Math.exp(-8 * Math.min(dt, 1 / 20)));
    this.camera.x += (x * 0.6 - this.camera.x) * (1 - Math.exp(-3 * Math.min(dt, 1 / 20)));
    const camera = { x: Math.round(this.camera.x * PPM * ART) / (PPM * ART), y: Math.round(this.camera.y * PPM * ART) / (PPM * ART) };
    const toScreen = projector(camera, w, h);
    const space = smoothstep(60, ORBIT, y);

    this.sky.draw(ctx, painter, y, space, time);
    if (camera.y < 30) {
      this.city.drawBack(ctx, camera);
      this.city.drawGround(ctx, camera);
      const [px, py] = toScreen(0, 0);
      blit(ctx, this.sprites.pad, px, py + 1);
    }
    this.drawClouds(ctx, toScreen, false);

    for (const cell of this.cells.items) {
      if (cell.taken) continue;
      const [x, y] = toScreen(cell.x, cell.y);
      if (y < -20 || y > h + 20) continue;
      glow(ctx, x, y, 11, "103, 211, 255", 0.45);
      blit(ctx, this.sprites.cell, x, y);
    }
    for (const hz of this.hazards) {
      const [x, y] = toScreen(hz.x, hz.y);
      if (y < -30 || y > h + 30) continue;
      const sprite = hz.kind === "bird" ? this.sprites.bird[Math.floor(time * 6 + hz.y) % 2] : hz.kind === "satellite" ? this.sprites.satellite : this.sprites.debris;
      if (hz.kind === "debris") {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(time * 1.5 + hz.y);
        ctx.drawImage(sprite.canvas, -sprite.ax, -sprite.ay, sprite.canvas.width / ART, sprite.canvas.height / ART);
        ctx.restore();
      } else {
        blit(ctx, sprite, x, y);
      }
    }

    this.context.particles.draw(painter, toScreen, view.frame);
    // The car, nose up, leaning with the steering.
    const [sx, sy] = toScreen(x, y + 0.2);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-Math.PI / 2 + angle);
    ctx.drawImage(this.car.occupied, -this.car.ox, -this.car.oy, this.car.occupied.width / ART, this.car.occupied.height / ART);
    ctx.restore();
    if (this.burning) {
      const tail = toScreen(x - Math.sin(angle) * 2.3, y - Math.cos(angle) * 2.3);
      glow(ctx, tail[0], tail[1], 18, "255, 190, 120", 0.7);
    }
    this.drawClouds(ctx, toScreen, true);
    this.context.score.draw(ctx, toScreen);
  }

  /* Cloud banks between 110 and 260 m: some behind the car, some in front of it. */
  private drawClouds(ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => [number, number], front: boolean): void {
    const rand = random(front ? 3 : 4);
    for (let i = 0; i < 14; i++) {
      const cx = (rand() - 0.5) * 80;
      const cy = 110 + rand() * 150;
      const r = 4 + rand() * 6;
      const [x, y] = toScreen(cx, cy);
      if (y < -60 || y > this.height + 60) continue;
      ctx.fillStyle = front ? "rgba(255, 236, 225, 0.55)" : "rgba(240, 200, 200, 0.7)";
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(Math.round(x + (k - 2) * r * PPM * 0.5), Math.round(y + Math.sin(k * 2.1) * 4), r * PPM * 0.55, r * PPM * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  hud(): StageHud {
    const prompt = !this.lifted ? "Hold Space · Lift off    ← → Lean" : this.stunned > 0 ? "Hit! Hold Space to recover" : "";
    return { prompt, speed: Math.hypot(this.vx, this.vy) * 3.6, tank: null, altitude: this.y, hearts: null, fuel: null, landIn: null };
  }
}
