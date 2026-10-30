import { Boar, type BeastKind } from "../actors/boar";
import { Car, type CarEvent } from "../actors/car";
import { Crew } from "../actors/crew";
import { Explorer } from "../actors/explorer";
import { POINTS, STUNTS } from "../actors/score";
import { FollowCamera, projector, type ToScreen } from "../engine/camera";
import { CAR, PLANETS, PPM } from "../engine/config";
import type { InputSnapshot } from "../engine/input";
import { RoadTerrain, type RoadFeature } from "../engine/terrain";
import { City } from "../pixel/city";
import type { ExplorerId } from "../pixel/explorer-sprite";
import type { Painter } from "../pixel/painter";
import { NIGHT } from "../pixel/palette";
import { blit, CELL, glow, LAUNCH_PAD, TRAFFIC, type Sprite } from "../pixel/props";
import { World } from "../pixel/world";
import { stepBeasts } from "./beasts";
import { checkpointBefore, Pickups, type Stage, type StageContext, type StageHud, type View } from "./types";

interface TrafficSpec {
  x: number;
  /** Cruising speed (m/s); it stops for good at `until` (before a ramp or a gap). */
  speed: number;
  until: number;
  kind: "car" | "truck";
  color: string;
}

export interface RoadConfig {
  id: "discover" | "build";
  scene: "city" | "forest";
  seed: number;
  /** 0 flat street … 1 rolling forest road. */
  hills: number;
  /** The finish line (m): city limits, or the launch pad. */
  finish: number;
  features: readonly RoadFeature[];
  checkpoints: readonly number[];
  /** Energy cells and stunt rings: x, height above the ground (m). */
  cells: readonly (readonly [number, number])[];
  rings: readonly (readonly [number, number])[];
  traffic: readonly TrafficSpec[];
  /** Beasts along the road: where each waits (m) and what it is. */
  beasts: readonly (readonly [number, BeastKind])[];
}

/** Below this height the car has fallen into a gap (m). */
const FALL_LIMIT = -14;
/** Ring radius (m): fly within RING_HIT of its centre to pass through. */
const RING_RADIUS = 1.7;
const RING_HIT = 1.4;
/** Traffic is this tall (m) for collisions and near misses. */
const HEIGHT = { car: 1.45, truck: 3.1 } as const;
const LENGTH = { car: 4.4, truck: 7 } as const;

interface Traffic extends TrafficSpec {
  at: number;
  moving: boolean;
  passed: boolean;
  sprite: Sprite;
}

/*
 * A night road stage, car first: the city street (Discover) or the forest road (Build). The
 * car's physics decides every bump, flight and fall; on top of it sit the stunts (flips judged
 * on landing, a combo multiplier), traffic to jump (near misses pay, collisions wreck), stunt
 * rings that boost and refuel, and gaps sized so the tank makes you choose. Wrecks and falls go back to the last checkpoint.
 */
export class RoadStage implements Stage {
  readonly id: "discover" | "build";
  private readonly terrain: RoadTerrain;
  private readonly world: World | null;
  private readonly city: City | null;
  private readonly camera = new FollowCamera(480, 270);
  private readonly crew: Crew;
  private readonly cells: Pickups;
  private readonly rings: { x: number; y: number; taken: boolean }[];
  private readonly traffic: Traffic[];
  private readonly boars: Boar[];
  private readonly sprites = { cell: CELL(), pad: LAUNCH_PAD() };
  private reached: number;
  private respawnIn = 0;
  private width = 480;
  private height = 270;
  private done = false;
  fade = 0;
  private readonly gravity = PLANETS.earth.gravity;

  constructor(
    private readonly context: StageContext,
    look: ExplorerId,
    private readonly config: RoadConfig,
  ) {
    this.id = config.id;
    this.terrain = new RoadTerrain(config.seed, config.features, config.hills);
    this.world = config.scene === "forest" ? new World(this.terrain, NIGHT) : null;
    this.city = config.scene === "city" ? new City(this.terrain) : null;
    const explorer = new Explorer(4, this.terrain, look, context.audio, context.particles);
    const car = new Car(6, this.terrain, context.audio, context.particles);
    this.crew = new Crew(explorer, car, this.terrain, context.audio);
    this.crew.seat();
    this.cells = new Pickups(config.cells.map(([x, h]) => [x, Math.max(0, this.terrain.height(x)) + h] as const));
    this.rings = config.rings.map(([x, h]) => ({ x, y: Math.max(0, this.terrain.height(x)) + h, taken: false }));
    this.traffic = config.traffic.map((t) => ({ ...t, at: t.x, moving: true, passed: false, sprite: TRAFFIC(t.kind, t.color) }));
    this.boars = config.beasts.map(([x, kind]) => new Boar(x, this.terrain, kind));
    this.reached = config.checkpoints[0];
    this.camera.snap(6, this.terrain.height(6), this.terrain.height(6));
  }

