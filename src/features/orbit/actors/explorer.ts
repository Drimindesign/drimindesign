import { Animator } from "../engine/animator";
import { FIRE, MASTER, WEAPONS, type Weapon, type WeaponId } from "./arsenal";
import type { GameAudio } from "../engine/audio";
import type { ToScreen } from "../engine/camera";
import { CharacterController, type MoveInput } from "../engine/character-controller";
import { Ragdoll, type Joint } from "../engine/ragdoll";
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
/**
 * Hanging from a rope: the hands are this far above the feet (m); ← → pump the swing (rad/s²);
 * the air takes a little of it (1/s); letting go adds this lift (m/s); and the rope can't be
 * caught again for this long (s) after. Ropes are caught within `catch` (m) of the hands, never
 * shorter than `shortest` (m).
 */
const ROPE = { hang: 1.95, pump: 1.3, drag: 0.08, lift: 2.6, regrab: 0.45, catch: 0.85, shortest: 2.2, highest: 1.1 } as const;
/** Up a vine, hand over hand (m/s). */
const VINE_CLIMB = 1.5;
/** Caught low on a rope, she climbs it hand over hand (m/s) until it's this long (m) to her hands: a better swing. */
const ROPE_CLIMB = { speed: 0.9, length: 4.6 } as const;

