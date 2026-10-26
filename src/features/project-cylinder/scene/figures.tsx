"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, type Group, MeshBasicMaterial } from "three";
import { damp } from "@/lib/motion/damp";
import type { CylinderStore } from "../store";
import { createFigureRig, createRigGeometries } from "./figure-rig";
import { applyPose, faceCamera, idlePose, listen, lookUp, pocketArms, speakerWeight, talk, walk } from "./figure-motion";
import type { StagePalette } from "./palette";
import { Stroller } from "./stroller";
import { createCastShadowTexture, createSoftShadowTexture } from "./textures";

interface FiguresProps {
  ringRadius: number;
  /** Number of distinct projects, to read the ring's turning speed from scroll. */
  projects: number;
  store: CylinderStore;
  palette: StagePalette;
}

/*
 * People in front of the ring, for scale and life: a pair on the right in conversation
 * (taking turns to talk, nodding, shifting their weight) and a stroller on the left who
 * walks, stops to look up at the screen and walks back. When the ring turns, everyone
 * looks up and one of the pair points at it. Animated at ~30 fps only while the section is
 * on screen; static under reduced motion. Positions: x across, z in front of the band.
 */
const PAIR = [
  { x: 2.28, z: 0.8, height: 0.95, facing: 1, seed: 0.0 },
  { x: 2.94, z: 0.66, height: 0.9, facing: -1, seed: 2.1 },
] as const;
const STROLL = { z: 0.55, height: 0.92, from: -3.6, to: -2.05 } as const;
const CAST_LENGTH = 1.1;
const FRAME_MS = 1000 / 30;
/** Seconds each of the pair talks before handing over. */
const TURN = 7;

export function Figures({ ringRadius, projects, store, palette }: FiguresProps): React.ReactElement {
  const invalidate = useThree((state) => state.invalidate);
  const strollRef = useRef<Group>(null);
  const castRef = useRef<Group>(null);
  const motion = useRef({ t: 0, watch: 0, lastRotate: store.rotate, timer: 0 });

  const geometries = useMemo(() => createRigGeometries(), []);
  const material = useMemo(() => new MeshBasicMaterial({ color: new Color(palette.figure) }), [palette.figure]);
  const rigs = useMemo(
    () => ({
      pair: PAIR.map((person) => createFigureRig(geometries, material, person.height)),
      stroller: createFigureRig(geometries, material, STROLL.height),
    }),
    [geometries, material],
  );
  const stroller = useMemo(
    () => new Stroller({ from: STROLL.from, to: STROLL.to, speed: 0.36, stride: 0.66, pause: 5 }),
    [],
  );
  const shadow = useMemo(() => createSoftShadowTexture(), []);
  const cast = useMemo(() => createCastShadowTexture(), []);

  useEffect(
    () => () => {
      window.clearTimeout(motion.current.timer);
      geometries.dispose();
      material.dispose();
      shadow.dispose();
      cast.dispose();
    },
    [geometries, material, shadow, cast],
  );

  useFrame(({ camera }, delta) => {
    const m = motion.current;
    const animate = store.visible && !store.reducedMotion;
    const dt = animate ? Math.min(delta, 0.1) : 0;
    m.t += dt;

    // How fast the ring is turning, eased: rises quickly, lingers as it settles.
    const turnRate = dt > 0 ? (Math.abs(store.rotate - m.lastRotate) * Math.max(1, projects - 1)) / dt : 0;
    m.lastRotate = store.rotate;
    const watchTarget = Math.min(1, turnRate / 1.2);
    m.watch = damp(m.watch, watchTarget, watchTarget > m.watch ? 3 : 0.9, dt);

    const speakerA = speakerWeight(m.t, TURN);
    rigs.pair.forEach((rig, index) => {
      const person = PAIR[index];
      const speaking = index === 0 ? speakerA : 1 - speakerA;
      let pose = idlePose(m.t, person.seed);
      if (index === 1) pose = pocketArms(pose);
      pose = listen(talk(pose, m.t, speaking * (1 - m.watch)), m.t + person.seed, 1 - speaking);
      pose = lookUp(pose, m.watch, index === 0 ? 1 : 0);
      applyPose(rig, pose, person.facing);
    });

    const s = stroller.update(dt, m.watch);
    applyPose(rigs.stroller, lookUp(walk(idlePose(m.t, 4.2), s.phase, s.walking), s.look), s.facing);
    if (strollRef.current) strollRef.current.position.x = s.x;
    if (castRef.current) castRef.current.rotation.y = Math.atan2(s.x, ringRadius + STROLL.z);

    for (const rig of [...rigs.pair, rigs.stroller]) faceCamera(rig, camera.position);

    if (animate && !m.timer) {
      m.timer = window.setTimeout(() => {
        m.timer = 0;
        invalidate();
      }, FRAME_MS);
    }
  });

  const people = [
    ...PAIR.map((person, index) => ({ ...person, rig: rigs.pair[index], key: `pair-${index}` })),
    { x: STROLL.from, z: STROLL.z, height: STROLL.height, rig: rigs.stroller, key: "stroller" },
  ];

  return (
    <>
      {people.map(({ x, z, height, rig, key }) => {
        const isStroller = key === "stroller";
        return (
          <group key={key} ref={isStroller ? strollRef : undefined} position={[x, 0, ringRadius + z]}>
            <primitive object={rig.root} />
            {/* Contact shadow under the feet. */}
            <mesh rotation-x={-Math.PI / 2} position-y={0.005} renderOrder={1}>
              <planeGeometry args={[height * 0.42, height * 0.2]} />
              <meshBasicMaterial color="#000000" alphaMap={shadow} transparent depthWrite={false} opacity={0.7} />
            </mesh>
            {/* Cast shadow, pointing away from the glowing ring behind them. */}
            <group
              ref={isStroller ? castRef : undefined}
              rotation-y={Math.atan2(x, ringRadius + z)}
            >
              <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, (height * CAST_LENGTH) / 2]} renderOrder={1}>
                <planeGeometry args={[height * 0.45, height * CAST_LENGTH]} />
                <meshBasicMaterial color="#000000" alphaMap={cast} transparent depthWrite={false} opacity={0.55} />
              </mesh>
            </group>
          </group>
        );
      })}
    </>
  );
}
