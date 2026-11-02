import { CHARACTER, WORLD_LEFT } from "./config";
import type { Terrain } from "./terrain";

export interface MoveInput {
  /** -1 … 1 horizontal intent. */
  move: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
}

export type CharacterEvent = "jump" | "land" | "bump" | "climb";

/** Something to stand on that isn't the ground: a truck's roof, a crate, a stall (its span, top, and speed). */
export interface Platform {
  x0: number;
  x1: number;
  top: number;
  vx: number;
}

/** The highest step the feet take in stride (m); anything taller is a wall to jump. */
const MAX_STEP = 0.35;
/** Ground steeper than this (rise over run, ~60°) is a wall face, not a slope to walk up. */
const MAX_GRADE = 1.8;
/** Uphill slows the stride, downhill quickens it: speed scales by 1 / (1 + slope × this). */
const UPHILL = 0.9;
const DOWNHILL = 0.25;
/**
 * Climbing a ledge: a wall up to `vault` (m) high is vaulted straight from the ground; one up to
 * `reach` (m, the hands' reach above the feet in a jump) is grabbed in the air. A vault takes
 * `quick` (s), a full haul `haul` (s): most of it rising (`rise` share), the rest stepping `onto` (m) over the top.
 */
const CLIMB = { vault: 1.3, reach: 2.1, quick: 0.8, haul: 1.35, rise: 0.65, onto: 0.45 } as const;

/*
 * The explorer's body as the physics sees it: a point at the feet with a velocity, separate
 * from the drawn rig. Ground movement accelerates quickly to walking pace and then builds into
 * a run; jumps use coyote time, input buffering and variable height (release early to cut the
 * rise). Gravity comes from the planet, so the same push goes much higher on Pluto.
 */
export class CharacterController {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  grounded = true;
  /** Downward speed at the last touchdown (m/s), read by the animator for the landing. */
  landSpeed = 0;
  px: number;
  py: number;
  private coyote = 0;
  private buffer = 0;
  /** Jumps left in the air (one: the kung fu double jump). */
  private airJumps = 1;
  /** What else there is to stand on (the stage provides it). */
  platforms: (() => readonly Platform[]) | null = null;
  /** The platform under the feet, if standing on one. */
  private standing: Platform | null = null;
  private readonly events: CharacterEvent[] = [];
  /** Hauling up over a ledge: 0 … 1 through the climb, or -1. */
  climb = -1;
  /** How long this climb takes (s). */
  climbTime: number = CLIMB.haul;
  private climbFrom = { x: 0, y: 0 };
  private climbTo = { x: 0, y: 0 };

  constructor(x: number, private readonly terrain: Terrain) {
    this.x = x;
    this.y = terrain.height(x);
    this.px = this.x;
    this.py = this.y;
  }

  /** Events since the last call (jump, land), for sound and effects. */
  drainEvents(): CharacterEvent[] {
    return this.events.splice(0);
  }

  /** A shove (m/s): knockback from a hit, or a bounce off something stomped. */
  impulse(vx: number, vy: number): void {
    this.vx = vx;
    if (vy > 0) {
      this.vy = vy;
      this.grounded = false;
    }
  }

  place(x: number, y: number): void {
    this.climb = -1;
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.vx = 0;
    this.vy = 0;
  }

  step(dt: number, gravity: number, input: MoveInput): void {
    this.px = this.x;
    this.py = this.y;
    const c = CHARACTER;
    if (this.climb >= 0) {
      this.stepClimb(dt);
      return;
    }

    if (input.move !== 0) this.facing = input.move > 0 ? 1 : -1;
    // Climbing a slope costs speed; running down one adds a little.
    const climb = this.terrain.slope(this.x) * Math.sign(input.move);
    const grade = climb > 0 ? 1 / (1 + climb * UPHILL) : 1 + Math.min(0.3, -climb * DOWNHILL);
    const target = input.move * c.runSpeed * (this.grounded ? grade : 1);
    if (this.grounded) {
      if (input.move === 0 || Math.sign(target) !== Math.sign(this.vx)) {
        this.vx = approach(this.vx, input.move === 0 ? 0 : target, c.decel * dt);
      } else {
        const accel = Math.abs(this.vx) < c.walkSpeed ? c.accelWalk : c.accelRun;
        this.vx = approach(this.vx, target, accel * dt);
      }
    } else {
      this.vx = approach(this.vx, target === 0 ? this.vx : target, c.airAccel * dt);
    }

    this.buffer = input.jumpPressed ? c.jumpBuffer : Math.max(0, this.buffer - dt);
    this.coyote = this.grounded ? c.coyoteTime : Math.max(0, this.coyote - dt);
    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = c.jumpSpeed;
      this.grounded = false;
      this.buffer = 0;
      this.coyote = 0;
      this.events.push("jump");
    } else if (input.jumpPressed && !this.grounded && this.airJumps > 0) {
      // Kung fu: a second push off nothing, mid-air.
      this.airJumps--;
      this.vy = Math.max(this.vy, c.airJumpSpeed);
      this.buffer = 0;
      this.events.push("jump");
    }
    // Riding a platform that moves (a truck rolling on).
    if (this.grounded && this.standing) this.x += this.standing.vx * dt;

