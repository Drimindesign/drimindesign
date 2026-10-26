import { EDGE_SAMPLES } from "./store";

/*
 * The tissue pull: a finely subdivided sheet carrying the project image, drawn in screen
 * space. It happens the way you'd lift a tissue: first only the top-right corner is pinched
 * and comes up off the panel (the rest still lies flat, casting a soft shadow under the
 * corner), then the sheet is drawn out of the panel and spreads to fill the screen, corner
 * first and the far corner last, bunching and creasing in flight. All the deformation is in
 * the vertex shader; the fragment shaders light the creases and draw the shadow.
 */

/** The pinched corner, in sheet UV (v up): top right. */
export const PINCH: readonly [number, number] = [1, 1];
/** Share of the progress spent lifting the corner before the sheet starts to spread. */
export const LIFT_END = 0.32;
/** How far along the diagonal (0…1, from the corner) the lift bends the sheet. */
export const LIFT_REACH = 0.72;
/** How far the corner rises on screen at the top of the lift (share of the panel's diagonal). */
export const LIFT_RISE = 0.11;
/** How far behind the corner the farthest point starts spreading (share of the spread). */
export const PEEL_LAG = 0.45;

export const vertexShader = /* glsl */ `
  #define SAMPLES ${EDGE_SAMPLES}
  #define PI 3.141592653589793

  uniform vec2 uTop[SAMPLES];     // panel's top edge on screen, CSS px, left to right
  uniform vec2 uBottom[SAMPLES];  // panel's bottom edge on screen
  uniform vec4 uTo;               // destination rect: x, y, width, height (CSS px)
  uniform vec2 uViewport;         // CSS px
  uniform float uProgress;        // 0 = on the ring, 1 = full screen
  uniform vec2 uPinch;            // PINCH: the pinched corner, sheet UV (v up)
  uniform float uTime;            // seconds, drives the crease ripple
  uniform float uWrinkle;         // crease depth
  uniform vec4 uCover;            // UV scale (xy) and offset (zw) that cover-fits the image in uTo
  uniform float uLiftEnd;         // LIFT_END
  uniform float uReach;           // LIFT_REACH
  uniform float uRise;            // LIFT_RISE
  uniform float uLag;             // PEEL_LAG
  uniform float uShadow;          // 1 for the shadow pass (drawn first), 0 for the sheet

  varying vec2 vUv;
  varying vec2 vSt;
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

  // A point's own spread progress: the corner leads, distance from it lags.
  float spread(float grow, float d) { return ease(clamp((grow - d * uLag) / (1.0 - uLag), 0.0, 1.0)); }

  void main() {
    vec2 st = uv;
    // 0 at the pinched corner, 1 at the opposite one.
    float d = clamp(distance(st, uPinch) * 0.70710678, 0.0, 1.0);

    // The pinch: only the corner comes up; the rest of the sheet still lies on the panel.
    float lift = ease(clamp(uProgress / uLiftEnd, 0.0, 1.0));
    float bend = pow(1.0 - smoothstep(0.0, uReach, d), 1.6);

    // The pull: starts just before the corner is fully up, so the two read as one gesture.
    float growStart = uLiftEnd * 0.7;
    float grow = clamp((uProgress - growStart) / (1.0 - growStart), 0.0, 1.0);
    float t = spread(grow, d);
    vec2 rest = mix(source(st), target(st), t);

    // The raised corner, nearer the eye: drawn up the screen and magnified away from where
    // the sheet still clings. It hands over to the pull as the sheet spreads.
    float raised = lift * bend * (1.0 - grow);
    vec2 cling = source(vec2(1.0) - uPinch);
    float span = distance(source(uPinch), cling);
    vec2 pos = rest + (rest - cling) * raised * 0.07;
    pos.y -= raised * span * uRise;

    // The sheet gathers toward the corner early in the pull.
    vec2 cornerNow = mix(source(uPinch), target(uPinch), spread(grow, 0.0));
    float gather = sin(clamp(grow / 0.5, 0.0, 1.0) * PI) * (1.0 - d) * 0.16;
    pos += (cornerNow - pos) * gather;

    // In flight: lift and creases while a point travels; flat at both ends.
    float travel = sin(t * PI);
    float crease = sin(d * 34.0 - uTime * 3.0 + st.y * 5.0) * uWrinkle * travel * (1.0 - d * 0.5);
    float flight = travel * (1.0 - d * 0.6) + crease;
    // Cloth in flight reads larger: push it away from the corner a touch.
    pos += (pos - cornerNow) * flight * 0.035;

    float height = raised * 1.4 + flight;
    // The shadow stays where the sheet lies, cast down and right (light from the top left).
    if (uShadow > 0.5) pos = rest + vec2(0.5, 0.8) * max(height, 0.0) * span * 0.05;

    vHeight = height;
    vSt = st;
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
    // Surface slope from the height field: creases and the corner's bend catch the light on
    // one side and shade the other.
    vec3 normal = normalize(vec3(-dFdx(vHeight) * 26.0, dFdy(vHeight) * 26.0, 1.0));
    vec3 light = normalize(vec3(-0.45, 0.6, 0.65));
    float shade = 0.86 + 0.22 * dot(normal, light) + vHeight * 0.05;
    vec4 color = texture2D(uTexture, vUv);
    gl_FragColor = vec4(color.rgb * shade, uOpacity);
    #include <colorspace_fragment>
  }
`;

/* The shadow under whatever is lifted: darker the higher it is, soft toward the sheet's edges. */
export const shadowFragmentShader = /* glsl */ `
  uniform float uOpacity;

  varying vec2 vSt;
  varying float vHeight;

  void main() {
    float edge = smoothstep(0.0, 0.08, min(min(vSt.x, 1.0 - vSt.x), min(vSt.y, 1.0 - vSt.y)));
    gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(vHeight, 0.0, 1.0) * 0.26 * edge * uOpacity);
  }
`;
