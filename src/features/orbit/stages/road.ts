import { CompanionSupport } from "../actors/companion-support";
import { drawDroppedPrisonKey, drawPrisonTransportDolly } from "./prisoner-mission-art";
import { CompanionNavigator } from "../actors/companion-navigation";
import type { RouteMapSnapshot, SquadOrder } from "../route-map-state";
import { PrisonerMission, type PrisonerMissionSave } from "./prisoner-mission";
import { separateBodies, type SolidBody } from "../engine/body-separation";
import { Boar, type BeastKind } from "../actors/boar";
import { Car, type CarEvent } from "../actors/car";
import { Crew } from "../actors/crew";
import { Explorer } from "../actors/explorer";
import { MASTER } from "../actors/arsenal";
import { MATES, Mate, Party, RALLY, WOUND, type MateKind } from "../actors/party";
import { POINTS, STUNTS } from "../actors/score";
import { FollowCamera, projector, type Camera, type ToScreen } from "../engine/camera";
import { CAR, CHARACTER, PLANETS, PPM } from "../engine/config";
import type { InputSnapshot } from "../engine/input";
import { hash } from "../engine/noise";
import { RoadTerrain, type RoadFeature } from "../engine/terrain";
import { City } from "../pixel/city";
import { Debris } from "../pixel/debris";
import { Fighters3D, type FigureLight, type SceneLight } from "../pixel/fighters-3d";
import { Village } from "../pixel/village";
import type { ExplorerId } from "../pixel/explorer-sprite";
import type { Painter } from "../pixel/painter";
import { CAVE, COAST, DAWN, JUNGLE, NIGHT, RIVER, SNOW, type Palette } from "../pixel/palette";
import { blit, CELL, glow, LAUNCH_PAD, TRAFFIC, type Sprite } from "../pixel/props";
import { World } from "../pixel/world";
import { stepBeasts } from "./beasts";
import { checkpointBefore, Pickups, type Mood, type Stage, type StageContext, type StageHud, type StageId, type View } from "./types";

interface TrafficSpec {
  x: number;
  /** Cruising speed (m/s); it stops for good at `until` (before a ramp or a gap). */
  speed: number;
  until: number;
  kind: "car" | "truck" | "rickshaw";
  color: string;
}

/**
 * A barricade across the road, held by Grey's Copycats: step out and they come at you, from
 * behind and over the wall, never all at once and never in the same order. Beat `enemies` of them
 * (at most `together` on you at a time, each one picked at random from `kinds`) and the wall comes down.
 */
export interface StopSpec {
  x: number;
  enemies: number;
  together: number;
  kinds: readonly BeastKind[];
  dialogue?: readonly Line[];
}

/** A hillside boulders come rolling down: from above `x1` down past `x0`, one every `every` seconds while she's on it. */
export interface BoulderZone {
  x0: number;
  x1: number;
  every: number;
}

/** Out of the dark as you pass `x`: `count` of `kinds` (picked at random), from ahead or behind. */
export interface AmbushSpec {
  x: number;
  count: number;
  kinds: readonly BeastKind[];
}

/** A log floating on a river: drifting back and forth over `span` (m) from `x`, at `speed` (m/s at its fastest). */
export interface LogSpec {
  x: number;
  span: number;
  speed: number;
}

export interface RoadConfig {
  /** Prison break: extract every authored prisoner before leaving. */
  rescueObjective?: boolean;
  id: StageId;
  scene: FigureLight;
  /** Crossed on foot: no truck until the far side, where it waits at the finish. */
  onFoot?: boolean;
  /** On foot with no truck at all: the level ends where she walks out of it. */
  truck?: boolean;
  /** Logs floating on the rivers. */
  logs?: readonly LogSpec[];
  /**
   * Walkways in the trees: a vine up a trunk at `x0`, then planks `above` (m) over the highest
   * ground under them, running to `x1`; a way above the danger on the path below.
   */
  walks?: readonly { x0: number; x1: number; above: number }[];
  /** Spark Hearts bring a taken teammate back: x and height above ground (m). */
  sparks?: readonly (readonly [number, number])[];
  /** Hillsides with boulders rolling down them. */
  boulders?: readonly BoulderZone[];
  /** What's said as the level opens (on foot), if anything. */
  opening?: readonly Line[];
  /** Surface gravity (m/s²); Earth's when omitted. */
  gravity?: number;
  seed: number;
  /** 0 flat street … 1 rolling forest road. */
  hills: number;
  /** The finish line (m): city limits, the launch pad, or the truck waiting at the jungle's edge. */
  finish: number;
  features: readonly RoadFeature[];
  checkpoints: readonly number[];
  /** Energy cells and stunt rings: x, height above the ground (m). */
  cells: readonly (readonly [number, number])[];
  rings: readonly (readonly [number, number])[];
  /** Things to smash on the road: crate stacks, market stalls, fences (x m, kind). */
  props?: readonly (readonly [number, PropKind])[];
  /** Barricades across the road (m): get out and fight the gang that holds it. */
  stops?: readonly StopSpec[];
  traffic: readonly TrafficSpec[];
  /** Beasts along the road: where each waits (m) and what it is. */
  beasts: readonly (readonly [number, BeastKind])[];
  /** Packs that come out of the dark as you pass. */
  ambushes?: readonly AmbushSpec[];
  /** Ropes hanging over ravines from the branches above (x, m). */
  ropes?: readonly number[];
  /** Prisoners in cages (x, m, and who), each with a torch beside it. */
  cages?: readonly (readonly [number, MateKind])[];
  /** Torches on poles (x, m): real light on whoever passes. */
  torches?: readonly number[];
}

/** Below this height the car has fallen into a gap (m). */
const FALL_LIMIT = -14;
/** Ring radius (m): fly within RING_HIT of its centre to pass through. */
const RING_RADIUS = 1.7;
const RING_HIT = 1.4;
/** Traffic is this tall (m) for collisions and near misses. */
const HEIGHT = { car: 1.45, truck: 3.1, rickshaw: 1.75 } as const;
const LENGTH = { car: 4.4, truck: 7, rickshaw: 2.8 } as const;
export type PropKind = "crates" | "stall" | "fence";

/** A spoken line: who says it, the recording's name (under /audio/voice/; empty for subtitles only), the words, and when (s after it starts). */
export interface Line {
  who: string;
  clip: string;
  text: string;
  at: number;
}
/** How long a line stays on screen (s), and the hero's line once a road is cleared. */
const LINE_TIME = 2.6;
const CLEARED: Line = { who: "Kachujin", clip: "hero_clear", text: "Road's clear. Let's move.", at: 0 };
const JUNGLE_LINES: readonly Line[] = [
  { who: "Kachujin", clip: "", text: "No road. Then I walk.", at: 0.8 },
  { who: "Crew", clip: "", text: "We'll have the truck on the far side. Keep that lantern lit.", at: 3.6 },
];
/** The hero's answer to each prisoner she frees, and her words over one that falls. */
const ANSWERS: Record<MateKind, string> = {
  knight: "Glad to have you. Stay close.",
  barbarian: "Thanks. Let's make some noise.",
  mage: "Fire. I like it.",
  ranger: "Then keep them off my back.",
  rogue: "Sure you would. Come on.",
  dog: "Good dog. Let's go.",
  giant: "Then carry me, big one. We've a long way to go.",
};
/** A teammate dragged off by Grey's men (they turn up caged later), and one rescued back. */
const TAKEN = (name: string): string => `They took the ${name}! I'll come back for you!`;
const RETURNED = { thanks: "You came back for me!", answer: "Always." } as const;
/**
 * Revive works from anywhere: a downed teammate anywhere on the level gets up at once; one Grey's
 * men took comes back running in from behind her (free with a Spark Heart, otherwise every
 * `recharge` s). The Mage, if she's with her, says the words.
 */
const MAGE_REVIVE = { recharge: 25, line: "Get up! The light is with you." } as const;
const HEART_LINE = "I'm back! Let's go.";
/** What she rides: how high she sits (m), his stride and spring (as multiples of hers). */
const MOUNTS: Partial<Record<MateKind, { height: number; stride: number; spring: number }>> = { giant: { height: 2.05, stride: 1.25, spring: 1.4 } };
/** A villager freed (her team already has one of their kind): their thanks, and hers. */
const VILLAGER = { thanks: "Thank you! I'll find my way home.", answer: "Run. Don't look back." } as const;
/** Toys a villager can be (Gorr's cage, once he's with her, holds one of these). */
const TOY_KINDS: readonly MateKind[] = ["knight", "barbarian", "mage", "ranger", "rogue"];
/**
 * Boulders: their radius (m), the speed they roll down at (m/s), how hard they hit (a heavy blow:
 * she's knocked flat; three of a mate's health), and the points for smashing one with a blade.
 */
const BOULDER = { radius: 0.5, speed: 5.5, damage: 3, points: 60 } as const;
/** A cage takes this many blows to break; freeing who's inside holds the camera on them this long (s). */
const CAGE = { blows: 3, scene: 3.4 } as const;
/** A torch's flame: its height on the pole (m), its colour, and how strongly it lights a figure. */
const TORCH = { height: 1.7, color: 0xff8a3a, power: 7 } as const;
/** Camera framing: hanging from a rope (wide, to see the far side), hauling up a ledge, and freeing a prisoner. */
const ROPE_ZOOM = 1.02;
const CLIMB_ZOOM = 1.3;
const RESCUE_ZOOM = 1.42;
/**
 * The camera, directed like a film. Lead room: it looks this far ahead of her (m) when she moves,
 * less when she stands. In a fight it frames her and whoever she's fighting (zoom between `close`
 * and `wide`), leaning toward them. Running it opens out a touch (speed); standing still a while
 * it slowly pushes in. A kill that ends a fight cuts to the body in slow motion; a new place opens
 * on a wide shot ahead of her before settling on her.
 */
const DIRECTOR = { lead: 2.2, leadIdle: 1, fightClose: 1.42, fightWide: 1.08, run: 0.08, pushIn: 1.06, idle: 2.5, kill: { zoom: 1.5, time: 1, slow: 0.2 }, open: { ahead: 10, zoom: 1, time: 2.3 } } as const;
/** A rope is a chain of this many links (verlet), stepped this many times a step to hold its length. */
const ROPE_LINKS = 6;
const ROPE_ITERATIONS = 10;
/** Riding Gorr: she sits this high (m) on his shoulders, and he runs and leaps this much further than she does. */
const RIDE = { height: 2.05, stride: 1.25, spring: 1.4 } as const;
/**
 * A conversation, played like a film: the world holds still, the camera closes into a two-shot
 * (between `close` and `wide`, leaning `lean` of the way toward whoever's speaking), the backdrop
 * goes soft behind them; each line holds for its words (`base` s and `perChar` s a letter, at
 * least `least`), and a press moves on.
 */
const TALK = { close: 1.5, wide: 1.2, lean: 0.25, base: 0.7, perChar: 0.055, least: 1.7 } as const;
/**
 * Bodies don't pass through each other: how wide each kind is (m, half its width at the hips),
 * and how much of the push each takes (heavier ones barely move).
 */
const BODY: Partial<Record<string, { half: number; mass: number }>> = {
  hero: { half: 0.32, mass: 60 },
  raider: { half: 0.36, mass: 90 },
  brute: { half: 0.48, mass: 125 },
  chief: { half: 0.58, mass: 170 },
  wolf: { half: 0.42, mass: 45 },
  dog: { half: 0.32, mass: 25 },
  boar: { half: 0.4, mass: 90 },
};

/** Lines for the moments of the fight. */
const CRY = { down: "Help! I'm down!", revive: "I've got you. Get up!", master: "Enough!", ride: "Up you go, small queen." } as const;

/**
 * Breakables: mass (kg, for the momentum the car loses), the speed (m/s) below which the car just
 * stops against it, size (m), damage to the truck, points, and the colours its pieces fly in.
 */
const PROPS: Record<PropKind, { mass: number; breakAt: number; width: number; height: number; damage: number; points: number; colors: readonly string[] }> = {
  crates: { mass: 70, breakAt: 1.5, width: 1.7, height: 1.7, damage: 0.03, points: 40, colors: ["#8a6440", "#6b4b2e", "#a47a4e"] },
  stall: { mass: 240, breakAt: 6, width: 3, height: 2.4, damage: 0.08, points: 80, colors: ["#6b4b2e", "#e0481c", "#f1e6d2", "#3f7a5a", "#d9a91c"] },
  fence: { mass: 45, breakAt: 1.5, width: 3, height: 1.1, damage: 0.02, points: 25, colors: ["#7a5c43", "#5a4232"] },
};
/** How much damage reaching a new checkpoint repairs. */
const REPAIR = 0.5;
/** Logs a standing barricade shows, its height (m), and the speed (m/s) above which hitting it wrecks the car. */
const BARRICADE = { logs: 4, height: 6, wreck: 7 } as const;
/** Within this distance before a barricade (m), the car can be left, and stepping out starts the fight. */
const STOP_ZONE = 16;
/**
 * The fight at a barricade: how far back from the wall the hero is held while it lasts (m); the
 * first arrival (s after stepping out) and the gap between arrivals (s, at least `gap` plus up to
 * `spread` more); how often one comes over the wall rather than from behind; and how long after
 * the last one falls she heads back to the truck (s).
 */
const ARENA = { depth: 18, first: 1.6, gap: 0.8, spread: 2.2, overWall: 0.5, boardIn: 1.8 } as const;
/** Camera zoom: out of the truck, in a fight on foot, and walking the jungle (which needs to see across a ravine). */
const FOOT_ZOOM = 1.32;
const FIGHT_ZOOM = 1.28;
const JUNGLE_ZOOM = 1.15;
/** Calling the truck: it comes down this far ahead of her (m), from this high (m), if it's further than this (m). */
const CALL = { ahead: 4.5, height: 9, farther: 8 } as const;
/** Brake assist before a barricade: how far out it starts (m), the speed allowed per metre left (1/s), its braking (m/s²), the crawl at the wall (m/s). */
const STOP_ASSIST = { range: 40, slope: 0.55, brake: 18, crawl: 1.2 } as const;
/** The finale: the launch rig lifts the car off the pad for this long (s) before the stage ends. */
const LIFTOFF_TIME = 3.2;
/** A rope over a ravine: its branch this high above the ravine's lip (m), the rope this long. */
const ROPE = { height: 8.2, length: 6.4 } as const;
/** The lantern in the dark: full light within `inner` (m), darkness `dark` beyond `outer`. */
const LANTERN = { inner: 3, outer: 13, dark: 0.82 } as const;
const FIREFLIES = 26;

interface Traffic extends TrafficSpec {
  at: number;
  moving: boolean;
  passed: boolean;
  sprite: Sprite;
}

interface Barricade {
  x: number;
  /** Logs still standing (they come down as its guards fall). */
  logs: number;
  broken: boolean;
}

/** The fight at a barricade as it plays out. */
interface Encounter {
  stop: Barricade;
  spec: StopSpec;
  started: boolean;
  /** Still to come, and how long until the next one does (s). */
  left: number;
  next: number;
  enemies: Boar[];
  cleared: boolean;
}

interface Cage {
  x: number;
  blows: number;
  broken: boolean;
  mate: Mate;
  /** Shaking from the last blow (s). */
  shake: number;
}

