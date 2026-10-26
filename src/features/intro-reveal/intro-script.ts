import { intro, introTotalMs } from "@/lib/motion/tokens";

const STORAGE_KEY = "drimin:intro-played";

interface IntroScriptConfig {
  storageKey: string;
  totalMs: number;
  popFrom: number;
  insetMinPx: number;
  insetMaxPx: number;
  insetVw: number;
  radiusMinPx: number;
  radiusMaxPx: number;
  radiusVw: number;
  timeline: Record<string, string>;
}

/*
 * Serialised into an inline <script> and run before first paint, so it must stay
 * self-contained: no closures over module scope, no imports, no syntax that needs helpers.
 *
 * It first marks html[data-js] (on every page): CSS uses it to hold back no-JS fallbacks
 * that scripts are about to replace (the HTML ID cards under the lanyard scene).
 * Then it decides whether the intro plays (home page, first visit this session, motion allowed,
 * or forced with `?intro`), then writes the frame geometry as CSS variables. Everything
 * after that is CSS on the compositor, so hydration work can't make the intro stutter.
 */
function runIntro(c: IntroScriptConfig): void {
  const root = document.documentElement;
  root.setAttribute("data-js", "");
  if (location.pathname !== "/") return;

  const forced = /[?&]intro\b/.test(location.search);
  if (!forced && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    if (!forced && sessionStorage.getItem(c.storageKey)) return;
    sessionStorage.setItem(c.storageKey, "1");
  } catch {
    // Storage blocked (private mode, policy): play anyway, it just won't be remembered.
  }

  const w = window.innerWidth;
  const h = window.innerHeight;
  const inset = Math.min(c.insetMaxPx, Math.max(c.insetMinPx, w * c.insetVw));
  const radius = Math.min(c.radiusMaxPx, Math.max(c.radiusMinPx, w * c.radiusVw));
  const style = root.style;

  // The panel overhangs the stage by `radius` on every side, so at full size its rounded
  // corners sit just off-screen. These scales shrink that oversized panel until its
  // visible edges are exactly `inset` px from the viewport: the white frame.
  style.setProperty("--intro-sx", String((w - 2 * inset) / (w + 2 * radius)));
  style.setProperty("--intro-sy", String((h - 2 * inset) / (h + 2 * radius)));
  style.setProperty("--intro-r", radius + "px");
  style.setProperty("--intro-oy", h / 2 + "px");
  style.setProperty("--intro-pop", String(c.popFrom));
  for (const key in c.timeline) style.setProperty(key, c.timeline[key]);

  root.setAttribute("data-intro", "play");
  // Retire the animation rules once finished, so a page restored from <Activity>
  // (display: none → visible restarts CSS animations) doesn't replay the intro.
  setTimeout(function () {
    root.setAttribute("data-intro", "done");
  }, c.totalMs + 100);
}

const config: IntroScriptConfig = {
  storageKey: STORAGE_KEY,
  totalMs: introTotalMs,
  popFrom: intro.popFrom,
  insetMinPx: intro.insetMinPx,
  insetMaxPx: intro.insetMaxPx,
  insetVw: intro.insetVw,
  radiusMinPx: intro.radiusMinPx,
  radiusMaxPx: intro.radiusMaxPx,
  radiusVw: intro.radiusVw,
  timeline: {
    "--intro-pop-ms": `${intro.popMs}ms`,
    "--intro-expand-ms": `${intro.expandMs}ms`,
    "--intro-expand-delay": `${intro.popMs + intro.holdMs}ms`,
    "--intro-letter-ms": `${intro.letterMs}ms`,
    "--intro-letter-delay": `${intro.letterDelayMs}ms`,
    "--intro-letter-stagger": `${intro.letterStaggerMs}ms`,
    "--intro-letter-tilt": `${intro.letterTiltDeg}deg`,
    "--intro-item-ms": `${intro.itemMs}ms`,
    "--intro-items-delay": `${intro.itemsDelayMs}ms`,
    "--intro-item-stagger": `${intro.itemStaggerMs}ms`,
  },
};

export const introScript = `(${runIntro.toString()})(${JSON.stringify(config)})`;
