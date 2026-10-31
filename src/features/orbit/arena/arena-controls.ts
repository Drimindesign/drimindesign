import type { CombatInput } from "./combat";

/*
 * Keyboard for the arena: ← → (or A D) move (hold to run), ↑ / Space jump, F / J swing,
 * Shift / K block (hold), Q / L Master Stroke. Touch uses the pads, which write the same input.
 */

const KEYS: Record<string, "left" | "right" | "jump" | "attack" | "block" | "master"> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  Space: "jump",
  KeyW: "jump",
  KeyF: "attack",
  KeyJ: "attack",
  ShiftLeft: "block",
  ShiftRight: "block",
  KeyK: "block",
  KeyQ: "master",
  KeyL: "master",
};

export type PadAction = (typeof KEYS)[string];

/** Applies a press or release of one control to the input. */
export function apply(input: CombatInput, held: Set<PadAction>, action: PadAction, down: boolean): void {
  if (down) held.add(action);
  else held.delete(action);
  input.move = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
  input.block = held.has("block");
  if (down && action === "jump") input.jump = true;
  if (down && action === "attack") input.attack = true;
  if (down && action === "master") input.master = true;
}

/** Listens to the keyboard; returns the cleanup. */
export function bindKeys(input: () => CombatInput | null, held: Set<PadAction>): () => void {
  const handle = (down: boolean) => (event: KeyboardEvent): void => {
    const action = KEYS[event.code];
    const target = input();
    if (!action || !target || (down && event.repeat)) return;
    event.preventDefault();
    apply(target, held, action, down);
  };
  const press = handle(true);
  const release = handle(false);
  window.addEventListener("keydown", press);
  window.addEventListener("keyup", release);
  return () => {
    window.removeEventListener("keydown", press);
    window.removeEventListener("keyup", release);
  };
}
