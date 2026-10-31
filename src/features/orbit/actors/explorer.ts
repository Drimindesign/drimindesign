import { Animator } from "../engine/animator";
import type { GameAudio } from "../engine/audio";
import type { ToScreen } from "../engine/camera";
import { CharacterController, type MoveInput } from "../engine/character-controller";
import { Ragdoll } from "../engine/ragdoll";
import type { Terrain } from "../engine/terrain";
import { EXPLORERS, ExplorerSprite, type ExplorerId } from "../pixel/explorer-sprite";
import { paste, type Painter } from "../pixel/painter";
import type { Particles } from "../pixel/particles";

const SHADOW = "rgba(12, 8, 14, 0.42)";
export const MAX_HEARTS = 3;

/*
 * The two-handed sword swing, as keyframes (time s, blade angle rad, stance 0 … 1). Angles are in
 * character space: 0 = straight ahead, positive = up, past π/2 = behind the head. From a low
 * guard (blade down), the hands draw it up and back over the head while the body sinks into a
 * stance; the cut whips it forward to level as the body lunges, arms fully extended; then it
 * swings back up overhead and settles down to the guard. Only the cut and the extension hit.
 */
const KEYS: readonly (readonly [number, number, number])[] = [
  [0, -1.0, 0],
  [0.17, 2.4, 0.35],
  [0.21, 2.45, 0.4],
  [0.31, 0.05, 0.65],
  [0.42, -0.05, 0.6],
  [0.6, 2.0, 0.3],
  [0.8, -1.0, 0],
];
/** The swing's timing (s), long enough for the motion-captured cuts to read as real weight. */
const SWING = { strike: 0.21, extended: 0.42, end: 0.8 } as const;
const SWORD = { guard: -1.0, length: 1.15, cooldown: 0.5 } as const;
/**
 * The combo: two cuts, a kick that breaks a raised guard, then a spinning blow that takes the
 * target off its feet. A swing started within COMBO_WINDOW (s) of the last one's end continues
 * it. Each blow's knockback (m/s), where it lands, whether it knocks down, and whether it breaks
 * a block.
 */
