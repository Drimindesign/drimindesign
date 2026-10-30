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
 * The staff swing, in seconds: wind up (raise it behind the head), strike (bring it down and
 * forward; only this window can hit), recover. Angles are in character space (0 = straight
 * ahead, positive = up), for the staff held in the front hand.
 */
const SWING = { windup: 0.09, strike: 0.2, end: 0.36 } as const;
const STAFF = { rest: -1.38, raised: 1.95, struck: -0.38, length: 1.15, cooldown: 0.42 } as const;
/** Invulnerable after a hit, blinking (s). */
const MERCY = 1.4;

const smooth = (t: number): number => t * t * (3 - 2 * t);

/*
 * The explorer as one actor: physics body, procedural rig and pixel sprite, the walking staff
 * (swing, strike window and hitbox), hearts with knockback and a mercy blink, and the effects
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

  /** In the strike window of a swing: the staff can hit. */
  get striking(): boolean {
    return this.swing >= SWING.windup && this.swing <= SWING.strike;
  }

  /** The strike's reach in front of the explorer (world m). */
  get hitbox(): { x0: number; x1: number; y0: number; y1: number } {
    const b = this.body;
    const a = b.x + b.facing * 0.2;
    const c = b.x + b.facing * 1.55;
    return { x0: Math.min(a, c), x1: Math.max(a, c), y0: b.y - 0.1, y1: b.y + 1.6 };
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

  private staffAngle(): number {
    const t = this.swing;
    if (t < 0) return STAFF.rest;
    if (t < SWING.windup) return STAFF.rest + (STAFF.raised - STAFF.rest) * smooth(t / SWING.windup);
    if (t < SWING.strike) return STAFF.raised + (STAFF.struck - STAFF.raised) * smooth((t - SWING.windup) / (SWING.strike - SWING.windup));
    return STAFF.struck + (STAFF.rest - STAFF.struck) * smooth((t - SWING.strike) / (SWING.end - SWING.strike));
  }

  // ---- simulation -------------------------------------------------------------

  step(dt: number, gravity: number, input: MoveInput & { attackPressed?: boolean }, effects = true): void {
    this.mercy = Math.max(0, this.mercy - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (input.attackPressed && this.cooldown === 0 && this.swing < 0) {
      this.swing = 0;
      this.cooldown = STAFF.cooldown;
      this.struck.clear();
      this.audio.swing();
    }
    if (this.swing >= 0) {
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
    const angle = this.staffAngle();
    const b = this.animator.body;
    const arm = pose.arms[1];
    if (this.swing >= 0) {
      // The front arm follows the staff: reach from the shoulder along the swing.
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      arm.mid = { x: arm.root.x + dx * b.upperArm * 0.95 + 0.03, y: arm.root.y + dy * b.upperArm * 0.95 };
      arm.end = { x: arm.mid.x + dx * b.forearm, y: arm.mid.y + dy * b.forearm };
    }
    this.sprite.draw(pose, b, EXPLORERS[this.look].look, c.facing);
    const [ex, ey] = toScreen(x, y);
    ctx.globalAlpha = this.alpha;
    paste(ctx, this.sprite.canvas, ex - this.sprite.footX, ey - this.sprite.footY);

    // The staff, gripped in the front hand: a short butt behind the grip, the shaft ahead.
    const hx = ex + c.facing * arm.end.x * 16;
    const hy = ey - arm.end.y * 16;
    const ux = c.facing * Math.cos(angle) * 16;
    const uy = -Math.sin(angle) * 16;
    const butt = 0.22;
    const tip = STAFF.length - butt;
    painter.line(hx - ux * butt, hy - uy * butt, hx + ux * tip, hy + uy * tip, "#6b4528");
    painter.line(hx - ux * butt + 0.5, hy - uy * butt, hx + ux * tip + 0.5, hy + uy * tip, "#8c5e36");
    painter.disc(hx + ux * tip, hy + uy * tip, 1.1, "#c9a06a");
    ctx.globalAlpha = 1;
    if (this.striking) {
      // A faint arc where the staff is cutting through the air.
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = "#fff6dc";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const start = c.facing > 0 ? -STAFF.raised : Math.PI + STAFF.raised;
      const end = c.facing > 0 ? -STAFF.struck : Math.PI + STAFF.struck;
      ctx.arc(hx, hy, STAFF.length * 16 * 0.85, Math.min(start, end), Math.max(start, end));
      ctx.stroke();
      ctx.restore();
    }
  }
}
