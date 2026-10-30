import { ART, PPM } from "./config";

/** Camera centre in world metres. */
export interface Camera {
  x: number;
  y: number;
}

/** Look-ahead per m/s of speed, capped at this share of the view's width. */
const LOOK_AHEAD = 0.4;
const LOOK_CAP = 0.3;

/*
 * The follow camera: critically damped horizontally (steady, no overshoot) with look-ahead in
 * the direction of travel, and vertically keeping the ground ~70% down the view while
 * following anything that climbs into the top quarter. Drawn at whole pixels, so the world and
 * the sprites never shimmer against each other.
 */
export class FollowCamera implements Camera {
  x = 0;
  y = 0;
  private vx = 0;

  constructor(
    private width: number,
    private height: number,
  ) {}

  setView(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /** The vertical position that puts `ground` at 70% of the view, or follows a high target. */
  private wantY(ground: number, targetY: number, groundShare: number): number {
    return Math.max(ground + ((groundShare - 0.5) * this.height) / PPM, targetY - (0.25 * this.height) / PPM);
  }

  snap(x: number, ground: number, targetY: number, groundShare = 0.7): void {
    this.x = x;
    this.y = this.wantY(ground, targetY, groundShare);
    this.vx = 0;
  }

  follow(targetX: number, targetY: number, vx: number, ground: number, dt: number, groundShare = 0.7): void {
    const view = this.width / PPM;
    const ahead = Math.max(-view * LOOK_CAP, Math.min(view * LOOK_CAP, vx * LOOK_AHEAD));
    const omega = 5;
    const ax = omega * omega * (targetX + ahead - this.x) - 2 * omega * this.vx;
    this.vx += ax * dt;
    this.x += this.vx * dt;
    this.y += (this.wantY(ground, targetY, groundShare) - this.y) * (1 - Math.exp(-6 * dt));
  }

  /** Whole-pixel camera for drawing. */
  snapped(): Camera {
    return { x: Math.round(this.x * PPM * ART) / (PPM * ART), y: Math.round(this.y * PPM * ART) / (PPM * ART) };
  }
}

export type ToScreen = (x: number, y: number) => [number, number];

export function projector(camera: Camera, width: number, height: number): ToScreen {
  return (x, y) => [Math.round(((x - camera.x) * PPM + width / 2) * ART) / ART, Math.round((height / 2 - (y - camera.y) * PPM) * ART) / ART];
}
