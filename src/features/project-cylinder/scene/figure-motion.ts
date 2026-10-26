import { MathUtils, type Vector3 } from "three";
import type { FigureRig } from "./figure-rig";

/*
 * Body language for the figures, as pure functions of time. Everything is slow and eased:
 * breathing, a weight shift every few seconds, gestures that rise, hover and settle. Angles
 * are radians about each joint (see figure-rig.ts for the sign convention).
 */

export interface Pose {
  hipsX: number;
  hipsY: number;
  hipsTilt: number;
  chestTilt: number;
  breath: number;
  head: number;
  armNear: [number, number];
  armFar: [number, number];
  legNear: [number, number];
  legFar: [number, number];
}

const lerp = MathUtils.lerp;

/** Standing at ease: breathing, a slow sway of weight from foot to foot, small head drift. */
export function idlePose(t: number, seed: number): Pose {
  const sway = Math.sin(t * 0.34 + seed);
  return {
    hipsX: 0.006 * sway,
    hipsY: 0,
    hipsTilt: 0.012 * sway,
    chestTilt: -0.008 * sway,
    breath: 0.012 * Math.sin(t * 1.45 + seed * 3),
    head: 0.025 * Math.sin(t * 0.5 + seed * 2),
    armNear: [0.05 + 0.02 * Math.sin(t * 0.7 + seed), 0.14],
    armFar: [0.02 - 0.015 * Math.sin(t * 0.7 + seed), 0.12],
    legNear: [0.035 * sway, -0.03 - 0.02 * Math.max(0, -sway)],
    legFar: [-0.03 * sway, -0.03 - 0.02 * Math.max(0, sway)],
  };
}

/** Hands resting in coat pockets. */
export function pocketArms(pose: Pose): Pose {
  return { ...pose, armNear: [-0.1, 0.62], armFar: [-0.12, 0.58] };
}

/*
 * Talking: the speaker lifts the near forearm and gestures in small loops, leans in a touch
 * and nods on their words. `speaking` (0…1) blends it in and out.
 */
export function talk(pose: Pose, t: number, speaking: number): Pose {
  if (speaking <= 0) return pose;
  const s = speaking;
  return {
    ...pose,
    chestTilt: pose.chestTilt - 0.035 * s,
    head: pose.head + s * 0.045 * Math.sin(t * 2.7),
    armNear: [
      lerp(pose.armNear[0], 0.42 + 0.14 * Math.sin(t * 1.6), s),
      lerp(pose.armNear[1], 1.2 + 0.28 * Math.sin(t * 2.3 + 1), s),
    ],
    armFar: [lerp(pose.armFar[0], 0.12 + 0.05 * Math.sin(t * 1.2), s * 0.6), pose.armFar[1]],
  };
}

/** Listening: slow, occasional nods while the other one talks. */
export function listen(pose: Pose, t: number, listening: number): Pose {
  if (listening <= 0) return pose;
  const nod = Math.max(0, Math.sin(t * 1.25)) ** 3;
  return { ...pose, head: pose.head + listening * 0.09 * nod };
}

/*
 * Looking up at the ring as it turns: head tilts back, shoulders open. With `point` the near
 * arm also rises toward the screen.
 */
export function lookUp(pose: Pose, look: number, point = 0): Pose {
  if (look <= 0) return pose;
  const p = point * look;
  return {
    ...pose,
    head: lerp(pose.head, -0.34, look),
    chestTilt: pose.chestTilt + 0.05 * look,
    armNear: [lerp(pose.armNear[0], 2.15, p), lerp(pose.armNear[1], 0.18, p)],
  };
}

/*
 * Walking cycle at `phase` (radians, one cycle = two steps), blended by `amount` (0…1):
 * opposite arm and leg swing, the swinging knee bends, the hips rise and fall twice per cycle.
 */
export function walk(pose: Pose, phase: number, amount: number): Pose {
  if (amount <= 0) return pose;
  const a = amount;
  const swing = Math.sin(phase);
  const kneeNear = -0.7 * Math.max(0, Math.cos(phase)) ** 1.5;
  const kneeFar = -0.7 * Math.max(0, -Math.cos(phase)) ** 1.5;
  return {
    ...pose,
    hipsY: pose.hipsY + a * 0.012 * Math.cos(phase * 2),
    chestTilt: pose.chestTilt - 0.03 * a,
    legNear: [lerp(pose.legNear[0], 0.42 * swing, a), lerp(pose.legNear[1], kneeNear - 0.05, a)],
    legFar: [lerp(pose.legFar[0], -0.42 * swing, a), lerp(pose.legFar[1], kneeFar - 0.05, a)],
    armNear: [lerp(pose.armNear[0], -0.32 * swing, a), lerp(pose.armNear[1], 0.22, a)],
    armFar: [lerp(pose.armFar[0], 0.32 * swing, a), lerp(pose.armFar[1], 0.22, a)],
  };
}

/** Writes a pose to the rig; `facing` (−1…1) mirrors the profile to face left or right. */
export function applyPose(rig: FigureRig, pose: Pose, facing: number): void {
  rig.root.scale.x = facing;
  rig.hips.position.x = pose.hipsX;
  rig.hips.position.y = 0.52 + pose.hipsY;
  rig.hips.rotation.z = pose.hipsTilt;
  rig.chest.rotation.z = pose.chestTilt;
  rig.chest.scale.y = 1 + pose.breath;
  rig.head.rotation.z = pose.head;
  rig.armNear.upper.rotation.z = pose.armNear[0];
  rig.armNear.lower.rotation.z = pose.armNear[1];
  rig.armFar.upper.rotation.z = pose.armFar[0];
  rig.armFar.lower.rotation.z = pose.armFar[1];
  rig.legNear.upper.rotation.z = pose.legNear[0];
  rig.legNear.lower.rotation.z = pose.legNear[1];
  rig.legFar.upper.rotation.z = pose.legFar[0];
  rig.legFar.lower.rotation.z = pose.legFar[1];
}

/* Turns the silhouette's plane to the camera, about Y only, so the figure stays upright. */
export function faceCamera(rig: FigureRig, camera: Vector3): void {
  const parent = rig.root.parent;
  if (!parent) return;
  rig.root.rotation.y = Math.atan2(camera.x - parent.position.x, camera.z - parent.position.z);
}

/** Who is talking: alternates every `turn` seconds, with a soft hand-over. */
export function speakerWeight(t: number, turn: number): number {
  return MathUtils.smoothstep(Math.sin((Math.PI * t) / turn), -0.3, 0.3);
}
