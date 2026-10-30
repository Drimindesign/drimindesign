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
  boars: [],
};

/** Stage 2: the forest road at night to the launch pad. Logs, boars, ravines. */
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
  boars: [92, 186, 276, 520, 740],
};
