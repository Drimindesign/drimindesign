import type { Terrain, RoadFeature } from "../engine/terrain";
import type { CompanionSupport } from "./companion-support";
import { CHARACTER } from "../engine/config";

export interface CompanionRopeSpec {
  x: number;
  y?: number;
  length?: number;
}

export interface CompanionWalkSpec {
  x0: number;
  x1: number;
  above: number;
}

export interface CompanionRouteOptions {
  features: readonly RoadFeature[];
  ropes: readonly (number | CompanionRopeSpec)[];
  walks: readonly CompanionWalkSpec[];
  gravity: number;
}

export interface CompanionBody {
  readonly navigationId: object;
  x: number;
  y: number;
  vx: number;
  facing: number;
  readonly spec: { speed: number; leaper: boolean };
  hop: { x0: number; y0: number; x1: number; y1: number; t: number; climb?: boolean } | null;
  fall: { vx: number; vy: number } | null;
  traversal: CompanionCrossing | null;
}

export interface CompanionCrossing {
  kind: "rope" | "walk";
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  elapsed: number;
  duration: number;
  ropeX?: number;
  gapX?: number;
  ropeY?: number;
  ropeLength?: number;
  direction?: number;
  ropePhase?: "catch" | "swing" | "transfer" | "land";
  theta?: number;
  angularVelocity?: number;
  landElapsed?: number;
  catchX?: number;
  catchY?: number;
  catchDuration?: number;
  catchBoostAt?: number;
  catchBoosted?: boolean;
  catchHorizontalSpeed?: number;
  stations?: readonly CompanionRopeSpec[];
  stationIndex?: number;
  landVx?: number;
  landVy?: number;
}

const MAX_GRADE = 1.5;
const MAX_STEP = 0.42;
const ROPE_HEIGHT = 8.2;
const ROPE_LENGTH = 6.4;
const ROPE_SPACING = 0.8;
const SWING_PUMP_ACCELERATION = 4;
const MAX_SWING_SPEED = 10;
/** Same push-off impulse (m/s) as the explorer releasing a rope. */
const RELEASE_LIFT = 2.6;

/** Stage-owned paths let companions use the same authored crossings without sharing hero input. */
export class CompanionNavigator {
  private readonly ropes: readonly CompanionRopeSpec[];
  private readonly reservations = new Map<number, object>();
  private blockedRopes = new Set<number>();

  constructor(
    private readonly terrain: Terrain,
    private readonly options: CompanionRouteOptions,
    private readonly support?: CompanionSupport,
  ) {
    this.ropes = options.ropes.map((rope) => typeof rope === "number" ? { x: rope } : rope);
  }

  /** The player's current grip has priority over companion traffic on the same rope. */
  setBlockedRopes(xs: readonly number[]): void {
    this.blockedRopes = new Set(xs);
  }

