import { CHARACTER } from "./config";
import type { CharacterController } from "./character-controller";
import { damp, lerp, smoothstep } from "./noise";
import type { Terrain } from "./terrain";

export interface Vec {
  x: number;
  y: number;
}

/** A two-bone chain: hip–knee–ankle or shoulder–elbow–wrist, plus the end piece's angle. */
export interface Limb {
  root: Vec;
  mid: Vec;
  end: Vec;
  endAngle: number;
}

/** The posed skeleton in character space: origin at the feet, +x forward, +y up, metres. */
export interface RigPose {
  pelvis: Vec;
  chest: Vec;
  neck: Vec;
  head: Vec;
  torsoAngle: number;
  headAngle: number;
  /** [back, front] */
  legs: [Limb, Limb];
  arms: [Limb, Limb];
  /** Secondary hair chain, character space. */
  hair: Vec[];
  /** Jacket hem swing (rad). */
  flap: number;
  /** 0 … 1 breathing cycle amount. */
  breath: number;
}

export interface Proportions {
  height: number;
  ankle: number;
  thigh: number;
  shin: number;
  foot: number;
  torso: number;
  neck: number;
  headRadius: number;
  upperArm: number;
  forearm: number;
  hand: number;
}

export function proportions(height: number): Proportions {
  return {
    height,
    ankle: 0.045 * height,
    thigh: 0.245 * height,
    shin: 0.235 * height,
    foot: 0.15 * height,
    torso: 0.29 * height,
    neck: 0.045 * height,
    headRadius: 0.064 * height,
    upperArm: 0.175 * height,
    forearm: 0.155 * height,
    hand: 0.085 * height,
  };
}

/** Knee or elbow from a two-bone chain; `bend` +1 puts the joint forward (+x), -1 behind. */
function solve(root: Vec, end: Vec, a: number, b: number, bend: number): { mid: Vec; end: Vec } {
  let dx = end.x - root.x;
  let dy = end.y - root.y;
  let d = Math.hypot(dx, dy);
  const reach = (a + b) * 0.9995;
  if (d > reach) {
    dx *= reach / d;
    dy *= reach / d;
    d = reach;
  }
  d = Math.max(d, Math.abs(a - b) + 1e-4);
  const angle = Math.atan2(dy, dx);
  const inner = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  const k = angle + bend * inner;
  return {
    mid: { x: root.x + Math.cos(k) * a, y: root.y + Math.sin(k) * a },
    end: { x: root.x + dx, y: root.y + dy },
  };
}

/* Heel strike to toe-off across a stance (s: 0 … 1), relative to the ground. */
function stanceFootAngle(s: number): number {
  if (s < 0.15) return lerp(0.28, 0, s / 0.15);
  if (s > 0.68) return lerp(0, -0.5, (s - 0.68) / 0.32);
  return 0;
}

/*
 * Procedural animation driven by the body's physics, never by fixed loops alone. The gait
 * phase advances with distance travelled, so a planted foot stays exactly where it landed (no
 * foot slide at any speed); feet follow the ground's height and slope, and the legs reach them
 * by inverse kinematics. Walk and run blend by speed (the run has flight phases), the torso
 * leans with speed and acceleration, the arms counter-swing, jumps pose from vertical velocity,
 * and landings compress through a critically damped spring. Every blend weight is damped, so
 * state changes never pop.
 */
export class Animator {
  readonly body: Proportions;
  readonly pose: RigPose;
  private phase = 0;
  private runWeight = 0;
  private idleWeight = 1;
  private airWeight = 0;
  private land = 0;
  private landRate = 0;
  private lean = 0;
  private accel = 0;
  private lastVx = 0;
  private time = 0;
  private flapRate = 0;
  private wasGrounded = true;
  private readonly strands: { x: number; y: number; px: number; py: number }[];