/** The explorer hanging from a rope: its anchor (m), the length to the hands, the angle from straight down (rad) and its rate. */
interface Rope {
  x: number;
  y: number;
  length: number;
  angle: number;
  spin: number;
}

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
  /** Hits taken so far, and the last one (where, how hard, which way it travelled): the 3D body's reflex reads them. */
  hitSerial = 0;
  lastBlow: { joint: Joint; power: number; dir: number } = { joint: "chest", power: 0, dir: 1 };
  /** On a rope (or not), and how long until a rope can be caught again (s). */
  private rope: Rope | null = null;
  private regrab = 0;
  /** Climbing a vine up a tree: where it hangs, the top (the walkway's height), and where she steps off onto it. */
  private vine: { x: number; top: number; land: { x: number; y: number } } | null = null;
  /** The weapon in hand, and the ones she carries (switched in turn). */
  weapon: WeaponId = "blade";
  carried: WeaponId[] = ["blade", "dagger"];
  /** The Fire Sword: unlocked yet, seconds left burning, and seconds until it can be lit again. */
  fireUnlocked = false;
  burning = 0;
  fireRecharge = 0;
  /** The Master Stroke: its meter (0 … 1), seconds into the stroke (or -1), and the moment its shockwave lands this step. */
  master = 0;
  stroke = -1;
  shockwave = false;
  /** Riding on the giant's shoulders (he carries her: further, faster, higher). */
  riding = false;
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
    this.rope = null;
    this.vine = null;
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

  /** How long a whole swing takes (s): a light blade is quicker, a heavy one slower. */
  get swingDuration(): number {
    return SWING.end / this.arm.speed;
  }

  get arm(): Weapon {
    return WEAPONS[this.weapon];
  }

  /** How hard the current blow lands: the combo's blow, the weapon's weight, and the fire if it's lit. */
  get impact(): { power: number; breaksGuard: boolean } {
    return { power: BLOWS[this.combo].power * this.arm.power * (this.burning > 0 ? FIRE.power : 1), breaksGuard: BLOWS[this.combo].guardBreak || this.arm.breaksGuard };
  }

  /** The weapon is put away on her back: both hands are needed (a rope, a climb, the truck's door). */
  get sheathed(): boolean {
    return this.rope !== null || this.vine !== null || this.body.climb >= 0 || this.transition !== null;
  }

  /** On a rope: its angle from straight down (rad), and whether she's climbing it. */
  get ropeAngle(): number {
    return this.rope?.angle ?? 0;
  }

  get ropeClimbing(): boolean {
    return this.rope !== null && this.rope.length > ROPE_CLIMB.length;
  }

  /** The Fire Sword's charge: 1 ready to light, less while it recharges. */
  get fireCharge(): number {
    return this.fireUnlocked ? 1 - this.fireRecharge / FIRE.recharge : 0;
  }

  /** Q: the next weapon she carries (not mid-swing). */
  private nextWeapon(): void {
    if (this.swing >= 0 || this.carried.length < 2) return;
    const i = this.carried.indexOf(this.weapon);
    this.weapon = this.carried[(i + 1) % this.carried.length];
    this.audio.unsheathe(this.arm.pitch);
  }

  /** Lights the Fire Sword, if it's unlocked and charged. */
  private ignite(): void {
    if (!this.fireUnlocked || this.fireRecharge > 0 || this.burning > 0) return;
    this.burning = FIRE.burn;
    this.audio.ignite();
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
    const c = b.x + b.facing * this.arm.reach;
    return { x0: Math.min(a, c), x1: Math.max(a, c), y0: b.y - 0.2, y1: b.y + 2.1 };
  }

  get vulnerable(): boolean {
    return this.mercy === 0 && this.stroke < 0;
  }

  /** Fills the Master Stroke's meter. */
  charge(amount: number): void {
    this.master = Math.min(1, this.master + amount);
  }

  /** M: the Master Stroke, when the meter is full and she's on her feet. */
  private strike(): void {
    if (this.master < 1 || this.stroke >= 0 || this.ragdoll || this.rope || this.riding) return;
    this.master = 0;
    this.stroke = 0;
    this.swing = -1;
    this.body.vx = 0;
    this.audio.swing(true, 0.7, this.burning > 0);
  }

  /** Knocked by something coming from `fromX`. Returns false while still blinking from the last hit. */
  hurt(fromX: number, heavy = false): boolean {
    if (this.mercy > 0 || this.ragdoll || this.stroke >= 0) return false;
    this.charge(MASTER.perHurt);
    this.hearts = Math.max(0, this.hearts - 1);
    this.mercy = MERCY;
    const away = Math.sign(this.body.x - fromX) || -1;
    this.hitSerial++;
    this.lastBlow = { joint: heavy ? "chest" : Math.random() < 0.5 ? "head" : "chest", power: heavy ? 6 : 3.5, dir: away };
    this.rope = null;
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

  /** Climbing a vine. */
  get onVine(): boolean {
    return this.vine !== null;
  }

  /** In the air at a vine: her hands catch it and she climbs (returns true if caught). */
  grabVine(x: number, top: number, land: { x: number; y: number }): boolean {
    if (this.vine || this.rope || this.ragdoll || this.body.climb >= 0 || this.regrab > 0) return false;
    this.vine = { x, top, land };
    this.swing = -1;
    return true;
  }

  /*
   * Up the vine hand over hand to the top, where she hauls onto the walkway; ← or → with a jump
   * lets go, springing off sideways.
   */
  private climbVine(dt: number, input: MoveInput): void {
    const v = this.vine;
    if (!v) return;
    const b = this.body;
    b.px = b.x;
    b.py = b.y;
    if (input.jumpPressed && input.move !== 0) {
      this.vine = null;
      this.regrab = ROPE.regrab;
      b.vx = input.move * 3.5;
      b.vy = 4;
      b.grounded = false;
      b.refreshAirJump();
      return;
    }
    b.x = v.x - b.facing * 0.25;
    b.vx = 0;
    b.vy = 0;
    b.y = Math.min(v.top - ROPE.hang + 0.4, b.y + VINE_CLIMB * dt);
    if (b.y >= v.top - ROPE.hang + 0.39) {
      this.vine = null;
      this.place(v.land.x, v.land.y);
      b.facing = 1;
      this.audio.land(0.3);
    }
  }

  /** Where the hands hold the rope (its anchor), while hanging from one. */
  get ropeAnchor(): { x: number; y: number } | null {
    return this.rope ? { x: this.rope.x, y: this.rope.y } : null;
  }

  /** The hands on a rope: where they hold it (m). */
  get hands(): { x: number; y: number } {
    return { x: this.body.x, y: this.body.y + ROPE.hang };
  }

  /**
   * In the air near a rope hanging straight down from (x, y), `length` long: the hands catch it
   * where they reach it, and the body's speed carries into the swing. Returns true if caught.
   */
  catchRope(x: number, y: number, length: number): boolean {
    const b = this.body;
    if (this.rope || this.regrab > 0 || b.grounded || this.ragdoll || b.climb >= 0) return false;
    const hx = b.x;
    const hy = b.y + ROPE.hang;
    if (Math.abs(hx - x) > ROPE.catch || hy > y - ROPE.shortest || hy < y - length - ROPE.catch) return false;
    const reach = Math.max(ROPE.shortest, y - hy);
    const angle = Math.asin(Math.max(-0.9, Math.min(0.9, (hx - x) / reach)));
    // Momentum along the swing: the part of the body's velocity tangent to the arc.
    const spin = (b.vx * Math.cos(angle) + b.vy * Math.sin(angle)) / reach;
    this.rope = { x, y, length: reach, angle, spin };
    this.swing = -1;
    this.audio.footstep();
    return true;
  }

  /*
   * The swing: a pendulum (θ'' = −g/L·sin θ), pumped by leaning into it with ← →, with a little
   * air drag. Jump lets go: the hands' velocity along the arc, plus a push up.
   */
  private swingRope(dt: number, gravity: number, input: MoveInput): void {
    const r = this.rope;
    if (!r) return;
    const b = this.body;
    // Caught low: hand over hand up the rope first (a shorter rope swings livelier).
    if (r.length > ROPE_CLIMB.length) r.length = Math.max(ROPE_CLIMB.length, r.length - ROPE_CLIMB.speed * dt);
    // Leaning into the swing pumps it (only with it, never against: a body can't push off air).
    const pump = Math.sign(input.move) === Math.sign(r.spin) ? input.move * ROPE.pump : 0;
    r.spin += (-(gravity / r.length) * Math.sin(r.angle) + pump - r.spin * ROPE.drag) * dt;
    r.angle += r.spin * dt;
    // At the top of the arc the rope goes slack: the swing stops rising there.
    if (Math.abs(r.angle) > ROPE.highest) {
      r.angle = Math.sign(r.angle) * ROPE.highest;
      r.spin = Math.min(0, r.spin * Math.sign(r.angle)) * Math.sign(r.angle);
    }
    b.px = b.x;
    b.py = b.y;
    b.x = r.x + Math.sin(r.angle) * r.length;
    b.y = r.y - Math.cos(r.angle) * r.length - ROPE.hang;
    if (Math.abs(r.spin) > 0.15) b.facing = r.spin > 0 ? 1 : -1;
    const vx = Math.cos(r.angle) * r.spin * r.length;
    const vy = Math.sin(r.angle) * r.spin * r.length;
    // A jump lets go; so do feet dragging on the ground.
    if (input.jumpPressed || b.y < this.terrain.height(b.x)) {
      this.rope = null;
      this.regrab = ROPE.regrab;
      b.refreshAirJump();
      b.vx = vx;
      b.vy = vy + (input.jumpPressed ? ROPE.lift : 0);
      b.grounded = false;
      if (input.jumpPressed) {
        this.audio.jump();
        this.animator.kick(2.2);
      }
      return;
    }
    b.vx = vx;
    b.vy = vy;
  }

  /** Off any rope (a respawn). */
  letGo(): void {
    this.rope = null;
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

  step(dt: number, gravity: number, input: MoveInput & { attackPressed?: boolean; weaponPressed?: boolean; skillPressed?: boolean; masterPressed?: boolean }, effects = true): void {
    this.mercy = Math.max(0, this.mercy - dt);
    this.shockwave = false;
    // The Master Stroke: she spins in place (untouchable), the shockwave goes out partway through.
    if (input.masterPressed) this.strike();
    if (this.stroke >= 0) {
      const before = this.stroke;
      this.stroke += dt;
      if (before < MASTER.at && this.stroke >= MASTER.at) this.shockwave = true;
      if (this.stroke >= MASTER.time) this.stroke = -1;
      input = { ...input, move: 0, jumpPressed: false, attackPressed: false };
    }
    // The fire burns down, then the recharge begins.
    if (this.burning > 0) {
      this.burning = Math.max(0, this.burning - dt);
      if (this.burning === 0) this.fireRecharge = FIRE.recharge;
    } else {
      this.fireRecharge = Math.max(0, this.fireRecharge - dt);
    }
    if (input.weaponPressed) this.nextWeapon();
    if (input.skillPressed) this.ignite();
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.parried = Math.max(0, this.parried - dt);
    this.regrab = Math.max(0, this.regrab - dt);
    this.clock += dt;
    this.swingStarted = false;
    if (this.rope) {
      this.swingRope(dt, gravity, input);
      return;
    }
    if (this.vine) {
      this.climbVine(dt, input);
      return;
    }
    // Knocked down: no control while the ragdoll falls and settles, then the get-up plays.
    if (this.ragdoll) {
      if (this.getup > 0) {
        this.getup = Math.max(0, this.getup - dt);
        if (this.getup === 0) this.ragdoll = null;
      } else {
        this.ragdoll.step(dt, gravity, this.terrain);
        this.knockedFor += dt;
        if (this.ragdoll.impact > 3) {
          this.particles.dust(this.ragdoll.points.pelvis.x, this.body.y, 0, Math.round(6 + this.ragdoll.impact * 2), 0.9);
          this.audio.land(Math.min(1, this.ragdoll.impact / 9));
        }
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
      this.audio.swing(this.combo === BLOWS.length - 1, this.arm.pitch, this.burning > 0);
    }
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - dt);
    } else if (this.swing >= 0) {
      const before = this.swing;
      this.swing += dt * this.arm.speed;
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
      if (event === "climb") {
        this.audio.footstep();
        this.particles.dust(c.x, c.y, 0, 4, 0.4);
      } else if (event === "jump") {
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
