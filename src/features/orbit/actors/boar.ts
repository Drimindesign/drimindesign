import { ART } from "../engine/config";
import type { ToScreen } from "../engine/camera";
import { Ragdoll, type Joint } from "../engine/ragdoll";
import type { Terrain } from "../engine/terrain";
import { BOAR, type Sprite } from "../pixel/props";

export type BoarState = "wait" | "charge" | "circle" | "attack" | "block" | "stagger" | "knocked" | "getup" | "flee" | "down" | "blasted" | "gone";

/** The creatures on the roads: animals, raiders and brutes. */
export type BeastKind = "boar" | "wolf" | "dog" | "raider" | "brute" | "bull";

interface BeastSpec {
  /** Top charging speed (m/s) and how hard it accelerates into it (m/s²). */
  speed: number;
  accel: number;
  /** It notices you within this distance (m). */
  notice: number;
  /** Leaps at you from this close (m), with this take-off speed (m/s); 0 never leaps. */
  leapRange: number;
  leap: number;
  /** Blows it takes before it gives up. */
  health: number;
  /** Mass (kg), for knockback from the sword and the car. */
  mass: number;
  /** Sprite scale and colour (a canvas filter), over the shared boar sprite. */
  scale: number;
  filter: string;
}

const SPECS: Record<BeastKind, BeastSpec> = {
  boar: { speed: 6.2, accel: 10, notice: 20, leapRange: 0, leap: 0, health: 2, mass: 90, scale: 1, filter: "none" },
  // Wolves: lighter and faster, and they spring at you from a few metres out.
  wolf: { speed: 9, accel: 16, notice: 26, leapRange: 5, leap: 6.5, health: 1, mass: 45, scale: 0.85, filter: "grayscale(1) brightness(0.75) contrast(1.3)" },
  // Village dogs: chase the car barking, too light to hurt it; a fright sends them running.
  dog: { speed: 8.5, accel: 14, notice: 22, leapRange: 0, leap: 0, health: 1, mass: 25, scale: 0.62, filter: "sepia(1) saturate(1.4) brightness(0.8)" },
  // Fighters on foot (drawn as 3D models): they walk up, wind up and strike; they don't run off.
  raider: { speed: 2.8, accel: 10, notice: 16, leapRange: 0, leap: 0, health: 3, mass: 90, scale: 1, filter: "none" },
  brute: { speed: 2.1, accel: 7, notice: 16, leapRange: 0, leap: 0, health: 5, mass: 125, scale: 1, filter: "none" },
  // A bull: charges whatever moves; massive, it wrecks a slow truck and is only ever knocked over, never killed.
  bull: { speed: 7.5, accel: 9, notice: 24, leapRange: 0, leap: 0, health: 99, mass: 650, scale: 1, filter: "none" },
};
/**
 * A fighter's swing (s): wind up, the strike window (the only time it hurts), recover. It swings
 * from this close (m) and its blow reaches this far.
 */
const ATTACK = { windup: 0.42, strike: 0.16, recover: 0.6, range: 1.15, reach: 1.45 } as const;
/**
 * Defence. When the hero starts a swing in reach, a fighter facing them may raise its guard (the
 * knight often, the brute rarely) and hold it this long (s), or a raider may step back out of
 * reach. A guard broken by a kick leaves it reeling (s).
 */
const GUARD: Partial<Record<BeastKind, number>> = { raider: 0.45, brute: 0.12 };
const DODGE: Partial<Record<BeastKind, number>> = { raider: 0.2 };
const BLOCK_TIME = 0.9;
const GUARD_BROKEN = 1.1;
/** Waiting its turn, a fighter keeps this far from the hero (m), side-stepping to hold it. */
const HOLD_OFF = 3.4;
/** A fallen fighter lies this long before fading out (s). */
const DOWN_TIME = 6;
/** Knocked down but alive: it lies at least this long (s), at most KNOCK_MAX, then gets up over GETUP_TIME. */
const KNOCK_MIN = 0.7;
const KNOCK_MAX = 2.6;
export const GETUP_TIME = 1.5;
/** A fighter's standing height (m), for its ragdoll. */
const FIGHTER_HEIGHT: Partial<Record<BeastKind, number>> = { raider: 1.9, brute: 2.05 };

