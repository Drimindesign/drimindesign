import { useEffect, useState, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { CubeUVReflectionMapping, DataTexture, HalfFloatType, LinearFilter, LinearSRGBColorSpace, RGBAFormat } from "three";
import studio from "@/content/studio-environment.generated.json";
import { whenIdle } from "@/lib/motion/after-intro";

let pixels: Promise<ArrayBuffer> | undefined;

function loadPixels(): Promise<ArrayBuffer> {
  pixels ??= fetch(studio.asset).then(async (response) => {
    if (!response.ok || !response.body) throw new Error("Studio environment unavailable");
    return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }).catch((error: unknown) => { pixels = undefined; throw error; });
  return pixels;
}

/** Exact half-float pixels from the original RoomEnvironment: no runtime cubemap filtering. */
export function StudioEnvironment({ children }: { children: ReactNode }): ReactNode {
  const get = useThree((state) => state.get);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    let cancelled = false;
    let texture: DataTexture | undefined;
    void loadPixels().then(async (buffer) => {
      await whenIdle(200);
      if (cancelled) return;
      if (buffer.byteLength !== studio.width * studio.height * 8) throw new Error("Invalid studio environment pixels");
      texture = new DataTexture(new Uint16Array(buffer), studio.width, studio.height, RGBAFormat, HalfFloatType);
      texture.mapping = CubeUVReflectionMapping;
      texture.colorSpace = LinearSRGBColorSpace;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.needsUpdate = true;
      const { gl, scene } = get();
      gl.initTexture(texture);
      scene.environment = texture;
      scene.environmentIntensity = 0.22;
      setStatus("ready");
    }).catch(() => { if (!cancelled) setStatus("failed"); });
    return () => {
      cancelled = true;
      if (get().scene.environment === texture) get().scene.environment = null;
      texture?.dispose();
    };
  }, [get]);
  if (status === "failed") throw new Error("Studio environment unavailable");
  return status === "ready" ? children : null;
}