  constructor(height: number, private readonly hairLinks: number) {
    this.body = proportions(height);
    const zero = (): Vec => ({ x: 0, y: 0 });
    const limb = (): Limb => ({ root: zero(), mid: zero(), end: zero(), endAngle: 0 });
    this.pose = {
      pelvis: zero(),
      chest: zero(),
      neck: zero(),
      head: zero(),
      torsoAngle: 0,
      headAngle: 0,
      legs: [limb(), limb()],
      arms: [limb(), limb()],
      hair: Array.from({ length: hairLinks }, zero),
      flap: 0,
      breath: 0,
    };
    this.strands = Array.from({ length: hairLinks }, () => ({ x: 0, y: 0, px: 0, py: 0 }));
  }

  /** Gait phase (0 … 1); a foot lands as it crosses 0 and 0.5. */
  get gaitPhase(): number {
    return this.phase;
  }

  /** Puts the hair at rest around a new position, so a spawn never whips it across the screen. */
  settle(x: number, y: number, facing: number): void {
    const b = this.body;
    this.strands.forEach((p, i) => {
      p.x = p.px = x - facing * (b.headRadius + i * 0.05 * b.height);
      p.y = p.py = y + b.height * 0.9 - i * 0.05 * b.height;
    });
  }

  /**
   * Drives the leg spring from outside: a jump's take-off kicks it, so the knees tuck under
   * just after the feet leave the ground (the legs pushing, then folding for the flight).
   */
  kick(amount: number): void {
    this.landRate -= amount;
  }

