"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { NoToneMapping } from "three";
import type { Project } from "@/content/projects";
import type { DeviceTier } from "@/lib/device/use-device-tier";
import type { CylinderStore } from "../store";
import { CameraRig } from "./camera-rig";
import { ringDimensions } from "./dimensions";
import { Ring } from "./ring";
import { Stage } from "./stage";
import { useStagePalette } from "./palette";

export interface CylinderSceneProps {
  projects: readonly Project[];
  tier: DeviceTier;
  store: CylinderStore;
  /** Called once the first frame has been drawn, so the canvas can fade in. */
  onReady?: () => void;
}

/* Modest supersampling preserves fine artwork on 1× displays; tier caps bound GPU fill cost. */
const DPR: Record<DeviceTier, [number, number]> = { high: [1.5, 2], medium: [1.25, 2], low: [1, 1.5] };

/*
 * Renders on demand: a frame is drawn only when scroll notifies or something is still moving.
 * One frame on (re)mount too, so a change that landed before subscribing is never missed.
 */
function StoreInvalidator({ store }: { store: CylinderStore }): null {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
    return store.subscribe(() => invalidate());
  }, [store, invalidate]);
  return null;
}

/*
 * The ring section's WebGL scene, loaded lazily (next/dynamic) near the section. No tone
 * mapping: the panels are screens and must show the projects' true colours, and the haze,
 * fog and floor are authored directly in display colours so they meet without a seam.
 */
export default function CylinderScene({ projects, tier, store, onReady }: CylinderSceneProps): React.ReactElement {
  const dimensions = useMemo(() => ringDimensions(projects.length), [projects.length]);
  const palette = useStagePalette();

  return (
    <Canvas
      frameloop="demand"
      dpr={DPR[tier]}
      camera={{ fov: 35, near: 0.1, far: 200, position: [0, 20, 20] }}
      gl={{ antialias: true, powerPreference: "high-performance", stencil: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = NoToneMapping;
        requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
      }}
      aria-hidden="true"
    >
      <StoreInvalidator store={store} />
      <Stage dimensions={dimensions} tier={tier} store={store} projects={projects.length} palette={palette} />
      <Ring projects={projects} dimensions={dimensions} tier={tier} store={store} />
      <CameraRig dimensions={dimensions} store={store} />
    </Canvas>
  );
}
