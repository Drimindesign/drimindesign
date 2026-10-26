"use client";

import { useSyncExternalStore } from "react";

export type DeviceTier = "high" | "medium" | "low";

interface NavigatorHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/* Rough capability tier for 3D quality (AGENTS.md §4.3), from browser and GPU hints. */
export function detectDeviceTier(): DeviceTier {
  const nav = navigator as Navigator & NavigatorHints;
  if (nav.connection?.saveData) return "low";

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) return "low";

  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "";
  gl.getExtension("WEBGL_lose_context")?.loseContext();

  if (/swiftshader|llvmpipe|software/i.test(renderer)) return "low";
  if (cores <= 4 || memory <= 3) return "low";
  if (coarse || cores <= 6 || memory <= 4) return "medium";
  return "high";
}

let cachedTier: DeviceTier | undefined;
const noop = (): (() => void) => () => undefined;

/* "medium" during the server render; the detected tier (computed once) on the client. */
export function useDeviceTier(): DeviceTier {
  return useSyncExternalStore(
    noop,
    () => (cachedTier ??= detectDeviceTier()),
    () => "medium",
  );
}
