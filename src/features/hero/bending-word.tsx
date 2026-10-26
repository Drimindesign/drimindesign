import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";
import { BendableLetters } from "./bendable-letters";
import styles from "./wordmark.module.css";

interface BendingWordProps {
  /** The word drawn on screen, e.g. "DRIMIN". */
  word: string;
  /** Advance width of `word` in em, so CSS can size it to fill the row. */
  widthEm: number;
  className?: string;
}

/*
 * The wordmark reprised outside the hero (the footer): the same full-width letters and
 * cursor bend, without the intro or the <h1>. Decorative: the brand name is elsewhere.
 */
export function BendingWord({ word, widthEm, className }: BendingWordProps): React.ReactElement {
  return (
    <p aria-hidden="true" className={cn(styles.wordmark, className)} style={{ "--wordmark-em": widthEm } as CSSProperties}>
      <BendableLetters word={word} letterProps={[]} />
    </p>
  );
}
