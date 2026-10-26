import { fallingWords } from "@/lib/motion/tokens";

const EASE_OUT_EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";

/*
 * FLIP helpers for the words that stay. Layout changes (a word leaving or returning) happen
 * instantly; the visible words are then animated from where they were to where they are,
 * using transforms only.
 */
function flip(sentence: HTMLElement, selector: string, mutate: () => void, animate: boolean): void {
  const visible = (): HTMLElement[] =>
    Array.from(sentence.querySelectorAll<HTMLElement>(`${selector}:not([data-fallen])`));
  const before = new Map(visible().map((el) => [el, el.getBoundingClientRect()]));
  mutate();
  if (!animate) return;
  for (const el of visible()) {
    const from = before.get(el);
    if (!from) continue;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      duration: fallingWords.closeGapMs,
      easing: EASE_OUT_EXPO,
    });
  }
}

/** Removes `word` from the line and glides its neighbours into the gap. */
export function closeGaps(sentence: HTMLElement, word: HTMLElement, selector: string, animate: boolean): void {
  flip(sentence, selector, () => word.setAttribute("data-fallen", ""), animate);
}

/** Brings every fallen word back: neighbours make room, returning words rise into place. */
export function restoreWords(sentence: HTMLElement, selector: string, animate: boolean): void {
  const returning = Array.from(sentence.querySelectorAll<HTMLElement>(`${selector}[data-fallen]`));
  flip(
    sentence,
    selector,
    () => {
      for (const el of returning) {
        el.removeAttribute("data-fallen");
        el.removeAttribute("data-dropping");
      }
    },
    animate,
  );
  if (!animate) return;
  returning.forEach((el, index) => {
    el.animate([{ opacity: 0.01, transform: "translateY(45%)" }, { opacity: 1, transform: "none" }], {
      duration: fallingWords.closeGapMs,
      delay: index * 30,
      easing: EASE_OUT_EXPO,
      fill: "backwards",
    });
  });
}
