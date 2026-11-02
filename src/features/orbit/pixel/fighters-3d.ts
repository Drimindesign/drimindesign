import type * as Three from "three";
import { disposeScene } from "./dispose-scene";
import { WEAPONS as ARSENAL, type WeaponId } from "../actors/arsenal";
import { GETUP_TIME, type Boar } from "../actors/boar";
import type { Explorer } from "../actors/explorer";
import type { Mate, MateKind } from "../actors/party";
import type { Camera } from "../engine/camera";
import { PPM } from "../engine/config";
import type { Joint, Ragdoll } from "../engine/ragdoll";

type ThreeModule = typeof Three;
type Kind = "hero" | "raider" | "brute" | "chief" | "giant";

/** Where the 3D figures are drawn: a canvas of their own over the game's, at the screen's full resolution. */
export interface FigureLayer {
  host: HTMLElement;
  /** The game canvas's CSS size (px) and the device pixel ratio. */
  size(): { width: number; height: number; dpr: number };
}

/** The light the figures stand in, matching the stage's scene. */
export type FigureLight = "village" | "city" | "forest" | "jungle" | "river" | "hills" | "caves" | "ruins" | "coast" | "snow";

/** A light in the scene that falls on the figures: a torch, a lantern, a fire (where, its colour, how bright). */
export interface SceneLight {
  x: number;
  y: number;
  color: number;
  power: number;
}

/** The game's zoom about its pivot (art px), so the figures frame exactly what the 2D view shows. */
export interface Framing {
  zoom: number;
  pivotX: number;
  pivotY: number;
  /** The camera's tilt (rad) and shake offset (art px), matching the 2D view's. */
  roll: number;
  ox: number;
  oy: number;
}

/**
 * The fighters: Mixamo characters (Kachujin the hero, the Paladin as raider, Warrok as brute) in
 * their full-detail versions, on one shared skeleton; each clip a separate small file of
 * motion-captured animation.
 */
const MODEL_BASE = "/game/fighters-hd/";
const CLIP_BASE = "/game/fighters/";
const MODELS: Record<Kind, string> = { hero: "hero.glb", raider: "knight.glb", brute: "brute.glb", chief: "brute.glb", giant: "brute.glb" };
/** Bodies shared by more than one kind load once. */
const BODY: Record<Kind, Exclude<Kind, "chief" | "giant">> = { hero: "hero", raider: "raider", brute: "brute", chief: "brute", giant: "brute" };
/** Gorr's hide and Grey's chief: the brute's body, tinted (multiplied into its colours) so they read as someone else. */
const TINT: Partial<Record<Kind, [number, number, number]>> = { giant: [0.72, 0.62, 0.52], chief: [0.85, 0.55, 0.5] };
const CLIPS = [
  "hero_idle", "hero_walk", "hero_run", "hero_slash1", "hero_slash2", "hero_kick", "hero_spin", "hero_hit1", "hero_hit2", "hero_jump",
  "foe_idle", "foe_walk", "foe_run", "foe_slash1", "foe_slash2", "foe_heavy", "foe_block", "foe_blockhit", "foe_hit1", "foe_hit2", "foe_strafe",
  "getup", "sit_to_stand", "stand_to_sit", "hero_swing", "hero_rope_climb", "hero_climb", "hero_master", "foe_death",
] as const;
type Clip = (typeof CLIPS)[number];
/** One-shot clips: they play once and hold their last frame. */
const ONCE = new Set<string>([
  "hero_slash1", "hero_slash2", "hero_kick", "hero_spin", "hero_hit1", "hero_hit2",
  "foe_slash1", "foe_slash2", "foe_heavy", "foe_blockhit", "foe_hit1", "foe_hit2",
  "getup", "sit_to_stand", "stand_to_sit", "hero_master", "foe_death",
]);
/** The hero's combo, blow by blow: two cuts, a kick that breaks a guard, a spinning finisher. */
const HERO_COMBO: readonly Clip[] = ["hero_slash1", "hero_slash2", "hero_kick", "hero_spin"];
/** An enemy's whole swing (s), matching its 2D wind-up, strike and recovery. */
const ENEMY_SWING = 1.18;
/** Getting up blends out of the ragdoll's pose over this long (s). */
const GETUP_BLEND = 0.4;
/** Standing height of each in the world (m). */
const HEIGHT: Record<Kind, number> = { hero: 1.75, raider: 1.9, brute: 2.3, chief: 2.75, giant: 2.45 };
/** Skin and cloth are matte; the knight's plate has a dull metal sheen; the brute's hide is rough. */
const SURFACE: Record<Kind, { roughness: number; metalness: number }> = {
  hero: { roughness: 0.72, metalness: 0 },
  raider: { roughness: 0.48, metalness: 0.35 },
  brute: { roughness: 0.8, metalness: 0.05 },
  chief: { roughness: 0.75, metalness: 0.1 },
  giant: { roughness: 0.85, metalness: 0 },
};
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
  chief: [{ file: "axe_2handed.gltf", hand: "Right", length: 1.6 }],
  giant: [],
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
type AnimalKind = "wolf" | "dog";
const ANIMALS = { wolf: "/game/animals/wolf.glb", dog: "/game/animals/husky.glb" } as const;
const ANIMAL_HEIGHT: Record<AnimalKind, number> = { wolf: 0.95, dog: 0.7 };
/** Turned this far from side-on toward the camera (rad): a three-quarter view reads better than a profile. */
const THREE_QUARTER = 0.4;
/**
 * The toys (KayKit Adventurers, CC0): each body, what it holds in which hand slot, and the clips
 * they share (one file). The dog is the husky from the animals.
 */
const TOYS: Record<Exclude<MateKind, "dog" | "giant">, { model: string; right?: string; left?: string }> = {
  knight: { model: "knight.glb", right: "sword_1handed.gltf", left: "shield_round_color.gltf" },
  barbarian: { model: "barbarian.glb", right: "axe_2handed.gltf" },
  mage: { model: "mage.glb", right: "staff.gltf" },
  ranger: { model: "ranger.glb", left: "bow_withString.gltf" },
  rogue: { model: "rogue.glb", right: "dagger.gltf" },
};
const TOY_CLIPS = "/game/toys/toy_clips.glb";
/** Each mate's standing height (m). */
const MATE_HEIGHT: Record<Exclude<MateKind, "dog" | "giant">, number> = { knight: 0.95, barbarian: 1, mage: 0.95, ranger: 0.95, rogue: 0.9 };
/** The hero's longsword, built in code: slim and long (m), its steel bright and hard. */
const LONGSWORD = { blade: 1.02, width: 0.034, thick: 0.006, guard: 0.17, grip: 0.21 } as const;
/** Scene lights (torches, fires) that fall on the figures at once: the nearest few. */
const SCENE_LIGHTS = 3;
/** The truck's headlights as a light in the scene: how bright, how far it reaches (m), and how far ahead of the nose it sits. */
const HEADLIGHT = { intensity: 30, reach: 12, ahead: 2.5 } as const;
/** The hero's lantern in the dark (jungle): how far it reaches (m), and the flicker (share of its brightness). */
const TORCH = { reach: 8, flicker: 0.1 } as const;
/** Cross-fade between animations (s). */
const FADE = 0.16;
/** The figures' canvas never renders above this many device pixels per CSS pixel (phones at 3× stay fast). */
const MAX_DPR = 2;
/**
 * The reflex to a blow: the torso and head are thrown by it and spring back, slightly
 * underdamped (a real body overshoots and recovers), stiffness ω (1/s) and damping ratio ζ.
 */
const REFLEX = { omega: 12, damping: 0.34 } as const;
/** How a blow at each joint throws the body (rad/s per unit of strength): the trunk bending, the head snapping. */
const REFLEX_KICK: Record<Joint, { bend: number; nod: number }> = {
  head: { bend: 3.5, nod: 15 },
  chest: { bend: 8, nod: 7 },
  pelvis: { bend: 5, nod: 4 },
  elbowL: { bend: 4, nod: 3 },
  elbowR: { bend: 4, nod: 3 },
  handL: { bend: 3, nod: 2 },
  handR: { bend: 3, nod: 2 },
  kneeL: { bend: 4, nod: 3 },
  kneeR: { bend: 4, nod: 3 },
  footL: { bend: 3, nod: 2 },
  footR: { bend: 3, nod: 2 },
};

