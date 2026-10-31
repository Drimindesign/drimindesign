/*
 * Simulation constants, in SI units (metres, seconds, kilograms). Gameplay feel lives here,
 * never in animation or rendering code.
 */

export type PlanetId = "earth" | "pluto";

export interface Planet {
  id: PlanetId;
  name: string;
  /** Surface gravity, m/s². */
  gravity: number;
}

export const PLANETS: Record<PlanetId, Planet> = {
  earth: { id: "earth", name: "Earth", gravity: 9.81 },
  pluto: { id: "pluto", name: "Pluto", gravity: 0.62 },
};

/** Fixed simulation rate; rendering interpolates between steps. */
export const SIM_HZ = 120;
/** At most this many steps per frame, so a stalled tab never spirals. */
export const MAX_STEPS = 8;

/** Art pixels per metre: art is designed on a 6.25 cm grid, so the explorer is ~28 art px tall. */
export const PPM = 16;
/**
 * Screen pixels per art pixel. Art keeps its shapes but is rasterised on a grid this many times
 * finer, so edges, curves, smoke and dithering come out in small pixels (smooth clusters)
 * instead of big blocks. Every canvas carries scale(ART) as its base transform.
 */
export const ART = 2;
/** The view is scaled up by a whole number; it is at least this many art pixels (x ART on screen). */
export const VIEW_MIN = { width: 480, height: 270 } as const;
/** The world's left edge (m): the road starts in a clearing. */
export const WORLD_LEFT = -6;

export const CHARACTER = {
  walkSpeed: 1.45,
  runSpeed: 4.8,
  /** Ground acceleration below / above walking pace: a quick start, then a build-up into a run. */
  accelWalk: 9,
  accelRun: 2.4,
  decel: 11,
  airAccel: 3.2,
  /** Take-off speed from the legs (m/s): ~1.1 m on Earth, the same push goes much higher on Pluto. */
  jumpSpeed: 4.65,
  /** Gravity multiplier while rising with jump released: short taps give short hops. */
  releaseGravity: 2.4,
  coyoteTime: 0.1,
  jumpBuffer: 0.13,
  /** Snaps down onto the ground over small drops instead of hopping off every bump (m). */
  groundSnap: 0.3,
  terminalSpeed: 30,
  /** Distance from the car's door within which it can be entered (m). */
  doorReach: 1.4,
} as const;

export const CAR = {
  mass: 1250,
  /** Moment of inertia about the centre of mass (kg·m²), ~ m(L² + H²)/12. */
  inertia: 2100,
  wheelRadius: 0.36,
  /** Wheel anchors in car space (m, from the centre of mass, +x forward, +y up). */
  wheels: [
    { x: -1.38, y: -0.2 },
    { x: 1.42, y: -0.2 },
  ],
  /** Suspension length at full extension, anchor to wheel centre (m). */
  restLength: 0.38,
  /** Spring rate per wheel (N/m): ~0.13 m of sag under the car's own weight on Earth. */
  spring: 47000,
  /** Damper (N·s/m): a little over half critical for a quarter of the car. */
  damper: 6200,
  /** Tyre–dirt friction coefficient. */
  grip: 0.95,
  /** Peak drive force (N): ~6 m/s² off the line, fading toward top speed (~120 km/h). */
  drive: 7800,
  topSpeed: 33,
  reverseSpeed: 8,
  brake: 14000,
  rolling: 35,
  /** Pitch torque in the air from spinning the wheels up or down (N·m). */
  airTorque: 2600,
  /** Thrusters under the floor: acceleration while firing (m/s²), independent of the planet. */
  thrust: 13,
  /**
   * A tap on the ground: a short burn whose push swells and fades (a sine over liftTime) rather
   * than an instant kick, so the car lifts off smoothly. liftKick is the speed it adds (m/s).
   */
  liftTime: 0.22,
  liftKick: 6,
  /** Fuel a lift-off costs (s of tank). */
  liftCost: 0.35,
  /** Holding: the thrusters back off above this climb rate (m/s), so a hold is a hover, not a rocket. */
  maxClimb: 3.5,
  /** Second press in the air: a burst along the nose (m/s) and a little lift, swelling over boostTime (s); its fuel cost (s). */
  boost: 6.5,
  boostLift: 1.6,
  boostTime: 0.28,
  boostCost: 0.6,
  /** Flips: spin rate of a queued flip (rad/s, a full turn in ~0.7 s) and how fast it's reached (rad/s²). */
  flipRate: 9,
  flipAccel: 45,
  /**
   * Letting go of ← → in the air: the thrusters settle the car to the nearest upright with a
   * slightly underdamped spring (stiffness 1/s², damping 1/s), so a half-done flip completes itself.
   */
  settleSpring: 48,
  settleDamp: 9,
  /** Seconds of thrust in a full tank; refills on the ground. */
  thrustTank: 3.5,
  thrustRefill: 0.5,
  /**
   * Landing flare: falling within `height` (m) of the road, the thrusters hold the sink rate
   * to `floor` m/s plus `perMetre` m/s for every metre still to go, so touchdowns come in soft.
   */
  landingBurn: { height: 6, floor: 3, perMetre: 1.6 },
  /** Nozzles under the floor, car space (m). */
  nozzles: [
    { x: -1.15, y: -0.5 },
    { x: 1.05, y: -0.5 },
  ],
  /** Body contact with the ground when the car lands on its nose, tail or roof. */
  hullSpring: 320000,
  hullDamper: 22000,
  /** Upside down and slow for this long: the car is set back on its wheels (s). */
  flipReset: 2.2,
  /** Where the driver gets in and out, car space (m). */
  door: { x: 0.3, y: -0.15 },
  seat: { x: -0.05, y: 0.05 },
} as const;
