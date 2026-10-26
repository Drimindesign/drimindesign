import { Group, Mesh, type Material, Shape, ShapeGeometry } from "three";

/*
 * A person as a jointed, flat silhouette in profile, facing +X, built at unit height (feet at
 * y = 0, top of head ≈ 1) from vector shapes, so it stays crisp at any size. Joints are
 * groups whose rotation.z bends the limb: positive swings an arm or thigh forward and bends
 * an elbow up; knees bend with negative values. All parts share one material (a single
 * dark silhouette), so overlaps never show.
 */

export interface Limb {
  /** Shoulder or hip: swings the whole limb. */
  upper: Group;
  /** Elbow or knee: bends the lower half. */
  lower: Group;
}

export interface FigureRig {
  /** Placed on the floor; turned to face the camera; scale.x = facing (−1…1). */
  root: Group;
  hips: Group;
  chest: Group;
  head: Group;
  armNear: Limb;
  armFar: Limb;
  legNear: Limb;
  legFar: Limb;
}

/* Unit-height proportions (adult, head ≈ 1/7.5 of height). */
export const RIG = {
  hipY: 0.52,
  shoulderAboveHip: 0.29,
  neckAboveShoulder: 0.035,
  thigh: 0.24,
  shin: 0.255,
  upperArm: 0.16,
  forearm: 0.15,
} as const;

/** Rounded, tapered limb hanging from its pivot at (0, 0) down to (0, −length). */
function limbShape(length: number, topWidth: number, bottomWidth: number): Shape {
  const r0 = topWidth / 2;
  const r1 = bottomWidth / 2;
  const shape = new Shape();
  shape.moveTo(r0, 0);
  shape.lineTo(r1, -length);
  shape.absarc(0, -length, r1, 0, Math.PI, true);
  shape.lineTo(-r0, 0);
  shape.absarc(0, 0, r0, Math.PI, 0, true);
  return shape;
}

function ellipse(x: number, y: number, rx: number, ry: number): Shape {
  const shape = new Shape();
  shape.absellipse(x, y, rx, ry, 0, Math.PI * 2, false, 0);
  return shape;
}

/* Coat from the hips (pivot) to the shoulders, slightly fuller at the chest. */
function torsoShape(): Shape {
  const top = RIG.shoulderAboveHip;
  const shape = new Shape();
  shape.moveTo(-0.066, -0.07);
  shape.lineTo(-0.07, top - 0.02);
  shape.quadraticCurveTo(-0.06, top + 0.035, 0.0, top + 0.03);
  shape.quadraticCurveTo(0.058, top + 0.028, 0.066, top - 0.03);
  shape.quadraticCurveTo(0.082, top - 0.13, 0.064, 0.05);
  shape.lineTo(0.07, -0.07);
  shape.closePath();
  return shape;
}

/* Neck and head in profile (pivot at the base of the neck), with a hint of a nose. */
function headShapes(): Shape[] {
  const neck = new Shape();
  neck.moveTo(-0.02, -0.005);
  neck.lineTo(0.022, -0.005);
  neck.lineTo(0.02, 0.04);
  neck.lineTo(-0.018, 0.04);
  neck.closePath();
  const nose = new Shape();
  nose.moveTo(0.046, 0.085);
  nose.lineTo(0.064, 0.072);
  nose.lineTo(0.046, 0.062);
  nose.closePath();
  return [neck, ellipse(0.002, 0.08, 0.05, 0.064), nose];
}

export interface RigGeometries {
  torso: ShapeGeometry;
  head: ShapeGeometry;
  upperArm: ShapeGeometry;
  forearm: ShapeGeometry;
  thigh: ShapeGeometry;
  shin: ShapeGeometry;
  dispose(): void;
}

/** Shared by every figure. */
export function createRigGeometries(): RigGeometries {
  const geometries = {
    torso: new ShapeGeometry(torsoShape(), 6),
    head: new ShapeGeometry(headShapes(), 10),
    upperArm: new ShapeGeometry(limbShape(RIG.upperArm, 0.052, 0.044), 6),
    // Forearm with the hand at its end.
    forearm: new ShapeGeometry([limbShape(RIG.forearm, 0.044, 0.036), ellipse(0.004, -RIG.forearm - 0.02, 0.022, 0.028)], 6),
    thigh: new ShapeGeometry(limbShape(RIG.thigh, 0.078, 0.06), 6),
    // Shin with the foot pointing forward.
    shin: new ShapeGeometry([limbShape(RIG.shin, 0.058, 0.045), ellipse(0.03, -RIG.shin + 0.006, 0.05, 0.02)], 6),
  };
  return {
    ...geometries,
    dispose() {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
    },
  };
}

function limb(
  parent: Group,
  upperGeometry: ShapeGeometry,
  lowerGeometry: ShapeGeometry,
  length: number,
  material: Material,
  x: number,
  z: number,
): Limb {
  const upper = new Group();
  upper.position.set(x, 0, z);
  upper.add(new Mesh(upperGeometry, material));
  const lower = new Group();
  lower.position.y = -length;
  lower.add(new Mesh(lowerGeometry, material));
  upper.add(lower);
  parent.add(upper);
  return { upper, lower };
}

/*
 * Builds one figure of the given height. Depth offsets (z) order the far limbs behind the
 * body and the near limbs in front, as in a real profile view.
 */
export function createFigureRig(geometries: RigGeometries, material: Material, height: number): FigureRig {
  const root = new Group();
  const body = new Group();
  body.scale.setScalar(height);
  root.add(body);

  const hips = new Group();
  hips.position.y = RIG.hipY;
  body.add(hips);
  hips.add(new Mesh(geometries.torso, material));

  const chest = new Group();
  chest.position.y = RIG.shoulderAboveHip;
  hips.add(chest);

  const head = new Group();
  head.position.set(0.002, RIG.neckAboveShoulder, 0.001);
  head.add(new Mesh(geometries.head, material));
  chest.add(head);

  const legFar = limb(hips, geometries.thigh, geometries.shin, RIG.thigh, material, -0.01, -0.004);
  const legNear = limb(hips, geometries.thigh, geometries.shin, RIG.thigh, material, 0.01, 0.002);
  const armFar = limb(chest, geometries.upperArm, geometries.forearm, RIG.upperArm, material, -0.012, -0.006);
  const armNear = limb(chest, geometries.upperArm, geometries.forearm, RIG.upperArm, material, 0.004, 0.004);

  return { root, hips, chest, head, armNear, armFar, legNear, legFar };
}
