import type * as Three from "three";
import { groundAt, type ArenaFiles } from "./arena-data";
import { makeFighter, type ArenaFighter } from "./arena-fighters";
import { buildAtmosphere, type Atmosphere } from "./atmosphere";
import { makeCameraRig, type CameraRig } from "./camera-rig";
import { buildPlate, type Plate } from "./plate";

/*
 * The 3D arena: the photoreal set (plate), the fighters lit to match it, their shadows on the
 * lawn, the night air, and the camera. Lighting is the realism: the set's own light probe gives
 * the fighters the yard's ambient colour, the deck lamp is their warm key light (and casts their
 * shadows), the moon a cool rim from behind; AgX tone mapping matches the render's grade.
 */

/** Light levels, tuned by eye against the render: deck lamp (cd), moon (lux), probe ambient, exposure. */
export const LIGHT = { lamp: 70, lampFalloff: 1.6, moon: 0.9, ambient: 0.75, exposure: 1.1, shadow: 0.6, contact: 0.62 } as const;
/** Shadows sit just over the soil the lane is laid on (m). */
const GRASS = 0.03;
/** Sharpness budget: device-pixel cap, and the deck lamp's shadow map. */
const QUALITY = { dpr: 1.75, shadowMap: 1024, floor: 1, slowFrame: 22, judgeEvery: 2 } as const;
/** The look test's stand-off: where on the line (m from the centre) each fighter stands. */
const STANCE = { hero: -1.15, knight: 1.15 } as const;

export class ArenaScene {
  private readonly renderer: Three.WebGLRenderer;
  private readonly scene: Three.Scene;
  private readonly rig: CameraRig;
  private readonly plate: Plate;
  private readonly atmosphere: Atmosphere;
  private readonly fighters: ArenaFighter[];
  private readonly heads: Three.Vector3[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private frames = 0;
  private fpsSince = 0;
  /* Adaptive sharpness: frames slower than QUALITY.slowFrame (ms) on average lower the pixel ratio a step. */
  private slowSum = 0;
  private slowCount = 0;
  private judged = 0;
  /** Frames per second over the last second (for the look test's readout). */
  fps = 0;

  private constructor(private readonly THREE: typeof Three, parts: { scene: Three.Scene; rig: CameraRig; plate: Plate; atmosphere: Atmosphere; fighters: ArenaFighter[]; renderer: Three.WebGLRenderer }) {
    this.renderer = parts.renderer;
    this.scene = parts.scene;
    this.rig = parts.rig;
    this.plate = parts.plate;
    this.atmosphere = parts.atmosphere;
    this.fighters = parts.fighters;
    for (let i = 0; i < this.fighters.length; i++) this.heads.push(new THREE.Vector3());
  }

  static async create(canvas: HTMLCanvasElement, files: ArenaFiles): Promise<ArenaScene> {
    const [THREE, { GLTFLoader }, { MeshoptDecoder }, { HDRLoader }] = await Promise.all([
      import("three"),
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/libs/meshopt_decoder.module.js"),
      import("three/addons/loaders/HDRLoader.js"),
    ]);
    const { meta } = files;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY.dpr));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = LIGHT.exposure * 2 ** meta.exposure * 0.5;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene();

    // The set.
    const decode = async (blob: Blob): Promise<Three.Texture> => {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY" });
      const texture = new THREE.Texture(bitmap);
      texture.flipY = false;
      return texture;
    };
    const images = await Promise.all(meta.slices.map(async (_, i) => ({ colour: await decode(files.colour[i]), sway: await decode(files.sway[i]), depth: files.depth[i] })));
    const plate = buildPlate(THREE, { meta }, images);
    scene.add(plate.group);

    // Ambient light from the yard itself (the probe rendered at the fight spot).
    const hdr = new HDRLoader().parse(files.probe);
    const probe = new THREE.DataTexture(hdr.data, hdr.width, hdr.height, THREE.RGBAFormat, hdr.type);
    probe.mapping = THREE.EquirectangularReflectionMapping;
    probe.colorSpace = THREE.LinearSRGBColorSpace;
    probe.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromEquirectangular(probe).texture;
    probe.dispose();
    pmrem.dispose();
    scene.environment = environment;
    scene.environmentIntensity = LIGHT.ambient;

    // The fight line.
    const centre = new THREE.Vector3().fromArray(meta.fight.centre);
    const along = new THREE.Vector3().fromArray(meta.fight.along).normalize();
    const at = (t: number): Three.Vector3 => centre.clone().addScaledVector(along, t).setY(groundAt(meta, t));

    // Key: the deck lamp, warm, casting the fighters' shadows onto the lawn.
    const deck = meta.lights.find((l) => l.name === "DeckLamp");
    let lamp: { position: Three.Vector3; axis: Three.Vector3 } | null = null;
    if (deck) {
      const spot = new THREE.SpotLight(new THREE.Color(...deck.colour), LIGHT.lamp, 30, deck.angle ? deck.angle / 2 : 1, deck.blend ?? 0.6, LIGHT.lampFalloff);
      spot.position.fromArray(deck.position);
      spot.target.position.copy(spot.position).add(new THREE.Vector3().fromArray(deck.direction).multiplyScalar(5));
      spot.castShadow = true;
      spot.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
      spot.shadow.camera.near = 0.5;
      spot.shadow.camera.far = 20;
      spot.shadow.bias = -0.0004;
      spot.shadow.normalBias = 0.02;
      spot.shadow.radius = 4;
      scene.add(spot, spot.target);
      lamp = { position: spot.position.clone(), axis: new THREE.Vector3().fromArray(deck.direction).normalize() };
    }
    // Rim: the moon behind the yard, cool.
    const moon = meta.lights.find((l) => l.type === "SUN");
    if (moon) {
      const light = new THREE.DirectionalLight(new THREE.Color(...moon.colour), LIGHT.moon);
      light.position.copy(centre).addScaledVector(new THREE.Vector3().fromArray(moon.direction), -20);
      light.target.position.copy(centre);
      scene.add(light, light.target);
    }