/** A blow leaves it dazed this long (s); a stomp longer. */
const STAGGER = 0.7;
const STOMP_STAGGER = 1.1;
/** Between leaps (s). */
const LEAP_COOLDOWN = 1.4;
/** Blasted by the thrusters: it flies off and fades over this long (s). */
const BLAST_TIME = 0.8;
/** Its back: the height a jump must clear, and where a stomp lands (m above the ground). */
export const BOAR_BACK = 0.7;

let sprites: [Sprite, Sprite] | null = null;

/*
 * A beast, as a body: it waits, notices you, and charges, accelerating to a run;
 * wolves leap at you when close. A sword blow knocks it back and dazes it; a jump onto
 * its back stuns it longer; after enough blows it runs away. A fast car sends it tumbling
 * (momentum: the beast is a small fraction of the car), and the thruster jet blasts it away.
 */
export class Boar {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  state: BoarState = "wait";
  health: number;
  private readonly spec: BeastSpec;
  private timer = 0;
  private leapIn = 0;
  /** Seconds left of the flinch after a blow on its guard. */
  private blockFlinch = 0;
  /** The body as a ragdoll while it's limp, and how long it's been down. */
  ragdoll: Ragdoll | null = null;
  private knockedFor = 0;
  /** Seconds into a fighter's swing, and which way it's facing (±1). */
  private attackTime = 0;
  facing = -1;
  /** White flash after a hit (s). */
  private flash = 0;
  /** Tumbling after a car hit or a blast: angle (rad) and spin (rad/s). */
  private angle = 0;
  private spin = 0;
  private readonly sprite: [Sprite, Sprite];

  constructor(
    readonly home: number,
    private readonly terrain: Terrain,
    readonly kind: BeastKind = "boar",
  ) {
    this.spec = SPECS[kind];
    this.health = this.spec.health;
    this.x = home;
    this.y = terrain.height(home);
    sprites ??= [BOAR(0), BOAR(1)];
    this.sprite = sprites;
  }

  get active(): boolean {
    return this.state !== "wait" && this.state !== "gone" && this.state !== "blasted" && this.state !== "down" && this.state !== "knocked" && this.state !== "getup";
  }

  /** Limp (a ragdoll): knocked down or fallen for good. */
  get limp(): boolean {
    return this.state === "knocked" || this.state === "down";
  }

  /*
   * Goes limp: a ragdoll seeded in a standing pose at the body's place, carrying its velocity,
   * with a blow at `joint`. Alive (`knocked`) it gets back up; otherwise it stays down.
   */
  private fall(alive: boolean, joint: Joint, ix: number, iy: number): void {
    const height = FIGHTER_HEIGHT[this.kind] ?? 1.8;
    const f = this.facing;
    const ground = this.terrain.height(this.x);
    const at = (dx: number, share: number): { x: number; y: number } => ({ x: this.x + dx * f, y: ground + share * height });
    this.ragdoll = new Ragdoll(
      {
        head: at(0.02, 0.93),
        chest: at(0, 0.72),
        pelvis: at(0, 0.5),
        elbowL: at(0.06, 0.56),
        handL: at(0.14, 0.44),
        elbowR: at(-0.05, 0.56),
        handR: at(-0.02, 0.42),
        kneeL: at(0.06, 0.27),
        footL: at(0.08, 0.03),
        kneeR: at(-0.03, 0.27),
        footR: at(-0.07, 0.03),
      },
      this.vx,
      Math.min(this.vy, 0.5),
    );
    // The blow drives the struck joint back; the feet slide the other way, so the body topples
    // over its heels instead of flying.
    this.ragdoll.impulse(joint, ix, iy);
    this.ragdoll.impulse("footL", -ix * 0.35, 0);
    this.ragdoll.impulse("footR", -ix * 0.35, 0);
    this.state = alive ? "knocked" : "down";
    this.timer = alive ? KNOCK_MAX : DOWN_TIME;
    this.knockedFor = 0;
  }

  /** A blow just landed on its guard (for the block-hit flinch). */
  get blocked(): boolean {
    return this.state === "block" && this.blockFlinch > 0;
  }

