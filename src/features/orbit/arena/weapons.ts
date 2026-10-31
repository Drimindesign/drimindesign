import type * as Three from "three";

/*
 * Real steel for the fighters, modelled to life size: a longsword (diamond-section blade with a
 * fuller, tapering to the point, crossguard, leather grip, pommel), a heavier greatsword for the
 * brute, and a heater shield for the knights. Bright polished steel takes its look from the
 * scene: the fire's orange, the moon's blue, the yard's dark.
 */

/** Blade, grip and guard proportions (m) for each weapon. */
const SWORDS = {
  longsword: { blade: 0.95, width: 0.05, grip: 0.24, guard: 0.22 },
  greatsword: { blade: 1.2, width: 0.065, grip: 0.34, guard: 0.32 },
} as const;
export type SwordKind = keyof typeof SWORDS;

const STEEL = { color: 0xc4c8ce, roughness: 0.22, metalness: 1 } as const;
const IRON = { color: 0x55524f, roughness: 0.45, metalness: 0.9 } as const;
const LEATHER = { color: 0x3b2417, roughness: 0.85, metalness: 0 } as const;

/** A sword with its grip centred on the origin and the blade along +Y. */
export function makeSword(THREE: typeof Three, kind: SwordKind): Three.Group {
  const s = SWORDS[kind];
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial(STEEL);
  const iron = new THREE.MeshStandardMaterial(IRON);
  const leather = new THREE.MeshStandardMaterial(LEATHER);

  // Blade: a lozenge cross-section (thin edges, thicker spine) narrowing to a point.
  const half = s.width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(-half * 0.92, s.blade * 0.72);
  shape.quadraticCurveTo(-half * 0.7, s.blade * 0.94, 0, s.blade);
  shape.quadraticCurveTo(half * 0.7, s.blade * 0.94, half * 0.92, s.blade * 0.72);
  shape.lineTo(half, 0);
  shape.closePath();
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.0035, bevelSize: half * 0.55, bevelSegments: 1, curveSegments: 6 });
  blade.translate(0, 0, -0.001);
  const bladeMesh = new THREE.Mesh(blade, steel);
  bladeMesh.position.y = s.grip / 2 + 0.02;
  group.add(bladeMesh);

  // Crossguard, grip wrapped in leather, and a disc pommel.
  const guard = new THREE.Mesh(new THREE.BoxGeometry(s.guard, 0.022, 0.03), iron);
  guard.position.y = s.grip / 2 + 0.01;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, s.grip, 10), leather);
  const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 14), iron);
  pommel.rotation.x = Math.PI / 2;
  pommel.position.y = -s.grip / 2 - 0.016;
  group.add(guard, grip, pommel);
  group.traverse((node) => {
    const mesh = node as Three.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  return group;
}

/** A heater shield (flat top, curving to a point), its face toward +Z, with an iron rim and boss. */
export function makeShield(THREE: typeof Three): Three.Group {
  const group = new THREE.Group();
  // A real heater shield: about 46 cm across, 56 cm tall.
  const w = 0.23;
  const h = 0.52;
  const shape = new THREE.Shape();
  shape.moveTo(-w, h * 0.45);
  shape.lineTo(w, h * 0.45);
  shape.lineTo(w, 0);
  shape.quadraticCurveTo(w * 0.9, -h * 0.4, 0, -h * 0.55);
  shape.quadraticCurveTo(-w * 0.9, -h * 0.4, -w, 0);
  shape.closePath();
  const face = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 }),
    new THREE.MeshStandardMaterial({ color: 0x5a1712, roughness: 0.7, metalness: 0.1 }),
  );
  const rim = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.02, bevelSegments: 1, curveSegments: 10 }),
    new THREE.MeshStandardMaterial(IRON),
  );
  rim.position.z = -0.002;
  rim.scale.setScalar(1.02);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial(STEEL));
  boss.rotation.x = Math.PI / 2;
  boss.position.set(0, 0.04, 0.03);
  group.add(rim, face, boss);
  group.traverse((node) => {
    const mesh = node as Three.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  return group;
}

/** A leather scabbard with a steel chape, its mouth at the origin, running down -Y. */
export function makeScabbard(THREE: typeof Three, kind: SwordKind): Three.Group {
  const s = SWORDS[kind];
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, s.blade + 0.04, 10), new THREE.MeshStandardMaterial({ color: 0x2b1810, roughness: 0.7 }));
  body.scale.z = 0.45;
  body.position.y = -(s.blade + 0.04) / 2;
  const chape = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.07, 10), new THREE.MeshStandardMaterial(IRON));
  chape.rotation.x = Math.PI;
  chape.scale.z = 0.45;
  chape.position.y = -s.blade - 0.06;
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.04, 10), new THREE.MeshStandardMaterial(IRON));
  throat.scale.z = 0.5;
  group.add(body, chape, throat);
  group.traverse((node) => {
    const mesh = node as Three.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  return group;
}

/**
 * Where a sheathed sword sits on the left hip (in the hips bone's own frame, worked out with the
 * body in its bind pose, facing +Z): hilt up and a little forward, blade down and back.
 */
export function hipMount(THREE: typeof Three, hips: Three.Object3D): { position: Three.Vector3; quaternion: Three.Quaternion; scale: Three.Vector3 } {
  hips.updateWorldMatrix(true, false);
  const hipsWorld = hips.matrixWorld.clone();
  const at = new THREE.Vector3().setFromMatrixPosition(hipsWorld).add(new THREE.Vector3(0.17, 0.02, 0.07));
  const blade = new THREE.Vector3(0, -0.92, -0.38).normalize();
  const desired = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), blade), new THREE.Vector3(1, 1, 1));
  const local = hipsWorld.invert().multiply(desired);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  local.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

/**
 * Puts a weapon in a hand (with the body in its bind pose): a sword's blade runs along the
 * hand's thumb axis out of the fist; a shield sits on the forearm side of the hand.
 */
export function holdWeapon(THREE: typeof Three, hand: Three.Object3D, weapon: Three.Object3D, shield: boolean): void {
  hand.updateWorldMatrix(true, false);
  const handQ = hand.getWorldQuaternion(new THREE.Quaternion());
  const toHand = handQ.clone().invert();
  const handScale = hand.getWorldScale(new THREE.Vector3()).x;
  const thumb = new THREE.Vector3(0, 0, 1).applyQuaternion(toHand);
  if (shield) {
    // Strapped to the forearm (bind pose: arms out, palms down): the face looks out of the back of
    // the hand (up), the top of the shield runs toward the fingers (out along the left arm).
    const face = new THREE.Vector3(0, 1, 0).applyQuaternion(toHand).normalize();
    const top = new THREE.Vector3(1, 0, 0).applyQuaternion(toHand).normalize();
    const side = new THREE.Vector3().crossVectors(top, face).normalize();
    weapon.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, top, face));
    weapon.position.copy(face).multiplyScalar(0.07 / handScale).addScaledVector(top, -0.1 / handScale);
  } else {
    weapon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), thumb);
    weapon.position.set(0, 0.085 / handScale, 0.01 / handScale);
  }
  weapon.scale.setScalar(1 / handScale);
  hand.add(weapon);
}
