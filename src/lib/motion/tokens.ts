/*
 * Motion tokens — mirror DESIGN.md §7. CSS reads the same values as custom properties
 * (see src/styles/tokens.css); JS-driven animation imports them from here.
 */

export const duration = {
  instant: 100,
  fast: 180,
  base: 280,
  slow: 480,
  slower: 800,
} as const;

/*
 * Intro choreography (DESIGN.md §7.5). All values in ms unless noted.
 * The panel pops from a smaller card into the white frame, holds a beat, then
 * expands edge to edge while the wordmark letters rise and the UI settles in.
 */
export const intro = {
  /** Panel scale relative to the framed state at t=0 (unitless). */
  popFrom: 0.9,
  popMs: 520,
  holdMs: 60,
  expandMs: 1000,
  letterDelayMs: 120,
  letterStaggerMs: 55,
  letterMs: 950,
  /** Letters lean back as they rise, then straighten (deg). */
  letterTiltDeg: 7,
  itemsDelayMs: 1080,
  itemStaggerMs: 70,
  itemMs: 850,
  /** Frame width around the panel before it expands (px, clamped to viewport). */
  insetMinPx: 8,
  insetMaxPx: 24,
  insetVw: 0.015,
  /** Panel corner radius in the framed state (px, clamped to viewport). */
  radiusMinPx: 18,
  radiusMaxPx: 30,
  radiusVw: 0.02,
} as const;

/** Upper bound of items that join the intro stagger; used to size the timeline. */
const INTRO_MAX_ITEMS = 6;

export const introTotalMs = Math.max(
  intro.popMs + intro.holdMs + intro.expandMs,
  intro.itemsDelayMs + INTRO_MAX_ITEMS * intro.itemStaggerMs + intro.itemMs,
);

/** Spring presets (DESIGN.md §7.3) for lib/motion/spring.ts. */
export const spring = {
  letter: { stiffness: 170, damping: 18 },
  soft: { stiffness: 120, damping: 14 },
  snappy: { stiffness: 300, damping: 26 },
} as const;

/*
 * Wordmark bend (DESIGN.md §7.5). Each letter is a rubber stalk anchored at its baseline:
 * it leans toward a nearby cursor and is whipped by the cursor's horizontal speed.
 */
export const wordmarkBend = {
  /** Horizontal strips per letter; more = smoother curve, more elements. */
  slices: 12,
  /** Largest sideways travel of a letter's top edge, in em of the wordmark. */
  maxBendEm: 0.16,
  /** Cursor influence radius, in multiples of the average letter width. */
  radiusLetters: 1.3,
  /**
   * Whip from cursor speed: each frame of contact adds
   * dragGain × (speed in letter-widths/s) × maxBend × influence × dt to the bend velocity.
   */
  dragGain: 10,
  /** Vertical stretch of the letter nearest the cursor (unitless, added to scale 1). */
  maxStretch: 0.035,
  /** Bend (px) and velocity (px/s) below which a letter counts as at rest. */
  restThreshold: 0.05,
} as const;

/* Falling-words description (DESIGN.md §7.5). Physics values are matter-js units. */
export const fallingWords = {
  /** How long each sentence shows before the next one rotates in (ms). */
  rotateMs: 6500,
  /** Delay between words when a whole sentence lets go (ms). */
  cascadeStaggerMs: 85,
  /** Remaining words glide into the gaps (ms). */
  closeGapMs: 650,
  gravity: 1.2,
  restitution: 0.35,
  friction: 0.6,
  frictionAir: 0.015,
  /** Initial hop and spin as a word lets go (px/step, rad/step). */
  hopVelocity: 2.4,
  spin: 0.05,
  /** One-time teaser after the intro: wait, wobble the first loose word, drop it, rest, return. */
  demo: { delayMs: 900, wobbleMs: 650, restMs: 2200 },
} as const;

/* Site-wide inertial scroll (Lenis). Lower lerp = longer, silkier glide. */
export const scroll = {
  lerp: 0.085,
  wheelMultiplier: 0.9,
  /** Soft snap onto the cylinder's landing and each project. */
  snapDurationS: 1.15,
  /** Snap only when scrolling stops within this distance of a snap point. */
  snapThreshold: "28%",
  /** Wait this long after input stops before snapping (ms). */
  snapDebounceMs: 160,
} as const;