  /** `crouch` (0 … 1) bends the body for getting into the car. */
  update(dt: number, character: CharacterController, terrain: Terrain, gravity: number, crouch = 0): RigPose {
    const b = this.body;
    const H = b.height;
    const pose = this.pose;
    const facing = character.facing;
    const speed = character.grounded ? Math.abs(character.vx) : 0;
    this.time += dt;

    // Weights.
    this.runWeight = damp(this.runWeight, smoothstep(CHARACTER.walkSpeed * 1.05, CHARACTER.runSpeed * 0.85, speed), 8, dt);
    const moving = speed > 0.08;
    this.idleWeight = damp(this.idleWeight, character.grounded && !moving ? 1 : 0, moving ? 10 : 5, dt);
    this.airWeight = damp(this.airWeight, character.grounded ? 0 : 1, character.grounded ? 16 : 9, dt);
    if (character.grounded && !this.wasGrounded) this.landRate -= Math.min(character.landSpeed, 9) * 0.55;
    this.wasGrounded = character.grounded;
    // Landing: a critically damped spring absorbs the impact (k = 170 s⁻²).
    this.landRate += (-170 * this.land - 2 * Math.sqrt(170) * this.landRate) * dt;
    this.land = Math.max(-0.6, Math.min(0.15, this.land + this.landRate * dt));
    const accelNow = (character.vx - this.lastVx) / Math.max(dt, 1e-4);
    this.lastVx = character.vx;
    this.accel = damp(this.accel, accelNow * facing, 6, dt);

    const run = this.runWeight;
    const scale = H / 1.75;
    const cycle = lerp(1.5, 2.85, run) * scale;
    const duty = lerp(0.6, 0.36, run);
    if (character.grounded) this.phase = (this.phase + (speed * dt) / cycle) % 1;
    const stance = duty * cycle;
    const groundAt = (localX: number): number => terrain.height(character.x + facing * localX) - character.y;
    const slopeAt = (localX: number): number => Math.atan(terrain.slope(character.x + facing * localX) * facing);

    // Feet: locomotion, idle stance and air, blended.
    const ankles: Vec[] = [];
    const footAngles: number[] = [];
    const tuck = Math.max(0, Math.min(1, character.vy / CHARACTER.jumpSpeed));
    const drop = Math.max(0, Math.min(1, -character.vy / CHARACTER.jumpSpeed));
    for (let i = 0; i < 2; i++) {
      const p = (this.phase + i * 0.5) % 1;
      let fx: number;
      let lift = 0;
      let angle: number;
      if (p < duty) {
        const s = p / duty;
        fx = (0.5 - s) * stance;
        angle = stanceFootAngle(s);
      } else {
        const s = (p - duty) / (1 - duty);
        const e = s * s * (3 - 2 * s);
        fx = lerp(-stance / 2, stance / 2, e);
        lift = Math.sin(Math.PI * s) * lerp(0.075, 0.22, run) * scale;
        angle = lerp(-0.55, 0.25, s);
      }
      const idleX = (i === 1 ? 0.06 : -0.075) * H;
      const x = lerp(fx, idleX, this.idleWeight);
      const groundY = groundAt(x);
      const groundAngle = lerp(angle, 0, this.idleWeight) + slopeAt(x);
      const airX = i === 1 ? lerp(0.1, 0.13, drop) * H : lerp(-0.1, -0.04, drop) * H;
      const airY = b.ankle + (i === 1 ? 0.17 : 0.11) * H * tuck + 0.02 * H;
      ankles.push({
        x: lerp(x, airX, this.airWeight),
        y: lerp(groundY + b.ankle + lift * (1 - this.idleWeight), airY, this.airWeight),
      });
      footAngles.push(lerp(groundAngle, i === 1 ? 0.25 : -0.45, this.airWeight));
    }

    // Pelvis: a walk peaks at mid-stance, a run dips there; crouches and landings lower it.
    const legLength = b.thigh + b.shin;
    const bob = lerp(0.018, 0.03, run) * H * Math.cos(4 * Math.PI * (this.phase - duty / 2)) * (1 - 2 * run);
    const compress = Math.max(0, -this.land) * 0.38 * H + crouch * 0.2 * H;
    const breath = 0.5 + 0.5 * Math.sin(this.time * 2 * Math.PI * 0.32);
    let pelvisY = b.ankle + legLength * 0.975 - run * 0.035 * H + bob * (1 - this.idleWeight) * (1 - this.airWeight) - compress;
    pelvisY -= this.airWeight * 0.04 * H * tuck;
    const pelvisX = 0.01 * H * run;
    if (this.airWeight < 0.98) {
      for (const ankle of ankles) {
        const dx = ankle.x - pelvisX;
        const reachable = ankle.y + Math.sqrt(Math.max(0, (legLength * 0.998) ** 2 - dx * dx));
        pelvisY = Math.min(pelvisY, lerp(reachable, pelvisY, this.airWeight));
      }
    }
    pose.pelvis.x = pelvisX;
    pose.pelvis.y = pelvisY;
    for (let i = 0; i < 2; i++) {
      const hip = { x: pelvisX + (i === 1 ? 0.012 : -0.012) * H, y: pelvisY };
      const leg = solve(hip, ankles[i], b.thigh, b.shin, 1);
      const limb = pose.legs[i];
      limb.root = hip;
      limb.mid = leg.mid;
      limb.end = leg.end;
      limb.endAngle = footAngles[i];
    }

    // Torso and head.
    const leanTarget =
      0.035 + 0.13 * run + Math.max(-0.12, Math.min(0.16, this.accel * 0.02)) + Math.max(0, -this.land) * 0.4 + crouch * 0.45
      + this.airWeight * (0.06 * tuck - 0.04 * drop);
    this.lean = damp(this.lean, leanTarget, 9, dt);
    const lean = this.lean;
    pose.torsoAngle = lean;
    pose.breath = breath * this.idleWeight;
    pose.chest.x = pelvisX + Math.sin(lean) * b.torso;
    pose.chest.y = pelvisY + Math.cos(lean) * b.torso + breath * 0.004 * H;
    pose.neck.x = pose.chest.x + Math.sin(lean * 0.5) * b.neck;
    pose.neck.y = pose.chest.y + Math.cos(lean * 0.5) * b.neck;
    pose.headAngle = -lean * 0.55 + Math.sin(this.time * 0.9) * 0.02 * this.idleWeight;
    pose.head.x = pose.neck.x + Math.sin(pose.headAngle) * b.headRadius * 0.9 + 0.012 * H;
    pose.head.y = pose.neck.y + Math.cos(pose.headAngle) * b.headRadius * 0.9;

    // Arms swing against the opposite leg; bent and pumping in a run, raised in the air.
    const shoulder = { x: pose.chest.x - Math.sin(lean) * 0.035 * H, y: pose.chest.y - Math.cos(lean) * 0.035 * H };
    const swingAmp = lerp(0.42, 0.95, run) * (1 - this.idleWeight);
    for (let i = 0; i < 2; i++) {
      const legPhase = (this.phase + (1 - i) * 0.5) % 1;
      const swing = Math.cos(2 * Math.PI * legPhase) * swingAmp;
      const idle = (i === 1 ? 0.06 : -0.02) + breath * 0.02;
      const air = (i === 1 ? 1 : 0.75) * lerp(0.5, 1.35, Math.max(tuck, drop));
      const upper = lerp(lerp(swing + lean * 0.5, idle, this.idleWeight), air, this.airWeight) + crouch * 0.5;
      const bend = lerp(lerp(0.3 + Math.max(0, swing) * 0.5, 1.5, run), 0.9, this.airWeight) * (1 - this.idleWeight * 0.8);
      const at = { x: shoulder.x + (i === 1 ? 0.01 : -0.01) * H, y: shoulder.y };
      const elbow = { x: at.x + Math.sin(upper) * b.upperArm, y: at.y - Math.cos(upper) * b.upperArm };
      const fore = upper + bend;
      const limb = pose.arms[i];
      limb.root = at;
      limb.mid = elbow;
      limb.end = { x: elbow.x + Math.sin(fore) * b.forearm, y: elbow.y - Math.cos(fore) * b.forearm };
      limb.endAngle = fore;
    }

    // Jacket hem trails the motion.
    const flapTarget = -Math.min(0.5, Math.abs(character.vx) * 0.07) + character.vy * 0.03;
    this.flapRate += ((flapTarget - pose.flap) * 120 - this.flapRate * 14) * dt;
    pose.flap += this.flapRate * dt;

    this.simulateHair(dt, character, gravity);
    return pose;
  }

