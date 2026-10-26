/*
 * Frame-rate independent smoothing. `lambda` is the response speed (1/s): higher follows
 * faster. Unlike a fixed lerp factor, the result is the same at 30, 60 or 144 fps.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Maps value from [start, end] to [0, 1], clamped. */
export function progressBetween(value: number, start: number, end: number): number {
  return end === start ? 1 : clamp01((value - start) / (end - start));
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
