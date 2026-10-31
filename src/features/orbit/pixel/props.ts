import { PPM } from "../engine/config";
import { DAWN } from "./palette";
import { makeCanvas, outlineAndRim, paste, Painter } from "./painter";

/*
 * Small props, painted once into canvases and outlined and rim-lit like the car: the sparks and
 * energy cells you collect, lantern checkpoints, the boar, the launch pad, the flag, birds,
 * satellites and streetlights. Each sprite records the pixel that sits on its anchor point.
 */

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Anchor pixel (where the sprite meets the ground, or its centre for floating things). */
  ax: number;
  ay: number;
}

type Paint = (p: Painter, w: number, h: number) => void;

function bake(w: number, h: number, ax: number, ay: number, paint: Paint, rim = true): Sprite {
  const [canvas, ctx] = makeCanvas(w, h);
  paint(new Painter(ctx), w, h);
  if (rim) outlineAndRim(ctx, w, h, DAWN.outline, DAWN.rim, true);
  return { canvas, ax, ay };
}

/** The idea: a glowing orange spark-fruit with a leaf. */
export const SPARK = (): Sprite =>
  bake(11, 12, 5, 6, (p) => {
    p.disc(5, 7, 3.4, "#e0471c");
    p.disc(5, 6.6, 2.6, "#fa6a2a");
    p.disc(4.2, 5.8, 1.1, "#ffd08a");
    p.line(5, 3, 6, 1, "#5d3d22");
    p.poly([[6, 2], [9, 1], [8, 3]], "#7fb04e");
  });

/** An energy cell: refills the thruster tank. */
export const CELL = (): Sprite =>
  bake(9, 13, 4, 6, (p) => {
    p.rect(2, 2, 5, 9, "#2a6f8f");
    p.rect(3, 3, 3, 7, "#67d3ff");
    p.rect(3, 5, 3, 1, "#e6fbff");
    p.rect(3, 8, 3, 1, "#e6fbff");
    p.rect(3, 1, 3, 1, "#a2aba8");
  });

/** A lantern on a post: a checkpoint. `lit` once you've passed it. */
export const LANTERN = (lit: boolean): Sprite =>
  bake(9, 26, 4, 25, (p) => {
    p.rect(4, 6, 1, 20, "#2b2420");
    p.rect(4, 4, 4, 1, "#2b2420");
    p.rect(5, 5, 3, 5, lit ? "#ffd27a" : "#4b3d35");
    if (lit) p.px(6, 7, "#fff6dc");
    p.rect(5, 10, 3, 1, "#2b2420");
  });

/** The wild boar, two running frames, facing left (it charges toward you). */
export const BOAR = (frame: 0 | 1): Sprite =>
  bake(30, 18, 15, 16, (p) => {
    p.poly([[5, 8], [10, 4], [22, 4], [27, 7], [27, 12], [22, 14], [8, 14], [4, 12]], "#4a3226");
    p.poly([[10, 4], [22, 4], [24, 6], [9, 6]], "#5e4232");
    p.poly([[1, 9], [5, 7], [7, 12], [2, 12]], "#3a271d");
    p.rect(0, 10, 2, 2, "#2a1c15");
    p.px(3, 12, "#f3e2a0");
    p.px(6, 8, "#120c0a");
    p.poly([[10, 3], [12, 1], [13, 4]], "#3a271d");
    const legs = frame === 0 ? [[8, 13], [12, 15], [20, 13], [24, 15]] : [[9, 15], [12, 13], [21, 15], [24, 13]];
    for (const [x, y] of legs) p.rect(x, 13, 2, y - 13 + 3, "#2a1c15");
    p.line(27, 8, 29, 6, "#2a1c15");
  });