/*
 * Project ring (DESIGN.md §7.5, §9), modelled on a thin, upright panoramic ring in a hazy,
 * endless room. Scroll lengths are in viewport heights. Phases: the camera descends from a
 * high diagonal to eye level while the section scrolls in, holds (dwell), then each further
 * step of scroll turns the ring one project to the left.
 */
export const cylinder = {
  dwellVh: 0.45,
  perPanelVh: 0.75,
  tailVh: 0.5,
  /** Camera elevation above the ring's mid-height, degrees: start (top view) → landed. */
  startElevationDeg: 46,
  /** Camera swings in from slightly off-axis for a cinematic arc (degrees of azimuth). */
  startAzimuthDeg: -16,
  /** Start distance from the ring centre, in ring radii. */
  startDistanceRadii: 3.4,
  /**
   * Critically damped springs (damping = 2·√stiffness): the camera and ring follow scroll
   * with weight but never overshoot. Lenis already smooths the input, so these stay quick.
   */
  cameraSpring: { stiffness: 110, damping: 21 },
  ringSpring: { stiffness: 90, damping: 19 },
  /** Pointer parallax at the landed view: max camera yaw / pitch offsets, degrees. */
  parallaxYawDeg: 2.2,
  parallaxPitchDeg: 1.1,
  parallaxLambda: 3.5,
} as const;

/*
 * Story tree (DESIGN.md §7.5). Growth runs 0 → 1 across `growVh` of scroll while the stage
 * is pinned. The tier timeline (one tier per milestone, with a pause after each) is baked
 * into the generated tree data by scripts/generate-tree.ts.
 */
export const storyTree = {
  growVh: 3.6,
  tailVh: 0.6,
  /** Follow-through on scroll: growth eases after the scroll position, never jumps. */
  growthLambda: 5,
  /** The seed pops in over this growth range. */
  seed: [0, 0.04],
  /** How long a branch takes to thicken to full girth after it appears (fraction of growth). */
  maturity: 0.2,
  /** Breeze: max sway of the highest, thinnest twigs (tree units) and its base period (s). */
  swayAmount: 4.2,
  swayPeriod: 4.8,
  /** Milestone tremor: peak displacement at the top (tree units), frequency (Hz), decay (1/s). */
  tremorAmount: 3.4,
  tremorHz: 8.5,
  tremorDecay: 4.5,
} as const;

/*
 * Lanyard ID cards (About & Team). A verlet rope per card: light strap points, a heavy card
 * at the end, solved at a fixed step. Units are card widths (a CR80 card is 1 × 1.586).
 */
export const lanyard = {
  /** Fixed physics step (s) and constraint passes per step. */
  stepS: 1 / 120,
  iterations: 14,
  /** Downward acceleration, card units/s² (a real lanyard of ~4 card lengths swings at ~1.4 s). */
  gravity: 80,
  /** Velocity kept per step (air drag): lower settles sooner. */
  drag: 0.992,
  /** Strap points per lanyard (excluding the anchor) and mass of each relative to the card. */
  strapPoints: 14,
  strapMass: 0.06,
  /** Bending resistance of the fabric strap (share of a full correction per pass). */
  strapStiffness: 0.08,
  /** Twist about the strap: spring to the rest angle (1/s²), damping (1/s), swing → twist coupling. */
  twistStiffness: 9,
  twistDamping: 1.6,
  twistCoupling: 0.6,
  /** A cursor brushing past a card nudges it by this share of the cursor's speed. */
  brushImpulse: 0.05,
  /** Cards drop in one after another, this far apart (s). */
  dropStaggerS: 0.14,
  /** Sleep when every point moves less than this per step for `sleepAfterS`. */
  sleepEpsilon: 0.00004,
  sleepAfterS: 0.8,
} as const;

/*
 * Tissue pull (project open/close, features/tissue-transition). Progress follows a critically
 * damped spring of angular frequency `omega` (1/s): ~1.2 s to settle, no overshoot.
 */
export const tissue = {
  omega: 5.5,
  /** Navigate once the sheet has nearly covered the screen (the new page renders beneath). */
  navigateAt: 0.9,
  /** The sheet fades into the real hero over this long once both are in place. */
  fadeMs: 260,
  /** Sheet subdivisions per side, by device tier. */
  segments: { high: 96, medium: 64, low: 32 },
} as const;
