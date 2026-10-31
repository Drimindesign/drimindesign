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
import { Debris } from "../pixel/debris";
import { Fighters3D } from "../pixel/fighters-3d";
import { Village } from "../pixel/village";
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
  kind: "car" | "truck" | "rickshaw";
  color: string;
}

export interface RoadConfig {
  id: "village" | "city" | "forest";
  scene: "village" | "city" | "forest";
  /** Surface gravity (m/s²); Earth's when omitted. */
  gravity?: number;
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
  /** Things to smash on the road: crate stacks, market stalls, fences (x m, kind). */
  props?: readonly (readonly [number, PropKind])[];
  /** Barricades across the road (m): get out, fight the raiders guarding it, and cut it down. */
  stops?: readonly { x: number; fighters: readonly (readonly [number, BeastKind])[] }[];
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
const HEIGHT = { car: 1.45, truck: 3.1, rickshaw: 1.75 } as const;
const LENGTH = { car: 4.4, truck: 7, rickshaw: 2.8 } as const;
export type PropKind = "crates" | "stall" | "fence";

/**
 * Breakables: mass (kg, for the momentum the car loses), the speed (m/s) below which the car just
 * stops against it, size (m), damage to the truck, points, and the colours its pieces fly in.
 */
const PROPS: Record<PropKind, { mass: number; breakAt: number; width: number; height: number; damage: number; points: number; colors: readonly string[] }> = {
  crates: { mass: 70, breakAt: 1.5, width: 1.7, height: 1.7, damage: 0.03, points: 40, colors: ["#8a6440", "#6b4b2e", "#a47a4e"] },
  stall: { mass: 240, breakAt: 6, width: 3, height: 2.4, damage: 0.08, points: 80, colors: ["#6b4b2e", "#e0481c", "#f1e6d2", "#3f7a5a", "#d9a91c"] },
  fence: { mass: 45, breakAt: 1.5, width: 3, height: 1.1, damage: 0.02, points: 25, colors: ["#7a5c43", "#5a4232"] },
};
/** How much damage reaching a new checkpoint repairs. */
const REPAIR = 0.5;
/** Sword blows a barricade takes, its height (m), and the speed (m/s) above which hitting it wrecks the car. */
const BARRICADE = { health: 4, height: 6, wreck: 7 } as const;
/** Within this distance before a barricade (m), the car can be left. */
const STOP_ZONE = 16;
/** The finale: the launch rig lifts the car off the pad for this long (s) before the stage ends. */
const LIFTOFF_TIME = 3.2;

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
  readonly id: "village" | "city" | "forest";
  private readonly terrain: RoadTerrain;
  private readonly world: World | null;
  private readonly city: City | null;
  private readonly village: Village | null;
  private readonly camera = new FollowCamera(480, 270);
  private readonly crew: Crew;
  private readonly cells: Pickups;
  private readonly rings: { x: number; y: number; taken: boolean }[];
  private readonly traffic: Traffic[];
  private readonly boars: Boar[];
  private readonly stops: { x: number; health: number; broken: boolean }[];
  private readonly fighters = new Fighters3D();
  private readonly debris = new Debris();
  private readonly props: { x: number; kind: PropKind; broken: boolean }[];
  private readonly sprites = { cell: CELL(), pad: LAUNCH_PAD() };
  private reached: number;
  private respawnIn = 0;
  private width = 480;
  private height = 270;
  private done = false;
  /** Seconds into the lift-off from the pad, or -1. */
  private liftoff = -1;
  fade = 0;
  private readonly gravity: number;

