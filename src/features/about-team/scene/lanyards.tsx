"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DoubleSide, Group, Matrix4, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import type { TeamMember } from "@/content/team";
import type { DeviceTier } from "@/lib/device/use-device-tier";
import { lanyard as tune } from "@/lib/motion/tokens";
import type { LanyardControl } from "../store";
import { createCardArt, type CardArt } from "./card-art";
import { createCardGeometry } from "./card-geometry";
import { CARD, LanyardBody, layoutLanyards } from "./lanyard-physics";
import { StrapRibbon } from "./strap-ribbon";

interface LanyardsProps {
  team: readonly TeamMember[];
  tier: DeviceTier;
  control: LanyardControl;
  onReady?: () => void;
}

/** On-screen card width (CSS px): large enough to read, a row of four on desktop, two rows on phones. */
function cardPixels(width: number, height: number): number {
  if (width >= 1024) return Math.min(250, width * 0.16, height * 0.3);
  if (width >= 640) return Math.min(190, height * 0.22);
  return Math.min(width * 0.42, height * 0.19);
}

/** A press that moves less than this (px) and lasts less than TAP_MS flips the card. */
const TAP_SLOP = 6;
const TAP_MS = 350;
/** The rail sits just inside the stage's top edge. */
const RAIL_INSET = 0.12;

const TOWARDS_VIEWER = new Vector3(0, 0, 1);
/*
 * Share of each printed surface's colour it shows on its own (as emissive), whatever the
 * light: the rest comes from the key light, so cards shade as they turn without the print
 * ever washing out or going muddy. Key + glow land the print at its true colour face-on.
 */
const PRINT_GLOW = 0.62;
const KEY_LIGHT = 1.2;
/** Studio reflections on the print: just enough for the laminate's glint, never a veil. */
const PRINT_REFLECTION = 0.15;
/*
 * Laminated print: a matte base with little sheen of its own (so photos keep their blacks)
 * under a thin, smooth clear coat that throws one tight glint as the card turns.
 */
const PRINT = {
  emissive: "#ffffff",
  emissiveIntensity: PRINT_GLOW,
  roughness: 0.75,
  specularIntensity: 0.25,
  clearcoat: 0.45,
  clearcoatRoughness: 0.08,
  envMapIntensity: PRINT_REFLECTION,
} as const;

function useMaterials(): { body: MeshPhysicalMaterial; metal: MeshStandardMaterial; strap: MeshStandardMaterial } {
  const [materials] = useState(() => ({
    // White PVC edge and laminated print: a clear coat that catches the studio light as cards turn.
    body: new MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.6, clearcoat: 0.4, clearcoatRoughness: 0.2, emissive: "#ffffff", emissiveIntensity: PRINT_GLOW, envMapIntensity: PRINT_REFLECTION }),
    metal: new MeshStandardMaterial({ color: "#dcdcdc", metalness: 1, roughness: 0.26 }),
    // Woven strap: matte, its print carries its own colour (PRINT_GLOW) so it never fades to salmon.
    strap: new MeshStandardMaterial({ roughness: 0.9, side: DoubleSide, emissive: "#ffffff", emissiveIntensity: PRINT_GLOW, envMapIntensity: 0.1 }),
  }));
  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);
  return materials;
}

/*
 * The hanging cards: simulation, meshes and interaction. Drag a card to swing it, tap to
 * flip it, brush past it with the cursor to nudge it. Bodies live in a ref (never React
 * state); each frame steps them at a fixed rate, writes transforms, and asks for another
 * frame only while something still moves.
 */