    const rising = this.vy > 0 && !this.grounded;
    const g = gravity * (rising && !input.jumpHeld ? c.releaseGravity : 1);
    if (!this.grounded) this.vy = Math.max(-c.terminalSpeed, this.vy - g * dt);

    // Walls: a step taller than MAX_STEP stops the feet (on the ground or in the air) until a
    // jump carries them above it.
    const nextX = Math.max(WORLD_LEFT + 0.3, this.x + this.vx * dt);
    // Platforms are one-way (landed on from above, walked through below): walls come from the terrain only.
    const rise = this.terrain.height(nextX) - this.y;
    const dir = Math.sign(nextX - this.x);
    const face = this.terrain.slope(nextX) * dir > MAX_GRADE && rise > 0.02;
    const blocked = this.grounded ? rise > MAX_STEP || face : rise > 0.05 && (face || this.terrain.height(nextX) - this.terrain.height(this.x) > MAX_STEP);
    if (blocked) {
      // Pushing into a wall the hands can reach over: grab the top and haul up onto it.
      const onto = this.x + dir * CLIMB.onto;
      const top = this.terrain.height(onto);
      const above = top - this.y;
      if (dir !== 0 && Math.sign(input.move) === dir && above > MAX_STEP && above <= (this.grounded ? CLIMB.vault : CLIMB.reach) && this.terrain.slope(onto) * dir < MAX_GRADE) {
        this.climb = 0;
        this.climbTime = above <= CLIMB.vault ? CLIMB.quick : CLIMB.haul;
        this.climbFrom = { x: this.x, y: this.y };
        this.climbTo = { x: onto, y: top };
        this.vx = 0;
        this.vy = 0;
        this.grounded = false;
        this.events.push("climb");
        return;
      }
      this.vx = 0;
      if (!this.grounded) this.events.push("bump");
    } else {
      this.x = nextX;
    }
    this.y += this.vy * dt;
    if (this.x <= WORLD_LEFT + 0.3) this.vx = Math.max(0, this.vx);

    // The ground under the feet: the terrain, or the top of anything they're above.
    const ground = this.heightAt(this.x, this.y + (this.grounded ? c.groundSnap : 0.05));
    if (this.grounded) {
      if (this.y - ground < c.groundSnap) {
        this.y = ground;
        this.vy = 0;
      } else {
        this.grounded = false;
      }
    } else if (this.y <= ground && this.vy <= 0) {
      this.landSpeed = -this.vy;
      this.y = ground;
      this.vy = 0;
      this.grounded = true;
      this.events.push("land");
    }
    if (this.grounded) this.airJumps = 1;
  }

  /** A fresh kung fu jump in the air (after letting go of a rope). */
  refreshAirJump(): void {
    this.airJumps = 1;
  }

  /* The haul over a ledge: up the face (eased), then a step forward onto the top. */
  private stepClimb(dt: number): void {
    this.climb = Math.min(1, this.climb + dt / this.climbTime);
    const k = this.climb;
    const up = Math.min(1, k / CLIMB.rise);
    const across = Math.max(0, (k - CLIMB.rise) / (1 - CLIMB.rise));
    const ease = (t: number): number => t * t * (3 - 2 * t);
    this.x = this.climbFrom.x + (this.climbTo.x - this.climbFrom.x) * ease(across);
    this.y = this.climbFrom.y + (this.climbTo.y - this.climbFrom.y) * ease(up);
    if (k >= 1) {
      this.climb = -1;
      this.y = this.climbTo.y;
      this.grounded = true;
      this.airJumps = 1;
      this.landSpeed = 0;
      this.events.push("land");
    }
  }

  /* The highest surface at x that's at or below `below` (the terrain, or a platform's top); notes the platform stood on. */
  private heightAt(x: number, below: number): number {
    let h = this.terrain.height(x);
    let on: Platform | null = null;
    for (const p of this.platforms?.() ?? []) {
      if (x < p.x0 || x > p.x1 || p.top > below || p.top <= h) continue;
      h = p.top;
      on = p;
    }
    this.standing = on;
    return h;
  }
}

function approach(value: number, target: number, delta: number): number {
  return value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);
}
