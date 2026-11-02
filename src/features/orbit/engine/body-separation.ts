export interface SolidBody {
  x: number;
  y: number;
  half: number;
  mass: number;
  friend: boolean;
  hero?: boolean;
  /** Returns the displacement actually allowed by terrain. */
  move(dx: number): number;
}

/** Six constraint passes settle crowded ranks without random directions or team pushes on the hero. */
const PASSES = 6;
/** Bodies at different elevations can jump over one another (m). */
const VERTICAL_CLEARANCE = 0.9;

export function separateBodies(bodies: SolidBody[]): void {
  // Preserve spatial order through every constraint pass; crossing neighbours causes crowd jitter.
  const ordered = [...bodies].sort((a, b) => a.x - b.x);
  for (let pass = 0; pass < PASSES; pass++) {
    for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i];
      const b = ordered[j];
      const overlap = a.half + b.half - (b.x - a.x);
      if (overlap <= 0 || Math.abs(a.y - b.y) > VERTICAL_CLEARANCE) continue;
      const dir = 1;
      const heroA = a.hero && b.friend;
      const heroB = b.hero && a.friend;
      const shareA = heroA ? 0 : heroB ? 1 : b.mass / (a.mass + b.mass);
      const movedA = a.move(-dir * overlap * shareA);
      const movedB = b.move(dir * overlap * (1 - shareA));
      a.x += movedA;
      b.x += movedB;
      // If a wall prevents one body yielding, ask the other to take the remaining correction.
      const remaining = overlap - Math.abs(movedA) - Math.abs(movedB);
      if (remaining > 0.001) {
        if (Math.abs(movedA) < overlap * shareA && !heroB) b.x += b.move(dir * remaining);
        else if (!heroA) a.x += a.move(-dir * remaining);
      }
    }
  }
}
