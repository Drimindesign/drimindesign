import type * as Three from "three";

/*
 * What a blow does to a body: a spray of blood thrown the way the blade travelled (droplets under
 * gravity, a little mist at the wound), drops that land as dark wet spots on the ground and fade
 * over half a minute, slow drips from a badly hurt fighter, and, on armour, chips of steel and
 * sparks instead (a blade on plate skids and bites, it doesn't cut).
 */

/** Pools: droplets in the air, spots on the ground, chips. Droplet sizes (m), spot life (s). */
const DROPS = { count: 420, size: 0.022, gravity: 9.8 } as const;
const SPOTS = { count: 160, life: 30, size: [0.05, 0.16] } as const;
const CHIPS = { count: 90, size: 0.018 } as const;
/** Blood colour: dark venous red (it reads black-red at night, bright only where lit). */
const BLOOD = 0x5a0606;

interface Particle {
  alive: boolean;
  p: Three.Vector3;
  v: Three.Vector3;
  age: number;
  life: number;
}

export interface Blood {
  group: Three.Group;
  /** A wound: spray from `at`, thrown along `dir` (world, unit), `amount` 0 … 1. */
  spray(at: Three.Vector3, dir: Three.Vector3, amount: number): void;
  /** Steel struck: chips flung off the armour. */
  chips(at: Three.Vector3, dir: Three.Vector3, amount: number): void;
  /** A slow drip from a hurt body. */
  drip(at: Three.Vector3): void;
  update(dt: number): void;
  dispose(): void;
}

export function buildBlood(THREE: typeof Three, groundAt: (x: number, z: number) => number): Blood {
  const group = new THREE.Group();
  const make = (count: number): Particle[] => Array.from({ length: count }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), age: 0, life: 1 }));
  const drops = make(DROPS.count);
  const chips = make(CHIPS.count);
  let nextDrop = 0;
  let nextChip = 0;

  // Droplets and chips as points (one draw call each).
  const points = (count: number, colour: number, size: number): { mesh: Three.Points; positions: Float32Array } => {
    const positions = new Float32Array(count * 3).fill(-1000);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: colour, size, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false });
    const mesh = new THREE.Points(geometry, material);
    mesh.frustumCulled = false;
    group.add(mesh);
    return { mesh, positions };
  };
  const dropPoints = points(DROPS.count, BLOOD, DROPS.size);
  const chipPoints = points(CHIPS.count, 0x9a9da3, CHIPS.size);

  // Spots on the ground: flat wet discs (lit, glossy), instanced, shrinking away as they dry.
  const spotGeometry = new THREE.CircleGeometry(0.5, 12);
  spotGeometry.rotateX(-Math.PI / 2);
  const spotMaterial = new THREE.MeshStandardMaterial({ color: 0x2a0303, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8 });
  const spots = new THREE.InstancedMesh(spotGeometry, spotMaterial, SPOTS.count);
  spots.frustumCulled = false;
  spots.renderOrder = 1;
  const spotAge = new Float32Array(SPOTS.count).fill(SPOTS.life);
  const spotSize = new Float32Array(SPOTS.count);
  const spotAt: Three.Vector3[] = Array.from({ length: SPOTS.count }, () => new THREE.Vector3(0, -1000, 0));
  let nextSpot = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (let i = 0; i < SPOTS.count; i++) spots.setMatrixAt(i, m.makeScale(0, 0, 0));
  group.add(spots);

  const land = (p: Three.Vector3, size: number): void => {
    const i = nextSpot++ % SPOTS.count;
    spotAt[i].set(p.x, groundAt(p.x, p.z) + 0.035, p.z);
    spotAge[i] = 0;
    spotSize[i] = size;
  };

  const emit = (pool: Particle[], next: number, at: Three.Vector3, dir: Three.Vector3, speed: [number, number], spread: number, life: number): number => {
    const k = next % pool.length;
    const d = pool[k];
    d.alive = true;
    d.age = 0;
    d.life = life;
    d.p.copy(at);
    const v = speed[0] + Math.random() * (speed[1] - speed[0]);
    d.v.set(dir.x + (Math.random() - 0.5) * spread, dir.y + 0.35 + Math.random() * spread, dir.z + (Math.random() - 0.5) * spread).normalize().multiplyScalar(v);
    return next + 1;
  };

  return {
    group,
    spray(at, dir, amount) {
      const n = Math.round(18 + amount * 60);
      for (let i = 0; i < n; i++) nextDrop = emit(drops, nextDrop, at, dir, [1.2, 3.2 + amount * 3], 0.9, 1.6);
    },
    chips(at, dir, amount) {
      const n = Math.round(6 + amount * 16);
      for (let i = 0; i < n; i++) nextChip = emit(chips, nextChip, at, dir, [2, 5], 1.2, 1.2);
    },
    drip(at) {
      nextDrop = emit(drops, nextDrop, at, new THREE.Vector3(0, -1, 0), [0.05, 0.25], 0.15, 2);
    },
    update(dt) {
      const step = (pool: Particle[], positions: Float32Array, bleed: boolean): void => {
        pool.forEach((d, i) => {
          if (!d.alive) {
            positions[i * 3 + 1] = -1000;
            return;
          }
          d.age += dt;
          d.v.y -= DROPS.gravity * dt;
          d.v.multiplyScalar(1 - 0.6 * dt);
          d.p.addScaledVector(d.v, dt);
          const floor = groundAt(d.p.x, d.p.z) + 0.02;
          if (d.p.y <= floor || d.age > d.life) {
            d.alive = false;
            if (bleed && d.p.y <= floor + 0.05 && Math.random() < 0.45) land(d.p, SPOTS.size[0] + Math.random() * (SPOTS.size[1] - SPOTS.size[0]));
          }
          positions[i * 3] = d.p.x;
          positions[i * 3 + 1] = d.alive ? d.p.y : -1000;
          positions[i * 3 + 2] = d.p.z;
        });
      };
      step(drops, dropPoints.positions, true);
      step(chips, chipPoints.positions, false);
      (dropPoints.mesh.geometry.getAttribute("position") as Three.BufferAttribute).needsUpdate = true;
      (chipPoints.mesh.geometry.getAttribute("position") as Three.BufferAttribute).needsUpdate = true;
      for (let i = 0; i < SPOTS.count; i++) {
        if (spotAge[i] >= SPOTS.life) continue;
        spotAge[i] += dt;
        // Spreads a little as it soaks in, then dries away.
        const k = spotSize[i] * Math.min(1, 0.5 + spotAge[i] * 4) * (1 - Math.max(0, spotAge[i] - SPOTS.life * 0.6) / (SPOTS.life * 0.4));
        s.set(k, 1, k * (0.7 + (i % 5) * 0.08));
        spots.setMatrixAt(i, m.compose(spotAt[i], q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, i * 1.7), s));
      }
      spots.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const p of [dropPoints, chipPoints]) {
        p.mesh.geometry.dispose();
        (p.mesh.material as Three.Material).dispose();
      }
      spotGeometry.dispose();
      spotMaterial.dispose();
      spots.dispose();
    },
  };
}
