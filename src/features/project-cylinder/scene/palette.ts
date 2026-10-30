"use client";

import { useMemo } from "react";

export interface StagePalette {
  zenith: string;
  horizon: string;
  glow: string;
  shade: string;
  floorLit: string;
  floorMid: string;
  floorDark: string;
  figure: string;
}

function readPalette(): StagePalette {
  const styles = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  // The scene is client-only; the base colour also provides a safe value before CSS is available.
  const fallback = "#4c1d95";
  const colour = (token: string): string => styles?.getPropertyValue(token).trim() || fallback;
  return {
    zenith: colour("--stage-zenith"),
    horizon: colour("--color-brand-500"),
    glow: colour("--stage-glow"),
    shade: colour("--stage-shade"),
    floorLit: colour("--stage-floor-lit"),
    floorMid: colour("--stage-floor-mid"),
    floorDark: colour("--stage-floor-dark"),
    figure: styles?.getPropertyValue("--stage-figure").trim() || "#06020f",
  };
}

/** CSS is the colour source of truth; every screen uses the same desktop room palette. */
export function useStagePalette(): StagePalette {
  return useMemo(() => readPalette(), []);
}
