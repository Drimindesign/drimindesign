"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { retryImport } from "@/lib/utils/retry-import";
import type { GameAudio } from "../engine/audio";
import { apply, bindKeys, type PadAction } from "./arena-controls";
import { arenaManifest, type ArenaFiles } from "./arena-data";
import { ArenaPads } from "./arena-pads";
import { canRunArena } from "./capability";
import type { ArenaScene } from "./arena-scene";
import styles from "./arena.module.css";
import type { FightHud, FightSound } from "./fight-director";

type Phase = "offer" | "loading" | "ready" | "win" | "lose" | "unsupported" | "failed";

const noSubscription = (): (() => void) => () => undefined;
const MEGABYTES = (arenaManifest().reduce((sum, f) => sum + f.bytes, 0) / 1e6).toFixed(1);

/*
 * The 3D arena (/play?arena): an offer to download it (size first), a progress bar, then the
 * fight in the backyard. The HUD (health, the Master Stroke meter, banners) is written straight
 * into the DOM by the fight each frame, never through React state. Keys or touch pads play;
 * dragging the background looks around.
 */
export function ArenaMount({ onExit }: { onExit?: (result: "win" | "lose") => void }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arenaRef = useRef<ArenaScene | null>(null);
  const filesRef = useRef<ArenaFiles | null>(null);
  const audioRef = useRef<GameAudio | null>(null);
  const heroBar = useRef<HTMLSpanElement>(null);
  const foeBar = useRef<HTMLSpanElement>(null);
  const foeBox = useRef<HTMLDivElement>(null);
  const meterBar = useRef<HTMLSpanElement>(null);
  const meterBox = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLParagraphElement>(null);
  const held = useRef(new Set<PadAction>());
  const [chosen, setPhase] = useState<Phase>("offer");
  const supported = useSyncExternalStore(noSubscription, canRunArena, () => true);
  const phase: Phase = supported ? chosen : "unsupported";
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const unbind = bindKeys(() => arenaRef.current?.input ?? null, held.current);
    const hide = (): void => {
      if (document.visibilityState === "hidden") arenaRef.current?.stop();
      else arenaRef.current?.start();
    };
    document.addEventListener("visibilitychange", hide);
    // The fight music holds while the arena is up.
    const music = window.setInterval(() => audioRef.current?.update({ driving: false, speed: 0, throttle: 0, thrust: 0, combat: true }), 250);
    return () => {
      unbind();
      document.removeEventListener("visibilitychange", hide);
      window.clearInterval(music);
      arenaRef.current?.dispose();
      arenaRef.current = null;
      audioRef.current?.dispose();
    };
  }, []);

  const hud: FightHud = {
    health(hero, foe) {
      if (heroBar.current) heroBar.current.style.transform = `scaleX(${hero})`;
      if (foeBar.current) foeBar.current.style.transform = `scaleX(${foe ?? 0})`;
      if (foeBox.current) foeBox.current.dataset.on = foe === null ? "off" : "on";
    },
    meter(share) {
      if (meterBar.current) meterBar.current.style.transform = `scaleX(${share})`;
      if (meterBox.current) meterBox.current.dataset.full = share >= 1 ? "on" : "off";
    },
    banner(text) {
      if (!bannerRef.current) return;
      bannerRef.current.textContent = text ?? "";
      bannerRef.current.dataset.on = text ? "on" : "off";
    },
    end(result) {
      setPhase(result);
    },
  };
  const sound: FightSound = {
    swing: (heavy) => audioRef.current?.swing(heavy),
    hit: (heavy) => {
      audioRef.current?.thwack();
      if (heavy) audioRef.current?.land(0.8);
    },
    clang: (force) => audioRef.current?.clang(force),
    fall: () => audioRef.current?.land(1),
    crackle: (level) => audioRef.current?.crackle(level),
  };

  const build = async (): Promise<void> => {
    const canvas = canvasRef.current;
    const files = filesRef.current;
    if (!canvas || !files) return;
    const { ArenaScene } = await retryImport(() => import("./arena-scene"));
    const rect = canvas.getBoundingClientRect();
    const arena = await ArenaScene.create(canvas, files, hud, sound);
    arena.resize(rect.width, rect.height);
    arenaRef.current = arena;
    // QA: /play?arena&debug exposes the scene in the console.
    if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as { arena?: ArenaScene }).arena = arena;
    new ResizeObserver(([entry]) => arena.resize(entry.contentRect.width, entry.contentRect.height)).observe(canvas);
    arena.start();
    setPhase("ready");
  };

  const enter = async (): Promise<void> => {
    setPhase("loading");
    try {
      // Sound starts from this tap (browsers only allow it after a gesture).
      const [{ downloadArena }, { GameAudio: Audio }] = await Promise.all([retryImport(() => import("./arena-data")), retryImport(() => import("../engine/audio"))]);
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.unlock();
      }
      filesRef.current ??= await downloadArena(setProgress);
      await build();
    } catch {
      setPhase("failed");
    }
  };

  const again = async (): Promise<void> => {
    arenaRef.current?.dispose();
    arenaRef.current = null;
    setPhase("loading");
    try {
      await build();
    } catch {
      setPhase("failed");
    }
  };

  const onPad = (action: PadAction, down: boolean): void => {
    const input = arenaRef.current?.input;
    if (input) apply(input, held.current, action, down);
  };

  // Look around by dragging the background.
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const view = useRef({ yaw: 0, pitch: 0 });

  return (
    <div className={styles.arena} data-phase={phase}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-hidden="true"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ...view.current };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          view.current = { yaw: drag.current.yaw - (e.clientX - drag.current.x) * 0.08, pitch: drag.current.pitch - (e.clientY - drag.current.y) * 0.06 };
          arenaRef.current?.look(view.current.yaw, view.current.pitch);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
      <div className={styles.grade} aria-hidden="true" />
      {phase === "ready" ? (
        <>
          <div className={styles.hud}>
            <div className={styles.health} aria-label="Your health">
              <span ref={heroBar} />
            </div>
            <div ref={meterBox} className={styles.meter} data-full="off" aria-label="Master Stroke">
              <span ref={meterBar} />
            </div>
            <div ref={foeBox} className={styles.foe} data-on="off" aria-label="Enemy health">
              <span ref={foeBar} />
            </div>
          </div>
          <p ref={bannerRef} className={styles.banner} data-on="off" aria-live="polite" />
          <ArenaPads onPad={onPad} />
        </>
      ) : null}
      {phase !== "ready" ? (
        <div className={styles.card}>
          <h2 className={styles.title}>{phase === "win" ? "Yard cleared" : phase === "lose" ? "You fell" : "The Backyard"}</h2>
          {phase === "offer" ? (
            <>
              <p>The 3D arena: a real night set, lit like film. Two knights and a brute stand between you and the road. One download, about {MEGABYTES} MB, kept on this device.</p>
              <p className={styles.keys}>← → move (hold to run) · ↑ jump · F swing · Shift block · Q Master Stroke</p>
              <button type="button" className={styles.button} onClick={() => void enter()}>
                Download and fight
              </button>
            </>
          ) : null}
          {phase === "loading" ? (
            <>
              <p>Preparing the arena…</p>
              <div className={styles.bar} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ transform: `scaleX(${progress})` }} />
              </div>
            </>
          ) : null}
          {phase === "win" || phase === "lose" ? (
            <button type="button" className={styles.button} onClick={() => (phase === "win" && onExit ? onExit("win") : void again())}>
              {phase === "win" && onExit ? "Back to the road" : "Fight again"}
            </button>
          ) : null}
          {phase === "unsupported" ? <p>This device can&apos;t run the 3D arena; fights stay in 2D here.</p> : null}
          {phase === "failed" ? (
            <>
              <p>The arena didn&apos;t load. Check the connection and try again.</p>
              <button type="button" className={styles.button} onClick={() => void enter()}>
                Try again
              </button>
            </>
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
      ) : null}
    </div>
  );
}
