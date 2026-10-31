import type { RoadConfig } from "./road";

/*
 * The two road runs. Gaps are sized to the tank: a hop alone clears the short ones at speed;
 * the long ones need a ramp, a boost or some hover; the tank (3.5 s) refills slowly on the road,
 * so fuel is a choice. Traffic stops before ramps, so there's always something to jump.
 */

/** Stage 1: out of the city at night. Flat streets, traffic, broken bridges. */
export const CITY_RUN: RoadConfig = {
  id: "city",
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
  id: "forest",
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
 * Stage 1: out of a village in the monsoon, at night. Mud stretches that steal two-thirds of the
 * grip (brake early, don't spin the wheels), broken bridges over flooded ravines, auto-rickshaws
 * and painted lorries, cows standing in the road (hit one and the car is wrecked; fly over for
 * points) and village dogs that chase the car.
 */
export const VILLAGE_RUN: RoadConfig = {
  id: "village",
  scene: "village",
  seed: 23,
  hills: 0.45,
  finish: 1150,
  features: [
    { kind: "mud", x: 60, size: 25 },
    { kind: "ramp", x: 140, size: 12 },
    { kind: "ravine", x: 154, size: 13 },
    { kind: "mud", x: 225, size: 30 },
    { kind: "ramp", x: 320, size: 14 },
    { kind: "ravine", x: 336, size: 17 },
    { kind: "mud", x: 415, size: 22 },
    { kind: "ramp", x: 500, size: 12 },
    { kind: "ravine", x: 514, size: 16 },
    { kind: "mud", x: 590, size: 45 },
    { kind: "ramp", x: 700, size: 16 },
    { kind: "ravine", x: 718, size: 21 },
    { kind: "mud", x: 795, size: 28 },
    { kind: "ramp", x: 880, size: 14 },
    { kind: "ravine", x: 896, size: 18 },
    { kind: "mud", x: 975, size: 38 },
    { kind: "ramp", x: 1060, size: 16 },
    { kind: "ravine", x: 1078, size: 23 },
  ],
  checkpoints: [6, 200, 380, 560, 760, 940, 1110],
  cells: [[40, 1.2], [161, 4], [290, 1.2], [345, 4.5], [460, 1.2], [522, 4.2], [660, 1.2], [728, 5], [850, 1.2], [905, 5], [1030, 1.2], [1089, 5.5]],
  rings: [[160, 4.6], [344, 5.4], [521, 5], [727, 6], [904, 5.6], [1088, 6.4]],
  traffic: [
    { x: 30, speed: 7, until: 132, kind: "rickshaw", color: "#2e7d4f" },
    { x: 250, speed: 8, until: 312, kind: "rickshaw", color: "#24302a" },
    { x: 430, speed: 6, until: 492, kind: "truck", color: "#c9a23a" },
    { x: 620, speed: 8, until: 692, kind: "rickshaw", color: "#2e7d4f" },
    { x: 815, speed: 9, until: 872, kind: "rickshaw", color: "#24302a" },
    { x: 1000, speed: 7, until: 1052, kind: "truck", color: "#b5452a" },
  ],
  beasts: [
    [95, "cow"], [270, "cow"], [395, "dog"], [399, "dog"], [455, "cow"], [645, "cow"], [770, "cow"],
    [840, "dog"], [844, "dog"], [848, "dog"], [935, "cow"], [1020, "cow"], [1125, "cow"],
  ],
};
