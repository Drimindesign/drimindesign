import { cylinder } from "@/lib/motion/tokens";
import { clamp01, easeInOutCubic, progressBetween } from "@/lib/motion/damp";

/*
 * Pure scroll → animation mapping for the ring section. Everything the scene and the
 * overlay show derives from the section's top edge and the viewport height.
 */

export interface CylinderProgress {
  /** 0 when the section's top meets the viewport bottom, 1 when it reaches the top (landed). */
  enter: number;
  /** 0 on the first project, 1 on the last (after the dwell). */
  rotate: number;
}

/*
 * Exit (0 → 1) over the section's last screen, once the sticky stage has let go: the whole
 * room lifts up off the page, revealing the story section waiting underneath.
 */
export function exitProgress(sectionTop: number, viewportHeight: number, panels: number): number {
  const scrolled = Math.max(0, -sectionTop) / viewportHeight;
  const height = sectionHeightVh(panels);
  return progressBetween(scrolled, height - 1, height);
}

/** Section height in viewport heights: the pinned screen plus every scroll phase. */
export function sectionHeightVh(panels: number): number {
  return 1 + cylinder.dwellVh + Math.max(0, panels - 1) * cylinder.perPanelVh + cylinder.tailVh;
}

/** Scroll offsets (in viewport heights from the section top) where the scroll rests. */
export function snapOffsetsVh(panels: number): number[] {
  return [0, ...Array.from({ length: panels }, (_, index) => cylinder.dwellVh + index * cylinder.perPanelVh)];
}

export function computeProgress(sectionTop: number, viewportHeight: number, panels: number): CylinderProgress {
  const enter = clamp01(1 - sectionTop / viewportHeight);
  const pinnedScroll = Math.max(0, -sectionTop) / viewportHeight;
  const rotate = progressBetween(
    pinnedScroll,
    cylinder.dwellVh,
    cylinder.dwellVh + Math.max(1, panels - 1) * cylinder.perPanelVh,
  );
  return { enter, rotate };
}

/** Eased descent (0 = top view, 1 = eye level) for a raw enter progress. */
export function descent(enter: number): number {
  return easeInOutCubic(enter);
}

/*
 * Ring turn in panels. Linear in scroll (Lenis already smooths the input and the snap
 * squares each project up), plus a last quarter-panel of turn that settles as the camera
 * lands, so the ring is still gliding into place when it reaches eye level.
 */
export function ringTurn(enter: number, rotate: number, panels: number): number {
  const landingSwing = 0.35 * (1 - descent(enter));
  return rotate * Math.max(1, panels - 1) - landingSwing;
}

/** Index of the project facing the camera. */
export function frontIndex(rotate: number, panels: number): number {
  return Math.round(rotate * Math.max(1, panels - 1));
}
