"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { retryImport } from "@/lib/utils/retry-import";
import type { Command, Game } from "./engine/game";
import type { Action } from "./engine/input";
import styles from "./orbit.module.css";
import type { StageId } from "./stages/types";

export interface Reward {
  stage: StageId;
  slug: string;
  title: string;
  category: string;
  image: string;
}

/* Touch controls: brake and gas under the left thumb; thrusters (big), get out and sword under the right. */
const PADS: readonly { action: Action; label: string; glyph: string }[] = [
  { action: "left", label: "Brake, reverse, or back-flip in the air", glyph: "◀" },
  { action: "right", label: "Accelerate, or front-flip in the air", glyph: "▶" },
  { action: "attack", label: "Swing the sword", glyph: "⚔" },
  { action: "interact", label: "Get in or out, plant the flag", glyph: "E" },
  { action: "jump", label: "Thrusters: tap to hop, tap again in the air to boost, hold to hover", glyph: "▲" },
];

/* Phones: full screen and locked to landscape where the browser allows it. */
async function playFullscreen(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen?.();
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.("landscape");
  } catch {
    // Not supported (iOS Safari): the rotate prompt covers it.
  }
}

/* One handler for every pad and overlay button: the action comes from data attributes. */
function padAction(event: React.PointerEvent<HTMLButtonElement>): Action {
  return event.currentTarget.dataset.action as Action;
}

/*
 * Loads the game (its own chunk), sizes it to the stage, and wires the HUD, the cards between
 * stages (title, stage intro, project reward, finish), the mute button and the touch pads
 * (coarse pointers only). The game writes text and data attributes into this DOM directly;
 * React renders it once.
 */
