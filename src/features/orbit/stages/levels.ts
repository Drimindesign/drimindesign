import type { BeastKind } from "../actors/boar";
import type { MateKind } from "../actors/party";
import { random } from "../engine/noise";
import type { RoadFeature } from "../engine/terrain";
import type { AmbushSpec, BoulderZone, LogSpec, RoadConfig, StopSpec } from "./road";
type Walk = { x0: number; x1: number; above: number };
import { JUNGLE_RUN, VILLAGE_RUN } from "./routes";
import type { StageId } from "./types";

/** The places the journey passes through, over and over, harder each time round. */
export type Biome = "jungle" | "river" | "hills" | "caves" | "ruins" | "coast" | "snow";

/** The order they come in after the first two levels (the village road, then the night jungle). */
const CHAIN: readonly Biome[] = ["jungle", "river", "hills", "hills", "caves", "ruins", "coast", "jungle", "river", "snow", "hills", "caves", "ruins", "jungle"];

/** Each place's name for the title card, a line on what's ahead, and what lives there. */
const PLACES: Record<Biome, { names: readonly string[]; goal: string; animals: readonly BeastKind[]; gang: readonly BeastKind[] }> = {
  jungle: { names: ["Deep Jungle", "The Night Jungle", "Wolf Country"], goal: "Ropes over the ravines, wolves in the dark. Keep moving.", animals: ["wolf", "wolf", "wolf"], gang: ["raider", "raider", "brute"] },
  river: { names: ["The River Crossing", "Black Water", "The Ferry Logs"], goal: "Ride the floating logs across. The water won't wait for you.", animals: ["wolf", "wolf"], gang: ["raider", "raider", "brute"] },
  hills: { names: ["The High Hills", "Gorr's Hill", "The Cliff Road"], goal: "Climb. Rock face after rock face, to the top.", animals: ["wolf"], gang: ["raider", "brute", "brute"] },
  caves: { names: ["The Echo Caves", "The Deep Dark", "The Torch Halls"], goal: "Underground. Only the torches and your lantern.", animals: ["wolf"], gang: ["raider", "raider", "brute"] },
  ruins: { names: ["The Old Ruins", "Grey's Outpost", "The Broken Temple"], goal: "Grey's men hold the ruins. Take them back.", animals: ["wolf"], gang: ["raider", "brute", "raider", "brute"] },
  coast: { names: ["The Moon Coast", "Shipwreck Shore", "The Sea Cliffs"], goal: "Along the sea under the moon. Smugglers on the shore.", animals: ["wolf", "dog"], gang: ["raider", "raider", "brute"] },
  snow: { names: ["The Frozen Pass", "White Silence", "The Ice Ridge"], goal: "Snow to the knees, wolves on the ridge.", animals: ["wolf", "wolf", "wolf"], gang: ["raider", "brute"] },
};

/** What she says as she walks into each place (the opening shot is still on the way ahead). */
const OPENING: Record<Biome, string> = {
  jungle: "Deeper in. Stay sharp.",
  river: "The river. There has to be a way across.",
  hills: "Up. All the way up.",
  caves: "Torches. Someone's been down here.",
  ruins: "Grey's men. I can smell their smoke.",
  coast: "The sea. We're getting close.",
  snow: "Cold. Keep moving or freeze.",
};

/**
 * A prisoner every level, in this order round and round (one already on her team is held as a
 * villager instead: freeing them still pays). Gorr waits at the top of every hill level.
 */
/**
 * One recruit a level, light troops first and the heavy hitters later (level 1 the Knight, 2 the
 * Ranger); from level 8 the cages hold extra copies of the light troops for a bigger army.
 */
const RECRUITS: Partial<Record<number, MateKind>> = { 4: "dog", 6: "mage", 8: "barbarian", 10: "giant", 11: "rogue" };
const COPIES: readonly MateKind[] = ["knight", "ranger", "rogue"];
/** Levels without a recruit before this one hold a villager in the cage (rescued, they go home). */
const COPIES_FROM = 12;

