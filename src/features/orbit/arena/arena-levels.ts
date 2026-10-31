/*
 * The arena's levels: the same backyard, shot in different places and weather. Each has its own
 * renders (a folder under /game/arena/), its own playable stretch of its fight line, and its own
 * live effects (a bonfire, rain and lightning, dawn mist).
 */

export type LevelId = "yard" | "rain" | "dawn";

export interface ArenaLevel {
  id: LevelId;
  title: string;
  /** The game's chapter line, and its one-line tagline. */
  chapter: string;
  tagline: string;
  /** Difficulty, 1 … 3 (stars on the level card). */
  stars: number;
  /** The level card's picture (one of its own renders). */
  thumb: string;
  /** Where its renders live, under /game/arena/. */
  folder: string;
  /** The playable stretch: how far it's shifted along the fight line, and how much is trimmed off each end (m). */
  lane: { shift: number; trim: number };
  /** Framing for each camera position (field of view close and wide, degrees; operator drift, m). */
  framing: readonly { near: number; far: number; step: number }[];
  /** Live effects. */
  fire: boolean;
  rain: boolean;
  mist: boolean;
  /** The opening banner. */
  opening: string;
}

export const LEVELS: Record<LevelId, ArenaLevel> = {
  yard: {
    id: "yard",
    title: "The Backyard",
    chapter: "Chapter I",
    tagline: "Night falls. Hold the yard.",
    stars: 1,
    thumb: "/game/arena/tile1.webp",
    folder: "",
    // Shifted clear of the old tree's trunk (just in front of the line's left end) so the fight stays on open lawn.
    lane: { shift: 1.1, trim: 1.1 },
    framing: [
      { near: 26, far: 40, step: 0.35 },
      { near: 30, far: 42, step: 0.12 },
    ],
    fire: true,
    rain: false,
    mist: false,
    opening: "The Backyard",
  },
  rain: {
    id: "rain",
    title: "The Deck",
    chapter: "Chapter II",
    tagline: "Storm on the boards.",
    stars: 2,
    thumb: "/game/arena/rain/tile1.webp",
    folder: "rain/",
    lane: { shift: 0, trim: 0.3 },
    framing: [
      { near: 30, far: 44, step: 0.25 },
      { near: 30, far: 42, step: 0.1 },
    ],
    fire: false,
    rain: true,
    mist: false,
    opening: "The Deck",
  },
  dawn: {
    id: "dawn",
    title: "The Shed",
    chapter: "Chapter III",
    tagline: "Last stand at first light.",
    stars: 3,
    thumb: "/game/arena/dawn/tile1.webp",
    folder: "dawn/",
    lane: { shift: 0, trim: 0.3 },
    framing: [
      { near: 28, far: 42, step: 0.3 },
      { near: 30, far: 42, step: 0.12 },
    ],
    fire: false,
    rain: false,
    mist: true,
    opening: "The Shed",
  },
};

/** Fight tips shown while an arena loads. */
export const TIPS: readonly string[] = [
  "Block just as a blow lands to parry. It fills your Master Stroke.",
  "Knights catch blows on their shields. Kick to break the guard.",
  "Chain your swings: tap again late in a blow for the next one.",
  "The brute shrugs off light hits. Save the Master Stroke for him.",
  "Hold a direction to break into a run.",
];

/** Which arena each stage of the game opens at its first barricade. */
export const STAGE_LEVEL: Record<string, LevelId> = { village: "yard", city: "rain", forest: "dawn" };
