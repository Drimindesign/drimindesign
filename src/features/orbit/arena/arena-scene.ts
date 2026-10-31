import type * as Three from "three";
import { groundAt, type ArenaFiles, type ArenaMeta } from "./arena-data";
import { clipLibrary, makeFighter, type ArenaFighter } from "./arena-fighters";
import type { ArenaLevel } from "./arena-levels";
import { buildAtmosphere, type Atmosphere } from "./atmosphere";
import { buildBlood, type Blood } from "./blood";
import { makeCameraRig, type CameraRig } from "./camera-rig";
import type { CombatInput } from "./combat";
import { FightDirector, type FightHud, type FightSound } from "./fight-director";
import { buildFire, type Fire } from "./fire";
import { buildPlate, type Plate } from "./plate";
import { buildRain, type Weather } from "./weather";

/*
 * The 3D arena: the photoreal set (plate), the fighters lit to match it, their shadows on the
 * ground, the level's live effects (bonfire, rain and lightning), the night air, blood, the camera,
 * and the fight. Lighting is the realism: the set's own light probe gives the fighters the place's
 * ambient colour; its real lamps (exported from the render) light and shadow them; and each fighter
 * is shaded by how lit the ground under them is in the render, so walking into the tree's shadow
 * darkens them the way it darkens the grass. AgX tone mapping matches the render's grade.
 */

/** Light levels, matched by eye to the renders: lamps (cd per watt), moon (lux per unit), probe ambient, exposure. */
export const LIGHT = { spotPerWatt: 0.2, pointPerWatt: 0.07, moonPerUnit: 0.2, ambient: 0.42, exposure: 0.9, shadow: 0.62, contact: 0.62 } as const;
/** Local shading from the render: darkest and brightest a fighter gets (multiplier on their colour). */
const SHADE = { min: 0.42, max: 1.05, floor: 0.32, gain: 0.78 } as const;
/** Shadows sit just over the ground the lane is laid on (m). */
const GRASS = 0.03;
/** Sharpness budget: device-pixel cap, and the key light's shadow map. */
const QUALITY = { dpr: 1.75, shadowMap: 1024, floor: 1, slowFrame: 22, judgeEvery: 2 } as const;
/** Every clip the fight plays. */
const CLIPS = {
  hero: ["hero_idle", "hero_walk", "hero_run", "hero_jump", "hero_draw", "hero_sheathe", "hero_slash1", "hero_slash2", "hero_kick", "hero_spin", "hero_master", "hero_power", "hero_block", "hero_hit1", "hero_hit2", "hero_death", "getup"],
  foe: ["foe_idle", "foe_walk", "foe_run", "foe_slash1", "foe_slash2", "foe_heavy", "foe_kick", "foe_block", "foe_blockhit", "foe_hit1", "foe_hit2", "foe_death", "getup"],
} as const;

export class ArenaScene {
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
  /** Frames per second over the last second (for testing on phones). */
  fps = 0;

  private constructor(
    private readonly THREE: typeof Three,
    private readonly renderer: Three.WebGLRenderer,
    private readonly scene: Three.Scene,
    private readonly rig: CameraRig,
    private readonly plates: Plate[],
    private readonly atmosphere: Atmosphere,
    private readonly fighters: ArenaFighter[],
    private readonly director: FightDirector,
    private readonly effects: { fire: Fire | null; rain: Weather | null; blood: Blood },
    private readonly hud: FightHud,
  ) {}

