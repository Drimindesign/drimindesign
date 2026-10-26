"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { TeamMember } from "@/content/team";
import { useDeviceTier } from "@/lib/device/use-device-tier";
import { useWebgl } from "@/lib/device/use-webgl";
import { afterIntro, whenIdle } from "@/lib/motion/after-intro";
import { warmUp } from "@/lib/motion/warm-up";
import { retryImport } from "@/lib/utils/retry-import";
import styles from "./about-team.module.css";
import { createLanyardControl, type LanyardControl } from "./store";

const loadScene = (): Promise<typeof import("./scene/lanyard-scene")> => retryImport(() => import("./scene/lanyard-scene"));
const LanyardScene = dynamic(loadScene, { ssr: false });

interface LanyardStageProps {
  team: readonly TeamMember[];
  hint: string;
  /** The HTML cards: shown until the 3D cards are ready, and instead of them without WebGL. */
  children: ReactNode;
}

/* If the 3D scene throws (lost GPU, failed download), the HTML cards take over for good. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

const reducedQuery = "(prefers-reduced-motion: reduce)";
function subscribeReduced(listener: () => void): () => void {
  const query = matchMedia(reducedQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/*
 * The hanging-cards stage. Mounts the WebGL scene once the stage is within three screens of
 * the viewport (after the intro, when idle), pauses it off screen and in hidden tabs, and
 * lets the cards drop in once a fifth of the stage is in view. The stage is never empty:
 * if the visitor arrives before the 3D cards are ready, the HTML cards show and the 3D ones
 * cross-fade in over them, already hanging (data-waiting). With reduced motion, without
 * WebGL2, or if the scene fails, the HTML cards stay: same content, no simulation.
 */
export function LanyardStage({ team, hint, children }: LanyardStageProps): React.ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const [control] = useState<LanyardControl>(createLanyardControl);
  const tier = useDeviceTier();
  const webgl = useWebgl();
  const reduced = useSyncExternalStore(subscribeReduced, () => matchMedia(reducedQuery).matches, () => false);
  const enhance = webgl === "webgl" && !reduced;
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [failed, setFailed] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onFailed = useCallback(() => setFailed(true), []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !enhance) return;
    let cancelled = false;
    warmUp(loadScene);

    const nearby = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        nearby.disconnect();
        void afterIntro()
          .then(() => whenIdle())
          .then(() => !cancelled && setNear(true));
      },
      { rootMargin: "300% 0px" },
    );
    let onScreen = false;
    const sync = (): void => control.setVisible(onScreen && document.visibilityState === "visible");
    const visible = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    const entered = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        control.setEntered();
        setArrived(true);
      },
      { threshold: 0.2 },
    );
    nearby.observe(stage);
    visible.observe(stage);
    entered.observe(stage);
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelled = true;
      nearby.disconnect();
      visible.disconnect();
      entered.disconnect();
      document.removeEventListener("visibilitychange", sync);
      control.setVisible(false);
    };
  }, [control, enhance]);

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      data-ready={ready ? "" : undefined}
      data-static={(webgl !== "pending" && !enhance) || failed ? "" : undefined}
      data-waiting={arrived && !ready ? "" : undefined}
    >
      {enhance && near && !failed && (
        <div className={styles.canvas}>
          <SceneBoundary onError={onFailed}>
            <LanyardScene team={team} tier={tier} control={control} onReady={onReady} />
          </SceneBoundary>
        </div>
      )}
      {children}
      {enhance && !failed && (
        <p className={`${styles.hint} text-label font-medium text-ink-500`} aria-hidden="true">
          {hint}
        </p>
      )}
    </div>
  );
}
