import { fbm1, noise1, smoothstep } from "./noise";

/*
 * Ground as a height field y = height(x), in metres. Each stage has its own: the forest path,
 * the road out of the forest into the city, and the Moon. Everything that touches the ground
 * (the explorer, the car's wheels and hull, particles) only asks for height and slope.
 */
export abstract class Terrain {
  abstract height(x: number): number;

  /** dh/dx by central difference. */
  slope(x: number): number {
    return (this.height(x + 0.02) - this.height(x - 0.02)) / 0.04;
  }

  /** Tyre grip at x, as a share of dry road (mud and ice are below 1). Dry everywhere unless a terrain says otherwise. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  grip(_x: number): number {
    return 1;
  }

  /** Unit surface normal at x. */
  normal(x: number): { x: number; y: number } {
    const s = this.slope(x);
    const length = Math.hypot(s, 1);
    return { x: -s / length, y: 1 / length };
  }
}

/** A smooth bump of the given height and half-width centred on `at`: logs, barriers. */
function bump(x: number, at: number, halfWidth: number, height: number): number {
  const t = Math.abs(x - at) / halfWidth;
  return t >= 1 ? 0 : height * Math.cos((t * Math.PI) / 2) ** 2;
}

/** A ramp: rises over `length` metres to `height`, then drops straight back to the road. */
function ramp(x: number, start: number, length: number, height: number): number {
  if (x < start || x > start + length + 0.6) return 0;
  if (x > start + length) return height * (1 - (x - start - length) / 0.6);
  const t = (x - start) / length;
  return height * t * t;
}

/** A gap with steep walls: the ground falls `depth` metres between `from` and `to`. */
function gap(x: number, from: number, to: number, depth: number): number {
  return -depth * smoothstep(from - 0.4, from + 0.4, x) * (1 - smoothstep(to - 0.4, to + 0.4, x));
}

/** Tyre grip in mud, as a share of dry road. */
const MUD_GRIP = 0.45;

export interface RoadFeature {
  kind: "log" | "barrier" | "ramp" | "ravine" | "mud";
  x: number;
  /** Ramp length, ravine width or mud stretch (m). */
  size: number;
}

/*
 * The road stages: a street through the city (flat) or a road through the forest (rolling,
 * `hills` 1). The obstacles are part of the height field, so the car's own physics decides
 * whether it bumps over a log, flies off a ramp, or falls into a gap.
 */
export class RoadTerrain extends Terrain {
  constructor(
    private readonly seed: number,
    readonly features: readonly RoadFeature[],
    private readonly hills: number,
  ) {
    super();
  }

  height(x: number): number {
    const start = smoothstep(20, 60, x);
    const rolling = (fbm1(x / 52, this.seed, 3) - 0.5) * 6 * start * this.hills;
    const ripples = (noise1(x / 3.3, this.seed + 13) - 0.5) * 0.16 * this.hills;
    let h = rolling + ripples;
    for (const f of this.features) {
      if (f.kind === "log") h += bump(x, f.x, 0.45, 0.42);
      else if (f.kind === "barrier") h += bump(x, f.x, 0.35, 0.7);
      else if (f.kind === "ramp") h += ramp(x, f.x, f.size, f.size * 0.22);
      else if (f.kind === "ravine") h += gap(x, f.x, f.x + f.size, 40);
      // Mud sits a hand's depth below the road, with soft edges.
      else h -= 0.08 * smoothstep(f.x - 1, f.x + 1, x) * (1 - smoothstep(f.x + f.size - 1, f.x + f.size + 1, x));
    }
    return h;
  }

  /** Monsoon mud: the tyres get under half their grip. */
  grip(x: number): number {
    for (const f of this.features) if (f.kind === "mud" && x > f.x && x < f.x + f.size) return MUD_GRIP;
    return 1;
  }
}
