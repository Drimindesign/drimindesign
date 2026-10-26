/*
 * Shared, mutable state between the lanyard stage (DOM side) and its scene. Never React
 * state: the scene reads it per frame and subscribes to wake up when it changes.
 */
export interface LanyardControl {
  /** On screen and the tab visible: the simulation may run. */
  readonly visible: boolean;
  /** The stage has scrolled far enough into view for the cards to drop in. */
  readonly entered: boolean;
  setVisible: (visible: boolean) => void;
  setEntered: () => void;
  subscribe: (listener: () => void) => () => void;
}

export function createLanyardControl(): LanyardControl {
  const listeners = new Set<() => void>();
  const state = { visible: false, entered: false };
  const notify = (): void => listeners.forEach((listener) => listener());
  return {
    get visible() {
      return state.visible;
    },
    get entered() {
      return state.entered;
    },
    setVisible(visible) {
      if (state.visible === visible) return;
      state.visible = visible;
      notify();
    },
    setEntered() {
      if (state.entered) return;
      state.entered = true;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