  constructor(
    private readonly context: StageContext,
    look: ExplorerId,
    private readonly config: RoadConfig,
  ) {
    this.id = config.id;
    this.terrain = new RoadTerrain(config.seed, config.features, config.hills);
    this.world = config.scene === "forest" ? new World(this.terrain, NIGHT) : null;
    this.city = config.scene === "city" ? new City(this.terrain) : null;
    this.village = config.scene === "village" ? new Village(this.terrain, config.features) : null;
    this.gravity = config.gravity ?? PLANETS.earth.gravity;
    const explorer = new Explorer(4, this.terrain, look, context.audio, context.particles);
    const car = new Car(6, this.terrain, context.audio, context.particles);
    this.crew = new Crew(explorer, car, this.terrain, context.audio);
    this.crew.seat();
    this.cells = new Pickups(config.cells.map(([x, h]) => [x, Math.max(0, this.terrain.height(x)) + h] as const));
    this.rings = config.rings.map(([x, h]) => ({ x, y: Math.max(0, this.terrain.height(x)) + h, taken: false }));
    this.traffic = config.traffic.map((t) => ({ ...t, at: t.x, moving: true, passed: false, sprite: TRAFFIC(t.kind, t.color) }));
    this.boars = config.beasts.map(([x, kind]) => new Boar(x, this.terrain, kind));
    this.stops = (config.stops ?? []).map((s) => ({ x: s.x, health: BARRICADE.health, broken: false }));
    this.props = (config.props ?? []).map(([x, kind]) => ({ x, kind, broken: false }));
    for (const s of config.stops ?? []) for (const [x, kind] of s.fighters) this.boars.push(new Boar(x, this.terrain, kind));
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
    this.village?.resize(width, height);
    this.fighters.resize(width, height);
  }

  dispose(): void {
    this.fighters.dispose();
  }

  /** The first barricade still standing within reach ahead of x (m), if any. */
  private stopAhead(x: number, within: number): { x: number; health: number; broken: boolean } | undefined {
    return this.stops.find((s) => !s.broken && s.x - x > -1 && s.x - x < within);
  }