interface Ambush {
  spec: AmbushSpec;
  sprung: boolean;
  /** Arrivals still to come: how long until each (s) and what it is. */
  queue: { in: number; kind: BeastKind }[];
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/*
 * A night stage. The road stages are car first: the car's physics decides every bump, flight and
 * fall; on top of it sit the stunts (flips judged on landing, a combo multiplier), traffic to jump
 * (near misses pay, collisions wreck), stunt rings that boost and refuel, gaps sized so the tank
 * makes you choose, and barricades where the hero gets out and fights the gang that holds them.
 * The jungle is crossed on foot: ropes over the ravines, rock steps to climb, packs out of the dark,
 * and the truck waiting at the far side. Wrecks and falls go back to the last checkpoint.
 */
/** Where each place's night falls dark around her lantern; and the river's surface below its banks (m). */
const DARK: ReadonlySet<string> = new Set(["jungle", "caves", "ruins"]);
const WATER_DEPTH = 1.1;
/** Each place's painted backdrop. */
const BACKDROP: Partial<Record<string, Palette>> = { forest: NIGHT, jungle: JUNGLE, river: RIVER, hills: DAWN, caves: CAVE, ruins: NIGHT, coast: COAST, snow: SNOW };

export class RoadStage implements Stage {
  readonly id: StageId;
  private readonly terrain: RoadTerrain;
  private readonly world: World | null;
  private readonly city: City | null;
  private readonly village: Village | null;
  private readonly camera = new FollowCamera(480, 270);
  private readonly crew: Crew;
  private readonly cells: Pickups;
  private readonly rings: { x: number; y: number; taken: boolean }[];
  private readonly traffic: Traffic[];
  private readonly boars: Boar[];
  private readonly stops: Barricade[];
  private readonly encounters: Encounter[];
  private readonly ambushes: Ambush[];
  private readonly ropes: { x: number; y: number; length: number; links: { x: number; y: number; px: number; py: number }[] }[];
  private readonly cages: Cage[];
  /** Travel direction changes between encounters, so a combat turn never flips the whole squad. */
  private marchFacing = 1;
  private unlockRequested = false;
  private readonly torches: number[];
  /** The team with her (freed here or brought from earlier stages). */
  private readonly mates: Mate[] = [];
  private readonly navigator: CompanionNavigator;
  private readonly mission: PrisonerMission | null;
  private missionSave: PrisonerMissionSave | null = null;
  private keyCarrier: Boar | null = null;
  /** Shots in flight from the team, drawn as streaks: arrows and the Mage's fire (from, to, s left). */
  private readonly shots: { x0: number; y0: number; x1: number; y1: number; left: number; fire: boolean }[] = [];
  /** Seconds left of a held camera: on a freed prisoner, or over one that fell. */
  private hold = 0;
  private holdZoom = 1;
  private wasOnRope = false;
  /** The walkways (where their planks lie) and the vines up to them. */
  private readonly walks: { x0: number; x1: number; y: number }[];
  /** Spark Hearts lying along the route. */
  private readonly sparks: Pickups;
  /** Boulders rolling down the hills, and when the next one comes (s). */
  private boulders: { x: number; y: number; vx: number; vy: number; spin: number; angle: number }[] = [];
  private nextBoulder = 0;
  /** A conversation under way: its lines, which is being said, how long it has left (s), and where the camera frames it. */
  /** The backdrop's soft focus while a conversation plays (0 … 1, eased in and out). */
  private focus = 0;
  private talk: { lines: readonly Line[]; index: number; left: number; focus: { x: number; y: number }; zoom: number } | null = null;
  /** Villagers freed and on their way home (drawn until they're gone). */
  private readonly leaving: Mate[] = [];
  /** The camera: a held shot (a kill, a new place) it frames instead of her, its lead room ahead of her, the fight's centre, how long she's stood still. */
  private shot: { x: number; y: number; zoom: number; left: number } | null = null;
  private lead = 0;
  private fightAt: number | null = null;
  private still = 0;
  /** The last enemy to fall (for the kill shot), and the Master Stroke's shockwaves spreading (where, how old). */
  private lastKill: Boar | null = null;
  private waves: { x: number; y: number; t: number }[] = [];
  /** Reviving a downed mate (seconds left), and Gorr carrying her. */
  private channel: { mate: Mate; left: number } | null = null;
  private mount: Mate | null = null;
  /** E pressed this step (to help a downed friend up), and the stage's own clock (s, for the wind on the ropes). */
  private reviveAsked = false;
  private jumpAsked = false;
  private clock = 0;
  private readonly fighters: Fighters3D;
  private readonly debris = new Debris();
  private readonly props: { x: number; kind: PropKind; broken: boolean }[];
  private readonly onFoot: boolean;
  private readonly truck: boolean;
  private readonly ownsFigures: boolean;
  /** Logs floating on the river (where each is now, and its drift). */
  private readonly logs: { spec: LogSpec; x: number; px: number; phase: number; vx: number }[];
  /** Falling snow (positions in the view, art px), on the snowy pass. */
  private readonly flakes: { x: number; y: number; s: number }[] = [];
  /** The scene being spoken: its lines, how long since it began (s), and how many have played. */
  private scene: { lines: readonly Line[]; t: number; next: number } | null = null;
  private line: { who: string; text: string; left: number } | null = null;
  /** After a barricade falls: seconds until she heads back to the truck, or -1. */
  private boardIn = -1;
  private readonly sprites = { cell: CELL(), pad: LAUNCH_PAD() };
  private reached: number;
  private respawnIn = 0;
  private width = 480;
  private height = 270;
  private done = false;
  /** Seconds into the lift-off from the pad, or -1. */
  private liftoff = -1;
  fade = 0;
  private readonly gravity: number;

  constructor(
    private readonly context: StageContext,
    look: ExplorerId,
    private readonly config: RoadConfig,
  ) {
    this.id = config.id;
    this.onFoot = config.onFoot === true;
    this.terrain = new RoadTerrain(config.seed, config.features, config.hills);
    const backdrop = BACKDROP[config.scene];
    this.world = backdrop ? new World(this.terrain, backdrop) : null;
    this.city = config.scene === "city" ? new City(this.terrain) : null;
    this.village = config.scene === "village" ? new Village(this.terrain, config.features) : null;
    // The run's figures carry over from level to level; only without them (QA tools) does a level make its own.
    this.fighters = context.figures ?? new Fighters3D(context.layer, config.scene);
    this.fighters.setLight(config.scene);
    this.ownsFigures = context.figures === null;
    this.gravity = config.gravity ?? PLANETS.earth.gravity;
    const explorer = new Explorer(4, this.terrain, look, context.audio, context.particles);
    // No truck on this level: it waits far off where it's never seen.
    this.truck = config.truck !== false;
    const car = new Car(!this.truck ? -1000 : this.onFoot ? config.finish : 6, this.terrain, context.audio, context.particles);
    this.crew = new Crew(explorer, car, this.terrain, context.audio);
    explorer.body.platforms = () => this.platforms();
    if (this.onFoot) {
      // The truck waits at the far side; the crossing is made on foot, and there's nothing to call down.
      explorer.place(4);
      // Said as she walks in (never a pause at the start of a level).
      this.scene = { lines: config.opening ?? JUNGLE_LINES, t: 0, next: 0 };
    } else {
      this.crew.onCall = () => void this.callCar();
      this.crew.seat();
    }
    this.cells = new Pickups(config.cells.map(([x, h]) => [x, Math.max(0, this.terrain.height(x)) + h] as const));
    this.rings = config.rings.map(([x, h]) => ({ x, y: Math.max(0, this.terrain.height(x)) + h, taken: false }));
    this.traffic = config.traffic.map((t) => ({ ...t, at: t.x, moving: true, passed: false, sprite: TRAFFIC(t.kind, t.color) }));
    this.boars = config.beasts.map(([x, kind]) => new Boar(x, this.terrain, kind));
    this.stops = (config.stops ?? []).map((s) => ({ x: s.x, logs: BARRICADE.logs, broken: false }));
    this.encounters = (config.stops ?? []).map((spec, i) => ({ stop: this.stops[i], spec, started: false, left: spec.enemies, next: 0, enemies: [], cleared: false }));
    this.ambushes = (config.ambushes ?? []).map((spec) => ({ spec, sprung: false, queue: [] }));
    this.ropes = (config.ropes ?? []).map((x) => {
      // Hung from a branch above the ravine it crosses, measured from the higher of its two lips.
      const gap = config.features.find((f) => f.kind === "ravine" && x > f.x && x < f.x + f.size);
      const lip = gap ? Math.max(this.terrain.height(gap.x - 0.6), this.terrain.height(gap.x + gap.size + 0.6)) : this.terrain.height(x);
      const y = lip + ROPE.height;
      const links = Array.from({ length: ROPE_LINKS + 1 }, (_, i) => ({ x, y: y - (ROPE.length * i) / ROPE_LINKS, px: x, py: y - (ROPE.length * i) / ROPE_LINKS }));
      return { x, y, length: ROPE.length, links };
    });
    this.props = (config.props ?? []).map(([x, kind]) => ({ x, kind, broken: false }));
    this.sparks = new Pickups((config.sparks ?? []).map(([x, h]) => [x, Math.max(0, this.terrain.height(x)) + h] as const));
    this.walks = (config.walks ?? []).map((w) => {
      let top = -Infinity;
      for (let x = w.x0 - 1; x <= w.x1; x += 0.5) top = Math.max(top, this.terrain.height(x));
      return { x0: w.x0, x1: w.x1, y: top + w.above };
    });
    this.logs = (config.logs ?? []).map((spec, i) => ({ spec, x: spec.x, px: spec.x, phase: i * 1.9, vx: 0 }));
    if (config.scene === "snow") for (let i = 0; i < 70; i++) this.flakes.push({ x: Math.random() * 480, y: Math.random() * 270, s: 0.4 + Math.random() * 0.8 });
    const support = new CompanionSupport(this.terrain, {
      features: config.features, gravity: this.gravity, walks: this.walks,
      wantsCanopy: () => explorer.onVine || this.walks.some((w) => explorer.body.x >= w.x0 && explorer.body.x <= w.x1 && Math.abs(explorer.body.y - w.y) < 1),
      logs: this.logs.map((log) => ({ homeX: log.spec.x, top: this.waterLevel(log.spec.x) + 0.25, center: (secondsAhead: number): number => secondsAhead === 0 ? log.x : log.spec.x + log.spec.span * (0.5 - 0.5 * Math.cos(log.phase + secondsAhead * log.spec.speed / Math.max(0.5, log.spec.span))) })),
    });
    this.navigator = new CompanionNavigator(this.terrain, { features: config.features, ropes: this.ropes, walks: config.walks ?? [], gravity: this.gravity }, support);
    this.mission = config.rescueObjective ? new PrisonerMission({ extractionX: config.finish }) : null;
    if (this.mission) { this.keyCarrier = new Boar(55, this.terrain, "raider"); this.boars.push(this.keyCarrier); this.missionSave = this.mission.checkpoint(); }
    // Her team so far comes with her; prisoners not yet freed wait in their cages.
    explorer.carried = context.party.carried;
    explorer.fireUnlocked = context.party.fire;
    for (const member of context.party.members) if (member.alive) this.mates.push(new Mate(member, explorer.body.x - 2 - this.mates.length * 1.6, this.terrain, false, this.navigator));
    // Each cage holds a prisoner who'll join her; if her team already has one of their kind, a villager who'll go home.
    const taken = [...context.party.taken];
    this.cages = (config.cages ?? []).map(([x, kind]) => {
      const held = taken.shift();
      if (held) return { x, blows: CAGE.blows, broken: false, shake: 0, mate: new Mate(held, x, this.terrain, true, this.navigator) };
      const villager = kind === "giant" ? context.party.has(kind) : context.party.members.filter((m) => m.alive).length >= 10;
      const who = villager && kind === "giant" ? TOY_KINDS[Math.floor(x) % TOY_KINDS.length] : kind;
      const mate = new Mate(Party.member(who), x, this.terrain, true, this.navigator);
      mate.visitor = villager;
      return { x, blows: CAGE.blows, broken: false, shake: 0, mate };
    });
    this.torches = [...(config.torches ?? []), ...this.cages.map((c) => c.x - 1.6)];
    this.reached = config.checkpoints[0];
    this.camera.snap(this.onFoot ? 4 : 6, this.terrain.height(6), this.terrain.height(6));
  }

  get collected(): number {
    return this.cells.taken + this.rings.filter((r) => r.taken).length;
  }

  get available(): number {
    return this.cells.items.length + this.rings.length;
  }

  get cleanLandings(): number {
    return this.crew.car.cleanLandings;
  }

  get complete(): boolean {
    return this.done;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.setView(width, height);
    this.world?.resize(width, height, this.camera.y);
    this.city?.resize(width, height);
    this.village?.resize(width, height);
    this.fighters.resize(width, height);
  }

  dispose(): void {
    // The run's figures go back to their pool for the next level; a level's own are let go.
    if (this.ownsFigures) this.fighters.dispose();
    else this.fighters.reset();
  }

  /* Carried over from the stage before: the truck comes in already rolling. */
  rollIn(speed: number): void {
    // On foot she walks straight in at the pace she had (a run at most); in the truck it keeps rolling.
    if (this.onFoot) {
      const b = this.crew.explorer.body;
      b.vx = Math.max(0, Math.min(4.8, speed));
      b.facing = 1;
      return;
    }
    if (this.crew.mode !== "car") return;
    this.crew.car.vehicle.vx = speed;
  }

  /** How fast she (or the truck) is going (m/s), to carry into the next level. */
  momentum(): number {
    return this.crew.mode === "car" ? this.crew.car.vehicle.vx : this.crew.explorer.body.vx;
  }

  /** The first barricade still standing within reach ahead of x (m), if any. */
  private stopAhead(x: number, within: number): Barricade | undefined {
    return this.stops.find((s) => !s.broken && s.x - x > -1 && s.x - x < within);
  }

  /** The barricade fight going on now, if any. */
  private get fight(): Encounter | undefined {
    return this.encounters.find((e) => e.started && !e.cleared);
  }

  /** Half the width of the view at fight zoom (m): enemies come on from just past its edge. */
  private get reachOfView(): number {
    return this.width / PPM / 2 / FIGHT_ZOOM;
  }

  step(dt: number, input: InputSnapshot): void {
    this.fade = Math.max(0, this.fade - dt * 1.6);
    if (this.done) return;
    if (this.talk) {
      this.stepTalk(dt, input);
      return;
    }
    const car = this.crew.car;
    const v = car.vehicle;
    if (this.liftoff >= 0) {
      this.stepLiftoff(dt, input);
      return;
    }
    this.stepMission(dt, input);
    // Reviving a downed mate: she kneels to it, still, until it's back up.
    if (this.channel) {
      input = { ...input, move: 0, jumpPressed: false, attackPressed: false, interactPressed: false };
      this.channel.left -= dt;
      if (this.channel.left <= 0) {
        this.channel.mate.revive();
        this.speak({ who: "Kachujin", clip: "", text: CRY.revive, at: 0 });
        this.channel = null;
      }
    }
    this.reviveAsked = input.interactPressed && !this.mount;
    const party = this.context.party;
    party.reviveRecharge = Math.max(0, party.reviveRecharge - dt);
    if (input.revivePressed) this.revive();
    this.stepRescuePickups();
    this.jumpAsked = input.jumpPressed;
    this.stepMount(input);
    // The river's logs move first, so she rides each where it is this step (no lag, no judder).
    this.stepLogs(dt);
    // Stopped anywhere, the truck can be left (to fight, or to walk); on foot you climb back in at the door.
    this.crew.step(dt, this.gravity, input, { board: this.truck, alight: !this.onFoot });
    if (this.crew.explorer.shockwave) this.masterStroke();
    this.stepFire();
    for (const w of this.waves) w.t += dt;
    this.waves = this.waves.filter((w) => w.t < 0.8);
    this.context.particles.update(dt, this.terrain, this.gravity);
    this.context.combo.update(dt, v.grounded);
    this.stepStops(dt);
    this.stepEncounters(dt);
    this.stepAmbushes(dt);
    this.stepRopes(dt);
    this.stepBoulders(dt);
    this.stepCages(dt);
    this.stepMates(dt);
    this.stepProps();
    this.stepDialogue(dt);
    this.debris.update(dt, this.terrain, this.gravity);
    if (this.crew.mode === "car") this.debris.shove(v.x, v.y, v.vx);
    scoreCarEvents(car.drainEvents(), car, this.context);

    if (car.wrecked > 0 && this.respawnIn === 0) this.respawnIn = car.wrecked;
    if (this.respawnIn > 0) {
      this.respawnIn = Math.max(0, this.respawnIn - dt);
      if (this.respawnIn === 0) this.respawn();
      return;
    }

    // Progress is the truck's on the road, the hero's on foot.
    const e = this.crew.explorer.body;
    const foot = this.onFoot && this.crew.mode !== "car";
    const at = foot ? { x: e.x, grounded: e.grounded } : { x: v.x, grounded: v.grounded && v.upright };
    for (const c of this.config.checkpoints) {
      if (at.x >= c && at.grounded && c > this.reached) {
        this.reached = c;
        if (this.mission) this.missionSave = this.mission.checkpoint();
        // Each new checkpoint patches the truck up.
        if (!this.onFoot && car.damage > 0.05) {
          car.repair(REPAIR);
          this.context.score.add(0, "Repaired", v.x, v.y + 2.5);
        }
      }
    }
    const reach = foot ? this.crew.explorer.centre : { x: v.x, y: v.y };
    const got = this.cells.collect(reach.x, reach.y, foot ? 1.2 : 1.6);
    if (got > 0) {
      this.context.audio.pickup();
      this.context.score.add(POINTS.cell * got, "Cell", reach.x, reach.y + 1.5);
      v.tank = Math.min(CAR.thrustTank, v.tank + CAR.thrustTank / 3);
    }
    this.stepRings();
    this.stepTraffic(dt);
    this.stepBoars(dt);
    this.separate();
    if (this.onFoot) {
      // Fell into a ravine or the river: back to the last checkpoint. At the far side, into the truck and on (or just on).
      if (e.y < FALL_LIMIT && this.crew.mode === "foot") this.respawn();
      if (this.crew.mode === "foot" && this.inWater(e.x, e.y)) {
        this.context.particles.dust(e.x, e.y + 0.5, 0, 30, 1.6);
        this.context.audio.land(0.8);
        this.respawn();
      }
      if (!this.truck) {
        if (e.x >= this.config.finish && this.rescueComplete()) {
          this.context.audio.complete();
          this.done = true;
        }
        return;
      }
      if (this.crew.mode === "foot" && e.grounded && Math.abs(e.x - car.door.x) < CHARACTER.doorReach * 1.5) this.crew.board();
      if (this.crew.mode === "car") {
        this.context.audio.complete();
        this.done = true;
      }
      return;
    }
    if (v.y < FALL_LIMIT) this.respawn();
    if (v.x >= this.config.finish && v.grounded && this.rescueComplete()) {
      this.context.audio.complete();
      // The forest road ends on the launch pad: the car lifts off. Elsewhere the stage just ends.
      if (this.config.scene === "forest") {
        this.liftoff = 0;
        this.context.audio.ignition();
      } else {
        this.done = true;
      }
    }
  }

