"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BackSide, Color, FrontSide, type Group, MeshBasicMaterial, SRGBColorSpace, TextureLoader } from "three";
import { projectImageUrl, type Project, type ProjectImageWidth } from "@/content/projects";
import type { DeviceTier } from "@/lib/device/use-device-tier";
import { cylinder } from "@/lib/motion/tokens";
import { stepSpring, type SpringState } from "@/lib/motion/spring";
import { ringTurn } from "../choreography";
import type { CylinderStore } from "../store";
import { bentPanelGeometry, fogRange, RING_BASE, PANEL_HEIGHT, type RingDimensions } from "./dimensions";
import { averageColor, createSpillGeometry, createSpillMaterial } from "./light-spill";

interface RingProps {
  projects: readonly Project[];
  dimensions: RingDimensions;
  tier: DeviceTier;
  store: CylinderStore;
}

const IMAGE_WIDTH: Record<DeviceTier, ProjectImageWidth> = { high: 1400, medium: 1000, low: 700 };
const SEGMENTS: Record<DeviceTier, number> = { high: 48, medium: 32, low: 20 };
/* Panels glow like screens: unlit, a touch below full white so highlights don't clip. */
const OUTER_TINT = new Color(0.94, 0.94, 0.94);
/* The inside of the band is in its own shade: same images, dimmer and slightly warm. */
const INNER_TINT = new Color(0.42, 0.39, 0.37);
const PLACEHOLDER = new Color("#d42600");

/*
 * The ring: a thin, open band of project panels standing upright, turning about Y. Each panel
 * is drawn twice from one bent plane: bright on the outside, dim on the inside, so looking
 * down into the ring shows the far wall in shadow. Each panel also lights the floor in front
 * of it in its own colour (light-spill.ts), which is what seats the band on the floor.
 * Scrolling turns the ring so the next project slides in from the right.
 */
export function Ring({ projects, dimensions, tier, store }: RingProps): React.ReactElement {
  const groupRef = useRef<Group>(null);
  const turn = useRef<SpringState | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const anisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const { radius, step, panels } = dimensions;

  const geometry = useMemo(() => bentPanelGeometry(radius, SEGMENTS[tier]), [radius, tier]);
  const spillGeometry = useMemo(() => createSpillGeometry(radius, step), [radius, step]);
  const materials = useMemo(
    () =>
      Array.from({ length: panels }, () => ({
        outer: new MeshBasicMaterial({ color: PLACEHOLDER, side: FrontSide }),
        inner: new MeshBasicMaterial({ color: PLACEHOLDER, side: BackSide }),
        spill: createSpillMaterial({ radius, step, fog: fogRange(radius) }),
      })),
    [panels, radius, step],
  );

  // Panels start as dim placeholders and receive their image as each one arrives.
  useEffect(() => {
    const loader = new TextureLoader();
    let cancelled = false;
    const loaded: { dispose(): void }[] = [];
    materials.forEach(({ outer, inner, spill }, index) => {
      const project = projects[index % projects.length];
      loader.load(projectImageUrl(project, IMAGE_WIDTH[tier]), (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = anisotropy;
        outer.map = texture;
        outer.color.copy(OUTER_TINT);
        inner.map = texture;
        inner.color.copy(INNER_TINT);
        outer.needsUpdate = true;
        inner.needsUpdate = true;
        (spill.uniforms.uColor.value as Color).copy(averageColor(texture));
        loaded.push(texture);
        invalidate();
      });
    });
    return () => {
      cancelled = true;
      loaded.forEach((texture) => texture.dispose());
    };
  }, [materials, projects, tier, anisotropy, invalidate]);

  useEffect(
    () => () => {
      geometry.dispose();
      spillGeometry.dispose();
      materials.forEach(({ outer, inner, spill }) => {
        outer.dispose();
        inner.dispose();
        spill.dispose();
      });
    },
    [geometry, spillGeometry, materials],
  );

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const target = ringTurn(store.enter, store.rotate, projects.length) * step;
    turn.current ??= { value: target, velocity: 0 };
    const spring = turn.current;
    if (store.reducedMotion) {
      spring.value = target;
      spring.velocity = 0;
    } else {
      stepSpring(spring, target, cylinder.ringSpring, Math.min(delta, 1 / 30));
    }
    // Negative turn: the ring moves right-to-left, bringing the next project in from the right.
    group.rotation.y = -spring.value;
    if (Math.abs(target - spring.value) > 1e-4 || Math.abs(spring.velocity) > 1e-4) invalidate();
  });

  return (
    <group ref={groupRef} position-y={RING_BASE + PANEL_HEIGHT / 2}>
      {materials.map(({ outer, inner, spill }, index) => (
        // Panel i sits i steps to the right; turning the ring by i·step brings it to the front.
        <group key={index} rotation-y={index * step}>
          <mesh geometry={geometry} material={outer} />
          <mesh geometry={geometry} material={inner} />
          <mesh
            geometry={spillGeometry}
            material={spill}
            rotation-x={-Math.PI / 2}
            position-y={-(RING_BASE + PANEL_HEIGHT / 2) + 0.002}
            renderOrder={1}
          />
        </group>
      ))}
    </group>
  );
}