/** A village cow (a humped zebu, cream with a darker neck), facing left, two walking frames. */
export const COW = (frame: 0 | 1): Sprite =>
  bake(38, 26, 19, 24, (p) => {
    // Body, hump and dewlap.
    p.poly([[9, 9], [14, 6], [30, 6], [35, 9], [35, 17], [30, 19], [12, 19], [8, 16]], "#e8e0cf");
    p.poly([[12, 6], [17, 2], [21, 3], [20, 7]], "#d9cfba");
    p.poly([[8, 11], [11, 18], [14, 18], [12, 11]], "#cfc4ad");
    p.poly([[14, 7], [30, 7], [30, 9], [14, 9]], "#f4eee0");
    // Head with horns, a darker face.
    p.poly([[1, 10], [5, 6], [10, 7], [10, 13], [4, 15], [1, 14]], "#c8bca4");
    p.rect(0, 12, 2, 2, "#8a7d68");
    p.px(5, 9, "#1a1410");
    p.line(5, 6, 3, 2, "#e6dcc6");
    p.line(8, 6, 9, 2, "#e6dcc6");
    p.line(6, 7, 4, 5, "#6b5f50");
    // Tail and legs.
    p.line(35, 9, 37, 16, "#bfb39b");
    p.px(37, 17, "#3a2e24");
    const legs = frame === 0 ? [[11, 0], [15, 2], [27, 0], [31, 2]] : [[12, 2], [15, 0], [28, 2], [31, 0]];
    for (const [x, lift] of legs) {
      p.rect(x, 18, 2, 6 - lift, "#d6ccb6");
      p.rect(x, 24 - lift, 2, 1, "#3a2e24");
    }
  });

/** The launch pad at the end of the city, with its gantry. */
export const LAUNCH_PAD = (): Sprite => {
  const w = Math.round(7 * PPM);
  const h = Math.round(5.5 * PPM);
  return bake(w, h, Math.round(w / 2), h - 1, (p) => {
    p.rect(0, h - 6, w, 6, "#3b3f45");
    p.rect(0, h - 6, w, 1, "#8a929b");
    for (let x = 2; x < w - 4; x += 10) p.rect(x, h - 4, 5, 2, "#fa2e00");
    const tower = w - 14;
    p.rect(tower, 6, 4, h - 12, "#5b6068");
    for (let y = 10; y < h - 8; y += 8) p.line(tower, y, tower + 3, y + 6, "#8a929b");
    p.rect(tower - 18, 14, 18, 2, "#5b6068");
    p.rect(tower + 1, 2, 2, 4, "#ff4d4d");
  });
};

/** The flag, folded (planting it unfurls it in `drawFlag`). */
export const FLAG_POLE = (): Sprite =>
  bake(5, 42, 2, 41, (p) => {
    p.rect(2, 0, 1, 42, "#d2dad6");
    p.px(2, 0, "#ffffff");
  });

/** A bird, wings up or down. */
export const BIRD = (frame: 0 | 1): Sprite =>
  bake(9, 6, 4, 3, (p) => {
    if (frame === 0) {
      p.line(0, 1, 4, 3, "#1b1d22");
      p.line(4, 3, 8, 1, "#1b1d22");
    } else {
      p.line(0, 4, 4, 3, "#1b1d22");
      p.line(4, 3, 8, 4, "#1b1d22");
    }
  }, false);

/** A satellite: gold-foil body and two solar panels. */
export const SATELLITE = (): Sprite =>
  bake(34, 14, 17, 7, (p) => {
    p.rect(0, 4, 11, 6, "#24366b");
    p.rect(23, 4, 11, 6, "#24366b");
    for (let x = 1; x < 11; x += 3) {
      p.rect(x, 5, 2, 4, "#3e5aa8");
      p.rect(x + 23, 5, 2, 4, "#3e5aa8");
    }
    p.rect(11, 6, 12, 2, "#a2aba8");
    p.rect(13, 3, 8, 8, "#c99a3a");
    p.rect(14, 4, 3, 3, "#f0d07a");
    p.px(17, 1, "#d2dad6");
    p.line(17, 1, 17, 3, "#a2aba8");
  });

/** A streetlight: post, arm and lamp head (its light is drawn live, smooth). */
export const STREETLIGHT = (): Sprite =>
  bake(16, 64, 2, 63, (p) => {
    p.rect(2, 4, 2, 60, "#3a3f47");
    p.rect(2, 3, 11, 2, "#3a3f47");
    p.rect(9, 5, 5, 2, "#ffe7b3");
  });

/** Space debris: a tumbling chunk of old rocket. */
export const DEBRIS = (): Sprite =>
  bake(14, 10, 7, 5, (p) => {
    p.poly([[1, 3], [8, 1], [13, 4], [11, 9], [3, 8]], "#6b6f78");
    p.poly([[3, 4], [8, 3], [10, 6], [5, 7]], "#8a8f99");
    p.rect(6, 4, 2, 2, "#c94a3a");
  });

