import type * as Three from "three";
import { GETUP_TIME, type Boar } from "../actors/boar";
import type { Explorer } from "../actors/explorer";
import type { Camera } from "../engine/camera";
import { ART, PPM } from "../engine/config";
import type { Joint } from "../engine/ragdoll";

type ThreeModule = typeof Three;
type Kind = "hero" | "raider" | "brute";

/** KayKit Adventurers (CC0): the models, the shared Rig_Medium animations and the sword. */
const BASE = "/game/kaykit/";
const MODELS: Record<Kind, string> = { hero: "Rogue_Hooded.glb", raider: "Knight.glb", brute: "Barbarian.glb" };
const ANIMATIONS = [
  "Rig_Medium_General.glb",
  "Rig_Medium_MovementBasic.glb",
  "Rig_Medium_CombatMelee.glb",
  "Rig_Medium_Simulation.glb",
  "Rig_Medium_MovementAdvanced.glb",
] as const;
/** What each one carries in its right hand. */
const WEAPONS: Record<Kind, string> = { hero: "sword_2handed.gltf", raider: "sword_1handed.gltf", brute: "axe_2handed.gltf" };
/** The hero's combo, blow by blow, and each fighter's own swing. */
const HERO_COMBO = ["Melee_2H_Attack_Chop", "Melee_2H_Attack_Slice", "Melee_2H_Attack_Stab"] as const;
const ENEMY_ATTACK: Record<Exclude<Kind, "hero">, string> = { raider: "Melee_1H_Attack_Chop", brute: "Melee_2H_Attack_Chop" };
/** An enemy's whole swing (s), matching its 2D wind-up, strike and recovery. */
const ENEMY_SWING = 1.18;
/** Getting up blends out of the ragdoll's pose over this long (s). */
const GETUP_BLEND = 0.4;
/**
 * Bones the ragdoll drives, parent before child: each follows the segment between two ragdoll
 * joints, and its rest direction is measured toward `toward` (the next bone down the chain).
 */
const DRIVES: readonly { bone: string; from: Joint; to: Joint; toward: string }[] = [
  { bone: "hips", from: "pelvis", to: "chest", toward: "chest" },
  { bone: "spine", from: "pelvis", to: "chest", toward: "chest" },
  { bone: "chest", from: "chest", to: "head", toward: "head" },
  { bone: "upperarm.l", from: "chest", to: "elbowL", toward: "lowerarm.l" },
  { bone: "lowerarm.l", from: "elbowL", to: "handL", toward: "wrist.l" },
  { bone: "upperarm.r", from: "chest", to: "elbowR", toward: "lowerarm.r" },
  { bone: "lowerarm.r", from: "elbowR", to: "handR", toward: "wrist.r" },
  { bone: "upperleg.l", from: "pelvis", to: "kneeL", toward: "lowerleg.l" },
  { bone: "lowerleg.l", from: "kneeL", to: "footL", toward: "foot.l" },
  { bone: "upperleg.r", from: "pelvis", to: "kneeR", toward: "lowerleg.r" },
  { bone: "lowerleg.r", from: "kneeR", to: "footR", toward: "foot.r" },
];
/** Standing height of each in the world (m). */
const HEIGHT: Record<Kind, number> = { hero: 1.8, raider: 1.9, brute: 2.05 };
/** Turned this far from side-on toward the camera (rad): a three-quarter view reads better than a profile. */
const THREE_QUARTER = 0.4;
/** Cross-fade between animations (s). */
const FADE = 0.16;
/** One-shot clips: they play once and hold their last frame. */
const ONCE = new Set([
  "Throw",
  "Hit_A",
  "Hit_B",
  "Death_A",
  "Death_B",
  "Jump_Land",
  "Lie_StandUp",
  "Sit_Chair_StandUp",
  "Sit_Chair_Down",
  "Melee_Block_Hit",
  ...HERO_COMBO,
  ...Object.values(ENEMY_ATTACK),
]);

