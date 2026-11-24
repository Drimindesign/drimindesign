"use client";

import { readCapabilities, useCapabilities, type DeviceTier } from "./capabilities";
export type { DeviceTier } from "./capabilities";

export function detectDeviceTier(): DeviceTier {
  return readCapabilities().tier;
}

export function useDeviceTier(): DeviceTier {
  return useCapabilities().tier;
}