  get collected(): number {
    return this.cells.taken + this.rings.filter((r) => r.taken).length;
  }

  get available(): number {
    return this.cells.items.length + this.rings.length;
  }

  get cleanLandings(): number {
    return this.crew.car.cleanLandings;
  }

  get complete(): boolean {
    return this.done;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.setView(width, height);
    this.world?.resize(width, height, this.camera.y);
    this.city?.resize(width, height);
  }

  step(dt: number, input: InputSnapshot): void {
    this.fade = Math.max(0, this.fade - dt * 1.6);
    if (this.done) return;
    const car = this.crew.car;
    const v = car.vehicle;
    this.crew.step(dt, this.gravity, input, { board: false, alight: false });
    this.context.particles.update(dt, this.terrain, this.gravity);
    this.context.combo.update(dt, v.grounded);
    scoreCarEvents(car.drainEvents(), car, this.context);

    if (car.wrecked > 0 && this.respawnIn === 0) this.respawnIn = car.wrecked;
    if (this.respawnIn > 0) {
      this.respawnIn = Math.max(0, this.respawnIn - dt);
      if (this.respawnIn === 0) this.respawn();
      return;
    }

    for (const c of this.config.checkpoints) if (v.x >= c && v.grounded && v.upright) this.reached = Math.max(this.reached, c);
    const got = this.cells.collect(v.x, v.y, 1.6);
    if (got > 0) {
      this.context.audio.pickup();
      this.context.score.add(POINTS.cell * got, "Cell", v.x, v.y + 1.5);
      v.tank = Math.min(CAR.thrustTank, v.tank + CAR.thrustTank / 3);
    }
    this.stepRings();
    this.stepTraffic(dt);
    this.stepBoars(dt);
    if (v.y < FALL_LIMIT) this.respawn();
    if (v.x >= this.config.finish && v.grounded) {
      this.done = true;
      this.context.audio.complete();
    }
  }

  /* Rings: fly through the middle for points, a burst of speed and a third of a tank. */
  private stepRings(): void {
    const v = this.crew.car.vehicle;
    for (const ring of this.rings) {
      if (ring.taken || Math.abs(ring.x - v.x) > RING_HIT || Math.abs(ring.y - v.y) > RING_HIT) continue;
      ring.taken = true;
      const combo = this.context.combo;
      combo.add(1);
      v.vx += 4;
      v.tank = Math.min(CAR.thrustTank, v.tank + CAR.thrustTank / 3);
      this.context.audio.pickup();
      this.context.score.add(STUNTS.ring * combo.multiplier, `Ring ×${combo.multiplier}`, ring.x, ring.y + 2);
    }
  }

  /* Traffic: drives on, stops for good before the next ramp; jump it (a near miss pays), hit it and you wreck. */
  private stepTraffic(dt: number): void {
    const car = this.crew.car;
    const v = car.vehicle;
    for (const t of this.traffic) {
      if (t.moving) {
        t.at += t.speed * dt;
        if (t.at >= t.until) {
          t.at = t.until;
          t.moving = false;
        }
      }
      const ground = this.terrain.height(t.at);
      const top = ground + HEIGHT[t.kind];
      const reach = LENGTH[t.kind] / 2 + 2.1;
      const dx = v.x - t.at;
      const bottom = v.y - 0.55;
      if (Math.abs(dx) < reach && bottom < top - 0.15 && v.y > ground - 0.5 && car.wrecked === 0) {
        car.crash();
        this.context.combo.break();
        continue;
      }
      // Clearing it in the air, close: a near miss.
      if (!t.passed && dx > 0 && Math.abs(dx) < reach && !v.grounded && bottom >= top - 0.15 && bottom - top < 1.8) {
        t.passed = true;
        const combo = this.context.combo;
        combo.add(1);
        this.context.audio.pickup();
        this.context.score.add(STUNTS.nearMiss * combo.multiplier, `Near miss ×${combo.multiplier}`, t.at, top + 1.5);
      }
    }
  }

  private stepBoars(dt: number): void {
    stepBeasts(this.boars, this.crew, this.context, dt, this.gravity);
  }


  /** Back on the road at the last checkpoint. */
  respawn(): void {
    this.context.audio.respawn();
    this.context.combo.break();
    this.fade = 1;
    this.respawnIn = 0;
    const at = checkpointBefore(this.config.checkpoints, this.reached) + 1;
    this.crew.car.reset(at);
  }

