"use client";

import { useSyncExternalStore } from "react";
import { afterIntro, whenIdle } from "@/lib/motion/after-intro";

export type DeviceTier = "high" | "medium" | "low";
export type WebglSupport = "pending" | "webgl" | "fallback";
interface Capabilities { tier: DeviceTier; webgl: WebglSupport }
interface NavigatorHints { deviceMemory?: number; connection?: { saveData?: boolean } }

const pending: Capabilities = { tier: "medium", webgl: "pending" };
let snapshot = pending;
let started = false;
const listeners = new Set<() => void>();

/** Read cheap browser hints; creating a throwaway context can stall the GPU driver for seconds. */
export function readCapabilities(): Capabilities {
  if (snapshot !== pending) return snapshot;
  const nav = navigator as Navigator & NavigatorHints;
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  const supported = typeof WebGL2RenderingContext !== "undefined";
  const tier: DeviceTier = !supported || nav.connection?.saveData || cores <= 4 || memory <= 3
    ? "low" : matchMedia("(pointer: coarse)").matches || cores <= 6 || memory <= 4 ? "medium" : "high";
  return (snapshot = { tier, webgl: supported ? "webgl" : "fallback" });
}

/** Inspect an actual scene's context, so software GPUs keep the existing low quality budget. */
export function reportGraphicsContext(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "";
  if (/swiftshader|llvmpipe|software/i.test(renderer) && snapshot.tier !== "low") {
    snapshot = { tier: "low", webgl: "webgl" };
    listeners.forEach((notify) => notify());
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    void afterIntro().then(() => whenIdle()).then(() => {
      try { readCapabilities(); } catch { snapshot = { tier: "low", webgl: "fallback" }; }
      listeners.forEach((notify) => notify());
    });
  }
  return () => { listeners.delete(listener); };
}

/** Capability detection is deferred until after load and the intro. */
export function useCapabilities(): Capabilities {
  return useSyncExternalStore(subscribe, () => snapshot, () => pending);
}
