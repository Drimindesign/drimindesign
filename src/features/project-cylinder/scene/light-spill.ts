import { AdditiveBlending, Color, RingGeometry, ShaderMaterial, SRGBColorSpace, type Texture } from "three";

/*
 * Light spill: the floor lit by the panels. Each panel owns a floor sector (spanning twice its
 * width, so neighbours cross-fade with cos² weights that sum to 1) and adds its own average
 * colour, so a blue project throws blue light and a green one throws green.
 *
 * Profile across the band (d = distance from the band, outward positive):
 *   - right at the contact line the floor gets almost nothing (light leaves the screen
 *     parallel to the floor there), which leaves a natural dark crease where they meet;
 *   - it peaks a few centimetres out and decays over about a stride;
 *   - inside the ring the inner faces are dimmer, so the pool there is weaker and wider.
 * Faded with the same fog range as the room so distant spill sinks into the haze.
 */

const vertexShader = /* glsl */ `
  varying vec2 vLocal;
  varying float vDepth;
  void main() {
    vLocal = position.xy;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  #define PI 3.14159265
  uniform vec3 uColor;       // the panel's average colour, in display (sRGB) values
  uniform float uRadius;     // ring radius
  uniform float uStep;       // angle between panel centres
  uniform float uIntensity;  // peak brightness of the outer pool
  uniform float uFalloff;    // decay distance of the outer pool
  uniform float uCrease;     // width of the unlit crease at the contact line
  uniform float uInner;      // inner pool strength relative to the outer one
  uniform float uTail;       // strength of the long, faint tail of the pool
  uniform vec2 uReach;       // sector extent inside / outside the band; light reaches 0 there
  uniform vec2 uFog;         // fog near / far
  varying vec2 vLocal;
  varying float vDepth;

  void main() {
    float r = length(vLocal);
    float d = r - uRadius;
    // Bright near pool plus a long faint tail, so the light fades into the dark floor
    // instead of ending.
    float pool = exp(-d / uFalloff) + uTail * exp(-d / (uFalloff * 4.0));
    // Both pools reach exactly zero before the sector's edge, so the geometry never shows.
    float outer = step(0.0, d) * (1.0 - exp(-d / uCrease)) * pool * (1.0 - smoothstep(uReach.y * 0.45, uReach.y, d));
    float inner = (1.0 - step(0.0, d)) * (1.0 - exp(d / uCrease)) * exp(d / (uFalloff * 1.8)) * uInner
      * (1.0 - smoothstep(uReach.x * 0.45, uReach.x, -d));

    // Angle from this panel's centre (the sector is built around -90° in its own plane).
    float a = atan(vLocal.y, vLocal.x) + PI * 0.5;
    a = mod(a + PI, 2.0 * PI) - PI;
    float w = cos(clamp(a / uStep, -1.0, 1.0) * PI * 0.5);

    float fog = 1.0 - smoothstep(uFog.x, uFog.y, vDepth);
    // Written straight in display (sRGB) values, without the linear → sRGB conversion: the
    // canvas blends additively in display space, where a "tiny" linear tail is lifted by the
    // gamma curve into a visible band. Shaping the fade in display space keeps it even.
    gl_FragColor = vec4(uColor * (outer + inner) * w * w * uIntensity * fog, 1.0);
  }
`;

export interface SpillSettings {
  radius: number;
  step: number;
  fog: [number, number];
}

/* Spill tuning (world units). */
const SPILL = {
  // Lower than on a dark floor: on the brand-coloured floor more would wash out the panel's own colour.
  intensity: 0.5,
  falloff: 0.7,
  tail: 0.14,
  crease: 0.035,
  inner: 0.35,
  /** How far the sector reaches inside and outside the band. */
  reachIn: 1.8,
  reachOut: 4.2,
} as const;

export function createSpillMaterial({ radius, step, fog }: SpillSettings): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uColor: { value: new Color(0, 0, 0) },
      uRadius: { value: radius },
      uStep: { value: step },
      uIntensity: { value: SPILL.intensity },
      uFalloff: { value: SPILL.falloff },
      uCrease: { value: SPILL.crease },
      uInner: { value: SPILL.inner },
      uTail: { value: SPILL.tail },
      uReach: { value: [Math.min(SPILL.reachIn, radius - 0.01), SPILL.reachOut] },
      uFog: { value: fog },
    },
  });
}

/** Floor sector under one panel, ±1 step around its centre, lying flat (rotate −90° on X). */
export function createSpillGeometry(radius: number, step: number): RingGeometry {
  return new RingGeometry(
    Math.max(0.01, radius - SPILL.reachIn),
    radius + SPILL.reachOut,
    48,
    1,
    -Math.PI / 2 - step,
    step * 2,
  );
}

/*
 * Average colour of a loaded image, in display (sRGB) values for the spill shader, from a
 * tiny downsample, with a floor on lightness so dark images still glow a little in their
 * hue. Falls back to a warm neutral on CORS or decode failure.
 */
export function averageColor(texture: Texture): Color {
  const fallback = new Color(0.62, 0.52, 0.46);
  const image = texture.image as CanvasImageSource | undefined;
  if (!image) return fallback;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback;
    context.drawImage(image, 0, 0, 8, 8);
    const data = context.getImageData(0, 0, 8, 8).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const n = (data.length / 4) * 255;
    // HSL in sRGB, then the raw components are written as sRGB values (no linear conversion).
    const hsl = { h: 0, s: 0, l: 0 };
    new Color().setRGB(r / n, g / n, b / n, SRGBColorSpace).getHSL(hsl, SRGBColorSpace);
    const adjusted = new Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.15), Math.max(0.5, hsl.l), SRGBColorSpace);
    const out = { r: 0, g: 0, b: 0 };
    adjusted.getRGB(out, SRGBColorSpace);
    return new Color(out.r, out.g, out.b);
  } catch {
    return fallback;
  }
}
