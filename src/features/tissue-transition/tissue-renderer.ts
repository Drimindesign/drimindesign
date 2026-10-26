import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector4,
  WebGLRenderer,
  type Texture,
} from "three";
import { fragmentShader, LIFT_END, LIFT_REACH, LIFT_RISE, PEEL_LAG, PINCH, shadowFragmentShader, vertexShader } from "./shaders";
import { EDGE_SAMPLES, type TissueOrigin } from "./store";

/** Crease depth of the sheet mid-pull (height units of the shader). */
const WRINKLE = 0.22;

/*
 * Draws the tissue sheet on the transition canvas (loaded lazily with the first pull; three
 * is already cached by the ring). Two draws of one sheet: its shadow, then the sheet itself.
 * Nothing renders unless asked.
 */
export class TissueRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera();
  private readonly material: ShaderMaterial;
  private readonly shadow: ShaderMaterial;
  private readonly geometry: PlaneGeometry;
  private texture: Texture | null = null;
  private imageAspect = 7 / 5;

  constructor(canvas: HTMLCanvasElement, segments: number) {
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
    this.renderer.setClearColor(0x000000, 0);
    this.geometry = new PlaneGeometry(1, 1, segments, segments);
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      uniforms: {
        uTop: { value: Array.from({ length: EDGE_SAMPLES }, () => new Vector2()) },
        uBottom: { value: Array.from({ length: EDGE_SAMPLES }, () => new Vector2()) },
        uTo: { value: new Vector4() },
        uViewport: { value: new Vector2() },
        uProgress: { value: 0 },
        uPinch: { value: new Vector2(PINCH[0], PINCH[1]) },
        uTime: { value: 0 },
        uWrinkle: { value: WRINKLE },
        uCover: { value: new Vector4(1, 1, 0, 0) },
        uLiftEnd: { value: LIFT_END },
        uReach: { value: LIFT_REACH },
        uRise: { value: LIFT_RISE },
        uLag: { value: PEEL_LAG },
        uShadow: { value: 0 },
        uTexture: { value: null },
        uOpacity: { value: 1 },
      },
    });
    // The shadow shares every uniform object with the sheet, so one update moves both.
    this.shadow = new ShaderMaterial({
      vertexShader,
      fragmentShader: shadowFragmentShader,
      transparent: true,
      depthTest: false,
      uniforms: { ...this.material.uniforms, uShadow: { value: 1 } },
    });
    const shadow = new Mesh(this.geometry, this.shadow);
    const sheet = new Mesh(this.geometry, this.material);
    shadow.renderOrder = 0;
    sheet.renderOrder = 1;
    for (const mesh of [shadow, sheet]) {
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
  }

  async load(url: string): Promise<void> {
    const texture = await new TextureLoader().loadAsync(url);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.texture?.dispose();
    this.texture = texture;
    const image = texture.image as { width?: number; height?: number } | undefined;
    if (image?.width && image.height) this.imageAspect = image.width / image.height;
    this.material.uniforms.uTexture.value = texture;
  }

  setOrigin(origin: TissueOrigin): void {
    const top = this.material.uniforms.uTop.value as Vector2[];
    const bottom = this.material.uniforms.uBottom.value as Vector2[];
    for (let i = 0; i < EDGE_SAMPLES; i++) {
      top[i].set(origin.top[i * 2], origin.top[i * 2 + 1]);
      bottom[i].set(origin.bottom[i * 2], origin.bottom[i * 2 + 1]);
    }
  }

  /** Sizes the canvas to the viewport; the destination is the full screen, image cover-fitted. */
  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    (this.material.uniforms.uViewport.value as Vector2).set(width, height);
    (this.material.uniforms.uTo.value as Vector4).set(0, 0, width, height);
    const aspect = width / height;
    const cover = this.material.uniforms.uCover.value as Vector4;
    if (aspect > this.imageAspect) {
      const sy = this.imageAspect / aspect;
      cover.set(1, sy, 0, (1 - sy) / 2);
    } else {
      const sx = aspect / this.imageAspect;
      cover.set(sx, 1, (1 - sx) / 2, 0);
    }
  }

  render(progress: number, time: number, opacity = 1): void {
    this.material.uniforms.uProgress.value = progress;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uOpacity.value = opacity;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.texture?.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.shadow.dispose();
    this.renderer.dispose();
  }
}
