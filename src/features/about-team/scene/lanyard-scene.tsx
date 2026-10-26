"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { NoToneMapping, PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { TeamMember } from "@/content/team";
import type { DeviceTier } from "@/lib/device/use-device-tier";
import type { LanyardControl } from "../store";
import { Lanyards } from "./lanyards";

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
 * Studio reflections without downloading an HDR: three's procedural room, prefiltered once.
 * The laminated print and the steel ring pick their highlights up from it as they turn.
 */
function StudioReflections(): null {
  const get = useThree((state) => state.get);
  useEffect(() => {
    const { gl, scene } = get();
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const environment = generator.fromScene(room, 0.04).texture;
    scene.environment = environment;
    // Low: reflections add gloss to the laminate and steel, never a milky veil over the print.
    scene.environmentIntensity = 0.22;
    return () => {
      scene.environment = null;
      environment.dispose();
      room.dispose();
      generator.dispose();
    };
  }, [get]);
  return null;
}

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
        // No tone mapping: the print and the strap must show the brand's true colours.
        gl.toneMapping = NoToneMapping;
        gl.setClearColor(0x000000, 0);
      }}
      aria-hidden="true"
    >
      <StudioReflections />
      <Lanyards team={team} tier={tier} control={control} onReady={onReady} />
    </Canvas>
  );
}
