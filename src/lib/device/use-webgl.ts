"use client";

import { useSyncExternalStore } from "react";

export type WebglSupport = "pending" | "webgl" | "fallback";

let support: boolean | undefined;
const noop = (): (() => void) => () => undefined;

/* WebGL2 support, read once on the client; "pending" during the server render. */
export function useWebgl(): WebglSupport {
  return useSyncExternalStore(
    noop,
    () => {
      support ??= Boolean(document.createElement("canvas").getContext("webgl2"));
      return support ? "webgl" : "fallback";
    },
    () => "pending",
  );
}
