"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { detectDeviceTier } from "@/lib/device/use-device-tier";
import { getLenis } from "@/lib/motion/smooth-scroll";
import { tissue as tune } from "@/lib/motion/tokens";
import { tissue, type TissueOrigin } from "./store";
import type { TissueRenderer } from "./tissue-renderer";
import styles from "./transition-layer.module.css";

const HERO_SELECTOR = "[data-project-hero] img";
/** Give up waiting for the hero image after this long (the sheet fades anyway). */
const HERO_TIMEOUT_MS = 1500;

/* Resolves once the destination hero image is decoded, so the hand-off has no blank frame. */
async function heroReady(): Promise<void> {
  const deadline = performance.now() + HERO_TIMEOUT_MS;
  while (performance.now() < deadline) {
    const image = document.querySelector<HTMLImageElement>(HERO_SELECTOR);
    if (image) {
      await image.decode().catch(() => undefined);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

function canAnimate(): boolean {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  return Boolean(document.createElement("canvas").getContext("webgl2"));
}

/*
 * Plays the tissue pull over everything (mounted once in the root layout, above the page and
 * the header, never catching the pointer). Opening: the clicked ring panel peels off toward
 * the visitor and spreads to fill the screen; the project page is pushed underneath once
 * the sheet nearly covers it, then the sheet fades into the page's real hero. Returning
 * (Close or the browser's Back) runs it backwards into the panel, which <Activity> has kept
 * exactly where it was. Without WebGL2 or with reduced motion it simply navigates.
 */
export function TransitionLayer(): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<{ renderer: TissueRenderer | null; frame: number; progress: number; velocity: number; time: number }>({
    renderer: null,
    frame: 0,
    progress: 0,
    velocity: 0,
    time: 0,
  });
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = engine.current;

    const show = (visible: boolean): void => {
      canvas.toggleAttribute("data-active", visible);
    };

    const release = (): void => {
      cancelAnimationFrame(state.frame);
      show(false);
      state.renderer?.dispose();
      state.renderer = null;
      getLenis()?.start();
    };

    // Critically damped spring toward `target`; calls `onFrame` each frame until settled.
    const animate = (target: number, onFrame: (progress: number) => boolean): void => {
      let last = performance.now();
      const omega = tune.omega;
      const step = (now: number): void => {
        const dt = Math.min((now - last) / 1000, 1 / 30);
        last = now;
        state.time += dt;
        const acceleration = omega * omega * (target - state.progress) - 2 * omega * state.velocity;
        state.velocity += acceleration * dt;
        state.progress += state.velocity * dt;
        state.renderer?.render(state.progress, state.time);
        if (onFrame(state.progress)) state.frame = requestAnimationFrame(step);
      };
      state.frame = requestAnimationFrame(step);
    };

    const fadeOut = (onDone: () => void): void => {
      const start = performance.now();
      const step = (now: number): void => {
        const opacity = 1 - Math.min(1, (now - start) / tune.fadeMs);
        state.renderer?.render(1, state.time, opacity);
        if (opacity > 0) state.frame = requestAnimationFrame(step);
        else onDone();
      };
      state.frame = requestAnimationFrame(step);
    };

    const open = async (origin: TissueOrigin): Promise<void> => {
      const href = `/projects/${origin.slug}`;
      if (!canAnimate()) {
        router.push(href);
        tissue.setPhase("idle");
        return;
      }
      getLenis()?.stop();
      let renderer: TissueRenderer;
      try {
        const { TissueRenderer } = await import("./tissue-renderer");
        renderer = new TissueRenderer(canvas, tune.segments[detectDeviceTier()]);
        state.renderer = renderer;
        await renderer.load(origin.image);
        renderer.setOrigin(origin);
        renderer.resize();
      } catch {
        release();
        router.push(href);
        tissue.setPhase("idle");
        return;
      }
      state.progress = 0;
      state.velocity = 0;
      renderer.render(0, 0);
      show(true);
      let navigated = false;
      animate(1, (progress) => {
        if (!navigated && progress >= tune.navigateAt) {
          navigated = true;
          router.push(href);
        }
        if (progress < 0.996) return true;
        state.progress = 1;
        void heroReady().then(() =>
          fadeOut(() => {
            show(false);
            getLenis()?.start();
            tissue.setPhase("open");
          }),
        );
        return false;
      });
    };

    const unsubscribe = tissue.subscribe(() => {
      const origin = tissue.origin;
      if (tissue.phase === "opening" && origin) void open(origin);
    });

    const resize = (): void => state.renderer?.resize();
    window.addEventListener("resize", resize);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", resize);
      release();
    };
  }, [router]);

  // Back on the home page from the project opened through the ring: cover the screen before
  // the first paint, then pull the sheet back into its panel.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const state = engine.current;
    if (!canvas || tissue.phase !== "open") return;
    if (pathname !== "/") {
      if (!pathname.startsWith("/projects/")) {
        state.renderer?.dispose();
        state.renderer = null;
        tissue.setPhase("idle");
      }
      return;
    }
    const renderer = state.renderer;
    if (!renderer) {
      tissue.setPhase("idle");
      return;
    }
    tissue.setPhase("closing");
    getLenis()?.stop();
    renderer.resize();
    state.progress = 1;
    state.velocity = 0;
    renderer.render(1, state.time);
    canvas.toggleAttribute("data-active", true);
    let last = performance.now();
    const omega = tune.omega;
    const step = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      state.time += dt;
      const acceleration = omega * omega * (0 - state.progress) - 2 * omega * state.velocity;
      state.velocity += acceleration * dt;
      state.progress += state.velocity * dt;
      renderer.render(Math.max(0, state.progress), state.time);
      if (state.progress > 0.004) {
        state.frame = requestAnimationFrame(step);
        return;
      }
      canvas.toggleAttribute("data-active", false);
      renderer.dispose();
      state.renderer = null;
      getLenis()?.start();
      tissue.setPhase("idle");
    };
    state.frame = requestAnimationFrame(step);
  }, [pathname]);

  return <canvas ref={canvasRef} className={styles.layer} aria-hidden="true" />;
}
