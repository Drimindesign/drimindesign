import { lanyard as tune } from "@/lib/motion/tokens";

/*
 * One lanyard as a verlet body, in card units (a card is 1 wide). The strap is folded over
 * the rail, so its two layers hang together from one rail point (STRAND_GAP 0) and meet at
 * the card's clip; they are drawn as one strap. The card is a rigid rod from the clip to its
 * centre, much heavier than the fabric. Twist about
 * the strap (which way the card faces) is a separate damped spring, kicked by sideways swing.
 *
 * Point layout: 0, 1 = rail anchors (fixed) · then each strand's points · clip · centre.
 */

/** Card size in card units (CR80 ratio) and the clip's drop above the card's top edge. */
export const CARD = { width: 1, height: 1.586, depth: 0.03, clip: 0.14 } as const;
/** Gap between the strap's two layers where they leave the rail (0: folded flat together). */
const STRAND_GAP = 0;
/** The strap's own sag: points are spaced this much longer than a straight line. */
const SLACK = 1.004;

export interface LanyardSpec {
  /** Rail point the strap hangs from (between its two strands). */
  x: number;
  y: number;
  /** Depth, so cards dragged across each other pass in front or behind instead of through. */
  z: number;
  /** Strap length from the rail to the clip. */
  length: number;
  /** Resting twist (radians): real cards never hang perfectly square. */
  restTwist: number;
  /** When this card is released into the drop, seconds after the scene starts. */
  releaseAt: number;
}

export class LanyardBody {
  readonly spec: LanyardSpec;
  readonly count: number;
  readonly clip: number;
  readonly centre: number;
  readonly strands: readonly (readonly number[])[];
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  private readonly invMass: Float32Array;
  private readonly links: Int32Array;
  private readonly rest: Float32Array;
  private readonly stiffness: Float32Array;
  twist: number;
  twistVelocity = 0;
  flipped = false;
  grabbed = false;
  private readonly grabTarget = [0, 0, 0];
  private dropped = false;
  private stillFor = 0;

  constructor(spec: LanyardSpec, drop: boolean) {
    this.spec = spec;
    this.twist = spec.restTwist;
    const segments = tune.strapPoints;
    this.count = 2 + segments * 2 + 2;
    this.clip = this.count - 2;
    this.centre = this.count - 1;
    this.pos = new Float32Array(this.count * 3);
    this.prev = new Float32Array(this.count * 3);
    this.invMass = new Float32Array(this.count);

    const strands: number[][] = [[0], [1]];
    const links: number[] = [];
    const rest: number[] = [];
    const stiffness: number[] = [];
    const link = (a: number, b: number, length: number, k: number): void => {
      links.push(a, b);
      rest.push(length);
      stiffness.push(k);
    };

    // Strand geometry: from its rail point straight down to the clip, then split evenly.
    const half = STRAND_GAP / 2;
    const strandLength = Math.hypot(half, spec.length) * SLACK;
    const segment = strandLength / (segments + 1);
    for (let side = 0; side < 2; side++) {
      const first = 2 + side * segments;
      for (let k = 0; k < segments; k++) strands[side].push(first + k);
      strands[side].push(this.clip);
      const chain = strands[side];
      for (let k = 0; k + 1 < chain.length; k++) link(chain[k], chain[k + 1], segment, 1);
      // Fabric resists folding: a soft link across every other point.
      for (let k = 0; k + 2 < chain.length; k++) link(chain[k], chain[k + 2], segment * 2 * 0.985, tune.strapStiffness);
    }
    link(this.clip, this.centre, CARD.clip + CARD.height / 2, 1);
    this.strands = strands;
    this.links = Int32Array.from(links);
    this.rest = Float32Array.from(rest);
    this.stiffness = Float32Array.from(stiffness);

    const strapMass = tune.strapMass;
    this.invMass.fill(1 / strapMass);
    this.invMass[0] = 0;
    this.invMass[1] = 0;
    this.invMass[this.clip] = 1 / 0.25;
    this.invMass[this.centre] = 1;

    this.layOut(drop);
  }

  /*
   * Hanging at rest, or (for the drop) the same shape flipped up above the rail with a
   * slight lean, so the card falls past the rail and swings into place on its strap.
   */
  private layOut(drop: boolean): void {
    const { x, y, z, length } = this.spec;
    const half = STRAND_GAP / 2;
    const lean = drop ? 0.18 * Math.sign(this.spec.restTwist || 1) : 0;
    const direction = drop ? 1 : -1;
    const place = (index: number, px: number, py: number): void => {
      this.pos.set([px, py, z], index * 3);
      this.prev.set([px, py, z], index * 3);
    };
    place(0, x - half, y);
    place(1, x + half, y);
    for (let side = 0; side < 2; side++) {
      const chain = this.strands[side];
      const startX = side === 0 ? x - half : x + half;
      for (let k = 1; k < chain.length - 1; k++) {
        const t = k / (chain.length - 1);
        place(chain[k], startX + (x - startX) * t + lean * length * t, y + direction * length * t);
      }
    }
    const clipY = y + direction * length;
    place(this.clip, x + lean * length, clipY);
    place(this.centre, x + lean * (length + CARD.clip + CARD.height / 2), clipY + direction * (CARD.clip + CARD.height / 2));
  }

  /** Holds the card's centre at a point (card units) while dragged, within reach of the strap. */
  grab(target: readonly [number, number, number]): void {
    const { x, y } = this.spec;
    const reach = this.spec.length + CARD.clip + CARD.height / 2;
    let dx = target[0] - x;
    let dy = target[1] - y;
    const distance = Math.hypot(dx, dy);
    if (distance > reach * 0.985) {
      const scale = (reach * 0.985) / distance;
      dx *= scale;
      dy *= scale;
    }
    this.grabTarget[0] = x + dx;
    this.grabTarget[1] = y + dy;
    this.grabTarget[2] = target[2];
    this.grabbed = true;
    this.wake();
  }

