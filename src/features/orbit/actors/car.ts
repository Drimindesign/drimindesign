import type { GameAudio } from "../engine/audio";
import type { ToScreen } from "../engine/camera";
import { ART, CAR, PPM } from "../engine/config";
import type { Terrain } from "../engine/terrain";
import { Vehicle } from "../engine/vehicle";
import { createCarSprite, drawWheel, type CarSprite } from "../pixel/car-sprite";
import type { Painter } from "../pixel/painter";
import type { Particles } from "../pixel/particles";

const SHADOW = "rgba(8, 6, 14, 0.5)";
/** Headlight reach (m). */
const HEADLIGHT = 9;
/** Landing within this of the ground's angle is clean (rad, ~29°); beyond CRASH_ANGLE it's a wreck. */
const CLEAN_ANGLE = 0.5;
const CRASH_ANGLE = 1.25;
/** A wreck lies still this long before the stage puts you back at a checkpoint (s). */
const WRECK_TIME = 1.1;
/** Points on the body that can hit the ground first in a bad landing (car space, m). */
const BODY_POINTS: readonly [number, number][] = [[0.15, 0.6], [2.3, -0.3], [-2.28, 0.1], [1.2, 0.29], [-1.2, 0.36]];
/** Visible jet below each nozzle at full thrust (m): cold gas leaves at a few hundred m/s, so it's a short, straight core. */
const JET = 1.1;
/** The forward boost's flash out of the tail (s). */
const BOOST_FLASH = 0.28;
/**
 * Damage (0 … 1): what a crash and a hard landing cost, where the hood starts steaming, where the
 * thrusters start to sputter, and how much engine power is lost at full damage.
 */
const DAMAGE = { crash: 0.25, hardLanding: 0.05, steam: 0.35, sputter: 0.6, powerLoss: 0.4 } as const;
/** Braking this hard (m/s, forward speed) scuffs dust off the tyres. */
const SKID_SPEED = 9;

export interface CarInput {
  /** -1 … 1: brake/reverse … throttle (on the ground only). */
  move: number;
  /** A tap of ← or → this step: in the air, one full back or front flip. */
  flipPressed: number;
  /** Thruster button held, and pressed this step. */
  thrustHeld: boolean;
  thrustPressed: boolean;
}

export type CarEvent =
  | { kind: "land"; air: number; flips: number; clean: boolean }
  | { kind: "crash" }
  | { kind: "boost" };

let sprite: CarSprite | null = null;

/** Angle wrapped to −π … π. */
function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/*
 * The car as one actor: the raycast vehicle and its sprite, and the stunt layer on top of its
 * physics. The thruster button lifts off the ground, boosts forward on a second press in the
 * air, and hovers while held; a tap of ← or → in the air turns one full flip. Every touchdown is judged against
 * the slope of the ground: clean (on the wheels, flips counted), rough, or a wreck when the
 * nose, roof or tail hits first. It also emits the exhaust, the landing dust, the predicted
 * flight arc, headlights and contact shadow.
 */
export class Car {
  readonly vehicle: Vehicle;
  private readonly sprite: CarSprite;
  occupied = false;
  /** Landings from a real height that ended clean. */
  cleanLandings = 0;
  /** Screen shake (art px), decaying. */
  shake = 0;
  private wasGrounded = true;
  private sink = 0;
  private air = 0;
  /** Rotation accumulated in the air (rad): flips are whole turns of it. */
  private rotation = 0;
  private gravity = 9.81;
  /** Seconds left lying wrecked, or 0. */
  wrecked = 0;
  private readonly events: CarEvent[] = [];
  /** Predicted path if the thrusters were released now (world m), and seconds to touchdown. */
  private readonly arc: { x: number; y: number }[] = [];
  landIn: number | null = null;
  /** Lights follow the pedal: brake lights while slowing, the reversing light while backing up. */
  private braking = false;
  private reversing = false;
  private boostFlash = 0;
  /** Accumulated damage, 0 (new) … 1 (finished). */
  damage = 0;