export function Lanyards({ team, tier, control, onReady }: LanyardsProps): React.ReactElement | null {
  const size = useThree((state) => state.size);
  const viewport = useThree((state) => state.viewport);
  const invalidate = useThree((state) => state.invalidate);
  const get = useThree((state) => state.get);
  const materials = useMaterials();
  const [geometry] = useState(createCardGeometry);
  const [ribbons] = useState(() => team.map(() => new StrapRibbon(tune.strapPoints + 2)));
  const [art, setArt] = useState<CardArt | null>(null);
  const cards = useRef<(Group | null)[]>([]);
  const bodies = useRef<LanyardBody[]>([]);
  const clock = useRef({ time: 0, accumulator: 0 });
  const scaleRef = useRef(1);
  const drag = useRef<{ index: number; id: number; x: number; y: number; at: number; moved: boolean } | null>(null);
  const brush = useRef({ x: 0, y: 0, at: 0 });

  const cardPx = cardPixels(size.width, size.height);
  const scale = cardPx * (viewport.width / size.width);
  const stageWidth = size.width / cardPx;
  const stageHeight = size.height / cardPx;
  const railY = stageHeight / 2 - RAIL_INSET;

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // Re-hang the cards whenever the stage changes size: dropped in the first time, at rest after.
  useLayoutEffect(() => {
    const drop = !control.entered;
    bodies.current = layoutLanyards(team.length, stageWidth, stageHeight, railY, drop).map((spec) => new LanyardBody(spec, drop));
    invalidate();
  }, [team.length, stageWidth, stageHeight, railY, control, invalidate]);

  useEffect(() => {
    let cancelled = false;
    let created: CardArt | null = null;
    const anisotropy = Math.min(8, get().gl.capabilities.getMaxAnisotropy());
    void createCardArt(team, anisotropy).then((result) => {
      if (cancelled) return result.dispose();
      created = result;
      materials.strap.map = result.strap;
      materials.strap.emissiveMap = result.strap;
      materials.strap.needsUpdate = true;
      setArt(result);
    });
    return () => {
      cancelled = true;
      created?.dispose();
    };
  }, [team, get, materials]);

  useEffect(() => {
    if (!art) return;
    invalidate();
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
    return () => cancelAnimationFrame(frame);
  }, [art, invalidate, onReady]);

  useEffect(() => control.subscribe(() => invalidate()), [control, invalidate]);
  useEffect(() => () => {
    geometry.dispose();
    ribbons.forEach((ribbon) => ribbon.dispose());
  }, [geometry, ribbons]);

  // Dragging is tracked on the window so a fast fling never loses the card.
  useEffect(() => {
    const point = new Vector3();
    const toCardUnits = (clientX: number, clientY: number, z: number): [number, number, number] => {
      const { camera, gl } = get();
      const rect = gl.domElement.getBoundingClientRect();
      point.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, 0.5).unproject(camera);
      point.sub(camera.position).normalize();
      const s = scaleRef.current;
      const t = (z * s - camera.position.z) / point.z;
      return [(camera.position.x + point.x * t) / s, (camera.position.y + point.y * t) / s, z];
    };
    const move = (event: PointerEvent): void => {
      const current = drag.current;
      if (!current || event.pointerId !== current.id) return;
      if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) > TAP_SLOP) current.moved = true;
      const body = bodies.current[current.index];
      if (current.moved && body) {
        body.grab(toCardUnits(event.clientX, event.clientY, body.spec.z));
        invalidate();
      }
    };
    const end = (event: PointerEvent): void => {
      const current = drag.current;
      if (!current || event.pointerId !== current.id) return;
      const body = bodies.current[current.index];
      const tap = !current.moved && event.type === "pointerup" && performance.now() - current.at < TAP_MS;
      if (tap) body?.flip();
      body?.release();
      drag.current = null;
      get().gl.domElement.style.cursor = "";
      invalidate();
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [get, invalidate]);

  const tilt = useRef(new Quaternion());
  const turn = useRef(new Quaternion());
  const basis = useRef({ matrix: new Matrix4(), right: new Vector3(), forward: new Vector3() });
  const up = useRef(new Vector3());

  useFrame((state, delta) => {
    if (!control.visible || !art) return;
    const dt = Math.min(delta, 1 / 20);
    const time = clock.current;
    if (control.entered) time.time += dt;
    time.accumulator += dt;
    let steps = 0;
    while (time.accumulator >= tune.stepS && steps < 12) {
      for (const body of bodies.current) {
        if (control.entered) body.releaseIfDue(time.time);
        if (body.released && !body.asleep) body.step();
      }
      time.accumulator -= tune.stepS;
      steps++;
    }
    if (steps === 12) time.accumulator = 0;

    bodies.current.forEach((body, index) => {
      const card = cards.current[index];
      if (!card) return;
      const { pos, clip, centre } = body;
      up.current.set(pos[clip * 3] - pos[centre * 3], pos[clip * 3 + 1] - pos[centre * 3 + 1], pos[clip * 3 + 2] - pos[centre * 3 + 2]).normalize();
      // Tilt the card to its strap while its print keeps facing the viewer: even swinging
      // upside down past the rail (the drop) it turns in the screen's plane, never shows its back.
      const { matrix, right, forward } = basis.current;
      forward.copy(TOWARDS_VIEWER).addScaledVector(up.current, -up.current.z);
      if (forward.lengthSq() < 1e-6) forward.set(0, -1, 0);
      forward.normalize();
      right.crossVectors(up.current, forward);
      tilt.current.setFromRotationMatrix(matrix.makeBasis(right, up.current, forward));
      turn.current.setFromAxisAngle(up.current, body.twist);
      card.quaternion.multiplyQuaternions(turn.current, tilt.current);
      card.position.set(pos[centre * 3], pos[centre * 3 + 1], pos[centre * 3 + 2]);
      ribbons[index].update(pos, body.strands[0], body.twist);
    });

    const moving = control.entered && bodies.current.some((body) => !body.released || !body.asleep);
    if (moving) state.invalidate();
  });

  const press = (index: number) => (event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation();
    drag.current = { index, id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now(), moved: false };
    get().gl.domElement.style.cursor = "grabbing";
    bodies.current[index]?.wake();
    invalidate();
  };

  // A cursor brushing across a card gives it a little of its speed.
  const sweep = (index: number) => (event: ThreeEvent<PointerEvent>): void => {
    if (drag.current || event.pointerType !== "mouse") return;
    const now = performance.now();
    const last = brush.current;
    const elapsed = (now - last.at) / 1000;
    if (elapsed > 0 && elapsed < 0.1) {
      const s = scaleRef.current;
      bodies.current[index]?.push(((event.point.x - last.x) / elapsed / s) * tune.brushImpulse, ((event.point.y - last.y) / elapsed / s) * tune.brushImpulse);
      invalidate();
    }
    brush.current = { x: event.point.x, y: event.point.y, at: now };
  };

  if (!art) return null;
  const shadowSize = tier === "high" ? 2048 : 1024;
  const reach = Math.max(viewport.width, viewport.height) * 0.75;

  return (
    <>
      <directionalLight
        position={[-viewport.width * 0.35, viewport.height * 0.9, 12]}
        intensity={KEY_LIGHT}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-near={1}
        shadow-camera-far={40}
      />
      <group scale={scale}>
        {/* The wall behind: invisible except for the cards' soft shadows. */}
        <mesh position={[0, 0, -0.8]} receiveShadow>
          <planeGeometry args={[stageWidth + 4, stageHeight + 4]} />
          <shadowMaterial opacity={0.14} />
        </mesh>
        <mesh position={[0, railY, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.metal} castShadow>
          <cylinderGeometry args={[0.035, 0.035, stageWidth + 0.4, 16]} />
        </mesh>

        {team.map((member, index) => (
          <group key={member.name}>
            <mesh geometry={ribbons[index].geometry} material={materials.strap} castShadow frustumCulled={false} />
            <group
              ref={(node) => {
                cards.current[index] = node;
              }}
              onPointerDown={press(index)}
              onPointerMove={sweep(index)}
              onPointerOver={() => {
                if (!drag.current) get().gl.domElement.style.cursor = "grab";
              }}
              onPointerOut={() => {
                if (!drag.current) get().gl.domElement.style.cursor = "";
              }}
            >
              <mesh geometry={geometry.body} material={materials.body} castShadow />
              <mesh geometry={geometry.face} position={[0, 0, geometry.faceOffset]}>
                <meshPhysicalMaterial {...PRINT} map={art.fronts[index]} emissiveMap={art.fronts[index]} />
              </mesh>
              <mesh geometry={geometry.face} position={[0, 0, -geometry.faceOffset]} rotation={[0, Math.PI, 0]}>
                <meshPhysicalMaterial {...PRINT} map={art.backs[index]} emissiveMap={art.backs[index]} />
              </mesh>
              <mesh geometry={geometry.ring} material={materials.metal} position={[0, CARD.height / 2 - 0.01, 0]} rotation={[0, Math.PI / 2, 0]} castShadow />
              <mesh geometry={geometry.swivel} material={materials.metal} position={[0, CARD.height / 2 + 0.1025, 0]} castShadow />
            </group>
          </group>
        ))}
      </group>
    </>
  );
}
