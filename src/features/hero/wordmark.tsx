import type { CSSProperties } from "react";
import { introLetter } from "@/features/intro-reveal";
import { cn } from "@/lib/utils/cn";
import { BendableLetters } from "./bendable-letters";
import styles from "./wordmark.module.css";

interface WordmarkProps {
  id?: string;
  /** Accessible / indexable name, e.g. "Drimindesign". */
  name: string;
  /** The word drawn on screen, e.g. "DRIMIN". */
  word: string;
  /** Advance width of `word` in em, so CSS can size it to fill the row. */
  widthEm: number;
  className?: string;
}

/*
 * The hero's giant wordmark and the page's <h1>. Letters are rendered into the server HTML
 * so the intro can animate them from the very first frame, before any JavaScript runs;
 * BendableLetters adds the cursor bend once the page is idle.
 */
export function Wordmark({ id, name, word, widthEm, className }: WordmarkProps): React.ReactElement {
  const letterProps = Array.from(word).map((_, index) => introLetter(index));

  return (
    <h1
      id={id}
      className={cn(styles.wordmark, className)}
      style={{ "--wordmark-em": widthEm } as CSSProperties}
    >
      <span className="sr-only">{name}</span>
      <BendableLetters word={word} letterProps={letterProps} />
    </h1>
  );
}