    // The fighters' shadows fall on the real lawn: an invisible strip along the line that only darkens.
    const strip = new THREE.PlaneGeometry(meta.fight.half * 2 + 2, 4, 48, 4);
    strip.rotateX(-Math.PI / 2);
    strip.rotateY(Math.atan2(along.x, along.z) - Math.PI / 2);
    const pos = strip.getAttribute("position") as Three.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i);
      pos.setY(i, groundAt(meta, p.dot(along)) + GRASS);
    }
    strip.translate(centre.x, 0, centre.z);
    const catcher = new THREE.Mesh(strip, new THREE.ShadowMaterial({ opacity: LIGHT.shadow, color: 0x05030a, polygonOffset: true, polygonOffsetFactor: -4 }));
    catcher.receiveShadow = true;
    scene.add(catcher);

    // The fighters, facing each other.
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const [hero, knight] = await Promise.all([
      makeFighter(THREE, loader, "hero", files.hero, ["hero_idle"]),
      makeFighter(THREE, loader, "knight", files.knight, ["foe_idle"]),
    ]);
    const face = Math.atan2(along.x, along.z);
    hero.root.position.copy(at(STANCE.hero));
    hero.root.rotation.y = face;
    knight.root.position.copy(at(STANCE.knight));
    knight.root.rotation.y = face + Math.PI;
    hero.play("hero_idle", 0);
    knight.play("foe_idle", 0);
    scene.add(hero.root, knight.root);
    // Contact shadows: where a body meets the grass the light can't reach, whatever the lamp does.
    const contact = new THREE.ShaderMaterial({
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float strength; varying vec2 vUv; void main() { float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.0, 0.0, 0.0, strength * pow(max(0.0, 1.0 - d), 1.6)); }",
      uniforms: { strength: { value: LIGHT.contact } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
    });
    const blob = new THREE.PlaneGeometry(1.1, 0.75);
    blob.rotateX(-Math.PI / 2);
    for (const f of [hero, knight]) {
      const pad = new THREE.Mesh(blob, contact);
      pad.position.y = GRASS - 0.01;
      pad.renderOrder = 1;
      f.root.add(pad);
    }

    const atmosphere = buildAtmosphere(THREE, at(0), along, lamp, canvas.height * 0.9);
    scene.add(atmosphere.group);

    const target = at(0).setY(groundAt(meta, 0) + 1.15);
    const rig = makeCameraRig(THREE, new THREE.Vector3().fromArray(meta.eye), target);
    const arena = new ArenaScene(THREE, { scene, rig, plate, atmosphere, fighters: [hero, knight], renderer });
    arena.disposables.push(environment, strip, catcher.material as Three.Material, contact, blob);
    // Upload everything now (shaders, textures, meshes) so the first frames don't hitch.
    await renderer.compileAsync(scene, rig.camera);
    return arena;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.rig.resize(width, height);
  }

  look(yaw: number, pitch: number): void {
    this.rig.look(yaw, pitch);
  }

  zoom(fov: number): void {
    this.rig.zoom(fov);
  }

  punch(): void {
    this.rig.punch(7);
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private step(dt: number): void {
    this.time += dt;
    // Each fighter's eyes on the other's face.
    this.fighters.forEach((_, i) => {
      const other = this.fighters[1 - i];
      this.heads[i].copy(other.root.position).setY(other.root.position.y + 1.6);
    });
    this.fighters.forEach((f, i) => f.update(dt, this.heads[i]));
    this.plate.update(this.time);
    this.rig.update(dt, this.time);
    this.atmosphere.update(this.time, this.rig.camera);
    this.renderer.render(this.scene, this.rig.camera);
    this.frames++;
    this.adapt(dt);
    if (this.time - this.fpsSince >= 1) {
      this.fps = Math.round(this.frames / (this.time - this.fpsSince));
      this.frames = 0;
      this.fpsSince = this.time;
    }
  }

  private adapt(dt: number): void {
    this.slowSum += dt * 1000;
    this.slowCount++;
    if (this.time - this.judged < QUALITY.judgeEvery) return;
    const average = this.slowSum / this.slowCount;
    this.slowSum = 0;
    this.slowCount = 0;
    this.judged = this.time;
    const ratio = this.renderer.getPixelRatio();
    if (average > QUALITY.slowFrame && ratio > QUALITY.floor) {
      const size = this.renderer.getSize(new this.THREE.Vector2());
      this.renderer.setPixelRatio(Math.max(QUALITY.floor, ratio - 0.25));
      this.renderer.setSize(size.x, size.y, false);
    }
  }

  dispose(): void {
    this.stop();
    this.plate.dispose();
    this.atmosphere.dispose();
    for (const f of this.fighters) f.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
