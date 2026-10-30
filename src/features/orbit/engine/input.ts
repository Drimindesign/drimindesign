/*
 * Input abstraction: keyboard and on-screen buttons feed the same actions, and the game reads
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

export class Input {
  private readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();

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

  read(): InputSnapshot {
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
