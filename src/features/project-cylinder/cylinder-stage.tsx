"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { projectImageUrl, type Project } from "@/content/projects";
import { useDeviceTier } from "@/lib/device/use-device-tier";
import { useWebgl } from "@/lib/device/use-webgl";
import { easeOutQuart, onLenis } from "@/lib/motion/smooth-scroll";
import { scroll } from "@/lib/motion/tokens";
import { warmUp } from "@/lib/motion/warm-up";
import { retryImport } from "@/lib/utils/retry-import";
import { computeProgress, exitProgress, frontIndex } from "./choreography";
import styles from "./project-cylinder.module.css";
import { createCylinderStore, type CylinderStore } from "./store";

const loadScene = (): Promise<typeof import("./scene/cylinder-scene")> => retryImport(() => import("./scene/cylinder-scene"));
const CylinderScene = dynamic(loadScene, { ssr: false });

interface CylinderStageProps {
  projects: readonly Project[];
}

/*
 * The pinned screen of the ring section. Maps scroll to the scene (via a mutable store,
 * never React state per frame), mounts the WebGL scene only once the section is within a
 * screen of the viewport, softly snaps the scroll onto the landing and each project, and
 * shows the front project's caption. Without WebGL it falls back to a 2D frame that swaps
 * images with the same scroll.
 */
export function CylinderStage({ projects }: CylinderStageProps): React.ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const [store] = useState<CylinderStore>(createCylinderStore);
  const tier = useDeviceTier();
  const [near, setNear] = useState(false);
  const renderer = useWebgl();
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const project = projects[index];

  useEffect(() => {
    const stage = stageRef.current;
    const section = stage?.closest("section");
    if (!stage || !section) return;

    store.setReducedMotion(matchMedia("(prefers-reduced-motion: reduce)").matches);

    let frame = 0;
    const update = (): void => {
      frame = 0;
      const top = section.getBoundingClientRect().top;
      const progress = computeProgress(top, window.innerHeight, projects.length);
      store.setProgress(progress);
      stage.style.setProperty("--land", progress.enter.toFixed(3));
      stage.style.setProperty("--exit", exitProgress(top, window.innerHeight, projects.length).toFixed(3));
      const next = frontIndex(progress.rotate, projects.length);
      if (next !== indexRef.current) {
        indexRef.current = next;
        setIndex(next);
      }
    };
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    // The ring is the next section after the hero: fetch its code as soon as the intro is
    // over, and mount the scene two screens early so its first frame is ready on arrival.
    warmUp(loadScene);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true);
      },
      { rootMargin: "200% 0px" },
    );
    observer.observe(section);

    // On screen (and the tab visible): lets the scene run its idle animation.
    const onScreen = { value: false };
    const syncVisible = (): void => store.setVisible(onScreen.value && document.visibilityState === "visible");
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen.value = entry.isIntersecting;
      syncVisible();
    });
    visibility.observe(section);
    document.addEventListener("visibilitychange", syncVisible);

    // Soft snap (Lenis): a scroll that comes to rest near the landing or a project glides
    // the last stretch and settles there. Free scrolling is never blocked.
    let destroySnap: (() => void) | undefined;
    let disposed = false;
    const stopWaiting = onLenis((lenis) => {
      void import("lenis/snap").then(({ default: Snap }) => {
        if (disposed) return;
        const snap = new Snap(lenis, {
          type: "proximity",
          duration: scroll.snapDurationS,
          easing: easeOutQuart,
          distanceThreshold: scroll.snapThreshold,
          debounce: scroll.snapDebounceMs,
        });
        snap.addElements(Array.from(section.querySelectorAll<HTMLElement>("[data-snap]")), { align: "start" });
        destroySnap = () => snap.destroy();
      });
    });

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", syncVisible);
      store.setVisible(false);
      disposed = true;
      stopWaiting();
      destroySnap?.();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [projects.length, store]);

  return (
    <div ref={stageRef} className={styles.stage}>
      {renderer === "webgl" && near && (
        <div className={styles.canvas} data-ready={ready ? "" : undefined}>
          <CylinderScene projects={projects} tier={tier} store={store} onReady={() => setReady(true)} />
        </div>
      )}

      {renderer === "fallback" && (
        <div key={project.slug} className={`${styles.fallbackImage} ${styles.caption}`}>
          <Image src={projectImageUrl(project, 1400)} alt={project.alt} fill sizes="(min-width: 64rem) 64rem, 78vw" />
        </div>
      )}

      {/* Copy column: right of the ring on landscape screens, below it on portrait. */}
      <div className={styles.overlay} aria-hidden="true">
        <div className={styles.copy}>
          <p className="flex items-center justify-between gap-6 text-label font-medium text-fg">
            <span>Selected work</span>
            <span className="tabular-nums">
              {String(index + 1).padStart(2, "0")} / {String(projects.length).padStart(2, "0")}
            </span>
          </p>
          <div key={project.slug} className={styles.caption}>
            <p className="mt-4 font-display text-display-lg text-fg-display uppercase">{project.title}</p>
            <p className="mt-3 text-body-sm font-medium text-fg">
              {project.category}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
