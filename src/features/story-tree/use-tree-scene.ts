"use client";

import { useEffect, useState, type RefObject } from "react";
import { damp } from "@/lib/motion/damp";
import { easeOutQuart, onLenis } from "@/lib/motion/smooth-scroll";
import { scroll, storyTree } from "@/lib/motion/tokens";
import { warmUp } from "@/lib/motion/warm-up";
import { growthFromScroll, stageOf, loadTreeData, loadTreeModel, type TreeModel } from "./tree-model";
import { TreeRenderer, type Leader, type TreeLayout } from "./tree-renderer";

/* Tree content bounds in tree units (crown top to root tips), used to fit it on screen. */
const BOUNDS = { left: 60, right: 940, top: 60, bottom: 930 } as const;
/** At or above this width, milestones sit in side columns; below, one caption at the top. */
export const SIDE_LABELS_MIN_WIDTH = 900;

export interface LabelSlot {
  /** Label's left edge and top, CSS px within the stage. */
  x: number;
  y: number;
  width: number;
  side: "left" | "right";
  /** Where the leader line meets the label. */
  edgeX: number;
}

interface TreeSceneOptions {
  stageRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  milestones: number;
}

export interface TreeSceneState {
  /** Where each label goes (side-column mode), or null before layout / in caption mode. */
  slots: LabelSlot[] | null;
  /** Index of the latest milestone reached (−1 before the first). */
  reached: number;
}


/** Vertical gap between stacked milestone labels in one column, CSS px. */
const LABEL_GAP = 20;
/** Label height used before the labels exist in the DOM (tag line + three body lines). */
const LABEL_HEIGHT_ESTIMATE = 120;

/* Fits the tree into the stage below `top` (the copy above it never overlaps the crown). */
function fit(width: number, height: number, top: number, sideLabels: boolean): TreeLayout {
  const availableWidth = sideLabels ? width * 0.52 : width - 24;
  const availableHeight = height - top - 16;
  const boxWidth = BOUNDS.right - BOUNDS.left;
  const boxHeight = BOUNDS.bottom - BOUNDS.top;
  const scale = Math.min(availableWidth / boxWidth, availableHeight / boxHeight);
  return {
    scale,
    offsetX: width / 2 - 500 * scale,
    offsetY: top + (availableHeight - boxHeight * scale) / 2 - BOUNDS.top * scale,
  };
}

/*
 * Stacks one column's labels: each wants to sit level with its branch, but never closer
 * than LABEL_GAP to the one above; if the column runs off the bottom, it is pushed back up.
 */
function stackColumn(wanted: number[], heights: number[], minY: number, maxY: number): number[] {
  const order = wanted.map((_, index) => index).sort((a, b) => wanted[a] - wanted[b]);
  const y = wanted.slice();
  let previousBottom = minY - LABEL_GAP;
  for (const index of order) {
    y[index] = Math.max(wanted[index], previousBottom + LABEL_GAP);
    previousBottom = y[index] + heights[index];
  }
  let nextTop = maxY + LABEL_GAP;
  for (const index of order.slice().reverse()) {
    y[index] = Math.max(minY, Math.min(y[index], nextTop - LABEL_GAP - heights[index]));
    nextTop = y[index];
  }
  return y;
}

/*
 * Runs the story tree: loads the generated model when the section is near, maps scroll to
 * growth (eased, so it follows the scroll with weight), and renders while the section is on
 * screen. Writes --growth on the stage for the CSS-driven title and outro; React state
 * changes only when a milestone is reached or the layout changes.
 */
