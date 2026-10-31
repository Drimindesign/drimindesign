import type * as Three from "three";
import { GETUP_TIME, type Boar } from "../actors/boar";
import type { Explorer } from "../actors/explorer";
import type { Camera } from "../engine/camera";
import { ART, PPM } from "../engine/config";
import type { Joint, Ragdoll } from "../engine/ragdoll";

type ThreeModule = typeof Three;
type Kind = "hero" | "raider" | "brute";

/**
 * The fighters: Mixamo characters (Kachujin the hero, the Paladin as raider, Warrok as brute) on
 * one shared skeleton, each clip a separate small file of motion-captured animation.
 */
const BASE = "/game/fighters/";
const MODELS: Record<Kind, string> = { hero: "hero.glb", raider: "knight.glb", brute: "brute.glb" };
const CLIPS = [
  "hero_idle", "hero_walk", "hero_run", "hero_slash1", "hero_slash2", "hero_kick", "hero_spin", "hero_hit1", "hero_hit2", "hero_jump",
  "foe_idle", "foe_walk", "foe_run", "foe_slash1", "foe_slash2", "foe_heavy", "foe_block", "foe_blockhit", "foe_hit1", "foe_hit2", "foe_strafe",
  "getup", "sit_to_stand", "stand_to_sit",
] as const;
type Clip = (typeof CLIPS)[number];
/** One-shot clips: they play once and hold their last frame. */
const ONCE = new Set<string>([
  "hero_slash1", "hero_slash2", "hero_kick", "hero_spin", "hero_hit1", "hero_hit2",
  "foe_slash1", "foe_slash2", "foe_heavy", "foe_blockhit", "foe_hit1", "foe_hit2",
  "getup", "sit_to_stand", "stand_to_sit",
]);
/** The hero's combo, blow by blow: two cuts, a kick that breaks a guard, a spinning finisher. */
const HERO_COMBO: readonly Clip[] = ["hero_slash1", "hero_slash2", "hero_kick", "hero_spin"];
/** An enemy's whole swing (s), matching its 2D wind-up, strike and recovery. */
const ENEMY_SWING = 1.18;
/** Getting up blends out of the ragdoll's pose over this long (s). */
const GETUP_BLEND = 0.4;
/** Standing height of each in the world (m). */
const HEIGHT: Record<Kind, number> = { hero: 1.75, raider: 1.9, brute: 2.3 };
/**
 * What each one holds (KayKit CC0 props), in which hand, and how long it is (m). Props are modelled
 * with the grip at the origin and the blade up +y; `grip` slides it along the fingers into the fist.
 */
const WEAPONS: Record<Kind, readonly { file: string; hand: "Right" | "Left"; length: number; shield?: boolean }[]> = {
  hero: [{ file: "sword_2handed.gltf", hand: "Right", length: 1.25 }],
  raider: [
    { file: "sword_1handed.gltf", hand: "Right", length: 0.95 },
    { file: "shield_badge.gltf", hand: "Left", length: 0.7, shield: true },
  ],
  brute: [{ file: "axe_2handed.gltf", hand: "Right", length: 1.3 }],
};
/**
 * Bones the ragdoll drives, parent before child: each follows the segment between two ragdoll
 * joints, and its rest direction is measured toward `toward` (the next bone down the chain).
 */
const DRIVES: readonly { bone: string; from: Joint; to: Joint; toward: string }[] = [
  { bone: "Hips", from: "pelvis", to: "chest", toward: "Spine2" },
  { bone: "Spine", from: "pelvis", to: "chest", toward: "Spine2" },
  { bone: "Spine2", from: "chest", to: "head", toward: "Head" },
  { bone: "LeftArm", from: "chest", to: "elbowL", toward: "LeftForeArm" },
  { bone: "LeftForeArm", from: "elbowL", to: "handL", toward: "LeftHand" },
  { bone: "RightArm", from: "chest", to: "elbowR", toward: "RightForeArm" },
  { bone: "RightForeArm", from: "elbowR", to: "handR", toward: "RightHand" },
  { bone: "LeftUpLeg", from: "pelvis", to: "kneeL", toward: "LeftLeg" },
  { bone: "LeftLeg", from: "kneeL", to: "footL", toward: "LeftFoot" },
  { bone: "RightUpLeg", from: "pelvis", to: "kneeR", toward: "RightLeg" },
  { bone: "RightLeg", from: "kneeR", to: "footR", toward: "RightFoot" },
];
/** Mixamo bones load as "mixamorig" + name (the loader drops the colon). */
const bone = (name: string): string => `mixamorig${name}`;
/** The animals (Quaternius Ultimate Animated Animals, CC0), each with its own clips, and their standing heights (m). */
type AnimalKind = "wolf" | "dog" | "bull";
const ANIMALS: Record<AnimalKind, string> = { wolf: "/game/animals/wolf.glb", dog: "/game/animals/husky.glb", bull: "/game/animals/bull.glb" };
const ANIMAL_HEIGHT: Record<AnimalKind, number> = { wolf: 0.95, dog: 0.7, bull: 1.65 };
/** Turned this far from side-on toward the camera (rad): a three-quarter view reads better than a profile. */
const THREE_QUARTER = 0.4;
/** The truck's headlights as a light in the scene: how bright, how far it reaches (m), and how far ahead of the nose it sits. */
const HEADLIGHT = { intensity: 30, reach: 12, ahead: 2.5 } as const;
/** Cross-fade between animations (s). */
const FADE = 0.16;

