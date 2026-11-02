import type { Combo, Score } from "../actors/score";
import type { GameAudio } from "../engine/audio";
import type { InputSnapshot } from "../engine/input";
import type { FigureLayer } from "../pixel/fighters-3d";
import type { Party } from "../actors/party";
import type { Painter } from "../pixel/painter";
import type { Particles } from "../pixel/particles";

export type StageId = "village" | "jungle" | "city" | "forest";

/** What the music is doing: driving, walking in the dark, a fight, a brute's fight. */
export type Mood = "drive" | "explore" | "fight" | "boss";

export const STAGE_ORDER: readonly StageId[] = ["village", "jungle", "city", "forest"];

/*
 * The story: Kachujin carries the Spark, a big idea, to the launch pad, to send it into orbit.
 * Mr. Grey's Copycats, who steal ideas instead of making their own, block every road.
 */
export const STAGE_TITLES: Record<StageId, { number: string; title: string; goal: string }> = {
  village: { number: "01", title: "The Spark", goal: "Mr. Grey's Copycats want the Spark. Get it out of the village before they shut the road." },
  jungle: { number: "02", title: "Into the Dark", goal: "The road is gone. Cross the night jungle on foot: swing the ropes, climb the cliffs, keep the wolves off. The truck waits on the far side." },
  city: { number: "03", title: "Copycat City", goal: "Grey's gang owns the city. Jump the traffic, fly the broken flyovers, break their gate." },
  forest: { number: "04", title: "Launch", goal: "The last road to the launch pad. Get past Grey's guards and send the Spark into orbit." },
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
  /** Where the 3D figures are drawn, over the game's canvas (null without a page: QA tools). */
  layer: FigureLayer | null;
  /** The run's team and what it has unlocked: it carries from stage to stage. */
  party: Party;
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
  /** Film bars across the top and bottom for this long (s): a scene being played out. */
  cinema(seconds: number): void;
  /** Frame the camera at exactly this zoom this frame (wider or closer than anything else asks). */
  frame(zoom: number): void;
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
  /** The camera's zoom about its pivot (art px), for anything drawn outside the 2D canvas. */
  zoom: number;
  pivot: { x: number; y: number };
  /** The game's own fade to black between stages (0 … 1), on top of the stage's. */
  fade: number;
}

export interface StageHud {
  prompt: string;
  /** The music's mood. */
  mood?: Mood;
  /** On foot with a weapon: the sword and weapon pads show. */
  armed?: boolean;
  /** The weapon in hand, and the Fire Sword (locked, ready, burning or recharging, and its charge 0 … 1). */
  weapon?: string;
  fire?: "locked" | "ready" | "burning" | "charging";
  fireCharge?: number;
  /** The team with her: each one's name and hearts, and whether it's still alive. */
  team?: readonly { name: string; hearts: number; alive: boolean }[];
  /** She's out of the truck (the controller shows the call-the-truck button). */
  foot?: boolean;
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
  /** Starts the stage already moving at this speed (m/s): carried over from the stage before. */
  rollIn?(speed: number): void;
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
