/* Damped spring integrator for per-frame physics (semi-implicit Euler, unit mass). */

export interface SpringState {
  value: number;
  velocity: number;
}

export interface SpringConfig {
  stiffness: number;
  damping: number;
}

/** Advances `state` toward `target` by `dt` seconds, in place. */
export function stepSpring(state: SpringState, target: number, config: SpringConfig, dt: number): void {
  const acceleration = config.stiffness * (target - state.value) - config.damping * state.velocity;
  state.velocity += acceleration * dt;
  state.value += state.velocity * dt;
}

/** True when the spring is close enough to `target` and slow enough to stop simulating. */
export function springAtRest(state: SpringState, target: number, threshold: number): boolean {
  return Math.abs(state.value - target) < threshold && Math.abs(state.velocity) < threshold;
}
