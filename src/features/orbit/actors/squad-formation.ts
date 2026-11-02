import type { MateKind } from "./party";

/** Stable slots in metres: vanguard, rear, close guard, then further supporting ranks. */
const SLOTS = [4.5, -4, 1.8, 8, -7.5, -1.8, 11.5, -11, 14.5, -14.5] as const;
/** Gorr needs additional room for his shoulders. */
export function formationOffset(slot: number, kind: MateKind): number {
  const offset = SLOTS[slot % SLOTS.length];
  return kind === "giant" ? Math.sign(offset) * (Math.abs(offset) + 1.5) : offset;
}
