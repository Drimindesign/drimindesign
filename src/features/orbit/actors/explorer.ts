import { Animator } from "../engine/animator";
import type { GameAudio } from "../engine/audio";
import type { ToScreen } from "../engine/camera";
import { CharacterController, type MoveInput } from "../engine/character-controller";
import type { Terrain } from "../engine/terrain";
import { EXPLORERS, ExplorerSprite, type ExplorerId } from "../pixel/explorer-sprite";
import { paste, type Painter } from "../pixel/painter";
import type { Particles } from "../pixel/particles";

const SHADOW = "rgba(12, 8, 14, 0.42)";
export const MAX_HEARTS = 3;

/*
 * The sword swing, in seconds: wind up (draw the blade back), strike (only this window can
 * hit), recover. Angles are in character space (0 = straight ahead, positive = up), for the
 * sword in the front hand. Swings alternate: an overhead cut down, then a rising cut up.
 */
const SWING = { windup: 0.09, strike: 0.19, end: 0.38 } as const;
const SWORD = { guard: 0.55, high: 2.35, low: -1.05, length: 1.05, cooldown: 0.3 } as const;
/** Contact freezes the blade this long (s): the hit lands with weight. */
const HIT_STOP = 0.06;
/** Hands are never still: the guard breathes and sways (rad), and swings with the walk. */
const SWAY = { breathe: 0.09, drift: 0.06, gait: 0.28 } as const;
/** Invulnerable after a hit, blinking (s). */
const MERCY = 1.4;

const smooth = (t: number): number => t * t * (3 - 2 * t);

/*
 * The explorer as one actor: physics body, procedural rig and pixel sprite, the sword
 * (alternating cuts, strike window, hitbox, hit-stop), hands that are never quite still, hearts with knockback and a mercy blink, and the effects
 * that come from the body (footsteps on the gait, dust and sound on jumps and landings).
 */
export class Explorer {
  readonly body: CharacterController;
  private animator: Animator;
  private readonly sprite = new ExplorerSprite();
  private lastGait = 0;
  /** Drawn opacity: fades into the car seat and back out. */
  alpha = 1;
  crouch = 0;
  hearts = MAX_HEARTS;
  private mercy = 0;
  /** Time into the current swing (s), or -1 when not swinging. */
  private swing = -1;
  private cooldown = 0;
  /** Which cut: 0 overhead, 1 rising. */
  private cut = 0;
  private hitStop = 0;
  /** Seconds alive, for the sway of the hands. */
  private clock = 0;
  /** Each swing hits each target at most once. */
  readonly struck = new Set<object>();

  constructor(
    x: number,
    private readonly terrain: Terrain,
    private look: ExplorerId,
    private readonly audio: GameAudio,
    private readonly particles: Particles,
  ) {
    this.body = new CharacterController(x, terrain);
    this.animator = this.makeAnimator();
  }

  get id(): ExplorerId {
    return this.look;
  }

  private makeAnimator(): Animator {
    const spec = EXPLORERS[this.look];
    const animator = new Animator(spec.height, spec.hairLinks);
    animator.settle(this.body.x, this.body.y, this.body.facing);
    return animator;
  }

  switchLook(): void {
    this.look = this.look === "female" ? "male" : "female";
    this.animator = this.makeAnimator();
  }

  /** Puts the explorer somewhere new (a checkpoint, the car door) without the hair whipping. */
  place(x: number, y = this.terrain.height(x)): void {
    this.body.place(x, y);
    this.body.grounded = true;
    this.animator.settle(x, y, this.body.facing);
  }

  /** Body centre (m), for pickups and collisions. */
  get centre(): { x: number; y: number } {
    return { x: this.body.x, y: this.body.y + 0.9 };
  }

  // ---- combat ---------------------------------------------------------------

  /** In the strike window of a swing: the blade can hit. */
  get striking(): boolean {
    return this.swing >= SWING.windup && this.swing <= SWING.strike;
  }

