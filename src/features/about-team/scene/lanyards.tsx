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
import { STRAP_WIDTH, StrapRibbon } from "./strap-ribbon";

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
  return Math.min(width * 0.44, height * 0.2);
}

/** A press that moves less than this (px) and lasts less than TAP_MS flips the card. */
const TAP_SLOP = 6;
const TAP_MS = 350;
/** The rail sits just inside the stage's top edge. */
const RAIL_INSET = 0.12;

const TOWARDS_VIEWER = new Vector3(0, 0, 1);
/*
 * How the print is lit. Printed surfaces carry their exact colours (emissive, no diffuse
 * term), so photos and type are never washed out or blown past white. Realism comes on top:
 * each face dims a little as it turns away from the key light (PRINT_SHADE), and a soft
 * clear coat (the laminate) catches the key light and the studio as a gentle sheen.
 */
const PRINT_SHADE = { lit: 1, away: 0.8 } as const;
const KEY_LIGHT = 1.4;
const LAMINATE = {
  color: "#000000",
  emissive: "#ffffff",
  emissiveIntensity: PRINT_SHADE.lit,
  roughness: 1,
  specularIntensity: 0,
  clearcoat: 0.22,
  clearcoatRoughness: 0.32,
  envMapIntensity: 0.6,
} as const;
/** Direction the key light comes from (upper left, in front), for the per-frame face shading. */
const KEY_DIRECTION = new Vector3(-0.3, 0.55, 1).normalize();

/* One texel per screen pixel: the card's on-screen width x device pixel ratio, in steps. */
function printResolution(widthPx: number, designWidth: number, dpr: number): number {
  return Math.min(2.4, Math.max(0.5, Math.ceil(((widthPx * dpr) / designWidth) * 10) / 10));
}

function useMaterials(): { body: MeshPhysicalMaterial; metal: MeshStandardMaterial; strap: MeshStandardMaterial } {
  const [materials] = useState(() => ({
    // White PVC edge: off-white so the card's thickness reads against its face.
    body: new MeshPhysicalMaterial({ ...LAMINATE, emissive: "#e9e9e9" }),
    // Polished steel: reflections from the studio do all the work.
    metal: new MeshStandardMaterial({ color: "#e4e4e4", metalness: 1, roughness: 0.22, envMapIntensity: 2.2 }),
    // Woven strap: matte fabric, its print in exact colours, slightly dimmer than the card.
    strap: new MeshStandardMaterial({ color: "#000000", emissive: "#ffffff", emissiveIntensity: 0.94, roughness: 1, side: DoubleSide }),
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
  const faces = useRef<(MeshPhysicalMaterial | null)[][]>([]);
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

  // Re-hang the cards when the stage changes size or the artwork arrives: they drop in if the
  // visitor hasn't reached them yet; otherwise (the HTML cards are showing) they cross-fade
  // in already hanging at rest.
  const artReady = art !== null;
  useLayoutEffect(() => {
    const drop = !control.entered;
    bodies.current = layoutLanyards(team.length, stageWidth, stageHeight, railY, drop).map((spec) => new LanyardBody(spec, drop));
    invalidate();
  }, [team.length, stageWidth, stageHeight, railY, control, invalidate, artReady]);

  // Print the cards at the size they are shown at (redrawn if the card size changes).
  const dpr = useThree((state) => state.viewport.dpr);
  const resolution = printResolution(cardPx, 640, dpr);
  const strapResolution = printResolution(cardPx * STRAP_WIDTH, 64, dpr);
  useEffect(() => {
    let cancelled = false;
    let created: CardArt | null = null;
    const anisotropy = get().gl.capabilities.getMaxAnisotropy();
    void createCardArt(team, anisotropy, resolution, strapResolution).then((result) => {
      if (cancelled) return result.dispose();
      created = result;
      materials.strap.emissiveMap = result.strap;
      materials.strap.needsUpdate = true;
      setArt(result);
    });
    return () => {
      cancelled = true;
      created?.dispose();
    };
  }, [team, get, materials, resolution, strapResolution]);

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
  const faceNormal = useRef(new Vector3());
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
      // Each face dims a touch as it turns from the key light, like real print under one lamp.
      const facing = faceNormal.current.copy(TOWARDS_VIEWER).applyQuaternion(card.quaternion).dot(KEY_DIRECTION);
      const [front, back] = faces.current[index] ?? [];
      const span = PRINT_SHADE.lit - PRINT_SHADE.away;
      if (front) front.emissiveIntensity = PRINT_SHADE.away + span * Math.max(0, facing);
      if (back) back.emissiveIntensity = PRINT_SHADE.away + span * Math.max(0, -facing);
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
                <meshPhysicalMaterial
                  ref={(material: MeshPhysicalMaterial | null) => {
                    (faces.current[index] ??= [null, null])[0] = material;
                  }}
                  {...LAMINATE}
                  emissiveMap={art.fronts[index]}
                />
              </mesh>
              <mesh geometry={geometry.face} position={[0, 0, -geometry.faceOffset]} rotation={[0, Math.PI, 0]}>
                <meshPhysicalMaterial
                  ref={(material: MeshPhysicalMaterial | null) => {
                    (faces.current[index] ??= [null, null])[1] = material;
                  }}
                  {...LAMINATE}
                  emissiveMap={art.backs[index]}
                />
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
