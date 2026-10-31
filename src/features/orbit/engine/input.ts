/*
 * Input abstraction: keyboard, gamepads and on-screen buttons feed the same actions, and the game reads
 * a snapshot per frame (held state plus presses since the last read). Nothing else in the game
 * touches the keyboard.
 */

export type Action = "left" | "right" | "jump" | "interact" | "switch" | "planet" | "attack" | "reset" | "pause";

export interface InputSnapshot {
  move: number;
  /** ← or → pressed this step: 1 right, -1 left (flips are taps, so holding gas never flips). */
  flipPressed: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
  switchPressed: boolean;
  planetPressed: boolean;
  /** Swing the staff. */
  attackPressed: boolean;
  /** Back to the last checkpoint. */
  resetPressed: boolean;
  pausePressed: boolean;
}

const KEYS: Record<string, Action> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "jump",
  ArrowUp: "jump",
  KeyW: "jump",
  KeyE: "interact",
  Enter: "interact",
  KeyC: "switch",
  KeyG: "planet",
  KeyF: "attack",
  KeyX: "attack",
  KeyR: "reset",
  Escape: "pause",
  KeyP: "pause",
};

/**
 * A gamepad (standard mapping: Xbox, PlayStation, most Bluetooth controllers): the stick or D-pad
 * moves; A jumps and fires the thrusters, X swings, B gets in and out, Y calls the truck,
 * Start pauses, Select goes back to the checkpoint.
 */
const PAD_BUTTONS: readonly (readonly [number, Action])[] = [
  [0, "jump"],
  [12, "jump"],
  [2, "attack"],
  [1, "interact"],
  [3, "switch"],
  [9, "pause"],
  [8, "reset"],
  [14, "left"],
  [15, "right"],
];
/** How far the stick must lean before it counts (0 … 1). */
const STICK = 0.4;

export class Input {
  private readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();
  private padHeld = new Set<Action>();

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const action = KEYS[event.code];
    if (!action || event.metaKey || event.ctrlKey || event.altKey) return;
    // Don't steal keys from links and buttons around the game.
    const target = event.target;
    if (target instanceof Element && target.closest("a, input, textarea, select, button") && event.code !== "Space") return;
    event.preventDefault();
    this.press(action, !event.repeat);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const action = KEYS[event.code];
    if (action) this.release(action);
  };

  private readonly onBlur = (): void => this.held.clear();

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.held.clear();
    this.pressed.clear();
  }

  press(action: Action, fresh = true): void {
    if (fresh && !this.held.has(action)) this.pressed.add(action);
    this.held.add(action);
  }

  release(action: Action): void {
    this.held.delete(action);
  }

  /* Gamepads are polled (the browser sends no events for buttons): edges become presses and releases. */
  private pollPads(): void {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const now = new Set<Action>();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const x = pad.axes[0] ?? 0;
      if (x < -STICK) now.add("left");
      if (x > STICK) now.add("right");
      for (const [button, action] of PAD_BUTTONS) if (pad.buttons[button]?.pressed) now.add(action);
    }
    for (const action of now) if (!this.padHeld.has(action)) this.press(action);
    for (const action of this.padHeld) if (!now.has(action)) this.release(action);
    this.padHeld = now;
  }

  read(): InputSnapshot {
    this.pollPads();
    const snapshot: InputSnapshot = {
      move: (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0),
      flipPressed: (this.pressed.has("right") ? 1 : 0) - (this.pressed.has("left") ? 1 : 0),
      jumpHeld: this.held.has("jump"),
      jumpPressed: this.pressed.has("jump"),
      interactPressed: this.pressed.has("interact"),
      switchPressed: this.pressed.has("switch"),
      planetPressed: this.pressed.has("planet"),
      attackPressed: this.pressed.has("attack"),
      resetPressed: this.pressed.has("reset"),
      pausePressed: this.pressed.has("pause"),
    };
    this.pressed.clear();
    return snapshot;
  }
}
