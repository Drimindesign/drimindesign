/*
 * The GPU glow pass (/play?gpu): the 2D canvas is uploaded to WebGL2 each frame, its bright
 * pixels (headlights, light bars, lamps, thruster jets, windows) are blurred at half
 * resolution and added back, then a gentle tone curve and vignette grade the frame. The scene
 * itself is still drawn by the 2D renderer, so gameplay is identical; this shows what GPU
 * light can add. Without WebGL2 it returns null and the 2D canvas is shown as before.
 */

/** Luminance where glow starts, and how strongly it's added back. */
const THRESHOLD = 0.7;
const STRENGTH = 1.15;
/** Blur iterations (each a horizontal and a vertical pass) and their spread in texels. */
const SPREADS = [1, 2.2] as const;

const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const BRIGHT = `#version 300 es
precision mediump float;
uniform sampler2D src;
uniform float threshold;
in vec2 uv;
out vec4 o;
void main() {
  vec3 c = texture(src, uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  o = vec4(c * smoothstep(threshold, threshold + 0.25, l), 1.0);
}`;

const BLUR = `#version 300 es
precision mediump float;
uniform sampler2D src;
uniform vec2 step;
in vec2 uv;
out vec4 o;
void main() {
  vec3 c = texture(src, uv).rgb * 0.227;
  c += (texture(src, uv + step * 1.385).rgb + texture(src, uv - step * 1.385).rgb) * 0.316;
  c += (texture(src, uv + step * 3.231).rgb + texture(src, uv - step * 3.231).rgb) * 0.070;
  o = vec4(c, 1.0);
}`;

const COMPOSITE = `#version 300 es
precision mediump float;
uniform sampler2D base;
uniform sampler2D bloom;
uniform float strength;
in vec2 uv;
out vec4 o;
void main() {
  vec3 c = texture(base, uv).rgb + texture(bloom, uv).rgb * strength;
  // Soft shoulder: lights roll off instead of clipping to flat white.
  c = c * 1.12 / (1.0 + c * 0.12);
  // Vignette: the edges fall off a little, drawing the eye to the car.
  float v = smoothstep(1.0, 0.3, length((uv - 0.5) * vec2(1.25, 1.0)));
  o = vec4(c * mix(0.78, 1.0, v), 1.0);
}`;

interface Target {
  texture: WebGLTexture;
  buffer: WebGLFramebuffer;
}

export class GlowPass {
  private readonly canvas: HTMLCanvasElement;
  private readonly base: WebGLTexture;
  private readonly bright: WebGLProgram;
  private readonly blur: WebGLProgram;
  private readonly composite: WebGLProgram;
  private targets: [Target, Target] | null = null;
  private width = 0;
  private height = 0;

  private constructor(
    private readonly source: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
  ) {
    this.canvas = gl.canvas as HTMLCanvasElement;
    this.bright = program(gl, BRIGHT);
    this.blur = program(gl, BLUR);
    this.composite = program(gl, COMPOSITE);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.base = texture(gl);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  /** Puts a WebGL2 canvas over `source` and hides the 2D one, or returns null without WebGL2. */
  static attach(source: HTMLCanvasElement): GlowPass | null {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return null;
    canvas.className = source.className;
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, { position: "absolute", left: "50%", top: "50%", translate: "-50% -50%" });
    source.after(canvas);
    source.style.opacity = "0";
    return new GlowPass(source, gl);
  }

  render(): void {
    const { gl, source } = this;
    if (source.width !== this.width || source.height !== this.height) this.resize();
    if (!this.targets) return;
    const [a, b] = this.targets;
    const halfW = Math.max(1, this.width >> 1);
    const halfH = Math.max(1, this.height >> 1);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.base);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    // Bright pixels, at half resolution.
    gl.viewport(0, 0, halfW, halfH);
    gl.useProgram(this.bright);
    gl.uniform1i(gl.getUniformLocation(this.bright, "src"), 0);
    gl.uniform1f(gl.getUniformLocation(this.bright, "threshold"), THRESHOLD);
    this.draw(a.buffer);

    // Blur them: horizontal into b, vertical back into a, twice with a wider spread.
    gl.useProgram(this.blur);
    gl.uniform1i(gl.getUniformLocation(this.blur, "src"), 0);
    const step = gl.getUniformLocation(this.blur, "step");
    for (const spread of SPREADS) {
      gl.bindTexture(gl.TEXTURE_2D, a.texture);
      gl.uniform2f(step, spread / halfW, 0);
      this.draw(b.buffer);
      gl.bindTexture(gl.TEXTURE_2D, b.texture);
      gl.uniform2f(step, 0, spread / halfH);
      this.draw(a.buffer);
    }

    // The frame, plus its glow, graded.
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.composite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.base);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, a.texture);
    gl.uniform1i(gl.getUniformLocation(this.composite, "base"), 0);
    gl.uniform1i(gl.getUniformLocation(this.composite, "bloom"), 1);
    gl.uniform1f(gl.getUniformLocation(this.composite, "strength"), STRENGTH);
    this.draw(null);
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose(): void {
    this.canvas.remove();
    this.source.style.opacity = "";
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private draw(target: WebGLFramebuffer | null): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  /* Matches the 2D canvas: same pixels, same CSS size (scaled up with hard pixel edges). */
  private resize(): void {
    const { gl, source } = this;
    this.width = source.width;
    this.height = source.height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = source.style.width;
    this.canvas.style.height = source.style.height;
    if (this.targets) for (const t of this.targets) {
      gl.deleteTexture(t.texture);
      gl.deleteFramebuffer(t.buffer);
    }
    const make = (): Target => {
      const tex = texture(gl);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Math.max(1, this.width >> 1), Math.max(1, this.height >> 1), 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const buffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { texture: tex, buffer };
    };
    this.targets = [make(), make()];
  }
}

/* Linear filtering: the composite samples the base 1:1 (so it stays crisp), the glow smoothly. */
function texture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function program(gl: WebGL2RenderingContext, fragment: string): WebGLProgram {
  const p = gl.createProgram();
  for (const [type, code] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("WebGL shader could not be created");
    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    gl.attachShader(p, shader);
  }
  gl.bindAttribLocation(p, 0, "p");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "WebGL link failed");
  return p;
}
