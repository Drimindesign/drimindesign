/*
 * The arena's levels: the same backyard, shot in different places and weather. Each has its own
 * renders (a folder under /game/arena/), its own playable stretch of its fight line, and its own
 * live effects (a bonfire, rain and lightning, dawn mist).
 */

export type LevelId = "yard" | "rain" | "dawn";

export interface ArenaLevel {
  id: LevelId;
  title: string;
  /** Under the title on the download card. */
  blurb: string;
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
    blurb: "Night, a bonfire on the lawn. Two knights and a brute stand between you and the road.",
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
    title: "The Deck, in the Rain",
    blurb: "A storm over the yard. Wet boards, a floodlight, lightning. They came up onto the deck.",
    folder: "rain/",
    lane: { shift: 0, trim: 0.3 },
    framing: [
      { near: 30, far: 44, step: 0.25 },
      { near: 30, far: 42, step: 0.1 },
    ],
    fire: false,
    rain: true,
    mist: false,
    opening: "The Deck, in the Rain",
  },
  dawn: {
    id: "dawn",
    title: "The Shed at Dawn",
    blurb: "First light, mist on the grass, the yard still cold. The last of them wait by the shed.",
    folder: "dawn/",
    lane: { shift: 0, trim: 0.3 },
    framing: [
      { near: 28, far: 42, step: 0.3 },
      { near: 30, far: 42, step: 0.12 },
    ],
    fire: false,
    rain: false,
    mist: true,
    opening: "The Shed at Dawn",
  },
};

/** Which arena each stage of the game opens at its first barricade. */
export const STAGE_LEVEL: Record<string, LevelId> = { village: "yard", city: "rain", forest: "dawn" };