/**
 * Each scene's light on the figures: the key (moon or sky), a rim from behind (lanterns, neon,
 * moonlight), the sky/ground fill, the room reflections' strength, and the hero's lantern.
 */
const LIGHTS: Record<FigureLight, { key: number; keyIntensity: number; rim: number; rimIntensity: number; sky: number; ground: number; fill: number; env: number; torch: number }> = {
  village: { key: 0xdfe8ff, keyIntensity: 1.9, rim: 0xffb070, rimIntensity: 1.7, sky: 0x9fb4d8, ground: 0x2a1e18, fill: 0.75, env: 0.35, torch: 0 },
  city: { key: 0xd8e4ff, keyIntensity: 1.7, rim: 0xff7a48, rimIntensity: 1.5, sky: 0xa0a8d8, ground: 0x201820, fill: 0.75, env: 0.4, torch: 0 },
  forest: { key: 0xdfe8ff, keyIntensity: 2, rim: 0x9fb8ff, rimIntensity: 1.3, sky: 0x8fa4c8, ground: 0x1a1814, fill: 0.6, env: 0.3, torch: 0 },
  jungle: { key: 0xb8c8ff, keyIntensity: 0.35, rim: 0x8aa4d8, rimIntensity: 0.7, sky: 0x2a3850, ground: 0x0a0806, fill: 0.12, env: 0.05, torch: 9 },
  // River at dusk: a low warm sun behind the trees, cool water light under the chin.
  river: { key: 0xffc890, keyIntensity: 1.3, rim: 0x9fd0ff, rimIntensity: 1.1, sky: 0x8aa8c8, ground: 0x23302a, fill: 0.45, env: 0.25, torch: 4 },
  // The hills at dawn: a gold key from the east, a pink rim, an airy fill.
  hills: { key: 0xffd9a8, keyIntensity: 2.2, rim: 0xff9a8a, rimIntensity: 1.3, sky: 0xc8b8d8, ground: 0x4a3a30, fill: 0.7, env: 0.35, torch: 0 },
  // Caves: almost nothing but fire; the torches and the lantern do all the work.
  caves: { key: 0x9a8a7a, keyIntensity: 0.15, rim: 0xff8a4a, rimIntensity: 0.35, sky: 0x1a1410, ground: 0x0a0806, fill: 0.08, env: 0.03, torch: 11 },
  // Old ruins under a hard moon: cold key, cold rim, the lantern warm against it.
  ruins: { key: 0xc8d4ff, keyIntensity: 0.9, rim: 0xa8b8ff, rimIntensity: 1.1, sky: 0x2a3048, ground: 0x0e0c10, fill: 0.2, env: 0.1, torch: 7 },
  // The moonlit coast: silver light off the sea from behind.
  coast: { key: 0xd8e6ff, keyIntensity: 1.1, rim: 0xe8f2ff, rimIntensity: 1.6, sky: 0x4a6080, ground: 0x141a22, fill: 0.3, env: 0.2, torch: 5 },
  // A snowy pass at night: blue-white bounce from the snow, a pale moon.
  snow: { key: 0xe8f0ff, keyIntensity: 1.2, rim: 0xc8dcff, rimIntensity: 1, sky: 0xa8b8d8, ground: 0x8898b0, fill: 0.55, env: 0.3, torch: 5 },
};

interface Reflex {
  bend: number;
  vb: number;
  nod: number;
  vn: number;
  twist: number;
  vt: number;
  /** The hit count last seen on its body: a new one throws the reflex. */
  serial: number;
}

/** One of the hero's weapons on her body: in her right hand, or on her back while she climbs. */
interface Carried {
  object: Three.Object3D;
  hand: { parent: Three.Object3D; matrix: Three.Matrix4 };
  back: { parent: Three.Object3D; matrix: Three.Matrix4 };
  /** The blade's steel (it glows when it burns), and the fire on it. */
  steel: Three.MeshStandardMaterial[];
  flame: Three.Object3D | null;
}

interface Actor {
  /** What it is (its pool when it's free to reuse). */
  kind: string;
  root: Three.Group;
  model: Three.Object3D;
  mixer: Three.AnimationMixer;
  actions: Map<string, Three.AnimationAction>;
  current: string;
  materials: Three.MeshStandardMaterial[];
  /** The swing being played, so a new swing restarts the clip; which cut a raider is making. */
  swing: number;
  cut: number;
  /** Ragdoll driving: each driven bone with its rest orientation and rest direction. */
  drives: { bone: Three.Bone; from: Joint; to: Joint; rest: Three.Quaternion; restDir: Three.Vector3 }[];
  /** The bones a blow throws: the spine up to the head. */
  trunk: { spine: Three.Bone | null; spine1: Three.Bone | null; spine2: Three.Bone | null; neck: Three.Bone | null; head: Three.Bone | null };
  reflex: Reflex;
  /** The beast state last frame (to catch the moment it starts getting up), and the get-up blend. */
  state: string;
  blend: { t: number; from: Map<Three.Bone, Three.Quaternion>; hips: Three.Vector3 } | null;
}

/*
 * The people of the game in 3D: the hero and the raiders and brutes who fight on foot, and the
 * animals. Their bodies stay 2D physics (where they are, how fast, whether they're swinging, hit
 * or down); here each one plays the matching motion-capture clip, cross-faded, facing
 * three-quarters toward the camera, with its weapon in its hand. A blow throws the trunk and head
 * on a spring (the reflex) on top of the hit clip; a limp body's bones follow its ragdoll, and
 * getting up blends out of the fallen pose. Rendered by three.js with physically based materials
 * into a canvas of their own over the game, at the screen's full resolution (never pixelated,
 * however close the camera comes), through an orthographic camera lined up with the 2D view and
 * its zoom. Loads in the background; until it's ready (or without WebGL) the 2D explorer is drawn.
 */
export class Fighters3D {
  private harnessGeometry: Three.TorusGeometry | null = null;
  private harnessMaterial: Three.MeshStandardMaterial | null = null;
  private three: {
    THREE: ThreeModule;
    renderer: Three.WebGLRenderer;
    scene: Three.Scene;
    camera: Three.OrthographicCamera;
    make: (kind: Kind) => Actor;
    makeAnimal: (kind: AnimalKind) => Actor;
    headlight: Three.PointLight;
    torch: Three.PointLight;
    firelight: Three.PointLight;
    key: Three.DirectionalLight;
    rim: Three.DirectionalLight;
    fill: Three.HemisphereLight;
    spare: Map<string, Actor[]>;
    cages: Three.Group[];
    hero: Actor;
    arms: Map<WeaponId, Carried>;
    enemies: Map<Boar, Actor>;
    mates: Map<Mate, Actor>;
    makeMate: ((kind: MateKind) => Actor) | null;
    lamps: Three.PointLight[];
    scratch: { q: Three.Quaternion; r: Three.Quaternion; p: Three.Quaternion; v: Three.Vector3; w: Three.Vector3; axis: Three.Vector3; up: Three.Vector3 };
  } | null = null;
  private readonly canvas: HTMLCanvasElement | null;
  private width = 480;
  private height = 270;
  private pixels = { width: 0, height: 0, css: "" };
  private shown = false;
  private opacity = -1;
  private disposed = false;
  private release: (() => void) | null = null;
  /** The scene's light (set per level), the hero's hands and blade tip in the world (for the rope and the embers), and the render quality (device px per CSS px). */
  private light: FigureLight;
  hands: { x: number; y: number } | null = null;
  tip: { x: number; y: number } | null = null;
  private quality = 2;
  private slow = 0;

