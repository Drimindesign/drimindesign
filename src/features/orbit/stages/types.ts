import type { Combo, Score } from "../actors/score";
import type { GameAudio } from "../engine/audio";
import type { InputSnapshot } from "../engine/input";
import type { Painter } from "../pixel/painter";
import type { Particles } from "../pixel/particles";

export type StageId = "discover" | "build" | "launch" | "grow";

export const STAGE_ORDER: readonly StageId[] = ["discover", "build", "launch", "grow"];

export const STAGE_TITLES: Record<StageId, { number: string; title: string; goal: string }> = {
  discover: { number: "01", title: "Discover", goal: "Out of the city by night. Jump the traffic, fly the broken bridges, land the flips." },
  build: { number: "02", title: "Build", goal: "The forest road to the launch pad. Logs, boars, ravines: flip it, land it, keep the combo." },
  launch: { number: "03", title: "Launch", goal: "Hold the thrusters and climb out of the sky." },
  grow: { number: "04", title: "Grow", goal: "Cross the Moon, then get out and plant the flag." },
};

/** Shared by every stage for its whole life. */
export interface StageContext {
  audio: GameAudio;
  particles: Particles;
  /** prefers-reduced-motion: ambient motion (motes, glints) holds still. */
  still: boolean;
  /** The run's score; stages add points with a floating label where they were earned. */
  score: Score;
  /** The stunt combo (multiplier on stunt points). */
  combo: Combo;
}

/** What the stage draws into, per frame. */
export interface View {
  ctx: CanvasRenderingContext2D;
  painter: Painter;
  width: number;
  height: number;
  /** Seconds since the game started (ambient animation). */
  time: number;
  frame: number;
  /** Real seconds since the last drawn frame. */
  dt: number;
}

export interface StageHud {
  prompt: string;
  /** km/h, or null when not driving. */
  speed: number | null;
  /** Thruster tank 0 … 1, or null when not in a vehicle. */
  tank: number | null;
  /** Altitude in metres (launch only). */
  altitude: number | null;
  /** Hearts left on foot (null in a vehicle). */
  hearts: number | null;
  /** Seconds of thrust left in the tank (null without thrusters). */
  fuel: number | null;
  /** Seconds until the car touches down if the thrusters stop now (null on the ground). */
  landIn: number | null;
}

export interface Stage {
  readonly id: StageId;
  /** Sparks or cells collected / available. */
  readonly collected: number;
  readonly available: number;
  readonly cleanLandings: number;
  /** True once the stage's goal is reached. */
  readonly complete: boolean;
  /** 0 … 1 black fade over the view (a respawn), drawn by the game. */
  readonly fade: number;
  resize(width: number, height: number): void;
  step(dt: number, input: InputSnapshot): void;
  draw(view: View, alpha: number): void;
  hud(): StageHud;
  /** Back to the last checkpoint (the R key), fade and all. */
  respawn(): void;
}

/** Collectibles: hover, bob, get taken when something passes within reach. */
export class Pickups {
  readonly items: { x: number; y: number; taken: boolean; phase: number }[];

  constructor(points: readonly (readonly [number, number])[]) {
    this.items = points.map(([x, y], i) => ({ x, y, taken: false, phase: i * 1.7 }));
  }

  get taken(): number {
    return this.items.filter((item) => item.taken).length;
  }

  /** Takes every item within `reach` of (x, y); returns how many were taken. */
  collect(x: number, y: number, reach: number): number {
    let count = 0;
    for (const item of this.items) {
      if (!item.taken && Math.hypot(item.x - x, item.y - y) < reach) {
        item.taken = true;
        count++;
      }
    }
    return count;
  }
}

/** The last checkpoint at or behind x. */
export function checkpointBefore(checkpoints: readonly number[], x: number): number {
  let best = checkpoints[0];
  for (const c of checkpoints) if (c <= x) best = c;
  return best;
}