interface Actor {
  root: Three.Group;
  mixer: Three.AnimationMixer;
  actions: Map<string, Three.AnimationAction>;
  current: string;
  materials: Three.Material[];
  /** The swing being played, so a new swing restarts the clip. */
  swing: number;
  /** Ragdoll driving: each driven bone with its rest orientation and rest direction in the body's side plane. */
  drives: { bone: Three.Bone; from: Joint; to: Joint; rest: Three.Quaternion; restDir: Three.Vector3 }[];
  /** The beast state last frame (to catch the moment it starts getting up), and the get-up blend. */
  state: string;
  blend: { t: number; from: Map<Three.Bone, Three.Quaternion>; hips: Three.Vector3 } | null;
}

/*
 * The people of the game in 3D: the hero (KayKit's hooded rogue with a two-handed sword) and
 * the raiders and brutes who fight on foot. Their bodies stay 2D physics (where they are, how
 * fast, whether they're swinging, hit or down); here each one plays the matching motion-capture
 * style clip, cross-faded, facing three-quarters toward the camera. Rendered by three.js with
 * flat toon shading into its own transparent canvas at the game's pixel resolution, through an
 * orthographic camera lined up with the 2D projector, and drawn into the frame, so they sit in
 * the pixel world like sprites that move like people. Loads in the background; until it's
 * ready (or without WebGL) the 2D explorer is drawn instead.
 */
