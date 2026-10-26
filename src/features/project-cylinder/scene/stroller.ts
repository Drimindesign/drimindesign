import { damp } from "@/lib/motion/damp";

/*
 * A slow stroll back and forth along a line on the floor: walk, ease to a stop, look up at
 * the ring for a while, turn around, walk back. Velocity eases in and out (no instant
 * starts), the turn happens in place, and a turning ring makes them stop to watch.
 */

interface StrollerOptions {
  from: number;
  to: number;
  /** Walking speed, world units per second. */
  speed: number;
  /** One full gait cycle (two steps), world units. */
  stride: number;
  /** How long they stand and look at each end, seconds. */
  pause: number;
}

export interface StrollerState {
  x: number;
  /** Gait phase, radians. */
  phase: number;
  /** 0 standing … 1 walking at full speed. */
  walking: number;
  /** +1 facing toward `to`, −1 toward `from`; passes through 0 while turning. */
  facing: number;
  /** 0 … 1: how much they're looking up at the ring. */
  look: number;
}

export class Stroller {
  readonly state: StrollerState;
  private velocity = 0;
  private direction = 1;
  private pauseLeft: number;

  constructor(private readonly options: StrollerOptions) {
    this.state = { x: options.from, phase: 0, walking: 0, facing: 1, look: 0 };
    this.pauseLeft = options.pause * 0.2;
  }

  /** `watch` (0…1): the ring is turning; above ~0.35 they stop and watch it. */
  update(dt: number, watch: number): StrollerState {
    const { from, to, speed, stride, pause } = this.options;
    const state = this.state;
    const watching = watch > 0.35;

    let target = 0;
    if (this.pauseLeft > 0) {
      if (!watching) this.pauseLeft -= dt;
    } else if (!watching) {
      target = this.direction * speed;
      const end = this.direction > 0 ? to : from;
      // Start easing down early enough to stop at the end of the line.
      const remaining = (end - state.x) * this.direction;
      if (remaining < speed * 0.9) target *= Math.max(0, remaining / (speed * 0.9));
      if (remaining <= 0.01) {
        this.direction *= -1;
        this.pauseLeft = pause;
      }
    }

    this.velocity = damp(this.velocity, target, 1.8, dt);
    state.x += this.velocity * dt;
    state.walking = Math.min(1, Math.abs(this.velocity) / speed);
    state.phase += (Math.abs(this.velocity) / stride) * Math.PI * 2 * dt;
    // Turn to face the next direction while paused (scale.x sweeps through zero).
    const facingTarget = this.pauseLeft > pause * 0.25 && this.pauseLeft > 0 ? -this.direction : this.direction;
    state.facing = damp(state.facing, facingTarget, 4, dt);
    const lookTarget = this.pauseLeft > pause * 0.3 || watching ? 1 : 0;
    state.look = damp(state.look, lookTarget, 1.6, dt);
    return state;
  }
}
