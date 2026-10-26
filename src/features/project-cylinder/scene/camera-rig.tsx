"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import { MathUtils, type PerspectiveCamera, Vector3 } from "three";
import { cylinder } from "@/lib/motion/tokens";
import { damp } from "@/lib/motion/damp";
import { stepSpring, type SpringState } from "@/lib/motion/spring";
import { descent } from "../choreography";
import type { CylinderStore } from "../store";
import { PANEL_HEIGHT, PANEL_WIDTH, RING_MID_Y, type RingDimensions } from "./dimensions";

interface CameraRigProps {
  dimensions: RingDimensions;
  store: CylinderStore;
}

/** Landed eye height: a standing person's eyes, just below the panel's middle. */
const EYE_Y = 1.15;
/** The landed view looks a touch below the ring's middle, so the camera tilts up slightly. */
const LOOK_Y = RING_MID_Y - 0.12;
/*
 * Landed framing: the fraction of the frame the front panel fills. Landscape screens put the
 * ring on the left (text column on the right), so the panel is narrower there; portrait
 * screens centre it and let it run almost edge to edge.
 */
const LANDED_WIDTH_FILL = { wide: 0.56, tall: 1.06 } as const;
const LANDED_HEIGHT_FILL = { wide: 0.72, tall: 0.78 } as const;
/** On landscape screens the ring's centre sits this far left of the frame's centre (fraction of width). */
const LEFT_SHIFT = 0.2;
/** At the start, the ring's diameter spans this fraction of the frame's width (at most). */
const START_WIDTH_FILL = 0.62;
const SETTLE_EPSILON = 1e-4;

/** 0 on portrait screens, 1 on landscape, blending across square-ish ones. */
function wideness(aspect: number): number {
  return MathUtils.smoothstep(aspect, 1, 1.4);
}

/*
 * Screen-space framing, applied as a projection offset (the camera path stays symmetric):
 *  - horizontal: moves the ring left on landscape screens, making room for the text column;
 *  - vertical: while the section scrolls in, only its top strip (enter × viewport height) is
 *    on screen, so the image shifts up by half the hidden height to keep the ring centred in
 *    that strip. Uses the raw scroll value (not the spring) to track the DOM frame for frame.
 */
function frameView(camera: PerspectiveCamera, width: number, height: number, enter: number): void {
  const offsetX = LEFT_SHIFT * wideness(width / height) * width;
  const offsetY = ((1 - enter) * height) / 2;
  if (offsetX < 0.5 && offsetY < 0.5) {
    if (camera.view?.enabled) camera.clearViewOffset();
    return;
  }
  camera.setViewOffset(width, height, offsetX, offsetY, width, height);
}

interface Pose {
  distance: number;
  elevation: number;
  azimuth: number;
}

/*
 * Cinematic descent. The camera orbits a point in the ring's middle: it starts high on a
 * diagonal, a little off-axis, looking down into the open ring; as the section scrolls in it
 * sweeps down and in to eye level, square to the front panel, which then fills the frame like
 * a wall. Distance, elevation and azimuth are interpolated in spherical space (so the path
 * is an arc, never a straight dolly), behind a critically damped spring for weight without
 * overshoot. Both ends are solved from the viewport, so every screen gets the same framing.
 */
export function CameraRig({ dimensions, store }: CameraRigProps): null {
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const spring = useRef<SpringState>({ value: 0, velocity: 0 });
  const pointer = useRef({ x: 0, y: 0, smoothX: 0, smoothY: 0 });
  const target = useRef(new Vector3(0, LOOK_Y, 0));
  const { radius } = dimensions;

  const poses = (camera: PerspectiveCamera): { start: Pose; end: Pose } => {
    const tanHalf = Math.tan(MathUtils.degToRad(camera.fov / 2));
    const wide = wideness(camera.aspect);
    const widthFill = MathUtils.lerp(LANDED_WIDTH_FILL.tall, LANDED_WIDTH_FILL.wide, wide);
    const heightFill = MathUtils.lerp(LANDED_HEIGHT_FILL.tall, LANDED_HEIGHT_FILL.wide, wide);
    const fromPanelH = PANEL_HEIGHT / heightFill / (2 * tanHalf);
    const fromPanelW = PANEL_WIDTH / widthFill / (2 * tanHalf * camera.aspect);
    const endFlat = radius + Math.max(fromPanelH, fromPanelW);
    const endDistance = Math.hypot(endFlat, EYE_Y - LOOK_Y);

    const fitRing = (2 * radius) / START_WIDTH_FILL / (2 * tanHalf * camera.aspect);
    const startDistance = Math.max(radius * 3.4, fitRing + radius * 0.5);

    return {
      start: {
        distance: startDistance,
        elevation: MathUtils.degToRad(cylinder.startElevationDeg),
        azimuth: MathUtils.degToRad(cylinder.startAzimuthDeg),
      },
      end: { distance: endDistance, elevation: Math.atan2(EYE_Y - LOOK_Y, endFlat), azimuth: 0 },
    };
  };

  const place = (camera: PerspectiveCamera, progress: number): void => {
    const { start, end } = poses(camera);
    const p = MathUtils.clamp(progress, 0, 1);
    // Pointer parallax only once landed, fading in over the end of the descent.
    const landed = MathUtils.smoothstep(p, 0.8, 1);
    const { smoothX, smoothY } = pointer.current;
    const distance = MathUtils.lerp(start.distance, end.distance, p);
    const elevation =
      MathUtils.lerp(start.elevation, end.elevation, p) -
      MathUtils.degToRad(cylinder.parallaxPitchDeg) * smoothY * landed;
    const azimuth =
      MathUtils.lerp(start.azimuth, end.azimuth, p) + MathUtils.degToRad(cylinder.parallaxYawDeg) * smoothX * landed;

    const flat = distance * Math.cos(elevation);
    camera.position.set(
      flat * Math.sin(azimuth),
      LOOK_Y + distance * Math.sin(elevation),
      flat * Math.cos(azimuth),
    );
    camera.lookAt(target.current);
  };

  // Place the camera before the first frame so it never flashes from its default position.
  useLayoutEffect(() => {
    const start = store.reducedMotion ? 1 : descent(store.enter);
    spring.current = { value: start, velocity: 0 };
    place(get().camera as PerspectiveCamera, start);
    invalidate();
    // Initial placement only; per-frame updates happen in useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get]);

  useEffect(() => {
    if (store.reducedMotion || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const onPointerMove = (event: PointerEvent): void => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1;
      invalidate();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [store, invalidate]);

  useFrame((frame, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const goal = store.reducedMotion ? 1 : descent(store.enter);
    const state = spring.current;
    if (store.reducedMotion) {
      state.value = goal;
      state.velocity = 0;
    } else {
      stepSpring(state, goal, cylinder.cameraSpring, dt);
    }
    const p = pointer.current;
    p.smoothX = damp(p.smoothX, p.x, cylinder.parallaxLambda, dt);
    p.smoothY = damp(p.smoothY, p.y, cylinder.parallaxLambda, dt);

    place(frame.camera as PerspectiveCamera, state.value);
    frameView(frame.camera as PerspectiveCamera, frame.size.width, frame.size.height, store.enter);

    const moving =
      Math.abs(goal - state.value) > SETTLE_EPSILON ||
      Math.abs(state.velocity) > SETTLE_EPSILON ||
      Math.abs(p.x - p.smoothX) > 1e-3 ||
      Math.abs(p.y - p.smoothY) > 1e-3;
    if (moving) invalidate();
  });

  return null;
}