  private rescueComplete(): boolean {
    if (!this.config.rescueObjective) return true;
    if (this.mission) {
      const cage = this.cages[0];
      const prisoner = this.mates.find((m) => m.member === cage?.mate.member);
      this.mission.updatePrisoner({ alive: prisoner?.member.alive ?? false, down: prisoner?.state === "wounded" || !prisoner?.active, x: prisoner?.x ?? Number.NaN });
      return this.mission.extract(this.crew.mode === "car" ? this.crew.car.vehicle.x : this.crew.explorer.body.x);
    }
    return this.cages.every((c) => c.broken && this.mates.some((m) => m.member === c.mate.member && m.active && Math.abs(m.x - this.config.finish) < 45));
  }

  /* Rings: fly through the middle for points, a burst of speed and a third of a tank. */
  private stepRings(): void {
    const v = this.crew.car.vehicle;
    for (const ring of this.rings) {
      if (ring.taken || Math.abs(ring.x - v.x) > RING_HIT || Math.abs(ring.y - v.y) > RING_HIT) continue;
      ring.taken = true;
      const combo = this.context.combo;
      combo.add(1);
      v.vx += 4;
      v.tank = Math.min(CAR.thrustTank, v.tank + CAR.thrustTank / 3);
      this.context.audio.pickup();
      this.context.score.add(STUNTS.ring * combo.multiplier, `Ring ×${combo.multiplier}`, ring.x, ring.y + 2);
      this.context.fx.punch(0.03);
      if (this.crew.car.vehicle.gainBooster()) this.context.score.add(0, "+1 Booster", ring.x, ring.y + 3.2);
    }
  }

  /* Traffic: drives on, stops for good before the next ramp; jump it (a near miss pays), hit it and you wreck. */
  private stepTraffic(dt: number): void {
    const car = this.crew.car;
    const v = car.vehicle;
    for (const t of this.traffic) {
      if (t.moving) {
        // Drivers brake: for a barricade across the road, and for the player stopped ahead.
        const front = t.at + LENGTH[t.kind] / 2;
        const wall = this.stops.find((stop) => !stop.broken && stop.x > front - 1);
        const until = Math.min(t.until, wall ? wall.x - LENGTH[t.kind] / 2 - 1 : Infinity);
        const playerAhead = v.x > t.at && v.x - 2.4 - front < 2;
        if (!playerAhead) t.at = Math.min(until, t.at + t.speed * dt);
        if (t.at >= t.until) t.moving = false;
      }
      const ground = this.terrain.height(t.at);
      const top = ground + HEIGHT[t.kind];
      const reach = LENGTH[t.kind] / 2 + 2.1;
      const dx = v.x - t.at;
      const bottom = v.y - 0.55;
      if (Math.abs(dx) < reach && bottom < top - 0.15 && v.y > ground - 0.5 && car.wrecked === 0) {
        car.crash();
        this.context.combo.break();
        continue;
      }
      // Clearing it in the air, close: a near miss.
      if (!t.passed && dx > 0 && Math.abs(dx) < reach && !v.grounded && bottom >= top - 0.15 && bottom - top < 1.8) {
        t.passed = true;
        const combo = this.context.combo;
        combo.add(1);
        this.context.audio.pickup();
        this.context.score.add(STUNTS.nearMiss * combo.multiplier, `Near miss ×${combo.multiplier}`, t.at, top + 1.5);
        this.context.fx.punch(0.03);
        if (v.gainBooster()) this.context.score.add(0, "+1 Booster", t.at, top + 2.7);
      }
    }
  }

  private stepBoars(dt: number): void {
    // Out of hearts on foot: back on your feet (beside the truck, or at the last checkpoint in the jungle), hearts restored.
    const events = {
      down: (mate: Mate): void => {
        // A friend down: a beat of slow motion and its cry; she has a few seconds to reach it.
        this.speak({ who: mate.spec.name, clip: "", text: CRY.down, at: 0 });
        this.context.fx.slowmo(0.35, 0.4);
        this.context.fx.punch(0.06);
      },
      kill: (beast: Boar): void => {
        this.lastKill = beast;
      },
      heavy: (): void => {
        this.context.fx.shake(0.5);
        this.context.fx.roll(0.012);
      },
    };
    const killsBefore = this.lastKill;
    if (stepBeasts(this.boars, this.crew, this.context, dt, this.gravity, this.mates, events)) {
      if (this.onFoot) {
        this.respawn();
      } else {
        this.context.audio.respawn();
        this.fade = 1;
        this.crew.explorer.place(this.crew.car.door.x - 1.5);
        this.crew.explorer.heal();
      }
    }
    const e = this.crew.explorer.body;
    // The kill that ends a fight: the camera cuts to the body as it falls, in slow motion.
    if (this.lastKill && this.lastKill !== killsBefore && !this.shot) {
      const k = this.lastKill;
      const left = this.boars.some((b) => b.active && b !== k && Math.abs(b.x - e.x) < 14);
      if (!left) {
        this.shot = { x: (k.x + e.x) / 2, y: k.y + 1, zoom: DIRECTOR.kill.zoom, left: DIRECTOR.kill.time };
        this.context.fx.slowmo(DIRECTOR.kill.time, DIRECTOR.kill.slow);
        this.context.fx.cinema(DIRECTOR.kill.time + 0.6);
        this.context.fx.shake(0.8);
      } else {
        this.context.fx.punch(0.06);
      }
    }
    if (this.crew.mode === "car") return;
    const hero = this.crew.explorer;
    // The camera, like a film's: wide on a rope (to see the far side) with a beat of slow motion as
    // she lets go; close on a haul up a ledge; held on a freed prisoner or a fallen friend; in on a
    // fight; close on her out of the truck; a little wider walking the jungle.
    const onRope = hero.ropeAnchor !== null;
    if (this.wasOnRope && !onRope && e.vy > 0) this.context.fx.slowmo(0.3, 0.5);
    this.wasOnRope = onRope;
    // A fight is framed to hold her and whoever she's fighting, leaning toward them.
    const near = this.boars.filter((b) => b.active && Math.abs(b.x - e.x) < 10);
    const fighting = this.fight !== undefined || near.length > 0;
    this.fightAt = near.length > 0 ? near.reduce((sum, b) => sum + b.x, 0) / near.length : null;
    const spread = near.reduce((most, b) => Math.max(most, Math.abs(b.x - e.x)), 0);
    const viewWidth = this.width / PPM;
    const fit = Math.max(DIRECTOR.fightWide, Math.min(DIRECTOR.fightClose, viewWidth / (2 * spread + 6)));
    this.still = Math.abs(e.vx) < 0.2 && e.grounded ? this.still + 1 / 120 : 0;
    const running = Math.min(1, Math.abs(e.vx) / 4.8);
    const calm = (this.onFoot ? JUNGLE_ZOOM : FOOT_ZOOM) * (1 - DIRECTOR.run * running) * (this.still > DIRECTOR.idle ? DIRECTOR.pushIn : 1);
    if (this.shot) this.context.fx.frame(this.shot.zoom);
    else if (this.hold > 0) this.context.fx.frame(this.holdZoom);
    else if (onRope) this.context.fx.frame(ROPE_ZOOM);
    else if (e.climb >= 0) this.context.fx.frame(CLIMB_ZOOM);
    else if (hero.stroke >= 0) this.context.fx.frame(1.2);
    else if (fighting) this.context.fx.focus(near.length > 0 ? fit : FIGHT_ZOOM);
    else if (this.mount) this.context.fx.focus(1.15);
    else this.context.fx.focus(calm);
  }

  /* A scene of two or more lines is played as a conversation; a single line is just said over the play. */
  private converse(lines: readonly Line[]): void {
    if (lines.length < 2 || this.context.still) {
      this.scene = { lines, t: 0, next: 0 };
      return;
    }
    this.scene = null;
    this.talk = { lines, index: -1, left: 0, focus: { x: this.crew.explorer.body.x, y: this.crew.explorer.body.y + 1.2 }, zoom: TALK.close };
  }

  /** Skip: the rest of the conversation goes unsaid and play carries on. */
  skipTalk(): void {
    if (!this.talk) return;
    this.talk = null;
    this.line = null;
    this.context.audio.hush();
  }

  /* Where a speaker stands (her, one of the team or a prisoner, or the nearest of the gang), if near. */
  private speakerAt(who: string): { x: number; y: number } | null {
    const e = this.crew.explorer.body;
    if (who === "Kachujin" || who === "Crew") return { x: e.x, y: e.y };
    const mate = [...this.mates, ...this.cages.map((c) => c.mate), ...this.leaving].find((m) => m.spec.name === who && Math.abs(m.x - e.x) < 14);
    if (mate) return { x: mate.x, y: mate.y };
    let foe: Boar | null = null;
    for (const b of this.boars) if (b.fighter && b.state !== "gone" && b.state !== "down" && (!foe || Math.abs(b.x - e.x) < Math.abs(foe.x - e.x))) foe = b;
    if (foe && Math.abs(foe.x - e.x) < 14) return { x: foe.x, y: foe.y };
    // The gang's voice from behind its wall, before any of them show.
    const wall = this.stopAhead(e.x, STOP_ZONE);
    return wall ? { x: wall.x, y: this.terrain.height(wall.x) } : null;
  }

  /*
   * A conversation: nothing moves but the speakers' breathing. The camera holds a two-shot of her
   * and whoever she's talking with, leaning toward the one speaking; each line holds for its
   * words, a press moves on to the next, and Skip ends it.
   */
  private stepTalk(dt: number, input: InputSnapshot): void {
    const t = this.talk;
    if (!t) return;
    this.context.particles.update(dt, this.terrain, this.gravity);
    t.left -= dt;
    if (t.index >= 0 && (input.jumpPressed || input.attackPressed || input.interactPressed)) t.left = 0;
    if (t.left <= 0) {
      t.index++;
      const line = t.lines[t.index];
      if (!line) {
        this.talk = null;
        this.line = null;
        return;
      }
      this.speak(line);
      t.left = Math.max(TALK.least, TALK.base + line.text.length * TALK.perChar);
      if (this.line) this.line.left = t.left;
      this.context.fx.cinema(t.left + 0.4);
    }
    const e = this.crew.explorer.body;
    const line = t.lines[Math.max(0, t.index)];
    const other = t.lines.map((l) => (l.who === "Kachujin" ? null : this.speakerAt(l.who))).find((p) => p !== null) ?? null;
    const speaker = line ? this.speakerAt(line.who) : null;
    const mid = other ? { x: (e.x + other.x) / 2, y: Math.max(e.y, other.y) } : { x: e.x, y: e.y };
    const lean = speaker ? { x: (speaker.x - mid.x) * TALK.lean, y: 0 } : { x: 0, y: 0 };
    t.focus = { x: mid.x + lean.x, y: mid.y + 1.3 };
    const span = other ? Math.abs(other.x - e.x) : 0;
    t.zoom = Math.max(TALK.wide, Math.min(TALK.close, this.width / PPM / (span + 7)));
    this.context.fx.frame(t.zoom);
  }

  /*
   * Bodies are solid: anyone standing overlapping someone else (her, the gang, the animals, her
   * team) is pushed apart along the ground, the lighter one moved more, never through a wall.
   */
  private separate(): void {
    const solids: SolidBody[] = [];
    const e = this.crew.explorer;
    const ground = (x: number): number => this.terrain.height(x);
    const fits = (from: number, to: number): boolean => Math.abs(ground(to) - ground(from)) < 0.45;
    const heroIn = this.crew.mode === "foot" && !e.ragdoll && !e.ropeAnchor && !e.riding && e.body.climb < 0;
    if (heroIn) {
      const spec = BODY.hero ?? { half: 0.32, mass: 60 };
      solids.push({ x: e.body.x, y: e.body.y, half: spec.half, mass: spec.mass, friend: true, hero: true, move: (dx) => {
        if (!fits(e.body.x, e.body.x + dx)) return 0;
        e.body.x += dx;
        return dx;
      } });
    }
    for (const b of this.boars) {
      if (!b.active && b.state !== "attack" && b.state !== "block") continue;
      const spec = BODY[b.kind] ?? { half: 0.4, mass: b.mass };
      solids.push({ x: b.x, y: b.y, half: spec.half, mass: spec.mass, friend: false, move: (dx) => {
        if (!fits(b.x, b.x + dx)) return 0;
        b.x += dx;
        return dx;
      } });
    }
    for (const m of this.mates) {
      if (!m.active || m.carrier || m === this.mount || m.airborne) continue;
      solids.push({ x: m.x, y: m.y, half: m.kind === "giant" ? 0.85 : m.kind === "dog" ? 0.3 : 0.32, mass: m.kind === "giant" ? 200 : 30, friend: true, move: (dx) => {
        const footing = Math.abs(m.y - ground(m.x)) > 0.45
          ? this.platforms().find((p) => m.x >= p.x0 && m.x <= p.x1 && Math.abs(m.y - p.top) < 0.35)
          : undefined;
        if (footing) {
          if (m.x + dx < footing.x0 || m.x + dx > footing.x1) return 0;
          m.x += dx; m.y = footing.top; return dx;
        }
        if (Math.abs(m.y - ground(m.x)) > 0.45 || !fits(m.x, m.x + dx)) return 0;
        m.x += dx;
        m.y = ground(m.x);
        return dx;
      } });
    }
    separateBodies(solids);
  }

  /*
   * Gorr carries her: E beside him (out of a fight) and she's up on his shoulders, where his legs
   * do the running (faster), the jumping (further) and the stepping up (higher); E again, she's down.
   */
  private stepMount(input: InputSnapshot): void {
    const e = this.crew.explorer;
    const ride = this.mount;
    if (ride && (!ride.alive || ride.state === "wounded" || input.interactPressed || e.ragdoll)) {
      this.mount = null;
      e.riding = false;
      e.body.stride = 1;
      e.body.spring = 1;
      ride.place(e.body.x - e.body.facing * 1.2);
      return;
    }
    // Gorr beside her to ride, out of a fight.
    const steed = this.mates.find((m) => MOUNTS[m.kind] !== undefined && m.active && Math.abs(m.x - e.body.x) < 2);
    if (!this.mount && steed && this.crew.mode === "foot" && input.interactPressed && !this.mates.some((m) => m.state === "wounded") && !this.boars.some((b) => b.active && Math.abs(b.x - e.body.x) < 8)) {
      const seat = MOUNTS[steed.kind] ?? { height: RIDE.height, stride: RIDE.stride, spring: RIDE.spring };
      this.mount = steed;
      e.riding = true;
      e.rideHeight = seat.height;
      e.body.stride = seat.stride;
      e.body.spring = seat.spring;
      if (steed.kind === "giant") this.speak({ who: steed.spec.name, clip: "", text: CRY.ride, at: 0 });
    }
  }

  /*
   * The Master Stroke lands: a shockwave from her feet throws everyone near off theirs (a cost of
   * blows each, double with a burning blade), in slow motion, the camera kicked and tilted.
   */
  private masterStroke(): void {
    const e = this.crew.explorer;
    const b = e.body;
    const fire = e.burning > 0 ? 2 : 1;
    this.waves.push({ x: b.x, y: b.y + 0.4, t: 0 });
    for (const beast of this.boars) {
      if (beast.state === "gone" || beast.state === "down" || Math.abs(beast.x - b.x) > MASTER.reach || Math.abs(beast.y - b.y) > 3) continue;
      const dir = Math.sign(beast.x - b.x) || b.facing;
      beast.topple(dir, MASTER.damage * fire);
      if (beast.health <= 0) this.lastKill = beast;
      this.context.particles.blood(beast.x, beast.y + 1.1, dir, 8, 1.4);
      this.context.score.add(POINTS.swordHit * 2, "Master Stroke", beast.x, beast.y + 2);
    }
    this.context.particles.dust(b.x, b.y, 0, 50, 2.4);
    this.context.particles.sparks(b.x, b.y + 1, 1, 14);
    this.context.particles.sparks(b.x, b.y + 1, -1, 14);
    this.context.audio.land(1);
    this.context.audio.ignite();
    this.context.fx.slowmo(0.9, 0.22);
    this.context.fx.punch(0.16);
    this.context.fx.shake(1.2);
    this.context.fx.roll(0.03);
    this.context.fx.cinema(1.6);
    this.context.fx.buzz(90);
    this.speak({ who: "Kachujin", clip: "", text: CRY.master, at: 0 });
  }

  /* Fire: embers stream off a burning blade, and anything alight smokes and sheds sparks. */
  private stepFire(): void {
    const p = this.context.particles;
    const tip = this.fighters.tip;
    if (tip && Math.random() < 0.35) p.sparks(tip.x, tip.y, -this.crew.explorer.body.facing, 1);
    for (const b of this.boars) {
      if (b.burning <= 0 || b.state === "gone") continue;
      if (Math.random() < 0.3) p.sparks(b.x, b.y + 1.1, Math.random() < 0.5 ? 1 : -1, 1);
      if (Math.random() < 0.08) p.dust(b.x, b.y + 1.4, 0, 2, 0.6);
    }
  }

