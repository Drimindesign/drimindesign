import type { Combo, Score } from "../actors/score";
import type { GameAudio } from "../engine/audio";
import type { InputSnapshot } from "../engine/input";
import type { Painter } from "../pixel/painter";
import type { Particles } from "../pixel/particles";

export type StageId = "village" | "city" | "forest";

export const STAGE_ORDER: readonly StageId[] = ["village", "city", "forest"];

export const STAGE_TITLES: Record<StageId, { number: string; title: string; goal: string }> = {
  village: { number: "01", title: "Discover", goal: "Out of the village in the monsoon. Mud steals your grip, a bull rules the road, the bridges are broken." },
  city: { number: "02", title: "Build", goal: "Through the city by night. Jump the traffic, fly the broken flyovers, land the flips." },
  forest: { number: "03", title: "Launch", goal: "The forest road to the launch pad. Boars and wolves, ravines: reach the pad and lift off." },
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
  /** Camera and time effects for big moments. */
  fx: StageFx;
  /**
   * The 3D arena: asks to fight a barricade's guards there instead. Returns false when it can't
   * (no capable device, or no page to host it); otherwise the game pauses until `done(won)`.
   */
  arena?: { request(done: (won: boolean) => void): boolean };
}

export interface StageFx {
  /** A quick zoom-in that springs back: 0.03 a nudge, 0.1 a big hit. */
  punch(strength: number): void;
  /** Slow time to `scale` for `seconds` of real time (a crash). */
  slowmo(seconds: number, scale?: number): void;
  /** Hold the camera this close (1.1–1.2) for this frame: a fight on foot. */
  focus(zoom: number): void;
  /** A short phone vibration (ms), for hits felt in the hand. */
  buzz(ms: number): void;
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
  /** A spoken line on screen: who's talking and what they say (a GTA-style subtitle). */
  line?: { who: string; text: string } | null;
  /** A fight is on: the combat music plays. */
  combat?: boolean;
  /** km/h, or null when not driving. */
  speed: number | null;
  /** Thruster tank 0 … 1, or null when not in a vehicle. */
  tank: number | null;
  /** Altitude in metres (launch), or distance to the goal (Jupiter). */
  altitude: number | null;
  /** What the altitude gauge is called ("ALT" when omitted). */
  altitudeLabel?: string;
  /** Hearts left on foot (null in a vehicle). */
  hearts: number | null;
  /** Seconds of thrust left in the tank (null without thrusters). */
  fuel: number | null;
  /** Seconds until the car touches down if the thrusters stop now (null on the ground). */
  landIn: number | null;
  /** On foot or about to be: the get-out and sword pads show. */
  actions?: boolean;
  /** The truck's damage, 0 … 1 (road stages). */
  damage?: number;
  /** Booster charges in hand, and how many it can hold. */
  boosters?: { have: number; max: number };
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
  /** Releases what the stage holds outside the 2D canvas (the 3D stage's WebGL context). */
  dispose?(): void;
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
