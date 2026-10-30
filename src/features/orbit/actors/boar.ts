import { ART } from "../engine/config";
import type { ToScreen } from "../engine/camera";
import type { Terrain } from "../engine/terrain";
import { BOAR, type Sprite } from "../pixel/props";

export type BoarState = "wait" | "charge" | "stagger" | "flee" | "gone";

/** Top charging speed (m/s) and how hard it accelerates into it (m/s²). */
const CHARGE_SPEED = 6.2;
const CHARGE_ACCEL = 10;
/** It notices you within this distance (m). */
const NOTICE = 20;
/** A hit leaves it dazed this long (s); a stomp longer. */
const STAGGER = 0.7;
const STOMP_STAGGER = 1.1;
/** Its back: the height a jump must clear, and where a stomp lands (m above the ground). */
export const BOAR_BACK = 0.7;
/** Mass (kg), for knockback from staff and car. */
const MASS = 90;

let sprites: [Sprite, Sprite] | null = null;

/*
 * A wild boar, as a body: it waits in the trees, notices you, and charges, accelerating to a
 * run. A staff hit knocks it back and dazes it; a jump onto its back stuns it longer; after
 * two blows it has had enough and runs away. A car that hits it sends it tumbling, the car
 * losing a little speed to the collision (momentum: the boar is ~1/14 of the car).
 */
export class Boar {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  state: BoarState = "wait";
  health = 2;
  private timer = 0;
  /** White flash after a hit (s). */
  private flash = 0;
  /** Tumbling after a car hit: angle (rad) and spin (rad/s). */
  private angle = 0;
  private spin = 0;
  private readonly sprite: [Sprite, Sprite];

  constructor(
    readonly home: number,
    private readonly terrain: Terrain,
    /** Starts already charging (on the road) instead of waiting in the trees. */
    private readonly eager = false,
  ) {
    this.x = home;
    this.y = terrain.height(home);
    sprites ??= [BOAR(0), BOAR(1)];
    this.sprite = sprites;
  }

  get active(): boolean {
    return this.state !== "wait" && this.state !== "gone";
  }

  /** Charging toward you: the only state that hurts. */
  get dangerous(): boolean {
    return this.state === "charge";
  }

  /** Sends it back to its spot in the trees (after you respawn at a checkpoint). */
  reset(): void {
    this.x = this.home;
    this.y = this.terrain.height(this.home);
    this.vx = 0;
    this.vy = 0;
    this.health = 2;
    this.state = "wait";
    this.angle = 0;
    this.spin = 0;
  }

  /** Returns true when it starts a charge this step (for the grunt). */
  update(dt: number, gravity: number, targetX: number): boolean {
    let started = false;
    this.timer = Math.max(0, this.timer - dt);
    this.flash = Math.max(0, this.flash - dt);
    switch (this.state) {
      case "wait":
        if (this.eager || (this.x > targetX && this.x - targetX < NOTICE)) {
          this.state = "charge";
          started = true;
        }
        break;
      case "charge": {
        const dir = Math.sign(targetX - this.x) || -1;
        if (this.grounded) this.vx = approach(this.vx, dir * CHARGE_SPEED, CHARGE_ACCEL * dt);
        if (this.x < targetX - 30) this.state = "gone";
        break;
      }
      case "stagger":
        if (this.grounded) this.vx = approach(this.vx, 0, 14 * dt);
        if (this.timer === 0) this.state = this.health > 0 ? "charge" : "flee";
        break;
      case "flee": {
        const away = Math.sign(this.x - targetX) || 1;
        if (this.grounded) this.vx = approach(this.vx, away * CHARGE_SPEED * 1.3, CHARGE_ACCEL * dt);
        if (Math.abs(this.x - targetX) > 40) this.state = "gone";
        break;
      }
      case "gone":
        return false;
    }
    this.vy -= gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.spin * dt;
    const ground = this.terrain.height(this.x);
    if (this.y <= ground) {
      this.y = ground;
      if (this.vy < -2 && this.spin !== 0) this.vy = -this.vy * 0.3;
      else this.vy = 0;
      this.spin *= 0.6;
      if (Math.abs(this.spin) < 1) {
        this.spin = 0;
        this.angle = 0;
      }
    }
    return started;
  }

  get grounded(): boolean {
    return this.y <= this.terrain.height(this.x) + 0.02;
  }

  /** A staff blow from direction `dir` (±1). Returns true if this blow drove it off. */
  hit(dir: number, power: number): boolean {
    this.health--;
    this.vx = dir * power;
    this.vy = 2.6;
    this.flash = 0.15;
    this.timer = STAGGER;
    this.state = "stagger";
    return this.health <= 0;
  }

  /** Landed on from above. Returns true if this drove it off. */
  stomp(): boolean {
    this.health--;
    this.vx *= 0.2;
    this.flash = 0.15;
    this.timer = STOMP_STAGGER;
    this.state = "stagger";
    return this.health <= 0;
  }

  /**
   * Struck by the car at relative speed `vx` (m/s). Elastic-ish collision between ~1250 kg and
   * 90 kg: the boar takes most of the speed and flies; returns the car's change in speed.
   */
  hitByCar(carVx: number, carMass: number): number {
    const total = carMass + MASS;
    const boarV = ((2 * carMass) / total) * carVx * 0.7;
    this.vx = boarV;
    this.vy = 3.5 + Math.abs(carVx) * 0.15;
    this.spin = -Math.sign(carVx) * 9;
    this.flash = 0.15;
    this.health = 0;
    this.state = "flee";
    return -((2 * MASS) / total) * carVx * 0.7;
  }

  draw(ctx: CanvasRenderingContext2D, toScreen: ToScreen, time: number): void {
    if (this.state === "wait" || this.state === "gone") return;
    const [x, y] = toScreen(this.x, this.y);
    const frame = this.sprite[this.grounded && Math.abs(this.vx) > 0.5 ? Math.floor(time * 10) % 2 : 0];
    // The sprite faces left; flip it when running right.
    const facing = this.vx > 0.2 ? 1 : -1;
    ctx.save();
    ctx.translate(x, y - (this.angle !== 0 ? 0.5 * 16 : 0));
    ctx.rotate(this.angle);
    ctx.scale(-facing, 1);
    if (this.flash > 0) ctx.filter = "brightness(3)";
    const w = frame.canvas.width / ART;
    const h = frame.canvas.height / ART;
    ctx.drawImage(frame.canvas, -frame.ax, -frame.ay + (this.angle !== 0 ? h / 2 : 1), w, h);
    ctx.restore();
  }
}

function approach(value: number, target: number, delta: number): number {
  return value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);
}