  /** The strike's reach in front of the explorer (world m). */
  get hitbox(): { x0: number; x1: number; y0: number; y1: number } {
    const b = this.body;
    const a = b.x + b.facing * 0.15;
    const c = b.x + b.facing * 1.75;
    return { x0: Math.min(a, c), x1: Math.max(a, c), y0: b.y - 0.2, y1: b.y + 2.1 };
  }

  get vulnerable(): boolean {
    return this.mercy === 0;
  }

  /** Knocked by something coming from `fromX`. Returns false while still blinking from the last hit. */
  hurt(fromX: number): boolean {
    if (this.mercy > 0) return false;
    this.hearts = Math.max(0, this.hearts - 1);
    this.mercy = MERCY;
    const away = Math.sign(this.body.x - fromX) || -1;
    this.body.impulse(away * 4.8, 3.8);
    this.audio.land(0.7);
    return true;
  }

  heal(): void {
    this.hearts = MAX_HEARTS;
    this.mercy = 0;
  }

  /** A bounce off something stomped. */
  bounce(): void {
    this.body.impulse(this.body.vx, 6.2);
  }

  /** Where the cut starts and ends. */
  private get arc(): [number, number] {
    return this.cut === 0 ? [SWORD.high, SWORD.low] : [SWORD.low, SWORD.high - 0.4];
  }

  /*
   * The blade's angle: drawn back smoothly, then the cut accelerates through the arc (t²: the
   * arm whips), overshoots a touch past the guard on the recovery and settles. At rest the
   * guard breathes, drifts and swings with the walk.
   */
  private swordAngle(): number {
    const t = this.swing;
    const b = this.body;
    const walk = Math.min(1, Math.abs(b.vx) / 3) * Math.sin(this.animator.gaitPhase * Math.PI * 2);
    const guard =
      SWORD.guard + Math.sin(this.clock * 1.7) * SWAY.breathe + Math.sin(this.clock * 3.1 + 1.3) * SWAY.drift + walk * SWAY.gait;
    if (t < 0) return guard;
    const [from, to] = this.arc;
    if (t < SWING.windup) return guard + (from - guard) * smooth(t / SWING.windup);
    if (t < SWING.strike) {
      const k = (t - SWING.windup) / (SWING.strike - SWING.windup);
      return from + (to - from) * k * k;
    }
    const k = (t - SWING.strike) / (SWING.end - SWING.strike);
    const back = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
    return to + (guard - to) * back;
  }

  /** The blade bit into something: a moment's stop and a little push back through the arm. */
  recoil(): void {
    this.hitStop = HIT_STOP;
    this.body.impulse(-this.body.facing * 1.2, 0);
  }

  // ---- simulation -------------------------------------------------------------

