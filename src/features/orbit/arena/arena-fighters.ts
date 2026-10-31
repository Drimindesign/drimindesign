import type * as Three from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

/*
 * The fighters in the arena: the full Mixamo characters with their colour and surface-detail
 * maps, lit physically (the set's light probe, the deck lamp, the moon) and casting real shadows.
 * Alive while standing: the idle clip breathes and shifts weight, and the head and neck turn to
 * keep the opponent in view, the way a fighter never takes their eyes off the other.
 */

const CLIPS = "/game/fighters/";
const bone = (name: string): string => `mixamorig${name}`;
/** How far (radians) the neck and head turn to follow the opponent, and how quickly (1/s). */
const LOOK = { neck: 0.35, head: 0.6, limit: 1.0, rate: 4 } as const;
/** Skin and cloth are matte; the knight's plate has a dull metal sheen. */
const SURFACE = { hero: { roughness: 0.72, metalness: 0 }, knight: { roughness: 0.48, metalness: 0.35 } } as const;
const HEIGHT = { hero: 1.75, knight: 1.9 } as const;

export type FighterKind = keyof typeof HEIGHT;

export interface ArenaFighter {
  root: Three.Group;
  mixer: Three.AnimationMixer;
  /** Plays a clip by its file name (crossfading from the current one). */
  play(name: string, fade?: number): void;
  /** Steps the animation, then turns the head toward `target` (world point). */
  update(dt: number, target: Three.Vector3 | null): void;
  dispose(): void;
}

/* A clip from its file with the hips' travel removed (the fight moves the root itself). */
function inPlace(gltf: GLTF, name: string): Three.AnimationClip | null {
  const clip = gltf.animations[0];
  if (!clip) return null;
  clip.name = name;
  for (const track of clip.tracks) {
    if (!track.name.endsWith(`${bone("Hips")}.position`)) continue;
    const v = track.values;
    for (let i = 0; i < v.length; i += 3) {
      v[i] = v[0];
      v[i + 2] = v[2];
    }
  }
  return clip;
}

export async function makeFighter(THREE: typeof Three, loader: { parseAsync(data: ArrayBuffer, path: string): Promise<GLTF>; loadAsync(url: string): Promise<GLTF> }, kind: FighterKind, model: ArrayBuffer, clipNames: readonly string[]): Promise<ArenaFighter> {
  const [gltf, ...clipFiles] = await Promise.all([loader.parseAsync(model, ""), ...clipNames.map((n) => loader.loadAsync(`${CLIPS}${n}.glb`))]);
  const scene = gltf.scene;
  const box = new THREE.Box3().setFromObject(scene);
  const scale = HEIGHT[kind] / Math.max(0.01, box.max.y - box.min.y);
  scene.scale.setScalar(scale);
  // Soles on the ground: the root sits where the feet are.
  scene.position.y = -box.min.y * scale;
  scene.traverse((node) => {
    const mesh = node as Three.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const m = mesh.material as Three.MeshStandardMaterial;
    m.roughness = SURFACE[kind].roughness;
    m.metalness = SURFACE[kind].metalness;
    if (m.normalMap) m.normalScale.set(1, 1);
    if (m.transparent) {
      // Hair cards: cut out instead of blended, so they sort and shadow correctly.
      m.transparent = false;
      m.alphaTest = 0.5;
    }
  });
  const root = new THREE.Group();
  root.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  const actions = new Map<string, Three.AnimationAction>();
  clipFiles.forEach((file, i) => {
    const clip = inPlace(file, clipNames[i]);
    if (clip) actions.set(clip.name, mixer.clipAction(clip));
  });
  let current: Three.AnimationAction | null = null;
  const neck = scene.getObjectByName(bone("Neck"));
  const head = scene.getObjectByName(bone("Head"));
  let look = 0;

  const v = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const boneQ = new THREE.Quaternion();
  const turn = (b: Three.Object3D | undefined, target: Three.Vector3, share: number): void => {
    if (!b?.parent) return;
    b.getWorldPosition(v);
    const desired = target.clone().sub(v).normalize();
    b.getWorldQuaternion(boneQ);
    forward.set(0, 0, 1).applyQuaternion(boneQ);
    q.setFromUnitVectors(forward, desired);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    const amount = (share * look * Math.min(1, LOOK.limit / Math.max(angle, 1e-4)));
    q.slerp(new THREE.Quaternion(), 1 - amount);
    b.parent.getWorldQuaternion(parentQ);
    // world' = q * world  →  local' = parent⁻¹ * q * parent * local
    b.quaternion.premultiply(parentQ.clone().invert().multiply(q).multiply(parentQ));
    b.updateMatrixWorld(true);
  };

  return {
    root,
    mixer,
    play(name, fade = 0.25) {
      const next = actions.get(name);
      if (!next || next === current) return;
      next.reset().play();
      if (current) next.crossFadeFrom(current, fade, true);
      current = next;
    },
    update(dt, target) {
      mixer.update(dt);
      look += ((target ? 1 : 0) - look) * Math.min(1, dt * LOOK.rate);
      if (!target || look < 0.01) return;
      root.updateMatrixWorld(true);
      turn(neck, target, LOOK.neck);
      turn(head, target, LOOK.head);
    },
    dispose() {
      mixer.stopAllAction();
      scene.traverse((node) => {
        const mesh = node as Three.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const m = mesh.material as Three.MeshStandardMaterial;
        for (const t of [m.map, m.normalMap]) t?.dispose();
        m.dispose();
      });
    },
  };
}
