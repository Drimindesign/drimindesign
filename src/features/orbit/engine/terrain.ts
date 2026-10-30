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

export interface RoadFeature {
  kind: "log" | "barrier" | "ramp" | "ravine";
  x: number;
  /** Ramp length or ravine width (m). */
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
      else h += gap(x, f.x, f.x + f.size, 40);
    }
    return h;
  }
}

/*
 * Stage 4: the Moon. Low rolling ground pocked with craters: a raised rim and a bowl,
 * deterministic from the seed so the run is the same every time.
 */
export class MoonTerrain extends Terrain {
  private readonly craters: { x: number; radius: number; depth: number }[] = [];

  constructor(private readonly seed: number, length: number) {
    super();
    let x = 30;
    let i = 0;
    while (x < length - 30) {
      const radius = 2.5 + noise1(i * 1.7, seed) * 6;
      this.craters.push({ x, radius, depth: radius * (0.18 + noise1(i * 2.3, seed + 3) * 0.14) });
      x += radius * 2 + 10 + noise1(i * 3.1, seed + 5) * 26;
      i++;
    }
  }

  height(x: number): number {
    let h = (fbm1(x / 60, this.seed, 3) - 0.5) * 5 + (noise1(x / 7, this.seed + 9) - 0.5) * 0.5;
    for (const c of this.craters) {
      const t = Math.abs(x - c.x) / c.radius;
      if (t > 1.5) continue;
      // Bowl inside the rim, a raised lip just outside it.
      h += t < 1 ? -c.depth * (1 - t * t) + c.depth * 0.25 : c.depth * 0.25 * (1 - smoothstep(1, 1.5, t));
    }
    return h;
  }
}

/** Level ground at height 0: the launch pad and the street under it. */
export class FlatTerrain extends Terrain {
  height(): number {
    return 0;
  }
}
