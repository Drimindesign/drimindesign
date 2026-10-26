"use client";

import { useEffect } from "react";
import { afterIntro, whenIdle } from "@/lib/motion/after-intro";
import { scroll } from "@/lib/motion/tokens";
import { setLenis } from "@/lib/motion/smooth-scroll";

/*
 * Inertial smooth scrolling for the whole site (Lenis), loaded after the intro at idle so it
 * never competes with first paint. Wheel and trackpad input glide; touch keeps the device's
 * native momentum. Scrolling is ignored while a popover (the mobile menu) is open.
 */
export function SmoothScroll(): null {
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;

    afterIntro()
      .then(() => whenIdle())
      .then(() => import("lenis"))
      .then(({ default: Lenis }) => {
        if (cancelled) return;
        const lenis = new Lenis({
          autoRaf: true,
          lerp: scroll.lerp,
          wheelMultiplier: scroll.wheelMultiplier,
          syncTouch: false,
          anchors: true,
          stopInertiaOnNavigate: true,
          prevent: (node) => node.closest("[popover], [data-lenis-prevent]") !== null,
          virtualScroll: () => document.querySelector(":popover-open") === null,
        });
        setLenis(lenis);
        destroy = () => {
          setLenis(null);
          lenis.destroy();
        };
      });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  return null;
}