export function GameMount({ rewards }: { rewards: readonly Reward[] }): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!root || !stage || !canvas) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let glow: { render(): void; dispose(): void } | null = null;

    void retryImport(() => import("./engine/game"))
      .then(({ Game }) => {
        if (cancelled) return;
        const game = new Game(canvas, { root, fields: (name) => root.querySelectorAll<HTMLElement>(`[data-hud="${name}"]`) });
        gameRef.current = game;
        // QA: /play?debug exposes the running game in the console.
        if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as { orbit?: Game }).orbit = game;
        // /play?gpu: the same game with a WebGL2 glow and grade over the 2D frame.
        if (new URLSearchParams(window.location.search).has("gpu")) {
          void import("./engine/glow").then(({ GlowPass }) => {
            if (cancelled) return;
            glow = GlowPass.attach(canvas);
            if (glow) game.onFrame = () => glow?.render();
          });
        }
        observer = new ResizeObserver(([entry]) => {
          game.resize(entry.contentRect.width, entry.contentRect.height, window.devicePixelRatio || 1);
        });
        observer.observe(stage);
        game.start();
      })
      .catch(() => setFailed(true));

    const unlock = (): void => gameRef.current?.audio.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      gameRef.current?.stop();
      gameRef.current = null;
      glow?.dispose();
    };
  }, []);

  const press = (event: React.PointerEvent<HTMLButtonElement>): void => {
    event.currentTarget.dataset.held = "true";
    gameRef.current?.audio.unlock();
    gameRef.current?.input.press(padAction(event));
    try {
      // Keep the release on this pad even if the thumb slides off it.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone: the release still arrives on the pad.
    }
  };
  const release = (event: React.PointerEvent<HTMLButtonElement>): void => {
    event.currentTarget.dataset.held = "false";
    gameRef.current?.input.release(padAction(event));
  };
  const command = (event: React.MouseEvent<HTMLButtonElement>): void => {
    gameRef.current?.command(event.currentTarget.dataset.command as Command);
  };
  const toggleMute = (): void => {
    const game = gameRef.current;
    if (!game) return;
    game.audio.unlock();
    game.audio.setMuted(!muted);
    setMuted(!muted);
  };
  const share = async (): Promise<void> => {
    const points = rootRef.current?.querySelector('[data-hud="total-score"]')?.textContent ?? "";
    const data = { title: "Idea to Orbit", text: `I took an idea to orbit: ${points} points. Beat it:`, url: `${window.location.origin}/play` };
    try {
      if (navigator.share) await navigator.share(data);
      else await navigator.clipboard.writeText(`${data.text} ${data.url}`);
      setShared(true);
    } catch {
      // Share sheet dismissed: nothing to do.
    }
  };

  return (
    <div ref={rootRef} className={styles.root} data-phase="title" data-stage="discover" data-vehicle="none">
      <div ref={stageRef} className={styles.stage}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      </div>

      {/* ---- HUD during play ---- */}
      <div className={styles.top}>
        <Link href="/" className={styles.exit} aria-label="Back to Drimindesign">
          ←
        </Link>
        <p className={styles.title}>
          <span className={styles.brand}>Idea to Orbit </span>
          <span className={styles.stageName}>
            · <span data-hud="stage-number">01</span> <span data-hud="stage-title">Discover</span>
          </span>
        </p>
        <p className={styles.run} aria-hidden="true">
          <span data-hud="time">0:00.0</span>
          <span>
            <span data-hud="score">0</span> pts
          </span>
          <span className={styles.hearts} data-hud="hearts" />
          <span className={styles.combo}>
            <span data-hud="combo">×1</span>
            <span className={styles.comboBar} />
          </span>
        </p>
        <button type="button" className={styles.mute} onClick={toggleMute} aria-pressed={muted}>
          {muted ? "Sound off" : "Sound on"}
        </button>
        <button type="button" className={styles.mute} onClick={() => gameRef.current?.input.press("pause")} aria-label="Pause">
          Ⅱ
        </button>
      </div>

      <p data-hud="prompt" className={styles.prompt} aria-live="polite" />

      <div className={styles.gauges} aria-hidden="true">
        <span>
          <span data-hud="speed">0</span> km/h
        </span>
        <span className={styles.altitude}>
          ALT <span data-hud="altitude">0</span> m
        </span>
        <span className={styles.tank}>
          <span className={styles.tankFill} />
        </span>
        <span className={styles.fuel}>
          <span data-hud="fuel">0.0s</span> thrust
        </span>
        <span className={styles.landIn}>
          lands in <span data-hud="land-in">0.0s</span>
        </span>
      </div>

      <p className={styles.hints}>→ drive · Space hop · Space in air boost · hold hover · tap ← → in air flip · E get out · F sword · R checkpoint · Esc pause</p>

      {/* ---- Cards between stages ---- */}
      <section className={`${styles.card} ${styles.titleCard}`} aria-label="Idea to Orbit">
        <p className={styles.kicker}>A Drimindesign game</p>
        <p className={styles.logo}>Idea to Orbit</p>
        <p className={styles.lede}>Out of the city, through the forest, into orbit, onto the Moon. Flip it, land it, beat your best.</p>
        <div className={styles.actions}>
          <button type="button" data-command="start" className={styles.primary} onClick={command}>
            Press Space to start
          </button>
          <button type="button" className={`${styles.secondary} ${styles.touchOnly}`} onClick={() => void playFullscreen()}>
            Full screen
          </button>
        </div>
        <p className={styles.small}>
          Best <span data-hud="best-score">—</span> pts · <span data-hud="best">—</span>
        </p>
        <p className={styles.small}>Music: “Skylines” by Alex-Productions, via chosic.com</p>
      </section>

      <section className={`${styles.card} ${styles.pauseCard}`} aria-label="Paused">
        <p className={styles.logo}>Paused</p>
        <div className={styles.actions}>
          <button type="button" data-command="resume" className={styles.primary} onClick={command}>
            Resume
          </button>
          <button type="button" data-command="restart-stage" className={styles.secondary} onClick={command}>
            Restart stage
          </button>
          <button type="button" data-command="quit" className={styles.secondary} onClick={command}>
            Quit to title
          </button>
        </div>
        <p className={styles.small}>R in play: back to the last checkpoint</p>
      </section>

      <section className={`${styles.card} ${styles.introCard}`} aria-live="polite">
        <p className={styles.kicker}>
          Stage <span data-hud="stage-number">01</span>
        </p>
        <p className={styles.logo} data-hud="stage-title">
          Discover
        </p>
        <p className={styles.lede} data-hud="stage-goal" />
      </section>

      <section className={`${styles.card} ${styles.rewardCard}`} aria-live="polite">
        <p className={styles.kicker}>
          Stage <span data-hud="stage-number">01</span> complete · found <span data-hud="stage-found">0</span> ·{" "}
          <span data-hud="stage-bonus">+500</span>
        </p>
        <p className={styles.small}>Unlocked from our work</p>
        {rewards.map((reward) => (
          <Link key={reward.stage} href={`/projects/${reward.slug}`} target="_blank" className={styles.reward} data-for={reward.stage}>
            <span className={styles.rewardImage}>
              <Image src={reward.image} alt="" fill sizes="16rem" />
            </span>
            <span className={styles.rewardTitle}>{reward.title}</span>
            <span className={styles.small}>{reward.category} · View project ↗</span>
          </Link>
        ))}
        <button type="button" data-command="continue" className={styles.primary} onClick={command}>
          Press Space to continue
        </button>
      </section>

      <section className={`${styles.card} ${styles.finishCard}`} aria-live="polite">
        <p className={styles.kicker}>
          In orbit <span className={styles.newBest}>· New best</span>
        </p>
        <p className={styles.logo} data-hud="total-score">
          0
        </p>
        <dl className={styles.stats}>
          <div>
            <dt>Time</dt>
            <dd data-hud="total-time">0:00.0</dd>
          </div>
          <div>
            <dt>Speed bonus</dt>
            <dd data-hud="time-bonus">+0</dd>
          </div>
          <div>
            <dt>Found</dt>
            <dd data-hud="total-found">0</dd>
          </div>
          <div>
            <dt>Clean landings</dt>
            <dd data-hud="total-landings">0</dd>
          </div>
          <div>
            <dt>Best score</dt>
            <dd data-hud="best-score">—</dd>
          </div>
          <div>
            <dt>Best time</dt>
            <dd data-hud="best">—</dd>
          </div>
        </dl>
        <p className={styles.lede}>Every project starts as a spark. Got one? Let&apos;s take it to orbit together.</p>
        <div className={styles.actions}>
          <Link href="/contact" className={styles.primary}>
            Start a project
          </Link>
          <Link href="/appointment" className={styles.secondary}>
            Book a call
          </Link>
          <button type="button" className={styles.secondary} onClick={() => void share()}>
            {shared ? "Shared ✓" : "Share your score"}
          </button>
          <button type="button" data-command="again" className={styles.secondary} onClick={command}>
            Play again
          </button>
        </div>
      </section>

      <div className={styles.pads}>
        {PADS.map((pad) => (
          <button
            key={pad.action}
            type="button"
            data-action={pad.action}
            className={styles.pad}
            aria-label={pad.label}
            onPointerDown={press}
            onPointerUp={release}
            onPointerCancel={release}
            onContextMenu={(event) => event.preventDefault()}
          >
            {pad.glyph}
          </button>
        ))}
      </div>

      <div className={styles.rotate} aria-hidden="true">
        <span className={styles.rotateIcon}>⟳</span>
        <p>Turn your phone sideways to play</p>
      </div>

      {failed && <p className={styles.failed}>The game couldn&apos;t load. Check your connection and reload the page.</p>}
    </div>
  );
}
