import type { Terrain } from "./terrain";

/** The joints of a body, in the side-on plane of the game. */
export const JOINTS = ["head", "chest", "pelvis", "elbowL", "handL", "elbowR", "handR", "kneeL", "footL", "kneeR", "footR"] as const;
export type Joint = (typeof JOINTS)[number];

/** Rigid bones between joints. */
const BONES: readonly (readonly [Joint, Joint])[] = [
  ["head", "chest"],
  ["chest", "pelvis"],
  ["chest", "elbowL"],
  ["elbowL", "handL"],
  ["chest", "elbowR"],
  ["elbowR", "handR"],
  ["pelvis", "kneeL"],
  ["kneeL", "footL"],
  ["pelvis", "kneeR"],
  ["kneeR", "footR"],
];
/**
 * Joint limits as minimum distances across a joint (share of the straight-limb length): the
 * spine and neck can't fold through themselves, knees and elbows can't close completely.
 */
const LIMITS: readonly (readonly [Joint, Joint, number])[] = [
  ["head", "pelvis", 0.82],
  ["chest", "footL", 0.55],
  ["chest", "footR", 0.55],
  ["pelvis", "footL", 0.45],
  ["pelvis", "footR", 0.45],
  ["chest", "handL", 0.4],
  ["chest", "handR", 0.4],
];
/** Mass of each joint's share of the body (relative): the torso carries the weight. */
const MASS: Record<Joint, number> = { head: 1.4, chest: 3, pelvis: 3, elbowL: 0.8, handL: 0.6, elbowR: 0.8, handR: 0.6, kneeL: 1.2, footL: 0.9, kneeR: 1.2, footR: 0.9 };
/** Solver iterations per step, air damping (share of velocity kept per 1/120 s), and ground behaviour. */
const ITERATIONS = 8;
const DAMPING = 0.998;
const GROUND = { friction: 0.82, bounce: 0.25, radius: 0.07 } as const;
/** It's at rest when every joint has moved less than this (m/s) for REST_TIME (s). */
const REST_SPEED = 0.35;
const REST_TIME = 0.35;

interface Point {
  x: number;
  y: number;
  /** Position last step (Verlet: velocity is the difference). */
  px: number;
  py: number;
  inv: number;
}

/*
 * A ragdoll: the body as point masses joined by rigid bones (position-based Verlet with
 * iterated constraints, the classic stable method for game ragdolls), with joint limits,
 * gravity, and ground contact with friction and a little bounce. It's seeded from the body's
 * pose at the moment it goes limp, carrying the body's own velocity; a blow adds an impulse at
 * the joint it struck, so a cut to the head snaps the head back and a sweep takes the legs.
 * Whatever falls, falls the way a body does: heavy torso first, limbs trailing, then settles.
 */
export class Ragdoll {
  readonly points: Record<Joint, Point>;
  private readonly bones: { a: Point; b: Point; length: number }[];
  private readonly limits: { a: Point; b: Point; min: number }[];
  private still = 0;
  /** The hardest a joint hit the ground in the last step (m/s), 0 if none did. */
  impact = 0;

  constructor(pose: Record<Joint, { x: number; y: number }>, vx: number, vy: number, dt = 1 / 120) {
    const points = {} as Record<Joint, Point>;
    for (const j of JOINTS) points[j] = { x: pose[j].x, y: pose[j].y, px: pose[j].x - vx * dt, py: pose[j].y - vy * dt, inv: 1 / MASS[j] };
    this.points = points;
    this.bones = BONES.map(([a, b]) => ({ a: points[a], b: points[b], length: Math.max(0.05, dist(points[a], points[b])) }));
    // A limit's minimum is a share of the joints' distance along the straight limb.
    const straight = (a: Joint, b: Joint): number => {
      const chain = path(a, b);
      let sum = 0;
      for (let i = 1; i < chain.length; i++) sum += dist(points[chain[i - 1]], points[chain[i]]);
      return sum;
    };
    this.limits = LIMITS.map(([a, b, share]) => ({ a: points[a], b: points[b], min: straight(a, b) * share }));
  }

  /** A blow at a joint: velocity (m/s) added there; the bones carry it into the rest of the body. */
  impulse(joint: Joint, vx: number, vy: number, dt = 1 / 120): void {
    const p = this.points[joint];
    p.px -= vx * dt;
    p.py -= vy * dt;
  }

  /** The body's centre of mass. */
  get centre(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    let m = 0;
    for (const j of JOINTS) {
      const w = MASS[j];
      x += this.points[j].x * w;
      y += this.points[j].y * w;
      m += w;
    }
    return { x: x / m, y: y / m };
  }

  get resting(): boolean {
    return this.still >= REST_TIME;
  }

  step(dt: number, gravity: number, terrain: Terrain): void {
    let fastest = 0;
    this.impact = 0;
    for (const j of JOINTS) {
      const p = this.points[j];
      const vx = (p.x - p.px) * DAMPING;
      const vy = (p.y - p.py) * DAMPING;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy - gravity * dt * dt;
      fastest = Math.max(fastest, Math.hypot(vx, vy) / dt);
    }
    for (let k = 0; k < ITERATIONS; k++) {
      for (const bone of this.bones) solve(bone.a, bone.b, bone.length, bone.length);
      for (const limit of this.limits) solve(limit.a, limit.b, limit.min, Infinity);
      // Ground: joints can't sink in; sliding along it loses speed to friction, hitting it bounces a little.
      for (const j of JOINTS) {
        const p = this.points[j];
        const floor = terrain.height(p.x) + GROUND.radius;
        if (p.y < floor) {
          const vy = p.y - p.py;
          if (k === 0) this.impact = Math.max(this.impact, -vy / dt);
          p.y = floor;
          p.py = floor + vy * GROUND.bounce;
          p.px = p.x - (p.x - p.px) * GROUND.friction;
        }
      }
    }
    this.still = fastest < REST_SPEED ? this.still + dt : 0;
  }
}

/* Moves two points along their line so their distance lies within [min, max], weighted by mass. */
function solve(a: Point, b: Point, min: number, max: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const target = d < min ? min : d > max ? max : d;
  if (target === d) return;
  const k = (d - target) / d / (a.inv + b.inv);
  a.x += dx * k * a.inv;
  a.y += dy * k * a.inv;
  b.x -= dx * k * b.inv;
  b.y -= dy * k * b.inv;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/* The chain of joints from a to b through the skeleton (for straight-limb lengths). */
function path(a: Joint, b: Joint): Joint[] {
  const up: Record<Joint, Joint | null> = { head: "chest", chest: "pelvis", pelvis: null, elbowL: "chest", handL: "elbowL", elbowR: "chest", handR: "elbowR", kneeL: "pelvis", footL: "kneeL", kneeR: "pelvis", footR: "kneeR" };
  const toRoot = (j: Joint): Joint[] => {
    const chain: Joint[] = [j];
    let at = up[j];
    while (at) {
      chain.push(at);
      at = up[at];
    }
    return chain;
  };
  const ra = toRoot(a);
  const rb = toRoot(b);
  const common = ra.find((j) => rb.includes(j)) ?? "pelvis";
  return [...ra.slice(0, ra.indexOf(common) + 1), ...rb.slice(0, rb.indexOf(common)).reverse()];
}