  constructor(
    private readonly layer: FigureLayer | null,
    light: FigureLight,
  ) {
    this.light = light;
    // Phones start a notch lower; any device steps down further if frames run slow (see `fit`).
    this.quality = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? 1.5 : MAX_DPR;
    if (!layer) {
      this.canvas = null;
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    // Stacked on the game's canvas in the same grid cell, never catching a touch.
    canvas.style.gridArea = "1 / 1";
    canvas.style.pointerEvents = "none";
    canvas.style.width = "0px";
    canvas.style.height = "0px";
    layer.host.appendChild(canvas);
    this.canvas = canvas;
    void this.load(canvas);
  }

  get ready(): boolean {
    return this.three !== null;
  }

  /** A new level's light: the key, rim, fill and reflections restyled in place (no new lights, so no shader rebuilds). */
  setLight(light: FigureLight): void {
    this.light = light;
    const t = this.three;
    if (!t) return;
    const look = LIGHTS[light];
    t.key.color.setHex(look.key);
    t.key.intensity = look.keyIntensity;
    t.rim.color.setHex(look.rim);
    t.rim.intensity = look.rimIntensity;
    t.fill.color.setHex(look.sky);
    t.fill.groundColor.setHex(look.ground);
    t.fill.intensity = look.fill;
    t.scene.environmentIntensity = look.env;
  }

  /*
   * A level is over: everyone but the hero goes back to the pool (hidden, ready to be handed out
   * again), so the next level reuses the same bodies instead of building and compiling new ones.
   */
  reset(): void {
    const t = this.three;
    if (!t) return;
    for (const actor of t.enemies.values()) this.recycle(t, actor);
    for (const actor of t.mates.values()) this.recycle(t, actor);
    t.enemies.clear();
    t.mates.clear();
    for (const cage of t.cages) cage.visible = false;
    this.hands = null;
    this.tip = null;
  }

  private recycle(t: NonNullable<Fighters3D["three"]>, actor: Actor): void {
    actor.root.visible = false;
    actor.state = "";
    actor.blend = null;
    actor.swing = -1;
    actor.reflex = newReflex();
    setOpacity(actor, 1);
    for (const m of actor.materials) m.emissiveIntensity = 0;
    t.spare.set(actor.kind, [...(t.spare.get(actor.kind) ?? []), actor]);
  }

  /** The 2D view's size in art px. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /**
   * Draws the hero (when on foot), the fighters and the animals; returns false when not ready, so
   * the caller draws the 2D explorer. `headlight`: the truck's lamps (where, and which way they
   * face), lighting whoever stands in front. `opacity`: the stage's fade to black. `torch`: the
   * hero's lantern in the dark, if lit.
   */
  draw(camera: Camera, framing: Framing, dt: number, alpha: number, hero: Explorer | null, beasts: readonly Boar[], headlight: { x: number; y: number; dir: number } | null, opacity: number, torch: { x: number; y: number } | null, mates: readonly Mate[] = [], lights: readonly SceneLight[] = [], cages: readonly { x: number; y: number; broken: boolean }[] = []): boolean {
    const t = this.three;
    if (!t || !this.canvas) return false;
    this.slow = this.slow * 0.97 + (dt > 1 / 42 ? 0.03 : 0);
    if (this.slow > 0.55 && this.quality > 1) {
      this.quality = Math.max(1, this.quality - 0.25);
      this.slow = 0;
    }
    this.fit(t.renderer);
    if (opacity !== this.opacity) {
      this.opacity = opacity;
      this.canvas.style.opacity = opacity.toFixed(3);
    }
    t.headlight.intensity = headlight ? HEADLIGHT.intensity : 0;
    if (headlight) t.headlight.position.set(headlight.x + headlight.dir * HEADLIGHT.ahead, headlight.y + 0.7, 1.2);
    // Keep the light in the scene even when off: toggling fire must not change shader light counts.
    const burning = hero !== null && hero.alpha > 0.05 && hero.burning > 0 && !hero.sheathed && hero.weapon === "blade";
    t.firelight.intensity = burning ? 1 : 0;
    if (hero && burning) t.firelight.position.set(hero.body.x + hero.body.facing * 0.6, hero.body.y + 1, 0.4);
    const lantern = LIGHTS[this.light].torch;
    t.torch.intensity = torch && lantern > 0 ? lantern * (1 - TORCH.flicker * (0.5 + 0.5 * Math.sin(performance.now() / 47) * Math.sin(performance.now() / 131))) : 0;
    // The lantern hangs from her side, a little forward and high: it lights her from the side (shape, not a flat glare).
    if (torch) t.torch.position.set(torch.x + (hero?.body.facing ?? 1) * 0.55, torch.y + 1.5, 0.35);
    // The nearest torches and fires light whoever stands by them; their flames flicker.
    const near = [...lights].sort((a, b) => Math.abs(a.x - camera.x) - Math.abs(b.x - camera.x));
    t.lamps.forEach((lamp, i) => {
      const l = near[i];
      lamp.intensity = l ? l.power * (0.9 + 0.1 * Math.sin(performance.now() / (61 + i * 17) + i)) : 0;
      if (l) {
        lamp.color.setHex(l.color);
        lamp.position.set(l.x, l.y, 1.1);
      }
    });
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
        const x = b.px + (b.x - b.px) * alpha;
        const y = b.py + (b.y - b.py) * alpha;
        const yaw = b.facing > 0 ? Math.PI / 2 - THREE_QUARTER : -Math.PI / 2 + THREE_QUARTER;
        if (hero.ropeAnchor) {
          // On a rope the body hangs from the hands, in line with the rope as it swings.
          const roll = hero.ropeAngle;
          const hands = hero.hands;
          const hx = hands.x + (x - b.x);
          const hy = hands.y + (y - b.y);
          t.hero.root.position.set(hx + Math.sin(roll) * (hands.y - b.y), hy - Math.cos(roll) * (hands.y - b.y), 0);
          t.hero.root.rotation.set(0, yaw, roll);
        } else {
          // Riding Gorr: up on his shoulders (and in front of him, so he doesn't hide her).
          t.hero.root.position.set(x, y + (hero.riding ? hero.rideHeight : 0), hero.riding ? 0.5 : 0);
          t.hero.root.rotation.set(0, yaw, 0);
        }
        this.carry(t, hero);
        if (hero.getup > 0) {
          if (t.hero.state === "limp") startGetup(t.THREE, t.hero, hero.getup);
          t.hero.state = "getup";
        } else {
          t.hero.state = "";
          this.animateHero(t.hero, hero);
        }
        t.hero.mixer.update(dt);
        blendOut(t.hero, dt);
        this.react(t, t.hero, hero.hitSerial, hero.lastBlow, b.facing, 1, dt);
        this.measure(t, hero);
      }
    } else {
      this.hands = null;
      this.tip = null;
    }

