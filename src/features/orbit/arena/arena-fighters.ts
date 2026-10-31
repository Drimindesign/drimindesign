import type * as Three from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { hipMount, holdWeapon, makeScabbard, makeShield, makeSword } from "./weapons";

/*
 * The fighters in the arena: the full Mixamo characters with their colour and surface-detail
 * maps, lit physically and casting real shadows, armed with real steel. Alive while standing:
 * the idle clip breathes and shifts weight, and the head and neck turn to keep the opponent in
 * view. Every fight state plays its motion-captured clip, cross-faded so nothing snaps.
 */

const CLIPS = "/game/fighters/";
const bone = (name: string): string => `mixamorig${name}`;
/** How far (radians) the neck and head turn to follow the opponent, and how quickly (1/s). */
const LOOK = { neck: 0.35, head: 0.6, limit: 1.0, rate: 4 } as const;
/** Skin and cloth are matte; the knight's plate has a dull metal sheen; the brute's hide is rough. */
const SURFACE = { hero: { roughness: 0.72, metalness: 0 }, knight: { roughness: 0.48, metalness: 0.35 }, brute: { roughness: 0.8, metalness: 0.05 } } as const;
const HEIGHT = { hero: 1.75, knight: 1.9, brute: 2.35 } as const;
/** What each one carries. */
const ARMS = { hero: { sword: "longsword", shield: false }, knight: { sword: "longsword", shield: true }, brute: { sword: "greatsword", shield: false } } as const;
/** Clips that play once and hold their last frame. */
const ONCE = /(slash|kick|spin|heavy|master|power|slide|hit|death|getup|block|jump|draw|sheathe)/;

export type FighterKind = keyof typeof HEIGHT;

