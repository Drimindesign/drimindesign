"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { WebglBoundary } from "@/components/ui/webgl-boundary";
import { projectHref, projectImageUrl, type Project } from "@/content/projects";
import { useDeviceTier } from "@/lib/device/use-device-tier";
import { useWebgl } from "@/lib/device/use-webgl";
import { easeOutQuart, onLenis } from "@/lib/motion/smooth-scroll";
import { scroll } from "@/lib/motion/tokens";
import { afterIntro, whenIdle } from "@/lib/motion/after-intro";
import { warmUp } from "@/lib/motion/warm-up";
import { retryImport } from "@/lib/utils/retry-import";
import { flyArrow } from "./arrow-flight";
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
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const project = projects[index];
  const router = useRouter();
  const arrowRef = useRef<HTMLSpanElement>(null);
  const flying = useRef(false);

  // View project: the arrow flies to the front panel and taps it, which opens it like a click.
  // Without the ring (fallback, reduced motion, a modified click) the link simply navigates.
  const viewProject = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    const front = store.panels?.front();
    const arrow = arrowRef.current;
    const plain = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (project.playHref || !front || !arrow || plain || store.reducedMotion) return;
    if (projects[front.index % projects.length].slug !== project.slug) return;
    event.preventDefault();
    if (flying.current) return;
    flying.current = true;
    void flyArrow(arrow, front.corner)
      .then(() => store.panels?.open(front.index))
      .finally(() => (flying.current = false));
  };

  // Prefetch the current and next project, without competing with scene preparation.
  useEffect(() => {
    if (!ready) return;
    warmUp(async () => {
      router.prefetch(projectHref(projects[index]));
      router.prefetch(projectHref(projects[(index + 1) % projects.length]));
    });
  }, [ready, index, projects, router]);

  // Prepare below the fold on user intent, so GPU setup can finish before the first scroll.
  useEffect(() => {
    const section = stageRef.current?.closest("section");
    if (!section || renderer !== "webgl") return;
    let cancelled = false;
    let nearby = false;
    let preparing = false;
    let prepared = false;
    let mounting = false;
    let intent = window.scrollY > 0;
    const mount = (): void => {
      if (!prepared || mounting) return;
      mounting = true;
      void whenIdle().then(() => { if (!cancelled) setNear(true); });
    };
    const prepare = (): void => {
      if (!intent || !nearby || preparing) return;
      preparing = true;
      void afterIntro().then(() => whenIdle()).then(loadScene).then(() => {
        prepared = true;
        mount();
      }).catch(() => { if (!cancelled) setFailed(true); });
    };
    const onIntent = (): void => { intent = true; prepare(); mount(); };
    const observer = new IntersectionObserver(([entry]) => {
      nearby = entry.isIntersecting;
      if (nearby) prepare();
    }, { rootMargin: "100% 0px" });
    observer.observe(section);
    for (const event of ["pointermove", "pointerdown", "keydown", "scroll"]) window.addEventListener(event, onIntent, { passive: true });
    return () => {
      cancelled = true;
      observer.disconnect();
      for (const event of ["pointermove", "pointerdown", "keydown", "scroll"]) window.removeEventListener(event, onIntent);
    };
  }, [renderer]);

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

    // On screen (and the tab visible): lets the scene run its idle animation.
    const onScreen = { value: false };
    const syncVisible = (): void => store.setVisible(onScreen.value && document.visibilityState === "visible");
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen.value = entry.isIntersecting;
      syncVisible();
    });
    visibility.observe(section);
    document.addEventListener("visibilitychange", syncVisible);

    // First read on the next frame: back from a project page this runs before the browser has
    // restored the scroll position, and reading it now would send the camera back up.
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      visibility.disconnect();
      document.removeEventListener("visibilitychange", syncVisible);
      store.setVisible(false);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [projects.length, store]);

  useEffect(() => {
    if (!near) return;
    const section = stageRef.current?.closest("section");
    if (!section) return;
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

    return () => { disposed = true; stopWaiting(); destroySnap?.(); };
  }, [near]);

  return (
    <div ref={stageRef} className={styles.stage}>
      {renderer === "webgl" && near && !failed && (
        <div className={styles.canvas} data-ready={ready ? "" : undefined}>
          <WebglBoundary onError={() => setFailed(true)}>
            <CylinderScene projects={projects} tier={tier} store={store} onReady={() => setReady(true)} />
          </WebglBoundary>
        </div>
      )}

      {(renderer === "fallback" || failed) && (
        // Opens the project like a ring panel; keyboard and screen readers use the section's real links.
        <Link prefetch={false} key={project.slug} href={projectHref(project)} tabIndex={-1} className={`${styles.fallbackImage} ${styles.caption}`}>
          <Image src={projectImageUrl(project, 1400)} alt={project.alt} fill sizes="(min-width: 64rem) 64rem, 78vw" />
        </Link>
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
            <p className="mt-4 font-display text-[clamp(2.5rem,5vw,5.25rem)] leading-[0.92] text-balance text-fg-display uppercase">{project.title}</p>
            <p className="mt-3 text-body-sm font-medium text-fg">
              {project.category}
            </p>
            {project.description && <p className="mt-3 max-w-[38ch] text-body-sm text-fg">{project.description}</p>}
            {/* Pointer shortcut; keyboard and screen readers use the section's real links. */}
            <Link
              href={projectHref(project)}
              tabIndex={-1}
              onClick={viewProject}
              className={`${styles.view} mt-6 text-body-sm font-semibold text-fg`}
            >
              {project.playHref ? "Play game" : "View project"}{" "}
              <span ref={arrowRef} aria-hidden="true" className={styles.arrow}>
                {project.playHref ? "▶" : "→"}
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
