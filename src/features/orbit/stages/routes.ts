import type { RoadConfig } from "./road";

/*
 * The two road runs. Gaps are sized to the tank: a hop alone clears the short ones at speed;
 * the long ones need a ramp, a boost or some hover; the tank (13 s) refills on the road,
 * so fuel is a choice. Traffic stops before ramps, so there's always something to jump.
 */

/** Stage 1: out of the city at night. Flat streets, traffic, broken bridges. */
export const CITY_RUN: RoadConfig = {
  id: "discover",
  scene: "city",
  seed: 31,
  hills: 0,
  finish: 1060,
  features: [
    { kind: "ramp", x: 120, size: 12 },
    { kind: "barrier", x: 178, size: 0 },
    { kind: "ramp", x: 240, size: 10 },
    { kind: "ravine", x: 252, size: 14 },
    { kind: "barrier", x: 330, size: 0 },
    { kind: "barrier", x: 348, size: 0 },
    { kind: "ramp", x: 420, size: 14 },
    { kind: "ravine", x: 470, size: 20 },
    { kind: "ramp", x: 560, size: 8 },
    { kind: "barrier", x: 640, size: 0 },
    { kind: "ramp", x: 700, size: 16 },
    { kind: "ravine", x: 760, size: 26 },
    { kind: "barrier", x: 860, size: 0 },
    { kind: "ramp", x: 930, size: 12 },
    { kind: "ravine", x: 990, size: 18 },
  ],
  checkpoints: [6, 200, 300, 440, 600, 740, 880, 975],
  cells: [[40, 1.2], [200, 1.2], [259, 4], [380, 1.2], [481, 3.5], [590, 1.2], [775, 6], [900, 1.2], [1000, 4]],
  rings: [[148, 3.6], [258, 5], [436, 4.6], [480, 4], [618, 3.4], [714, 6], [772, 7.5], [944, 5], [998, 5]],
  traffic: [
    { x: 50, speed: 11, until: 112, kind: "car", color: "#3a5f8f" },
    { x: 140, speed: 9, until: 232, kind: "truck", color: "#8f3a3a" },
    { x: 290, speed: 13, until: 412, kind: "car", color: "#d8d2c4" },
    { x: 505, speed: 8, until: 552, kind: "truck", color: "#3f7a5a" },
    { x: 590, speed: 12, until: 692, kind: "car", color: "#c9a23a" },
    { x: 800, speed: 10, until: 922, kind: "truck", color: "#5a4a8f" },
    { x: 955, speed: 12, until: 982, kind: "car", color: "#2b2d33" },
  ],
  beasts: [],
};

/** Stage 2: the forest road at night to the launch pad. Logs, ravines, and packs of boars and wolves. */
export const FOREST_RUN: RoadConfig = {
  id: "build",
  scene: "forest",
  seed: 11,
  hills: 1,
  finish: 1005,
  features: [
    { kind: "log", x: 72, size: 0 },
    { kind: "log", x: 134, size: 0 },
    { kind: "ramp", x: 205, size: 12 },
    { kind: "log", x: 262, size: 0 },
    { kind: "ramp", x: 312, size: 11 },
    { kind: "ravine", x: 325, size: 15 },
    { kind: "ramp", x: 400, size: 12 },
    { kind: "ravine", x: 430, size: 18 },
    { kind: "log", x: 480, size: 0 },
    { kind: "log", x: 540, size: 0 },
    { kind: "ramp", x: 600, size: 14 },
    { kind: "ravine", x: 650, size: 24 },
    { kind: "log", x: 720, size: 0 },
    { kind: "ramp", x: 780, size: 10 },
    { kind: "ravine", x: 800, size: 20 },
    { kind: "ramp", x: 900, size: 12 },
  ],
  checkpoints: [6, 110, 290, 380, 560, 700, 860],
  cells: [[40, 1.2], [150, 1.2], [214, 4.2], [326, 4.6], [440, 5], [520, 1.2], [660, 5.5], [810, 5], [950, 1.2]],
  rings: [[222, 5], [334, 5.5], [438, 6], [612, 4.5], [662, 7], [810, 6.5], [915, 5]],
  traffic: [],
  // Packs: boars charge in a line, wolves spring at the car; ram them fast, jump them or blast them.
  beasts: [
    [92, "boar"], [96, "boar"],
    [186, "wolf"], [190, "wolf"], [194, "boar"],
    [276, "boar"], [280, "boar"], [284, "boar"],
    [370, "wolf"], [374, "wolf"],
    [470, "boar"], [474, "wolf"], [478, "boar"],
    [520, "wolf"], [524, "wolf"], [528, "wolf"],
    [690, "boar"], [694, "boar"], [698, "wolf"],
    [740, "wolf"], [744, "boar"], [748, "wolf"],
    [860, "boar"], [864, "boar"], [868, "boar"], [872, "wolf"],
    [950, "wolf"], [954, "wolf"],
  ],
};

/**
 * Stage 5: inside Jupiter's clouds, on a shelf of ammonia ice. Heavier gravity than Earth (so
 * every jump is short and the tank works harder), broken shelf with drops into the cloud sea,
 * and storm creatures that pounce from further out than anything before.
 */
export const JUPITER_RUN: RoadConfig = {
  id: "jupiter",
  scene: "jupiter",
  seed: 47,
  hills: 1,
  gravity: 14,
  finish: 960,
  features: [
    { kind: "ramp", x: 110, size: 12 },
    { kind: "ravine", x: 124, size: 14 },
    { kind: "ramp", x: 230, size: 14 },
    { kind: "ravine", x: 246, size: 18 },
    { kind: "ramp", x: 380, size: 12 },
    { kind: "ravine", x: 394, size: 16 },
    { kind: "ramp", x: 520, size: 16 },
    { kind: "ravine", x: 538, size: 22 },
    { kind: "ramp", x: 680, size: 12 },
    { kind: "ravine", x: 694, size: 18 },
    { kind: "ramp", x: 820, size: 16 },
    { kind: "ravine", x: 838, size: 24 },
  ],
  checkpoints: [6, 180, 320, 460, 610, 760, 900],
  cells: [[60, 1.2], [131, 4], [200, 1.2], [255, 5], [330, 1.2], [402, 4.5], [470, 1.2], [549, 5.5], [640, 1.2], [703, 5], [780, 1.2], [850, 6]],
  rings: [[132, 5], [256, 6], [404, 5.5], [550, 6.5], [704, 6], [851, 7]],
  traffic: [],
  beasts: [
    [70, "storm"], [76, "storm"],
    [170, "storm"], [176, "storm"], [182, "storm"],
    [300, "storm"], [306, "storm"],
    [440, "storm"], [446, "storm"], [452, "storm"],
    [600, "storm"], [606, "storm"],
    [740, "storm"], [746, "storm"], [752, "storm"],
    [880, "storm"], [886, "storm"], [892, "storm"], [898, "storm"],
  ],
};
