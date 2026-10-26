import { EDGE_SAMPLES } from "./store";

/*
 * The tissue pull: a finely subdivided sheet carrying the project image, drawn in screen
 * space. Each vertex travels from its place on the curved ring panel to its place in the
 * full-screen hero, but not all at once: points near the pinch leave first and the far edge
 * follows (the peel), while the sheet bunches toward the pinch, lifts, and creases. All the
 * deformation is in the vertex shader; the fragment shader lights the creases.
 */

/** How far behind the pinch the farthest point starts moving (share of the progress). */
export const PEEL_LAG = 0.34;

export const vertexShader = /* glsl */ `
  #define SAMPLES ${EDGE_SAMPLES}
  #define PI 3.141592653589793

  uniform vec2 uTop[SAMPLES];     // panel's top edge on screen, CSS px, left to right
  uniform vec2 uBottom[SAMPLES];  // panel's bottom edge on screen
  uniform vec4 uTo;               // destination rect: x, y, width, height (CSS px)
  uniform vec2 uViewport;         // CSS px
  uniform float uProgress;        // 0 = on the ring, 1 = full screen
  uniform vec2 uPinch;            // pinch point, sheet UV (v up)
  uniform float uTime;            // seconds, drives the crease ripple
  uniform float uWrinkle;         // crease depth
  uniform vec4 uCover;            // UV scale (xy) and offset (zw) that cover-fits the image in uTo
  uniform float uLag;             // PEEL_LAG

  varying vec2 vUv;
  varying float vHeight;

  vec2 edge(vec2 points[SAMPLES], float u) {
    float x = clamp(u, 0.0, 1.0) * float(SAMPLES - 1);
    int i = int(min(floor(x), float(SAMPLES - 2)));
    vec2 a = points[0];
    vec2 b = points[1];
    for (int k = 0; k < SAMPLES - 1; k++) {
      if (k == i) { a = points[k]; b = points[k + 1]; }
    }
    return mix(a, b, x - float(i));
  }

  vec2 source(vec2 st) { return mix(edge(uBottom, st.x), edge(uTop, st.x), st.y); }
  vec2 target(vec2 st) { return uTo.xy + vec2(st.x, 1.0 - st.y) * uTo.zw; }

  // Smootherstep: starts and lands with zero velocity and acceleration, like cloth settling.
  float ease(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

  // This point's own progress: the pinch leads, distance from it lags.
  float local(vec2 st) {
    float d = clamp(distance(st, uPinch) / 1.2, 0.0, 1.0);
    return ease(clamp((uProgress - d * uLag) / (1.0 - uLag), 0.0, 1.0));
  }

  void main() {
    vec2 st = uv;
    float t = local(st);
    vec2 pos = mix(source(st), target(st), t);

    // The pinched point itself, where the sheet gathers toward early in the pull.
    float tp = local(uPinch);
    vec2 pinchNow = mix(source(uPinch), target(uPinch), tp);
    float d = clamp(distance(st, uPinch), 0.0, 1.0);
    float gather = sin(clamp(uProgress / 0.5, 0.0, 1.0) * PI) * (1.0 - d) * 0.16;
    pos += (pinchNow - pos) * gather;

    // Lift and creases while the point is travelling; flat at both ends.
    float travel = sin(t * PI);
    float crease = sin(d * 34.0 - uTime * 3.0 + st.y * 5.0) * uWrinkle * travel * (1.0 - d * 0.5);
    float height = travel * (1.0 - d * 0.7) + crease;
    // Lifted cloth reads larger: push it away from the pinch a touch, as if nearer the eye.
    pos += (pos - pinchNow) * height * 0.035;

    vHeight = height;
    vUv = mix(st, st * uCover.xy + uCover.zw, t);
    gl_Position = vec4(pos.x / uViewport.x * 2.0 - 1.0, 1.0 - pos.y / uViewport.y * 2.0, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uOpacity;

  varying vec2 vUv;
  varying float vHeight;

  void main() {
    // Surface slope from the height field: creases catch the light on one side, shade the other.
    vec3 normal = normalize(vec3(-dFdx(vHeight) * 26.0, dFdy(vHeight) * 26.0, 1.0));
    vec3 light = normalize(vec3(-0.45, 0.6, 0.65));
    float shade = 0.86 + 0.22 * dot(normal, light) + vHeight * 0.05;
    vec4 color = texture2D(uTexture, vUv);
    gl_FragColor = vec4(color.rgb * shade, uOpacity);
    #include <colorspace_fragment>
  }
`;
