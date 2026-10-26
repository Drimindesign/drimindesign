import type { CylinderProgress } from "./choreography";

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
  setProgress(progress: CylinderProgress): void;
  setReducedMotion(reduced: boolean): void;
  setVisible(visible: boolean): void;
  subscribe(listener: () => void): () => void;
}

export function createCylinderStore(): CylinderStore {
  const listeners = new Set<() => void>();
  const state = { enter: 0, rotate: 0, reducedMotion: false, visible: false };
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