/** Draws a sprite with its anchor at screen pixel (x, y). */
export function blit(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number): void {
  paste(ctx, sprite.canvas, x - sprite.ax, y - sprite.ay);
}

/* A soft halo around a glowing thing (smooth, screen-composited): sparks, cells, lamps. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, rgb: string, strength: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${rgb}, ${strength})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

/** The planted flag in the Drimin orange, rippling. `unfurl` 0 … 1. */
export function drawFlag(p: Painter, x: number, y: number, unfurl: number, time: number): void {
  const w = Math.round(14 * unfurl);
  for (let i = 0; i < w; i++) {
    const wave = Math.round(Math.sin(time * 5 - i * 0.6) * (i / 14) * 1.5);
    p.rect(x + 1 + i, y + 1 + wave, 1, 8, i % 5 === 0 ? "#d62700" : "#fa2e00");
  }
  if (w > 6) p.rect(x + 4, y + 4 + Math.round(Math.sin(time * 5 - 3 * 0.6) * 0.6), 3, 2, "#fff6dc");
}

/** Traffic: a sedan (4.4 m), a box truck (7 m) or an auto-rickshaw (2.8 m), facing right, anchored at the wheel line centre. */
export const TRAFFIC = (kind: "car" | "truck" | "rickshaw", body: string): Sprite => {
  if (kind === "rickshaw") return RICKSHAW(body);
  const long = kind === "truck";
  const w = Math.round((long ? 7 : 4.4) * PPM);
  const h = Math.round((long ? 3.1 : 1.45) * PPM);
  return bake(w + 2, h + 2, Math.round(w / 2) + 1, h + 1, (p) => {
    const wheel = (x: number): void => {
      p.disc(x, h - 3, 3.6, "#0b0c0f");
      p.disc(x, h - 3, 1.6, "#5b6068");
    };
    if (long) {
      p.rect(1, 1, w - 22, h - 6, body);
      p.rect(1, 1, w - 22, 2, "#e9e4d6");
      p.rect(w - 21, 12, 20, h - 17, "#2a2d33");
      p.rect(w - 15, 15, 9, 9, "#16222c");
      p.rect(w - 4, h - 12, 3, 2, "#ffe7b3");
      p.rect(1, h - 10, 2, 3, "#ff3b3b");
      wheel(12);
      wheel(24);
      wheel(w - 12);
    } else {
      p.poly([[1, h - 4], [2, h - 13], [16, h - 14], [26, h - 22], [50, h - 22], [60, h - 13], [w, h - 11], [w, h - 4]], body);
      p.poly([[28, h - 20], [48, h - 20], [55, h - 14], [20, h - 14]], "#16222c");
      p.rect(37, h - 20, 1, 6, body);
      p.rect(w - 3, h - 10, 2, 2, "#ffe7b3");
      p.rect(1, h - 12, 2, 3, "#ff3b3b");
      wheel(14);
      wheel(w - 15);
    }
  });
};

/* An auto-rickshaw: green body, a yellow canvas roof, the driver up front, three wheels (two seen). */
function RICKSHAW(body: string): Sprite {
  const w = Math.round(2.8 * PPM);
  const h = Math.round(1.75 * PPM);
  return bake(w + 2, h + 2, Math.round(w / 2) + 1, h + 1, (p) => {
    p.poly([[2, h - 4], [3, h - 13], [w - 12, h - 13], [w - 2, h - 9], [w - 1, h - 4]], body);
    p.poly([[3, 3], [w - 10, 2], [w - 5, h - 13], [3, h - 13]], "#f2c230");
    p.rect(3, 3, w - 13, 2, "#d9a91c");
    p.poly([[w - 10, 5], [w - 6, h - 13], [w - 12, h - 13], [w - 13, 6]], "#16222c");
    p.disc(w - 12, h - 15, 1.6, "#1a1410");
    p.rect(w - 3, h - 9, 2, 2, "#ffe7b3");
    p.rect(2, h - 11, 2, 2, "#ff3b3b");
    p.disc(7, h - 3, 2.8, "#0b0c0f");
    p.disc(7, h - 3, 1.1, "#5b6068");
    p.disc(w - 7, h - 3, 2.8, "#0b0c0f");
    p.disc(w - 7, h - 3, 1.1, "#5b6068");
  });
}
