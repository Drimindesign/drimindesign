"use client";

import { useCapabilities, type WebglSupport } from "./capabilities";
export type { WebglSupport } from "./capabilities";

export function useWebgl(): WebglSupport {
  return useCapabilities().webgl;
}
