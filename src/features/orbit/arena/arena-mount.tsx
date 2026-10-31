"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { retryImport } from "@/lib/utils/retry-import";
import { arenaManifest } from "./arena-data";
import type { ArenaScene } from "./arena-scene";
import styles from "./arena.module.css";

type Phase = "offer" | "loading" | "ready" | "unsupported" | "failed";

/* The arena needs WebGL2 and a capable GPU; older or low-memory devices keep the 2D fight. Checked once. */
let capability: boolean | null = null;
function capable(): boolean {
  if (capability !== null) return capability;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    capability = gl !== null && (memory === undefined || memory >= 4);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    capability = false;
  }
  return capability;
}
const noSubscription = (): (() => void) => () => undefined;

const MEGABYTES = (arenaManifest().reduce((sum, f) => sum + f.bytes, 0) / 1e6).toFixed(1);

/*
 * The 3D arena look test (/play?arena): an offer to download the arena (its size shown first),
 * a progress bar, then the scene. Drag to look around, pinch or scroll to zoom, double-tap for a
 * push-in. A small readout shows frames per second for testing on phones.
 */
export function ArenaMount(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arenaRef = useRef<ArenaScene | null>(null);
  const [chosen, setPhase] = useState<Phase>("offer");
  const supported = useSyncExternalStore(noSubscription, capable, () => true);
  const phase: Phase = supported ? chosen : "unsupported";
  const [progress, setProgress] = useState(0);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    return () => {
      arenaRef.current?.dispose();
      arenaRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    const timer = window.setInterval(() => setFps(arenaRef.current?.fps ?? 0), 1000);
    const hide = (): void => {
      if (document.visibilityState === "hidden") arenaRef.current?.stop();
      else arenaRef.current?.start();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [phase]);

  const enter = async (): Promise<void> => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPhase("loading");
    try {
      const [{ downloadArena }, { ArenaScene }] = await Promise.all([retryImport(() => import("./arena-data")), retryImport(() => import("./arena-scene"))]);
      const files = await downloadArena(setProgress);
      const rect = canvas.getBoundingClientRect();
      const arena = await ArenaScene.create(canvas, files);
      arena.resize(rect.width, rect.height);
      arenaRef.current = arena;
      // QA: /play?arena&debug exposes the scene in the console.
      if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as { arena?: ArenaScene }).arena = arena;
      new ResizeObserver(([entry]) => arena.resize(entry.contentRect.width, entry.contentRect.height)).observe(canvas);
      arena.start();
      setPhase("ready");
    } catch {
      setPhase("failed");
    }
  };

  // Look around by dragging; zoom with the wheel or two fingers.
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; pinch: number; fov: number } | null>(null);
  const view = useRef({ yaw: 0, pitch: 0, fov: 34 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const down = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const pinch = pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    drag.current = { x: e.clientX, y: e.clientY, yaw: view.current.yaw, pitch: view.current.pitch, pinch, fov: view.current.fov };
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drag.current || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && drag.current.pinch > 0) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      view.current.fov = drag.current.fov * (drag.current.pinch / d);
      arenaRef.current?.zoom(view.current.fov);
      return;
    }
    view.current.yaw = drag.current.yaw - (e.clientX - drag.current.x) * 0.08;
    view.current.pitch = drag.current.pitch - (e.clientY - drag.current.y) * 0.06;
    arenaRef.current?.look(view.current.yaw, view.current.pitch);
  };
  const up = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    pointers.current.delete(e.pointerId);
    drag.current = null;
  };
  const wheel = (e: React.WheelEvent<HTMLCanvasElement>): void => {
    view.current.fov = Math.min(52, Math.max(16, view.current.fov + e.deltaY * 0.02));
    arenaRef.current?.zoom(view.current.fov);
  };

  return (
    <div className={styles.arena} data-phase={phase}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-hidden="true"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={wheel}
        onDoubleClick={() => arenaRef.current?.punch()}
      />
      <div className={styles.grade} aria-hidden="true" />
      {phase === "ready" ? <p className={styles.readout}>{fps} fps</p> : null}
      {phase !== "ready" ? (
        <div className={styles.card}>
          <h2 className={styles.title}>The Backyard</h2>
          {phase === "offer" ? (
            <>
              <p>The 3D arena: a real night set, lit like film. One download, about {MEGABYTES} MB, kept on this device.</p>
              <button type="button" className={styles.button} onClick={() => void enter()}>
                Download and enter
              </button>
            </>
          ) : null}
          {phase === "loading" ? (
            <>
              <p>Downloading the arena…</p>
              <div className={styles.bar} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ transform: `scaleX(${progress})` }} />
              </div>
            </>
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
          <Link className={styles.back} href="/play">
            Back to the game
          </Link>
        </div>
      ) : null}
    </div>
  );
}