export class Fighters3D {
  private three: {
    THREE: ThreeModule;
    renderer: Three.WebGLRenderer;
    scene: Three.Scene;
    camera: Three.OrthographicCamera;
    make: (kind: Kind) => Actor;
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
  draw(ctx: CanvasRenderingContext2D, camera: Camera, dt: number, alpha: number, hero: Explorer | null, beasts: readonly Boar[]): boolean {
    const t = this.three;
    if (!t) return false;
    const view = this.width / PPM / 2 + 3;
    let any = false;

    t.hero.root.visible = hero !== null && hero.alpha > 0.05;
    if (hero && t.hero.root.visible) {
      const b = hero.body;
      t.hero.root.position.set(b.px + (b.x - b.px) * alpha, b.py + (b.y - b.py) * alpha, 0);
      t.hero.root.rotation.y = b.facing > 0 ? Math.PI / 2 - THREE_QUARTER : -Math.PI / 2 + THREE_QUARTER;
      this.animateHero(t.hero, hero);
      setOpacity(t.hero, hero.alpha);
      t.hero.mixer.update(dt);
      any = true;
    }

    for (const beast of beasts) {
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
        this.drive(t.THREE, actor, beast);
        actor.state = beast.state;
        continue;
      }
      actor.root.position.set(beast.x, beast.y, -0.5);
      actor.root.rotation.set(0, pose.facing > 0 ? Math.PI / 2 - THREE_QUARTER : -Math.PI / 2 + THREE_QUARTER, pose.angle);
      if (beast.state === "getup" && actor.state !== "getup") {
        // The moment it starts to rise: remember the fallen pose, to blend out of it.
        const from = new Map<Three.Bone, Three.Quaternion>();
        for (const d of actor.drives) from.set(d.bone, d.bone.quaternion.clone());
        const hips = actor.drives[0]?.bone.position.clone() ?? new t.THREE.Vector3();
        actor.blend = { t: 0, from, hips };
        play(actor, "Lie_StandUp", clipLength(actor, "Lie_StandUp") / GETUP_TIME, true);
      } else if (beast.state !== "getup") {
        this.animateEnemy(actor, beast);
      }
      actor.state = beast.state;
      actor.mixer.update(dt);
      if (actor.blend) {
        actor.blend.t += dt;
        const k = Math.min(1, actor.blend.t / GETUP_BLEND);
        for (const d of actor.drives) {
          const from = actor.blend.from.get(d.bone);
          if (from) d.bone.quaternion.slerpQuaternions(from, d.bone.quaternion.clone(), k);
        }
        actor.drives[0]?.bone.position.lerpVectors(actor.blend.hips, actor.drives[0].bone.position.clone(), k);
        if (k >= 1) actor.blend = null;
      }
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

  /*
   * A limp body: its bones follow the ragdoll. The body is turned exactly side-on (the ragdoll
   * lives in the side plane); each driven bone is turned from its
   * rest direction onto its ragdoll segment's direction, parent before child, and the hips are put
   * at the ragdoll's pelvis.
   */
  private drive(THREE: ThreeModule, actor: Actor, beast: Boar): void {
    const r = beast.ragdoll;
    if (!r) return;
    const f = beast.facing;
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
      if (d.bone.name === "hips" && d.bone.parent) d.bone.position.copy(d.bone.parent.worldToLocal(new THREE.Vector3(pelvis.x, pelvis.y, -0.5)));
      d.bone.updateMatrixWorld(true);
    }
  }

  private animateHero(actor: Actor, hero: Explorer): void {
    const b = hero.body;
    // Out of the seat or down into it: the real sit-to-stand and stand-to-sit clips.
    const transition = hero.transition;
    if (transition) {
      const clip = transition.kind === "out" ? "Sit_Chair_StandUp" : "Sit_Chair_Down";
      if (actor.current !== clip) play(actor, clip, clipLength(actor, clip) / (transition.kind === "out" ? 0.8 : 0.6), true);
      return;
    }
    const swing = hero.swingProgress;
    if (swing >= 0) {
      // The combo: chop, slice, stab, each clip timed to the swing and restarted for each new blow.
      const clip = HERO_COMBO[hero.comboIndex] ?? HERO_COMBO[0];
      if (swing < actor.swing || actor.current !== clip) play(actor, clip, clipLength(actor, clip) / hero.swingDuration, true);
      actor.swing = swing;
      return;
    }
    actor.swing = -1;
    if (hero.hurting) play(actor, "Hit_A");
    else if (!b.grounded) play(actor, "Jump_Idle");
    else if (Math.abs(b.vx) < 0.3) play(actor, "Idle_A");
    else if (Math.abs(b.vx) < 3.2) play(actor, "Walking_A", Math.abs(b.vx) / 1.8);
    else play(actor, "Running_A", Math.abs(b.vx) / 5.5);
  }

  private animateEnemy(actor: Actor, beast: Boar): void {
    const swing = beast.swing;
    if (swing >= 0) {
      const clip = ENEMY_ATTACK[beast.kind === "brute" ? "brute" : "raider"];
      if (swing < actor.swing || actor.current !== clip) play(actor, clip, clipLength(actor, clip) / ENEMY_SWING, true);
      actor.swing = swing;
      return;
    }
    actor.swing = -1;
    switch (beast.state) {
      case "down":
        play(actor, "Death_A");
        break;
      case "blasted":
        play(actor, "Death_B");
        break;
      case "stagger":
        play(actor, "Hit_B");
        break;
      case "wait":
        play(actor, "Idle_B");
        break;
      default:
        if (!beast.grounded) play(actor, "Jump_Idle");
        else if (Math.abs(beast.vx) > 2.4) play(actor, "Running_A", Math.abs(beast.vx) / 5.5);
        else if (Math.abs(beast.vx) > 0.3) play(actor, "Walking_A", Math.abs(beast.vx) / 1.8);
        else play(actor, "Idle_A");
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
      const [THREE, { GLTFLoader }, { clone }] = await Promise.all([
        import("three"),
        import("three/addons/loaders/GLTFLoader.js"),
        import("three/addons/utils/SkeletonUtils.js"),
      ]);
      if (this.disposed) return;
      const loader = new GLTFLoader();
      const kinds = Object.keys(MODELS) as Kind[];
      const [models, clips, weapons] = await Promise.all([
        Promise.all(kinds.map(async (kind) => [kind, await loader.loadAsync(BASE + MODELS[kind])] as const)),
        Promise.all(ANIMATIONS.map((file) => loader.loadAsync(BASE + file))),
        Promise.all(kinds.map(async (kind) => [kind, await loader.loadAsync(BASE + WEAPONS[kind])] as const)),
      ]);
      const weapon = new Map(weapons);
      if (this.disposed) return;
      const animations = clips.flatMap((gltf) => gltf.animations);
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

      let heroMap: Three.Texture | null = null;
      const make = (kind: Kind): Actor => {
        const source = sources.get(kind);
        if (!source) throw new Error(`Missing model ${kind}`);
        const model = clone(source.scene) as Three.Group;
        const materials: Three.Material[] = [];
        model.traverse((node) => {
          const mesh = node as Three.Mesh;
          if (!mesh.isMesh) return;
          const original = mesh.material as Three.MeshStandardMaterial;
          // The hero in the studio's colours: a charcoal outfit, and a Drimin-orange cape.
          let map = original.map;
          let color = 0xffffff;
          if (kind === "hero") {
            heroMap ??= charcoal(THREE, original.map);
            map = heroMap;
            if (mesh.name.includes("Cape")) {
              map = null;
              color = HERO_ORANGE;
            }
          }
          const toon = new THREE.MeshToonMaterial({ map, gradientMap: bands, color, emissive: 0xffffff, emissiveIntensity: 0 });
          mesh.material = toon;
          mesh.frustumCulled = false;
          materials.push(toon);
        });
        const held = weapon.get(kind);
        if (held) model.getObjectByName("handslot.r")?.add(held.scene.clone());
        const root = new THREE.Group();
        model.scale.setScalar(HEIGHT[kind] / (heights.get(kind) ?? 1));
        root.add(model);
        // Rest data for the ragdoll, measured with the body unturned (its frame = the world here).
        root.updateMatrixWorld(true);
        const drives: Actor["drives"] = [];
        const at = new THREE.Vector3();
        const next = new THREE.Vector3();
        for (const d of DRIVES) {
          const bone = model.getObjectByName(d.bone) as Three.Bone | undefined;
          const toward = model.getObjectByName(d.toward);
          if (!bone || !toward) continue;
          bone.getWorldPosition(at);
          toward.getWorldPosition(next);
          drives.push({ bone, from: d.from, to: d.to, rest: bone.getWorldQuaternion(new THREE.Quaternion()), restDir: next.clone().sub(at).normalize() });
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
        const actor: Actor = { root, mixer, actions, current: "", materials, swing: -1, drives, state: "", blend: null };
        play(actor, "Idle_A");
        return actor;
      };
      const hero = make("hero");
      if (this.disposed) {
        renderer.dispose();
        return;
      }
      this.three = { THREE, renderer, scene, camera, make, hero, enemies: new Map() };
    } catch {
      // No WebGL or the models didn't load: the 2D explorer stays.
    }
  }
}

/** The hero's cape: Drimin orange. */
const HERO_ORANGE = 0xe0481c;

/*
 * The rogue's texture with its greens turned charcoal (shading kept), so the outfit reads as a
 * dark fighter's; leather browns and skin are left alone. Painted once into a canvas texture.
 */
function charcoal(THREE: ThreeModule, source: Three.Texture | null): Three.Texture | null {
  const image = source?.image as CanvasImageSource & { width: number; height: number } | undefined;
  if (!source || !image) return source;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    // Green dominant: cloth. Keep its lightness, drop the hue to a cool charcoal.
    if (g > r * 1.08 && g > b * 1.02) {
      const l = (r + g + b) / 3;
      d[i] = l * 0.42;
      d[i + 1] = l * 0.44;
      d[i + 2] = l * 0.52;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = source.colorSpace;
  texture.flipY = source.flipY;
  texture.magFilter = THREE.NearestFilter;
  return texture;
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