interface Actor {
  root: Three.Group;
  mixer: Three.AnimationMixer;
  actions: Map<string, Three.AnimationAction>;
  current: string;
  materials: Three.Material[];
  /** The swing being played, so a new swing restarts the clip; which cut a raider is making. */
  swing: number;
  cut: number;
  /** Ragdoll driving: each driven bone with its rest orientation and rest direction. */
  drives: { bone: Three.Bone; from: Joint; to: Joint; rest: Three.Quaternion; restDir: Three.Vector3 }[];
  /** The beast state last frame (to catch the moment it starts getting up), and the get-up blend. */
  state: string;
  blend: { t: number; from: Map<Three.Bone, Three.Quaternion>; hips: Three.Vector3 } | null;
}

/*
 * The people of the game in 3D: the hero and the raiders and brutes who fight on foot. Their
 * bodies stay 2D physics (where they are, how fast, whether they're swinging, hit or down); here
 * each one plays the matching motion-capture clip, cross-faded, facing three-quarters toward the
 * camera, with its weapon in its hand. A limp body's bones follow its ragdoll, and getting up
 * blends out of the fallen pose. Rendered by three.js with flat toon shading into its own
 * transparent canvas at the game's pixel resolution, through an orthographic camera lined up
 * with the 2D projector, and drawn into the frame. Loads in the background; until it's ready (or
 * without WebGL) the 2D explorer is drawn instead.
 */
export class Fighters3D {
  private three: {
    THREE: ThreeModule;
    renderer: Three.WebGLRenderer;
    scene: Three.Scene;
    camera: Three.OrthographicCamera;
    make: (kind: Kind) => Actor;
    makeAnimal: (kind: AnimalKind) => Actor;
    headlight: Three.PointLight;
    hero: Actor;
    enemies: Map<Boar, Actor>;
  } | null = null;
  private width = 480;
  private height = 270;
  private disposed = false;

  constructor() {
    void this.load();
  }

