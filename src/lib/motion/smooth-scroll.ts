import type Lenis from "lenis";

/*
 * Single site-wide Lenis instance. SmoothScroll (root layout) creates it after the intro;
 * features that need it (snap points, scroll-driven scenes) subscribe with onLenis and get
 * the instance as soon as it exists, or immediately if it already does.
 */

let instance: Lenis | null = null;
const waiting = new Set<(lenis: Lenis) => void>();

export function setLenis(lenis: Lenis | null): void {
  instance = lenis;
  if (!lenis) return;
  for (const callback of waiting) callback(lenis);
  waiting.clear();
}

export function getLenis(): Lenis | null {
  return instance;
}

/** Calls back with the Lenis instance once available. Returns an unsubscribe function. */
export function onLenis(callback: (lenis: Lenis) => void): () => void {
  if (instance) {
    callback(instance);
    return () => undefined;
  }
  waiting.add(callback);
  return () => waiting.delete(callback);
}

/** easeOutQuart: snaps glide in fast and land softly, with no overshoot. */
export function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4;
}