  step(dt: number, gravity: number, input: MoveInput & { attackPressed?: boolean }, effects = true): void {
    this.mercy = Math.max(0, this.mercy - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.clock += dt;
    if (input.attackPressed && this.cooldown === 0 && this.swing < 0) {
      this.swing = 0;
      this.cut = 1 - this.cut;
      this.cooldown = SWORD.cooldown;
      this.struck.clear();
      this.audio.swing();
    }
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - dt);
    } else if (this.swing >= 0) {
      const before = this.swing;
      this.swing += dt;
      // The strike carries the body a step forward.
      if (before < SWING.windup && this.swing >= SWING.windup && this.body.grounded) this.body.vx += this.body.facing * 1.4;
      if (this.swing > SWING.end) this.swing = -1;
    }
    this.body.step(dt, gravity, input);
    if (effects) this.effects();
  }

  private effects(): void {
    const c = this.body;
    for (const event of c.drainEvents()) {
      if (event === "jump") {
        this.audio.jump();
        this.animator.kick(2.2);
        this.particles.dust(c.x, c.y, c.vx, 6, 0.6);
      } else if (event === "land") {
        const force = Math.min(1, c.landSpeed / 7);
        this.audio.land(force * 0.6);
        this.particles.dust(c.x, c.y, c.vx, Math.round(4 + force * 10), 0.5 + force);
      } else {
        this.audio.footstep();
      }
    }
    // A foot lands as the gait phase crosses 0 and 0.5.
    const gait = this.animator.gaitPhase;
    const crossed = gait < this.lastGait || (this.lastGait < 0.5 && gait >= 0.5);
    if (crossed && c.grounded && Math.abs(c.vx) > 0.3) {
      this.audio.footstep();
      if (Math.abs(c.vx) > 3) this.particles.dust(c.x, c.y, c.vx, 1, 0.3);
    }
    this.lastGait = gait;
  }

  // ---- drawing ------------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D, painter: Painter, toScreen: ToScreen, alpha: number, dt: number, gravity: number): void {
    if (this.alpha <= 0) return;
    const c = this.body;
    const x = c.px + (c.x - c.px) * alpha;
    const y = c.py + (c.y - c.py) * alpha;
    // Contact shadow, narrower the higher the feet are off the ground.
    const ground = this.terrain.height(x);
    const width = Math.max(0, 0.7 * (1 - (y - ground) / 3));
    if (width > 0.1) {
      const [sx, sy] = toScreen(x - width / 2, ground);
      painter.rect(sx, sy, width * 16, 1, SHADOW);
    }
    // Blinking while invulnerable after a hit.
    if (this.mercy > 0 && Math.floor(this.mercy * 12) % 2 === 0) return;

    const pose = this.animator.update(Math.min(1 / 20, dt), c, this.terrain, gravity, this.crouch);
    const angle = this.swordAngle();
    const b = this.animator.body;
    const arm = pose.arms[1];
    // The sword arm reaches from the shoulder along the blade: at guard it's held forward and low,
    // in a cut it extends with the swing.
    const reach = this.swing >= 0 ? 0.95 : 0.7;
    const elbow = angle * 0.55 - 0.5;
    arm.mid = { x: arm.root.x + Math.cos(elbow) * b.upperArm * reach + 0.03, y: arm.root.y + Math.sin(elbow) * b.upperArm * reach };
    arm.end = { x: arm.mid.x + Math.cos(angle) * b.forearm * 0.8, y: arm.mid.y + Math.sin(angle) * b.forearm * 0.8 };
    // The free hand drifts a little, out of step with the other.
    const free = pose.arms[0];
    free.end = { x: free.end.x + Math.sin(this.clock * 1.3 + 2) * 0.04, y: free.end.y + Math.sin(this.clock * 2.3) * 0.03 };
    this.sprite.draw(pose, b, EXPLORERS[this.look].look, c.facing);
    const [ex, ey] = toScreen(x, y);
    ctx.globalAlpha = this.alpha;
    paste(ctx, this.sprite.canvas, ex - this.sprite.footX, ey - this.sprite.footY);

    // The sword in the front hand: pommel and grip behind the hand, crossguard, then the blade.
    const hx = ex + c.facing * arm.end.x * 16;
    const hy = ey - arm.end.y * 16;
    const ux = c.facing * Math.cos(angle) * 16;
    const uy = -Math.sin(angle) * 16;
    const blade = SWORD.length;
    if (this.striking) {
      // The smear of the cut: a pale wedge over the arc swept so far.
      const [from] = this.arc;
      const a0 = c.facing > 0 ? -from : Math.PI + from;
      const a1 = c.facing > 0 ? -angle : Math.PI + angle;
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#dcebff";
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.arc(hx, hy, blade * 16, Math.min(a0, a1), Math.max(a0, a1));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    painter.line(hx - ux * 0.2, hy - uy * 0.2, hx, hy, "#3a2a1e");
    painter.disc(hx - ux * 0.22, hy - uy * 0.22, 0.8, "#c9a06a");
    painter.line(hx - uy * 0.13, hy + ux * 0.13, hx + uy * 0.13, hy - ux * 0.13, "#c9a06a");
    painter.line(hx + ux * 0.05, hy + uy * 0.05, hx + ux * blade, hy + uy * blade, "#e4ebf0");
    painter.line(hx + ux * 0.05 + 0.5, hy + uy * 0.05 + 0.5, hx + ux * (blade - 0.08) + 0.5, hy + uy * (blade - 0.08) + 0.5, "#8d99a3");
    ctx.globalAlpha = 1;
  }
}