  /*
   * Cages: blows break them (the bars shake, splinters fly); the prisoner gets up, cheers, speaks,
   * and joins her. The camera holds on them, the music lifts, and anything it brings is hers.
   */
  private stepMission(dt: number, input: InputSnapshot): void {
    this.unlockRequested = input.interactPressed;
    if (!this.mission) return;
    const e = this.crew.explorer;
    if (this.keyCarrier?.state === "wait") {
      const guard = this.keyCarrier;
      if (guard.x >= 61) guard.vx = -1.4;
      else if (guard.x <= 49 || guard.vx === 0) guard.vx = 1.4;
      guard.facing = Math.sign(guard.vx) || 1;
    }
    const queenX = this.crew.mode === "car" ? this.crew.car.vehicle.x : e.body.x;
    if (this.keyCarrier && (this.keyCarrier.health <= 0 || this.keyCarrier.state === "gone")) this.mission.markKeyCarrierDefeated(this.keyCarrier.x);
    const before = this.mission.snapshot();
      // The wheeled cage queues behind solid scenery until the player clears the route.
      const convoyBlocked = before.phase === "transporting" && (
        this.props?.some((prop) => !prop.broken && prop.x > before.cageX && prop.x - before.cageX < 1.2)
        || this.stops.some((stop) => !stop.broken && stop.x > before.cageX && stop.x - before.cageX < 1.2)
      );
      const state = this.mission.update(convoyBlocked ? 0 : dt, queenX);
    const cage = this.cages[0];
    if (cage && !cage.broken) { cage.x = state.cageX; cage.mate.place(cage.x); }
    if (before.phase !== "transporting" && state.phase === "transporting") {
      // The enemy opens its own road gate to let the wheeled prison transport leave.
      for (const stop of this.stops) if (stop.x > state.cageX && stop.x < state.cageX + 20) { stop.broken = true; stop.logs = 0; }
    }
    if (this.crew.mode === "foot" && input.interactPressed && this.mission.pickupKey(e.body.x)) {
      this.context.audio.pickup(); this.context.score.add(0, "Prison key recovered · E at the cage", e.body.x, e.body.y + 2);
      this.unlockRequested = false;
    }
    const prisoner = this.mates.find((m) => m.member === cage?.mate.member);
    if (prisoner) this.mission.updatePrisoner({ alive: prisoner.member.alive, down: !prisoner.active, x: prisoner.x });
  }

  private restoreMission(): void {
    if (!this.mission || !this.missionSave) return;
    this.mission.restore(this.missionSave);
    const cage = this.cages[0];
    if (!cage) return;
    const state = this.mission.snapshot();
    if (!state.keyCarrierDefeated) this.keyCarrier?.reset();
    if (!state.cageOpen) { cage.x = state.cageX; cage.blows = CAGE.blows; cage.broken = false; cage.mate.place(cage.x); }
    if (state.cageOpen && !cage.mate.member.alive) {
      for (let i = this.mates.length - 1; i >= 0; i--) {
        if (this.mates[i].member === cage.mate.member) this.mates.splice(i, 1);
      }
      this.context.party.restore(cage.mate.member);
      const returned = new Mate(cage.mate.member, this.reached, this.terrain, false, this.navigator);
      returned.order = { kind: "regroup" };
      this.mates.push(returned);
    }
  }

  orderSquad(order: SquadOrder): void {
    const mate = this.mates.find((m) => m.member.rank === order.unit && m.active);
    if (!mate || (order.x !== undefined && !Number.isFinite(order.x))) return;
    mate.order = { kind: order.kind, x: order.kind === "hold" ? mate.x : Math.max(0, Math.min(this.config.finish, order.x ?? mate.x)) };
  }

  /** Small, live instructions use the actual actor, including a soldier outside the camera view. */
  private missionGuidance(): string {
    const queenX = this.crew.mode === "car" ? this.crew.car.vehicle.x : this.crew.explorer.body.x;
    const point = (x: number): string => `${x < queenX ? "←" : "→"} ${Math.round(Math.abs(x - queenX))} m`;
    if (!this.mission) {
      const gate = this.stops.find((s) => !s.broken && s.x >= queenX - 2);
      return gate ? `Clear the guards to open the gate · ${point(gate.x)}` : `Reach the exit · ${point(this.config.finish)}`;
    }
    const state = this.mission.snapshot();
    if (!state.cageOpen) {
      const cage = `Knight: imprisoned · ${point(state.cageX)}`;
      if (state.keyHeld) return `Key collected · Go to the cage and press E to unlock\n${cage}`;
      if (state.keyAvailable) return `Collect the dropped key with E · ${point(state.keyX)}\n${cage} · F can also break the cage`;
      if (state.phase === "transporting" || state.phase === "intercept") return `Intercept the prison cart · E with key, or F to break the cage\n${cage}`;
      return `Free the Knight · Get the guard's key, or break the cage with F\n${cage} · Transfer in ${Math.ceil(state.secondsRemaining)}s`;
    }
    const member = this.cages[0]?.mate.member;
    const knight = this.mates.find((m) => m.member === member);
    if (!member?.alive || !knight || knight.state === "dead") {
      return "Knight: captured · Cannot extract alone\nPress R to recover from the checkpoint";
    }
    if (knight.state === "wounded") return `Knight: down · ${point(knight.x)}\nStand beside him and press E to revive before he is captured`;
    const status = knight.alpha === 0 && this.crew.mode === "car"
      ? "Knight: alive · aboard your truck"
      : `Knight: alive · ${Math.ceil(knight.health * 100)}% health · ${point(knight.x)}`;
    const atExit = Math.abs(queenX - this.config.finish) <= 5;
    if (atExit && Math.abs(knight.x - this.config.finish) > 5) return `Wait here for the Knight, or go back to help him\n${status}`;
    return `Escort the Knight to the exit · ${point(this.config.finish)}${queenX > this.config.finish + 5 ? " · Turn back" : ""}\n${status}`;
  }

  private routeMap(): RouteMapSnapshot {
    const e = this.crew.explorer.body;
    const queenX = this.crew.mode === "car" ? this.crew.car.vehicle.x : e.x;
    const mission = this.mission?.snapshot();
    return {
      finish: this.config.finish, queenX, queenUpper: e.y - this.terrain.height(e.x) > 2,
      units: this.mates.filter((m) => m.alive).map((m) => ({ id: m.member.rank ?? -1, name: m.spec.name, x: m.x, upper: m.y - this.terrain.height(m.x) > 2, health: m.health, state: m.state === "wounded" ? "wounded" : m.state === "attack" ? "fighting" : m.active && Math.abs(m.vx) < 0.1 ? "waiting" : "moving" })),
      upper: this.walks.map((w) => ({ x0: w.x0, x1: w.x1 })),
      crossings: [...this.ropes.map((r) => ({ x: r.x, kind: "rope" as const })), ...this.config.features.filter((f) => f.kind === "ravine" || f.kind === "water").map((f) => ({ x: f.x + f.size / 2, kind: f.kind === "water" ? "water" as const : "gap" as const }))],
      objectives: [...(mission && !mission.keyHeld && !mission.keyAvailable && this.keyCarrier && this.keyCarrier.health > 0 ? [{ x: this.keyCarrier.x, label: "Key carrier patrol" }] : []), ...this.cages.filter((c) => !c.broken).map((c) => ({ x: c.x, label: "Prisoner" })), ...(mission?.keyAvailable ? [{ x: mission.keyX, label: "Dropped prison key" }] : []), { x: this.config.finish, label: "Extraction" }],
    };
  }

  private stepCages(dt: number): void {
    this.hold = Math.max(0, this.hold - dt);
    const e = this.crew.explorer;
    for (const cage of this.cages) {
      cage.shake = Math.max(0, cage.shake - dt);
      const unlocking = this.mission?.snapshot().keyHeld && this.unlockRequested && Math.abs(cage.x - e.body.x) < 3;
      if (cage.broken || this.crew.mode !== "foot" || (!unlocking && (!e.striking || e.struck.has(cage)))) continue;
      const box = e.hitbox;
      if (!unlocking && (box.x1 < cage.x - 0.7 || box.x0 > cage.x + 0.7)) continue;
      e.struck.add(cage);
      e.recoil();
      cage.blows = unlocking ? 0 : cage.blows - 1;
      cage.shake = 0.3;
      const ground = this.terrain.height(cage.x);
      this.context.audio.crack();
      this.context.particles.dust(cage.x, ground + 0.8, e.body.facing * 2, 10, 0.8);
      if (cage.blows > 0) continue;
      if (this.mission && !this.mission.openCage(unlocking ? "key" : "breach", e.body.x)) continue;
      cage.broken = true;
      this.debris.burst(cage.x, ground + 0.7, e.body.facing * 3, 2, 18, 3, ["#4a3424", "#6b4f3a", "#2b2d33"], 0.3);
      this.context.audio.land(0.6);
      const mate = cage.mate;
      mate.free();
      if (this.mission) mate.order = { kind: "regroup" };
      const spec = MATES[mate.kind];
      if (this.context.party.taken.includes(mate.member)) {
        this.context.party.restore(mate.member);
        this.mates.push(mate);
        this.converse([{ who: spec.name, clip: "", text: RETURNED.thanks, at: 1.2 }, { who: "Kachujin", clip: "", text: RETURNED.answer, at: 3.2 }]);
        this.context.score.add(POINTS.stageClear, `${spec.name} rescued`, cage.x, ground + 2.6);
      } else if (mate.visitor) {
        // A villager: everyone's patched up, the Master Stroke charged, the fire ready again.
        this.leaving.push(mate);
        e.heal();
        e.charge(0.5);
        e.fireRecharge = 0;
        for (const m of this.mates) if (m.active) m.member.hearts = Math.min(m.spec.health, m.member.hearts + Math.ceil(m.spec.health / 2));
        this.converse([{ who: spec.name, clip: "", text: VILLAGER.thanks, at: 1.2 }, { who: "Kachujin", clip: "", text: VILLAGER.answer, at: 3.4 }]);
        this.context.score.add(POINTS.stageClear, "Villager freed · team healed", cage.x, ground + 2.6);
      } else {
        this.context.party.join(mate.member);
        this.mates.push(mate);
        e.carried = this.context.party.carried;
        e.fireUnlocked = this.context.party.fire;
        this.converse([{ who: spec.name, clip: "", text: spec.freed, at: 1.2 }, { who: "Kachujin", clip: "", text: ANSWERS[mate.kind], at: 3.9 }]);
      }
      this.hold = CAGE.scene;
      this.holdZoom = RESCUE_ZOOM;
      this.context.fx.cinema(CAGE.scene + 1.6);
      this.context.audio.sting("victory", 7);
      this.context.score.add(POINTS.stageClear / 2, `${spec.name} freed`, cage.x, ground + 2.2);
      if (spec.unlocks?.weapon) this.context.score.add(0, "Axe unlocked · Q to switch", cage.x, ground + 3.2);
      if (spec.unlocks?.fire) this.context.score.add(0, "Fire Sword unlocked · V", cage.x, ground + 3.2);
      // Freeing the mission prisoner is a recovery point: a later death must not put them back in the cage.
      if (this.mission) this.missionSave = this.mission.checkpoint();
      // A barricade's road waits for the rescue: back to the truck after it.
      if (this.encounters.some((f) => f.cleared) && this.boardIn < 0 && !this.onFoot && this.truck) this.boardIn = CAGE.scene + 2.5;
    }
  }

  /*
   * The team: in the truck with her while she drives (out of sight), then out and following on
   * foot in a line, each turning to fight what comes near its own way: blows up close, arrows from
   * the Ranger, fire from the Mage. Enemies go for them too; one that falls is lost for good.
   */
  private stepMates(dt: number): void {
    const e = this.crew.explorer.body;
    const v = this.crew.car.vehicle;
    const inTruck = this.crew.mode !== "foot";
    const foes = this.boars.filter((b) => b.active && b.kind !== "dog");
    const danger = foes.some((b) => Math.abs(b.x - e.x) < 12);
    // In trouble: on foot with enemies on her, or hurt badly. Everyone runs to her.
    const onHer = foes.filter((b) => Math.abs(b.x - e.x) < RALLY.trouble);
    const trouble = !inTruck && (onHer.length > 0 || (danger && this.crew.explorer.hearts <= 1));
    if (!danger && Math.abs(e.vx) > 1) this.marchFacing = Math.sign(e.vx);
    // Boarding must change the rendezvous to the live truck, not the queen's parked foot body.
    const formationHero = { x: inTruck ? v.x : e.x, facing: this.marchFacing, viewHalf: this.reachOfView, trouble };
    this.navigator.setBlockedRopes(this.crew.explorer.ropeAnchor ? [this.crew.explorer.ropeAnchor.x] : []);
    const assigned = new Map<Boar, number>();
    // The dog takes the smallest toy on its back while the way is quiet; at a fight they both jump to it.
    const dog = this.mates.find((m) => m.kind === "dog" && m.active);
    for (const m of this.mates) {
      if (m.carrier && !m.carrier.airborne && Math.abs(m.carrier.y - this.terrain.height(m.carrier.x)) < 0.25 && (danger || !dog || m.carrier !== dog || !m.carrier.active || m.order.kind !== "follow")) {
        m.carrier.rider = null;
        m.carrier = null;
        m.place(m.x);
      }
    }
    // E beside a downed friend: she kneels and brings it round.
    if (!this.channel && this.crew.mode === "foot" && this.reviveAsked) {
      const down = this.mates.find((m) => m.state === "wounded" && Math.abs(m.x - e.x) < 1.8);
      if (down) this.channel = { mate: down, left: WOUND.revive };
    }
    // Her guard: the weakest keep closest to her, the strongest take the outer places, ahead and behind.
    const guard = this.mates.filter((m) => m.active && !m.carrier && m !== this.mount).sort((a, b) => a.power - b.power);
    // Strength in numbers: every teammate fighting makes the others hit harder and hold longer.
    const squad = this.mates.filter((m) => m.active).length;
    for (const m of this.mates) m.squad = squad;
    // Stepping out of the truck, they climb out with her and are seen at once (no fade-in).
    if (!inTruck) {
      let behind = 0;
      for (const m of this.mates) {
        if (m.active && !m.carrier && m.alpha < 1) {
          if (m.alpha === 0) m.place(v.x - 1.2 - behind++ * 0.7);
          m.alpha = 1;
        }
      }
    }
    const places = new Map(guard.map((m, i) => [m, i] as const));
    for (const mate of this.mates) {
      const slot = places.get(mate) ?? 0;
      if (!mate.alive) {
        mate.update(dt, e, 0, null);
        continue;
      }
      // Gorr stays directly under his rider.
      if (mate === this.mount) {
        mate.x = e.x;
        mate.y = e.y;
        mate.vx = e.vx;
        mate.facing = e.facing;
        continue;
      }
      if (mate.carrier) {
        mate.x = mate.carrier.x - mate.carrier.facing * 0.1;
        mate.y = mate.carrier.y + 0.48;
        mate.facing = mate.carrier.facing;
        mate.alpha = mate.carrier.alpha;
        continue;
      }
      // Distant soldiers must reach the truck on foot before boarding.
      if (inTruck && mate.active && (mate.alpha === 0 || (!mate.airborne && Math.abs(mate.x - v.x) < 3 && Math.abs(mate.y - this.terrain.height(v.x)) < 1.2))) {
        mate.x = v.x - 1;
        mate.y = this.terrain.height(mate.x);
        mate.alpha = 0;
        continue;
      }
      let foe: (typeof foes)[number] | null = null;
      // In trouble they go for whoever is on her first; otherwise the nearest enemy to themselves.
      const pool = trouble && onHer.length > 0 ? onHer : foes;
      const from = trouble ? e.x : mate.x;
      for (const b of pool) {
        if ((assigned.get(b) ?? 0) >= (trouble ? 3 : 2)) continue;
        if (!foe || Math.abs(b.x - from) < Math.abs(foe.x - from)) foe = b;
      }
      if (foe) assigned.set(foe, (assigned.get(foe) ?? 0) + 1);
      if (foe && !trouble && Math.abs(foe.x - mate.x) > 12) foe = null;
      const struck = mate.update(dt, formationHero, slot, foe, () => this.mourn(mate));
      if (!struck) continue;
      const spec = mate.spec;
      const dir = Math.sign(struck.x - mate.x) || 1;
      if (spec.attack === "arrow" || spec.attack === "magic") {
        this.shots.push({ x0: mate.x, y0: mate.y + spec.height * 0.7, x1: struck.x, y1: struck.y + 1.1, left: 0.18, fire: spec.attack === "magic" });
        if (spec.attack === "magic") {
          this.context.particles.sparks(struck.x, struck.y + 1.1, dir, 16);
          this.context.audio.ignite();
        } else {
          this.context.audio.swing(false, 1.6);
        }
      } else {
        this.context.audio.thwack();
      }
      const off = struck.hit(dir, mate.power, "chest", mate.power > 2, mate.power);
      this.context.particles.blood(struck.x - dir * 0.1, struck.y + 1.1, dir, off ? 14 : 6, 1);
      this.context.score.add(off ? POINTS.swordHit : 0, off ? `${spec.name}!` : "", struck.x, struck.y + 1.8);
    }
    // Teammates dragged off fade from sight and leave her side.
    for (let i = this.mates.length - 1; i >= 0; i--) if (this.mates[i].state === "dead" && this.mates[i].alpha <= 0) this.mates.splice(i, 1);
    // Villagers on their way home.
    for (const v2 of this.leaving) v2.update(dt, e, 0, null);
    for (let i = this.leaving.length - 1; i >= 0; i--) if (this.leaving[i].alpha <= 0) this.leaving.splice(i, 1);
    for (const shot of this.shots) shot.left -= dt;
    while (this.shots.length > 0 && this.shots[0].left <= 0) this.shots.shift();
  }