  draw(view: View, alpha: number): void {
    const { ctx, painter, time, dt } = view;
    const car = this.crew.car;
    const v = car.vehicle;
    // Follow the car where it's drawn (between physics steps), or it shudders against the scene.
    const fx = v.px + (v.x - v.px) * alpha;
    const fy = v.py + (v.y - v.py) * alpha;
    this.camera.follow(fx, fy, v.vx, Math.max(-2, this.terrain.height(fx)), Math.min(dt, 1 / 20));
    const snapped = this.camera.snapped();
    // Shake from ignitions, boosts and crashes (decays in the car).
    const shake = car.shake / PPM;
    const camera = { x: snapped.x + (Math.random() - 0.5) * shake, y: snapped.y + (Math.random() - 0.5) * shake };
    const toScreen = projector(camera, this.width, this.height);

    if (this.world) {
      this.world.drawBack(ctx, camera, time);
      this.world.drawGround(ctx, camera, time);
    }
    if (this.city) {
      this.city.drawBack(ctx, camera);
      this.city.drawGround(ctx, camera);
      this.city.drawLamps(ctx, toScreen, camera, 0);
    }
    this.drawObstacles(painter, toScreen);
    this.drawFinish(ctx, painter, toScreen, time);
    for (const c of this.config.checkpoints.slice(1)) {
      const [x, y] = toScreen(c, this.terrain.height(c));
      painter.rect(x, y - 10, 1, 10, "#a2aba8");
      painter.rect(x + 1, y - 10, 4, 3, c <= this.reached ? "#7fb04e" : "#fa2e00");
    }
    this.drawRings(ctx, toScreen, time, false);
    for (const cell of this.cells.items) {
      if (cell.taken) continue;
      const [x, y] = toScreen(cell.x, cell.y + Math.sin(time * 2.6 + cell.phase) * 0.1);
      glow(ctx, x, y, 11, "103, 211, 255", 0.5);
      blit(ctx, this.sprites.cell, x, y);
    }
    for (const t of this.traffic) {
      const [x, y] = toScreen(t.at, this.terrain.height(t.at));
      blit(ctx, t.sprite, x, y + 1);
      glow(ctx, x - LENGTH[t.kind] * 8, y - (t.kind === "truck" ? 9 : 10), t.moving ? 6 : 9, "255, 60, 60", t.moving ? 0.5 : 0.85);
    }
    for (const boar of this.boars) boar.draw(ctx, toScreen, time);
    this.context.particles.draw(painter, toScreen, view.frame);
    car.draw(ctx, painter, toScreen, alpha, true);
    this.drawRings(ctx, toScreen, time, true);
    if (this.world) this.world.drawFront(ctx, camera, time, this.context.still);
    this.context.score.draw(ctx, toScreen);
  }

