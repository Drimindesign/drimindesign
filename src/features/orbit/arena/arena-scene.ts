import type * as Three from "three";
import { groundAt, type ArenaFiles } from "./arena-data";
import { clipLibrary, makeFighter, type ArenaFighter } from "./arena-fighters";
import { buildAtmosphere, type Atmosphere } from "./atmosphere";
import { makeCameraRig, type CameraRig } from "./camera-rig";
import type { CombatInput } from "./combat";
import { FightDirector, type FightHud, type FightSound, type Shot } from "./fight-director";
import { buildFire, type Fire } from "./fire";
import { buildPlate, type Plate } from "./plate";

/*
 * The 3D arena: the photoreal set (plate), the fighters lit to match it, their shadows on the
 * lawn, the bonfire, the night air, the camera, and the fight. Lighting is the realism: the set's
 * own light probe gives the fighters the yard's ambient colour, the bonfire behind them is a hot
 * flickering rim, the deck lamp a soft warm front fill (and casts their shadows), the moon a cool
 * edge; AgX tone mapping matches the render's grade.
 */

/** Light levels, tuned by eye against the render: deck lamp (cd), moon (lux), probe ambient, exposure. */
export const LIGHT = { lamp: 70, lampFalloff: 1.6, moon: 0.9, ambient: 0.75, exposure: 1.1, shadow: 0.6, contact: 0.62 } as const;
/** Shadows sit just over the soil the lane is laid on (m). */
const GRASS = 0.03;
/** Sharpness budget: device-pixel cap, and the deck lamp's shadow map. */
const QUALITY = { dpr: 1.75, shadowMap: 1024, floor: 1, slowFrame: 22, judgeEvery: 2 } as const;
/**
 * The playable stretch of the fight line: shifted clear of the old tree's trunk (which stands just
 * in front of the line's left end) so the fight stays on open lawn; the trunk still frames it.
 */
const LANE = { shift: 1.1, trim: 1.1 } as const;
/** Framing for each camera position: the wide from the deck, the low angle on the lawn. */
const FRAMING: readonly Shot[] = [
  { near: 26, far: 40, step: 0.35 },
  { near: 30, far: 42, step: 0.12 },
];
/** Every clip the fight plays. */
const CLIPS = {
  hero: ["hero_idle", "hero_walk", "hero_run", "hero_jump", "hero_slash1", "hero_slash2", "hero_kick", "hero_spin", "hero_master", "hero_power", "hero_block", "hero_hit1", "hero_hit2", "hero_death", "getup"],
  foe: ["foe_idle", "foe_walk", "foe_run", "foe_slash1", "foe_slash2", "foe_heavy", "foe_kick", "foe_block", "foe_blockhit", "foe_hit1", "foe_hit2", "foe_death", "getup"],
} as const;

export class ArenaScene {
  private readonly renderer: Three.WebGLRenderer;
  private readonly scene: Three.Scene;
  private readonly rig: CameraRig;
  private readonly plates: Plate[];
  private readonly atmosphere: Atmosphere;
  private readonly fighters: ArenaFighter[];
  private readonly fire: Fire | null;
  private readonly director: FightDirector;
  /** The player's controls, written by the page (keys, touch pads), read every frame. */
  readonly input: CombatInput = { move: 0, jump: false, attack: false, block: false, master: false };
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

  private constructor(private readonly THREE: typeof Three, parts: { scene: Three.Scene; rig: CameraRig; plates: Plate[]; atmosphere: Atmosphere; fighters: ArenaFighter[]; renderer: Three.WebGLRenderer; fire: Fire | null; director: FightDirector }) {
    this.renderer = parts.renderer;
    this.scene = parts.scene;
    this.rig = parts.rig;
    this.plates = parts.plates;
    this.atmosphere = parts.atmosphere;
    this.fighters = parts.fighters;
    this.fire = parts.fire;
    this.director = parts.director;
  }

  static async create(canvas: HTMLCanvasElement, files: ArenaFiles, hud: FightHud, sound: FightSound): Promise<ArenaScene> {
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
    const plates = await Promise.all(
      files.shots.map(async (shot, n) => {
        const images = await Promise.all(shot.meta.slices.map(async (_, i) => ({ colour: await decode(shot.colour[i]), sway: await decode(shot.sway[i]), depth: shot.depth[i] })));
        const plate = buildPlate(THREE, { meta: shot.meta }, images);
        plate.group.visible = n === 0;
        scene.add(plate.group);
        return plate;
      }),
    );

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

    // The fighters: the hero, two knights, the brute (all loaded now; the waves bring them on).
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const clips = clipLibrary(loader);
    const bodies = await Promise.all([
      makeFighter(THREE, loader, clips, "hero", files.hero, CLIPS.hero),
      makeFighter(THREE, loader, clips, "knight", files.knight, CLIPS.foe),
      makeFighter(THREE, loader, clips, "knight", files.knight, CLIPS.foe),
      makeFighter(THREE, loader, clips, "brute", files.brute, CLIPS.foe),
    ]);
    const face = Math.atan2(along.x, along.z);
    for (const b of bodies) {
      b.play(b.kind === "hero" ? "hero_idle" : "foe_idle", { fade: 0 });
      scene.add(b.root);
    }
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
    for (const f of bodies) {
      const pad = new THREE.Mesh(blob, contact);
      pad.position.y = GRASS - 0.01;
      pad.renderOrder = 1;
      f.root.add(pad);
    }

    const atmosphere = buildAtmosphere(THREE, at(0), along, lamp, canvas.height * 0.9);
    scene.add(atmosphere.group);

    // The bonfire behind the fight, with the moon's shafts through the canopy.
    const fire = meta.fire ? buildFire(THREE, new THREE.Vector3().fromArray(meta.fire), moon ? new THREE.Vector3().fromArray(moon.direction) : null, canvas.height * 0.9) : null;
    if (fire) scene.add(fire.group);

    const target = at(0).setY(groundAt(meta, 0) + 1.15);
    const rig = makeCameraRig(THREE, new THREE.Vector3().fromArray(meta.eye), target);
    const lane = (s: number): Three.Vector3 => at(s + LANE.shift);
    // A cut swaps the set to the one shot from the new eye point, and moves the camera there.
    const cutTo = (index: number): void => {
      plates.forEach((p, n) => (p.group.visible = n === index));
      rig.cut(new THREE.Vector3().fromArray(files.shots[index].meta.eye), FRAMING[index].far, FRAMING[index].step);
    };
    const firePoint = meta.fire ? new THREE.Vector3().fromArray(meta.fire) : null;
    const director = new FightDirector(THREE, lane, face, meta.fight.half - LANE.trim, bodies, rig, hud, sound, FRAMING.slice(0, files.shots.length), cutTo, firePoint);
    scene.add(director.sparks);
    const arena = new ArenaScene(THREE, { scene, rig, plates, atmosphere, fighters: bodies, renderer, fire, director });
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
    this.director.update(dt, this.input);
    // One-shot presses are consumed each frame; held ones (move, block) stay until released.
    this.input.attack = false;
    this.input.jump = false;
    this.input.master = false;
    this.fire?.update(this.time);
    for (const p of this.plates) if (p.group.visible) p.update(this.time);
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
    for (const p of this.plates) p.dispose();
    this.atmosphere.dispose();
    this.fire?.dispose();
    this.director.dispose();
    for (const f of this.fighters) f.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