    // Cages: real bars in front of whoever is locked inside, gone once broken.
    cages.forEach((cage, i) => {
      t.cages[i] ??= makeCage(t.THREE, t.scene);
      const group = t.cages[i];
      group.visible = !cage.broken && Math.abs(cage.x - camera.x) < view;
      if (!group.visible) return;
      group.position.set(cage.x, cage.y, 0.3);
      any = true;
    });
    for (let i = cages.length; i < t.cages.length; i++) t.cages[i].visible = false;
    for (const [mate, actor] of t.mates) if (!mates.includes(mate)) actor.root.visible = false;
    for (const mate of mates) any = this.drawMate(t, mate, camera, dt) || any;

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
        if (actor) {
          // Gone for good: its body goes back to the pool.
          if (beast.state === "gone") {
            this.recycle(t, actor);
            t.enemies.delete(beast);
          } else {
            actor.root.visible = false;
          }
        }
        continue;
      }
      if (!actor) {
        actor = t.make(beast.kind === "brute" ? "brute" : beast.kind === "chief" ? "chief" : "raider");
        t.enemies.set(beast, actor);
      }
      actor.root.visible = true;
      setOpacity(actor, pose.alpha);
      // A hit flashes it pale; on fire it glows from within, flickering.
      const burn = beast.burning > 0 ? 0.3 + 0.12 * Math.sin(performance.now() / 41) : 0;
      for (const m of actor.materials) {
        if (burn > 0) m.emissive.setRGB(1, 0.36, 0.08);
        else m.emissive.setRGB(1, 0.92, 0.85);
        m.emissiveIntensity = pose.flash ? 0.18 : burn;
      }
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
      this.react(t, actor, beast.hitSerial, beast.lastBlow, pose.facing, 90 / beast.mass, dt);
    }
    if (!any) {
      // Nobody on screen: clear once and stop drawing until someone is.
      if (this.shown) {
        t.renderer.clear();
        this.shown = false;
      }
      return true;
    }
    this.shown = true;
    this.frame(t.camera, camera, framing);
    t.renderer.render(t.scene, t.camera);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas?.remove();
    this.release?.();
    this.release = null;
    this.three = null;
    this.harnessGeometry = null;
    this.harnessMaterial = null;
  }

  // ---------------------------------------------------------------------------

  /* The canvas at the game's CSS size and the device's resolution (capped). */
  private fit(renderer: Three.WebGLRenderer): void {
    if (!this.layer || !this.canvas) return;
    const { width, height, dpr } = this.layer.size();
    const scale = Math.min(this.quality, Math.max(1, dpr));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (w !== this.pixels.width || h !== this.pixels.height) {
      this.pixels.width = w;
      this.pixels.height = h;
      renderer.setSize(w, h, false);
    }
    const css = `${width}x${height}`;
    if (css !== this.pixels.css) {
      this.pixels.css = css;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
  }

  /*
   * The orthographic camera spans exactly what the 2D view shows, zoom included: the game scales
   * the art about a pivot, so the visible art px run from pivot·(1 − 1/z) to pivot + (size − pivot)/z.
   */
  private frame(camera: Three.OrthographicCamera, at: Camera, framing: Framing): void {
    const z = Math.max(1, framing.zoom);
    const x0 = framing.pivotX - framing.pivotX / z;
    const x1 = framing.pivotX + (this.width - framing.pivotX) / z;
    const y0 = framing.pivotY - framing.pivotY / z;
    const y1 = framing.pivotY + (this.height - framing.pivotY) / z;
    camera.position.set(at.x, at.y, 20);
    camera.rotation.set(0, 0, framing.roll);
    camera.left = (x0 - framing.ox - this.width / 2) / PPM;
    camera.right = (x1 - framing.ox - this.width / 2) / PPM;
    camera.top = (this.height / 2 - y0 + framing.oy) / PPM;
    camera.bottom = (this.height / 2 - y1 + framing.oy) / PPM;
    camera.updateProjectionMatrix();
  }

  /*
   * The reflex: a new blow (the body's hit count went up) throws the trunk and head by where it
   * landed and how hard, scaled by the body's lightness; then they spring back with a little
   * overshoot. Bent back when struck from the front, forward from behind, with a twist.
   */
  private react(t: NonNullable<Fighters3D["three"]>, actor: Actor, serial: number, blow: { joint: Joint; power: number; dir: number }, facing: number, share: number, dt: number): void {
    const r = actor.reflex;
    if (serial !== r.serial) {
      if (serial > r.serial) {
        const strength = Math.min(1.4, (blow.power / 4) * share);
        const kick = REFLEX_KICK[blow.joint];
        const back = facing === -blow.dir ? -1 : 1;
        r.vb += back * kick.bend * strength;
        r.vn += back * kick.nod * strength;
        r.vt += (Math.random() - 0.5) * 6 * strength;
      }
      r.serial = serial;
    }
    const step = Math.min(dt, 1 / 30);
    const { omega, damping } = REFLEX;
    for (const [x, v] of [["bend", "vb"], ["nod", "vn"], ["twist", "vt"]] as const) {
      r[v] += (-omega * omega * r[x] - 2 * damping * omega * r[v]) * step;
      r[x] += r[v] * step;
    }
    if (Math.abs(r.bend) + Math.abs(r.nod) + Math.abs(r.twist) < 1e-3) return;
    const { trunk } = actor;
    const s = t.scratch;
    actor.root.updateMatrixWorld(true);
    // The body's own side-to-side axis (the model faces +z) and the world's up.
    s.axis.set(1, 0, 0).applyQuaternion(actor.root.quaternion);
    s.up.set(0, 1, 0);
    turnBone(trunk.spine, s.axis, r.bend * 0.35, s);
    turnBone(trunk.spine1, s.up, r.twist * 0.5, s);
    turnBone(trunk.spine1, s.axis, r.bend * 0.3, s);
    turnBone(trunk.spine2, s.axis, r.bend * 0.35, s);
    turnBone(trunk.neck, s.axis, r.nod * 0.4, s);
    turnBone(trunk.head, s.axis, r.nod * 0.6, s);
  }

  /* Where her hands are (between the two: the rope is drawn to them) and the tip of a burning blade (embers come off it). */
  private measure(t: NonNullable<Fighters3D["three"]>, hero: Explorer): void {
    const s = t.scratch;
    const right = t.hero.model.getObjectByName(bone("RightHand"));
    const left = t.hero.model.getObjectByName(bone("LeftHand"));
    if (right && left) {
      t.hero.root.updateMatrixWorld(true);
      right.getWorldPosition(s.v);
      left.getWorldPosition(s.w);
      this.hands = { x: (s.v.x + s.w.x) / 2, y: (s.v.y + s.w.y) / 2 };
    }
    const blade = t.arms.get("blade");
    if (hero.weapon === "blade" && hero.burning > 0 && !hero.sheathed && blade) {
      s.v.set(0, LONGSWORD.grip * 0.5 + LONGSWORD.blade * 0.95, 0);
      blade.object.localToWorld(s.v);
      this.tip = { x: s.v.x, y: s.v.y };
    } else {
      this.tip = null;
    }
  }

  /*
   * The hero's weapons: the one in use in her right hand, put away on her back while both hands
   * are busy (a rope, a climb, the truck's door); the others not shown. A burning blade glows and flames.
   */
  private carry(t: NonNullable<Fighters3D["three"]>, hero: Explorer): void {
    for (const [id, arm] of t.arms) {
      const used = id === hero.weapon;
      arm.object.visible = used;
      if (!used) continue;
      const place = hero.sheathed ? arm.back : arm.hand;
      if (arm.object.parent !== place.parent) {
        place.parent.add(arm.object);
        place.matrix.decompose(arm.object.position, arm.object.quaternion, arm.object.scale);
      }
      const burning = hero.burning > 0 && !hero.sheathed;
      for (const m of arm.steel) {
        m.emissive.setHex(burning ? 0xff5a14 : 0xffffff);
        m.emissiveIntensity = burning ? 0.55 + 0.12 * Math.sin(performance.now() / 53) : 0;
      }
      if (arm.flame) {
        arm.flame.visible = burning;
        const clock = arm.flame.userData.time as { value: number } | undefined;
        if (burning && clock) clock.value = performance.now() / 1000;
        if (burning) {
          const k = performance.now() / 1000;
          arm.flame.children.forEach((c, i) => {
            const sprite = c as Three.Sprite;
            if (!sprite.isSprite) return;
            // Small tongues of flame along the steel (m), flickering; never a ball of light.
            sprite.scale.setScalar((0.15 - i * 0.012) * (0.8 + 0.35 * Math.abs(Math.sin(k * (9 + i * 2.3) + i))));
            sprite.material.rotation = Math.sin(k * 3 + i) * 0.3;
          });
        }
      }
    }
  }

  /* A mate: a KayKit toy (or the dog), playing the clip its state asks for, in the light like everyone else. */
  private drawMate(t: NonNullable<Fighters3D["three"]>, mate: Mate, camera: Camera, dt: number): boolean {
    if (!t.makeMate) return false;
    let actor = t.mates.get(mate);
    if (Math.abs(mate.x - camera.x) > this.width / PPM / 2 + 4 || mate.alpha <= 0.02) {
      if (actor) actor.root.visible = false;
      return false;
    }
    if (!actor) {
      actor = t.makeMate(mate.kind);
      t.mates.set(mate, actor);
    }
    const pose = mate.navigationPose;
    if (pose.kind === "rope") {
      this.harnessGeometry ??= new t.THREE.TorusGeometry(0.17, 0.035, 6, 14);
      this.harnessMaterial ??= new t.THREE.MeshStandardMaterial({ color: 0x76512d, roughness: 0.82, metalness: 0.05 });
      if (!actor.root.userData.companionHarness) {
        const harness = new t.THREE.Mesh(this.harnessGeometry, this.harnessMaterial);
        harness.name = "companion-rope-harness";
        harness.rotation.x = Math.PI / 2;
        harness.position.y = mate.spec.height * 0.46;
        actor.root.add(harness);
        actor.root.userData.companionHarness = harness;
      }
    }
    actor.root.visible = true;
    setOpacity(actor, mate.alpha);
    actor.root.position.set(mate.x, mate.y, 0.35);
    actor.root.rotation.set(0, mate.facing > 0 ? Math.PI / 2 - THREE_QUARTER : -Math.PI / 2 + THREE_QUARTER, 0);
    actor.root.rotation.z = pose.kind === "rope" && pose.rope
      ? Math.atan2(pose.rope.x - mate.x, pose.rope.y - mate.y - 0.8) * 0.18
      : 0;
    const clip = pose.kind === "rope"
      ? mate.kind === "dog"
        ? { name: "Gallop_Jump", speed: 0.75, once: false }
        : mate.kind === "giant"
          ? { name: "foe_run", speed: 0.55, once: false }
          : { name: "Jump_Full_Short", speed: 0.65, once: false }
      : pose.kind === "climb"
        ? { name: mate.kind === "dog" ? "Walk" : mate.kind === "giant" ? "hero_climb" : "Jump_Full_Short", speed: 0.5, once: false }
        : pose.kind === "ride"
          ? { name: mate.kind === "dog" ? "Idle" : mate.kind === "giant" ? "foe_idle" : "Idle_A", speed: 0.75, once: false }
          : mate.clip;
    // A one-shot clip plays from the top when it starts, and again for a fresh hit.
    play(actor, clip.name, clip.speed, clip.once && (actor.current !== clip.name || mate.hitSerial !== actor.reflex.serial));
    actor.reflex.serial = mate.hitSerial;
    actor.mixer.update(dt);
    return true;
  }

  /* An animal: placed on its 2D body, turned three-quarters to where it's heading, playing its own clips. */
  private drawAnimal(t: NonNullable<Fighters3D["three"]>, beast: Boar, camera: Camera, dt: number): boolean {
    let actor = t.enemies.get(beast);
    const pose = beast.pose();
    if (!pose.visible || Math.abs(beast.x - camera.x) > this.width / PPM / 2 + 4) {
      if (actor) actor.root.visible = false;
      return false;
    }
    if (!actor) {
      actor = t.makeAnimal(beast.kind === "dog" ? "dog" : "wolf");
      t.enemies.set(beast, actor);
    }
    actor.root.visible = true;
    // A blow jolts the whole animal: it rears and settles back on the same spring as a person's reflex.
    const r = actor.reflex;
    if (beast.hitSerial !== r.serial) {
      if (beast.hitSerial > r.serial) r.vb += 6 * Math.min(1.2, (beast.lastBlow.power / 4) * (90 / beast.mass));
      r.serial = beast.hitSerial;
    }
    const step = Math.min(dt, 1 / 30);
    r.vb += (-REFLEX.omega * REFLEX.omega * r.bend - 2 * REFLEX.damping * REFLEX.omega * r.vb) * step;
    r.bend += r.vb * step;
    actor.root.position.set(beast.x, beast.y, -0.3);
    actor.root.rotation.set(0, pose.facing > 0 ? Math.PI / 2 - THREE_QUARTER * 0.6 : -Math.PI / 2 + THREE_QUARTER * 0.6, pose.angle + r.bend * 0.35 * pose.facing);
    setOpacity(actor, pose.alpha);
    for (const m of actor.materials) m.emissiveIntensity = pose.flash ? 0.15 : 0;
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
        play(actor, beast.kind === "wolf" && beast.state === "wait" ? "Idle" : "Eating");
        break;
      default:
        if (!beast.grounded) play(actor, "Gallop_Jump");
        else if (beast.dangerous && speed < 1) play(actor, "Attack");
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
    // The Master Stroke: the motion-captured spin, timed to the stroke. Riding Gorr: seated.
    if (hero.stroke >= 0) {
      if (actor.current !== "hero_master") play(actor, "hero_master", clipLength(actor, "hero_master") / 1, true);
      return;
    }
    if (hero.riding) {
      if (actor.current !== "stand_to_sit") play(actor, "stand_to_sit", 2, true);
      return;
    }
    // On a rope: hand over hand up it, or hanging and swinging with it (the clip's swing matched
    // to the pendulum's). Hauling up a rock face: the motion-captured climb, timed to the haul.
    if (hero.onVine) {
      play(actor, "hero_rope_climb", 1.1);
      return;
    }
    if (hero.ropeAnchor) {
      if (hero.ropeClimbing) play(actor, "hero_rope_climb", 1);
      else play(actor, "hero_swing", 0.7);
      return;
    }
    if (b.climb >= 0) {
      if (actor.current !== "hero_climb") play(actor, "hero_climb", clipLength(actor, "hero_climb") / b.climbTime, true);
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
    if (hero.hurting) play(actor, hero.lastBlow.joint === "head" ? "hero_hit1" : "hero_hit2");
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
      case "stagger": {
        // The head snaps back from a blow to the face; a body blow doubles it over. A fresh blow restarts it.
        const clip = beast.lastBlow.joint === "head" ? "foe_hit1" : "foe_hit2";
        play(actor, clip, 1, actor.reflex.serial !== beast.hitSerial);
        break;
      }
      case "wait":
        if (Math.abs(beast.vx) > 0.3) play(actor, "foe_walk", Math.abs(beast.vx) / 1.6);
        else play(actor, "foe_idle");
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

  /*
   * The toys, loaded once the fighters are in: five KayKit bodies sharing one file of clips, each
   * with what it carries in its hand slots; scaled to toy size and lit like everyone else.
   */
  private async loadToys(THREE: ThreeModule, loader: { loadAsync(url: string): Promise<{ scene: Three.Group; animations: Three.AnimationClip[] }> }, clone: (o: Three.Object3D) => Three.Object3D, scene: Three.Scene, makeAnimal: (kind: AnimalKind) => Actor): Promise<void> {
    try {
      const kinds = Object.keys(TOYS) as (keyof typeof TOYS)[];
      const files = [...new Set(kinds.flatMap((k) => [TOYS[k].right, TOYS[k].left].filter((f): f is string => f !== undefined)))];
      const [bodies, clips, props] = await Promise.all([
        Promise.all(kinds.map(async (k) => [k, await loader.loadAsync(`/game/toys/${TOYS[k].model}`)] as const)),
        loader.loadAsync(TOY_CLIPS),
        Promise.all(files.map(async (f) => [f, await loader.loadAsync(`/game/kaykit/${f}`)] as const)),
      ]);
      const t = this.three;
      if (this.disposed || !t) return;
      const sources = new Map(bodies);
      const held = new Map(props);
      const makeMate = (kind: MateKind): Actor => {
        if (kind === "dog") return makeAnimal("dog");
        if (kind === "giant") return t.make("giant");
        const source = sources.get(kind);
        if (!source) throw new Error(`Missing toy ${kind}`);
        const model = clone(source.scene);
        const materials: Three.MeshStandardMaterial[] = [];
        const finish = (node: Three.Object3D): void => {
          const mesh = node as Three.Mesh;
          if (!mesh.isMesh) return;
          // Painted plastic: a soft sheen, never metal.
          const m = (mesh.material as Three.MeshStandardMaterial).clone();
          m.roughness = 0.55;
          m.metalness = 0;
          m.emissiveIntensity = 0;
          mesh.material = m;
          mesh.frustumCulled = false;
          materials.push(m);
        };
        model.traverse(finish);
        // What it holds goes straight into its hand slots (KayKit props fit them as they are).
        for (const [slot, file] of [["handslotr", TOYS[kind].right], ["handslotl", TOYS[kind].left]] as const) {
          const bone = model.getObjectByName(slot);
          const prop = file ? held.get(file) : undefined;
          if (!bone || !prop) continue;
          const item = prop.scene.clone();
          item.traverse(finish);
          bone.add(item);
        }
        const box = new THREE.Box3().setFromObject(source.scene);
        const scale = MATE_HEIGHT[kind] / Math.max(0.01, box.max.y - box.min.y);
        model.scale.setScalar(scale);
        model.position.y = -box.min.y * scale;
        const root = new THREE.Group();
        root.rotation.order = "ZYX";
        root.add(model);
        scene.add(root);
        const mixer = new THREE.AnimationMixer(model);
        const actions = new Map<string, Three.AnimationAction>();
        for (const clip of clips.animations) {
          const action = mixer.clipAction(clip);
          if (["Sit_Floor_StandUp", "Cheering", "Hit_A", "Death_A", "Melee_1H_Attack_Chop", "Melee_2H_Attack_Chop", "Ranged_Magic_Shoot", "Ranged_Bow_Release"].includes(clip.name)) {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          actions.set(clip.name, action);
        }
        const trunk = { spine: null, spine1: null, spine2: null, neck: null, head: null };
        const actor: Actor = { kind, root, model, mixer, actions, current: "", materials, swing: -1, cut: 0, drives: [], trunk, reflex: newReflex(), state: "", blend: null };
        play(actor, "Idle_A");
        return actor;
      };
      // Prepare each companion outside draw(): first appearance must not compile its shaders mid-fight.
      const prepared = new Map<MateKind, Actor>();
      for (const kind of kinds) {
        if (this.disposed) return;
        const actor = makeMate(kind);
        actor.root.visible = false;
        for (const material of actor.materials) material.transparent = true;
        await t.renderer.compileAsync(actor.root, t.camera, scene);
        if (this.disposed) return;
        for (const material of actor.materials) material.transparent = false;
        await t.renderer.compileAsync(actor.root, t.camera, scene);
        if (this.disposed) return;
        actor.root.traverse((node) => {
          const map = ((node as Three.Mesh).material as Three.MeshStandardMaterial | undefined)?.map;
          if (map) t.renderer.initTexture(map);
        });
        prepared.set(kind, actor);
        // Yield between figures so decoding and setup cannot monopolise the input thread.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (this.disposed) return;
      t.makeMate = (kind) => {
        const reused = t.spare.get(kind)?.pop();
        if (reused) return reused;
        if (kind === "giant") return t.make("giant");
        const actor = prepared.get(kind);
        if (actor) { prepared.delete(kind); return actor; }
        return makeMate(kind);
      };
    } catch {
      // No toys: the team just isn't drawn.
    }
  }

  private async load(canvas: HTMLCanvasElement): Promise<void> {
    try {
      const [THREE, { GLTFLoader }, { clone }, { MeshoptDecoder }, { RoomEnvironment }] = await Promise.all([
        import("three"),
        import("three/addons/loaders/GLTFLoader.js"),
        import("three/addons/utils/SkeletonUtils.js"),
        import("three/addons/libs/meshopt_decoder.module.js"),
        import("three/addons/environments/RoomEnvironment.js"),
      ]);
      if (this.disposed) return;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const kinds = Object.keys(MODELS) as Kind[];
      const bodies = [...new Set(kinds.map((kind) => BODY[kind]))];
      const animalKinds: AnimalKind[] = ["wolf", "dog"];
      const heroProps = Object.values(ARSENAL).flatMap((w) => (w.look.kind === "prop" ? [w.look.file] : []));
      const props = [...new Set([...kinds.flatMap((kind) => WEAPONS[kind].map((w) => w.file)), ...heroProps])];
      const [models, clips, held, animalModels] = await Promise.all([
        Promise.all(bodies.map(async (body) => [body, await loader.loadAsync(MODEL_BASE + MODELS[body])] as const)),
        Promise.all(CLIPS.map(async (name) => named(await loader.loadAsync(`${CLIP_BASE}${name}.glb`), name))),
        Promise.all(props.map(async (file) => [file, await loader.loadAsync(`/game/kaykit/${file}`)] as const)),
        Promise.all(animalKinds.map(async (kind) => [kind, await loader.loadAsync(ANIMALS[kind])] as const)),
      ]);
      const animalSources = new Map(animalModels);
      if (this.disposed) return;
      const animations = clips.filter((c): c is Three.AnimationClip => c !== null);
      const weaponScenes = new Map(held);
      // Antialiased and premultiplied: the canvas is composited by the page over the game's, not copied into it.
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.toneMappingExposure = 1.25;
      this.fit(renderer);
      const scene = new THREE.Scene();
      let environment: Three.WebGLRenderTarget | null = null;
      this.release = () => {
        disposeScene(scene);
        environment?.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      };
      // Soft reflections from a neutral room, so skin, cloth and steel read as different surfaces.
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      environment = pmrem.fromScene(room, 0.04);
      scene.environment = environment.texture;
      room.dispose();
      pmrem.dispose();
      const look = LIGHTS[this.light];
      scene.environmentIntensity = look.env;
      // The scene's light: a key from the front-left, a rim from behind, the sky and ground fill.
      const key = new THREE.DirectionalLight(look.key, look.keyIntensity);
      key.position.set(-2, 3, 4);
      const rim = new THREE.DirectionalLight(look.rim, look.rimIntensity);
      rim.position.set(2, 2, -3);
      const fill = new THREE.HemisphereLight(look.sky, look.ground, look.fill);
      scene.add(key, rim, fill);
      const headlight = new THREE.PointLight(0xeaf2ff, 0, HEADLIGHT.reach, 1.4);
      const torch = new THREE.PointLight(0xffa25a, 0, TORCH.reach, 1.6);
      // Torches and fires in the scene: a few lights, moved to whichever are nearest each frame.
      const lamps = Array.from({ length: SCENE_LIGHTS }, () => new THREE.PointLight(0xff9a4a, 0, 7, 1.7));
      const firelight = new THREE.PointLight(0xff6a1a, 0, 3.5, 1.8);
      scene.add(headlight, torch, firelight, ...lamps);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

      const heights = new Map<Kind, { height: number; floor: number }>();
      // (keyed by body: the chief and Gorr share the brute's)
      for (const [kind, gltf] of models) {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        heights.set(kind, { height: Math.max(0.01, box.max.y - box.min.y), floor: box.min.y });
      }
      const sources = new Map(models);
      const scratch = { q: new THREE.Quaternion(), r: new THREE.Quaternion(), p: new THREE.Quaternion(), v: new THREE.Vector3(), w: new THREE.Vector3(), axis: new THREE.Vector3(), up: new THREE.Vector3() };

      const make = (kind: Kind): Actor => {
        const source = sources.get(BODY[kind]);
        const tint = TINT[kind];
        if (!source) throw new Error(`Missing model ${kind}`);
        const model = clone(source.scene) as Three.Group;
        const materials: Three.MeshStandardMaterial[] = [];
        model.traverse((node) => {
          const mesh = node as Three.Mesh;
          if (!mesh.isMesh) return;
          // Each figure has its own materials (fading and hit flashes are per body).
          const m = (mesh.material as Three.MeshStandardMaterial).clone();
          m.roughness = SURFACE[kind].roughness;
          m.metalness = SURFACE[kind].metalness;
          if (m.transparent) {
            // Hair cards: cut out instead of blended, so they sort correctly.
            m.transparent = false;
            m.alphaTest = 0.5;
          }
          if (!m.emissiveMap) m.emissive.setRGB(1, 0.92, 0.85);
          if (tint) m.color.multiply(new THREE.Color(...tint));
          m.emissiveIntensity = 0;
          mesh.material = m;
          mesh.frustumCulled = false;
          materials.push(m);
        });
        const root = new THREE.Group();
        root.rotation.order = "ZYX";
        const size = heights.get(BODY[kind]) ?? { height: 1, floor: 0 };
        const scale = HEIGHT[kind] / size.height;
        model.scale.setScalar(scale);
        // Soles on the ground: the root sits where the feet are.
        model.position.y = -size.floor * scale;
        root.add(model);
        root.updateMatrixWorld(true);
        for (const w of kind === "hero" ? [] : WEAPONS[kind]) {
          const hand = model.getObjectByName(bone(`${w.hand}Hand`));
          const prop = weaponScenes.get(w.file);
          if (hand && prop) arm(THREE, hand, prop.scene.clone(), w.length, w.shield === true, materials);
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
        const find = (name: string): Three.Bone | null => (model.getObjectByName(bone(name)) as Three.Bone | undefined) ?? null;
        const trunk = { spine: find("Spine"), spine1: find("Spine1"), spine2: find("Spine2"), neck: find("Neck"), head: find("Head") };
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
        const actor: Actor = { kind, root, model, mixer, actions, current: "", materials, swing: -1, cut: 0, drives, trunk, reflex: newReflex(), state: "", blend: null };
        play(actor, kind === "hero" ? "hero_idle" : "foe_idle");
        return actor;
      };
      // An animal: in its own colours, with the clips that came with it.
      const makeAnimal = (kind: AnimalKind): Actor => {
        const source = animalSources.get(kind);
        if (!source) throw new Error(`Missing animal ${kind}`);
        const model = clone(source.scene) as Three.Group;
        const materials: Three.MeshStandardMaterial[] = [];
        model.traverse((node) => {
          const mesh = node as Three.Mesh;
          if (!mesh.isMesh) return;
          const m = (mesh.material as Three.MeshStandardMaterial).clone();
          // Fur: no sheen at all.
          m.roughness = 0.9;
          m.metalness = 0;
          if (!m.emissiveMap) m.emissive.setRGB(1, 0.92, 0.85);
          m.emissiveIntensity = 0;
          mesh.material = m;
          mesh.frustumCulled = false;
          materials.push(m);
        });
        const box = new THREE.Box3().setFromObject(source.scene);
        model.scale.setScalar(ANIMAL_HEIGHT[kind] / Math.max(0.01, box.max.y - box.min.y));
        const root = new THREE.Group();
        root.rotation.order = "ZYX";
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
        const trunk = { spine: null, spine1: null, spine2: null, neck: null, head: null };
        const actor: Actor = { kind, root, model, mixer, actions, current: "", materials, swing: -1, cut: 0, drives: [], trunk, reflex: newReflex(), state: "", blend: null };
        play(actor, "Idle");
        return actor;
      };
      const hero = make("hero");
      const arms = equip(THREE, hero, weaponScenes);
      // Warm-up: one of every figure built now, its shaders compiled in the background (solid and
      // fading) and its textures uploaded, so the first knight, brute or animal to come on screen
      // doesn't freeze a frame. They wait hidden and are handed out first.
      const spare = new Map<string, Actor[]>();
      const warm: [string, Actor][] = [...(["raider", "brute", "chief", "giant"] as const).map((k): [string, Actor] => [k, make(k)]), ...animalKinds.map((k): [string, Actor] => [k, makeAnimal(k)])];
      const fading = (on: boolean): void => {
        for (const [, actor] of [["hero", hero] as const, ...warm]) for (const m of actor.materials) m.transparent = on;
      };
      // A cage too: its timber and iron compile now, not when the first prisoner comes on screen.
      const firstCage = makeCage(THREE, scene);
      firstCage.visible = true;
      // Include the hidden blade and flame shader in warm-up, before fire can be unlocked.
      for (const arm of arms.values()) { arm.object.visible = true; if (arm.flame) arm.flame.visible = true; }
      await renderer.compileAsync(scene, camera);
      if (this.disposed) return;
      fading(true);
      await renderer.compileAsync(scene, camera);
      if (this.disposed) return;
      fading(false);
      scene.traverse((node) => {
        const map = ((node as Three.Mesh).material as Three.MeshStandardMaterial | undefined)?.map;
        if (map) renderer.initTexture(map);
      });
      // One hidden render uploads every mesh and skeleton to the GPU now rather than mid-fight.
      renderer.render(scene, camera);
      renderer.clear();
      for (const arm of arms.values()) { arm.object.visible = false; if (arm.flame) arm.flame.visible = false; }
      firstCage.visible = false;
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
        make: (kind) => {
          const actor = spare.get(kind)?.pop() ?? make(kind);
          actor.root.visible = true;
          return actor;
        },
        makeAnimal: (kind) => spare.get(kind)?.pop() ?? makeAnimal(kind),
        headlight,
        torch,
        firelight,
        key,
        rim,
        fill,
        spare,
        cages: [firstCage],
        hero,
        arms,
        enemies: new Map(),
        mates: new Map(),
        makeMate: null,
        lamps,
        scratch,
      };
      // The toys come after the fighters (they're only needed once one is found).
      void this.loadToys(THREE, loader, clone, scene, makeAnimal);
    } catch {
      this.release?.();
      this.release = null;
      // No WebGL or the models didn't load: the 2D explorer stays.
    }
  }
}

/*
 * The hero's weapons, each made once: the slim longsword built in code, the axe and dagger from
 * KayKit. Each gets its place in her right hand (like any prop) and on her back (diagonally,
 * the grip over her right shoulder, the blade down to her left hip), measured in the bind pose.
 */
function equip(THREE: ThreeModule, actor: Actor, props: Map<string, { scene: Three.Object3D }>): Map<WeaponId, Carried> {
  const hand = actor.model.getObjectByName(bone("RightHand"));
  const back = actor.model.getObjectByName(bone("Spine2"));
  const arms = new Map<WeaponId, Carried>();
  if (!hand || !back) return arms;
  actor.root.updateMatrixWorld(true);
  for (const weapon of Object.values(ARSENAL)) {
    const steel: Three.MeshStandardMaterial[] = [];
    let object: Three.Object3D;
    let length: number;
    if (weapon.look.kind === "longsword") {
      object = longsword(THREE, steel);
      length = LONGSWORD.blade + LONGSWORD.grip;
    } else {
      const source = props.get(weapon.look.file);
      if (!source) continue;
      object = source.scene.clone();
      length = weapon.look.length;
      object.traverse((node) => {
        const mesh = node as Three.Mesh;
        if (!mesh.isMesh) return;
        const m = (mesh.material as Three.MeshStandardMaterial).clone();
        m.roughness = 0.4;
        m.metalness = 0.7;
        m.emissive.setRGB(1, 1, 1);
        m.emissiveIntensity = 0;
        mesh.material = m;
        mesh.frustumCulled = false;
        steel.push(m);
      });
    }
    // In the hand: placed like any held prop, then its local pose remembered.
    arm(THREE, hand, object, length, false, actor.materials, false);
    const handMatrix = object.matrix.clone();
    // On the back: the pose in the world (bind pose, body unturned, facing +z), carried into Spine2's frame.
    const spine = back.getWorldPosition(new THREE.Vector3());
    const handScale = hand.getWorldScale(new THREE.Vector3()).x;
    const size = object.scale.x * handScale;
    const world = new THREE.Matrix4().compose(
      spine.clone().add(new THREE.Vector3(0.17, 0.2, -0.16)),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.42, -0.9, -0.05).normalize()),
      new THREE.Vector3(size, size, size),
    );
    const backMatrix = back.matrixWorld.clone().invert().multiply(world);
    object.visible = false;
    // It fades with her (into the truck's seat and out).
    object.traverse((node) => {
      const mesh = node as Three.Mesh;
      if (mesh.isMesh) actor.materials.push(mesh.material as Three.MeshStandardMaterial);
    });
    const flame = weapon.id === "blade" ? flames(THREE, object) : null;
    arms.set(weapon.id, { object, hand: { parent: hand, matrix: handMatrix }, back: { parent: back, matrix: backMatrix }, steel, flame });
  }
  return arms;
}

/* The slim longsword: a tapered, pointed blade with a ridge, a straight crossguard, a wrapped grip and a round pommel; grip at the origin, blade up +y. */
function longsword(THREE: ThreeModule, steel: Three.MeshStandardMaterial[]): Three.Group {
  const sword = new THREE.Group();
  const L = LONGSWORD;
  const outline = new THREE.Shape();
  outline.moveTo(-L.width / 2, 0);
  outline.lineTo(L.width / 2, 0);
  outline.lineTo(L.width * 0.38, L.blade * 0.86);
  outline.lineTo(0, L.blade);
  outline.lineTo(-L.width * 0.38, L.blade * 0.86);
  outline.closePath();
  const bladeGeometry = new THREE.ExtrudeGeometry(outline, { depth: L.thick, bevelEnabled: true, bevelThickness: L.thick * 0.45, bevelSize: L.width * 0.18, bevelSegments: 1 });
  bladeGeometry.translate(0, 0, -L.thick / 2);
  const blade = new THREE.MeshStandardMaterial({ color: 0xd9dee4, metalness: 0.92, roughness: 0.22, emissive: 0xffffff, emissiveIntensity: 0 });
  steel.push(blade);
  const bladeMesh = new THREE.Mesh(bladeGeometry, blade);
  bladeMesh.position.y = L.grip * 0.5 + 0.02;
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.8, roughness: 0.35 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x2a1a12, metalness: 0, roughness: 0.85 });
  const guard = new THREE.Mesh(new THREE.BoxGeometry(L.guard, 0.022, 0.03), brass);
  guard.position.y = L.grip * 0.5 + 0.01;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, L.grip, 10), leather);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), brass);
  pommel.position.y = -L.grip * 0.5 - 0.015;
  for (const mesh of [bladeMesh, guard, grip, pommel]) {
    mesh.frustumCulled = false;
    sword.add(mesh);
  }
  return sword;
}

