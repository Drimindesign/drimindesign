/*
 * The project-open transition's shared state (AGENTS.md §3.4). The ring reports where the
 * clicked panel is on screen; the TransitionLayer (root layout) plays the pull, navigates,
 * and later plays it backwards when the visitor returns. Plain module state, no React state:
 * the layer and the close button subscribe.
 */

/** Points sampled along the panel's top and bottom edges (the panel is curved on the ring). */
export const EDGE_SAMPLES = 9;

export interface TissueOrigin {
  slug: string;
  /** The panel's image (already in the browser cache from the ring). */
  image: string;
  /** Screen positions (CSS px, x/y pairs) along the panel's top and bottom edges, left to right. */
  top: Float32Array;
  bottom: Float32Array;
  /** Where the panel was pinched, in its UV space (0…1, v up). */
  pinch: [number, number];
}

export type TissuePhase = "idle" | "opening" | "open" | "closing";

const listeners = new Set<() => void>();
const state: { phase: TissuePhase; origin: TissueOrigin | null } = { phase: "idle", origin: null };
const notify = (): void => listeners.forEach((listener) => listener());

export const tissue = {
  get phase(): TissuePhase {
    return state.phase;
  },
  get origin(): TissueOrigin | null {
    return state.origin;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setPhase(phase: TissuePhase): void {
    state.phase = phase;
    if (phase === "idle") state.origin = null;
    notify();
  },
};

/** Called by the ring when a panel is clicked. Ignored while a transition is running. */
export function openProject(origin: TissueOrigin): void {
  if (state.phase !== "idle") return;
  state.origin = origin;
  state.phase = "opening";
  notify();
}

/** The slug the visitor arrived at through the ring (so Close can play the pull backwards). */
export function originSlug(): string | null {
  return state.phase === "open" ? (state.origin?.slug ?? null) : null;
}