  /** Move one actor with grounded collision and authored crossings. Returns true while in transit. */
  move(actor: CompanionBody, dt: number, targetX: number): boolean {
    if (actor.traversal) return this.stepCrossing(actor, dt);
    if (actor.hop) return this.stepHop(actor, dt);
    if (actor.fall) return this.stepFall(actor, dt);
    const supportedTarget = this.support?.approachTarget(actor, targetX) ?? targetX;
    if (this.support?.move(actor, dt, supportedTarget)) return true;
    const delta = supportedTarget - actor.x;
    const direction = Math.sign(delta);
    if (!direction || Math.abs(delta) < 0.02) {
      actor.vx = 0;
      actor.y = this.terrain.height(actor.x);
      return false;
    }

    const speed = Math.min(actor.spec.speed, Math.abs(delta) * 2.4, Math.abs(actor.vx));
    const dx = direction * speed * dt;
    const here = this.terrain.height(actor.x);
    const nextX = actor.x + dx;
    const there = this.terrain.height(nextX);

    const gap = this.crossingBetween(actor.x, targetX);
    if (gap && this.atGapEdge(actor.x, gap, direction)) {
      if (gap.kind === "walk" || gap.kind === "rope") {
        if (gap.kind !== "rope" || this.reserveCrossing(actor, gap)) {
          actor.traversal = {
            ...gap,
            x0: actor.x,
            y0: this.terrain.height(actor.x),
            duration: Math.abs(gap.x1 - actor.x) / actor.spec.speed,
          };
          return this.stepCrossing(actor, dt);
        }
      }
      actor.vx = 0;
      return false;
    }

    const grade = this.terrain.slope(nextX) * direction;
    if (there < here - 0.04 || grade < -MAX_GRADE) {
      actor.fall = { vx: direction * speed, vy: 0 };
      return this.stepFall(actor, dt);
    }
    if (there - here > MAX_STEP || grade > MAX_GRADE) {
      const climb = this.options.features.find((feature) => feature.kind === "ledge" &&
        Math.abs(feature.x - actor.x) < 1.1 && direction * feature.size > 0 &&
        Math.abs(feature.size) <= (actor.spec.leaper ? 2.6 : 2.3));
      const walk = this.options.walks.find((item) => actor.x >= item.x0 - 0.8 && actor.x <= item.x1 + 0.8 &&
        nextX >= item.x0 && nextX <= item.x1 && item.above > here && item.above - here <= 3.4);
      if (walk) {
        actor.traversal = { kind: "walk", x0: actor.x, x1: nextX, y0: here, y1: walk.above, elapsed: 0, duration: Math.abs(nextX - actor.x) / actor.spec.speed };
        return this.stepCrossing(actor, dt);
      }
      if (climb && direction !== 0) {
        if (!this.reserve(actor, climb.x)) { actor.vx = 0; return false; }
        const x1 = actor.x + direction * 0.75;
        actor.hop = { x0: actor.x, y0: here, x1, y1: this.terrain.height(x1), t: 0, climb: true };
        return this.stepHop(actor, dt);
      }
      actor.vx = 0;
      return false;
    }

    actor.vx = direction * speed;
    actor.facing = direction;
    actor.x = nextX;
    actor.y = there;
    return false;
  }

  reset(actor: CompanionBody): void {
    this.release(actor);
    actor.traversal = null;
    actor.hop = null;
    actor.fall = null;
    this.support?.reset(actor);
  }

  /** Releasing a grip starts a real fall; supported casualties remain on their platform. */
  disable(actor: CompanionBody): void {
    const vx = actor.vx;
    this.release(actor); actor.traversal = null; actor.hop = null;
    if (this.support?.carryResting(actor)) return;
    this.support?.reset(actor);
    if (actor.y > this.terrain.height(actor.x) + 0.3) actor.fall = { vx, vy: 0 };
  }

  rest(actor: CompanionBody, dt: number): void {
    if (this.support?.carryResting(actor)) return;
    if (actor.fall) this.stepFall(actor, dt);
  }

  supportPhase(actor: CompanionBody): ReturnType<CompanionSupport["phase"]> {
    return this.support?.phase(actor) ?? null;
  }

  private crossingBetween(from: number, to: number): CompanionCrossing | null {
    const direction = Math.sign(to - from);
    if (!direction) return null;
    let nearest: CompanionCrossing | null = null;
    let nearestDistance = Infinity;
    for (const feature of this.options.features) {
      if (feature.kind !== "ravine" && feature.kind !== "water") continue;
      const start = feature.x - 0.8;
      const end = feature.x + feature.size + 0.8;
      if (direction > 0 ? from <= start && to > start : from >= end && to < end) {
        const routeRopes = this.ropes.filter((candidate) => candidate.x > feature.x && candidate.x < feature.x + feature.size)
          .sort((a, b) => direction * (a.x - b.x));
        const ropes = routeRopes
          .sort((a, b) => direction * (a.x - b.x));
        if (ropes.length === 0) return null;
        // Each authored rope is a real swing station. A wide ravine uses the authored pair in order.
        const rope = ropes[0];
        const x0 = direction > 0 ? start : end;
        const x1 = direction > 0 ? end : start;
        const crossing: CompanionCrossing = {
          kind: "rope", x0, x1, y0: this.terrain.height(x0), y1: this.terrain.height(x1), elapsed: 0,
          duration: Math.abs(x1 - x0) / 5.2, ropeX: rope.x, gapX: feature.x,
          ropeY: rope.y ?? this.ropeAnchorY(feature), ropeLength: rope.length ?? ROPE_LENGTH,
          direction,
          ropePhase: "catch",
          angularVelocity: direction * Math.min(0.95, 5.2 / (ROPE_LENGTH * 0.87)),
          stations: ropes,
          stationIndex: 0,
        };
        const distance = Math.abs(x0 - from);
        if (distance < nearestDistance) {
          nearest = crossing;
          nearestDistance = distance;
        }
      }
    }
    return nearest;
  }