  release(): void {
    this.grabbed = false;
    this.wake();
  }

  /** Adds velocity (card units/s) to the card, as a brush of the cursor would. */
  push(vx: number, vy: number): void {
    const i = this.centre * 3;
    this.prev[i] -= vx * tune.stepS;
    this.prev[i + 1] -= vy * tune.stepS;
    this.wake();
  }

  flip(): void {
    this.flipped = !this.flipped;
    this.wake();
  }

  wake(): void {
    this.stillFor = 0;
  }

  /** Lets go of the card for the drop, once its turn comes (`time`: seconds since the drop began). */
  releaseIfDue(time: number): void {
    if (!this.dropped && time >= this.spec.releaseAt) this.dropped = true;
  }

  get released(): boolean {
    return this.dropped;
  }

  get asleep(): boolean {
    return this.dropped && !this.grabbed && this.stillFor >= tune.sleepAfterS;
  }

  /** Advances one fixed step. Returns the largest distance any point moved. */
  step(): number {
    const dt = tune.stepS;
    const gravity = tune.gravity * dt * dt;
    const { pos, prev, invMass } = this;
    let moved = 0;

    for (let p = 0; p < this.count; p++) {
      if (invMass[p] === 0) continue;
      const i = p * 3;
      for (let a = 0; a < 3; a++) {
        const current = pos[i + a];
        const velocity = (current - prev[i + a]) * tune.drag;
        prev[i + a] = current;
        pos[i + a] = current + velocity + (a === 1 ? -gravity : 0);
      }
    }

    // A dragged card follows the hand; constraints then pull the strap after it.
    const c = this.centre * 3;
    const centreMass = invMass[this.centre];
    if (this.grabbed) {
      for (let a = 0; a < 3; a++) pos[c + a] += (this.grabTarget[a] - pos[c + a]) * 0.35;
      invMass[this.centre] = 0;
    }

    for (let pass = 0; pass < tune.iterations; pass++) {
      for (let l = 0; l < this.rest.length; l++) {
        const a = this.links[l * 2];
        const b = this.links[l * 2 + 1];
        const wa = invMass[a];
        const wb = invMass[b];
        const total = wa + wb;
        if (total === 0) continue;
        const ia = a * 3;
        const ib = b * 3;
        const dx = pos[ib] - pos[ia];
        const dy = pos[ib + 1] - pos[ia + 1];
        const dz = pos[ib + 2] - pos[ia + 2];
        const length = Math.hypot(dx, dy, dz) || 1e-6;
        const k = this.stiffness[l];
        // Soft links only resist folding (pushing the ends together), never stretching.
        if (k < 1 && length > this.rest[l]) continue;
        const correction = ((length - this.rest[l]) / (length * total)) * k;
        pos[ia] += dx * correction * wa;
        pos[ia + 1] += dy * correction * wa;
        pos[ia + 2] += dz * correction * wa;
        pos[ib] -= dx * correction * wb;
        pos[ib + 1] -= dy * correction * wb;
        pos[ib + 2] -= dz * correction * wb;
      }
    }
    invMass[this.centre] = centreMass;

    for (let i = 0; i < pos.length; i++) moved = Math.max(moved, Math.abs(pos[i] - prev[i]));

    // Twist: a damped spring to the rest angle (or half a turn, flipped), kicked by sideways swing.
    const sideways = (pos[c] - prev[c]) / dt;
    const target = this.spec.restTwist + (this.flipped ? Math.PI : 0);
    const torque = -tune.twistStiffness * (this.twist - target) - tune.twistDamping * this.twistVelocity + tune.twistCoupling * sideways;
    this.twistVelocity += torque * dt;
    this.twist += this.twistVelocity * dt;
    moved = Math.max(moved, Math.abs(this.twistVelocity * dt));

    this.stillFor = moved < tune.sleepEpsilon ? this.stillFor + dt : 0;
    return moved;
  }
}

/*
 * Rail positions and strap lengths for the stage, in card units with the origin at the
 * stage's centre. Wide stages hang every card in one row; narrow ones hang two rows
 * (the long straps run down behind the upper cards), so cards stay large enough to read on a phone.
 */
export function layoutLanyards(count: number, stageWidth: number, stageHeight: number, railY: number, dropIn: boolean): LanyardSpec[] {
  const columns = stageWidth / count >= 1.35 ? count : Math.ceil(count / 2);
  const rows = Math.ceil(count / columns);
  const pitch = stageWidth / columns;
  const specs: LanyardSpec[] = [];
  for (let index = 0; index < count; index++) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = -stageWidth / 2 + pitch * (column + 0.5);
    const bottomRoom = rows > 1 ? (row === 0 ? 0.47 : 0.93) : 0.86;
    // Card bottom lands bottomRoom of the stage height down from the top, with natural variety.
    const variety = 1 + Math.sin(index * 2.39) * 0.06;
    const hang = railY - (stageHeight / 2 - stageHeight * bottomRoom);
    const length = Math.max(0.6, (hang - CARD.height - CARD.clip) * variety);
    specs.push({
      x,
      y: railY,
      z: (index % 2 === 0 ? 0 : 0.12) - row * 0.3,
      length,
      restTwist: Math.sin(index * 1.7 + 0.4) * 0.16,
      releaseAt: dropIn ? 0.1 + index * tune.dropStaggerS : 0,
    });
  }
  return specs;
}