  constructor(
    x: number,
    private readonly terrain: Terrain,
    private readonly audio: GameAudio,
    private readonly particles: Particles,
  ) {
    this.vehicle = new Vehicle(x, terrain);
    this.vehicle.reset(x);
    sprite ??= createCarSprite();
    this.sprite = sprite;
  }

  get door(): { x: number; y: number } {
    return this.vehicle.toWorld(CAR.door.x, CAR.door.y);
  }

  get seat(): { x: number; y: number } {
    return this.vehicle.toWorld(CAR.seat.x, CAR.seat.y);
  }

  /** Seconds of thrust left in the tank. */
  get fuelSeconds(): number {
    return this.vehicle.tank;
  }

  get airborne(): boolean {
    return !this.vehicle.grounded && this.air > 0.15;
  }

  /** Flips completed so far in the current jump. */
  get flipsInAir(): number {
    return Math.floor((Math.abs(this.rotation) + 0.6) / (Math.PI * 2));
  }

  drainEvents(): CarEvent[] {
    return this.events.splice(0);
  }

  step(dt: number, gravity: number, input: CarInput, parked = false): void {
    const car = this.vehicle;
    this.gravity = gravity;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.boostFlash = Math.max(0, this.boostFlash - dt);
    const forward = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
    this.braking = !parked && car.grounded && input.move < 0 && forward > 0.5;
    this.reversing = !parked && car.grounded && input.move < 0 && forward <= 0.5;
    if (this.wrecked > 0) {
      this.wrecked = Math.max(0, this.wrecked - dt);
      car.step(dt, gravity, { throttle: 0, thrust: false, thrustPressed: false, parked: true });
      return;
    }
    const grounded = car.grounded;
    const hop = !parked && input.thrustPressed && grounded;
    const boost = !parked && input.thrustPressed && !grounded;
    // A damaged truck: less power, and past a point the thrusters cut in and out.
    const power = 1 - DAMAGE.powerLoss * this.damage;
    const sputter = this.damage > DAMAGE.sputter && Math.random() < (this.damage - DAMAGE.sputter) * 1.6;
    car.step(dt, gravity, {
      throttle: parked ? 0 : input.move * power,
      thrust: !parked && input.thrustHeld && !hop && !sputter,
      thrustPressed: hop,
      parked,
      flip: parked ? 0 : input.flipPressed,
      boost,
    });

    const down = { x: Math.sin(car.angle), y: -Math.cos(car.angle) };
    if (car.thrust > 0) {
      for (const nozzle of CAR.nozzles) {
        // Vapour condenses where the jet ends, not at the nozzle.
        const at = car.toWorld(nozzle.x, nozzle.y - JET * car.thrust * 0.8);
        this.particles.gas(at.x, at.y, down.x, down.y, car.vx, car.vy, car.thrust);
        // Close to the road the jet hits it and fans out sideways along the ground.
        const ground = this.terrain.height(at.x);
        if (at.y - ground < JET * 1.6) {
          const spread = 1 - (at.y - ground) / (JET * 1.6);
          this.particles.gas(at.x, ground + 0.08, Math.random() < 0.5 ? 1 : -1, 0.12, car.vx, 0, spread);
        }
      }
    }
    // Damage shows: steam from under the hood, thicker the worse it gets.
    if (this.damage > DAMAGE.steam && Math.random() < (this.damage - DAMAGE.steam) * 0.5) {
      const hood = car.toWorld(1.5, 0.15);
      this.particles.gas(hood.x, hood.y, -0.3, 1, car.vx, car.vy, 0.25);
    }
    // Hard braking at speed: dust off the tyres.
    if (this.braking && forward > SKID_SPEED && Math.random() < 0.5) {
      const rear = car.wheels[0];
      this.particles.dust(rear.cx, this.terrain.height(rear.cx), car.vx * 0.5, 1, 0.4);
    }
    if (hop) {
      this.audio.ignition();
      for (const nozzle of CAR.nozzles) {
        const at = car.toWorld(nozzle.x, nozzle.y);
        for (let i = 0; i < 24; i++) this.particles.gas(at.x, at.y, down.x, down.y, car.vx, car.vy, 0.8);
      }
    }
    if (car.boosted) {
      // The burst leaves out of the tail, against the direction of travel.
      this.audio.ignition();
      this.boostFlash = BOOST_FLASH;
      const tail = car.toWorld(-2.3, -0.1);
      const back = { x: -Math.cos(car.angle), y: -Math.sin(car.angle) };
      for (let i = 0; i < 36; i++) this.particles.gas(tail.x, tail.y, back.x, back.y, car.vx, car.vy, 1);
      this.events.push({ kind: "boost" });
    }

    if (!car.grounded) {
      this.sink = Math.max(this.sink, -car.vy);
      this.air += dt;
      this.rotation += car.spinRate * dt;
      // Nose, roof or tail into the ground: a wreck.
      if (this.air > 0.2 && this.bodyTouching() && Math.abs(this.error()) > CRASH_ANGLE) this.crash();
    } else if (!this.wasGrounded) {
      this.touchdown();
    }
    if (car.grounded) {
      this.sink = 0;
      // Ended up on its back on the ground and stopped: same as a crash.
      if (Math.abs(this.error()) > CRASH_ANGLE && this.air === 0 && car.speed < 2) this.crash();
    }
    this.wasGrounded = car.grounded;
    this.predict();
  }