  static async create(canvas: HTMLCanvasElement, files: ArenaFiles, level: ArenaLevel, hud: FightHud, sound: FightSound): Promise<ArenaScene> {
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
    const disposables: { dispose(): void }[] = [];

    // The set, one per camera position.
    const decode = async (blob: Blob): Promise<Three.Texture> => {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY" });
      const texture = new THREE.Texture(bitmap);
      texture.flipY = false;
      return texture;
    };
    const sets = await Promise.all(
      files.shots.map(async (shot) => {
        const images = await Promise.all(shot.meta.slices.map(async (_, i) => ({ colour: await decode(shot.colour[i]), sway: await decode(shot.sway[i]), depth: shot.depth[i] })));
        return { images, plate: buildPlate(THREE, { meta: shot.meta }, images) };
      }),
    );
    const plates = sets.map((s, n) => {
      s.plate.group.visible = n === 0;
      scene.add(s.plate.group);
      return s.plate;
    });

    // Ambient light from the place itself (the probe rendered at the fight spot).
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
    disposables.push(environment);

    // The fight line, and the ground under any point near it.
    const centre = new THREE.Vector3().fromArray(meta.fight.centre);
    const along = new THREE.Vector3().fromArray(meta.fight.along).normalize();
    const at = (t: number): Three.Vector3 => centre.clone().addScaledVector(along, t).setY(groundAt(meta, t));
    const groundUnder = (x: number, z: number): number => groundAt(meta, (x - centre.x) * along.x + (z - centre.z) * along.z);

    const lamp = addLights(THREE, scene, meta, centre);

    // The fighters' shadows fall on the real ground: an invisible strip along the line that only darkens.
    const strip = new THREE.PlaneGeometry(meta.fight.half * 2 + 2, 4, 48, 4);
    strip.rotateX(-Math.PI / 2);
    strip.rotateY(Math.atan2(along.x, along.z) - Math.PI / 2);
    const pos = strip.getAttribute("position") as Three.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i);
      pos.setY(i, groundAt(meta, p.dot(along)) + GRASS);
    }
    strip.translate(centre.x, 0, centre.z);
    const catcherMaterial = new THREE.ShadowMaterial({ opacity: LIGHT.shadow, color: 0x05030a, polygonOffset: true, polygonOffsetFactor: -4 });
    const catcher = new THREE.Mesh(strip, catcherMaterial);
    catcher.receiveShadow = true;
    scene.add(catcher);
    disposables.push(strip, catcherMaterial);

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
    // Contact shadows: where a body meets the ground the light can't reach, whatever the lamps do.
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
    disposables.push(contact, blob);
    for (const b of bodies) {
      b.play(b.kind === "hero" ? "hero_idle" : "foe_idle", { fade: 0 });
      const pad = new THREE.Mesh(blob, contact);
      pad.position.y = GRASS - 0.01;
      pad.renderOrder = 1;
      b.root.add(pad);
      scene.add(b.root);
    }

    const atmosphere = buildAtmosphere(THREE, at(0), along, lamp, canvas.height * 0.9);
    scene.add(atmosphere.group);
    const moon = meta.lights.find((l) => l.type === "SUN");
    const fire = level.fire && meta.fire ? buildFire(THREE, new THREE.Vector3().fromArray(meta.fire), moon ? new THREE.Vector3().fromArray(moon.direction) : null, canvas.height * 0.9) : null;
    if (fire) scene.add(fire.group);
    const rain = level.rain ? buildRain(THREE, at(0), along, groundUnder, canvas.height * 0.9, (s) => sound.thunder(s)) : null;
    if (rain) scene.add(rain.group);
    const blood = buildBlood(THREE, groundUnder);
    scene.add(blood.group);

    const target = at(0).setY(groundAt(meta, 0) + 1.15);
    const rig = makeCameraRig(THREE, new THREE.Vector3().fromArray(meta.eye), target);
    const lane = (s: number): Three.Vector3 => at(s + level.lane.shift);
    const shade = laneShade(THREE, sets[0].images.map((i) => i.colour.image as ImageBitmap), meta, (s) => lane(s), meta.fight.half - level.lane.trim);
    // A cut swaps the set to the one shot from the new eye point, and moves the camera there.
    const cutTo = (index: number): void => {
      plates.forEach((p, n) => (p.group.visible = n === index));
      rig.cut(new THREE.Vector3().fromArray(files.shots[index].meta.eye), level.framing[index].far, level.framing[index].step);
    };
    const director = new FightDirector(THREE, {
      lane,
      face,
      half: meta.fight.half - level.lane.trim,
      bodies,
      rig,
      hud,
      sound,
      shots: level.framing.slice(0, files.shots.length),
      cutTo,
      fire: fire && meta.fire ? new THREE.Vector3().fromArray(meta.fire) : null,
      blood,
      shade,
      opening: level.opening,
    });
    scene.add(director.sparks);
    if (rain) sound.rain(1);
    const arena = new ArenaScene(THREE, renderer, scene, rig, plates, atmosphere, bodies, director, { fire, rain, blood }, hud);
    arena.disposables.push(...disposables);
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
    const scale = this.director.update(dt, this.input);
    // One-shot presses are consumed each frame; held ones (move, block) stay until released.
    this.input.attack = false;
    this.input.jump = false;
    this.input.master = false;
    this.effects.fire?.update(this.time);
    const flash = this.effects.rain?.update(this.time, dt) ?? 0;
    if (this.effects.rain) this.hud.flash("lightning", flash * 0.35);
    this.effects.blood.update(dt * scale);
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
    this.effects.fire?.dispose();
    this.effects.rain?.dispose();
    this.effects.blood.dispose();
    this.director.dispose();
    for (const f of this.fighters) f.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}

/*
 * The place's real lamps, from the render: the strongest spot is the key (and casts the fighters'
 * shadows), warm points near the fight add fill, the moon is a cool directional edge.
 * Returns the key lamp (for the dust in its beam).
 */