  step(dt: number, input: InputSnapshot): void {
    this.fade = Math.max(0, this.fade - dt * 1.6);
    if (this.done) return;
    const car = this.crew.car;
    const v = car.vehicle;
    if (this.liftoff >= 0) {
      this.stepLiftoff(dt, input);
      return;
    }
    // At a barricade the car can be left; on foot you can always climb back in at the door.
    this.crew.step(dt, this.gravity, input, { board: true, alight: this.stopAhead(v.x, STOP_ZONE) !== undefined });
    this.context.particles.update(dt, this.terrain, this.gravity);
    this.context.combo.update(dt, v.grounded);
    this.stepStops();
    this.stepProps();
    this.debris.update(dt, this.terrain, this.gravity);
    if (this.crew.mode === "car") this.debris.shove(v.x, v.y, v.vx);
    scoreCarEvents(car.drainEvents(), car, this.context);

    if (car.wrecked > 0 && this.respawnIn === 0) this.respawnIn = car.wrecked;
    if (this.respawnIn > 0) {
      this.respawnIn = Math.max(0, this.respawnIn - dt);
      if (this.respawnIn === 0) this.respawn();
      return;
    }

    for (const c of this.config.checkpoints) {
      if (v.x >= c && v.grounded && v.upright && c > this.reached) {
        this.reached = c;
        // Each new checkpoint patches the truck up.
        if (car.damage > 0.05) {
          car.repair(REPAIR);
          this.context.score.add(0, "Repaired", v.x, v.y + 2.5);
        }
      }
    }
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
      this.context.audio.complete();
      // The forest road ends on the launch pad: the car lifts off. Elsewhere the stage just ends.
      if (this.config.scene === "forest") {
        this.liftoff = 0;
        this.context.audio.ignition();
      } else {
        this.done = true;
      }
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
      this.context.fx.punch(0.03);
      if (this.crew.car.vehicle.gainBooster()) this.context.score.add(0, "+1 Booster", ring.x, ring.y + 3.2);
    }
  }

  /* Traffic: drives on, stops for good before the next ramp; jump it (a near miss pays), hit it and you wreck. */
  private stepTraffic(dt: number): void {
    const car = this.crew.car;
    const v = car.vehicle;
    for (const t of this.traffic) {
      if (t.moving) {
        // Drivers brake: for a barricade across the road, and for the player stopped ahead.
        const front = t.at + LENGTH[t.kind] / 2;
        const wall = this.stops.find((stop) => !stop.broken && stop.x > front - 1);
        const until = Math.min(t.until, wall ? wall.x - LENGTH[t.kind] / 2 - 1 : Infinity);
        const playerAhead = v.x > t.at && v.x - 2.4 - front < 2;
        if (!playerAhead) t.at = Math.min(until, t.at + t.speed * dt);
        if (t.at >= t.until) t.moving = false;
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
        this.context.fx.punch(0.03);
        if (v.gainBooster()) this.context.score.add(0, "+1 Booster", t.at, top + 2.7);
      }
    }
  }

  private stepBoars(dt: number): void {
    // Out of hearts on foot: back on your feet beside the truck, hearts restored.
    if (stepBeasts(this.boars, this.crew, this.context, dt, this.gravity)) {
      this.context.audio.respawn();
      this.fade = 1;
      this.crew.explorer.place(this.crew.car.door.x - 1.5);
      this.crew.explorer.heal();
    }
    // A fight on foot pulls the camera in.
    const e = this.crew.explorer.body;
    if (this.crew.mode === "foot" && this.boars.some((b) => b.fighter && b.active && Math.abs(b.x - e.x) < 10)) this.context.fx.focus(1.16);
  }

  /*
   * Breakables. The car hitting one faster than it can take shatters it into pieces thrown with
   * the car's speed, and loses momentum by the mass it hit (an inelastic collision: v' = v·M/(M+m));
   * slower than that, a heavy one just stops the car. Flying over clears it. On foot, the sword
   * breaks them too.
   */
  private stepProps(): void {
    const car = this.crew.car;
    const v = car.vehicle;
    const e = this.crew.explorer;
    for (const prop of this.props) {
      if (prop.broken) continue;
      const spec = PROPS[prop.kind];
      const ground = this.terrain.height(prop.x);
      const near = prop.x - spec.width / 2;
      const far = prop.x + spec.width / 2;
      if (this.crew.mode === "car" && car.wrecked === 0 && v.x + 2.3 > near && v.x - 2.3 < far && v.y - 0.5 < ground + spec.height) {
        if (Math.abs(v.vx) >= spec.breakAt) {
          this.smash(prop, v.vx, v.vy);
          v.vx *= CAR.mass / (CAR.mass + spec.mass);
          car.hurt(spec.damage);
        } else if (v.vx > 0) {
          v.x = near - 2.3;
          v.vx = 0;
        }
        continue;
      }
      if (this.crew.mode === "foot" && e.striking && !e.struck.has(prop)) {
        const box = e.hitbox;
        if (box.x1 > near && box.x0 < far && box.y0 < ground + spec.height) {
          e.struck.add(prop);
          e.recoil();
          this.smash(prop, e.body.facing * 4, 2);
        }
      }
    }
  }

  private smash(prop: { x: number; kind: PropKind; broken: boolean }, vx: number, vy: number): void {
    const spec = PROPS[prop.kind];
    const ground = this.terrain.height(prop.x);
    prop.broken = true;
    this.debris.burst(prop.x, ground + spec.height / 3, vx, vy, Math.round(10 + spec.mass / 12), 2.5 + Math.abs(vx) * 0.25, spec.colors, prop.kind === "stall" ? 0.5 : 0.35);
    this.context.particles.dust(prop.x, ground, vx * 0.5, 16, 1.2);
    this.context.audio.thwack();
    this.context.fx.punch(prop.kind === "stall" ? 0.07 : 0.04);
    this.context.combo.add(1);
    this.context.score.add(spec.points * this.context.combo.multiplier, prop.kind === "stall" ? "Stall smashed" : "Smashed", prop.x, ground + spec.height + 0.5);
  }

  /*
   * Barricades: a wall of logs and spikes. The car stops against it, or is wrecked if it comes
   * in fast; flying over is too high. On foot it's cut down with the sword, blow by blow.
   */
  private stepStops(): void {
    const car = this.crew.car;
    const v = car.vehicle;
    const e = this.crew.explorer;
    for (const stop of this.stops) {
      if (stop.broken) continue;
      const ground = this.terrain.height(stop.x);
      const front = stop.x - 0.6;
      if (v.x + 2.4 > front && v.x < stop.x + 1 && v.y < ground + BARRICADE.height) {
        if (car.wrecked === 0 && v.vx > BARRICADE.wreck) car.crash();
        v.x = front - 2.4;
        v.vx = Math.min(0, v.vx) - 0.5;
      }
      if (this.crew.mode !== "foot") continue;
      const b = e.body;
      if (b.x > front - 0.3 && b.x < stop.x + 1) {
        b.x = front - 0.3;
        b.vx = Math.min(0, b.vx);
      }
      const box = e.hitbox;
      if (e.striking && !e.struck.has(stop) && box.x1 > front && box.x0 < stop.x + 0.6) {
        e.struck.add(stop);
        e.recoil();
        stop.health--;
        this.context.audio.thwack();
        this.context.particles.dust(front, ground + 1.2, -3, 18, 1.4);
        this.context.fx.punch(0.05);
        if (stop.health <= 0) {
          stop.broken = true;
          this.debris.burst(stop.x, ground + 1.5, e.body.facing * 5, 3, 26, 5, ["#5a4232", "#6b4f3a", "#7a5c43", "#b5452a"], 0.5);
          this.context.audio.land(1);
          this.context.particles.dust(stop.x, ground + 1, 4, 60, 2.2);
          this.context.fx.punch(0.1);
          this.context.score.add(POINTS.stageClear / 2, "Road cleared", stop.x, ground + 3);
        }
      }
    }
  }


  /* The finale: thrusters full, the car rises off the pad into the night, then the stage ends. */
  private stepLiftoff(dt: number, input: InputSnapshot): void {
    const v = this.crew.car.vehicle;
    this.liftoff += dt;
    v.tank = CAR.thrustTank;
    this.crew.step(dt, this.gravity, { ...input, move: 0, flipPressed: 0, jumpHeld: true, jumpPressed: false }, { board: false, alight: false });
    this.context.particles.update(dt, this.terrain, this.gravity);
    // The pad's launch rig takes over from the driver: a steady, level climb.
    v.vy = Math.min(24, Math.max(v.vy, 0) + 15 * dt);
    v.vx *= Math.exp(-2 * dt);
    v.spinRate += (-v.angle * 20 - v.spinRate * 6) * dt;
    if (this.liftoff > LIFTOFF_TIME) this.done = true;
  }

  /** Back on the road at the last checkpoint. */
  respawn(): void {
    this.context.audio.respawn();
    this.context.combo.break();
    this.fade = 1;
    this.respawnIn = 0;
    const at = checkpointBefore(this.config.checkpoints, this.reached) + 1;
    this.crew.car.reset(at);
    this.crew.seat();
    // Guards of a barricade still standing are back at their posts.
    for (const b of this.boars) if (b.fighter && b.state !== "down" && b.state !== "gone") b.reset();
  }

  draw(view: View, alpha: number): void {
    const { ctx, painter, time, dt } = view;
    const car = this.crew.car;
    const v = car.vehicle;
    // Follow the car where it's drawn (between physics steps), or it shudders against the scene.
    const foot = this.crew.mode !== "car";
    const target = foot ? this.crew.explorer.body : v;
    const fx = target.px + (target.x - target.px) * alpha;
    const fy = target.py + (target.y - target.py) * alpha;
    this.camera.follow(fx, fy, target.vx, Math.max(-2, this.terrain.height(fx)), Math.min(dt, 1 / 20));
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
    if (this.village) {
      this.village.drawBack(ctx, camera);
      this.village.drawGround(ctx, camera);
      this.village.drawLanterns(ctx, toScreen, camera, time);
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
    this.drawBarricades(painter, toScreen);
    this.drawProps(painter, toScreen, time);
    this.debris.draw(ctx, toScreen, this.width);
    for (const boar of this.boars) if (!(boar.fighter || boar.animal3D) || !this.fighters.ready) boar.draw(ctx, toScreen, time);
    this.context.particles.draw(painter, toScreen, view.frame);
    car.draw(ctx, painter, toScreen, alpha, true);
    // The people, in 3D and in front of the truck: the hero when out of it, and the raiders.
    // Until the models have loaded, the 2D explorer.
    const hero = foot ? this.crew.explorer : null;
    if (!this.fighters.draw(ctx, camera, dt, alpha, hero, this.boars) && hero) hero.draw(ctx, painter, toScreen, alpha, dt, this.gravity);
    this.drawRings(ctx, toScreen, time, true);
    if (this.world) this.world.drawFront(ctx, camera, time, this.context.still);
    this.village?.drawRain(ctx, time, this.context.still);
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
    ctx.fillText(this.config.scene === "village" ? "HIGHWAY" : "CITY LIMITS", x, y - 44);
    ctx.restore();
    glow(ctx, x, y - 46, 40, "250, 46, 0", 0.35);
  }

  /* Crate stacks, market stalls with striped awnings, fences: drawn until they're smashed. */
  private drawProps(painter: Painter, toScreen: ToScreen, time: number): void {
    for (const prop of this.props) {
      if (prop.broken) continue;
      const [x, y] = toScreen(prop.x, this.terrain.height(prop.x));
      if (x < -60 || x > this.width + 60) continue;
      if (prop.kind === "crates") {
        for (const [cx, cy] of [[-13, 0], [0, 0], [-6, -13]] as const) {
          painter.rect(x + cx, y + cy - 13, 13, 13, "#8a6440");
          painter.rect(x + cx, y + cy - 13, 13, 1, "#a47a4e");
          painter.line(x + cx + 1, y + cy - 12, x + cx + 12, y + cy - 1, "#5a3f26");
          painter.line(x + cx + 12, y + cy - 12, x + cx + 1, y + cy - 1, "#5a3f26");
        }
      } else if (prop.kind === "stall") {
        const awning = this.config.scene === "village" ? ["#e0481c", "#f1e6d2"] : ["#2f6db0", "#f1e6d2"];
        painter.rect(x - 24, y - 38, 2, 38, "#4a3424");
        painter.rect(x + 22, y - 38, 2, 38, "#4a3424");
        painter.rect(x - 24, y - 16, 48, 4, "#6b4b2e");
        painter.rect(x - 24, y - 12, 48, 12, "#5a3f26");
        for (let i = 0; i < 8; i++) painter.rect(x - 26 + i * 6.5, y - 42 + Math.sin(time * 2 + i) * 0.5, 6.5, 6, awning[i % 2]);
        for (let i = 0; i < 7; i++) painter.disc(x - 18 + i * 6, y - 18, 2, i % 3 === 0 ? "#d9a91c" : i % 3 === 1 ? "#3f7a5a" : "#e0481c");
      } else {
        for (let i = 0; i < 4; i++) painter.rect(x - 24 + i * 16, y - 18, 2, 18, "#5a4232");
        painter.rect(x - 24, y - 15, 50, 2, "#7a5c43");
        painter.rect(x - 24, y - 8, 50, 2, "#7a5c43");
      }
    }
  }

  /* A barricade: logs lashed upright, sharpened stakes, a red rag; it sheds logs as it's cut. */
  private drawBarricades(painter: Painter, toScreen: ToScreen): void {
    for (const stop of this.stops) {
      if (stop.broken) continue;
      const [x, y] = toScreen(stop.x, this.terrain.height(stop.x));
      if (x < -40 || x > this.width + 40) continue;
      const logs = 2 + stop.health;
      for (let i = 0; i < logs; i++) {
        const h = 26 + ((i * 7) % 11);
        painter.rect(x - 10 + i * 4, y - h, 3, h, i % 2 ? "#5a4232" : "#6b4f3a");
        painter.poly([[x - 10 + i * 4, y - h], [x - 8.5 + i * 4, y - h - 4], [x - 7 + i * 4, y - h]], "#7a5c43");
      }
      painter.rect(x - 11, y - 18, logs * 4 + 2, 2, "#3a2a1c");
      painter.rect(x - 11, y - 8, logs * 4 + 2, 2, "#3a2a1c");
      painter.rect(x - 2, y - 24, 4, 5, "#b5452a");
    }
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
        {
          const [x0, y0] = toScreen(f.x, Math.min(this.terrain.height(f.x - 0.05), this.terrain.height(f.x + f.size + 0.05)));
          const [x1] = toScreen(f.x + f.size, 0);
          painter.rect(x0, y0 + 2, x1 - x0, Math.max(0, this.height - y0), "#05060a");
        }
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
    const foot = this.crew.mode !== "car";
    const stop = this.stopAhead(foot ? this.crew.explorer.body.x : v.x, STOP_ZONE);
    if (this.liftoff >= 0) prompt = "Lift-off";
    else if (foot && this.crew.nearDoor && !stop) prompt = "E · Back in the truck";
    else if (foot) prompt = "F · Sword: cut down the barricade and its guards    Space · Jump";
    else if (stop && this.crew.canAlight) prompt = "Barricade! E · Get out and break it";
    else if (stop) prompt = "Barricade ahead: stop the truck";
    else if (v.x < 22) prompt = "→ Drive    Space · Hop    Space in air · Booster ◆    Hold · Hover    Tap ← → in air · Flip";
    else if (car.wrecked > 0) prompt = "Wrecked: land on your wheels";
    else if (gap) prompt = "Gap ahead: hit the ramp fast and hop · short? Booster ◆";
    else if (this.boars.some((b) => b.active && b.x - v.x > 0 && b.x - v.x < 30)) prompt = "Beasts: hit them fast, fly over, or blast them with the thrusters";
    else if (car.airborne && car.flipsInAir > 0) prompt = `${car.flipsInAir} flip${car.flipsInAir > 1 ? "s" : ""}: land it level`;
    return {
      prompt,
      speed: v.speed * 3.6,
      tank: v.tank / CAR.thrustTank,
      altitude: null,
      hearts: null,
      fuel: car.fuelSeconds,
      landIn: this.liftoff >= 0 || foot ? null : car.landIn,
      actions: foot || stop !== undefined,
      damage: car.damage,
      boosters: { have: v.boosters, max: CAR.boosters },
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
      // The crash lands hard: a punch in and a moment of slow motion.
      context.fx.punch(0.12);
      context.fx.slowmo(0.45);
    } else if (event.kind === "land") {
      const air = Math.round(event.air * POINTS.airPerSecond);
      if (event.clean) {
        combo.add(event.flips + 1 + (event.air > 1.2 ? 1 : 0));
        const points = (air + event.flips * STUNTS.flip + POINTS.cleanLanding) * combo.multiplier;
        const label = event.flips > 0 ? `${event.flips} flip${event.flips > 1 ? "s" : ""} · ×${combo.multiplier}` : `Air ${event.air.toFixed(1)}s · ×${combo.multiplier}`;
        score.add(points, label, v.x, v.y + 2);
        context.fx.punch(0.03 + 0.03 * event.flips);
        // Flips landed clean earn a booster charge.
        if (event.flips > 0 && v.gainBooster()) score.add(0, "+1 Booster", v.x, v.y + 3.2);
      } else {
        combo.break();
        score.add(air, "Rough landing", v.x, v.y + 2);
      }
    }
  }
}