  private atGapEdge(x: number, crossing: CompanionCrossing, direction: number): boolean {
    return direction > 0 ? x >= crossing.x0 - 0.3 : x <= crossing.x0 + 0.3;
  }

  private reserve(actor: CompanionBody, x: number): boolean {
    const owner = this.reservations.get(x);
    if (owner && owner !== actor.navigationId) return false;
    this.reservations.set(x, actor.navigationId);
    return true;
  }

  private reserveCrossing(actor: CompanionBody, crossing: CompanionCrossing): boolean {
    const keys = [crossing.gapX, ...(crossing.stations ?? []).map((station) => station.x), crossing.ropeX]
      .filter((key): key is number => key !== undefined);
    if (keys.some((key) => this.blockedRopes.has(key))) return false;
    if (keys.some((key) => this.reservations.has(key) && this.reservations.get(key) !== actor.navigationId)) return false;
    for (const key of keys) this.reservations.set(key, actor.navigationId);
    return true;
  }

  private release(actor: CompanionBody): void {
    for (const [x, owner] of this.reservations) if (owner === actor.navigationId) this.reservations.delete(x);
  }

  private stepCrossing(actor: CompanionBody, dt: number): boolean {
    const crossing = actor.traversal;
    if (!crossing) return false;
    crossing.elapsed += dt;
    if (crossing.kind === "rope") {
      this.stepRope(actor, crossing, dt);
      return true;
    }
    const t = Math.min(1, crossing.elapsed / crossing.duration);
    actor.x = crossing.x0 + (crossing.x1 - crossing.x0) * t;
    actor.y = crossing.y0 + (crossing.y1 - crossing.y0) * t + Math.sin(Math.PI * t) * 0.7;
    actor.vx = (crossing.x1 - crossing.x0) / crossing.duration;
    actor.facing = Math.sign(actor.vx) || actor.facing;
    if (t >= 1) {
      actor.y = crossing.y1;
      actor.traversal = null;
    }
    return true;
  }