export interface Level {
  config: RoadConfig;
  number: number;
  title: string;
  goal: string;
}

/** The first level: out of the village by road to where the road gives out at the jungle. */
const VILLAGE_END = 330;

/*
 * Level `n` (1 and up, forever). The first two are made by hand (the village road, the night
 * jungle); after that each is put together from sections (a walk, rock steps, a drop, a ravine
 * with ropes, a river with floating logs, a hill of rock faces, a gang's camp, an ambush, a cage)
 * chosen for its place and seeded by its number, so it's the same level every time it's played.
 * Every level asks a little more: wider gaps, taller faces, more enemies at once, tougher kinds;
 * every fifth ends at Grey's chief.
 */
export function level(n: number): Level {
  if (n <= 1) {
    const cut = <T extends readonly unknown[]>(list: T, x: (item: T[number]) => number): T[number][] => list.filter((item) => x(item) < VILLAGE_END - 10);
    const config: RoadConfig = {
      ...VILLAGE_RUN,
      rescueObjective: true,
      finish: VILLAGE_END,
      features: cut(VILLAGE_RUN.features, (f) => f.x + f.size),
      checkpoints: cut(VILLAGE_RUN.checkpoints, (c) => c),
      cells: cut(VILLAGE_RUN.cells, (c) => c[0]),
      rings: cut(VILLAGE_RUN.rings, (r) => r[0]),
      traffic: cut(VILLAGE_RUN.traffic, (t) => t.until),
      beasts: cut(VILLAGE_RUN.beasts, (b) => b[0]),
      props: cut(VILLAGE_RUN.props ?? [], (p) => p[0]),
    };
    return { config, number: 1, title: "The Prison Break", goal: "Free the imprisoned Knight, keep them alive, and escape the village together. Reach the truck to bring your rescued soldier aboard." };
  }
  if (n === 2) return { config: { ...JUNGLE_RUN, truck: false }, number: 2, title: "Into the Dark", goal: "The road is gone. Cross the night jungle on foot: swing the ropes, climb the cliffs, keep the wolves off." };
  const biome = CHAIN[(n - 3) % CHAIN.length];
  const place = PLACES[biome];
  const rand = random(n * 977 + 13);
  // The ground is the same every time; who comes at her, how many and in what mix is rolled per play.
  const play = random((Math.random() * 2 ** 31) | 0);
  const pickFoe = <T,>(items: readonly T[]): T => items[Math.floor(play() * items.length)];
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
  const hard = Math.min(1, (n - 3) / 40);

  const features: RoadFeature[] = [];
  const checkpoints: number[] = [4];
  const cells: [number, number][] = [];
  const ropes: number[] = [];
  const logs: LogSpec[] = [];
  const torches: number[] = [8];
  const cages: [number, MateKind, boolean?][] = [];
  const stops: StopSpec[] = [];
  const ambushes: AmbushSpec[] = [];
  const guards: [number, BeastKind][] = [];
  const boulders: BoulderZone[] = [];
  const walks: Walk[] = [];
  const sparks: [number, number][] = [];
  let x = 22;
  // Grey fields a real army: camps of 4 and up, growing every level, coming two or more at a time.
  const together = Math.min(5, 2 + Math.floor(n / 5));
  const crowd = Math.min(14, 4 + Math.floor(n * 0.5));

  // What each place is made of (the first three sections are its signature, then any of them).
  const flavour: Record<Biome, readonly string[]> = {
    jungle: ["ravine", "canopy", "patrol", "steps", "ravine", "drop"],
    river: ["water", "patrol", "canopy", "ambush", "ravine", "steps"],
    hills: ["hill", "patrol", "hill", "ambush", "steps"],
    caves: ["drop", "patrol", "steps", "ravine", "ambush"],
    ruins: ["patrol", "steps", "ravine", "drop", "patrol"],
    coast: ["water", "patrol", "canopy", "steps", "ravine"],
    snow: ["hill", "patrol", "ambush", "ravine", "steps"],
  };
  const count = Math.min(9, 5 + Math.floor(n / 4));
  const plan = [...flavour[biome].slice(0, 3)];
  while (plan.length < count) plan.push(pick(flavour[biome]));
  // Every level has something to fight and someone to save: packs (two at least), a gang's camp
  // midway (two from level 6), and a prisoner in a cage; the chief closes every fifth level.
  while (plan.filter((p) => p === "ambush").length < 2) plan.splice(1 + Math.floor(rand() * (plan.length - 1)), 0, "ambush");
  plan.splice(Math.floor(plan.length / 2), 0, "camp");
  if (n >= 6) plan.push("camp");
  const recruit = RECRUITS[n];
  const prisoner = recruit ?? (n >= COPIES_FROM ? COPIES[(n - COPIES_FROM) % COPIES.length] : "knight");
  const villager = recruit === undefined && n < COPIES_FROM;
  plan.splice(Math.min(plan.length, 2), 0, "cage");

  for (const section of plan) {
    checkpoints.push(x);
    torches.push(x + 1);
    switch (section) {
      case "steps": {
        // Rock steps up: a vault, then faces that need a jump and a haul.
        const steps = 2 + Math.floor(rand() * 2);
        for (let i = 0; i < steps; i++) {
          x += 6 + rand() * 4;
          features.push({ kind: "ledge", x, size: 0.9 + rand() * (0.6 + hard * 0.5) });
        }
        x += 10;
        break;
      }
      case "drop": {
        x += 8;
        features.push({ kind: "ledge", x, size: -(1.4 + rand() * 1.2) });
        x += 12;
        break;
      }
      case "ravine": {
        // Too wide to jump: a rope a third of the way over, a second on the widest.
        const width = 9 + rand() * 2 + Math.min(6, (n - 3) * 0.2);
        x += 8;
        features.push({ kind: "ravine", x, size: width });
        ropes.push(x + width * 0.42);
        if (width > 13.5) ropes.push(x + width * 0.78);
        cells.push([x + width * 0.42, 4.5]);
        x += width + 12;
        break;
      }
      case "water": {
        // A river: floating logs drifting back and forth to ride across on.
        const width = 12 + rand() * 4 + Math.min(4, (n - 3) * 0.12);
        x += 8;
        features.push({ kind: "water", x, size: width });
        const n2 = Math.ceil(width / 6);
        for (let i = 0; i < n2; i++) logs.push({ x: x + 1 + (i * (width - 4)) / n2, span: 3 + rand() * 2, speed: 0.8 + rand() * 0.6 + hard * 0.6 });
        x += width + 12;
        break;
      }
      case "hill": {
        // A hill: rock face after rock face, ledges between, to a summit.
        const faces = 3 + Math.floor(rand() * 2) + Math.floor(hard * 2);
        for (let i = 0; i < faces; i++) {
          x += 4.5 + rand() * 2.5;
          features.push({ kind: "ledge", x, size: 1.6 + rand() * 0.45 });
        }
        // Boulders come rolling down the hill at her as she climbs.
        boulders.push({ x0: x - faces * 6, x1: x + 4, every: Math.max(2.2, 4.5 - hard * 2) });
        cells.push([x + 2, 1.2]);
        x += 6;
        x += 8;
        break;
      }
      case "camp": {
        // A gang's camp: they come at her in waves until their gate comes down.
        x += 22;
        const boss = n % 5 === 0 && !stops.some((s) => s.kinds.includes("chief"));
        stops.push({
          x,
          // Each play a different camp: a few more or fewer, coming one at a time or in a rush.
          enemies: Math.max(2, crowd + Math.floor(play() * 3) - 1),
          together: Math.max(1, together + (play() < 0.3 ? 1 : play() < 0.3 ? -1 : 0)),
          kinds: boss ? ["chief", ...place.gang] : place.gang,
          dialogue: boss ? [{ who: "Grey's chief", clip: "", text: "Grey sent me to bring back that Spark. And your head.", at: 0.3 }, { who: "Kachujin", clip: "", text: "He'll get neither.", at: 3.2 }] : undefined,
        });
        torches.push(x - 6, x - 14);
        x += 10;
        break;
      }
      case "ambush": {
        // A pack out of the dark; from level 4 Copycats run in with them sometimes.
        // The mix changes every play: a pure pack, Copycats with it (from level 4), or Copycats alone (from 6).
        const roll = play();
        const kinds = n >= 6 && roll < 0.25 ? place.gang : n >= 4 && roll < 0.6 ? [...place.animals, ...place.gang] : place.animals;
        ambushes.push({ x: x + 6 + play() * 6, count: Math.min(10, 4 + Math.floor(n / 2.5) + Math.floor(play() * 2)), kinds });
        x += 26;
        break;
      }
      case "canopy": {
        // A vine up a tree to a walkway high over the path, with a pack prowling below it: up and
        // over (sparks to take on the way), or down among them.
        x += 10;
        const length = 20 + rand() * 8;
        walks.push({ x0: x, x1: x + length, above: 5.8 + rand() * 0.8 });
        cells.push([x + length * 0.4, 7.2]);
        // Up there: a Spark Heart, now and then.
        if (rand() < 0.5) sparks.push([x + length * 0.75, 7.4]);
        ambushes.push({ x: x + 4, count: Math.min(8, 4 + Math.floor(n / 3)), kinds: place.animals });
        torches.push(x - 3);
        x += length + 10;
        break;
      }
      case "patrol": {
        // Grey's men on watch along the way: they see her coming and come at her.
        const count2 = Math.min(4, 2 + Math.floor(n / 8));
        x += 10;
        for (let i = 0; i < count2; i++) guards.push([x + i * (2.5 + play() * 2.5), pickFoe(place.gang)]);
        torches.push(x - 2);
        x += count2 * 3.5 + 14;
        break;
      }
      case "cage": {
        // A guard or two on the cage, too.
        x += 10;
        cages.push([x, prisoner, villager]);
        guards.push([x + 4, pickFoe(place.gang)]);
        x += 14;
        break;
      }
      default:
        x += 15;
    }
    cells.push([x - 4, 1.2]);
  }
  // Grey's chief waits at the end of every fifth level, if the plan had no camp for him.
  if (n % 5 === 0 && !stops.some((s) => s.kinds.includes("chief"))) {
    x += 22;
    stops.push({ x, enemies: Math.max(3, Math.floor(crowd / 2)), together, kinds: ["chief", ...place.gang], dialogue: [{ who: "Grey's chief", clip: "", text: "Grey sent me to bring back that Spark. And your head.", at: 0.3 }, { who: "Kachujin", clip: "", text: "He'll get neither.", at: 3.2 }] });
    torches.push(x - 6, x - 14);
    x += 10;
  }
  if (biome === "caves") for (let t = 20; t < x; t += 16) torches.push(t);

  const config: RoadConfig = {
    id: biome as StageId,
    scene: biome,
    onFoot: true,
    truck: false,
    seed: n * 31 + 7,
    hills: biome === "hills" || biome === "snow" ? 0.8 : biome === "caves" ? 0.3 : 0.55,
    finish: x + 12,
    features,
    checkpoints,
    cells,
    rings: [],
    traffic: [],
    props: [],
    beasts: guards,
    boulders,
    walks,
    sparks,
    ambushes,
    opening: [{ who: "Kachujin", clip: "", text: OPENING[biome], at: 1.4 }],
    ropes,
    logs,
    cages,
    torches,
    stops,
  };
  const name = place.names[Math.floor((n - 3) / CHAIN.length) % place.names.length];
  return { config, number: n, title: name, goal: n % 5 === 0 ? `${place.goal} Grey's chief is waiting.` : place.goal };
}
