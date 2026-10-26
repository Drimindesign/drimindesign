/*
 * Geometry for bending a letter as a stack of horizontal strips.
 *
 * The letter box is the wordmark's 0.86em line box; Outrun's baseline sits at 0.68em from
 * its top (see wordmark.module.css). With the letter anchored at the baseline, a point at
 * height fraction y (0 = top of box) travels sideways by `bend * curve(y)`, where
 * curve(y) = ((anchor - y) / anchor)^2 above the baseline and 0 below it: the top moves
 * the full `bend`, the baseline doesn't move, and the stem curves smoothly in between.
 *
 * Each strip is translated by the travel at its bottom edge and skewed so its top edge
 * lands on the travel at its top edge. Neighbouring strips meet exactly, so the outline
 * is a continuous polyline with no steps.
 */

/** Line-box height and baseline position of the wordmark, in em. */
const LINE_BOX_EM = 0.86;
const BASELINE_EM = 0.68;
const ANCHOR = BASELINE_EM / LINE_BOX_EM;

export interface BendSlice {
  /** Clip insets from the top and bottom of the letter box, in %. */
  topPct: number;
  bottomPct: number;
  /** Travel factor at the strip's top and bottom edges (0 at the baseline, 1 at the top). */
  k0: number;
  k1: number;
  /** Strip height in em (for the skew angle). */
  heightEm: number;
}

function curve(y: number): number {
  return y >= ANCHOR ? 0 : ((ANCHOR - y) / ANCHOR) ** 2;
}

/** Slices covering the glyph from the box top to the baseline, plus one rigid foot strip. */
export function bendSlices(count: number): BendSlice[] {
  const slices: BendSlice[] = [];
  for (let i = 0; i < count; i++) {
    const y0 = (ANCHOR * i) / count;
    const y1 = (ANCHOR * (i + 1)) / count;
    slices.push({
      topPct: y0 * 100,
      bottomPct: (1 - y1) * 100,
      k0: curve(y0),
      k1: curve(y1),
      heightEm: (y1 - y0) * LINE_BOX_EM,
    });
  }
  // Below the baseline: nothing moves (caps have no descenders, but keep the box whole).
  slices.push({ topPct: ANCHOR * 100, bottomPct: 0, k0: 0, k1: 0, heightEm: (1 - ANCHOR) * LINE_BOX_EM });
  return slices;
}
