import type { Proportions, RigPose, Vec } from "../engine/animator";
import { PPM } from "../engine/config";
import { DAWN } from "./palette";
import { makeCanvas, outlineAndRim, Painter } from "./painter";

/*
 * The explorers as pixel art, rasterised from the animation rig every frame: whole pixels at
 * the world scale (~28 px tall, true proportions), then outlined and rim-lit by the scene's
 * low sun, so they sit in the same light as the forest. Outfits and colours follow the approved
 * character references (characters.json).
 */

export interface ExplorerLook {
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  jacket: string;
  jacketShade: string;
  shirt: string;
  pants: string;
  pantsShade: string;
  stripe: string;
  glove: string;
  shoe: string;
  sole: string;
  /** Cropped jacket over a bare midriff (female) or a full jacket with a hood (male). */
  cropped: boolean;
  hood: string | null;
  ponytail: boolean;
}

export type ExplorerId = "female" | "male";

export const EXPLORERS: Record<ExplorerId, { height: number; hairLinks: number; look: ExplorerLook }> = {
  female: {
    height: 1.72,
    hairLinks: 5,
    look: {
      skin: "#f0c09c",
      skinShade: "#c48a6e",
      hair: "#6a3c26",
      hairShade: "#43241a",
      jacket: "#d6343f",
      jacketShade: "#93222c",
      shirt: "#f4efe8",
      pants: "#2c2b33",
      pantsShade: "#1b1a21",
      stripe: "#d6343f",
      glove: "#18181c",
      shoe: "#f4f4f1",
      sole: "#26262b",
      cropped: true,
      hood: null,
      ponytail: true,
    },
  },
  male: {
    height: 1.82,
    hairLinks: 0,
    look: {
      skin: "#e4ad8a",
      skinShade: "#b47c62",
      hair: "#2c211c",
      hairShade: "#191311",
      jacket: "#26262c",
      jacketShade: "#16161a",
      shirt: "#f4efe8",
      pants: "#2a2930",
      pantsShade: "#19181e",
      stripe: "#c93641",
      glove: "#16161a",
      shoe: "#f4f4f1",
      sole: "#26262b",
      cropped: false,
      hood: "#c93641",
      ponytail: false,
    },
  },
};

const SIZE = 56;
const FOOT_X = SIZE / 2;
const FOOT_Y = SIZE - 6;

export class ExplorerSprite {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly painter: Painter;
  /** Sprite pixel where the feet touch the ground. */
  readonly footX = FOOT_X;
  readonly footY = FOOT_Y;

  constructor() {
    const [canvas, ctx] = makeCanvas(SIZE, SIZE);
    this.canvas = canvas;
    this.ctx = ctx;
    this.painter = new Painter(ctx);
  }

  draw(pose: RigPose, body: Proportions, look: ExplorerLook, facing: 1 | -1): void {
    const p = this.painter;
    this.ctx.clearRect(0, 0, SIZE, SIZE);
    const X = (v: Vec): number => FOOT_X + facing * v.x * PPM;
    const Y = (v: Vec): number => FOOT_Y - v.y * PPM;
    const limb = (a: Vec, b: Vec, ra: number, rb: number, color: string): void =>
      p.capsule(X(a), Y(a), X(b), Y(b), ra, rb, color);
    const mid = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

    const shoe = (ankle: Vec, angle: number, color: string): void => {
      const tx = facing * Math.cos(angle);
      const ty = -Math.sin(angle);
      const dx = -facing * ty;
      const dy = facing * tx;
      const ax = X(ankle);
      const ay = Y(ankle);
      const at = (along: number, down: number): [number, number] => [ax + tx * along + dx * down, ay + ty * along + dy * down];
      p.poly([at(-1.2, -0.6), at(2.6, 0.2), at(3.8, 1.2), at(3.8, 1.9), at(-1.4, 1.9)], color);
      p.poly([at(-1.4, 1.3), at(3.8, 1.3), at(3.8, 2.0), at(-1.4, 2.0)], look.sole);
    };

    // Hair behind everything.
    if (look.ponytail) {
      for (let i = pose.hair.length - 1; i > 0; i--) {
        limb(pose.hair[i - 1], pose.hair[i], 1.1 - i * 0.12, 0.95 - i * 0.12, i % 2 ? look.hair : look.hairShade);
      }
    }
    // Far arm and leg in shade.
    const [backArm, frontArm] = pose.arms;
    const [backLeg, frontLeg] = pose.legs;
    limb(backArm.root, backArm.mid, 1.1, 0.95, look.jacketShade);
    limb(backArm.mid, backArm.end, 0.95, 0.85, look.jacketShade);
    limb(backArm.end, backArm.end, 0.9, 0.9, look.glove);
    limb(backLeg.root, backLeg.mid, 1.5, 1.15, look.pantsShade);
    limb(backLeg.mid, backLeg.end, 1.15, 0.95, look.pantsShade);
    shoe(backLeg.end, backLeg.endAngle, "#c9c9c9");

    // Torso: pants top and belt, shirt, jacket on the back, hood.
    const waist = { x: pose.pelvis.x, y: pose.pelvis.y + 0.04 * body.height };
    limb(pose.pelvis, waist, 1.9, 1.85, look.pants);
    const ribs = mid(waist, pose.chest, 0.35);
    if (look.cropped) limb(waist, ribs, 1.7, 1.75, look.skin);
    limb(look.cropped ? ribs : waist, pose.chest, 1.85, 2.1, look.shirt);
    const back = { x: -0.03, y: 0 };
    const hem = look.cropped ? mid(waist, pose.chest, 0.45) : waist;
    limb({ x: hem.x + back.x, y: hem.y }, { x: pose.chest.x + back.x, y: pose.chest.y }, 1.7, 2.05, look.jacket);
    p.px(X(waist), Y(waist), "#141016");
    if (look.hood) limb({ x: pose.chest.x - 0.08, y: pose.chest.y }, { x: pose.neck.x - 0.07, y: pose.neck.y }, 1.3, 1.2, look.hood);
    limb(pose.chest, pose.neck, 0.8, 0.75, look.skin);

    // Head: face toward the front, hair over the crown and back.
    const r = body.headRadius * PPM;
    p.disc(X(pose.head) + facing * 0.3, Y(pose.head), r, look.skin);
    p.disc(X(pose.head) - facing * 0.55, Y(pose.head) - 0.7, r * 0.95, look.hair);
    p.px(X(pose.head) + facing * (r * 0.75), Y(pose.head) - 0.3, "#1a1012");

    // Near leg and arm.
    limb(frontLeg.root, frontLeg.mid, 1.55, 1.2, look.pants);
    limb(frontLeg.mid, frontLeg.end, 1.2, 1.0, look.pants);
    limb(mid(frontLeg.root, frontLeg.mid, 0.2), mid(frontLeg.mid, frontLeg.end, 0.8), 0.35, 0.35, look.stripe);
    shoe(frontLeg.end, frontLeg.endAngle, look.shoe);
    limb(frontArm.root, frontArm.mid, 1.15, 1.0, look.jacket);
    limb(frontArm.mid, frontArm.end, 1.0, 0.9, look.jacket);
    limb(frontArm.end, frontArm.end, 0.95, 0.95, look.glove);

    outlineAndRim(this.ctx, SIZE, SIZE, DAWN.outline, DAWN.rim, true);
  }
}
