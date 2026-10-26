"use client";

import { MeshReflectorMaterial } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import type { DeviceTier } from "@/lib/device/use-device-tier";
import type { CylinderStore } from "../store";
import { fogRange, type RingDimensions } from "./dimensions";
import { Figures } from "./figures";
import { HazeDome } from "./haze-dome";
import { stagePalette } from "./palette";
import { createFloorGlowTexture, createFloorRoughnessTexture } from "./textures";

interface StageProps {
  dimensions: RingDimensions;
  tier: DeviceTier;
  store: CylinderStore;
  projects: number;
}

const FLOOR_SIZE = 140;
const DOME_RADIUS = 90;
const REFLECTION_RESOLUTION: Record<DeviceTier, number> = { high: 1024, medium: 512, low: 256 };

/*
 * The endless room: warm haze all around (HazeDome), a satin floor that carries the ring's
 * glow, a contact shadow and a soft reflection of it, and fog in the horizon colour that
 * dissolves the floor into the haze, so there are no walls, corners or edges anywhere.
 */
export function Stage({ dimensions, tier, store, projects }: StageProps): React.ReactElement {
  const { radius } = dimensions;
  const glow = useMemo(() => createFloorGlowTexture((radius * 2) / FLOOR_SIZE), [radius]);
  const roughness = useMemo(() => createFloorRoughnessTexture(18), []);

  useEffect(
    () => () => {
      glow.dispose();
      roughness.dispose();
    },
    [glow, roughness],
  );

  return (
    <>
      <color attach="background" args={[stagePalette.horizon]} />
      <fog attach="fog" args={[stagePalette.horizon, ...fogRange(radius)]} />
      <HazeDome radius={DOME_RADIUS} />

      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        {tier === "low" ? (
          <meshStandardMaterial color="#000000" emissive="#ffffff" emissiveMap={glow} roughness={1} />
        ) : (
          <MeshReflectorMaterial
            resolution={REFLECTION_RESOLUTION[tier]}
            /* Contact-hardening: the depth buffer drives the blur, so the reflection is crisp
               where the band meets the floor and softens as it falls away from it. */
            blur={[400, 140]}
            mixBlur={1}
            depthToBlurRatioBias={0.18}
            mixStrength={tier === "high" ? 2.6 : 2.2}
            mixContrast={1}
            /* Depth fade over the reflection's whole length, so it thins out gradually
               instead of stopping at a hard line (a short range cut it off on phones). */
            depthScale={1}
            minDepthThreshold={0}
            maxDepthThreshold={2.4}
            mirror={0.62}
            color="#000000"
            emissive="#ffffff"
            emissiveMap={glow}
            roughness={1}
            roughnessMap={roughness}
            metalness={0}
          />
        )}
      </mesh>

      <Figures ringRadius={radius} projects={projects} store={store} />
    </>
  );
}
