import type { MateKind } from "./party";

/**
 * Her guard, in metres from her: places alternate ahead and behind, the first pair closest, each
 * pair a step further out, never more than `reach` away (a band of 20 m around her). The stage
 * hands out places weakest first, so the weak keep close and the strong hold the outside.
 */
const RING = { first: 1.4, step: 1.25, reach: 10, rank: 0.45 } as const;

export function formationOffset(slot: number, kind: MateKind): number {
  const pair = Math.floor(slot / 2);
  const side = slot % 2 === 0 ? 1 : -1;
  const steps = Math.floor((RING.reach - RING.first) / RING.step) + 1;
  // Past the edge of the band, a second rank stands just inside the first.
  const distance = RING.first + (pair % steps) * RING.step - Math.floor(pair / steps) * RING.rank;
  // Gorr needs room for his shoulders.
  return side * Math.min(RING.reach, distance + (kind === "giant" ? 0.8 : 0));
}
