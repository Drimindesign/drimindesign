import type { MateKind } from "./party";

/** Stable slots in metres: vanguard, rear, close guard, then further supporting ranks. */
const SLOTS = [35, -25, 2, 90, -65, -3, 180, -110, 280, -150] as const;
/** Gorr needs additional room for his shoulders. */
export function formationOffset(slot: number, kind: MateKind): number {
  const offset = SLOTS[slot % SLOTS.length];
  return kind === "giant" ? Math.sign(offset) * (Math.abs(offset) + 1.5) : offset;
}
