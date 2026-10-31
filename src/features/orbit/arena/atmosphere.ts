import type * as Three from "three";

/*
 * Night air over the fight: fireflies drifting and blinking near the bushes, dust hanging in the
 * deck lamp's beam (lit only inside the cone, the way motes show in a real light), and a thin
 * ground mist that creeps across the lawn and softens where the fighters' feet meet the grass.
 */

/** Counts and sizes: fireflies, motes in the beam, mist banks. */
const FIREFLIES = { count: 38, size: 0.05, spread: [9, 2.2, 5] } as const;
const MOTES = { count: 260, size: 0.012, spread: [7, 3.2, 4] } as const;
const MIST = { banks: 7, width: 7, height: 0.9, opacity: 0.075 } as const;

const POINT_VERTEX = /* glsl */ `
attribute float seed;
uniform float time;
uniform float size;
uniform float scale;
uniform vec3 lamp;
uniform vec3 lampAxis;
uniform float beam;
varying float vGlow;
void main() {
  vec3 p = position;
  // Each one wanders on its own slow loop.
  p += vec3(sin(time * 0.31 + seed * 6.3), sin(time * 0.23 + seed * 3.1) * 0.6, cos(time * 0.27 + seed * 4.7)) * 0.35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * scale / -mv.z;
  if (beam > 0.5) {
    // Motes: bright only inside the lamp's cone, fading toward its edge and with distance.
    vec3 toward = normalize(p - lamp);
    float inside = smoothstep(0.55, 0.9, dot(toward, lampAxis));
    vGlow = inside * 0.55 / (1.0 + 0.08 * dot(p - lamp, p - lamp));
  } else {
    // Fireflies: a slow pulse, each on its own beat, dark half the time.
    vGlow = pow(max(0.0, sin(time * (0.7 + fract(seed * 7.0)) + seed * 40.0)), 3.0);
  }
}`;

const POINT_FRAGMENT = /* glsl */ `
uniform vec3 colour;
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vGlow;
  if (a < 0.01) discard;
  gl_FragColor = vec4(colour * a, a);
}`;

const MIST_FRAGMENT = /* glsl */ `
uniform float time;
uniform float opacity;
uniform float seed;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 p = vUv * vec2(3.0, 1.0) + vec2(time * 0.03 + seed, 0.0);
  float n = noise(p * 2.0) * 0.6 + noise(p * 5.0 + 3.0) * 0.4;
  // Thickest just above the grass, thinning upward and toward the bank's ends.
  float shape = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.25, 1.0, vUv.y)) * sin(vUv.x * 3.1416);
  gl_FragColor = vec4(vec3(0.62, 0.66, 0.74), n * shape * opacity);
}`;

const MIST_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export interface Atmosphere {
  group: Three.Group;
  update(time: number, camera: Three.Camera): void;
  dispose(): void;
}

export function buildAtmosphere(THREE: typeof Three, centre: Three.Vector3, along: Three.Vector3, lamp: { position: Three.Vector3; axis: Three.Vector3 } | null, pixelScale: number): Atmosphere {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const across = new THREE.Vector3(-along.z, 0, along.x);

  const points = (count: number, spread: readonly number[], lift: number, uniforms: Record<string, Three.IUniform>): Three.ShaderMaterial => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const p = centre.clone()
        .addScaledVector(along, (Math.random() - 0.5) * spread[0])
        .addScaledVector(across, (Math.random() - 0.5) * spread[2]);
      p.y += lift + Math.random() * spread[1];
      p.toArray(positions, i * 3);
      seeds[i] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: POINT_VERTEX,
      fragmentShader: POINT_FRAGMENT,
      uniforms: { time: { value: 0 }, scale: { value: pixelScale }, lamp: { value: lamp?.position ?? new THREE.Vector3() }, lampAxis: { value: lamp?.axis ?? new THREE.Vector3(0, -1, 0) }, ...uniforms },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const mesh = new THREE.Points(geometry, material);
    mesh.frustumCulled = false;
    group.add(mesh);
    disposables.push(geometry, material);
    return material;
  };

  const fireflies = points(FIREFLIES.count, FIREFLIES.spread, 0.3, { size: { value: FIREFLIES.size }, colour: { value: new THREE.Color(1.0, 0.92, 0.45) }, beam: { value: 0 } });
  const motes = lamp ? points(MOTES.count, MOTES.spread, 0.4, { size: { value: MOTES.size }, colour: { value: new THREE.Color(1.0, 0.86, 0.66) }, beam: { value: 1 } }) : null;

  const mists: Three.ShaderMaterial[] = [];
  const banks: Three.Mesh[] = [];
  for (let i = 0; i < MIST.banks; i++) {
    const geometry = new THREE.PlaneGeometry(MIST.width, MIST.height);
    geometry.translate(0, MIST.height / 2, 0);
    const material = new THREE.ShaderMaterial({
      vertexShader: MIST_VERTEX,
      fragmentShader: MIST_FRAGMENT,
      uniforms: { time: { value: 0 }, opacity: { value: MIST.opacity }, seed: { value: i * 3.7 } },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const bank = new THREE.Mesh(geometry, material);
    bank.position.copy(centre)
      .addScaledVector(along, (i / (MIST.banks - 1) - 0.5) * 8)
      .addScaledVector(across, (Math.random() - 0.5) * 3);
    bank.position.y -= 0.05;
    group.add(bank);
    banks.push(bank);
    mists.push(material);
    disposables.push(geometry, material);
  }

  return {
    group,
    update(time, camera) {
      fireflies.uniforms.time.value = time;
      if (motes) motes.uniforms.time.value = time;
      for (const m of mists) m.uniforms.time.value = time;
      // Mist banks always face the camera (around the vertical), so they never show an edge.
      for (const bank of banks) bank.rotation.y = Math.atan2(camera.position.x - bank.position.x, camera.position.z - bank.position.z);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