  /* A mate fell: slow motion, the camera holds on it, the music turns, and she speaks over it. */
  private mourn(mate: Mate): void {
    // Not dead: dragged off by Grey's men. A cage on a later level holds them, or a Spark Heart brings them back.
    this.context.party.take(mate.member);
    if (this.mount === mate) {
      this.mount = null;
      this.crew.explorer.riding = false;
      this.crew.explorer.body.stride = 1;
      this.crew.explorer.body.spring = 1;
    }
    this.context.fx.slowmo(0.9, 0.3);
    this.context.fx.cinema(3);
    this.hold = 2;
    this.holdZoom = 1.4;
    this.context.audio.sting("loss", 14);
    this.speak({ who: "Kachujin", clip: "", text: TAKEN(mate.spec.name), at: 0 });
    this.context.score.add(0, `${mate.spec.name} was taken`, mate.x, mate.y + 1.6);
  }

  /*
   * Revive (its own button): the best way there is right now. Beside a downed teammate, she helps
   * them up; further off, the Mage (if she's with her) brings them round with a spell, once a minute;
   * with a Spark Heart in hand, a teammate Grey's men took comes straight back.
   */
  private revive(): void {
    const e = this.crew.explorer.body;
    const party = this.context.party;
    const near = this.mates.find((m) => m.state === "wounded" && Math.abs(m.x - e.x) < 1.8);
    if (near && !this.channel) {
      this.channel = { mate: near, left: WOUND.revive };
      return;
    }
    const mage = this.mates.find((m) => m.kind === "mage" && m.active);
    // Anyone down, anywhere: the nearest gets up at once, wherever she is.
    const far = this.mates
      .filter((m) => m.state === "wounded")
      .sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x))[0];
    if (far) {
      far.revive();
      if (mage) this.shots.push({ x0: mage.x, y0: mage.y + 0.7, x1: far.x, y1: far.y + 0.6, left: 0.25, fire: true });
      this.context.particles.sparks(far.x, far.y + 0.8, 1, 16);
      this.context.audio.ignite();
      this.speak({ who: mage ? "Mage" : far.spec.name, clip: "", text: mage ? MAGE_REVIVE.line : HEART_LINE, at: 0 });
      return;
    }
    const lost = party.taken[0];
    if (lost && (party.hearts > 0 || party.reviveRecharge === 0)) {
      if (party.hearts > 0) party.hearts--;
      else party.reviveRecharge = MAGE_REVIVE.recharge;
      party.restore(lost);
      // Back from just out of sight behind her, running in: never popping in beside her.
      const back = new Mate(lost, e.x - e.facing * (this.reachOfView + 1), this.terrain, false, this.navigator);
      this.mates.push(back);
      this.context.particles.sparks(back.x, back.y + 1, 1, 20);
      this.context.audio.complete();
      this.speak({ who: back.spec.name, clip: "", text: HEART_LINE, at: 0 });
    }
  }

  /** What the Revive button would do now (its label), if anything. */
  private reviveOffer(): string | null {
    const e = this.crew.explorer.body;
    const party = this.context.party;
    const near = this.mates.find((m) => m.state === "wounded" && Math.abs(m.x - e.x) < 1.8);
    if (near) return `Help the ${near.spec.name} up`;
    const far = this.mates.find((m) => m.state === "wounded");
    if (far) return `Revive the ${far.spec.name}`;
    const lost = party.taken[0];
    if (lost && party.hearts > 0) return `Spark Heart: bring back the ${MATES[lost.kind].name}`;
    if (lost && party.reviveRecharge === 0) return `Bring back the ${MATES[lost.kind].name}`;
    return null;
  }

  /** Spark Hearts reward exploration and let the player recover fallen soldiers. */
  private stepRescuePickups(): void {
    const c = this.crew.explorer.centre;
    if (this.crew.mode === "foot" && this.sparks.collect(c.x, c.y, 1.2) > 0) {
      this.context.party.hearts++;
      this.context.audio.complete();
      this.context.score.add(POINTS.cell * 3, "Spark Heart!", c.x, c.y + 1.4);
    }
  }

  /*
   * The fight at a barricade. Stepping out in front of it starts it (with the gang's taunt); then
   * they come one after another at random moments, picked at random, from behind her or leaping
   * the wall, never more than `together` on her at once, while the wall holds her in. When the
   * last falls the wall comes down in slow motion, and she heads back to the truck on her own.
   */
  private stepEncounters(dt: number): void {
    const e = this.crew.explorer.body;
    for (const fight of this.encounters) {
      if (fight.cleared) continue;
      if (!fight.started) {
        if (this.crew.mode === "foot" && fight.stop.x - e.x < STOP_ZONE && fight.stop.x - e.x > -2) {
          fight.started = true;
          fight.next = ARENA.first;
          // The gang's taunt, played like a film: bars across the screen while it's said.
          if (fight.spec.dialogue) this.converse(this.withTeam(fight.spec.dialogue));
          this.context.fx.cinema(4.2);
        }
        continue;
      }
      // Held in the fight: the wall ahead, and no running off back down the road.
      const back = fight.stop.x - ARENA.depth;
      if (e.x < back) {
        e.x = back;
        e.vx = Math.max(0, e.vx);
      }
      const standing = fight.enemies.filter((b) => b.state !== "down" && b.state !== "gone");
      fight.next -= dt;
      if (fight.left > 0 && fight.next <= 0 && standing.length < fight.spec.together) {
        this.bringOn(fight);
        fight.left--;
        fight.next = ARENA.gap + Math.random() * ARENA.spread;
      }
      // The wall sheds a log for every few beaten.
      const beaten = fight.spec.enemies - fight.left - standing.length;
      fight.stop.logs = Math.max(1, Math.ceil(BARRICADE.logs * (1 - beaten / fight.spec.enemies)));
      if (fight.left === 0 && standing.length === 0) {
        fight.cleared = true;
        this.context.fx.slowmo(0.8, 0.25);
        this.context.fx.punch(0.12);
        this.clearStop(fight.stop);
        if (this.truck && !this.onFoot) this.boardIn = ARENA.boardIn;
      }
    }
    // The road's clear: back to the truck (called down if she's wandered from it), and in; but not
    // while a prisoner is still locked up nearby.
    if (this.boardIn > 0 && (!this.truck || this.onFoot)) this.boardIn = -1;
    if (this.boardIn > 0) {
      this.boardIn -= dt;
      const waiting = this.cages.some((c) => !c.broken && Math.abs(c.x - e.x) < 25);
      if (this.boardIn <= 0 && waiting) this.boardIn = -1;
      else if (this.boardIn <= 0 && this.crew.mode === "foot") {
        if (Math.abs(this.crew.car.vehicle.x - e.x) > CALL.farther) this.callCar();
        this.crew.board();
      }
    }
  }

  /* One of the gang comes on: leaping the barricade to land in front of it, or running in from behind her. */
  private bringOn(fight: Encounter): void {
    // Grey's chief comes once, last of all: the gang first, then him.
    const gang = fight.spec.kinds.filter((k) => k !== "chief");
    const kind = fight.spec.kinds.includes("chief") && fight.left === 1 ? "chief" : pick(gang.length > 0 ? gang : fight.spec.kinds);
    const e = this.crew.explorer.body;
    let foe: Boar;
    if (kind !== "wolf" && Math.random() < ARENA.overWall) {
      const x = fight.stop.x - 0.9;
      foe = new Boar(x, this.terrain, kind);
      foe.y = this.terrain.height(x) + 2.2;
      foe.enter(-2.6, 3.6);
    } else {
      const x = Math.max(fight.stop.x - ARENA.depth - 4, e.x - this.reachOfView - 2);
      foe = new Boar(x, this.terrain, kind);
      foe.enter(kind === "wolf" ? 7 : 3.5, 0);
    }
    this.context.audio.grunt();
    // The chief's entrance: the camera goes to him as he comes over the wall, bars across, the ground shaking.
    if (kind === "chief") {
      this.shot = { x: foe.x - 1, y: this.terrain.height(foe.x) + 1.6, zoom: 1.35, left: 1.8 };
      this.context.fx.cinema(2.6);
      this.context.fx.shake(1);
      this.speak({ who: "Grey's chief", clip: "", text: "Enough games. Come here.", at: 0 });
    }
    fight.enemies.push(foe);
    this.boars.push(foe);
  }

  /* Packs out of the dark: passing an ambush's spot sets them coming, one after another, from ahead or behind. */
  private stepAmbushes(dt: number): void {
    const e = this.crew.explorer.body;
    const x = this.crew.mode === "car" ? this.crew.car.vehicle.x : e.x;
    for (const a of this.ambushes) {
      if (!a.sprung && x > a.spec.x - 6 && x < a.spec.x + 20) {
        a.sprung = true;
        // The team senses it first (the dog before anyone).
        const lookout = this.mates.find((m) => m.alive && m.kind === "dog") ?? this.mates.find((m) => m.alive && m.state !== "caged");
        if (lookout) this.speak({ who: lookout.spec.name, clip: "", text: lookout.spec.warns, at: 0 });
        a.queue = Array.from({ length: a.spec.count }, (_, i) => ({ in: i * 0.45 + Math.random() * 1.4, kind: pick(a.spec.kinds) }));
      }
      for (const q of a.queue) {
        q.in -= dt;
        if (q.in > 0) continue;
        const ahead = Math.random() < 0.6 ? 1 : -1;
        const foe = new Boar(e.x + ahead * (this.reachOfView + 2.5), this.terrain, q.kind);
        foe.enter(-ahead * (q.kind === "wolf" ? 7 : 3.5), 0);
        this.boars.push(foe);
        this.context.audio.grunt();
      }
      a.queue = a.queue.filter((q) => q.in > 0);
    }
  }

  /*
   * Ropes: each a chain of links (verlet: gravity, a breath of wind, then the links pulled back to
   * their length a few times over), pinned at the branch. Held, the link at her hands is pinned
   * to them (where the 3D model's hands really are) and the rest hangs below; caught, the rope jerks
   * with her weight. In the air near one, her hands catch it.
   */
  private stepRopes(dt: number): void {
    const e = this.crew.explorer;
    const held = e.ropeAnchor;
    const heroHands = this.fighters.hands ?? e.hands;
    for (const rope of this.ropes) {
      const links = rope.links;
      const gust = Math.sin(this.clock * 0.9 + rope.x) * 0.35;
      for (const l of links) {
        const vx = (l.x - l.px) * 0.96;
        const vy = (l.y - l.py) * 0.96;
        l.px = l.x;
        l.py = l.y;
        l.x += vx + gust * dt * dt;
        l.y += vy - this.gravity * dt * dt;
      }
      const heroHolding = held !== null && held.x === rope.x && held.y === rope.y;
      const companion = this.mates.find((m) => m.navigationPose.rope?.x === rope.x);
      const hands = heroHolding ? heroHands : companion ? { x: companion.x, y: companion.y + 0.8 } : heroHands;
      const holding = heroHolding || companion !== undefined;
      const grip = holding ? Math.min(ROPE_LINKS, Math.max(1, Math.round((Math.hypot(hands.x - rope.x, hands.y - rope.y) / rope.length) * ROPE_LINKS))) : -1;
      const step = rope.length / ROPE_LINKS;
      for (let k = 0; k < ROPE_ITERATIONS; k++) {
        links[0].x = rope.x;
        links[0].y = rope.y;
        if (grip > 0) {
          links[grip].x = hands.x;
          links[grip].y = hands.y;
        }
        for (let i = 1; i < links.length; i++) {
          const a = links[i - 1];
          const b = links[i];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1e-6;
          const pull = (d - step) / d;
          const aFixed = i - 1 === 0 || i - 1 === grip;
          const bFixed = i === grip;
          const share = aFixed ? 1 : bFixed ? 0 : 0.5;
          a.x += dx * pull * (1 - share);
          a.y += dy * pull * (1 - share);
          b.x -= dx * pull * share;
          b.y -= dy * pull * share;
        }
      }
    }
    this.clock += dt;
    if (this.crew.mode !== "foot" || e.riding) return;
    for (const w of this.walks) {
      const vineX = w.x0 - 0.35;
      // A jump at the vine (from the ground beside it, or flying into it) and her hands are on it.
      if ((this.jumpAsked || !e.body.grounded) && Math.abs(e.body.x - vineX) < 1 && e.body.y < w.y - 0.5 && e.grabVine(vineX, w.y, { x: w.x0 + 0.7, y: w.y })) {
        this.context.audio.footstep();
        break;
      }
    }
    for (const rope of this.ropes) {
      if (this.mates.some((m) => m.navigationPose.rope?.x === rope.x)) continue;
      if (!e.catchRope(rope.x, rope.y, rope.length)) continue;
      // Her weight hits the rope: it jerks, and the branch creaks.
      for (const l of rope.links) l.px -= e.body.vx * 0.012;
      this.context.audio.land(0.25);
      this.context.fx.punch(0.04);
      break;
    }
  }

  /*
   * Dialogue: a scene's lines (a barricade's taunt and the hero's answer, the jungle's opening)
   * each played and subtitled in turn; clearing a barricade gets the hero's closing line.
   */
  private stepDialogue(dt: number): void {
    if (this.line) {
      this.line.left -= dt;
      if (this.line.left <= 0) this.line = null;
    }
    if (!this.scene) return;
    this.scene.t += dt;
    const next = this.scene.lines[this.scene.next];
    if (next && this.scene.t >= next.at) {
      this.speak(next);
      this.scene.next++;
    }
    if (this.scene.next >= this.scene.lines.length) this.scene = null;
  }

  /* A scene's lines, with a word from the team after hers (whoever's with her). */
  private withTeam(lines: readonly Line[]): readonly Line[] {
    const mate = this.mates.find((m) => m.alive && m.state !== "caged");
    if (!mate) return lines;
    const last = lines[lines.length - 1]?.at ?? 0;
    return [...lines, { who: mate.spec.name, clip: "", text: mate.spec.warns, at: last + 2.4 }];
  }

  private speak(line: Line): void {
    this.context.audio.say(line.clip, line.text, line.who);
    this.line = { who: line.who, text: line.text, left: LINE_TIME };
  }

  /*
   * Breakables. The car hitting one faster than it can take shatters it into pieces thrown with
   * the car's speed, and loses momentum by the mass it hit (an inelastic collision: v' = v·M/(M+m));
   * slower than that, a heavy one just stops the car. Flying over clears it. On foot, the sword
   * breaks them too.
   */
  private stepProps(): void {
    const car = this.crew.car;
    const v = car.vehicle;
    const e = this.crew.explorer;
    for (const prop of this.props) {
      if (prop.broken) continue;
      const spec = PROPS[prop.kind];
      const ground = this.terrain.height(prop.x);
      const near = prop.x - spec.width / 2;
      const far = prop.x + spec.width / 2;
      if (this.crew.mode === "car" && car.wrecked === 0 && v.x + 2.3 > near && v.x - 2.3 < far && v.y - 0.5 < ground + spec.height) {
        if (Math.abs(v.vx) >= spec.breakAt) {
          this.smash(prop, v.vx, v.vy);
          v.vx *= CAR.mass / (CAR.mass + spec.mass);
          car.hurt(spec.damage);
        } else if (v.vx > 0) {
          v.x = near - 2.3;
          v.vx = 0;
        }
        continue;
      }
      if (this.crew.mode === "foot" && e.striking && !e.struck.has(prop)) {
        const box = e.hitbox;
        if (box.x1 > near && box.x0 < far && box.y0 < ground + spec.height) {
          e.struck.add(prop);
          e.recoil();
          this.smash(prop, e.body.facing * 4, 2);
        }
      }
    }
  }

  private smash(prop: { x: number; kind: PropKind; broken: boolean }, vx: number, vy: number): void {
    const spec = PROPS[prop.kind];
    const ground = this.terrain.height(prop.x);
    prop.broken = true;
    this.debris.burst(prop.x, ground + spec.height / 3, vx, vy, Math.round(10 + spec.mass / 12), 2.5 + Math.abs(vx) * 0.25, spec.colors, prop.kind === "stall" ? 0.5 : 0.35);
    this.context.particles.dust(prop.x, ground, vx * 0.5, 16, 1.2);
    this.context.audio.crack();
    this.context.fx.punch(prop.kind === "stall" ? 0.07 : 0.04);
    this.context.combo.add(1);
    this.context.score.add(spec.points * this.context.combo.multiplier, prop.kind === "stall" ? "Stall smashed" : "Smashed", prop.x, ground + spec.height + 0.5);
  }

  /* A barricade whose gang is beaten: the wall comes down. */
  private clearStop(stop: Barricade): void {
    stop.broken = true;
    stop.logs = 0;
    const ground = this.terrain.height(stop.x);
    this.speak(CLEARED);
    this.debris.burst(stop.x, ground + 1.5, 5, 3, 26, 5, ["#5a4232", "#6b4f3a", "#7a5c43", "#b5452a"], 0.5);
    this.context.audio.land(1);
    this.context.particles.dust(stop.x, ground + 1, 4, 60, 2.2);
    this.context.score.add(POINTS.stageClear, "Road cleared", stop.x, ground + 3);
  }

  /*
   * What she can stand on besides the ground (kung fu: up onto anything): truck and rickshaw roofs
   * (riding them as they roll), crates and stalls still standing, and the Cybertruck itself.
   */
  private platforms(): { x0: number; x1: number; top: number; vx: number }[] {
    const out: { x0: number; x1: number; top: number; vx: number }[] = [];
    for (const t of this.traffic) {
      const half = LENGTH[t.kind] / 2 - 0.2;
      out.push({ x0: t.at - half, x1: t.at + half, top: this.terrain.height(t.at) + HEIGHT[t.kind], vx: t.moving ? t.speed : 0 });
    }
    for (const p of this.props) {
      if (p.broken || p.kind === "fence") continue;
      const spec = PROPS[p.kind];
      out.push({ x0: p.x - spec.width / 2, x1: p.x + spec.width / 2, top: this.terrain.height(p.x) + spec.height, vx: 0 });
    }
    const v = this.crew.car.vehicle;
    if (!this.crew.car.occupied && v.grounded && v.upright) out.push({ x0: v.x - 2.1, x1: v.x + 2.1, top: v.y + 0.95, vx: v.vx });
    for (const log of this.logs) out.push({ x0: log.x - 1.3, x1: log.x + 1.3, top: this.waterLevel(log.spec.x) + 0.25, vx: log.vx });
    for (const w of this.walks) out.push({ x0: w.x0, x1: w.x1, top: w.y, vx: 0 });
    return out;
  }

  /*
   * Boulders: on a hillside, while she's on it, one breaks loose above her every few seconds and
   * rolls down (gathering speed, flying off ledges, bouncing). It flattens her if it reaches her
   * (jump it, or smash it with the blade) and hurts a mate in its way.
   */
  private stepBoulders(dt: number): void {
    const e = this.crew.explorer;
    const b = e.body;
    const zone = (this.config.boulders ?? []).find((z) => b.x > z.x0 - 4 && b.x < z.x1);
    this.nextBoulder -= dt;
    if (zone && this.crew.mode === "foot" && this.nextBoulder <= 0) {
      this.nextBoulder = zone.every * (0.7 + Math.random() * 0.6);
      const x = Math.min(zone.x1 + 6, b.x + 16);
      this.boulders.push({ x, y: this.terrain.height(x) + BOULDER.radius + 0.5, vx: -1, vy: 0, spin: 0, angle: 0 });
      this.context.audio.land(0.3);
    }
    for (const rock of this.boulders) {
      const ground = this.terrain.height(rock.x) + BOULDER.radius;
      if (rock.y > ground + 0.05) {
        rock.vy -= this.gravity * dt;
      } else {
        // On the ground: rolling downhill, gathering speed; a hard landing bounces.
        if (rock.vy < -4) {
          rock.vy = -rock.vy * 0.3;
          this.context.particles.dust(rock.x, rock.y - BOULDER.radius, rock.vx, 8, 0.8);
          this.context.audio.land(0.5);
          this.context.fx.shake(0.25);
        } else {
          rock.vy = 0;
          rock.y = ground;
        }
        rock.vx = Math.max(-BOULDER.speed, rock.vx - 6 * dt);
      }
      rock.x += rock.vx * dt;
      rock.y += rock.vy * dt;
      rock.angle += (rock.vx / BOULDER.radius) * dt;
      // The blade smashes it.
      const box = e.hitbox;
      if (e.striking && box.x1 > rock.x - BOULDER.radius && box.x0 < rock.x + BOULDER.radius && rock.y - BOULDER.radius < box.y1) {
        this.debris.burst(rock.x, rock.y, -rock.vx * 0.3, 3, 14, 3, ["#6a625a", "#4a4440", "#8a8278"], 0.3);
        this.context.particles.dust(rock.x, rock.y, 0, 20, 1.2);
        this.context.audio.crack();
        e.recoil();
        this.context.score.add(BOULDER.points, "Boulder smashed", rock.x, rock.y + 1);
        rock.y = -100;
        continue;
      }
      // Rolling into her, or into one of the team.
      if (Math.abs(rock.x - b.x) < BOULDER.radius + 0.3 && b.y < rock.y + BOULDER.radius - 0.15 && b.y > rock.y - BOULDER.radius - 1.6 && e.hurt(rock.x, true)) {
        this.context.fx.shake(0.8);
        this.context.fx.buzz(60);
      }
      for (const m of this.mates) if (m.open && Math.abs(rock.x - m.x) < BOULDER.radius + 0.25 && Math.abs(rock.y - BOULDER.radius - m.y) < 0.8 && m.hurt(rock.x, BOULDER.damage)) this.speak({ who: m.spec.name, clip: "", text: CRY.down, at: 0 });
    }
    this.boulders = this.boulders.filter((r) => r.y > -20 && r.x > (zone?.x0 ?? b.x) - 40);
  }

  /* The river's surface where a log floats (its banks' height less the drop to the water). */
  private waterLevel(x: number): number {
    const river = this.config.features.find((f) => f.kind === "water" && x >= f.x - 2 && x <= f.x + f.size + 2);
    return river ? Math.min(this.terrain.height(river.x - 0.6), this.terrain.height(river.x + river.size + 0.6)) - WATER_DEPTH : 0;
  }

  /* In the river: over one, and down below its surface. */
  private inWater(x: number, y: number): boolean {
    const river = this.config.features.find((f) => f.kind === "water" && x > f.x + 0.3 && x < f.x + f.size - 0.3);
    return river !== undefined && y < this.waterLevel(river.x) - 0.35;
  }

  /* Logs drift back and forth on the current, bobbing (a smooth to-and-fro over their span). */
  private stepLogs(dt: number): void {
    for (const log of this.logs) {
      log.px = log.x;
      log.phase += (dt * log.spec.speed) / Math.max(0.5, log.spec.span);
      const x = log.spec.x + log.spec.span * (0.5 - 0.5 * Math.cos(log.phase));
      log.vx = (x - log.x) / dt;
      log.x = x;
    }
  }

  /* C: the truck, left somewhere behind, comes down out of the sky beside her. */
  callCar(): boolean {
    const e = this.crew.explorer.body;
    const v = this.crew.car.vehicle;
    if (this.onFoot || this.crew.mode !== "foot" || Math.abs(v.x - e.x) < CALL.farther) return false;
    v.drop(e.x + e.facing * CALL.ahead, CALL.height);
    this.context.audio.ignition();
    this.context.fx.punch(0.04);
    return true;
  }

  /*
   * Barricades: a wall of logs and spikes. The car stops against it, or is wrecked if it comes
   * in fast; flying over is too high. On foot it holds until the gang behind it is beaten: a blade
   * only thuds into it.
   */
  private stepStops(dt: number): void {
    const car = this.crew.car;
    const v = car.vehicle;
    const e = this.crew.explorer;
    for (const stop of this.stops) {
      if (stop.broken) continue;
      const ground = this.terrain.height(stop.x);
      const front = stop.x - 0.6;
      // Brake assist: on the approach the truck slows itself to roll up to the wall, never into it.
      const gap = front - 2.4 - v.x;
      if (car.occupied && v.grounded && gap > 0 && gap < STOP_ASSIST.range) {
        const allowed = Math.max(STOP_ASSIST.crawl, gap * STOP_ASSIST.slope);
        if (v.vx > allowed) v.vx = Math.max(allowed, v.vx - STOP_ASSIST.brake * dt);
      }
      if (v.x + 2.4 > front && v.x < stop.x + 1 && v.y < ground + BARRICADE.height) {
        if (car.wrecked === 0 && v.vx > BARRICADE.wreck) car.crash();
        v.x = front - 2.4;
        v.vx = Math.min(0, v.vx) - 0.5;
      }
      if (this.crew.mode !== "foot") continue;
      const b = e.body;
      if (b.x > front - 0.3 && b.x < stop.x + 1) {
        b.x = front - 0.3;
        b.vx = Math.min(0, b.vx);
      }
      const box = e.hitbox;
      if (e.striking && !e.struck.has(stop) && box.x1 > front && box.x0 < stop.x + 0.6) {
        e.struck.add(stop);
        e.recoil();
        this.context.audio.crack();
        this.context.particles.dust(front, ground + 1.2, -3, 8, 0.8);
      }
    }
  }

  /* The finale: thrusters full, the car rises off the pad into the night, then the stage ends. */
  private stepLiftoff(dt: number, input: InputSnapshot): void {
    const v = this.crew.car.vehicle;
    this.liftoff += dt;
    v.tank = CAR.thrustTank;
    this.crew.step(dt, this.gravity, { ...input, move: 0, flipPressed: 0, jumpHeld: true, jumpPressed: false }, { board: false, alight: false });
    this.context.particles.update(dt, this.terrain, this.gravity);
    // The pad's launch rig takes over from the driver: a steady, level climb.
    v.vy = Math.min(24, Math.max(v.vy, 0) + 15 * dt);
    v.vx *= Math.exp(-2 * dt);
    v.spinRate += (-v.angle * 20 - v.spinRate * 6) * dt;
    if (this.liftoff > LIFTOFF_TIME) this.done = true;
  }

  /** Back at the last checkpoint: on the road in the truck, or on foot in the jungle. */
  respawn(): void {
    this.context.audio.respawn();
    this.context.combo.break();
    this.fade = 1;
    this.respawnIn = 0;
    const at = checkpointBefore(this.config.checkpoints, this.reached) + 1;
    this.restoreMission();
    if (this.onFoot) {
      const e = this.crew.explorer;
      e.place(at);
      e.heal();
      // The dark clears around her; packs ahead of the checkpoint will come again.
      for (const b of this.boars) {
        if (b.state !== "gone" && b.state !== "wait") b.state = "gone";
      }
      this.boulders = [];
      for (const [i, m] of this.mates.entries()) if (m.alive && m.state !== "caged") m.place(at - 2 - i * 1.7);
      for (const a of this.ambushes) {
        if (a.spec.x <= at) continue;
        a.sprung = false;
        a.queue = [];
      }
      return;
    }
    this.crew.car.reset(at);
    this.crew.seat();
    this.boardIn = -1;
    // A fight still going is called off: its gang goes back behind the wall, to come again when she steps out.
    for (const fight of this.encounters) {
      if (fight.cleared || !fight.started) continue;
      for (const b of fight.enemies) b.state = "gone";
      fight.started = false;
      fight.left = fight.spec.enemies;
      fight.enemies = [];
      fight.stop.logs = BARRICADE.logs;
    }
  }

  draw(view: View, alpha: number): void {
    const { ctx, painter, time, dt } = view;
    const car = this.crew.car;
    const v = car.vehicle;
    // Follow the car where it's drawn (between physics steps), or it shudders against the scene.
    const foot = this.crew.mode !== "car";
    const target = foot ? this.crew.explorer.body : v;
    let fx = target.px + (target.x - target.px) * alpha;
    let fy = target.py + (target.y - target.py) * alpha;
    // Lead room: the frame looks ahead of her, the way she's going; in a fight it leans toward the enemy.
    const body = this.crew.explorer.body;
    const wantLead = foot ? body.facing * (Math.abs(body.vx) > 0.5 ? DIRECTOR.lead : DIRECTOR.leadIdle) : 0;
    this.lead += (wantLead - this.lead) * Math.min(1, dt * 1.6);
    fx += this.fightAt !== null && foot ? (this.fightAt - fx) * 0.3 : this.lead;
    // A conversation frames its two speakers; a held shot (a kill, a new place) frames its own point.
    if (this.talk) {
      fx = this.talk.focus.x;
      fy = this.talk.focus.y;
    } else if (this.shot) {
      this.shot.left -= dt;
      fx = this.shot.x;
      fy = this.shot.y;
      if (this.shot.left <= 0) this.shot = null;
    }
    this.camera.follow(fx, fy, foot ? body.vx * 0.5 : target.vx, Math.max(-2, this.terrain.height(fx)), Math.min(dt, 1 / 20));
    const snapped = this.camera.snapped();
    // Shake from ignitions, boosts and crashes (decays in the car).
    const shake = car.shake / PPM;
    const camera = { x: snapped.x + (Math.random() - 0.5) * shake, y: snapped.y + (Math.random() - 0.5) * shake };
    const toScreen = projector(camera, this.width, this.height);

    // The painted backdrop, softened when the camera's in close (a film's shallow focus), never blown up
    // into blocks; in a conversation it goes out of focus and darker behind the speakers, the ground
    // they stand on and everyone on it staying sharp.
    ctx.imageSmoothingEnabled = view.zoom > 1.02;
    ctx.imageSmoothingQuality = "high";
    this.focus = this.talk ? Math.min(1, this.focus + view.dt * 2.5) : Math.max(0, this.focus - view.dt * 2.5);
    const soft = this.focus > 0.02 && !this.context.still ? `blur(${(this.focus * 2.5).toFixed(2)}px) brightness(${(1 - this.focus * 0.28).toFixed(2)})` : "none";
    ctx.filter = soft;
    if (this.world) {
      this.world.drawBack(ctx, camera, time);
      ctx.filter = "none";
      ctx.imageSmoothingEnabled = false;
      this.world.drawGround(ctx, camera, time);
    }
    if (this.city) {
      ctx.imageSmoothingEnabled = view.zoom > 1.02;
      ctx.filter = soft;
      this.city.drawBack(ctx, camera);
      ctx.filter = "none";
      ctx.imageSmoothingEnabled = false;
      this.city.drawGround(ctx, camera);
      this.city.drawLamps(ctx, toScreen, camera, 0);
    }
    if (this.village) {
      ctx.imageSmoothingEnabled = view.zoom > 1.02;
      ctx.filter = soft;
      this.village.drawBack(ctx, camera);
      ctx.filter = "none";
      ctx.imageSmoothingEnabled = false;
      this.village.drawGround(ctx, camera);
      this.village.drawLanterns(ctx, toScreen, camera, time);
    }
    this.drawObstacles(painter, toScreen);
    this.drawFinish(ctx, painter, toScreen, time);
    for (const c of this.config.checkpoints.slice(1)) {
      const [x, y] = toScreen(c, this.terrain.height(c));
      painter.rect(x, y - 10, 1, 10, "#a2aba8");
      painter.rect(x + 1, y - 10, 4, 3, c <= this.reached ? "#7fb04e" : "#fa2e00");
    }
    this.drawRings(ctx, toScreen, time, false);
    // Food (a bunch of bananas, a hay bundle) and Spark Hearts (a red heart glowing).
    for (const h of this.sparks.items) {
      if (h.taken) continue;
      const [x, y] = toScreen(h.x, h.y + Math.sin(time * 2.4 + h.phase) * 0.1);
      if (x < -20 || x > this.width + 20) continue;
      glow(ctx, x, y, 12, "255, 80, 90", 0.45);
      painter.disc(x - 1.6, y - 1, 2.2, "#ff4a5a");
      painter.disc(x + 1.6, y - 1, 2.2, "#ff4a5a");
      painter.poly([[x - 3.6, y - 0.4], [x + 3.6, y - 0.4], [x, y + 3.6]], "#ff4a5a");
    }
    for (const cell of this.cells.items) {
      if (cell.taken) continue;
      const [x, y] = toScreen(cell.x, cell.y + Math.sin(time * 2.6 + cell.phase) * 0.1);
      glow(ctx, x, y, 11, "103, 211, 255", 0.5);
      blit(ctx, this.sprites.cell, x, y);
    }
    for (const t of this.traffic) {
      const [x, y] = toScreen(t.at, this.terrain.height(t.at));
      blit(ctx, t.sprite, x, y + 1);
      glow(ctx, x - LENGTH[t.kind] * 8, y - (t.kind === "truck" ? 9 : 10), t.moving ? 6 : 9, "255, 60, 60", t.moving ? 0.5 : 0.85);
    }
    this.drawBarricades(painter, toScreen);
    this.drawProps(painter, toScreen, time);
    this.drawRopes(ctx, toScreen, time);
    this.drawLogs(painter, toScreen, alpha);
    this.drawWalks(ctx, painter, toScreen, time);
    this.drawBoulders(ctx, toScreen);
    this.drawTorches(ctx, painter, toScreen, time);
    this.debris.draw(ctx, toScreen, this.width);
    for (const boar of this.boars) if (!(boar.fighter || boar.animal3D) || !this.fighters.ready) boar.draw(ctx, toScreen, time);
    this.context.particles.draw(painter, toScreen, view.frame);
    this.drawWaves(ctx, toScreen);
    this.drawBars(ctx, painter, toScreen, time);
    if (this.truck) car.draw(ctx, painter, toScreen, alpha, true);
    // The people, in 3D, over the scene: the hero when out of the truck, the gangs and the animals.
    // Until the models have loaded, the 2D explorer.
    const hero = foot ? this.crew.explorer : null;
    if (this.fighters.ready) this.drawShadows(ctx, toScreen, hero);
    const nose = car.vehicle.toWorld(2.3, 0.1);
    const lamps = car.wrecked === 0 ? { x: nose.x, y: nose.y, dir: Math.cos(car.vehicle.angle) >= 0 ? 1 : -1 } : null;
    const dark = DARK.has(this.config.scene);
    if (dark) this.drawDark(ctx, toScreen, camera, time);
    const framing = { zoom: view.zoom, pivotX: view.pivot.x, pivotY: view.pivot.y, roll: view.roll, ox: view.ox, oy: view.oy };
    const torch = dark && hero ? { x: hero.body.x, y: hero.body.y } : null;
    this.drawShots(ctx, toScreen);
    const missionArt = this.mission?.snapshot();
    if (missionArt && !missionArt.keyHeld && !missionArt.keyAvailable && this.keyCarrier && this.keyCarrier.health > 0) { const [kx, ky] = toScreen(this.keyCarrier.x, this.keyCarrier.y + 2.4); drawDroppedPrisonKey(painter, kx, ky, 0); }
    if (missionArt?.keyAvailable) { const [kx, ky] = toScreen(missionArt.keyX, this.terrain.height(missionArt.keyX)); drawDroppedPrisonKey(painter, kx, ky, time); }
    if (missionArt && !missionArt.cageOpen && (missionArt.phase === "transporting" || missionArt.phase === "intercept")) { const [cx, cy] = toScreen(missionArt.cageX, this.terrain.height(missionArt.cageX)); drawPrisonTransportDolly(painter, cx, cy); }
    const lights: SceneLight[] = this.torches.map((x) => ({ x, y: this.terrain.height(x) + TORCH.height, color: TORCH.color, power: TORCH.power }));
    const cages = this.cages.map((c) => ({ x: c.x + (c.shake > 0 ? Math.sin(time * 70) * 0.03 : 0), y: this.terrain.height(c.x), broken: c.broken }));
    if (!this.fighters.draw(camera, framing, dt, alpha, hero, this.boars, lamps, 1 - Math.max(this.fade, view.fade), torch, [...this.cages.filter((c) => !c.broken).map((c) => c.mate), ...this.mates, ...this.leaving], lights, cages) && hero) hero.draw(ctx, painter, toScreen, alpha, dt, this.gravity);
    this.drawRings(ctx, toScreen, time, true);
    if (this.world) this.world.drawFront(ctx, camera, time, this.context.still);
    this.village?.drawRain(ctx, time, this.context.still);
    this.drawSnow(ctx, view.dt);
    this.context.score.draw(ctx, toScreen);
  }

  /* Ropes over the ravines: a branch overhead, and the rope hanging from it (swaying), or taut to her hands. */
  private drawRopes(ctx: CanvasRenderingContext2D, toScreen: ToScreen, time: number): void {
    void time;
    for (const rope of this.ropes) {
      const [ax, ay] = toScreen(rope.x, rope.y);
      if (ax < -60 || ax > this.width + 60) continue;
      // The branch: a dark limb running in from off the top of the view.
      ctx.save();
      ctx.strokeStyle = "#1c140e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax - 40, ay - 26);
      ctx.quadraticCurveTo(ax - 8, ay - 2, ax + 26, ay - 6);
      ctx.stroke();
      // The rope itself: one thick line through its links (taut and straight under her weight, the
      // free end hanging below her hands), a knot at the end.
      const held = this.crew.explorer.ropeAnchor;
      const heroHands = this.fighters.hands ?? this.crew.explorer.hands;
      const heroHolding = held !== null && held.x === rope.x && held.y === rope.y;
      const companion = this.mates.find((m) => m.navigationPose.rope?.x === rope.x);
      const hands = heroHolding ? heroHands : companion ? { x: companion.x, y: companion.y + 0.8 } : heroHands;
      const holding = heroHolding || companion !== undefined;
      const points = holding ? [[ax, ay] as [number, number], toScreen(hands.x, hands.y), toScreen(hands.x + (rope.links[ROPE_LINKS].x - hands.x) * 0.3, hands.y - 0.55)] : rope.links.map((l) => toScreen(l.x, l.y));
      ctx.strokeStyle = "#8a6a44";
      ctx.lineWidth = 1.6;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length - 1; i++) {
        const mx = (points[i][0] + points[i + 1][0]) / 2;
        const my = (points[i][1] + points[i + 1][1]) / 2;
        ctx.quadraticCurveTo(points[i][0], points[i][1], mx, my);
      }
      const end = points[points.length - 1];
      ctx.lineTo(end[0], end[1]);
      ctx.stroke();
      ctx.fillStyle = "#6e5236";
      ctx.fillRect(end[0] - 1, end[1] - 1, 2, 2);
      ctx.restore();
    }
  }

  /* Torches on poles: a small live flame and a soft halo, no more (the light itself falls on the figures in 3D). */
  private drawTorches(ctx: CanvasRenderingContext2D, painter: Painter, toScreen: ToScreen, time: number): void {
    for (const x of this.torches) {
      const [sx, sy] = toScreen(x, this.terrain.height(x));
      if (sx < -30 || sx > this.width + 30) continue;
      const top = sy - TORCH.height * PPM;
      painter.rect(sx - 0.5, top, 1.5, TORCH.height * PPM, "#2a1c12");
      painter.rect(sx - 1.5, top - 1, 3.5, 2, "#3a2a1c");
      const flicker = Math.sin(time * 17 + x) * 0.6 + Math.sin(time * 29 + x * 3) * 0.4;
      painter.disc(sx + 0.3, top - 3 + flicker * 0.3, 2.2, "#ff8a2a");
      painter.disc(sx + 0.3 + flicker * 0.3, top - 4.5 + flicker * 0.4, 1.2, "#ffd28a");
      glow(ctx, sx, top - 3, 22, "255, 140, 60", 0.16 + flicker * 0.02);
    }
  }

  /* Tree walkways: a trunk with its vine hanging to the ground, planks between posts high above the path, a rope rail. */
  private drawWalks(ctx: CanvasRenderingContext2D, painter: Painter, toScreen: ToScreen, time: number): void {
    for (const w of this.walks) {
      const [x0, y] = toScreen(w.x0, w.y);
      const [x1] = toScreen(w.x1, w.y);
      if (x1 < -40 || x0 > this.width + 40) continue;
      // The trunk, rising past the planks into the canopy, and the vine down it.
      const [tx, ground] = toScreen(w.x0 - 0.9, this.terrain.height(w.x0 - 0.9));
      painter.rect(tx - 4, y - 46, 8, ground - y + 46, "#1a130d");
      painter.rect(tx - 4, y - 46, 2, ground - y + 46, "#2a1f15");
      painter.disc(tx, y - 48, 16, "#0d1a10");
      painter.disc(tx + 12, y - 42, 11, "#102014");
      const [vx, vGround] = toScreen(w.x0 - 0.35, this.terrain.height(w.x0 - 0.35));
      ctx.save();
      ctx.strokeStyle = "#3e5a2a";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(vx, y - 2);
      for (let k = 1; k <= 8; k++) ctx.lineTo(vx + Math.sin(time * 1.1 + k * 0.9) * 0.6, y - 2 + ((vGround - y + 2) * k) / 8);
      ctx.stroke();
      ctx.restore();
      for (let k = 0; k < 6; k++) painter.disc(vx + (k % 2 ? 1.2 : -1.2), y + ((vGround - y) * (k + 0.5)) / 6, 1.3, "#4a6e32");
      // Posts down to the ground, the planks, and a rope rail.
      for (let px = w.x0 + 1; px < w.x1; px += 6) {
        const [sx, sy] = toScreen(px, this.terrain.height(px));
        painter.rect(sx - 0.75, y, 1.5, sy - y, "#2a1f15");
      }
      painter.rect(x0, y, x1 - x0, 3, "#5a4232");
      for (let px = x0; px < x1; px += 5) painter.rect(px, y, 0.5, 3, "#3a2a1c");
      painter.rect(x0, y - 9, x1 - x0, 0.6, "#8a6a44");
    }
  }

  /* Boulders: grey rock, lit from above, with a crack that turns as it rolls. */
  private drawBoulders(ctx: CanvasRenderingContext2D, toScreen: ToScreen): void {
    for (const rock of this.boulders) {
      const [x, y] = toScreen(rock.x, rock.y);
      if (x < -20 || x > this.width + 20) continue;
      const r = BOULDER.radius * PPM;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rock.angle);
      ctx.fillStyle = "#4e4842";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6e6760";
      ctx.beginPath();
      ctx.arc(-r * 0.25, -r * 0.3, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2e2a26";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, 0);
      ctx.lineTo(r * 0.5, r * 0.2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* Logs on the river: round-ended trunks, bark-dark with a pale cut end, bobbing on the water. */
  private drawLogs(painter: Painter, toScreen: ToScreen, alpha: number): void {
    for (const log of this.logs) {
      const [x, y] = toScreen(log.px + (log.x - log.px) * alpha, this.waterLevel(log.spec.x) + 0.1);
      if (x < -40 || x > this.width + 40) continue;
      painter.rect(x - 20, y - 4, 40, 5, "#3a2a1c");
      painter.rect(x - 20, y - 4, 40, 1, "#5a4232");
      painter.disc(x - 20, y - 1.5, 2.5, "#3a2a1c");
      painter.disc(x + 20, y - 1.5, 2.5, "#8a6a44");
    }
  }

  /* Snow falling on the pass: slow flakes drifting across the view (no gradients; a handful of pixels). */
  private drawSnow(ctx: CanvasRenderingContext2D, dt: number): void {
    if (this.flakes.length === 0) return;
    ctx.fillStyle = "rgba(240, 246, 255, 0.85)";
    for (const f of this.flakes) {
      f.y += dt * 18 * f.s;
      f.x += dt * (6 + Math.sin(f.y * 0.05) * 6) * f.s;
      if (f.y > this.height) f.y -= this.height;
      if (f.x > this.width) f.x -= this.width;
      ctx.fillRect(f.x, f.y, f.s, f.s);
    }
  }

  /* The Master Stroke's shockwave: a ring of dust and light racing out along the ground. */
  private drawWaves(ctx: CanvasRenderingContext2D, toScreen: ToScreen): void {
    for (const w of this.waves) {
      const k = w.t / 0.8;
      const [x, y] = toScreen(w.x, w.y);
      const r = MASTER.reach * PPM * Math.sqrt(k);
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = "#ffd9a0";
      ctx.lineWidth = 2 * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      glow(ctx, x, y - 8, r * 0.8, "255, 200, 140", 0.35 * (1 - k));
    }
  }

  /*
   * Health over heads: the team in the brand's orange (and, when one is down, a blinking call for
   * help with its time running out), the big enemies (and any hurt one) in red.
   */
  private drawBars(ctx: CanvasRenderingContext2D, painter: Painter, toScreen: ToScreen, time: number): void {
    const bar = (x: number, y: number, share: number, color: string): void => {
      const [sx, sy] = toScreen(x, y);
      if (sx < -20 || sx > this.width + 20) return;
      painter.rect(sx - 8, sy, 16, 2, "rgba(10, 8, 14, 0.7)");
      painter.rect(sx - 8, sy, 16 * Math.max(0, Math.min(1, share)), 2, color);
    };
    const tall: Partial<Record<string, number>> = { raider: 1.95, brute: 2.35, chief: 2.85, wolf: 1.05, dog: 0.8 };
    for (const b of this.boars) {
      if (!b.active || b.health <= 0 || (!b.big && b.health >= b.maxHealth)) continue;
      bar(b.x, b.y + (tall[b.kind] ?? 1.5) + 0.35, b.health / b.maxHealth, "#e2382a");
    }
    for (const m of this.mates) {
      if (m.state === "caged" || m.state === "dead" || m.carrier || m === this.mount || m.alpha < 0.5) continue;
      const top = m.y + m.spec.height + 0.3;
      if (m.state === "wounded") {
        // Down: a blinking "!" and its time running out.
        const [sx, sy] = toScreen(m.x, top + 0.3);
        if (Math.floor(time * 4) % 2 === 0) {
          ctx.save();
          ctx.font = "700 9px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "#ff7a1a";
          ctx.fillText("!", sx, sy);
          ctx.restore();
        }
        bar(m.x, top, m.bleeding / WOUND.wait, "#ffb347");
        continue;
      }
      if (m.healing) {
        // Healing: little green crosses rising off them, the bar turning green as it fills.
        for (let k = 0; k < 3; k++) {
          const rise = (time * 0.9 + k / 3) % 1;
          const [hx, hy] = toScreen(m.x + (k - 1) * 0.22, m.y + m.spec.height * 0.6 + rise * 0.9);
          ctx.save();
          ctx.globalAlpha = 1 - rise;
          ctx.fillStyle = "#7ee07a";
          ctx.fillRect(hx - 1.5, hy - 0.4, 3, 0.8);
          ctx.fillRect(hx - 0.4, hy - 1.5, 0.8, 3);
          ctx.restore();
        }
        bar(m.x, top, m.health, "#6fd36a");
        continue;
      }
      bar(m.x, top, m.health, "#fa6a1a");
    }
  }

  /* The team's shots in flight: an arrow's streak, or the Mage's bolt of fire. */
  private drawShots(ctx: CanvasRenderingContext2D, toScreen: ToScreen): void {
    for (const shot of this.shots) {
      const k = 1 - shot.left / 0.18;
      const [x0, y0] = toScreen(shot.x0 + (shot.x1 - shot.x0) * Math.max(0, k - 0.25), shot.y0 + (shot.y1 - shot.y0) * Math.max(0, k - 0.25));
      const [x1, y1] = toScreen(shot.x0 + (shot.x1 - shot.x0) * k, shot.y0 + (shot.y1 - shot.y0) * k);
      ctx.save();
      ctx.strokeStyle = shot.fire ? "rgba(255, 150, 60, 0.95)" : "rgba(220, 210, 190, 0.9)";
      ctx.lineWidth = shot.fire ? 1.5 : 0.75;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
      if (shot.fire) glow(ctx, x1, y1, 8, "255, 120, 40", 0.5);
    }
  }

  /*
   * The jungle at night: beyond the lantern's reach everything falls into darkness (the lantern's
   * light itself falls on the figures in 3D, not as a glow painted round her), and fireflies drift.
   */
  private drawDark(ctx: CanvasRenderingContext2D, toScreen: ToScreen, camera: Camera, time: number): void {
    const e = this.crew.explorer.body;
    const [hx, hy] = toScreen(e.x, e.y + 1.2);
    const shade = ctx.createRadialGradient(hx, hy, LANTERN.inner * PPM, hx, hy, LANTERN.outer * PPM);
    shade.addColorStop(0, "rgba(2, 4, 8, 0.08)");
    shade.addColorStop(0.5, `rgba(2, 4, 8, ${LANTERN.dark * 0.6})`);
    shade.addColorStop(1, `rgba(2, 4, 8, ${LANTERN.dark})`);
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, this.width, this.height);
    // The torches push the dark back a little where they stand.
    for (const x of this.torches) {
      const [tx, ty] = toScreen(x, this.terrain.height(x) + TORCH.height);
      if (tx < -80 || tx > this.width + 80) continue;
      glow(ctx, tx, ty, 4 * PPM, "255, 140, 60", 0.12);
    }
    for (let i = 0; i < FIREFLIES; i++) {
      // Each one drifts on its own slow loop around a spot along the path, and blinks.
      const home = Math.floor(camera.x / 40) * 40 + (hash(i, 61) - 0.5) * 80;
      const fx = home + Math.sin(time * (0.3 + hash(i, 62) * 0.4) + i) * 2.5;
      const fy = this.terrain.height(fx) + 0.6 + hash(i, 63) * 3 + Math.sin(time * 0.7 + i * 1.7) * 0.5;
      const blink = Math.max(0, Math.sin(time * (1.2 + hash(i, 64)) + i * 2.1));
      if (blink < 0.05) continue;
      const [x, y] = toScreen(fx, fy);
      if (x < -10 || x > this.width + 10) continue;
      glow(ctx, x, y, 5, "190, 255, 120", 0.5 * blink);
      ctx.fillStyle = `rgba(230, 255, 170, ${blink})`;
      ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
    }
  }

  /* A ring seen edge-on: a tall glowing ellipse; its back half behind the car, front half in front. */
  private drawRings(ctx: CanvasRenderingContext2D, toScreen: ToScreen, time: number, front: boolean): void {
    for (const ring of this.rings) {
      if (ring.taken) continue;
      const [x, y] = toScreen(ring.x, ring.y);
      if (x < -40 || x > this.width + 40) continue;
      const r = RING_RADIUS * PPM;
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(255, ${150 + Math.round(Math.sin(time * 4) * 40)}, 60, 0.95)`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.32, r, 0, front ? -Math.PI / 2 : Math.PI / 2, front ? Math.PI / 2 : (Math.PI * 3) / 2);
      ctx.stroke();
      ctx.restore();
      if (!front) glow(ctx, x, y, r * 1.3, "255, 120, 40", 0.35);
    }
  }

  private drawFinish(ctx: CanvasRenderingContext2D, painter: Painter, toScreen: ToScreen, time: number): void {
    const x0 = this.config.finish;
    const [x, y] = toScreen(x0, this.terrain.height(x0));
    if (x < -120 || x > this.width + 120) return;
    // On foot: the truck itself is the finish, or there's no line at all (the way just goes on).
    if (this.onFoot) return;
    if (this.config.scene === "forest") {
      blit(ctx, this.sprites.pad, x, y + 1);
      return;
    }
    // City limits: an arch of two pillars and a neon sign.
    painter.rect(x - 34, y - 46, 4, 46, "#2a2d33");
    painter.rect(x + 30, y - 46, 4, 46, "#2a2d33");
    painter.rect(x - 36, y - 50, 72, 8, "#14161c");
    ctx.save();
    ctx.font = "700 6px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = Math.sin(time * 6) > -0.8 ? "#ff5b28" : "#7a2a14";
    ctx.fillText(this.config.scene === "village" ? "HIGHWAY" : "CITY LIMITS", x, y - 44);
    ctx.restore();
    glow(ctx, x, y - 46, 40, "250, 46, 0", 0.35);
  }

  /* Crate stacks, market stalls with striped awnings, fences: drawn until they're smashed. */
  private drawProps(painter: Painter, toScreen: ToScreen, time: number): void {
    for (const prop of this.props) {
      if (prop.broken) continue;
      const [x, y] = toScreen(prop.x, this.terrain.height(prop.x));
      if (x < -60 || x > this.width + 60) continue;
      if (prop.kind === "crates") {
        for (const [cx, cy] of [[-13, 0], [0, 0], [-6, -13]] as const) {
          painter.rect(x + cx, y + cy - 13, 13, 13, "#8a6440");
          painter.rect(x + cx, y + cy - 13, 13, 1, "#a47a4e");
          painter.line(x + cx + 1, y + cy - 12, x + cx + 12, y + cy - 1, "#5a3f26");
          painter.line(x + cx + 12, y + cy - 12, x + cx + 1, y + cy - 1, "#5a3f26");
        }
      } else if (prop.kind === "stall") {
        const awning = this.config.scene === "village" ? ["#e0481c", "#f1e6d2"] : ["#2f6db0", "#f1e6d2"];
        painter.rect(x - 24, y - 38, 2, 38, "#4a3424");
        painter.rect(x + 22, y - 38, 2, 38, "#4a3424");
        painter.rect(x - 24, y - 16, 48, 4, "#6b4b2e");
        painter.rect(x - 24, y - 12, 48, 12, "#5a3f26");
        for (let i = 0; i < 8; i++) painter.rect(x - 26 + i * 6.5, y - 42 + Math.sin(time * 2 + i) * 0.5, 6.5, 6, awning[i % 2]);
        for (let i = 0; i < 7; i++) painter.disc(x - 18 + i * 6, y - 18, 2, i % 3 === 0 ? "#d9a91c" : i % 3 === 1 ? "#3f7a5a" : "#e0481c");
      } else {
        for (let i = 0; i < 4; i++) painter.rect(x - 24 + i * 16, y - 18, 2, 18, "#5a4232");
        painter.rect(x - 24, y - 15, 50, 2, "#7a5c43");
        painter.rect(x - 24, y - 8, 50, 2, "#7a5c43");
      }
    }
  }

  /*
   * Contact shadows under everyone drawn in 3D, so they stand on the ground rather than float:
   * soft dark ovals, wider under a body lying down, fading as it lifts off the ground.
   */
  private drawShadows(ctx: CanvasRenderingContext2D, toScreen: ToScreen, hero: Explorer | null): void {
    const oval = (x: number, y: number, width: number, height: number): void => {
      const ground = this.terrain.height(x);
      const lift = Math.max(0, y - ground);
      if (lift > 3) return;
      const [sx, sy] = toScreen(x, ground);
      ctx.fillStyle = `rgba(6, 5, 10, ${0.42 * (1 - lift / 3)})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, (width * PPM) / 2, height, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const b of this.boars) {
      if (!(b.fighter || b.animal3D) || b.state === "gone" || (b.state === "wait" && Math.abs(b.x - this.camera.x) > 20)) continue;
      const width = b.limp ? 1.7 : b.animal3D ? 1.2 : 0.9;
      oval(b.ragdoll?.points.pelvis.x ?? b.x, b.ragdoll?.points.pelvis.y ?? b.y, width, 1.5);
    }
    if (hero) oval(hero.ragdoll?.points.pelvis.x ?? hero.body.x, hero.body.y, hero.ragdoll ? 1.7 : 0.8, 1.5);
  }

  /* A barricade: logs lashed upright, sharpened stakes, a red rag; it sheds logs as its gang falls. */
  private drawBarricades(painter: Painter, toScreen: ToScreen): void {
    for (const stop of this.stops) {
      if (stop.broken) continue;
      const [x, y] = toScreen(stop.x, this.terrain.height(stop.x));
      if (x < -40 || x > this.width + 40) continue;
      const logs = 2 + stop.logs;
      for (let i = 0; i < logs; i++) {
        const h = 26 + ((i * 7) % 11);
        painter.rect(x - 10 + i * 4, y - h, 3, h, i % 2 ? "#5a4232" : "#6b4f3a");
        painter.poly([[x - 10 + i * 4, y - h], [x - 8.5 + i * 4, y - h - 4], [x - 7 + i * 4, y - h]], "#7a5c43");
      }
      painter.rect(x - 11, y - 18, logs * 4 + 2, 2, "#3a2a1c");
      painter.rect(x - 11, y - 8, logs * 4 + 2, 2, "#3a2a1c");
      painter.rect(x - 2, y - 24, 4, 5, "#b5452a");
    }
  }

  /* Logs, barriers, ramp lips and gap warnings drawn over the shapes they make in the ground. */
  private drawObstacles(painter: Painter, toScreen: ToScreen): void {
    for (const f of this.config.features) {
      const [sx] = toScreen(f.x, 0);
      if (sx < -60 || sx > this.width + 60) continue;
      if (f.kind === "log") {
        const [x, y] = toScreen(f.x, this.terrain.height(f.x) - 0.42);
        painter.disc(x, y - 0.21 * PPM, 6.5, "#2a1c15");
        painter.disc(x, y - 0.21 * PPM, 4, "#5a4232");
      } else if (f.kind === "barrier") {
        const [x, y] = toScreen(f.x, this.terrain.height(f.x));
        for (let i = 0; i < 4; i++) painter.rect(x - 5 + i * 3, y - 2, 3, 3, i % 2 ? "#e9e4d6" : "#fa2e00");
      } else if (f.kind === "ramp") {
        const end = f.x + f.size;
        const [x, y] = toScreen(end, this.terrain.height(end - 0.05));
        painter.rect(x - 2, y, 2, f.size * 0.22 * PPM, "#2a2d33");
        for (let i = 0; i < 4; i++) painter.rect(x - 1, y + i * 4, 1, 2, "#ffd27a");
      } else if (f.kind === "water") {
        // The river: dark water from its surface down, a pale line of light along the top.
        const surface = this.waterLevel(f.x);
        const [x0, y0] = toScreen(f.x - 0.3, surface);
        const [x1] = toScreen(f.x + f.size + 0.3, 0);
        painter.rect(x0, y0, x1 - x0, Math.max(0, this.height - y0), this.config.scene === "coast" ? "#0e1c30" : "#10221e");
        for (let i = 0; i < (x1 - x0) / 6; i++) painter.rect(x0 + i * 6 + Math.sin(this.clock * 2 + i) * 1.5, y0, 3, 0.5, "rgba(200, 220, 230, 0.45)");
      } else if (f.kind === "ravine") {
        // The ravine is a dark chasm from its lips down: without this the sky glow behind the scene shows through the pit.
        {
          const [x0, y0] = toScreen(f.x, Math.min(this.terrain.height(f.x - 0.05), this.terrain.height(f.x + f.size + 0.05)));
          const [x1] = toScreen(f.x + f.size, 0);
          painter.rect(x0, y0 + 2, x1 - x0, Math.max(0, this.height - y0), "#05060a");
        }
        if (this.onFoot) continue;
        const [x, y] = toScreen(f.x - 5, this.terrain.height(f.x - 5));
        painter.rect(x, y - 12, 1, 12, "#a2aba8");
        painter.poly([[x - 4, y - 16], [x + 5, y - 16], [x + 5, y - 11], [x - 4, y - 11]], "#ffd27a");
        painter.line(x - 2, y - 15, x, y - 13, "#1b1d22");
        painter.line(x, y - 13, x - 2, y - 11, "#1b1d22");
        painter.line(x + 2, y - 15, x + 4, y - 13, "#1b1d22");
        painter.line(x + 4, y - 13, x + 2, y - 11, "#1b1d22");
      }
    }
  }

  hud(): StageHud {
    const car = this.crew.car;
    const v = car.vehicle;
    const e = this.crew.explorer;
    const gap = this.config.features.find((f) => f.kind === "ravine" && f.x - v.x > 0 && f.x - v.x < 35);
    let prompt = "";
    const foot = this.crew.mode !== "car";
    const stop = this.stopAhead(foot ? e.body.x : v.x, STOP_ZONE);
    const fight = this.fight;
    const urgent = foot ? this.urgentPrompt() : "";
    if (this.onFoot) prompt = this.footPrompt();
    else if (urgent) prompt = urgent;
    else if (this.liftoff >= 0) prompt = "Lift-off";
    else if (fight) prompt = `Copycats left: ${fight.left + fight.enemies.filter((b) => b.state !== "down" && b.state !== "gone").length}    F · Sword    Space · Jump`;
    else if (foot && this.cages.some((c) => !c.broken && Math.abs(c.x - e.body.x) < 8)) prompt = "F · Break the cage: free the prisoner";
    else if (this.boardIn > 0 || this.crew.mode === "walkToDoor") prompt = "Back to the truck";
    else if (foot && this.crew.nearDoor && !stop) prompt = "E · Back in the truck";
    else if (foot && stop) prompt = "F · Sword: beat the gang that holds the barricade    Space · Jump";
    else if (foot && Math.abs(v.x - e.body.x) > CALL.farther) prompt = "F · Sword    Space · Jump (twice in the air)    C · Call the truck";
    else if (foot) prompt = "F · Sword    Space · Jump (twice in the air)    E at the door · Back in the truck";
    else if (stop && this.crew.canAlight) prompt = "Barricade! Press E · step out and fight";
    else if (stop) prompt = "Barricade ahead: stop the truck";
    else if (v.x < 22 && this.stops[0] && !this.stops[0].broken) prompt = "→ Drive to the barricade ahead, then press E to step out and fight";
    else if (v.x < 22) prompt = "→ Drive    Space · Hop    Space in air · Booster ◆    Hold · Hover    Tap ← → in air · Flip";
    else if (car.wrecked > 0) prompt = "Wrecked: land on your wheels";
    else if (gap) prompt = "Gap ahead: hit the ramp fast and hop · short? Booster ◆";
    else if (this.boars.some((b) => b.active && b.x - v.x > 0 && b.x - v.x < 30)) prompt = "Beasts: hit them fast, fly over, or blast them with the thrusters";
    else if (car.airborne && car.flipsInAir > 0) prompt = `${car.flipsInAir} flip${car.flipsInAir > 1 ? "s" : ""}: land it level`;
    else if (this.crew.canAlight) prompt = "Stopped: E · Get out on foot";
    if (foot && this.mission) {
      const m = this.mission.snapshot();
      if (!m.cageOpen && Math.abs(e.body.x - m.cageX) < 5) prompt = m.keyHeld ? "E · Unlock the prison cage    F · Breach" : "F · Breach the prison cage, or recover the carrier’s key";
      else if (m.keyAvailable && Math.abs(e.body.x - m.keyX) < 5) prompt = "E · Pick up the prison key";
    }
    const driving = this.crew.mode === "car";
    const near = (b: Boar): boolean => b.active && Math.abs(b.x - (foot ? e.body.x : v.x)) < 14;
    const mood: Mood = driving ? "drive" : this.boars.some((b) => near(b) && b.kind === "brute") ? "boss" : this.boars.some((b) => near(b) && (b.fighter || b.kind === "wolf")) ? "fight" : "explore";
    const party = this.context.party;
    return {
      revive: foot ? this.reviveOffer() : null,

      sparkHearts: party.hearts,
      talking: this.talk !== null,
      mood,
      armed: foot && this.crew.mode === "foot",
      weapon: e.arm.name,
      fire: !e.fireUnlocked ? "locked" : e.burning > 0 ? "burning" : e.fireRecharge > 0 ? "charging" : "ready",
      fireCharge: e.fireCharge,
      master: e.master,
      stroke: e.stroke >= 0,
      routeMap: this.routeMap(),
      objective: this.missionGuidance(),
      team: this.mates.filter((m) => m.state !== "caged").map((m) => ({ name: m.spec.name, distance: Math.round(m.x - e.body.x), fighting: m.state === "attack", health: m.health, alive: m.alive, down: m.state === "wounded" })),
      prompt,
      speed: driving ? v.speed * 3.6 : null,
      tank: driving ? v.tank / CAR.thrustTank : null,
      altitude: null,
      hearts: foot ? e.hearts : null,
      fuel: driving ? car.fuelSeconds : null,
      landIn: this.liftoff >= 0 || foot ? null : car.landIn,
      actions: !this.onFoot && (foot || stop !== undefined || this.crew.canAlight),
      foot: foot && !this.onFoot,
      line: this.line,
      // A fight is on while anything hostile is up and close, to the hero on foot or the truck.
      combat: this.boars.some((b) => b.active && (b.fighter || b.kind === "wolf") && Math.abs(b.x - (foot ? e.body.x : v.x)) < 14),
      damage: car.damage,
      boosters: driving ? { have: v.boosters, max: CAR.boosters } : undefined,
    };
  }

  /* What matters most right now, if anything: a friend down, being swarmed, a ride on offer. */
  private urgentPrompt(): string {
    const e = this.crew.explorer;
    const x = e.body.x;
    if (this.channel) return `Helping the ${this.channel.mate.spec.name} up…`;
    const down = this.mates.find((m) => m.state === "wounded");
    if (down) return Math.abs(down.x - x) < 1.8 ? `E · Help the ${down.spec.name} up` : `The ${down.spec.name} is down! Get to them (${Math.ceil(down.bleeding)}s)`;
    const close = this.boars.filter((b) => b.active && Math.abs(b.x - x) < 2.6).length;
    if (e.master >= 1 && close >= 2) return "Surrounded! M · Master Stroke";
    if (this.mount) return "Riding Gorr    E · Climb down";
    const giant = this.mates.find((m) => m.kind === "giant" && m.active);
    if (giant && Math.abs(giant.x - x) < 2 && !this.boars.some((b) => b.active && Math.abs(b.x - x) < 8)) return "E · Ride on Gorr's shoulders";
    return "";
  }

  /* What to do next in the jungle, from what's just ahead of her. */
  private footPrompt(): string {
    const e = this.crew.explorer;
    const x = e.body.x;
    if (this.config.rescueObjective && !this.rescueComplete() && x > this.config.finish - 25) return "Extraction: rescue every prisoner and bring them here alive. Check squad distances.";
    if (e.ropeAnchor) return "← → Swing    Space · Let go";
    if (e.onVine) return "Climbing…    ← or → with Space · Jump off";
    const vine = this.walks.find((w) => w.x0 - x > -1 && w.x0 - x < 6 && e.body.y < w.y - 1);
    if (vine) return "A vine up the tree: jump at it to climb to the walkway";
    const urgent = this.urgentPrompt();
    if (urgent) return urgent;
    const cage = this.cages.find((c) => !c.broken && Math.abs(c.x - x) < 8);
    if (cage) return `F · Break the cage: free the ${cage.mate.spec.name}`;
    if (Math.abs(this.crew.car.vehicle.x - x) < 14) return "The truck! Walk to its door";
    if (this.boars.some((b) => b.active && Math.abs(b.x - x) < 12)) return "F · Sword    Space · Jump    ← → Move";
    const ahead = this.config.features.find((f) => f.x - x > -1 && f.x - x < 12 && (f.kind === "ravine" || (f.kind === "ledge" && f.size > 0)));
    if (ahead?.kind === "ravine") return "Too wide to jump: run, jump, catch the rope · Space twice for height";
    if (ahead?.kind === "ledge") return ahead.size > 1.3 ? "Rock face: jump at it holding → to climb" : "Rock step: walk into it to climb";
    return "← → Walk    Space · Jump (twice in the air)    F · Sword";
  }
}

/** Points for flying: air time, flips and a clean landing, multiplied by the combo. */
export function scoreCarEvents(events: readonly CarEvent[], car: Car, context: StageContext): void {
  const v = car.vehicle;
  const { combo, score } = context;
  for (const event of events) {
    if (event.kind === "crash") {
      combo.break();
      score.add(0, "Wrecked", v.x, v.y + 2);
      // The crash lands hard: a punch in and a moment of slow motion.
      context.fx.punch(0.12);
      context.fx.slowmo(0.45);
    } else if (event.kind === "land") {
      const air = Math.round(event.air * POINTS.airPerSecond);
      if (event.clean) {
        combo.add(event.flips + 1 + (event.air > 1.2 ? 1 : 0));
        const points = (air + event.flips * STUNTS.flip + POINTS.cleanLanding) * combo.multiplier;
        const label = event.flips > 0 ? `${event.flips} flip${event.flips > 1 ? "s" : ""} · ×${combo.multiplier}` : `Air ${event.air.toFixed(1)}s · ×${combo.multiplier}`;
        score.add(points, label, v.x, v.y + 2);
        context.fx.punch(0.03 + 0.03 * event.flips);
        // Flips landed clean earn a booster charge.
        if (event.flips > 0 && v.gainBooster()) score.add(0, "+1 Booster", v.x, v.y + 3.2);
      } else {
        combo.break();
        score.add(air, "Rough landing", v.x, v.y + 2);
      }
    }
  }
}
