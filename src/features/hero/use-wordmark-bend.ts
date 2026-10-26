"use client";

import { useEffect, useState, type RefObject } from "react";
import { afterIntro, whenIdle } from "@/lib/motion/after-intro";
import { spring, wordmarkBend } from "@/lib/motion/tokens";
import { springAtRest, stepSpring, type SpringState } from "@/lib/motion/spring";

interface LetterState {
  el: HTMLElement;
  center: number;
  bend: SpringState;
  stretch: SpringState;
}

interface PointerState {
  x: number;
  y: number;
  /** Smoothed horizontal speed, px/s. */
  vx: number;
  t: number;
}

/** Peak of r·e^(-r²) is 1/√(2e) at r = 1/√2; this scales the lean so its peak is 1. */
const LEAN_NORMALISER = Math.sqrt(2 * Math.E);
const MAX_DT = 1 / 30;
/** Baseline position within the letters' line box (0.68em of 0.86em, see wordmark.module.css). */
const BASELINE_RATIO = 0.68 / 0.86;
/** Fade distance beyond the glyphs, as a fraction of the line box height. */
const GATE_FADE = 0.08;

/*
 * Drives the wordmark's rubber-stalk bend. Returns `armed` once the intro is over and the
 * main thread is idle (and motion is allowed); the component renders its bend strips only
 * then. Per frame it writes --bend (px) and `scale` on each letter: no React state.
 */
export function useWordmarkBend(containerRef: RefObject<HTMLElement | null>): boolean {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    afterIntro()
      .then(() => whenIdle())
      .then(() => {
        if (!cancelled) setArmed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const wordmark = container?.closest("h1");
    if (!armed || !container || !wordmark) return;

    const letters: LetterState[] = Array.from(container.children as HTMLCollectionOf<HTMLElement>).map((el) => ({
      el,
      center: 0,
      bend: { value: 0, velocity: 0 },
      stretch: { value: 0, velocity: 0 },
    }));
    let fontSize = 0;
    let letterWidth = 0;
    let pointer: PointerState | null = null;
    let frame = 0;
    let lastTime = 0;
    let bending = false;

    // Layout positions (offsetLeft ignores transforms, so bending never feeds back).
    const measure = (): void => {
      fontSize = parseFloat(getComputedStyle(wordmark).fontSize);
      letterWidth = container.offsetWidth / Math.max(letters.length, 1);
      // Letters and container share an offsetParent, so the difference is container-relative.
      for (const letter of letters) {
        letter.center = letter.el.offsetLeft - container.offsetLeft + letter.el.offsetWidth / 2;
      }
    };

    const setBending = (next: boolean): void => {
      if (next === bending) return;
      bending = next;
      if (next) container.dataset.bending = "";
      else delete container.dataset.bending;
    };

    const tick = (time: number): void => {
      const dt = lastTime ? Math.min((time - lastTime) / 1000, MAX_DT) : 1 / 60;
      lastTime = time;

      const rect = container.getBoundingClientRect();
      const maxBend = fontSize * wordmarkBend.maxBendEm;
      const radius = letterWidth * wordmarkBend.radiusLetters;
      // Only the glyphs themselves count (box top to baseline), fading out over a short margin,
      // so the description right below stays free to hover and click.
      const glyphBottom = rect.top + rect.height * BASELINE_RATIO;
      const outside = pointer ? Math.max(0, rect.top - pointer.y, pointer.y - glyphBottom) : 0;
      const gate = pointer ? Math.max(0, 1 - outside / (rect.height * GATE_FADE)) : 0;
      if (pointer) pointer.vx *= Math.exp(-dt * 8);

      let active = gate > 0;
      for (const letter of letters) {
        let bendTarget = 0;
        let stretchTarget = 0;
        if (pointer && gate > 0) {
          const rel = (pointer.x - (rect.left + letter.center)) / radius;
          const influence = Math.exp(-rel * rel) * gate;
          // Lean toward the cursor: zero right under it, strongest about half a radius away.
          bendTarget = maxBend * LEAN_NORMALISER * rel * Math.exp(-rel * rel) * gate;
          stretchTarget = wordmarkBend.maxStretch * influence;
          letter.bend.velocity +=
            wordmarkBend.dragGain * (pointer.vx / letterWidth) * maxBend * influence * dt;
        }
        stepSpring(letter.bend, bendTarget, spring.letter, dt);
        stepSpring(letter.stretch, stretchTarget, spring.letter, dt);
        letter.bend.value = Math.max(-1.6 * maxBend, Math.min(1.6 * maxBend, letter.bend.value));

        letter.el.style.setProperty("--bend", `${letter.bend.value.toFixed(2)}px`);
        letter.el.style.scale = `1 ${(1 + letter.stretch.value).toFixed(4)}`;
        if (
          !springAtRest(letter.bend, bendTarget, wordmarkBend.restThreshold) ||
          !springAtRest(letter.stretch, stretchTarget, wordmarkBend.restThreshold / 100)
        ) {
          active = true;
        }
      }

      setBending(letters.some((l) => Math.abs(l.bend.value) > 0.25));
      if (active) {
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
        lastTime = 0;
        for (const letter of letters) {
          letter.el.style.removeProperty("--bend");
          letter.el.style.removeProperty("scale");
        }
      }
    };

    const start = (): void => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent): void => {
      const now = event.timeStamp;
      if (pointer && now > pointer.t) {
        const speed = ((event.clientX - pointer.x) / (now - pointer.t)) * 1000;
        pointer.vx = pointer.vx * 0.6 + speed * 0.4;
      }
      pointer = { x: event.clientX, y: event.clientY, vx: pointer?.vx ?? 0, t: now };
      start();
    };

    // Mouse leaving the window, or a finger lifting: let the letters spring home.
    const onPointerEnd = (event: PointerEvent): void => {
      if (event.type === "pointerout" && event.relatedTarget) return;
      if (event.type === "pointerup" && event.pointerType === "mouse") return;
      pointer = null;
      start();
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(wordmark);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerEnd, { passive: true });
    window.addEventListener("pointercancel", onPointerEnd, { passive: true });
    document.addEventListener("pointerout", onPointerEnd, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      document.removeEventListener("pointerout", onPointerEnd);
      setBending(false);
      for (const letter of letters) {
        letter.el.style.removeProperty("--bend");
        letter.el.style.removeProperty("scale");
      }
    };
  }, [armed, containerRef]);

  return armed;
}