/*
 * Fire along the blade: two crossed ribbons (so it reads from any turn of the wrist) running a
 * flame shader. Two layers of value noise scroll from guard to tip, faster at the fine scale, so
 * the flame licks and tears like real fire; it's widest at the guard and thins to wisps at the
 * tip, white-yellow at its core, orange to deep red at its edges. Additive, so it glows where it
 * overlaps; shown only while the blade burns.
 */
function flames(THREE: ThreeModule, sword: Three.Object3D): Three.Object3D {
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: time },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float x = vUv.x * 2.0 - 1.0;
        float y = vUv.y;
        float n = noise(vec2(x * 2.6, y * 7.0 - uTime * 5.5)) * 0.62 + noise(vec2(x * 6.0 + 3.1, y * 16.0 - uTime * 10.0)) * 0.38;
        float width = (1.0 - y * 0.8) * (0.3 + 0.7 * n);
        float body = 1.0 - smoothstep(width * 0.35, width, abs(x));
        float ends = smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.7, 1.0, y + n * 0.25));
        float a = body * ends * (0.45 + 0.55 * n);
        vec3 col = mix(vec3(0.9, 0.16, 0.02), vec3(1.0, 0.82, 0.42), clamp(body * n * 1.4, 0.0, 1.0));
        gl_FragColor = vec4(col * a, a);
      }
    `,
  });
  const group = new THREE.Group();
  const length = LONGSWORD.blade * 1.08;
  for (const turn of [0, Math.PI / 2]) {
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.15, length), material);
    ribbon.position.y = LONGSWORD.grip * 0.5 + 0.03 + length / 2;
    ribbon.rotation.y = turn;
    ribbon.frustumCulled = false;
    ribbon.renderOrder = 2;
    group.add(ribbon);
  }
  group.userData.time = time;
  group.visible = false;
  sword.add(group);
  return group;
}

/* A prisoner's cage: a frame of rough timber and iron bars, front and back, about a toy's height and a half. */
function makeCage(THREE: ThreeModule, scene: Three.Scene): Three.Group {
  const cage = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.92, metalness: 0 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3b3f, roughness: 0.55, metalness: 0.75 });
  const W = 1.3;
  const H = 1.4;
  const D = 0.9;
  const beam = (w: number, h: number, d: number, x: number, y: number, z: number, m: Three.Material): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.frustumCulled = false;
    cage.add(mesh);
  };
  for (const y of [0.05, H]) beam(W + 0.1, 0.1, D + 0.1, 0, y, 0, wood);
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) beam(0.1, H, 0.1, x, H / 2, z, wood);
  for (let i = 1; i < 7; i++) {
    const x = -W / 2 + (W * i) / 7;
    for (const z of [-D / 2, D / 2]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, H - 0.1, 6), iron);
      bar.position.set(x, H / 2, z);
      bar.frustumCulled = false;
      cage.add(bar);
    }
  }
  cage.visible = false;
  scene.add(cage);
  return cage;
}

function newReflex(): Reflex {
  return { bend: 0, vb: 0, nod: 0, vn: 0, twist: 0, vt: 0, serial: 0 };
}

/* Turns a bone about a world axis by `angle` (rad), on top of its animated pose. */
function turnBone(b: Three.Bone | null, axis: Three.Vector3, angle: number, s: { q: Three.Quaternion; r: Three.Quaternion; p: Three.Quaternion }): void {
  if (!b?.parent || Math.abs(angle) < 1e-4) return;
  // In the parent's frame a world turn R is P⁻¹·R·P, applied before the bone's own rotation.
  b.parent.getWorldQuaternion(s.p);
  s.r.setFromAxisAngle(axis, angle);
  s.q.copy(s.p).invert().multiply(s.r).multiply(s.p);
  b.quaternion.premultiply(s.q);
  b.updateMatrixWorld(true);
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
 * slid a little along the fingers, and the whole thing scaled to its real length. Steel gets a
 * metal finish.
 */
function arm(THREE: ThreeModule, hand: Three.Object3D, prop: Three.Object3D, length: number, shield: boolean, materials: Three.MeshStandardMaterial[], finish = true): void {
  const handQ = hand.getWorldQuaternion(new THREE.Quaternion());
  const handScale = hand.getWorldScale(new THREE.Vector3()).x;
  const size = new THREE.Box3().setFromObject(prop).getSize(new THREE.Vector3());
  const along = new THREE.Vector3(0, 0, 1).applyQuaternion(handQ.clone().invert());
  prop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shield ? new THREE.Vector3(0, 1, 0) : along);
  prop.scale.setScalar(length / Math.max(size.x, size.y, size.z) / handScale);
  prop.position.set(0, 0.08 / handScale, 0);
  prop.updateMatrix();
  if (!finish) {
    hand.add(prop);
    prop.updateMatrix();
    return;
  }
  prop.traverse((node) => {
    const mesh = node as Three.Mesh;
    if (!mesh.isMesh) return;
    const m = (mesh.material as Three.MeshStandardMaterial).clone();
    m.roughness = 0.38;
    m.metalness = shield ? 0.4 : 0.75;
    m.emissive.setRGB(1, 0.92, 0.85);
    m.emissiveIntensity = 0;
    mesh.material = m;
    mesh.frustumCulled = false;
    materials.push(m);
  });
  hand.add(prop);
}

/* Cross-fades to a clip (unless it's already playing), at a speed; `restart` replays a one-shot from the top. */
function play(actor: Actor, name: string, speed = 1, restart = false): void {
  const next = actor.actions.get(name);
  if (!next) return;
  next.timeScale = Math.max(0.05, Math.min(4, speed));
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