  get ready(): boolean {
    return this.three !== null;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.three) return;
    this.three.renderer.setSize(Math.round(width * ART), Math.round(height * ART), false);
    this.frame(this.three.camera);
  }

  /** Draws the hero (when on foot) and the fighters; returns false when not ready, so the caller draws the 2D explorer. */
  /** `headlight`: the truck's lamps (where, and which way they face), lighting whoever stands in front. */
  draw(ctx: CanvasRenderingContext2D, camera: Camera, dt: number, alpha: number, hero: Explorer | null, beasts: readonly Boar[], headlight: { x: number; y: number; dir: number } | null = null): boolean {
    const t = this.three;
    if (!t) return false;
    t.headlight.intensity = headlight ? HEADLIGHT.intensity : 0;
    if (headlight) t.headlight.position.set(headlight.x + headlight.dir * HEADLIGHT.ahead, headlight.y + 0.7, 1.2);
    const view = this.width / PPM / 2 + 3;
    let any = false;

    t.hero.root.visible = hero !== null && hero.alpha > 0.05;
    if (hero && t.hero.root.visible) {
      const b = hero.body;
      setOpacity(t.hero, hero.alpha);
      any = true;
      if (hero.limp && hero.ragdoll) {
        // Knocked down: the hero's bones follow the ragdoll, then the get-up blends out of it.
        this.drive(t.THREE, t.hero, hero.ragdoll, b.facing);
        t.hero.state = "limp";
      } else {
        t.hero.root.position.set(b.px + (b.x - b.px) * alpha, b.py + (b.y - b.py) * alpha, 0);
        t.hero.root.rotation.set(0, b.facing > 0 ? Math.PI / 2 - THREE_QUARTER : -Math.PI / 2 + THREE_QUARTER, 0);
        if (hero.getup > 0) {
          if (t.hero.state === "limp") startGetup(t.THREE, t.hero, hero.getup);
          t.hero.state = "getup";
        } else {
          t.hero.state = "";
          this.animateHero(t.hero, hero);
        }
        t.hero.mixer.update(dt);
        blendOut(t.hero, dt);
      }
    }

    for (const beast of beasts) {
      if (beast.animal3D) {
        any = this.drawAnimal(t, beast, camera, dt) || any;
        continue;
      }
      if (!beast.fighter) continue;
      let actor = t.enemies.get(beast);
      const pose = beast.pose();
      const visible = pose.visible && Math.abs(beast.x - camera.x) < view;
      if (!visible) {
        if (actor) actor.root.visible = false;
        continue;
      }
      if (!actor) {
        actor = t.make(beast.kind === "brute" ? "brute" : "raider");
        t.enemies.set(beast, actor);
      }
      actor.root.visible = true;
      setOpacity(actor, pose.alpha);
      for (const m of actor.materials) (m as Three.MeshToonMaterial).emissiveIntensity = pose.flash ? 1.5 : 0;
      any = true;
      if (beast.limp && beast.ragdoll) {
        this.drive(t.THREE, actor, beast.ragdoll, beast.facing);
        actor.state = beast.state;
        continue;
      }
      actor.root.position.set(beast.x, beast.y, -0.5);
      actor.root.rotation.set(0, pose.facing > 0 ? Math.PI / 2 - THREE_QUARTER : -Math.PI / 2 + THREE_QUARTER, pose.angle);
      if (beast.state === "getup" && actor.state !== "getup") startGetup(t.THREE, actor, GETUP_TIME);
      else if (beast.state !== "getup") this.animateEnemy(actor, beast);
      actor.state = beast.state;
      actor.mixer.update(dt);
      blendOut(actor, dt);
    }
    if (!any) return true;

    t.camera.position.set(camera.x, camera.y, 20);
    t.renderer.render(t.scene, t.camera);
    ctx.drawImage(t.renderer.domElement, 0, 0, this.width, this.height);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    if (!this.three) return;
    this.three.renderer.dispose();
    this.three.renderer.forceContextLoss();
    this.three = null;
  }

  // ---------------------------------------------------------------------------

  /* An animal: placed on its 2D body, turned three-quarters to where it's heading, playing its own clips. */
  private drawAnimal(t: NonNullable<Fighters3D["three"]>, beast: Boar, camera: Camera, dt: number): boolean {
    let actor = t.enemies.get(beast);
    const pose = beast.pose();
    if (!pose.visible || Math.abs(beast.x - camera.x) > this.width / PPM / 2 + 4) {
      if (actor) actor.root.visible = false;
      return false;
    }
    if (!actor) {
      actor = t.makeAnimal(beast.kind === "bull" ? "bull" : beast.kind === "dog" ? "dog" : "wolf");
      t.enemies.set(beast, actor);
    }
    actor.root.visible = true;
    actor.root.position.set(beast.x, beast.y, -0.3);
    actor.root.rotation.set(0, pose.facing > 0 ? Math.PI / 2 - THREE_QUARTER * 0.6 : -Math.PI / 2 + THREE_QUARTER * 0.6, pose.angle);
    setOpacity(actor, pose.alpha);
    for (const m of actor.materials) (m as Three.MeshToonMaterial).emissiveIntensity = pose.flash ? 1.2 : 0;
    const speed = Math.abs(beast.vx);
    switch (beast.state) {
      case "down":
      case "blasted":
        play(actor, "Death");
        break;
      case "stagger":
        play(actor, "Idle_HitReact1");
        break;
      case "wait":
        play(actor, beast.kind === "wolf" ? "Idle" : "Eating");
        break;
      default:
        if (!beast.grounded) play(actor, "Gallop_Jump");
        else if (beast.dangerous && speed < 1) play(actor, beast.kind === "bull" ? "Attack_Headbutt" : "Attack");
        else if (speed > 3) play(actor, "Gallop", speed / 6);
        else if (speed > 0.3) play(actor, "Walk", speed / 1.6);
        else play(actor, "Idle");
    }
    actor.mixer.update(dt);
    return true;
  }

  /*
   * A limp body: its bones follow the ragdoll. The body is turned exactly side-on (the ragdoll
   * lives in the side plane); each driven bone is turned from its rest direction onto its ragdoll
   * segment's direction, parent before child, and the hips are put at the ragdoll's pelvis.
   */
  private drive(THREE: ThreeModule, actor: Actor, r: Ragdoll, f: number): void {
    const pelvis = r.points.pelvis;
    actor.root.position.set(pelvis.x, pelvis.y, -0.5);
    actor.root.rotation.set(0, f > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    actor.root.updateMatrixWorld(true);
    const parentQ = new THREE.Quaternion();
    const turn = new THREE.Quaternion();
    const want = new THREE.Vector3();
    for (const d of actor.drives) {
      const a = r.points[d.from];
      const b = r.points[d.to];
      // In the body's own frame the side plane is z (forward) by y (up): turn the bone's rest
      // direction (arms out in a T, legs down) onto its ragdoll segment.
      want.set(0, b.y - a.y, (b.x - a.x) * f).normalize();
      turn.setFromUnitVectors(d.restDir, want);
      const world = actor.root.quaternion.clone().multiply(turn.multiply(d.rest));
      d.bone.parent?.getWorldQuaternion(parentQ);
      d.bone.quaternion.copy(parentQ.invert().multiply(world));
      if (d.bone.name === bone("Hips") && d.bone.parent) d.bone.position.copy(d.bone.parent.worldToLocal(new THREE.Vector3(pelvis.x, pelvis.y, -0.5)));
      d.bone.updateMatrixWorld(true);
    }
  }

  private animateHero(actor: Actor, hero: Explorer): void {
    const b = hero.body;
    // Out of the seat or down into it: the motion-captured stand-up and sit-down.
    const transition = hero.transition;
    if (transition) {
      const clip = transition.kind === "out" ? "sit_to_stand" : "stand_to_sit";
      if (actor.current !== clip) play(actor, clip, clipLength(actor, clip) / (transition.kind === "out" ? 1.05 : 0.85), true);
      return;
    }
    const swing = hero.swingProgress;
    if (swing >= 0) {
      // The combo, each clip timed to the swing and restarted for each new blow.
      const clip = HERO_COMBO[hero.comboIndex] ?? HERO_COMBO[0];
      if (swing < actor.swing || actor.current !== clip) play(actor, clip, clipLength(actor, clip) / hero.swingDuration, true);
      actor.swing = swing;
      return;
    }
    actor.swing = -1;
    if (hero.hurting) play(actor, actor.current === "hero_hit1" ? "hero_hit1" : "hero_hit2");
    else if (!b.grounded) play(actor, "hero_jump");
    else if (Math.abs(b.vx) < 0.3) play(actor, "hero_idle");
    else if (Math.abs(b.vx) < 3.2) play(actor, "hero_walk", Math.abs(b.vx) / 1.6);
    else play(actor, "hero_run", Math.abs(b.vx) / 5.5);
  }

  private animateEnemy(actor: Actor, beast: Boar): void {
    const swing = beast.swing;
    if (swing >= 0) {
      // A new swing: brutes bring the heavy overhead blow, raiders alternate their two cuts.
      if (swing < actor.swing || actor.swing < 0) actor.cut++;
      const clip: Clip = beast.kind === "brute" ? "foe_heavy" : actor.cut % 2 ? "foe_slash2" : "foe_slash1";
      if (swing < actor.swing || actor.current !== clip) play(actor, clip, clipLength(actor, clip) / ENEMY_SWING, true);
      actor.swing = swing;
      return;
    }
    actor.swing = -1;
    switch (beast.state) {
      case "block":
        play(actor, beast.blocked ? "foe_blockhit" : "foe_block", 1, beast.blocked && actor.current !== "foe_blockhit");
        break;
      case "stagger":
        play(actor, actor.current === "foe_hit1" ? "foe_hit2" : "foe_hit1");
        break;
      case "wait":
        play(actor, "foe_idle");
        break;
      case "circle":
        play(actor, "foe_strafe", Math.max(0.5, Math.abs(beast.vx) / 1.5));
        break;
      default:
        if (Math.abs(beast.vx) > 2.4) play(actor, "foe_run", Math.abs(beast.vx) / 5.5);
        else if (Math.abs(beast.vx) > 0.3) play(actor, "foe_walk", Math.abs(beast.vx) / 1.6);
        else play(actor, "foe_idle");
    }
  }

  /* The orthographic camera spans exactly what the 2D projector shows: 1 m = PPM art px. */
  private frame(camera: Three.OrthographicCamera): void {
    const w = this.width / PPM / 2;
    const h = this.height / PPM / 2;
    camera.left = -w;
    camera.right = w;
    camera.top = h;
    camera.bottom = -h;
    camera.updateProjectionMatrix();
  }

  private async load(): Promise<void> {
    try {
      const [THREE, { GLTFLoader }, { clone }, { MeshoptDecoder }] = await Promise.all([
        import("three"),
        import("three/addons/loaders/GLTFLoader.js"),
        import("three/addons/utils/SkeletonUtils.js"),
        import("three/addons/libs/meshopt_decoder.module.js"),
      ]);
      if (this.disposed) return;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const kinds = Object.keys(MODELS) as Kind[];
      const animalKinds = Object.keys(ANIMALS) as AnimalKind[];
      const props = [...new Set(kinds.flatMap((kind) => WEAPONS[kind].map((w) => w.file)))];
      const [models, clips, held, animalModels] = await Promise.all([
        Promise.all(kinds.map(async (kind) => [kind, await loader.loadAsync(BASE + MODELS[kind])] as const)),
        Promise.all(CLIPS.map(async (name) => named(await loader.loadAsync(`${BASE}${name}.glb`), name))),
        Promise.all(props.map(async (file) => [file, await loader.loadAsync(`/game/kaykit/${file}`)] as const)),
        Promise.all(animalKinds.map(async (kind) => [kind, await loader.loadAsync(ANIMALS[kind])] as const)),
      ]);
      const animalSources = new Map(animalModels);
      if (this.disposed) return;
      const animations = clips.filter((c): c is Three.AnimationClip => c !== null);
      const weaponScenes = new Map(held);
      const renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas"), alpha: true, antialias: false, premultipliedAlpha: false });
      renderer.setPixelRatio(1);
      renderer.setSize(Math.round(this.width * ART), Math.round(this.height * ART), false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      // Night light: a cool moon key from the front-left, a warm rim from behind, soft fill.
      const key = new THREE.DirectionalLight(0xdfe8ff, 2.2);
      key.position.set(-2, 3, 4);
      const rim = new THREE.DirectionalLight(0xffc89a, 1.6);
      rim.position.set(2, 2, -3);
      scene.add(key, rim, new THREE.HemisphereLight(0x9fb4d8, 0x2a1e18, 0.9));
      const headlight = new THREE.PointLight(0xeaf2ff, 0, HEADLIGHT.reach, 1.4);
      scene.add(headlight);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
      this.frame(camera);

      // Toon shading in three flat bands, so the models read like pixel art, not plastic.
      const bands = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1);
      bands.minFilter = THREE.NearestFilter;
      bands.magFilter = THREE.NearestFilter;
      bands.needsUpdate = true;
      const heights = new Map<Kind, number>();
      for (const [kind, gltf] of models) {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        heights.set(kind, Math.max(0.01, box.max.y - box.min.y));
      }
      const sources = new Map(models);

      const make = (kind: Kind): Actor => {
        const source = sources.get(kind);
        if (!source) throw new Error(`Missing model ${kind}`);
        const model = clone(source.scene) as Three.Group;
        const materials: Three.Material[] = [];
        model.traverse((node) => {
          const mesh = node as Three.Mesh;
          if (!mesh.isMesh) return;
          const original = mesh.material as Three.MeshStandardMaterial;
          const toon = new THREE.MeshToonMaterial({ map: original.map, gradientMap: bands, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: original.transparent ? 0.5 : 0 });
          mesh.material = toon;
          mesh.frustumCulled = false;
          materials.push(toon);
        });
        const root = new THREE.Group();
        model.scale.setScalar(HEIGHT[kind] / (heights.get(kind) ?? 1));
        root.add(model);
        root.updateMatrixWorld(true);
        for (const w of WEAPONS[kind]) {
          const hand = model.getObjectByName(bone(`${w.hand}Hand`));
          const prop = weaponScenes.get(w.file);
          if (hand && prop) arm(THREE, hand, prop.scene.clone(), w.length, w.shield === true, materials, bands);
        }
        // Rest data for the ragdoll, measured with the body unturned (its frame = the world here).
        const drives: Actor["drives"] = [];
        const at = new THREE.Vector3();
        const next = new THREE.Vector3();
        for (const d of DRIVES) {
          const b = model.getObjectByName(bone(d.bone)) as Three.Bone | undefined;
          const toward = model.getObjectByName(bone(d.toward));
          if (!b || !toward) continue;
          b.getWorldPosition(at);
          toward.getWorldPosition(next);
          drives.push({ bone: b, from: d.from, to: d.to, rest: b.getWorldQuaternion(new THREE.Quaternion()), restDir: next.clone().sub(at).normalize() });
        }
        scene.add(root);
        const mixer = new THREE.AnimationMixer(model);
        const actions = new Map<string, Three.AnimationAction>();
        for (const clip of animations) {
          const action = mixer.clipAction(clip);
          if (ONCE.has(clip.name)) {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          actions.set(clip.name, action);
        }
        const actor: Actor = { root, mixer, actions, current: "", materials, swing: -1, cut: 0, drives, state: "", blend: null };
        play(actor, kind === "hero" ? "hero_idle" : "foe_idle");
        return actor;
      };
      // An animal: toon-shaded in its own colours, with the clips that came with it.
      const makeAnimal = (kind: AnimalKind): Actor => {
        const source = animalSources.get(kind);
        if (!source) throw new Error(`Missing animal ${kind}`);
        const model = clone(source.scene) as Three.Group;
        const materials: Three.Material[] = [];
        model.traverse((node) => {
          const mesh = node as Three.Mesh;
          if (!mesh.isMesh) return;
          const original = mesh.material as Three.MeshStandardMaterial;
          const toon = new THREE.MeshToonMaterial({ color: original.color, map: original.map, vertexColors: original.vertexColors, gradientMap: bands, emissive: 0xffffff, emissiveIntensity: 0 });
          mesh.material = toon;
          mesh.frustumCulled = false;
          materials.push(toon);
        });
        const box = new THREE.Box3().setFromObject(source.scene);
        model.scale.setScalar(ANIMAL_HEIGHT[kind] / Math.max(0.01, box.max.y - box.min.y));
        const root = new THREE.Group();
        root.add(model);
        scene.add(root);
        const mixer = new THREE.AnimationMixer(model);
        const actions = new Map<string, Three.AnimationAction>();
        for (const clip of source.animations) {
          const action = mixer.clipAction(clip);
          if (clip.name === "Death") {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          actions.set(clip.name, action);
        }
        const actor: Actor = { root, mixer, actions, current: "", materials, swing: -1, cut: 0, drives: [], state: "", blend: null };
        play(actor, "Idle");
        return actor;
      };
      const hero = make("hero");
      // Warm-up: one of every figure built now, its shaders compiled in the background (solid and
      // fading) and its textures uploaded, so the first knight, brute or animal to come on screen
      // doesn't freeze a frame. They wait hidden and are handed out first.
      const spare = new Map<string, Actor[]>();
      const warm: [string, Actor][] = [...(["raider", "brute"] as const).map((k): [string, Actor] => [k, make(k)]), ...animalKinds.map((k): [string, Actor] => [k, makeAnimal(k)])];
      const fading = (on: boolean): void => {
        for (const [, actor] of [["hero", hero] as const, ...warm]) for (const m of actor.materials) m.transparent = on;
      };
      await renderer.compileAsync(scene, camera);
      fading(true);
      await renderer.compileAsync(scene, camera);
      fading(false);
      scene.traverse((node) => {
        const map = ((node as Three.Mesh).material as Three.MeshToonMaterial | undefined)?.map;
        if (map) renderer.initTexture(map);
      });
      // One hidden render uploads every mesh and skeleton to the GPU now rather than mid-fight.
      renderer.render(scene, camera);
      for (const [key, actor] of warm) {
        actor.root.visible = false;
        spare.set(key, [...(spare.get(key) ?? []), actor]);
      }
      if (this.disposed) {
        renderer.dispose();
        return;
      }
      this.three = {
        THREE,
        renderer,
        scene,
        camera,
        make: (kind) => spare.get(kind)?.pop() ?? make(kind),
        makeAnimal: (kind) => spare.get(kind)?.pop() ?? makeAnimal(kind),
        headlight,
        hero,
        enemies: new Map(),
      };
    } catch {
      // No WebGL or the models didn't load: the 2D explorer stays.
    }
  }
}

/* The moment a body starts to rise: remember the fallen pose to blend out of, and play the get-up over `seconds`. */
function startGetup(THREE: ThreeModule, actor: Actor, seconds: number): void {
  const from = new Map<Three.Bone, Three.Quaternion>();
  for (const d of actor.drives) from.set(d.bone, d.bone.quaternion.clone());
  const hips = actor.drives[0]?.bone.position.clone() ?? new THREE.Vector3();
  actor.blend = { t: 0, from, hips };
  play(actor, "getup", clipLength(actor, "getup") / seconds, true);
}

/* After the mixer has posed the body, ease it from the remembered fallen pose into the clip. */
function blendOut(actor: Actor, dt: number): void {
  if (!actor.blend) return;
  actor.blend.t += dt;
  const k = Math.min(1, actor.blend.t / GETUP_BLEND);
  for (const d of actor.drives) {
    const from = actor.blend.from.get(d.bone);
    if (from) d.bone.quaternion.slerpQuaternions(from, d.bone.quaternion.clone(), k);
  }
  actor.drives[0]?.bone.position.lerpVectors(actor.blend.hips, actor.drives[0].bone.position.clone(), k);
  if (k >= 1) actor.blend = null;
}

/*
 * A clip from its file, named for the game, with the hips' forward travel removed: the 2D physics
 * moves the body, so a walk cycle must walk on the spot (only the hips' height keeps moving).
 */
function named(gltf: { animations: Three.AnimationClip[] }, name: string): Three.AnimationClip | null {
  const clip = gltf.animations[0];
  if (!clip) return null;
  clip.name = name;
  for (const track of clip.tracks) {
    if (!track.name.endsWith(`${bone("Hips")}.position`)) continue;
    const v = track.values;
    const x0 = v[0];
    const z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
    }
  }
  return clip;
}

/*
 * Puts a prop in a hand. Props stand blade-up (+y) with the grip at the origin; in the rest pose
 * the thumb points forward (+z), so the blade is turned to come out of the fist that way, the grip
 * slid a little along the fingers, and the whole thing scaled to its real length.
 */
function arm(THREE: ThreeModule, hand: Three.Object3D, prop: Three.Object3D, length: number, shield: boolean, materials: Three.Material[], bands: Three.Texture): void {
  const handQ = hand.getWorldQuaternion(new THREE.Quaternion());
  const handScale = hand.getWorldScale(new THREE.Vector3()).x;
  const size = new THREE.Box3().setFromObject(prop).getSize(new THREE.Vector3());
  const along = new THREE.Vector3(0, 0, 1).applyQuaternion(handQ.clone().invert());
  prop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shield ? new THREE.Vector3(0, 1, 0) : along);
  prop.scale.setScalar(length / Math.max(size.x, size.y, size.z) / handScale);
  prop.position.set(0, 0.08 / handScale, 0);
  prop.traverse((node) => {
    const mesh = node as Three.Mesh;
    if (!mesh.isMesh) return;
    const original = mesh.material as Three.MeshStandardMaterial;
    const toon = new THREE.MeshToonMaterial({ map: original.map, gradientMap: bands, emissive: 0xffffff, emissiveIntensity: 0 });
    mesh.material = toon;
    mesh.frustumCulled = false;
    materials.push(toon);
  });
  hand.add(prop);
}

/* Cross-fades to a clip (unless it's already playing), at a speed; `restart` replays a one-shot from the top. */
function play(actor: Actor, name: string, speed = 1, restart = false): void {
  const next = actor.actions.get(name);
  if (!next) return;
  next.timeScale = Math.max(0.2, Math.min(4, speed));
  if (actor.current === name && !restart) return;
  const previous = actor.actions.get(actor.current);
  next.reset().play();
  if (previous && previous !== next) previous.crossFadeTo(next, FADE, false);
  actor.current = name;
}

/** A clip's length (s), or 1 if it's missing. */
function clipLength(actor: Actor, name: string): number {
  return actor.actions.get(name)?.getClip().duration ?? 1;
}

function setOpacity(actor: Actor, alpha: number): void {
  for (const m of actor.materials) {
    m.transparent = alpha < 1;
    m.opacity = alpha;
  }
}
