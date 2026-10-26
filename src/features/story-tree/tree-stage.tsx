"use client";

import { useRef, type CSSProperties } from "react";
import type { Milestone } from "@/content/milestones";
import styles from "./story-tree.module.css";
import { useTreeScene } from "./use-tree-scene";

interface TreeStageProps {
  title: string;
  outro: string;
  milestones: readonly Milestone[];
}

/*
 * The pinned screen of the story section: the tree canvas, the title and outro, and the
 * milestones. On wide screens each milestone sits beside the branch it belongs to (with a
 * leader line drawn by the renderer); on phones a single caption shows the latest one.
 * The visual copy is aria-hidden: the section's real text lives in the sr-only list.
 */
export function TreeStage({ title, outro, milestones }: TreeStageProps): React.ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { slots, reached } = useTreeScene({ stageRef, canvasRef, milestones: milestones.length });
  const current = reached >= 0 ? milestones[reached] : null;

  return (
    <div ref={stageRef} className={styles.stage} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />

      <div className={styles.heading} data-tree-heading>
        <p className={`${styles.title} text-heading-xl font-semibold tracking-tight text-balance text-ink-950`}>{title}</p>
        <p className={`${styles.outro} text-heading-xl font-semibold tracking-tight text-balance text-ink-950`}>{outro}</p>
      </div>

      {slots
        ? milestones.slice(0, slots.length).map((milestone, index) => {
            const slot = slots[index];
            return (
              <div
                key={milestone.tag}
                className={styles.label}
                data-tree-label
                data-side={slot.side}
                data-shown={index <= reached ? "" : undefined}
                style={
                  { "--x": `${slot.x}px`, "--y": `${slot.y}px`, "--label-width": `${slot.width}px` } as CSSProperties
                }
              >
                <p className={`${styles.tag} text-heading-lg font-semibold tracking-tight text-orange-600 tabular-nums`}>{milestone.tag}</p>
                <p className="mt-1 text-body font-medium text-pretty text-ink-700">{milestone.text}</p>
              </div>
            );
          })
        : current && (
            <div className={styles.caption}>
              <div key={current.tag} className={styles.captionLine}>
                <p className={`${styles.tag} text-heading-lg font-semibold tracking-tight text-orange-600 tabular-nums`}>{current.tag}</p>
                <p className="mx-auto mt-1 max-w-[30ch] text-body font-medium text-pretty text-ink-700">{current.text}</p>
              </div>
            </div>
          )}
    </div>
  );
}
