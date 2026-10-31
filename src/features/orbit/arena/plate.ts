import type * as Three from "three";
import { groundAt, type ArenaData } from "./arena-data";

/*
 * The arena's set: photoreal renders of the backyard (Blender, lit and graded offline), one per
 * 60-degree slice around a single eye point, each turned into a mesh by its depth. Seen from near
 * that eye the set is exact; moving a little away from it gives true parallax, and since the
 * mesh writes depth, the fighters pass behind the tree and the railing. Foliage stirs in the wind:
 * a mask from the render says how much each pixel sways, and the shader drifts those pixels
 * with gusting noise.
 */

/**
 * The fight lane: the rendered lawn stands above the soil, so along the lane the set is laid on the
 * soil itself and the fighters' feet stay in view. How wide (m either side) and how high above the soil it applies.
 */
const LANE = { across: 1.8, beyond: 0, height: 0.25 } as const;

/** Wind on the foliage: drift (share of the image), gust period (s), flutter scale. */
export const WIND = { drift: [0.0032, 0.0018], gust: 9, flutter: [34, 20], speed: 0.85 } as const;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform sampler2D sway;
uniform float time;
uniform vec2 drift;
uniform vec2 flutter;
uniform float gust;
uniform float speed;
varying vec2 vUv;

void main() {
  float s = texture2D(sway, vUv).r;
  vec2 shift = vec2(0.0);
  // Only foliage moves: everything else skips the wind entirely.
  if (s > 0.01) {
    // Gusts roll across the yard (a slow front moving sideways), with leaf flutter on top:
    // layered sines, cheap enough to run on every leaf pixel of a phone screen.
    float front = 0.5 + 0.5 * sin(time * 6.2832 / gust - vUv.x * 4.0);
    float strength = 0.35 + 0.65 * front * front;
    float t = time * speed;
    vec2 p = vUv * flutter;
    vec2 n = vec2(sin(p.x * 1.7 + t * 1.3 + sin(p.y * 1.1 + t)), sin(p.y * 1.9 - t * 1.1 + sin(p.x * 1.3 - t * 0.7))) * 0.5;
    shift = s * strength * n * drift;
  }
  vec4 colour = texture2D(map, vUv + shift);
  gl_FragColor = vec4(colour.rgb, 1.0);
  #include <colorspace_fragment>
}`;

export interface Plate {
  group: Three.Group;
  update(time: number): void;
  dispose(): void;
}

/** Builds the set: one depth mesh per slice, textured with its render and wind mask. */
export function buildPlate(THREE: typeof Three, data: ArenaData, images: { colour: Three.Texture; sway: Three.Texture; depth: Uint16Array }[]): Plate {
  const { meta } = data;
  const group = new THREE.Group();
  group.position.fromArray(meta.eye);
  const materials: Three.ShaderMaterial[] = [];
  const geometries: Three.BufferGeometry[] = [];
  const columns = meta.grid;
  const eye = new THREE.Vector3().fromArray(meta.eye);
  const centre = new THREE.Vector3().fromArray(meta.fight.centre);
  const along = new THREE.Vector3().fromArray(meta.fight.along).normalize();
  const across = new THREE.Vector3(-along.z, 0, along.x);
  const world = new THREE.Vector3();
  const offset = new THREE.Vector3();
  // A point near the lane's ground moves down its own ray onto the soil (one refinement for slope).
  const onSoil = (p: Three.Vector3, yaw: number): void => {
    world.copy(p).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(eye);
    offset.copy(world).sub(centre);
    const t = offset.dot(along);
    if (Math.abs(offset.dot(across)) > LANE.across || Math.abs(t) > meta.fight.half + LANE.beyond) return;
    let soil = groundAt(meta, t);
    if (world.y > soil + LANE.height) return;
    const ray = world.clone().sub(eye);
    for (let k = 0; k < 2; k++) {
      const s = (soil - eye.y) / ray.y;
      world.copy(eye).addScaledVector(ray, s);
      soil = groundAt(meta, world.clone().sub(centre).dot(along));
    }
    p.copy(world).sub(eye).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -yaw);
  };
  const rows = Math.round((columns * meta.size[1]) / meta.size[0]);

  images.forEach(({ colour, sway, depth }, index) => {
    const yaw = -THREE.MathUtils.degToRad(meta.heading + meta.slices[index]);
    const p = new THREE.Vector3();
    const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
    const uvs = new Float32Array((columns + 1) * (rows + 1) * 2);
    for (let gy = 0; gy <= rows; gy++) {
      for (let gx = 0; gx <= columns; gx++) {
        const i = gy * (columns + 1) + gx;
        const u = gx / columns;
        const v = gy / rows;
        // The pixel's ray in the slice camera's frame (tan units), scaled by its planar depth.
        const d = depth[i] / 100;
        p.set((-meta.half + 2 * meta.half * u) * d, (meta.up - (meta.up + meta.down) * v) * d, -d);
        onSoil(p, yaw);
        p.toArray(positions, i * 3);
        uvs[i * 2] = u;
        uvs[i * 2 + 1] = 1 - v;
      }
    }
    const indices: number[] = [];
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < columns; gx++) {
        const a = gy * (columns + 1) + gx;
        const b = a + 1;
        const c = a + columns + 1;
        const e = c + 1;
        indices.push(a, c, b, b, c, e);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    geometries.push(geometry);

    colour.colorSpace = THREE.SRGBColorSpace;
    // Mipmapped: the slices are usually drawn smaller than their 2048 px, and sampling them
    // unfiltered thrashes the GPU's texture cache (a third of the frame rate on a laptop GPU).
    colour.generateMipmaps = true;
    colour.minFilter = THREE.LinearMipmapLinearFilter;
    sway.colorSpace = THREE.NoColorSpace;
    for (const texture of [colour, sway]) {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
    }
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        map: { value: colour },
        sway: { value: sway },
        time: { value: 0 },
        drift: { value: new THREE.Vector2(...WIND.drift) },
        flutter: { value: new THREE.Vector2(...WIND.flutter) },
        gust: { value: WIND.gust },
        speed: { value: WIND.speed },
      },
      // The render is already graded: drawn as is, never tone-mapped again.
      toneMapped: false,
    });
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    // Each slice faces its own heading (Blender's heading is clockwise; three's yaw is counter-clockwise).
    mesh.rotation.y = yaw;
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    group.add(mesh);
  });

  return {
    group,
    update(time) {
      for (const m of materials) m.uniforms.time.value = time;
    },
    dispose() {
      for (const m of materials) {
        (m.uniforms.map.value as Three.Texture).dispose();
        (m.uniforms.sway.value as Three.Texture).dispose();
        m.dispose();
      }
      for (const g of geometries) g.dispose();
    },
  };
}