function addLights(THREE: typeof Three, scene: Three.Scene, meta: ArenaMeta, centre: Three.Vector3): { position: Three.Vector3; axis: Three.Vector3 } | null {
  let lamp: { position: Three.Vector3; axis: Three.Vector3 } | null = null;
  const spots = meta.lights.filter((l) => l.type === "SPOT" && l.energy > 0).sort((a, b) => b.energy - a.energy);
  spots.slice(0, 2).forEach((l, i) => {
    // Physical falloff with no cut-off, so a distant source (a low sun stood in by a far spot) still reaches.
    const spot = new THREE.SpotLight(new THREE.Color(...l.colour), l.energy * LIGHT.spotPerWatt, 0, l.angle ? Math.min(1.3, l.angle / 2) : 1, l.blend ?? 0.6, 2);
    spot.position.fromArray(l.position);
    const reach = spot.position.distanceTo(centre);
    spot.target.position.copy(spot.position).add(new THREE.Vector3().fromArray(l.direction).multiplyScalar(5));
    if (i === 0) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
      spot.shadow.camera.near = Math.max(0.5, reach - 15);
      spot.shadow.camera.far = reach + 15;
      spot.shadow.bias = -0.0004;
      spot.shadow.normalBias = 0.02;
      spot.shadow.radius = 4;
      lamp = { position: spot.position.clone(), axis: new THREE.Vector3().fromArray(l.direction).normalize() };
    }
    scene.add(spot, spot.target);
  });
  for (const l of meta.lights) {
    if (l.type !== "POINT" || l.energy < 100) continue;
    const p = new THREE.Vector3().fromArray(l.position);
    if (p.distanceTo(centre) > 14 || l.name.startsWith("Fire")) continue;
    const point = new THREE.PointLight(new THREE.Color(...l.colour), l.energy * LIGHT.pointPerWatt, 16, 2);
    point.position.copy(p);
    scene.add(point);
  }
  const moon = meta.lights.find((l) => l.type === "SUN");
  if (moon) {
    const light = new THREE.DirectionalLight(new THREE.Color(...moon.colour), moon.energy * LIGHT.moonPerUnit);
    light.position.copy(centre).addScaledVector(new THREE.Vector3().fromArray(moon.direction), -20);
    light.target.position.copy(centre);
    scene.add(light, light.target);
  }
  return lamp;
}

/*
 * How lit the ground is along the lane, read from the render itself: each lane point's ground is
 * projected into the wide shot and its brightness sampled. A fighter standing there is shaded by
 * it, so they sit in the same light as the grass at their feet.
 */
function laneShade(THREE: typeof Three, bitmaps: ImageBitmap[], meta: ArenaMeta, lane: (s: number) => Three.Vector3, half: number): (s: number) => number {
  const width = 256;
  const samples: { data: Uint8ClampedArray; w: number; h: number }[] = bitmaps.map((b) => {
    const h = Math.round((width * b.height) / b.width);
    const canvas = new OffscreenCanvas(width, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { data: new Uint8ClampedArray(0), w: 0, h: 0 };
    ctx.drawImage(b, 0, 0, width, h);
    return { data: ctx.getImageData(0, 0, width, h).data, w: width, h };
  });
  const eye = new THREE.Vector3().fromArray(meta.eye);
  const local = new THREE.Vector3();
  const luminance = (p: Three.Vector3): number | null => {
    for (let i = 0; i < meta.slices.length; i++) {
      const yaw = -THREE.MathUtils.degToRad(meta.heading + meta.slices[i]);
      local.copy(p).sub(eye).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -yaw);
      if (local.z >= 0) continue;
      const xt = local.x / -local.z;
      const yt = local.y / -local.z;
      if (Math.abs(xt) > meta.half || yt > meta.up || yt < -meta.down) continue;
      const s = samples[i];
      if (!s.w) return null;
      const u = (xt + meta.half) / (2 * meta.half);
      const v = (meta.up - yt) / (meta.up + meta.down);
      // The bitmap was decoded flipped (bottom row first).
      const x = Math.min(s.w - 1, Math.floor(u * s.w));
      const y = Math.min(s.h - 1, Math.floor((1 - v) * s.h));
      const k = (y * s.w + x) * 4;
      return (0.2126 * s.data[k] + 0.7152 * s.data[k + 1] + 0.0722 * s.data[k + 2]) / 255;
    }
    return null;
  };
  const table: number[] = [];
  for (let s = -half - 1; s <= half + 1; s += 0.25) {
    const g = lane(s);
    const l = luminance(g) ?? 0.2;
    table.push(l);
  }
  const ref = Math.max(...table, 0.05);
  return (s: number) => {
    const i = Math.max(0, Math.min(table.length - 1, Math.round((s + half + 1) / 0.25)));
    return THREE.MathUtils.clamp(SHADE.floor + SHADE.gain * (table[i] / ref), SHADE.min, SHADE.max);
  };
}
