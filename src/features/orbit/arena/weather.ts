import type * as Three from "three";

/*
 * Rain over the deck, drawn on the GPU (no per-drop work on the CPU): streaks falling at a slant in
 * the wind, recycled in a box around the fight; splashes ringing out on the wet boards; and
 * lightning, a double flicker of cold light now and then, with the thunder following it.
 */

/** Streaks: how many, fall speed (m/s), wind slant (m/s), streak length (m), box around the fight (m). */
const RAIN = { count: 2600, speed: 9.5, wind: 1.6, length: 0.32, box: [14, 7, 9], opacity: 0.32 } as const;
const SPLASH = { count: 260, size: 0.09 } as const;
/** Lightning: seconds between strikes (min, max), flash strength (lux), thunder delay range (s). */
export const LIGHTNING = { every: [7, 15], strength: 5, delay: [0.8, 2.2] } as const;

const STREAK_VERTEX = /* glsl */ `
attribute vec3 seed;
attribute float tip;
uniform float time;
uniform vec3 centre;
uniform vec3 box;
uniform float speed;
uniform float wind;
uniform float len;
varying float vTip;
void main() {
  // Each drop loops through the box at its own phase; the streak's two ends trail along its fall.
  float fall = mod(seed.y * box.y - time * speed * (0.85 + 0.3 * fract(seed.x * 13.0)), box.y);
  vec3 p = centre + vec3((seed.x - 0.5) * box.x, fall, (seed.z - 0.5) * box.z);
  p.x += wind * (box.y - fall) / speed;
  vec3 dir = normalize(vec3(wind, -speed, 0.0));
  p -= dir * len * tip;
  vTip = tip;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const STREAK_FRAGMENT = /* glsl */ `
uniform float opacity;
uniform float flash;
varying float vTip;
void main() {
  float a = opacity * (1.0 - vTip) * (1.0 + flash * 3.0);
  gl_FragColor = vec4(vec3(0.78, 0.84, 0.92) * a, a);
}`;

const SPLASH_VERTEX = /* glsl */ `
attribute float seed;
uniform float time;
uniform float scale;
uniform float size;
varying float vAge;
void main() {
  // Each splash point fires again and again with its own rhythm: a ring that opens and fades.
  float period = 0.5 + fract(seed * 7.3) * 0.9;
  vAge = fract(time / period + seed);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * (0.4 + vAge) * scale / -mv.z;
}`;

const SPLASH_FRAGMENT = /* glsl */ `
varying float vAge;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  c.y *= 2.6;
  float d = length(c) * 2.0;
  float ring = smoothstep(0.75, 0.9, d) * (1.0 - smoothstep(0.9, 1.0, d));
  float a = ring * (1.0 - vAge) * 0.45;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.8, 0.86, 0.95) * a, a);
}`;

export interface Weather {
  group: Three.Group;
  /** Advances the rain; returns the lightning's brightness this frame (0 … 1), for the page's flash. */
  update(time: number, dt: number): number;
  dispose(): void;
}

export function buildRain(THREE: typeof Three, centre: Three.Vector3, along: Three.Vector3, groundAt: (x: number, z: number) => number, pixelScale: number, thunder: (strength: number) => void): Weather {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];

  const positions = new Float32Array(RAIN.count * 2 * 3);
  const seeds = new Float32Array(RAIN.count * 2 * 3);
  const tips = new Float32Array(RAIN.count * 2);
  for (let i = 0; i < RAIN.count; i++) {
    const seed = [Math.random(), Math.random(), Math.random()];
    for (let e = 0; e < 2; e++) {
      seeds.set(seed, (i * 2 + e) * 3);
      tips[i * 2 + e] = e;
    }
  }
  const streaks = new THREE.BufferGeometry();
  streaks.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  streaks.setAttribute("seed", new THREE.BufferAttribute(seeds, 3));
  streaks.setAttribute("tip", new THREE.BufferAttribute(tips, 1));
  const streakMaterial = new THREE.ShaderMaterial({
    vertexShader: STREAK_VERTEX,
    fragmentShader: STREAK_FRAGMENT,
    uniforms: {
      time: { value: 0 },
      centre: { value: new THREE.Vector3(centre.x, centre.y - 0.5, centre.z) },
      box: { value: new THREE.Vector3(...RAIN.box) },
      speed: { value: RAIN.speed },
      wind: { value: RAIN.wind },
      len: { value: RAIN.length },
      opacity: { value: RAIN.opacity },
      flash: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const rain = new THREE.LineSegments(streaks, streakMaterial);
  rain.frustumCulled = false;
  group.add(rain);
  disposables.push(streaks, streakMaterial);

  // Splashes over the deck around the fight.
  const across = new THREE.Vector3(-along.z, 0, along.x);
  const splashPositions = new Float32Array(SPLASH.count * 3);
  const splashSeeds = new Float32Array(SPLASH.count);
  for (let i = 0; i < SPLASH.count; i++) {
    const p = centre.clone().addScaledVector(along, (Math.random() - 0.5) * 9).addScaledVector(across, (Math.random() - 0.5) * 5);
    p.y = groundAt(p.x, p.z) + 0.02;
    p.toArray(splashPositions, i * 3);
    splashSeeds[i] = Math.random();
  }
  const splashGeometry = new THREE.BufferGeometry();
  splashGeometry.setAttribute("position", new THREE.BufferAttribute(splashPositions, 3));
  splashGeometry.setAttribute("seed", new THREE.BufferAttribute(splashSeeds, 1));
  const splashMaterial = new THREE.ShaderMaterial({
    vertexShader: SPLASH_VERTEX,
    fragmentShader: SPLASH_FRAGMENT,
    uniforms: { time: { value: 0 }, scale: { value: pixelScale }, size: { value: SPLASH.size } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const splashes = new THREE.Points(splashGeometry, splashMaterial);
  splashes.frustumCulled = false;
  group.add(splashes);
  disposables.push(splashGeometry, splashMaterial);

  // Lightning: cold light from high in the sky behind the yard.
  const bolt = new THREE.DirectionalLight(0xcfdcff, 0);
  bolt.position.copy(centre).add(new THREE.Vector3(-20, 30, -10));
  bolt.target.position.copy(centre);
  group.add(bolt, bolt.target);
  let nextStrike = 4 + Math.random() * 4;
  let strike = -10;
  let rumbled = true;
  let rumbleAt = 0;

  return {
    group,
    update(time) {
      streakMaterial.uniforms.time.value = time;
      splashMaterial.uniforms.time.value = time;
      if (time > nextStrike) {
        strike = time;
        nextStrike = time + LIGHTNING.every[0] + Math.random() * (LIGHTNING.every[1] - LIGHTNING.every[0]);
        rumbled = false;
        rumbleAt = time + LIGHTNING.delay[0] + Math.random() * (LIGHTNING.delay[1] - LIGHTNING.delay[0]);
      }
      if (!rumbled && time > rumbleAt) {
        rumbled = true;
        thunder(0.6 + Math.random() * 0.4);
      }
      // A double flicker: a bright first stroke, a dark beat, a weaker return stroke, then gone.
      const t = time - strike;
      const flash = t < 0 || t > 0.6 ? 0 : t < 0.07 ? 1 : t < 0.14 ? 0.15 : t < 0.24 ? 0.7 : Math.max(0, 0.7 * (1 - (t - 0.24) / 0.36));
      bolt.intensity = flash * LIGHTNING.strength;
      streakMaterial.uniforms.flash.value = flash;
      return flash;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      bolt.dispose();
    },
  };
}
