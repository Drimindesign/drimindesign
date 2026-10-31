import type { ToScreen } from "../engine/camera";

/** Points for everything the game rewards. */
export const POINTS = {
  spark: 10,
  cell: 10,
  swordHit: 25,
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
 * The run's score, and the small "+25 Slash" labels that float up from where points were
 * earned (drawn in the world, so they stay with what earned them).
 */
export class Score {
  total = 0;
  private readonly popups: Popup[] = [];

  add(points: number, label: string, x: number, y: number): void {
    // Penalties take points away, never below zero; a zero just shows the label.
    this.total = Math.max(0, this.total + points);
    const amount = points > 0 ? `+${points} ` : points < 0 ? `${points} ` : "";
    this.popups.push({ text: `${amount}${label}`, x, y, age: 0 });
    if (this.popups.length > 12) this.popups.shift();
  }

  update(dt: number): void {
    for (const popup of this.popups) popup.age += dt;
    while (this.popups.length && this.popups[0].age > POPUP_LIFE) this.popups.shift();
  }

  /*
   * Popups pop in (an overshooting scale), float up and fade. Bigger scores are bigger text and
   * gold; penalties are red.
   */
  draw(ctx: CanvasRenderingContext2D, toScreen: ToScreen): void {
    ctx.save();
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(15, 10, 20, 0.9)";
    for (const popup of this.popups) {
      const t = popup.age / POPUP_LIFE;
      const [x, y] = toScreen(popup.x, popup.y + t * 1.6);
      const value = Number.parseInt(popup.text, 10) || 0;
      const size = value >= 500 ? 9 : value >= 150 ? 7.5 : 6;
      // Pop: overshoot to 1.25× in the first tenth of its life, settle to 1.
      const pop = t < 0.1 ? 0.6 + (t / 0.1) * 0.65 : 1 + 0.25 * Math.max(0, 1 - (t - 0.1) / 0.15);
      ctx.font = `800 ${(size * pop).toFixed(1)}px system-ui, sans-serif`;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1 - t * t;
      ctx.strokeText(popup.text, x, y);
      ctx.fillStyle = value < 0 ? "#ff6a5e" : value >= 150 ? "#ffd25e" : "#fff6dc";
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
  /** A beast caught under the thruster jet. */
  blast: 150,
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