const COMBO_WINDOW = 0.5;
const BLOWS = [
  { power: 2.4, joint: "head", heavy: false, guardBreak: false },
  { power: 3, joint: "chest", heavy: false, guardBreak: false },
  { power: 3.6, joint: "pelvis", heavy: false, guardBreak: true },
  { power: 5, joint: "chest", heavy: true, guardBreak: false },
] as const;
/** Knocked down: lie at least this long (s), at most KNOCK_MAX, then get up over GETUP (s). */
const KNOCK = { min: 0.6, max: 2.2, getup: 1.5 } as const;
/** A blow bounced off a shield: the blade is thrown back and the arms jar this long (s). */
const PARRIED = 0.45;
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
  /** Knocked down: the body as a ragdoll, then getting up (s left), else null / 0. */
  ragdoll: Ragdoll | null = null;
  getup = 0;
  private knockedFor = 0;
  /** A swing began this step (enemies react to it: block, dodge). */
  swingStarted = false;
  /** Thrown back off a shield (s left). */
  parried = 0;
  /** Getting into or out of the car, and how far along (for the 3D model's sit and stand clips). */
  transition: { kind: "in" | "out"; progress: number } | null = null;
  private mercy = 0;
  /** Time into the current swing (s), or -1 when not swinging. */
  private swing = -1;
  /** Which blow of the combo (0 … 2) the current or last swing is, and when the last one ended (s). */
  private combo = 0;
  private sinceSwing = 99;
  /** A press during a swing, held to chain the next blow straight after it. */
  private queued = false;
  private cooldown = 0;
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

  /** 0 … 1 through the current swing, or -1 when not swinging (for the 3D model's animation). */
  /** The current blow of the combo: 0 chop, 1 slice, 2 stab; and what it does. */
  get comboIndex(): number {
    return this.combo;
  }

  get blow(): (typeof BLOWS)[number] {
    return BLOWS[this.combo];
  }

  get swingProgress(): number {
    return this.swing < 0 ? -1 : this.swing / SWING.end;
  }

  /** How long a whole swing takes (s). */
  get swingDuration(): number {
    return SWING.end;
  }

  /** Just hit: the flinch plays. */
  get hurting(): boolean {
    return this.mercy > MERCY - 0.4;
  }

  /** In the strike window of a swing: the blade can hit. */
  get striking(): boolean {
    return this.swing >= SWING.strike && this.swing <= SWING.extended;
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
  hurt(fromX: number, heavy = false): boolean {
    if (this.mercy > 0 || this.ragdoll) return false;
    this.hearts = Math.max(0, this.hearts - 1);
    this.mercy = MERCY;
    const away = Math.sign(this.body.x - fromX) || -1;
    this.audio.land(0.7);
    if (heavy) {
      this.knockDown(away);
      return true;
    }
    this.body.impulse(away * 2.2, 1.2);
    return true;
  }

  /** Limp, knocked down: the body is a ragdoll (driven by the 3D model) until it gets up. */
  get limp(): boolean {
    return this.ragdoll !== null && this.getup === 0;
  }

  /*
   * A heavy blow takes the hero off their feet: a ragdoll seeded standing, thrown away from the
   * blow with the feet swept toward it, so the body goes over backwards.
   */
  private knockDown(away: number): void {
    const b = this.body;
    const f = b.facing;
    const at = (dx: number, share: number): { x: number; y: number } => ({ x: b.x + dx * f, y: b.y + share * 1.75 });
    this.ragdoll = new Ragdoll(
      {
        head: at(0.02, 0.93), chest: at(0, 0.72), pelvis: at(0, 0.5),
        elbowL: at(0.06, 0.56), handL: at(0.14, 0.44), elbowR: at(-0.05, 0.56), handR: at(-0.02, 0.42),
        kneeL: at(0.06, 0.27), footL: at(0.08, 0.03), kneeR: at(-0.03, 0.27), footR: at(-0.07, 0.03),
      },
      b.vx,
      0.5,
    );
    this.ragdoll.impulse("chest", away * 6, 1.5);
    this.ragdoll.impulse("footL", -away * 2, 0);
    this.ragdoll.impulse("footR", -away * 2, 0);
    this.knockedFor = 0;
    this.swing = -1;
  }

  /** The blade bounced off a shield: thrown back, open for a moment. */
  parry(): void {
    this.parried = PARRIED;
    this.swing = -1;
    this.hitStop = HIT_STOP * 1.5;
    this.body.impulse(-this.body.facing * 2.5, 0.6);
  }

  heal(): void {
    this.hearts = MAX_HEARTS;
    this.mercy = 0;
  }

  /** A bounce off something stomped. */
  bounce(): void {
    this.body.impulse(this.body.vx, 6.2);
  }

  /** The keyframes around the current swing time, and how far between them (0 … 1). */
  private key(): { from: readonly [number, number, number]; to: readonly [number, number, number]; k: number } {
    const t = this.swing;
    for (let i = 1; i < KEYS.length; i++) {
      if (t <= KEYS[i][0]) {
        const from = KEYS[i - 1];
        const to = KEYS[i];
        return { from, to, k: (t - from[0]) / (to[0] - from[0]) };
      }
    }
    const last = KEYS[KEYS.length - 1];
    return { from: last, to: last, k: 1 };
  }

  /*
   * The blade's angle: between keyframes the wind-up and recovery ease in and out, while the
   * cut accelerates (k², the arms whip it). At rest the guard breathes, drifts and swings with
   * the walk, so the hands are never still.
   */
  private swordAngle(): number {
    const b = this.body;
    const walk = Math.min(1, Math.abs(b.vx) / 3) * Math.sin(this.animator.gaitPhase * Math.PI * 2);
    const sway = Math.sin(this.clock * 1.7) * SWAY.breathe + Math.sin(this.clock * 3.1 + 1.3) * SWAY.drift + walk * SWAY.gait;
    if (this.swing < 0) return SWORD.guard + sway;
    const { from, to, k } = this.key();
    const cut = from[0] === SWING.strike;
    const eased = cut ? k * k : smooth(k);
    // The sway fades out through the swing and back in as it ends.
    const settle = Math.max(0, 1 - this.swing / 0.1, (this.swing - SWING.end + 0.12) / 0.12);
    return from[1] + (to[1] - from[1]) * eased + sway * Math.min(1, settle);
  }

  /** How far the body sinks into the stance and lunge (0 … 1). */
  private stance(): number {
    if (this.swing < 0) return 0;
    const { from, to, k } = this.key();
    return from[2] + (to[2] - from[2]) * smooth(k);
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
    this.parried = Math.max(0, this.parried - dt);
    this.clock += dt;
    this.swingStarted = false;
    // Knocked down: no control while the ragdoll falls and settles, then the get-up plays.
    if (this.ragdoll) {
      if (this.getup > 0) {
        this.getup = Math.max(0, this.getup - dt);
        if (this.getup === 0) this.ragdoll = null;
      } else {
        this.ragdoll.step(dt, gravity, this.terrain);
        this.knockedFor += dt;
        const pelvis = this.ragdoll.points.pelvis;
        this.body.place(pelvis.x, this.terrain.height(pelvis.x));
        if ((this.ragdoll.resting && this.knockedFor > KNOCK.min) || this.knockedFor > KNOCK.max) this.getup = KNOCK.getup;
      }
      return;
    }
    if (this.parried > 0) input = { ...input, attackPressed: false, move: 0 };
    if (this.swing < 0) this.sinceSwing += dt;
    // Pressed during a swing (after its strike): the next blow of the combo follows straight on.
    if (input.attackPressed && this.swing >= SWING.strike) this.queued = true;
    if ((input.attackPressed || this.queued) && this.swing < 0 && (this.cooldown === 0 || this.queued)) {
      this.queued = false;
      this.swing = 0;
      this.swingStarted = true;
      this.combo = this.sinceSwing < COMBO_WINDOW ? (this.combo + 1) % BLOWS.length : 0;
      this.cooldown = SWORD.cooldown;
      this.struck.clear();
      this.audio.swing();
    }
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - dt);
    } else if (this.swing >= 0) {
      const before = this.swing;
      this.swing += dt;
      // The cut carries the body forward into the lunge.
      if (before < SWING.strike && this.swing >= SWING.strike && this.body.grounded) this.body.vx += this.body.facing * 2.2;
      if (this.swing > SWING.end) {
        this.swing = -1;
        this.sinceSwing = 0;
      }
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

    const pose = this.animator.update(Math.min(1 / 20, dt), c, this.terrain, gravity, Math.max(this.crouch, this.stance()));
    const angle = this.swordAngle();
    const b = this.animator.body;
    const arm = pose.arms[1];
    // Both hands on the grip. The arms reach from the shoulders toward it: bent at the guard,
    // raised overhead in the wind-up, straight out at the end of the cut.
    const extended = this.swing >= SWING.strike && this.swing <= SWING.extended + 0.06;
    const reach = extended ? 0.98 : this.swing >= 0 ? 0.85 : 0.72;
    const elbow = angle * 0.6 - 0.45;
    arm.mid = { x: arm.root.x + Math.cos(elbow) * b.upperArm * reach + 0.03, y: arm.root.y + Math.sin(elbow) * b.upperArm * reach };
    arm.end = { x: arm.mid.x + Math.cos(angle) * b.forearm * reach, y: arm.mid.y + Math.sin(angle) * b.forearm * reach };
    const back = pose.arms[0];
    back.mid = { x: (back.root.x + arm.end.x) / 2 - 0.04, y: (back.root.y + arm.end.y) / 2 - 0.06 };
    back.end = { x: arm.end.x - Math.cos(angle) * 0.09, y: arm.end.y - Math.sin(angle) * 0.09 };
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
      const from = KEYS[2][1];
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