  private stepRope(actor: CompanionBody, crossing: CompanionCrossing, dt: number): void {
    const direction = crossing.direction ?? 1;
    const stations = crossing.stations ?? [{ x: crossing.ropeX ?? actor.x, y: crossing.ropeY, length: crossing.ropeLength }];
    const index = crossing.stationIndex ?? 0;
    const station = stations[index];
    if (!station) return;
    const anchorY = station.y ?? crossing.ropeY ?? actor.y + ROPE_HEIGHT;
    const length = station.length ?? crossing.ropeLength ?? ROPE_LENGTH;
    const bodyOffset = 0.8;

    if (crossing.ropePhase === "catch") {
      const catchX = crossing.catchX ?? station.x - direction * 0.25;
      const dx = catchX - crossing.x0;
      const catchY = crossing.catchY ?? anchorY - length - bodyOffset;
      const boostAt = crossing.catchBoostAt ?? CHARACTER.jumpSpeed / this.options.gravity;
      const boostHeight = CHARACTER.jumpSpeed * boostAt - 0.5 * this.options.gravity * boostAt * boostAt;
      const afterBoost = (CHARACTER.airJumpSpeed + Math.sqrt(Math.max(0, CHARACTER.airJumpSpeed ** 2 + 2 * this.options.gravity * (boostHeight - (catchY - crossing.y0))))) / this.options.gravity;
      const duration = crossing.catchDuration ?? boostAt + afterBoost;
      crossing.catchDuration = duration;
      crossing.catchBoostAt = boostAt;
      const horizontalSpeed = dx / duration;
      crossing.catchHorizontalSpeed = horizontalSpeed;
      const t = Math.min(1, crossing.elapsed / duration);
      // The first jump and one air boost follow the same ballistic contract as the explorer.
      if (afterBoost <= 0 || Math.abs(horizontalSpeed) > actor.spec.speed + 0.01) {
        actor.vx = 0;
        actor.traversal = null;
        this.release(actor);
        return;
      }
      actor.x = crossing.x0 + dx * t;
      if (crossing.elapsed >= boostAt && !crossing.catchBoosted) crossing.catchBoosted = true;
      const after = Math.max(0, crossing.elapsed - boostAt);
      actor.y = crossing.elapsed <= boostAt
        ? crossing.y0 + CHARACTER.jumpSpeed * crossing.elapsed - 0.5 * this.options.gravity * crossing.elapsed * crossing.elapsed
        : crossing.y0 + boostHeight + CHARACTER.airJumpSpeed * after - 0.5 * this.options.gravity * after * after;
      actor.vx = horizontalSpeed;
      actor.facing = direction;
      if (t >= 1) {
        crossing.ropePhase = "swing";
        crossing.theta = Math.atan2(catchX - station.x, anchorY - (catchY + bodyOffset));
        const landingVy = crossing.elapsed <= boostAt
          ? CHARACTER.jumpSpeed - this.options.gravity * crossing.elapsed
          : CHARACTER.airJumpSpeed - this.options.gravity * after;
        const tangentSpeed = horizontalSpeed * Math.cos(crossing.theta) + landingVy * Math.sin(crossing.theta);
        crossing.angularVelocity = tangentSpeed / length;
        crossing.angularVelocity = Math.max(-MAX_SWING_SPEED / length, Math.min(MAX_SWING_SPEED / length, crossing.angularVelocity));
        crossing.elapsed = 0;
        actor.x = station.x + length * Math.sin(crossing.theta);
        actor.y = anchorY - length * Math.cos(crossing.theta) - bodyOffset;
      }
      return;
    }

    if (crossing.ropePhase === "transfer") {
      const next = stations[index + 1];
      if (!next) return;
      actor.x += (crossing.landVx ?? 0) * dt;
      actor.y += (crossing.landVy ?? 0) * dt - 0.5 * this.options.gravity * dt * dt;
      crossing.landVy = (crossing.landVy ?? 0) - this.options.gravity * dt;
      actor.vx = crossing.landVx ?? 0;
      const nextY = next.y ?? anchorY;
      const dx = actor.x - next.x;
      const dy = nextY - (actor.y + bodyOffset);
      const radius = Math.hypot(dx, dy);
      // Hands catch a point on the actual hanging strand, not an invisible arc several metres away.
      if (Math.abs(dx) <= 0.8 && dy > 1 && radius <= (next.length ?? ROPE_LENGTH)) {
        const theta = Math.atan2(dx, dy);
        const speed = (crossing.landVx ?? 0) * Math.cos(theta) + (crossing.landVy ?? 0) * Math.sin(theta);
        crossing.stations = stations.map((r, i) => i === index + 1 ? { ...r, length: radius } : r);
        crossing.stationIndex = index + 1;
        crossing.ropeX = next.x; crossing.ropeY = nextY; crossing.ropeLength = radius;
        crossing.theta = theta; crossing.angularVelocity = speed / radius;
        crossing.ropePhase = "swing";
      }
      return;
    }

    if (crossing.ropePhase === "land") {
      crossing.landElapsed = (crossing.landElapsed ?? 0) + dt;
      actor.x += (crossing.landVx ?? 0) * dt;
      actor.y += (crossing.landVy ?? 0) * dt - 0.5 * this.options.gravity * dt * dt;
      crossing.landVy = (crossing.landVy ?? 0) - this.options.gravity * dt;
      actor.vx = crossing.landVx ?? 0;
      if (actor.y <= this.terrain.height(actor.x) && direction * (actor.x - crossing.x0) > 0.2) {
        const bank = crossing.x1;
        const top = this.terrain.height(bank);
        if (Math.abs(bank - actor.x) < 1.5 && top >= actor.y && top - actor.y <= 2.3) {
          // Hands catch the lip; pull up at climbing speed instead of snapping feet onto a steep bank.
          actor.hop = { x0: actor.x, y0: actor.y, x1: bank, y1: top, t: 0, climb: true };
          actor.traversal = null;
        } else {
          actor.y = this.terrain.height(actor.x);
          this.release(actor);
          actor.traversal = null;
        }
      }
      return;
    }

    let theta = crossing.theta ?? 0;
    let omega = crossing.angularVelocity ?? direction * 0.8;
    const substeps = Math.max(1, Math.ceil(dt / 0.01));
    const h = dt / substeps;
    for (let i = 0; i < substeps; i++) {
      // The companion stays exactly one rope length from the authored anchor while gravity swings it.
      omega -= (this.options.gravity / length) * Math.sin(theta) * h;
      // Leg pumping adds modest work near the bottom; the speed cap keeps the swing human-scale.
      const tangentSpeed = length * omega;
      if (direction * tangentSpeed > 0 && Math.abs(theta) < 0.55) omega += direction * (SWING_PUMP_ACCELERATION / length) * h;
      omega = Math.max(-MAX_SWING_SPEED / length, Math.min(MAX_SWING_SPEED / length, omega));
      theta += omega * h;
      theta = Math.atan2(Math.sin(theta), Math.cos(theta));
    }
    crossing.theta = theta;
    crossing.angularVelocity = omega;
    actor.x = station.x + length * Math.sin(theta);
    actor.y = anchorY - length * Math.cos(theta) - bodyOffset;
    actor.vx = length * Math.cos(theta) * omega;
    actor.facing = Math.sign(actor.vx) || direction;

    const next = stations[index + 1];
    // Let go while rising and use the same rope-release lift as the explorer.
    if (next && direction * theta >= 0.5 && direction * omega > 0) {
      crossing.ropePhase = "transfer";
      crossing.landVx = actor.vx;
      crossing.landVy = length * Math.sin(theta) * omega + RELEASE_LIFT;
      return;
    }

    const launchX = station.x + direction * length * 0.82;
    const launchedFarEnough = direction > 0 ? actor.x >= launchX : actor.x <= launchX;
    if (!next && launchedFarEnough) {
      crossing.ropePhase = "land";
      crossing.x0 = actor.x;
      crossing.y0 = actor.y;
      crossing.landElapsed = 0;
      crossing.landVx = actor.vx;
      crossing.landVy = length * Math.sin(theta) * omega + RELEASE_LIFT;
    }
  }

