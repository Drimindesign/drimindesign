"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/*
 * Keeps the fixed header's glass adapted to whatever section is beneath it, the way Apple's
 * regular Liquid Glass flips between light and dark. Samples the element painted at the
 * header's vertical centre (at the left edge, which the header never covers) and copies the
 * nearest data-surface onto the header. Sampling what is actually painted, not layout
 * order, stays correct when sections overlap (the ring section lifting off the story
 * section). Before this runs, CSS (:has, tokens.css) borrows the first section's surface.
 */
export function HeaderSurface(): React.ReactElement {
  const markerRef = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const header = markerRef.current?.closest("header");
    if (!header) return;

    let frame = 0;
    const apply = (): void => {
      frame = 0;
      const rect = header.getBoundingClientRect();
      const below = document.elementFromPoint(1, rect.top + rect.height / 2);
      const surface = below?.closest<HTMLElement>("main [data-surface], main[data-surface], footer[data-surface]")?.dataset.surface;
      if (surface && header.dataset.surface !== surface) header.dataset.surface = surface;
    };
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      delete header.dataset.surface;
    };
  }, [pathname]);

  return <span ref={markerRef} hidden />;
}