  /* Ponytail: a short Verlet chain in world space, pinned at the head, pulled by gravity and drag. */
  private simulateHair(dt: number, character: CharacterController, gravity: number): void {
    const n = this.strands.length;
    if (n === 0) return;
    const b = this.body;
    const pose = this.pose;
    const facing = character.facing;
    const link = 0.052 * b.height;
    const anchorLocal = {
      x: pose.head.x - b.headRadius * 0.8,
      y: pose.head.y + b.headRadius * 0.45,
    };
    const ax = character.x + facing * anchorLocal.x;
    const ay = character.y + anchorLocal.y;
    const g = Math.max(gravity, 3);
    for (let i = 0; i < n; i++) {
      const p = this.strands[i];
      if (i === 0) {
        p.px = p.x;
        p.py = p.y;
        p.x = ax;
        p.y = ay;
        continue;
      }
      const vx = (p.x - p.px) * 0.97;
      const vy = (p.y - p.py) * 0.97;
      p.px = p.x;
      p.py = p.y;
      // Gravity, a little air drag against the body's motion, and a spring toward a hanging shape.
      const restX = ax - facing * link * i * 0.55;
      const restY = ay - link * i * 0.85;
      p.x += vx + ((restX - p.x) * 40 - character.vx * 0.6) * dt * dt;
      p.y += vy + ((restY - p.y) * 40 - g) * dt * dt;
    }
    for (let k = 0; k < 3; k++) {
      for (let i = 1; i < n; i++) {
        const a = this.strands[i - 1];
        const p = this.strands[i];
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const fix = (d - link) / d;
        if (i === 1) {
          p.x -= dx * fix;
          p.y -= dy * fix;
        } else {
          a.x += dx * fix * 0.5;
          a.y += dy * fix * 0.5;
          p.x -= dx * fix * 0.5;
          p.y -= dy * fix * 0.5;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      pose.hair[i].x = (this.strands[i].x - character.x) * facing;
      pose.hair[i].y = this.strands[i].y - character.y;
    }
  }
}
