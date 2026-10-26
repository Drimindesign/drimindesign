import type { CSSProperties } from "react";
import { milestones, storyIntro } from "@/content/milestones";
import { storyTree } from "@/lib/motion/tokens";
import { TIERS } from "./data/tree.generated";
import styles from "./story-tree.module.css";
import { REVEAL_VH, scrollForGrowth } from "./tree-model";
import { TreeStage } from "./tree-stage";

/*
 * Section 3: the studio's story as a tree growing on plain white, from a seed and shallow
 * roots up through six tiers to the peak, one milestone per tier; the scroll softly holds
 * at each milestone. The section is tall
 * (one pinned screen plus the growth scroll); the stage inside it is sticky.
 */
export function StoryTree(): React.ReactElement {
  const height = REVEAL_VH + 1 + storyTree.growVh + storyTree.tailVh;
  // Snap markers in the middle of each milestone's pause (between one tier and the next).
  const snapOffsets = TIERS.map(([, end], k) => scrollForGrowth(k + 1 < TIERS.length ? (end + TIERS[k + 1][0]) / 2 : end + 0.02));

  return (
    <section
      id="story"
      data-surface="light"
      aria-labelledby="story-title"
      className={styles.section}
      // Tucked one screen up under the ring section, which lifts off it (REVEAL_VH).
      style={{ height: `${height * 100}svh`, marginTop: `${-REVEAL_VH * 100}svh` } as CSSProperties}
    >
      {snapOffsets.map((offset) => (
        <span key={offset} data-snap aria-hidden="true" className={styles.snap} style={{ top: `${offset * 100}svh` }} />
      ))}

      <TreeStage title={storyIntro.title} outro={storyIntro.outro} milestones={milestones} />

      <div className="sr-only">
        <h2 id="story-title">{storyIntro.title}</h2>
        <ol>
          {milestones.map((milestone) => (
            <li key={milestone.tag}>
              {milestone.tag}: {milestone.text}
            </li>
          ))}
        </ol>
        <p>{storyIntro.outro}</p>
      </div>
    </section>
  );
}
