import type * as Three from "three";

/*
 * The bonfire, live: tongues of flame (camera-facing sheets with a rising, turbulent flame
 * shader, hot white-yellow at the root to red at the tips), charred logs glowing at the seams,
 * embers spiralling up on the heat and dying, smoke rolling off downwind, and a flickering
 * orange light that rims the fighters from behind. The plate carries the fire's steady light;
 * a soft additive glow over it breathes with the flicker so the yard seems lit by living flame.
 * Also the moon breaking through the canopy: long, faint shafts of cool light through the haze.
 */

/** Flame sheets, embers, smoke puffs; the light's strength (cd) and its flicker depth. */
const FLAMES = { sheets: 7, height: 1.25, width: 0.75 } as const;
const EMBERS = { count: 140, rise: 2.2, life: 2.6 } as const;
const SMOKE = { puffs: 14, rise: 0.55, life: 7, size: 1.6 } as const;
export const FIRE_LIGHT = { intensity: 7, distance: 14, decay: 1.6, flicker: 0.35, colour: 0xff7a2c } as const;
/** Moon shafts: how many, their reach (m), and how faint. */
const SHAFTS = { count: 4, length: 14, opacity: 0.07 } as const;

const BILLBOARD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // Face the camera around the vertical, keep the flame upright.
  vec4 centre = modelViewMatrix * vec4(0.0, position.y, 0.0, 1.0);
  centre.x += position.x * length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * centre;
}`;

const FLAME_FRAGMENT = /* glsl */ `
uniform float time;
uniform float seed;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 p = vUv;
  // Turbulence rising through the flame: two octaves scrolling upward, stronger toward the tip.
  float n = noise(vec2(p.x * 4.0 + seed, p.y * 3.0 - time * 2.6)) * 0.65 + noise(vec2(p.x * 9.0 - seed, p.y * 7.0 - time * 4.1)) * 0.35;
  float x = (p.x - 0.5) * 2.0 + (n - 0.5) * 0.9 * p.y;
  // A teardrop: wide at the root, licking up to a ragged tip.
  float body = 1.0 - smoothstep(0.0, 1.0, abs(x) / max(0.05, (1.0 - p.y) * (0.55 + 0.45 * (1.0 - p.y))));
  float flame = body * smoothstep(0.0, 0.08, p.y) * (1.0 - smoothstep(0.5 + n * 0.35, 1.0, p.y));
  // Turbulence eats the flame's edges into tongues; only the hot core stays solid.
  flame = clamp(flame * (0.35 + n * 1.2) - 0.12, 0.0, 1.0);
  vec3 hot = vec3(1.0, 0.9, 0.62);
  vec3 mid = vec3(1.0, 0.5, 0.12);
  vec3 tip = vec3(0.7, 0.18, 0.03);
  vec3 colour = mix(mix(tip, mid, smoothstep(0.15, 0.5, flame)), hot, smoothstep(0.5, 0.9, flame));
  // Faint flame fades fast (no glowing slab), the core burns bright.
  float glow = pow(flame, 1.6) * 2.2;
  gl_FragColor = vec4(colour * glow, glow);
}`;

const SMOKE_FRAGMENT = /* glsl */ `
uniform float time;
uniform float seed;
uniform float age;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float n = noise(vUv * 3.0 + seed + time * 0.15) * 0.6 + noise(vUv * 7.0 - seed) * 0.4;
  float a = (1.0 - smoothstep(0.2, 1.0, d + (n - 0.5) * 0.5)) * smoothstep(0.0, 0.15, age) * (1.0 - age);
  // Grey smoke, lit warm from below near the fire and cooling as it rises.
  vec3 c = mix(vec3(0.32, 0.2, 0.13), vec3(0.11, 0.12, 0.13), age);
  gl_FragColor = vec4(c, a * 0.32);
}`;

const EMBER_VERTEX = /* glsl */ `
attribute float seed;
uniform float time;
uniform float scale;
uniform float rise;
uniform float life;
varying float vHeat;
void main() {
  float t = mod(time + seed * life, life) / life;
  vec3 p = position;
  // Up on the heat, swirling, drifting downwind as they cool.
  p.y += t * rise * (0.7 + fract(seed * 13.0) * 0.6);
  p.x += sin(t * 9.0 + seed * 40.0) * 0.18 * t + t * 0.5;
  p.z += cos(t * 7.0 + seed * 23.0) * 0.18 * t;
  vHeat = (1.0 - t) * step(0.02, t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.025 + 0.02 * fract(seed * 7.0)) * scale / -mv.z;
}`;

const EMBER_FRAGMENT = /* glsl */ `
varying float vHeat;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vHeat;
  if (a < 0.02) discard;
  gl_FragColor = vec4(mix(vec3(0.9, 0.2, 0.03), vec3(1.0, 0.8, 0.4), vHeat) * a * 1.5, a);
}`;

const GLOW_FRAGMENT = /* glsl */ `
uniform float strength;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.2) * strength;
  gl_FragColor = vec4(vec3(1.0, 0.45, 0.12) * a, a);
}`;

const SHAFT_FRAGMENT = /* glsl */ `
uniform float time;
uniform float opacity;
uniform float seed;
varying vec2 vUv;
void main() {
  // Brightest where it breaks through, fading along its length and at its soft edges; dust drifts through.
  float edge = 1.0 - smoothstep(0.15, 0.5, abs(vUv.x - 0.5));
  float along = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.4, 1.0, vUv.y));
  float drift = 0.75 + 0.25 * sin(vUv.y * 22.0 - time * 0.6 + seed) * sin(vUv.x * 9.0 + time * 0.3);
  float a = edge * along * drift * opacity;
  gl_FragColor = vec4(vec3(0.62, 0.78, 0.92) * a, a);
}`;

const PLAIN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export interface Fire {
  group: Three.Group;
  light: Three.PointLight;
  update(time: number): void;
  dispose(): void;
}

export function buildFire(THREE: typeof Three, at: Three.Vector3, moonDirection: Three.Vector3 | null, pixelScale: number): Fire {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Charred logs leaning into a cone: dark silhouettes inside the flames (unlit, as burning wood reads).
  const logGeometry = keep(new THREE.CylinderGeometry(0.06, 0.075, 0.95, 10));
  const logMaterial = keep(new THREE.MeshBasicMaterial({ color: 0x120a06 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + i * 0.37;
    const log = new THREE.Mesh(logGeometry, logMaterial);
    log.position.set(at.x + Math.cos(a) * 0.2, at.y + 0.28, at.z + Math.sin(a) * 0.2);
    log.lookAt(at.x, at.y + 0.75, at.z);
    log.rotateX(Math.PI / 2);
    log.castShadow = true;
    group.add(log);
  }

  // Flames.
  const flameMaterials: Three.ShaderMaterial[] = [];
  for (let i = 0; i < FLAMES.sheets; i++) {
    const w = FLAMES.width * (0.55 + Math.random() * 0.5);
    const h = FLAMES.height * (0.6 + Math.random() * 0.5);
    const geometry = keep(new THREE.PlaneGeometry(w, h));
    geometry.translate(0, h / 2, 0);
    const material = keep(new THREE.ShaderMaterial({
      vertexShader: BILLBOARD_VERTEX,
      fragmentShader: FLAME_FRAGMENT,
      uniforms: { time: { value: 0 }, seed: { value: Math.random() * 50 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    flameMaterials.push(material);
    const sheet = new THREE.Mesh(geometry, material);
    sheet.position.set(at.x + (Math.random() - 0.5) * 0.3, at.y + 0.05, at.z + (Math.random() - 0.5) * 0.3);
    sheet.renderOrder = 3;
    group.add(sheet);
  }

  // A soft glow over the yard around the fire, breathing with the flicker.
  const glowMaterial = keep(new THREE.ShaderMaterial({ vertexShader: BILLBOARD_VERTEX, fragmentShader: GLOW_FRAGMENT, uniforms: { strength: { value: 0.35 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const glowGeometry = keep(new THREE.PlaneGeometry(5.5, 5.5));
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.position.set(at.x, at.y + 0.6, at.z);
  glow.renderOrder = 4;
  group.add(glow);

  // Embers.
  const emberPositions = new Float32Array(EMBERS.count * 3);
  const emberSeeds = new Float32Array(EMBERS.count);
  for (let i = 0; i < EMBERS.count; i++) {
    emberPositions.set([at.x + (Math.random() - 0.5) * 0.5, at.y + 0.3, at.z + (Math.random() - 0.5) * 0.5], i * 3);
    emberSeeds[i] = Math.random();
  }
  const emberGeometry = keep(new THREE.BufferGeometry());
  emberGeometry.setAttribute("position", new THREE.BufferAttribute(emberPositions, 3));
  emberGeometry.setAttribute("seed", new THREE.BufferAttribute(emberSeeds, 1));
  const emberMaterial = keep(new THREE.ShaderMaterial({
    vertexShader: EMBER_VERTEX,
    fragmentShader: EMBER_FRAGMENT,
    uniforms: { time: { value: 0 }, scale: { value: pixelScale }, rise: { value: EMBERS.rise }, life: { value: EMBERS.life } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  const embers = new THREE.Points(emberGeometry, emberMaterial);
  embers.frustumCulled = false;
  group.add(embers);

  // Smoke: puffs born over the flames, rising, swelling and drifting downwind.
  const smokeGeometry = keep(new THREE.PlaneGeometry(1, 1));
  const puffs = Array.from({ length: SMOKE.puffs }, (_, i) => {
    const material = keep(new THREE.ShaderMaterial({
      vertexShader: BILLBOARD_VERTEX,
      fragmentShader: SMOKE_FRAGMENT,
      uniforms: { time: { value: 0 }, seed: { value: Math.random() * 20 }, age: { value: 0 } },
      transparent: true,
      depthWrite: false,
    }));
    const mesh = new THREE.Mesh(smokeGeometry, material);
    mesh.renderOrder = 2;
    group.add(mesh);
    return { mesh, material, born: -(i / SMOKE.puffs) * SMOKE.life, drift: (Math.random() - 0.5) * 0.4 };
  });

  // Moon shafts through the canopy (long thin planes along the moonlight, facing the camera's side).
  const shaftMaterials: Three.ShaderMaterial[] = [];
  if (moonDirection) {
    const dir = moonDirection.clone().normalize();
    for (let i = 0; i < SHAFTS.count; i++) {
      const geometry = keep(new THREE.PlaneGeometry(0.6 + Math.random() * 0.9, SHAFTS.length));
      geometry.translate(0, -SHAFTS.length / 2, 0);
      const material = keep(new THREE.ShaderMaterial({ vertexShader: PLAIN_VERTEX, fragmentShader: SHAFT_FRAGMENT, uniforms: { time: { value: 0 }, opacity: { value: SHAFTS.opacity * (0.6 + Math.random() * 0.6) }, seed: { value: i * 2.3 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
      shaftMaterials.push(material);
      const shaft = new THREE.Mesh(geometry, material);
      // Each starts high in the canopy behind the fight and slants down along the moonlight.
      shaft.position.set(at.x - 2.5 + i * 1.6, at.y + 7.5 + Math.random() * 1.5, at.z - 1.5 + Math.random() * 2);
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      shaft.renderOrder = 1;
      group.add(shaft);
    }
  }

  const light = new THREE.PointLight(FIRE_LIGHT.colour, FIRE_LIGHT.intensity, FIRE_LIGHT.distance, FIRE_LIGHT.decay);
  // In the body of the flames, above the logs (which it would otherwise blow out).
  light.position.set(at.x, at.y + 1.25, at.z);
  group.add(light);

  return {
    group,
    light,
    update(time) {
      for (const m of flameMaterials) m.uniforms.time.value = time;
      emberMaterial.uniforms.time.value = time;
      for (const m of shaftMaterials) m.uniforms.time.value = time;
      // Flicker: layered fast and slow wobbles, never a strobe.
      const flicker = 1 - FIRE_LIGHT.flicker * (0.5 + 0.5 * Math.sin(time * 11.3) * Math.sin(time * 6.7 + 1.3)) * (0.6 + 0.4 * Math.sin(time * 2.1));
      light.intensity = FIRE_LIGHT.intensity * flicker;
      light.position.x = at.x + Math.sin(time * 5.3) * 0.06;
      glowMaterial.uniforms.strength.value = 0.28 * flicker;
      for (const p of puffs) {
        let age = (time - p.born) / SMOKE.life;
        if (age >= 1) {
          p.born = time;
          age = 0;
        }
        p.material.uniforms.age.value = age;
        p.material.uniforms.time.value = time;
        p.mesh.position.set(at.x + age * 1.2 + p.drift, at.y + 0.9 + age * SMOKE.rise * SMOKE.life, at.z + p.drift * 0.5);
        p.mesh.scale.setScalar(SMOKE.size * (0.4 + age));
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      light.dispose();
    },
  };
}
