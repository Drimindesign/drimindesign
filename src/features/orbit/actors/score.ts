import type { ToScreen } from "../engine/camera";

/** Points for everything the game rewards. */
export const POINTS = {
  spark: 10,
  cell: 10,
  staffHit: 25,
  stomp: 50,
  driveOff: 100,
  carBump: 50,
  cleanLanding: 50,
  /** Per second in the air in the car, awarded on landing. */
  airPerSecond: 40,
  stageClear: 500,
} as const;

interface Popup {
  text: string;
  x: number;
  y: number;
  age: number;
}

/** How long a "+25" floats before it's gone (s). */
const POPUP_LIFE = 1.1;

/*
 * The run's score, and the small "+25 Staff hit" labels that float up from where points were
 * earned (drawn in the world, so they stay with what earned them).
 */
export class Score {
  total = 0;
  private readonly popups: Popup[] = [];

  add(points: number, label: string, x: number, y: number): void {
    this.total += points;
    this.popups.push({ text: `+${points} ${label}`, x, y, age: 0 });
    if (this.popups.length > 12) this.popups.shift();
  }

  update(dt: number): void {
    for (const popup of this.popups) popup.age += dt;
    while (this.popups.length && this.popups[0].age > POPUP_LIFE) this.popups.shift();
  }

  draw(ctx: CanvasRenderingContext2D, toScreen: ToScreen): void {
    ctx.save();
    ctx.font = "700 6px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(15, 10, 20, 0.85)";
    for (const popup of this.popups) {
      const t = popup.age / POPUP_LIFE;
      const [x, y] = toScreen(popup.x, popup.y + t * 1.4);
      ctx.globalAlpha = 1 - t * t;
      ctx.strokeText(popup.text, x, y);
      ctx.fillStyle = "#fff6dc";
      ctx.fillText(popup.text, x, y);
    }
    ctx.restore();
  }
}

/** Points for stunts (before the combo multiplier). */
export const STUNTS = {
  flip: 300,
  nearMiss: 150,
  ring: 120,
} as const;

/** The combo resets if you stay on the ground this long without a trick (s). */
const COMBO_GROUND = 2.5;
const MAX_MULTIPLIER = 5;

/*
 * The combo: every trick (a flip, a clean landing, a near miss, a ring) adds to a chain, and
 * the chain raises the multiplier on all stunt points. Staying on the ground drains it; a
 * crash or a rough landing breaks it.
 */
export class Combo {
  chain = 0;
  /** Seconds left before the chain drains (while grounded). */
  timer = 0;

  get multiplier(): number {
    return Math.min(MAX_MULTIPLIER, 1 + Math.floor(this.chain / 2));
  }

  add(tricks: number): void {
    this.chain += tricks;
    this.timer = COMBO_GROUND;
  }

  break(): void {
    this.chain = 0;
    this.timer = 0;
  }

  update(dt: number, grounded: boolean): void {
    if (!grounded || this.chain === 0) return;
    this.timer = Math.max(0, this.timer - dt);
    if (this.timer === 0) this.chain = 0;
  }

  /** Share of the drain timer left (for the HUD bar). */
  get remaining(): number {
    return this.chain === 0 ? 0 : this.timer / COMBO_GROUND;
  }
}
