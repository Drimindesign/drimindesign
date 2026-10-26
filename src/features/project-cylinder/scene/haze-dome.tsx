"use client";

import { useEffect, useMemo } from "react";
import { BackSide, Color, ShaderMaterial, Vector3 } from "three";
import { stagePalette } from "./palette";

/*
 * The endless room's air: a large inverted sphere shaded by view direction. Darkest
 * overhead, the fog colour at the horizon (so the fogged floor meets it seamlessly), a
 * bright bloom of haze behind the ring and a broad, faint wash higher up, so the room feels
 * lit rather than black. Dithered to hide banding in the gradients.
 */
const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;     // colour straight up
  uniform vec3 uHorizon;    // colour at eye level, equal to the fog colour
  uniform vec3 uGlow;       // key light hot spot on the backdrop
  uniform vec3 uGlowDir;    // direction of the hot spot's centre
  uniform float uGlowPower; // tightness of the hot spot (higher = smaller)
  uniform vec3 uShade;      // backdrop where the light falls off at the sides
  varying vec3 vWorld;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);
    float up = smoothstep(-0.02, 0.6, dir.y);
    vec3 colour = mix(uHorizon, uZenith, up);
    // Light falls off toward the sides of the cove (kept off the horizon line, see below).
    float side = smoothstep(0.35, 0.95, abs(dir.x));
    // The hot spot and the side falloff rise from just above the horizon: at the horizon itself
    // the backdrop must stay exactly the fog colour, or the fogged floor shows a hard line.
    float aboveHorizon = smoothstep(0.0, 0.14, dir.y);
    colour = mix(colour, uShade, side * 0.55 * aboveHorizon);
    float spot = pow(max(dot(dir, uGlowDir), 0.0), uGlowPower) * aboveHorizon;
    colour = mix(colour, uGlow, spot * (1.0 - up * 0.5));
    colour += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(colour, 1.0);
    #include <colorspace_fragment>
  }
`;

export function HazeDome({ radius }: { radius: number }): React.ReactElement {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new Color(stagePalette.zenith) },
          uHorizon: { value: new Color(stagePalette.horizon) },
          uGlow: { value: new Color(stagePalette.glow) },
          uGlowDir: { value: new Vector3(0, 0.12, -1).normalize() },
          uGlowPower: { value: 3 },
          uShade: { value: new Color(stagePalette.shade) },
        },
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[radius, 48, 24]} />
    </mesh>
  );
}