export function useTreeScene({ stageRef, canvasRef, milestones }: TreeSceneOptions): TreeSceneState {
  const [model, setModel] = useState<TreeModel | null>(null);
  const [slots, setSlots] = useState<LabelSlot[] | null>(null);
  const [reached, setReached] = useState(-1);

  // Fetch the tree data after the intro; build the model two screens before the section.
  useEffect(() => {
    const section = stageRef.current?.closest("section");
    if (!section) return;
    warmUp(loadTreeData);
    let cancelled = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        void loadTreeModel()
          .then((loaded) => !cancelled && setModel(loaded))
          .catch(() => undefined);
      },
      { rootMargin: "200% 0px" },
    );
    observer.observe(section);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const section = stage?.closest("section");
    if (!model || !stage || !canvas || !section) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new TreeRenderer(canvas, model);
    const anchors = model.anchors.slice(0, milestones);
    let growth = reduced ? 1 : growthFromScroll(section.getBoundingClientRect().top, window.innerHeight);
    let sideLabels = false;
    let placed: LabelSlot[] = [];
    let lastReached = -2;
    let visible = false;
    let frame = 0;
    let last = 0;
    let time = 0;
    let tremorStart = -Infinity;
    let remeasure = 0;
    const haptics = matchMedia("(pointer: coarse)").matches && "vibrate" in navigator;

    const layout = (): void => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      sideLabels = width >= SIDE_LABELS_MIN_WIDTH;
      // The crown starts below the heading (and, on phones, below the tallest caption).
      const heading = stage.querySelector<HTMLElement>("[data-tree-heading]");
      const headingTop = heading?.offsetTop ?? 0;
      const copyHeight = Math.max(heading?.offsetHeight ?? 0, sideLabels ? 0 : LABEL_HEIGHT_ESTIMATE);
      const treeTop = headingTop + copyHeight + 20;
      const treeLayout = fit(width, height, treeTop, sideLabels);
      renderer.resize(width, height, Math.min(window.devicePixelRatio, 2), treeLayout);
      if (!sideLabels) {
        placed = [];
        setSlots(null);
        return;
      }
      // Each label sits in the column on its branch's side, level with the branch where it
      // can, stacked clear of its neighbours. Same gutter and width as the CSS.
      const gutter = Math.min(40, Math.max(16, width * 0.03));
      const labelWidth = Math.min(width * 0.24, 280);
      const rendered = stage.querySelectorAll<HTMLElement>("[data-tree-label]");
      const heights = anchors.map((_, index) => rendered[index]?.offsetHeight || LABEL_HEIGHT_ESTIMATE);
      const points = anchors.map((node) => renderer.nodeToScreen(node));
      const sides = points.map(([x]) => (x < width / 2 ? "left" : "right") as LabelSlot["side"]);
      const y = new Array<number>(anchors.length);
      for (const side of ["left", "right"] as const) {
        const members = anchors.map((_, index) => index).filter((index) => sides[index] === side);
        const stacked = stackColumn(
          members.map((index) => points[index][1] - 18),
          members.map((index) => heights[index]),
          headingTop,
          height - 24,
        );
        members.forEach((index, k) => (y[index] = stacked[k]));
      }
      placed = anchors.map((_, index) => {
        const side = sides[index];
        const left = side === "left" ? gutter : width - gutter - labelWidth;
        return {
          x: left,
          y: y[index],
          width: labelWidth,
          side,
          edgeX: side === "left" ? left + labelWidth + 14 : left - 14,
        };
      });
      setSlots(placed);
      // First pass uses estimated heights; once the labels exist, stack them by their real size.
      if (rendered.length === 0) {
        cancelAnimationFrame(remeasure);
        remeasure = requestAnimationFrame(() => {
          remeasure = requestAnimationFrame(() => {
            layout();
            draw(0);
          });
        });
      }
    };

    const leaders = (): Leader[] =>
      placed.map((slot, index) => ({
        node: anchors[index],
        toX: slot.edgeX,
        toY: slot.y + 18,
        progress: stageOf(growth, model.tiers[index][1] - 0.03, 0.04),
      }));

    // A milestone lands at the end of its tier: the tree trembles, and phones give a tap.
    const onReached = (): void => {
      tremorStart = time;
      if (haptics) {
        try {
          navigator.vibrate(14);
        } catch {
          // Vibration needs a user gesture on some browsers; the visual tremor is enough.
        }
      }
    };

    const draw = (dt: number): void => {
      const tremor = reduced ? 0 : storyTree.tremorAmount * Math.exp(-(time - tremorStart) * storyTree.tremorDecay);
      renderer.render(growth, time, dt, leaders(), !reduced, tremor);
      stage.style.setProperty("--growth", growth.toFixed(4));
      let current = -1;
      anchors.forEach((_, index) => {
        if (growth >= model.tiers[index][1] - 0.002) current = index;
      });
      if (current !== lastReached) {
        if (current > lastReached && lastReached !== -2) onReached();
        lastReached = current;
        setReached(current);
      }
    };

    const tick = (now: number): void => {
      const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
      last = now;
      time += dt;
      const target = growthFromScroll(section.getBoundingClientRect().top, window.innerHeight);
      growth = damp(growth, target, storyTree.growthLambda, dt);
      draw(dt);
      frame = visible ? requestAnimationFrame(tick) : 0;
    };

    const start = (): void => {
      if (!frame && !reduced) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && document.visibilityState === "visible";
      if (visible) start();
    });
    observer.observe(section);
    const resize = new ResizeObserver(() => {
      layout();
      draw(0);
    });
    resize.observe(stage);
    layout();
    draw(0);

    // Soft snap onto each milestone's pause, so the scroll holds where the story lands.
    let destroySnap: (() => void) | undefined;
    let disposed = false;
    const stopWaiting = onLenis((lenis) => {
      void import("lenis/snap").then(({ default: Snap }) => {
        if (disposed) return;
        const snap = new Snap(lenis, {
          type: "proximity",
          duration: scroll.snapDurationS,
          easing: easeOutQuart,
          distanceThreshold: scroll.snapThreshold,
          debounce: scroll.snapDebounceMs,
        });
        snap.addElements(Array.from(section.querySelectorAll<HTMLElement>("[data-snap]")), { align: "start" });
        destroySnap = () => snap.destroy();
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(remeasure);
      observer.disconnect();
      resize.disconnect();
      disposed = true;
      stopWaiting();
      destroySnap?.();
    };
  }, [model, stageRef, canvasRef, milestones]);

  return { slots, reached };
}