  /** The hero starts a swing within reach: it may raise its guard, or step back out of reach. */
  react(fromX: number): void {
    if (!this.fighter || (this.state !== "charge" && this.state !== "circle")) return;
    const toward = Math.sign(fromX - this.x) || 1;
    if (Math.random() < (GUARD[this.kind] ?? 0)) {
      this.state = "block";
      this.facing = toward;
      this.timer = BLOCK_TIME;
      this.vx = 0;
    } else if (Math.random() < (DODGE[this.kind] ?? 0)) {
      this.vx = -toward * 4.5;
      this.vy = 1.2;
      this.state = "circle";
      this.timer = 0.5;
    }
  }

  /** Is it covering a blow coming from `dir` (±1)? Only while guarding and facing it. */
  covers(dir: number): boolean {
    return this.state === "block" && this.facing === -dir;
  }

  /** A blow on the guard: no harm, a jolt back, the flinch. */
  absorb(dir: number): void {
    this.vx = dir * 1.5 * (90 / this.spec.mass);
    this.blockFlinch = 0.35;
    this.timer = Math.max(this.timer, 0.4);
  }

  /** A kick into the guard: it's knocked open and reels. */
  breakGuard(dir: number): void {
    this.vx = dir * 3.5 * (90 / this.spec.mass);
    this.vy = 1;
    this.flash = 0.15;
    this.timer = GUARD_BROKEN;
    this.state = "stagger";
  }

  /** Drawn as a 3D animal (the wolf, the dogs, the bull) rather than a 2D sprite. */
  get animal3D(): boolean {
    return this.kind === "wolf" || this.kind === "dog" || this.kind === "bull";
  }

  /** Can't be killed: knocked about, it always gets back up (cattle). */
  get unkillable(): boolean {
    return this.kind === "bull";
  }

  /** Fights on foot with a weapon (drawn in 3D) rather than charging like an animal. */
  get fighter(): boolean {
    return this.kind === "raider" || this.kind === "brute";
  }

  /** 0 … 1 through the current swing, or -1 when not attacking. */
  get swing(): number {
    return this.state === "attack" ? this.attackTime / (ATTACK.windup + ATTACK.strike + ATTACK.recover) : -1;
  }

  /** Charging or leaping at you: the states that hurt. */
  get dangerous(): boolean {
    if (this.fighter) return this.state === "attack" && this.attackTime >= ATTACK.windup && this.attackTime < ATTACK.windup + ATTACK.strike;
    return this.state === "charge";
  }

  /** How far a fighter's blow reaches (m). */
  get reach(): number {
    return ATTACK.reach;
  }

  get mass(): number {
    return this.spec.mass;
  }

  /** Sends it back to its spot (after you respawn at a checkpoint). */
  reset(): void {
    this.ragdoll = null;
    this.x = this.home;
    this.y = this.terrain.height(this.home);
    this.vx = 0;
    this.vy = 0;
    this.health = this.spec.health;
    this.state = "wait";
    this.angle = 0;
    this.spin = 0;
    this.timer = 0;
  }