  /* A ring seen edge-on: a tall glowing ellipse; its back half behind the car, front half in front. */
  private drawRings(ctx: CanvasRenderingContext2D, toScreen: ToScreen, time: number, front: boolean): void {
    for (const ring of this.rings) {
      if (ring.taken) continue;
      const [x, y] = toScreen(ring.x, ring.y);
      if (x < -40 || x > this.width + 40) continue;
      const r = RING_RADIUS * PPM;
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(255, ${150 + Math.round(Math.sin(time * 4) * 40)}, 60, 0.95)`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.32, r, 0, front ? -Math.PI / 2 : Math.PI / 2, front ? Math.PI / 2 : (Math.PI * 3) / 2);
      ctx.stroke();
      ctx.restore();
      if (!front) glow(ctx, x, y, r * 1.3, "255, 120, 40", 0.35);
    }
  }

  private drawFinish(ctx: CanvasRenderingContext2D, painter: Painter, toScreen: ToScreen, time: number): void {
    const x0 = this.config.finish;
    const [x, y] = toScreen(x0, this.terrain.height(x0));
    if (x < -120 || x > this.width + 120) return;
    if (this.config.scene === "forest") {
      blit(ctx, this.sprites.pad, x, y + 1);
      return;
    }
    // City limits: an arch of two pillars and a neon sign.
    painter.rect(x - 34, y - 46, 4, 46, "#2a2d33");
    painter.rect(x + 30, y - 46, 4, 46, "#2a2d33");
    painter.rect(x - 36, y - 50, 72, 8, "#14161c");
    ctx.save();
    ctx.font = "700 6px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = Math.sin(time * 6) > -0.8 ? "#ff5b28" : "#7a2a14";
    ctx.fillText("CITY LIMITS", x, y - 44);
    ctx.restore();
    glow(ctx, x, y - 46, 40, "250, 46, 0", 0.35);
  }

  /* Logs, barriers, ramp lips and gap warnings drawn over the shapes they make in the ground. */
  private drawObstacles(painter: Painter, toScreen: ToScreen): void {
    for (const f of this.config.features) {
      const [sx] = toScreen(f.x, 0);
      if (sx < -60 || sx > this.width + 60) continue;
      if (f.kind === "log") {
        const [x, y] = toScreen(f.x, this.terrain.height(f.x) - 0.42);
        painter.disc(x, y - 0.21 * PPM, 6.5, "#2a1c15");
        painter.disc(x, y - 0.21 * PPM, 4, "#5a4232");
      } else if (f.kind === "barrier") {
        const [x, y] = toScreen(f.x, this.terrain.height(f.x));
        for (let i = 0; i < 4; i++) painter.rect(x - 5 + i * 3, y - 2, 3, 3, i % 2 ? "#e9e4d6" : "#fa2e00");
      } else if (f.kind === "ramp") {
        const end = f.x + f.size;
        const [x, y] = toScreen(end, this.terrain.height(end - 0.05));
        painter.rect(x - 2, y, 2, f.size * 0.22 * PPM, "#2a2d33");
        for (let i = 0; i < 4; i++) painter.rect(x - 1, y + i * 4, 1, 2, "#ffd27a");
      } else {
        // The ravine is a dark chasm from its lips down: without this the sky glow behind the scene shows through the pit.
        const [x0, y0] = toScreen(f.x, Math.min(this.terrain.height(f.x - 0.05), this.terrain.height(f.x + f.size + 0.05)));
        const [x1] = toScreen(f.x + f.size, 0);
        painter.rect(x0, y0 + 2, x1 - x0, Math.max(0, this.height - y0), "#05060a");
        const [x, y] = toScreen(f.x - 5, this.terrain.height(f.x - 5));
        painter.rect(x, y - 12, 1, 12, "#a2aba8");
        painter.poly([[x - 4, y - 16], [x + 5, y - 16], [x + 5, y - 11], [x - 4, y - 11]], "#ffd27a");
        painter.line(x - 2, y - 15, x, y - 13, "#1b1d22");
        painter.line(x, y - 13, x - 2, y - 11, "#1b1d22");
        painter.line(x + 2, y - 15, x + 4, y - 13, "#1b1d22");
        painter.line(x + 4, y - 13, x + 2, y - 11, "#1b1d22");
      }
    }
  }

  hud(): StageHud {
    const car = this.crew.car;
    const v = car.vehicle;
    const gap = this.config.features.find((f) => f.kind === "ravine" && f.x - v.x > 0 && f.x - v.x < 35);
    let prompt = "";
    if (v.x < 22) prompt = "→ Drive    Space · Hop    Space in air · Boost    Hold · Hover    Tap ← → in air · Flip";
    else if (car.wrecked > 0) prompt = "Wrecked: land on your wheels";
    else if (gap) prompt = "Gap ahead: hop, boost, hover";
    else if (this.boars.some((b) => b.active && b.x - v.x > 0 && b.x - v.x < 30)) prompt = "Beasts: hit them fast, fly over, or blast them with the thrusters";
    else if (car.airborne && car.flipsInAir > 0) prompt = `${car.flipsInAir} flip${car.flipsInAir > 1 ? "s" : ""}: land it level`;
    return {
      prompt,
      speed: v.speed * 3.6,
      tank: v.tank / CAR.thrustTank,
      altitude: null,
      hearts: null,
      fuel: car.fuelSeconds,
      landIn: car.landIn,
    };
  }
}

/** Points for flying: air time, flips and a clean landing, multiplied by the combo. */
export function scoreCarEvents(events: readonly CarEvent[], car: Car, context: StageContext): void {
  const v = car.vehicle;
  const { combo, score } = context;
  for (const event of events) {
    if (event.kind === "crash") {
      combo.break();
      score.add(0, "Wrecked", v.x, v.y + 2);
    } else if (event.kind === "land") {
      const air = Math.round(event.air * POINTS.airPerSecond);
      if (event.clean) {
        combo.add(event.flips + 1 + (event.air > 1.2 ? 1 : 0));
        const points = (air + event.flips * STUNTS.flip + POINTS.cleanLanding) * combo.multiplier;
        const label = event.flips > 0 ? `${event.flips} flip${event.flips > 1 ? "s" : ""} · ×${combo.multiplier}` : `Air ${event.air.toFixed(1)}s · ×${combo.multiplier}`;
        score.add(points, label, v.x, v.y + 2);
      } else {
        combo.break();
        score.add(air, "Rough landing", v.x, v.y + 2);
      }
    }
  }
}
