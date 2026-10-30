import { CAR, PPM } from "../engine/config";
import { NIGHT } from "./palette";
import { makeCanvas, outlineAndRim, Painter, type Point } from "./painter";

/*
 * The studio's electric pickup as pixel art, painted once from its profile (metres, car space)
 * at the world scale: a flat-panel stainless wedge, one crease from the nose to the roof apex
 * and one down to the tail, trapezoid wheel arches, a light bar across the nose and a red one
 * across the tail. Shaded in flat bands (the panels are flat, so are the reflections), then
 * outlined and rim-lit by the moon. Two versions: empty, and with the driver behind the glass.
 */

const PAINT = {
  highlight: "#ffffff",
  body: "#e6e9ec",
  lower: "#c4cad0",
  deep: "#8e979f",
  crease: "#f7f9fb",
  seam: "#a9b1b8",
  glass: "#0f141a",
  shine: "#3a4652",
  well: "#07090b",
  lightBar: "#f4fbff",
  tail: "#ff3b3b",
  pod: "#1b1f24",
  driver: "#05070a",
  tyre: "#0d0f11",
  tyreSide: "#1f2327",
  rim: "#3a4047",
  spoke: "#5f6870",
  hub: "#c9cfd5",
} as const;

/** Roof apex (car space, m): the one point the two flat roof planes meet. */
const APEX: Point = [0.15, 0.62];
const BODY: Point[] = [
  [2.32, -0.42], [2.36, -0.06], APEX, [-2.3, 0.12], [-2.3, -0.42],
];
const WINDOW: Point[] = [[1.2, 0.14], [0.15, 0.53], [-1.05, 0.31], [-1.05, 0.14]];
/** Angular wheel arches: trapezoids cut into the lower body. */
const ARCH = { halfBottom: 0.58, halfTop: 0.38, top: 0.02 } as const;

/** Sprite pixel of the centre of mass (shared by both versions). */
const OX = Math.round(2.42 * PPM) + 2;
const OY = Math.round(0.68 * PPM) + 2;

export interface CarSprite {
  empty: HTMLCanvasElement;
  occupied: HTMLCanvasElement;
  /** Sprite pixel of the centre of mass. */
  ox: number;
  oy: number;
}

function paint(occupied: boolean): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(OX + Math.round(2.42 * PPM) + 2, OY + Math.round(0.62 * PPM) + 2);
  const p = new Painter(ctx);
  const at = ([x, y]: Point, dy = 0): Point => [OX + x * PPM, OY - y * PPM + dy] as const;
  const to = (points: Point[], dy = 0): Point[] => points.map((point) => at(point, dy));
  p.poly(to(BODY), PAINT.highlight);
  p.poly(to(BODY, 1), PAINT.body);
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  // Flat panels: the lower body in shade below the belt crease, darker toward the sills.
  p.rect(0, OY + 0.02 * PPM, canvas.width, 4, PAINT.lower);
  p.rect(0, OY + 0.02 * PPM + 4, canvas.width, 12, PAINT.deep);
  for (const wheel of CAR.wheels) {
    const x = wheel.x;
    p.poly(
      to([
        [x - ARCH.halfBottom, -0.5],
        [x - ARCH.halfTop, ARCH.top],
        [x + ARCH.halfTop, ARCH.top],
        [x + ARCH.halfBottom, -0.5],
      ]),
      PAINT.well,
    );
  }
  ctx.restore();
  p.poly(to(WINDOW), PAINT.glass);
  if (occupied) {
    p.disc(OX + 0.05 * PPM, OY - 0.36 * PPM, 1.8, PAINT.driver);
    p.rect(OX - 0.08 * PPM, OY - 0.26 * PPM, 4, 4, PAINT.driver);
  }
  p.line(...at([0.95, 0.2]), ...at([0.45, 0.41]), PAINT.shine);
  // The creases: nose to apex, apex to tail, and the belt line along the side.
  p.line(...at([2.34, -0.04]), ...at(APEX), PAINT.crease);
  p.line(...at(APEX), ...at([-2.28, 0.12]), PAINT.crease);
  p.line(...at([2.3, 0.02]), ...at([-2.28, 0.02]), PAINT.seam);
  // Door shut lines and the bed's tonneau seam.
  p.line(...at([0.95, 0.1]), ...at([0.95, -0.38]), PAINT.seam);
  p.line(...at([-0.25, 0.1]), ...at([-0.25, -0.38]), PAINT.seam);
  p.line(...at([-1.1, 0.29]), ...at([-1.1, 0.05]), PAINT.seam);
  // Light bars: white across the nose, red across the tail.
  p.line(...at([2.36, -0.06]), ...at([1.9, 0.08]), PAINT.lightBar);
  p.rect(OX - 2.3 * PPM, OY - 0.11 * PPM, 1, 3, PAINT.tail);
  for (const nozzle of CAR.nozzles) p.rect(OX + nozzle.x * PPM - 3, OY - nozzle.y * PPM - 2, 6, 2, PAINT.pod);
  outlineAndRim(ctx, canvas.width, canvas.height, NIGHT.outline, NIGHT.rim, true);
  return canvas;
}

export function createCarSprite(): CarSprite {
  return { empty: paint(false), occupied: paint(true), ox: OX, oy: OY };
}

/** A wheel at screen pixel (x, y): tyre and a flat aero cover with six vanes turning with `spin`. */
export function drawWheel(p: Painter, x: number, y: number, spin: number): void {
  const r = CAR.wheelRadius * PPM;
  p.disc(x, y, r + 0.4, PAINT.tyre);
  p.disc(x, y, r - 1.2, PAINT.tyreSide);
  p.disc(x, y, r - 2, PAINT.rim);
  for (let i = 0; i < 6; i++) {
    const a = spin + (i * Math.PI * 2) / 6;
    p.line(x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.5, x + Math.cos(a) * (r - 2.4), y + Math.sin(a) * (r - 2.4), PAINT.spoke);
  }
  p.disc(x, y, 1.2, PAINT.hub);
}
