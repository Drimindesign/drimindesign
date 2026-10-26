import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import styles from "./intro-reveal.module.css";

interface IntroStageProps {
  children: ReactNode;
  className?: string;
}

/*
 * The panel that pops into the white frame and expands to fill the viewport.
 * Place it inside a section with `data-surface` (the panel paints --surface-bg) and
 * a transparent background with `overflow: clip` (it hides the panel's overhang).
 */
export function IntroStage({ children, className }: IntroStageProps): React.ReactElement {
  return (
    <div className={cn(styles.stage, className)}>
      <div aria-hidden="true" className={styles.panel} />
      {children}
    </div>
  );
}

interface IntroAnimationProps {
  className: string;
  style: CSSProperties;
}

/*
 * Enrols an element in the intro's settle-in stagger. `order` is its position in the
 * stagger (0 first); "drop" slides down from above (fixed header), "rise" comes up.
 * Merge the returned className with the element's own.
 */
export function introItem(order: number, variant: "rise" | "drop" = "rise"): IntroAnimationProps {
  return {
    className: cn(styles.item, variant === "drop" && styles.itemDrop),
    style: { "--intro-order": order } as CSSProperties,
  };
}

/* One wordmark letter; `index` is its place in the letter stagger. */
export function introLetter(index: number): IntroAnimationProps {
  return {
    className: styles.letter,
    style: { "--i": index } as CSSProperties,
  };
}
