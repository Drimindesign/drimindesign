"use client";

import { Canvas } from "@react-three/fiber";
import { NoToneMapping } from "three";
import type { TeamMember } from "@/content/team";
import { reportGraphicsContext } from "@/lib/device/capabilities";
import type { DeviceTier } from "@/lib/device/use-device-tier";
import type { LanyardControl } from "../store";
import { Lanyards } from "./lanyards";
import { StudioEnvironment } from "./studio-environment";

export interface LanyardSceneProps {
  team: readonly TeamMember[];
  tier: DeviceTier;
  control: LanyardControl;
  /** Called once the cards' artwork is ready and drawn, so the HTML cards can step aside. */
  onReady?: () => void;
}

/* Print and type need full sharpness: only the low tier drops below the screen's own density. */
const DPR: Record<DeviceTier, [number, number]> = { high: [1, 2], medium: [1, 2], low: [1, 1.25] };
/** Camera distance and vertical field of view: a long lens keeps the cards nearly flat-on. */
export const CAMERA = { z: 10, fov: 30 } as const;

/*
 * The About & Team WebGL scene, loaded lazily near the section. Renders on demand: frames
 * are drawn only while a card is still moving. Transparent, so the section's white shows
 * through and only the cards' soft shadows land on it. Printed surfaces carry their own
 * colour (emissive print, see lanyards.tsx); light adds shading and gloss on top.
 */
export default function LanyardScene({ team, tier, control, onReady }: LanyardSceneProps): React.ReactElement {
  return (
    <Canvas
      frameloop="demand"
      flat
      dpr={DPR[tier]}
      shadows={tier === "low" ? false : "soft"}
      camera={{ fov: CAMERA.fov, near: 1, far: 40, position: [0, 0, CAMERA.z] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", stencil: false }}
      onCreated={({ gl }) => {
        reportGraphicsContext(gl.getContext());
        // No tone mapping: the print and the strap must show the brand's true colours.
        gl.toneMapping = NoToneMapping;
        gl.setClearColor(0x000000, 0);
      }}
      aria-hidden="true"
    >
      <StudioEnvironment>
        <Lanyards team={team} tier={tier} control={control} onReady={onReady} />
      </StudioEnvironment>
    </Canvas>
  );
}
