import type { SpringState } from "@/lib/motion/spring";
import type { CylinderProgress } from "./choreography";

/** What the ring offers DOM controls (the View project link) while it is mounted. */
export interface PanelApi {
  /** The panel facing the camera: its mesh index and a point just inside its top-right corner (CSS px). */
  front(): { index: number; corner: [number, number] } | null;
  /** Opens panel `index` (mesh index) with the tissue pull, as a click on it would. */
  open(index: number): void;
}

/*
 * Mutable bridge between the scroll handler (DOM side) and the 3D scene. Scroll writes the
 * targets and notifies; the scene reads them every frame and springs toward them.
 * Deliberately not React state: per-frame values must never trigger re-renders.
 */
export interface CylinderStore {
  /** Scroll targets, see choreography.ts. */
  readonly enter: number;
  readonly rotate: number;
  /** When true the camera starts landed and nothing overshoots. */
  readonly reducedMotion: boolean;
  /** Whether the section is on screen; idle animation (the figures) runs only then. */
  readonly visible: boolean;
  /**
   * A spring that outlives the scene, created at `initial` on first use: <Activity> unmounts
   * the canvas tree while the route is hidden, and on return the camera and ring must be
   * exactly where they were.
   */
  spring(name: "camera" | "ring", initial: number): SpringState;
  readonly panels: PanelApi | null;
  setPanels(api: PanelApi | null): void;
  setProgress(progress: CylinderProgress): void;
  setReducedMotion(reduced: boolean): void;
  setVisible(visible: boolean): void;
  subscribe(listener: () => void): () => void;
}

export function createCylinderStore(): CylinderStore {
  const listeners = new Set<() => void>();
  const state = { enter: 0, rotate: 0, reducedMotion: false, visible: false };
  const springs = new Map<string, SpringState>();
  let panels: PanelApi | null = null;
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    get enter() {
      return state.enter;
    },
    get rotate() {
      return state.rotate;
    },
    get reducedMotion() {
      return state.reducedMotion;
    },
    get visible() {
      return state.visible;
    },
    spring(name, initial) {
      let spring = springs.get(name);
      if (!spring) {
        spring = { value: initial, velocity: 0 };
        springs.set(name, spring);
      }
      return spring;
    },
    get panels() {
      return panels;
    },
    setPanels(api) {
      panels = api;
    },
    setProgress(progress) {
      state.enter = progress.enter;
      state.rotate = progress.rotate;
      notify();
    },
    setReducedMotion(reduced) {
      state.reducedMotion = reduced;
      notify();
    },
    setVisible(visible) {
      if (state.visible === visible) return;
      state.visible = visible;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
