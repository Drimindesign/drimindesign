"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LEVELS, TIPS, type LevelId } from "./arena-levels";
import styles from "./arena.module.css";

export type MenuPhase = "offer" | "loading" | "win" | "lose" | "unsupported" | "failed";

/** How long each loading tip stays up (ms). */
const TIP_TIME = 3200;

interface MenuProps {
  phase: MenuPhase;
  /** The level picked (or fixed by the game). */
  level: LevelId;
  /** Levels the player may choose between (empty when the game fixed the level). */
  choices: LevelId[];
  megabytes: string;
  progress: number;
  onPick(id: LevelId): void;
  onFight(): void;
  onAgain(): void;
  onExit?: (result: "win" | "lose") => void;
}

/*
 * The arena's menu, game-style: the chapter and level name in a condensed display face over the
 * key art, the levels as picture cards with difficulty stars, a glowing FIGHT button, and while it
 * loads, a bar along the bottom with fight tips turning over. After a fight: the result and what next.
 */
export function ArenaMenu({ phase, level, choices, megabytes, progress, onPick, onFight, onAgain, onExit }: MenuProps): React.ReactElement {
  const info = LEVELS[level];
  const [tip, setTip] = useState(0);
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = window.setInterval(() => setTip((t) => (t + 1) % TIPS.length), TIP_TIME);
    return () => window.clearInterval(timer);
  }, [phase]);
  const over = phase === "win" || phase === "lose";

  return (
    <div className={styles.card} data-banner={over ? "off" : "on"}>
      <div className={styles.heading}>
        <p className={styles.chapter}>{over ? info.title : info.chapter}</p>
        <h2 className={styles.title}>{phase === "win" ? "Victory" : phase === "lose" ? "Defeated" : info.title}</h2>
        {!over ? <p className={styles.tagline}>{info.tagline}</p> : null}
      </div>

      {phase === "offer" && choices.length > 1 ? (
        <div className={styles.cards} role="radiogroup" aria-label="Choose the arena">
          {choices.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={id === level} className={styles.levelCard} onClick={() => onPick(id)}>
              <Image className={styles.thumb} src={LEVELS[id].thumb} alt="" width={160} height={90} sizes="160px" />
              <span className={styles.cardName}>{LEVELS[id].title}</span>
              <span className={styles.stars} aria-label={`Difficulty ${LEVELS[id].stars} of 3`}>
                {"★".repeat(LEVELS[id].stars)}
                <span className={styles.starsOff}>{"★".repeat(3 - LEVELS[id].stars)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.actions}>
        {phase === "offer" ? (
          <button type="button" className={styles.fight} onClick={onFight}>
            Fight
          </button>
        ) : null}
        {phase === "failed" ? (
          <button type="button" className={styles.fight} onClick={onFight}>
            Retry
          </button>
        ) : null}
        {over ? (
          <button type="button" className={styles.fight} onClick={() => (phase === "win" && onExit ? onExit("win") : onAgain())}>
            {phase === "win" && onExit ? "Back to the road" : "Fight again"}
          </button>
        ) : null}
        {onExit ? (
          <button type="button" className={styles.back} onClick={() => onExit(phase === "win" ? "win" : "lose")}>
            Back to the game
          </button>
        ) : (
          <Link className={styles.back} href="/play">
            Back to the game
          </Link>
        )}
      </div>

      {phase === "offer" ? <p className={styles.meta}>{megabytes} MB · downloads once, kept on this device</p> : null}
      {phase === "failed" ? <p className={styles.meta}>The arena didn&apos;t load. Check the connection.</p> : null}
      {phase === "unsupported" ? <p className={styles.meta}>This device can&apos;t run the 3D arena; fights stay in 2D here.</p> : null}

      {phase === "loading" ? (
        <div className={styles.loading}>
          <p className={styles.tip} aria-live="polite">
            {TIPS[tip]}
          </p>
          <div className={styles.bar} role="progressbar" aria-label="Loading the arena" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
          <p className={styles.percent}>{Math.round(progress * 100)}%</p>
        </div>
      ) : null}
    </div>
  );
}
