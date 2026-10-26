"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { displacementMapDataUrl } from "@/lib/glass/displacement-map";
import { afterIntro, whenIdle } from "@/lib/motion/after-intro";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Pointer-following eases this fraction of the remaining angle each frame. */
const ANGLE_EASE = 0.12;
const DEFAULT_ANGLE = 135;

interface GlassEntry {
  filter: SVGFilterElement | null;
  angle: number;
}

/** Feature-detects backdrop refraction. Only Chromium renders SVG filters in backdrop-filter. */
function canRefract(): boolean {
  return "userAgentData" in navigator && CSS.supports("backdrop-filter", "url(#a)");
}

/*
 * Progressive enhancement for every `.liquid-glass` element, loaded after first paint:
 *   - Chromium: builds a per-element SVG displacement filter (sized to the element) and
 *     exposes it as --lg-filter, which the utility prepends to its backdrop-filter.
 *   - Fine pointers: eases --lg-angle so the rim light turns toward the cursor.
 * Without JS, on other engines, or with reduced transparency/motion, the CSS glass stands alone.
 */
export function LiquidGlassEnhancer(): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || matchMedia("(prefers-reduced-transparency: reduce)").matches) return;

    const refract = canRefract();
    const followPointer =
      matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!refract && !followPointer) return;

    const entries = new Map<HTMLElement, GlassEntry>();
    let filterCount = 0;
    let cancelled = false;
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;

    const buildFilter = (el: HTMLElement, entry: GlassEntry): void => {
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      entry.filter?.remove();
      entry.filter = null;
      if (width < 2 || height < 2) return;

      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      // Thin controls get a thin lens; large cards cap out so text stays undistorted.
      const bevel = Math.max(6, Math.min(18, Math.min(width, height) * 0.32));
      const href = displacementMapDataUrl({ width, height, radius, bevel });
      if (!href) return;

      // A fresh id per build: Chromium caches backdrop filters by reference.
      const id = `lg-${++filterCount}`;
      const filter = document.createElementNS(SVG_NS, "filter");
      filter.setAttribute("id", id);
      filter.setAttribute("x", "0");
      filter.setAttribute("y", "0");
      filter.setAttribute("width", String(width));
      filter.setAttribute("height", String(height));
      filter.setAttribute("filterUnits", "userSpaceOnUse");
      filter.setAttribute("primitiveUnits", "userSpaceOnUse");
      filter.setAttribute("color-interpolation-filters", "sRGB");

      const image = document.createElementNS(SVG_NS, "feImage");
      image.setAttribute("href", href);
      image.setAttribute("x", "0");
      image.setAttribute("y", "0");
      image.setAttribute("width", String(width));
      image.setAttribute("height", String(height));
      image.setAttribute("preserveAspectRatio", "none");
      image.setAttribute("result", "map");

      const displace = document.createElementNS(SVG_NS, "feDisplacementMap");
      displace.setAttribute("in", "SourceGraphic");
      displace.setAttribute("in2", "map");
      // Max offset is scale / 2 px at the very edge.
      displace.setAttribute("scale", String(Math.round(bevel * 1.5)));
      displace.setAttribute("xChannelSelector", "R");
      displace.setAttribute("yChannelSelector", "G");

      filter.append(image, displace);
      svg.append(filter);
      entry.filter = filter;
      el.style.setProperty("--lg-filter", `url(#${id})`);
    };

    const resizeObserver = refract
      ? new ResizeObserver((records) => {
          for (const record of records) {
            const el = record.target as HTMLElement;
            const entry = entries.get(el);
            if (entry) buildFilter(el, entry);
          }
        })
      : null;

    const tick = (): void => {
      frame = 0;
      if (!pointer) return;
      let moving = false;
      for (const [el, entry] of entries) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.bottom < 0 || rect.top > innerHeight) continue;
        const dx = pointer.x - (rect.left + rect.width / 2);
        const dy = pointer.y - (rect.top + rect.height / 2);
        // CSS gradient angle whose 0% stop (the bright rim) faces the pointer.
        const target = (Math.atan2(-dx, dy) * 180) / Math.PI;
        const delta = ((((target - entry.angle + 540) % 360) + 360) % 360) - 180;
        if (Math.abs(delta) < 0.1) continue;
        entry.angle += delta * ANGLE_EASE;
        el.style.setProperty("--lg-angle", `${entry.angle.toFixed(2)}deg`);
        moving = true;
      }
      if (moving) frame = requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent): void => {
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(tick);
    };

    // Refraction filters distort under the intro's scale, so attach them afterwards.
    afterIntro()
      .then(() => whenIdle())
      .then(() => {
        if (cancelled) return;
        for (const el of document.querySelectorAll<HTMLElement>(".liquid-glass")) {
          entries.set(el, { filter: null, angle: DEFAULT_ANGLE });
          resizeObserver?.observe(el);
        }
        if (followPointer) window.addEventListener("pointermove", onPointerMove, { passive: true });
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      for (const [el, entry] of entries) {
        entry.filter?.remove();
        el.style.removeProperty("--lg-filter");
        el.style.removeProperty("--lg-angle");
      }
    };
  }, [pathname]);

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      className="pointer-events-none absolute size-0 overflow-hidden"
    />
  );
}