  /** The body's angle relative to the ground under it (rad). */
  private error(): number {
    const car = this.vehicle;
    return wrap(car.angle - Math.atan(this.terrain.slope(car.x)));
  }

  private bodyTouching(): boolean {
    const car = this.vehicle;
    return BODY_POINTS.some(([lx, ly]) => {
      const p = car.toWorld(lx, ly);
      return p.y - this.terrain.height(p.x) < 0.06;
    });
  }

  private touchdown(): void {
    const car = this.vehicle;
    const error = Math.abs(this.error());
    if (error > CRASH_ANGLE) {
      this.crash();
      return;
    }
    if (this.sink > 9) this.hurt(DAMAGE.hardLanding);
    if (this.sink > 3) {
      const force = Math.min(1, this.sink / 12);
      this.particles.dust(car.x, this.terrain.height(car.x), car.vx, Math.round(10 + force * 30), 0.6 + force);
      this.audio.land(force);
      this.shake = Math.max(this.shake, force * 3);
    }
    if (this.air > 0.5) {
      const clean = error < CLEAN_ANGLE;
      const flips = this.flipsInAir;
      if (clean) {
        this.cleanLandings++;
        // A clean landing out of flips pays in speed too.
        if (flips > 0) car.vx += Math.cos(car.angle) * 2.5 * flips;
      }
      this.events.push({ kind: "land", air: this.air, flips, clean });
    }
    this.air = 0;
    this.rotation = 0;
  }

  /** A wreck: on a bad landing, or driving into something solid. */
  crash(): void {
    const car = this.vehicle;
    this.damage = Math.min(1, this.damage + DAMAGE.crash);
    this.wrecked = WRECK_TIME;
    this.air = 0;
    this.rotation = 0;
    this.shake = 5;
    this.audio.land(1);
    this.audio.grunt();
    this.particles.dust(car.x, car.y, car.vx, 50, 1.6);
    car.vx *= 0.25;
    this.events.push({ kind: "crash" });
  }

  /** Takes damage from a hit (0 … 1); at full damage the truck is finished and wrecks. */
  hurt(amount: number): void {
    this.damage = Math.min(1, this.damage + amount);
    if (this.damage >= 1 && this.wrecked === 0) this.crash();
  }

  /** Patched up (at a checkpoint): takes `amount` of the damage away. */
  repair(amount: number): void {
    this.damage = Math.max(0, this.damage - amount);
  }

