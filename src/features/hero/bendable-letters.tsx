"use client";

import { useRef, type CSSProperties } from "react";
import { wordmarkBend } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils/cn";
import { bendSlices } from "./bend-geometry";
import { useWordmarkBend } from "./use-wordmark-bend";
import styles from "./wordmark.module.css";

interface LetterProps {
  className: string;
  style: CSSProperties;
}

interface BendableLettersProps {
  word: string;
  /** Per-letter intro animation props, computed on the server. */
  letterProps: LetterProps[];
}

const SLICES = bendSlices(wordmarkBend.slices);

/*
 * The wordmark's visible letters. They render as plain text (server HTML, LCP-friendly);
 * once armed, each letter also gets a stack of strips that redraw its glyph via CSS
 * `content` (so the word is never duplicated in the DOM text) and bend while the cursor
 * is near. At rest the strips are hidden and the real text shows.
 */
export function BendableLetters({ word, letterProps }: BendableLettersProps): React.ReactElement {
  const containerRef = useRef<HTMLSpanElement>(null);
  const armed = useWordmarkBend(containerRef);

  return (
    <span ref={containerRef} aria-hidden="true" className={styles.letters}>
      {Array.from(word).map((char, index) => (
        <span
          key={index}
          className={cn(styles.letter, letterProps[index]?.className)}
          style={{ ...letterProps[index]?.style, "--char": JSON.stringify(char) } as CSSProperties}
        >
          {char}
          {armed &&
            SLICES.map((slice, sliceIndex) => (
              <span
                key={sliceIndex}
                className={styles.slice}
                style={
                  {
                    "--t": `${slice.topPct}%`,
                    "--b": `${slice.bottomPct}%`,
                    "--k0": slice.k0,
                    "--k1": slice.k1,
                    "--h": `${slice.heightEm}em`,
                  } as CSSProperties
                }
              />
            ))}
        </span>
      ))}
    </span>
  );
}