  private stepHop(actor: CompanionBody, dt: number): boolean {
    const hop = actor.hop;
    if (!hop) return false;
    if (hop.climb) {
      // Hands support the body on the rock face; climb first, then mantle onto the ledge.
      actor.vx = 0;
      actor.y = Math.min(hop.y1, actor.y + 1.5 * dt);
      if (actor.y >= hop.y1) {
        const dx = Math.max(-actor.spec.speed * dt, Math.min(actor.spec.speed * dt, hop.x1 - actor.x));
        actor.x += dx; actor.vx = dx / dt;
        if (Math.abs(actor.x - hop.x1) < 0.001) { actor.hop = null; this.release(actor); }
      }
    } else {
      const duration = Math.max(0.28, Math.abs(hop.x1 - hop.x0) / actor.spec.speed);
      hop.t = Math.min(1, hop.t + dt / duration);
      const elapsed = hop.t * duration;
      const vy = (hop.y1 - hop.y0 + 0.5 * this.options.gravity * duration ** 2) / duration;
      actor.x = hop.x0 + (hop.x1 - hop.x0) * hop.t;
      actor.y = hop.y0 + vy * elapsed - 0.5 * this.options.gravity * elapsed ** 2;
      actor.vx = (hop.x1 - hop.x0) / duration;
      if (hop.t >= 1) { actor.y = hop.y1; actor.hop = null; this.release(actor); }
    }
    return true;
  }

  private stepFall(actor: CompanionBody, dt: number): boolean {
    const fall = actor.fall;
    if (!fall) return false;
    const previousY = actor.y;
    actor.x += fall.vx * dt;
    actor.y += fall.vy * dt - 0.5 * this.options.gravity * dt * dt;
    fall.vy -= this.options.gravity * dt;
    actor.vx = fall.vx;
    actor.facing = Math.sign(fall.vx) || actor.facing;
    const ground = this.terrain.height(actor.x);
    if (fall.vy < 0 && actor.y <= ground) {
      actor.y = ground;
      actor.fall = null;
    } else if (actor.y < ground && previousY < ground) {
      actor.y = ground;
      actor.fall = null;
    }
    return true;
  }

  private ropeAnchorY(feature: RoadFeature): number {
    const lip = Math.max(this.terrain.height(feature.x - 0.6), this.terrain.height(feature.x + feature.size + 0.6));
    return lip + ROPE_HEIGHT;
  }
}

/** Standard authoring values used by the Road stage's current rope layout. */
export function companionRopeAnchor(terrain: Terrain, feature: RoadFeature, x: number): CompanionRopeSpec {
  const lip = Math.max(terrain.height(feature.x - 0.6), terrain.height(feature.x + feature.size + 0.6));
  return { x, y: lip + ROPE_HEIGHT, length: ROPE_LENGTH };
}

export const COMPANION_ROPE_QUEUE_SPACING = ROPE_SPACING;