  /** Back on its wheels at x (a checkpoint after a fall or a wreck), repaired if it was finished. */
  reset(x: number): void {
    if (this.damage >= 1) this.damage = 0.3;
    this.vehicle.reset(x);
    this.sink = 0;
    this.air = 0;
    this.rotation = 0;
    this.wrecked = 0;
    this.wasGrounded = true;
  }

  /*
   * Where the car comes down if the thrusters stop now: the centre of mass as a projectile
   * under the planet's gravity (air drag is negligible at these speeds), stepped until it
   * meets the ground. Updated every step, so it answers "how far, how high, how long" live.
   */
  private predict(): void {
    const car = this.vehicle;
    this.arc.length = 0;
    this.landIn = null;
    if (car.grounded || car.altitude < 0.6 || this.wrecked > 0) return;
    let x = car.x;
    let y = car.y;
    const vx = car.vx;
    let vy = car.vy;
    const h = 1 / 30;
    for (let t = 0; t < 6; t += h) {
      vy -= this.gravity * h;
      x += vx * h;
      y += vy * h;
      this.arc.push({ x, y });
      if (y - 0.55 <= this.terrain.height(x)) {
        this.landIn = t;
        return;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, painter: Painter, toScreen: ToScreen, alpha: number, headlights: boolean): void {
    const car = this.vehicle;
    const x = car.px + (car.x - car.px) * alpha;
    const y = car.py + (car.y - car.py) * alpha;
    const angle = car.pangle + (car.angle - car.pangle) * alpha;

    // The predicted flight: a dotted arc to a bracket on the ground where it will land.
    if (this.occupied && this.arc.length > 2) {
      for (let i = 2; i < this.arc.length; i += 3) {
        const [ax, ay] = toScreen(this.arc[i].x, this.arc[i].y);
        ctx.globalAlpha = 0.2 + 0.45 * (i / this.arc.length);
        painter.rect(ax, ay, 1, 1, "#cfe9ff");
      }
      ctx.globalAlpha = 1;
      const end = this.arc[this.arc.length - 1];
      if (this.landIn !== null) {
        const [lx, ly] = toScreen(end.x, this.terrain.height(end.x));
        painter.rect(lx - 6, ly - 1, 3, 1, "#cfe9ff");
        painter.rect(lx + 3, ly - 1, 3, 1, "#cfe9ff");
        painter.rect(lx - 6, ly - 3, 1, 2, "#cfe9ff");
        painter.rect(lx + 5, ly - 3, 1, 2, "#cfe9ff");
      }
    }

    // Contact shadow: dark rows on the ground, shorter the higher the car flies.
    const length = Math.max(0, 4.2 * (1 - Math.max(0, car.altitude) / 7));
    if (length > 0.2) {
      const ground = this.terrain.height(x);
      const [x0, y0] = toScreen(x - length / 2, ground);
      painter.rect(x0, y0, length * PPM, 1, SHADOW);
      painter.rect(x0 + 3, y0 + 1, Math.max(0, length * PPM - 6), 1, SHADOW);
    }
    if (headlights && this.wrecked === 0) this.drawHeadlight(ctx, x, y, angle, toScreen);
    if (car.thrust > 0) for (const nozzle of CAR.nozzles) this.drawJet(ctx, x, y, angle, nozzle, car.thrust, toScreen);
    if (this.boostFlash > 0) this.drawJet(ctx, x, y, angle, { x: -2.3, y: -0.1 }, (this.boostFlash / BOOST_FLASH) * 1.6, toScreen, true);

    const [sx, sy] = toScreen(x, y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-angle);
    const body = this.occupied ? this.sprite.occupied : this.sprite.empty;
    if (this.wrecked > 0) ctx.filter = "brightness(0.6) saturate(0.5)";
    ctx.drawImage(body, -this.sprite.ox, -this.sprite.oy, body.width / ART, body.height / ART);
    ctx.restore();
    for (const wheel of car.wheels) {
      const [wx, wy] = toScreen(wheel.cx + x - car.x, wheel.cy + y - car.y);
      drawWheel(painter, wx, wy, -wheel.spin);
    }
    // The tail bar glows at night, brighter and wider under braking; white while reversing.
    if (this.wrecked > 0) return;
    const tail = { x: x - 2.32 * Math.cos(angle) - 0.05 * Math.sin(angle), y: y - 2.32 * Math.sin(angle) + 0.05 * Math.cos(angle) };
    const [tx, ty] = toScreen(tail.x, tail.y);
    this.glow(ctx, tx, ty, this.braking ? 11 : 6, this.braking ? "255, 40, 40" : "255, 60, 60", this.braking ? 0.85 : 0.5);
    if (this.reversing) this.glow(ctx, tx, ty + 2, 8, "235, 244, 255", 0.6);
    // The nose light bar.
    const [nx, ny] = toScreen(x + 2.34 * Math.cos(angle) + 0.06 * Math.sin(angle), y + 2.34 * Math.sin(angle) - 0.06 * Math.cos(angle));
    this.glow(ctx, nx, ny, 5, "235, 244, 255", 0.6);
  }

  private glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number): void {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  /*
   * A thruster jet: a short straight cone out of the nozzle, white-hot at the throat and going
   * blue as it expands, with a flicker in its length. `tail` points it backwards (the boost).
   */
  private drawJet(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    nozzle: { x: number; y: number },
    power: number,
    toScreen: ToScreen,
    tail = false,
  ): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ax = x + nozzle.x * cos - nozzle.y * sin;
    const ay = y + nozzle.x * sin + nozzle.y * cos;
    const dir = tail ? { x: -cos, y: -sin } : { x: sin, y: -cos };
    const length = JET * power * (0.85 + Math.random() * 0.3);
    const [sx, sy] = toScreen(ax, ay);
    const [ex, ey] = toScreen(ax + dir.x * length, ay + dir.y * length);
    // Perpendicular on screen, for the cone's width.
    const len = Math.hypot(ex - sx, ey - sy) || 1;
    const nx = -(ey - sy) / len;
    const ny = (ex - sx) / len;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createLinearGradient(sx, sy, ex, ey);
    // White-hot at the throat, going brand violet as it expands.
    g.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    g.addColorStop(0.35, "rgba(196, 160, 245, 0.75)");
    g.addColorStop(1, "rgba(145, 96, 220, 0)");
    ctx.fillStyle = g;
    for (const [w0, w1] of [[1.6, 5], [0.7, 2]] as const) {
      ctx.beginPath();
      ctx.moveTo(sx + nx * w0, sy + ny * w0);
      ctx.lineTo(ex + nx * w1, ey + ny * w1);
      ctx.lineTo(ex - nx * w1, ey - ny * w1);
      ctx.lineTo(sx - nx * w0, sy - ny * w0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    this.glow(ctx, sx, sy, 7 * Math.min(1, power), "180, 142, 236", 0.6);
  }

  /* A soft cone of cool-white light ahead of the car (smooth, screen-composited). */
  private drawHeadlight(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, toScreen: ToScreen): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const [lx, ly] = toScreen(x + 2.34 * cos + 0.06 * sin, y + 2.34 * sin - 0.06 * cos);
    const reach = HEADLIGHT * PPM;
    const dirX = cos;
    const dirY = -sin;
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, reach);
    g.addColorStop(0, "rgba(235, 244, 255, 0.5)");
    g.addColorStop(0.55, "rgba(220, 235, 255, 0.14)");
    g.addColorStop(1, "rgba(210, 230, 255, 0)");
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(lx, ly - 1);
    const spread = 0.22;
    ctx.lineTo(lx + (dirX - dirY * spread) * reach, ly + (dirY + dirX * spread) * reach);
    ctx.lineTo(lx + (dirX + dirY * spread) * reach, ly + (dirY - dirX * spread) * reach);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
