/*
 * The squad's battle plan, made fresh each step for everyone at once rather than each fighter
 * choosing alone (which sent them all onto the same enemy). In order:
 *   1. the bodyguard (Gorr) takes whoever is closest to her;
 *   2. anyone with an enemy on it fights that one first;
 *   3. a fight already started is finished (unless that enemy is already well covered);
 *   4. everyone else spreads out: one blade per enemy where there are enough enemies, ranged
 *      fighters on different targets, each taking enemies on its own side of her.
 */

export interface PlanFoe {
  x: number;
  y: number;
  active: boolean;
}

export interface PlanMate<F extends PlanFoe> {
  x: number;
  y: number;
  /** Fights from range (bow, magic): several of them on one enemy is fine. */
  ranged: boolean;
  bodyguard: boolean;
  /** The enemy it was fighting last step, if any. */
  previous: F | null;
}

export interface PlanSituation {
  heroX: number;
  /** She's in trouble: enemies on her count for more. */
  trouble: boolean;
}

/** Distances (m) and weights for the plan. */
export const TACTICS = {
  /** The bodyguard covers enemies this close to her. */
  bodyguard: 6,
  /** An enemy this close to a fighter is its fight first. */
  selfDefence: 2.6,
  /** A started fight is chased this far before it's given up. */
  commit: 20,
  /** Out of trouble, a free fighter only goes for enemies this close to itself. */
  reach: 12,
  /** Blades on one enemy before others must look elsewhere (while there are free enemies). */
  blades: 1,
  /** How strongly an enemy already covered pushes the next fighter elsewhere (m of extra distance). */
  crowding: 8,
  /** Extra distance (m) for an enemy on the far side of her: each fighter holds its own side. */
  side: 6,
  /** Enemies this close to her count as nearer (m) when she's in trouble. */
  onHer: 5,
  urgency: 3,
} as const;

export function planTargets<F extends PlanFoe, M extends PlanMate<F>>(mates: readonly M[], foes: readonly F[], at: PlanSituation): Map<M, { foe: F | null; committed: boolean }> {
  const plan = new Map<M, { foe: F | null; committed: boolean }>();
  const live = foes.filter((f) => f.active);
  const blades = new Map<F, number>();
  const shots = new Map<F, number>();
  const take = (mate: M, foe: F, committed = false): void => {
    plan.set(mate, { foe, committed });
    const tally = mate.ranged ? shots : blades;
    tally.set(foe, (tally.get(foe) ?? 0) + 1);
  };
  const near = (x: number, reach: number): F | null => {
    let best: F | null = null;
    for (const f of live) if (Math.abs(f.x - x) <= reach && (!best || Math.abs(f.x - x) < Math.abs(best.x - x))) best = f;
    return best;
  };

  const nearest = (m: M): number => Math.min(...live.map((f) => Math.abs(f.x - m.x)), Infinity);

  // 1–2. The bodyguard, then self-defence.
  for (const m of mates) {
    if (m.bodyguard) {
      const f = near(at.heroX, TACTICS.bodyguard);
      if (f) take(m, f);
    }
  }
  // Closest first, so the one an enemy is really on gets it; an enemy already met by a blade
  // doesn't pull a second one while another enemy is still free.
  const byThreat = [...mates].filter((m) => !plan.has(m)).sort((a, b) => nearest(a) - nearest(b));
  for (const m of byThreat) {
    const freeFoes = live.some((f) => (blades.get(f) ?? 0) < TACTICS.blades);
    const f = live
      .filter((foe) => Math.abs(foe.x - m.x) <= TACTICS.selfDefence && Math.abs(foe.y - m.y) <= 1.6)
      .filter((foe) => m.ranged || !freeFoes || (blades.get(foe) ?? 0) < TACTICS.blades)
      .sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x))[0];
    if (f) take(m, f);
  }
  // 3. Finish what was started, unless that enemy already has its blade.
  const spare = live.length > mates.filter((m) => !m.ranged).length / TACTICS.blades;
  for (const m of mates) {
    if (plan.has(m) || !m.previous || !m.previous.active || Math.abs(m.previous.x - m.x) > TACTICS.commit) continue;
    if (!m.ranged && spare && (blades.get(m.previous) ?? 0) >= TACTICS.blades) continue;
    take(m, m.previous, true);
  }
  // 4. Spread the rest, nearest fighters choosing first.
  const free = mates.filter((m) => !plan.has(m));
  free.sort((a, b) => nearest(a) - nearest(b));
  for (const m of free) {
    let best: F | null = null;
    let cost = Infinity;
    const enough = live.some((f) => (blades.get(f) ?? 0) < TACTICS.blades);
    for (const f of live) {
      const distance = Math.abs(f.x - m.x);
      if (!at.trouble && distance > TACTICS.reach) continue;
      const covered = m.ranged ? shots.get(f) ?? 0 : blades.get(f) ?? 0;
      if (!m.ranged && enough && covered >= TACTICS.blades) continue;
      const mySide = Math.sign(m.x - at.heroX);
      const farSide = mySide !== 0 && Math.sign(f.x - at.heroX) === -mySide;
      const urgent = at.trouble && Math.abs(f.x - at.heroX) <= TACTICS.onHer;
      const c = distance + covered * TACTICS.crowding + (farSide ? TACTICS.side : 0) - (urgent ? TACTICS.urgency : 0);
      if (c < cost) {
        cost = c;
        best = f;
      }
    }
    if (best) take(m, best);
    else plan.set(m, { foe: null, committed: false });
  }
  return plan;
}