export interface ArenaFighter {
  kind: FighterKind;
  root: Three.Group;
  /** Plays a clip (cross-fading from the current one); `speed` may be negative (walking backwards). */
  play(name: string, options?: { fade?: number; speed?: number; restart?: boolean }): void;
  /** A clip's length (s), for timing the fight; 0 if this body doesn't have it. */
  length(name: string): number;
  current(): string;
  /** Steps the animation, then turns the head toward `target` (world point). */
  update(dt: number, target: Three.Vector3 | null): void;
  /** Where the sword's tip is (world), for sparks and trails. */
  tip(out: Three.Vector3): Three.Vector3;
  setOpacity(alpha: number): void;
  /** Sword in hand (true) or in its scabbard on the hip (false; the hero only). */
  arm(armed: boolean): void;
  /** Shades the body by the light where it stands (a multiplier on its colours). */
  setShade(k: number): void;
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

export type ClipLoader = (name: string) => Promise<Three.AnimationClip | null>;

/** Loads clips once and shares them between fighters. */
export function clipLibrary(loader: { loadAsync(url: string): Promise<GLTF> }): ClipLoader {
  const cache = new Map<string, Promise<Three.AnimationClip | null>>();
  return (name) => {
    let clip = cache.get(name);
    if (!clip) {
      clip = loader.loadAsync(`${CLIPS}${name}.glb`).then((g) => inPlace(g, name)).catch(() => null);
      cache.set(name, clip);
    }
    return clip;
  };
}

export async function makeFighter(THREE: typeof Three, loader: { parseAsync(data: ArrayBuffer, path: string): Promise<GLTF> }, clips: ClipLoader, kind: FighterKind, model: ArrayBuffer, clipNames: readonly string[]): Promise<ArenaFighter> {
  const [gltf, ...loaded] = await Promise.all([loader.parseAsync(model.slice(0), ""), ...clipNames.map((n) => clips(n))]);
  const scene = gltf.scene;
  const box = new THREE.Box3().setFromObject(scene);
  const scale = HEIGHT[kind] / Math.max(0.01, box.max.y - box.min.y);
  scene.scale.setScalar(scale);
  // Soles on the ground: the root sits where the feet are.
  scene.position.y = -box.min.y * scale;
  const materials: Three.MeshStandardMaterial[] = [];
  const bases: Three.Color[] = [];
  let shade = 1;
  scene.traverse((node) => {
    const mesh = node as Three.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const m = mesh.material as Three.MeshStandardMaterial;
    m.roughness = SURFACE[kind].roughness;
    m.metalness = SURFACE[kind].metalness;
    if (m.transparent) {
      // Hair cards: cut out instead of blended, so they sort and shadow correctly.
      m.transparent = false;
      m.alphaTest = 0.5;
    }
    materials.push(m);
    bases.push(m.color.clone());
  });
  const root = new THREE.Group();
  root.add(scene);
  root.updateMatrixWorld(true);

  // Weapons, fitted while the body is still in its bind pose.
  const sword = makeSword(THREE, ARMS[kind].sword);
  const right = scene.getObjectByName(bone("RightHand"));
  if (right) holdWeapon(THREE, right, sword, false);
  // The hero also wears a scabbard on her left hip; the sword can live there or in her hand.
  const inHand = { position: sword.position.clone(), quaternion: sword.quaternion.clone(), scale: sword.scale.clone() };
  const hips = scene.getObjectByName(bone("Hips"));
  const onHip = kind === "hero" && hips ? hipMount(THREE, hips) : null;
  if (onHip && hips) {
    const scabbard = makeScabbard(THREE, ARMS[kind].sword);
    scabbard.position.copy(onHip.position);
    scabbard.quaternion.copy(onHip.quaternion);
    scabbard.scale.copy(onHip.scale);
    hips.add(scabbard);
  }
  let armed = true;
  const left = scene.getObjectByName(bone("LeftHand"));
  if (ARMS[kind].shield && left) holdWeapon(THREE, left, makeShield(THREE), true);
  const tipLocal = new THREE.Vector3(0, kind === "brute" ? 1.4 : 1.1, 0);

  const mixer = new THREE.AnimationMixer(scene);
  const actions = new Map<string, Three.AnimationAction>();
  loaded.forEach((clip) => {
    if (!clip) return;
    const action = mixer.clipAction(clip);
    if (ONCE.test(clip.name)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions.set(clip.name, action);
  });
  let current: Three.AnimationAction | null = null;
  let currentName = "";
  const neck = scene.getObjectByName(bone("Neck"));
  const head = scene.getObjectByName(bone("Head"));
  let look = 0;

  const v = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const identity = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const boneQ = new THREE.Quaternion();
  const turn = (b: Three.Object3D | undefined, target: Three.Vector3, share: number): void => {
    if (!b?.parent) return;
    b.getWorldPosition(v);
    desired.copy(target).sub(v).normalize();
    b.getWorldQuaternion(boneQ);
    forward.set(0, 0, 1).applyQuaternion(boneQ);
    q.setFromUnitVectors(forward, desired);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    const amount = share * look * Math.min(1, LOOK.limit / Math.max(angle, 1e-4));
    q.slerp(identity, 1 - amount);
    b.parent.getWorldQuaternion(parentQ);
    // world' = q * world  →  local' = parent⁻¹ * q * parent * local
    b.quaternion.premultiply(parentQ.clone().invert().multiply(q).multiply(parentQ));
    b.updateMatrixWorld(true);
  };

  return {
    kind,
    root,
    play(name, options = {}) {
      const next = actions.get(name);
      if (!next) return;
      const speed = options.speed ?? 1;
      if (next === current && !options.restart) {
        next.timeScale = speed;
        return;
      }
      next.reset();
      next.timeScale = speed;
      if (speed < 0) next.time = next.getClip().duration;
      next.play();
      if (current && current !== next) next.crossFadeFrom(current, options.fade ?? 0.18, true);
      current = next;
      currentName = name;
    },
    length(name) {
      return actions.get(name)?.getClip().duration ?? 0;
    },
    current: () => currentName,
    update(dt, target) {
      mixer.update(dt);
      look += ((target ? 1 : 0) - look) * Math.min(1, dt * LOOK.rate);
      if (!target || look < 0.01) return;
      root.updateMatrixWorld(true);
      turn(neck, target, LOOK.neck);
      turn(head, target, LOOK.head);
    },
    tip(out) {
      return sword.localToWorld(out.copy(tipLocal));
    },
    arm(next) {
      if (next === armed || !onHip || !hips || !right) return;
      armed = next;
      const mount = armed ? inHand : onHip;
      (armed ? right : hips).add(sword);
      sword.position.copy(mount.position);
      sword.quaternion.copy(mount.quaternion);
      sword.scale.copy(mount.scale);
      // In the scabbard only the hilt shows above the throat: the blade sits down inside it.
      if (!armed) sword.position.add(new THREE.Vector3(0, -0.02, 0).applyQuaternion(mount.quaternion));
    },
    setShade(k) {
      if (Math.abs(k - shade) < 0.01) return;
      shade = k;
      materials.forEach((m, i) => m.color.copy(bases[i]).multiplyScalar(k));
    },
    setOpacity(alpha) {
      for (const m of materials) {
        m.transparent = alpha < 0.99;
        m.opacity = alpha;
      }
    },
    dispose() {
      mixer.stopAllAction();
      root.traverse((node) => {
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
