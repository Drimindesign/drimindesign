"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { afterIntro, whenIdle } from "@/lib/motion/after-intro";
import { fallingWords } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils/cn";
import styles from "./falling-words.module.css";
import { parseSentence, sentenceText } from "./parse-sentence";
import { closeGaps, restoreWords } from "./word-flow";
import { WordPhysics } from "./word-physics";

interface FallingWordsProps {
  /** Sentence markup; see parse-sentence.ts. */
  sentences: readonly string[];
  /** Selector (within the hero) of the element whose top edge is the floor. */
  floorSelector: string;
  className?: string;
  style?: CSSProperties;
}

type SentenceState = "shown" | "enter" | "leave" | "hidden";

const DEMO_STORAGE_KEY = "drimin:falling-words-demo";

const prefersReducedMotion = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

/*
 * The hero description: sentences rotate every few seconds; clicking one lets its loose
 * words fall (matter-js, loaded on first use) onto the stats row, and the words that stay
 * close the gaps into a second sentence. A real button gives the same action to keyboard
 * and screen-reader users; the visual sentence is aria-hidden with the text in an sr-only <p>.
 */
export function FallingWords({ sentences, floorSelector, className, style }: FallingWordsProps): React.ReactElement {
  const parsed = useMemo(() => sentences.map(parseSentence), [sentences]);
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const physicsRef = useRef<WordPhysics | null>(null);
  /* The teaser drop: "pending" until it runs, "playing" while its word is down, then "done"
     (also set by any user drop, so the teaser never undoes a visitor's own play). */
  const demoRef = useRef<"pending" | "playing" | "done">("pending");

  const [current, setCurrent] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [animateIn, setAnimateIn] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [armed, setArmed] = useState(false);
  const [inView, setInView] = useState(true);
  const [fallen, setFallen] = useState(0);

  useEffect(() => {
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
    const root = rootRef.current;
    const layer = layerRef.current;
    if (!root || !layer) return;
    const physics = new WordPhysics(
      layer,
      () => root.closest("section")?.querySelector<HTMLElement>(floorSelector) ?? null,
      () => root,
      styles.ghost,
    );
    physicsRef.current = physics;

    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(root);
    return () => {
      observer.disconnect();
      physics.destroy();
      physicsRef.current = null;
    };
  }, [floorSelector]);

  const drop = useCallback(async (word: HTMLElement): Promise<void> => {
    const sentence = word.closest<HTMLElement>(`.${styles.sentence}`);
    const physics = physicsRef.current;
    // data-dropping guards double clicks while matter-js loads on the first drop.
    if (!sentence || word.hasAttribute("data-dropping")) return;
    word.setAttribute("data-dropping", "");
    if (physics && !prefersReducedMotion()) await physics.drop(word);
    closeGaps(sentence, word, `.${styles.word}`, !prefersReducedMotion());
    setFallen((count) => count + 1);
  }, []);

  const dropAll = useCallback(async (): Promise<void> => {
    const sentence = sentenceRefs.current[current];
    if (!sentence) return;
    const loose = Array.from(sentence.querySelectorAll<HTMLElement>("[data-falls]:not([data-dropping])"));
    for (const [index, word] of loose.entries()) {
      // Let go left to right, a beat apart, like a line of text losing its grip.
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, fallingWords.cascadeStaggerMs));
      void drop(word);
    }
  }, [current, drop]);

  const putBack = useCallback(
    async (animate: boolean): Promise<void> => {
      const sentence = sentenceRefs.current[current];
      await physicsRef.current?.clear(animate);
      if (sentence) restoreWords(sentence, `.${styles.word}`, animate && !prefersReducedMotion());
      setFallen(0);
    },
    [current],
  );

  // Teaser, once per session: one loose word wobbles, falls, and glides back, so visitors
  // learn the sentence is playable before they ever click it.
  useEffect(() => {
    if (!armed || !inView || demoRef.current !== "pending" || prefersReducedMotion()) return;
    try {
      if (sessionStorage.getItem(DEMO_STORAGE_KEY)) {
        demoRef.current = "done";
        return;
      }
    } catch {
      // Storage blocked: show the teaser; it just won't be remembered.
    }

    const timers: number[] = [];
    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => timers.push(window.setTimeout(resolve, ms)));

    void (async () => {
      await wait(fallingWords.demo.delayMs);
      const word = sentenceRefs.current[current]?.querySelector<HTMLElement>("[data-falls]:not([data-dropping])");
      if (!word || demoRef.current !== "pending") return;
      demoRef.current = "playing";
      try {
        sessionStorage.setItem(DEMO_STORAGE_KEY, "1");
      } catch {
        // See above.
      }
      word.setAttribute("data-demo", "");
      await wait(fallingWords.demo.wobbleMs);
      word.removeAttribute("data-demo");
      await drop(word);
      await wait(fallingWords.demo.restMs);
      if (demoRef.current === "playing") {
        demoRef.current = "done";
        await putBack(true);
      }
    })();

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [armed, inView, current, drop, putBack]);

  // A width change moves the floor, walls and line breaks: put everything back. Height-only
  // changes (mobile address bar showing/hiding while scrolling) must not reset the pile.
  useEffect(() => {
    const layer = layerRef.current;
    if (fallen === 0 || !layer) return;
    let width = layer.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (Math.abs(layer.offsetWidth - width) < 1) return;
      width = layer.offsetWidth;
      void putBack(false);
    });
    observer.observe(layer);
    return () => observer.disconnect();
  }, [fallen, putBack]);

  const show = (next: number): void => {
    if (next === current) return;
    if (fallen > 0) void putBack(false);
    setLeaving(current);
    setCurrent(next);
    setAnimateIn(true);
    const leaveMs = 360 + parsed[current].length * 18;
    window.setTimeout(() => setLeaving((value) => (value === current ? null : value)), leaveMs);
  };

  // Only the loose (underlined) words let go; the words that form the second sentence stay put.
  const onStackClick = (event: React.MouseEvent<HTMLElement>): void => {
    const word = (event.target as HTMLElement).closest<HTMLElement>("[data-falls]");
    if (!word || word.hasAttribute("data-dropping")) return;
    demoRef.current = "done";
    void drop(word);
  };

  const stateOf = (index: number): SentenceState => {
    if (index === current) return animateIn ? "enter" : "shown";
    if (index === leaving) return "leave";
    return "hidden";
  };

  const rotating = armed && autoRotate;
  const paused = fallen > 0 || !inView;

  return (
    <div
      ref={rootRef}
      className={cn(styles.root, className)}
      style={{ ...style, "--rotate-ms": `${fallingWords.rotateMs}ms` } as CSSProperties}
      data-rotating={rotating ? "" : undefined}
      data-paused={paused ? "" : undefined}
      onPointerEnter={() => physicsRef.current?.warm()}
    >
      <p className="sr-only">{sentenceText(parsed[current])}</p>

      <div aria-hidden="true" className={styles.stack} onClick={onStackClick}>
        {parsed.map((tokens, sentenceIndex) => (
          <span
            key={sentenceIndex}
            ref={(el) => {
              sentenceRefs.current[sentenceIndex] = el;
            }}
            className={styles.sentence}
            data-state={stateOf(sentenceIndex)}
          >
            {tokens.map((token, tokenIndex) => (
              <span
                key={tokenIndex}
                className={cn(styles.word, token.falls && styles.falls)}
                data-falls={token.falls ? "" : undefined}
                style={{ "--i": tokenIndex } as CSSProperties}
              >
                {token.text}
              </span>
            ))}
          </span>
        ))}
      </div>

      <div className={styles.controls}>
        {parsed.map((tokens, index) => (
          <button
            key={index}
            type="button"
            className={styles.bar}
            aria-label={`Show sentence ${index + 1}: ${sentenceText(tokens)}`}
            aria-current={index === current ? "true" : undefined}
            onClick={() => {
              setAutoRotate(false);
              show(index);
            }}
            onAnimationEnd={() => {
              if (index === current && rotating && !paused) show((current + 1) % parsed.length);
            }}
          />
        ))}
        <Button
          variant="ghost"
          size="sm"
          className={styles.action}
          onClick={() => {
            demoRef.current = "done";
            void (fallen > 0 ? putBack(true) : dropAll());
          }}
        >
          {fallen > 0 ? "Put them back" : "Let it fall"}
        </Button>
      </div>

      <div ref={layerRef} aria-hidden="true" className={styles.layer} />
    </div>
  );
}