  /** Returns true when it starts a charge this step (for the grunt). */
  /** `engage`: a fighter's turn to close in; otherwise it holds off and circles. */
  update(dt: number, gravity: number, targetX: number, engage = true): boolean {
    let started = false;
    const spec = this.spec;
    this.timer = Math.max(0, this.timer - dt);
    this.blockFlinch = Math.max(0, this.blockFlinch - dt);
    this.leapIn = Math.max(0, this.leapIn - dt);
    this.flash = Math.max(0, this.flash - dt);
    switch (this.state) {
      case "wait":
        if (Math.abs(this.x - targetX) < spec.notice) {
          this.state = "charge";
          started = true;
        }
        break;
      case "circle": {
        // Waiting its turn: hold off at a distance, side-stepping, facing the hero.
        const side = Math.sign(this.x - targetX) || 1;
        this.facing = -side;
        if (this.grounded && this.timer === 0) this.vx = approach(this.vx, (targetX + side * HOLD_OFF - this.x) * 1.5, spec.accel * 0.5 * dt);
        if (engage && this.timer === 0) this.state = "charge";
        break;
      }
      case "block":
        if (this.grounded) this.vx = approach(this.vx, 0, 10 * dt);
        if (this.timer === 0) this.state = "charge";
        break;
      case "charge": {
        const dir = Math.sign(targetX - this.x) || -1;
        if (this.fighter && !engage) {
          this.state = "circle";
          break;
        }
        // A fighter closes to sword range, plants its feet and swings.
        if (this.fighter && Math.abs(targetX - this.x) < ATTACK.range && this.grounded) {
          this.state = "attack";
          this.attackTime = 0;
          this.facing = dir;
          break;
        }
        if (this.grounded) {
          this.vx = approach(this.vx, dir * spec.speed, spec.accel * dt);
          if (spec.leap > 0 && this.leapIn === 0 && Math.abs(targetX - this.x) < spec.leapRange) {
            this.vy = spec.leap;
            this.vx = dir * spec.speed * 1.2;
            this.leapIn = LEAP_COOLDOWN;
          }
        }
        // Left far behind: an animal gives up; a fighter goes back to its post.
        if (Math.abs(this.x - targetX) > 40) {
          if (this.fighter) this.reset();
          else this.state = "gone";
        }
        break;
      }
      case "attack":
        if (this.grounded) this.vx = approach(this.vx, 0, 16 * dt);
        this.attackTime += dt;
        if (this.attackTime > ATTACK.windup + ATTACK.strike + ATTACK.recover) this.state = "charge";
        break;
      case "knocked":
      case "down": {
        // Limp: the ragdoll falls and settles; the body's place follows its hips.
        if (this.ragdoll) {
          this.ragdoll.step(dt, gravity, this.terrain);
          this.x = this.ragdoll.points.pelvis.x;
          this.y = this.terrain.height(this.x);
          this.vx = 0;
          this.vy = 0;
        }
        this.knockedFor += dt;
        if (this.state === "down") {
          if (this.timer === 0) this.state = "gone";
        } else if ((this.ragdoll?.resting && this.knockedFor > KNOCK_MIN) || this.timer === 0) {
          // Back up: it faces the way its head lies (the get-up rolls it over its feet).
          const r = this.ragdoll;
          if (r) this.facing = r.points.head.x > r.points.pelvis.x ? -1 : 1;
          this.state = "getup";
          this.timer = GETUP_TIME;
        }
        return started;
      }
      case "getup":
        if (this.timer === 0) {
          this.ragdoll = null;
          this.state = "charge";
        }
        return started;
      case "stagger":
        if (this.grounded) this.vx = approach(this.vx, 0, 14 * dt);
        if (this.timer === 0) this.state = this.health > 0 || this.unkillable ? "charge" : this.kind === "wolf" ? "down" : "flee";
        // A wolf that's taken its last blow drops and lies still before fading.
        if (this.state === "down") this.timer = DOWN_TIME;
        break;
      case "flee": {
        const away = Math.sign(this.x - targetX) || 1;
        if (this.grounded) this.vx = approach(this.vx, away * spec.speed * 1.3, spec.accel * dt);
        if (Math.abs(this.x - targetX) > 40) this.state = "gone";
        break;
      }
      case "blasted":
        // Thrown clear by the jet: no ground, just flight, and it fades out.
        this.vy -= gravity * 0.4 * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.angle += this.spin * dt;
        if (this.timer === 0) this.state = "gone";
        return false;
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

  /** Frightened off (a dog by the thrusters or the car): it runs away and doesn't come back. */
  scare(dir: number): void {
    this.vx = dir * this.spec.speed * 1.3;
    this.vy = 1.5;
    this.state = "flee";
  }

  get grounded(): boolean {
    return this.y <= this.terrain.height(this.x) + 0.02;
  }

  /** A sword blow from direction `dir` (±1). Returns true if this blow drove it off. */
  /**
   * A blow from direction `dir` (±1) with knockback `power` (m/s for a 90 kg body), landing at
   * `joint`. A fighter staggers back; a `heavy` blow knocks it down (it gets up); its last blow
   * drops it for good. The blow's momentum goes into the joint it hit, scaled by the body's mass.
   */
  hit(dir: number, power: number, joint: Joint = "chest", heavy = false): boolean {
    if (!this.unkillable) this.health--;
    const share = 90 / this.spec.mass;
    this.vx = dir * power * share;
    // A stumble back, not a hop.
    this.vy = 0.6 * share;
    this.flash = 0.15;
    this.timer = STAGGER;
    this.state = "stagger";
    if (this.fighter) {
      this.facing = -dir;
      if (this.health <= 0) this.fall(false, joint, dir * power * 2.2 * share, 0.8 * share);
      else if (heavy) this.fall(true, joint, dir * power * 2 * share, 0.6 * share);
    }
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

  /** Caught under the thruster jet: flung up and away, spinning, and gone. */
  blast(dir: number): void {
    if (this.unkillable) {
      // The jet only rocks a bull back on its heels.
      this.vx = dir * 3;
      this.vy = 2;
      this.flash = 0.2;
      this.timer = STAGGER * 2;
      this.state = "stagger";
      return;
    }
    if (this.fighter) {
      // Thrown by the jet: up and away as a ragdoll, and down for good.
      this.health = 0;
      this.vx = dir * 4;
      this.vy = 6;
      this.fall(false, "pelvis", dir * 6, 9);
      this.flash = 0.3;
      return;
    }
    this.health = 0;
    this.vx = dir * 5;
    this.vy = 10;
    this.spin = dir * 16;
    this.flash = 0.3;
    this.timer = BLAST_TIME;
    this.state = "blasted";
  }

  /**
   * Struck by the car at relative speed `vx` (m/s). Elastic-ish collision between the car and
   * the beast: the beast takes most of the speed and flies; returns the car's change in speed.
   */
  hitByCar(carVx: number, carMass: number): number {
    const total = carMass + this.spec.mass;
    this.vx = ((2 * carMass) / total) * carVx * 0.7;
    this.vy = 3.5 + Math.abs(carVx) * 0.15;
    this.spin = -Math.sign(carVx) * 9 * (90 / this.spec.mass);
    this.flash = 0.15;
    if (this.fighter) {
      // Run down: the bumper takes the legs, the body folds over and is thrown with the car's momentum.
      this.health = 0;
      this.facing = -Math.sign(carVx) || 1;
      this.fall(false, "kneeL", this.vx * 1.2, 1.5);
      this.ragdoll?.impulse("kneeR", this.vx * 1.2, 1.5);
      this.ragdoll?.impulse("pelvis", this.vx * 0.8, this.vy);
      return -((2 * this.spec.mass) / total) * carVx * 0.7;
    }
    if (this.unkillable) {
      // Knocked over, not killed: it gets back up.
      this.timer = 2.5;
      this.state = "stagger";
      return -((2 * this.spec.mass) / total) * carVx * 0.7;
    }
    this.health = 0;
    this.state = "flee";
    return -((2 * this.spec.mass) / total) * carVx * 0.7;
  }

  /** It rammed a slow car and bounced off, dazed. */
  rebound(dir: number): void {
    this.vx = dir * 3;
    this.vy = 2;
    this.timer = STAGGER;
    this.state = "stagger";
  }

  /** What a 3D renderer needs to draw it: shown, tumble angle, facing, opacity and hit flash. */
  pose(): { visible: boolean; angle: number; facing: number; alpha: number; flash: boolean } {
    if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx);
    return {
      visible: this.state !== "gone",
      angle: this.angle,
      facing: Math.abs(this.vx) > 0.2 ? Math.sign(this.vx) : this.facing,
      alpha: this.state === "blasted" ? Math.min(1, this.timer / BLAST_TIME + 0.1) : this.state === "down" ? Math.min(1, this.timer) : 1,
      flash: this.flash > 0,
    };
  }

  draw(ctx: CanvasRenderingContext2D, toScreen: ToScreen, time: number): void {
    if (this.state === "wait" || this.state === "gone") return;
    const [x, y] = toScreen(this.x, this.y);
    const frame = this.sprite[this.grounded && Math.abs(this.vx) > 0.5 ? Math.floor(time * 10) % 2 : 0];
    // The sprite faces left; flip it when running right.
    const facing = this.vx > 0.2 ? 1 : -1;
    const s = this.spec.scale;
    ctx.save();
    ctx.translate(x, y - (this.angle !== 0 ? 0.5 * 16 : 0));
    ctx.rotate(this.angle);
    ctx.scale(-facing * s, s);
    if (this.state === "blasted") ctx.globalAlpha = Math.min(1, this.timer / BLAST_TIME + 0.1);
    ctx.filter = this.flash > 0 ? "brightness(3)" : this.spec.filter;
    const w = frame.canvas.width / ART;
    const h = frame.canvas.height / ART;
    ctx.drawImage(frame.canvas, -frame.ax, -frame.ay + (this.angle !== 0 ? h / 2 : 1), w, h);
    ctx.restore();
  }
}

function approach(value: number, target: number, delta: number): number {
  return value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);
}
