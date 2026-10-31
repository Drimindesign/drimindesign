/*
 * The arena fight as a simulation, independent of drawing: fighters on a lane (metres along the
 * fight line), moving with weight (acceleration, friction, a body you can't walk through),
 * swinging with real timing (wind-up, a strike window, recovery), blocking, parrying, staggering,
 * falling and getting up. Enemies take turns: one engages, the other circles and waits. Waves
 * come in from the ends of the lane. The Master Stroke builds from clean fighting. Everything the
 * presentation needs (hits, blocks, deaths, slow motion) is reported as events.
 */

export type Side = "hero" | "foe";
export type FoeKind = "knight" | "brute";
export type State = "idle" | "walk" | "run" | "jump" | "attack" | "block" | "blockhit" | "stagger" | "down" | "getup" | "dead" | "enter" | "power" | "draw" | "sheathe";

/** An attack: its clip, playback speed, the share of the clip when the blade can land, reach (m), damage, and what it does. */
export interface Attack {
  clip: string;
  speed: number;
  strike: readonly [number, number];
  reach: number;
  damage: number;
  /** Knocks the target to the ground (unless blocked). */
  knockdown?: boolean;
  /** Breaks a block. */
  guardBreak?: boolean;
  /** Can't be blocked; hits everyone in reach. */
  sweep?: boolean;
  /** How far the attacker steps in during the swing (m). */
  lunge: number;
}

export const HERO_COMBO: readonly Attack[] = [
  { clip: "hero_slash1", speed: 1.25, strike: [0.3, 0.5], reach: 2.05, damage: 12, lunge: 0.35 },
  { clip: "hero_slash2", speed: 1.25, strike: [0.28, 0.48], reach: 2.05, damage: 14, lunge: 0.35 },
  { clip: "hero_kick", speed: 1.2, strike: [0.32, 0.5], reach: 1.6, damage: 6, guardBreak: true, lunge: 0.25 },
  { clip: "hero_spin", speed: 1.15, strike: [0.42, 0.66], reach: 2.25, damage: 22, knockdown: true, lunge: 0.5 },
];
export const MASTER_STROKE: Attack = { clip: "hero_master", speed: 1, strike: [0.46, 0.66], reach: 2.9, damage: 70, knockdown: true, sweep: true, lunge: 1.4 };
const FOE_ATTACKS: Record<FoeKind, readonly (Attack & { weight: number })[]> = {
  knight: [
    { clip: "foe_slash1", speed: 1.05, strike: [0.35, 0.55], reach: 1.95, damage: 9, lunge: 0.3, weight: 3 },
    { clip: "foe_slash2", speed: 1.05, strike: [0.33, 0.55], reach: 1.95, damage: 10, lunge: 0.3, weight: 3 },
    { clip: "foe_heavy", speed: 0.95, strike: [0.45, 0.62], reach: 2.1, damage: 16, knockdown: true, lunge: 0.45, weight: 1.5 },
    { clip: "foe_kick", speed: 1.05, strike: [0.35, 0.5], reach: 1.55, damage: 5, guardBreak: true, lunge: 0.2, weight: 1 },
  ],
  brute: [
    { clip: "foe_heavy", speed: 0.8, strike: [0.45, 0.64], reach: 2.45, damage: 17, knockdown: true, lunge: 0.6, weight: 1.5 },
    { clip: "foe_slash1", speed: 0.85, strike: [0.36, 0.56], reach: 2.3, damage: 12, lunge: 0.35, weight: 2.5 },
    { clip: "foe_kick", speed: 0.9, strike: [0.36, 0.52], reach: 1.8, damage: 10, guardBreak: true, knockdown: true, lunge: 0.25, weight: 1 },
  ],
};
/** Each foe: health, how often it blocks an incoming swing, walk and run speed (m/s), its pause between attacks (s). */
const FOES: Record<FoeKind, { health: number; guard: number; walk: number; run: number; rest: readonly [number, number] }> = {
  knight: { health: 90, guard: 0.38, walk: 1.2, run: 3.2, rest: [0.9, 1.9] },
  brute: { health: 180, guard: 0.12, walk: 1.0, run: 2.6, rest: [1.9, 3] },
};
/** The waves: who comes in, and from which end of the lane. */
export const WAVES: readonly (readonly { kind: FoeKind; from: -1 | 1 }[])[] = [
  [{ kind: "knight", from: 1 }, { kind: "knight", from: -1 }],
  [{ kind: "brute", from: 1 }],
];
/** Hero movement: walk, run (after holding a direction), acceleration, ground friction, jump. */
const MOVE = { walk: 1.7, run: 4.2, runAfter: 0.35, accel: 14, friction: 10, jump: 4.2, gravity: 12 } as const;
/** Bodies keep this far apart (m); foes stand off this far when it isn't their turn. */
const SPACE = { body: 1.15, waiting: 3.6, engage: 1.75 } as const;
/** Knights carry their shield up: a blow from the front (not a kick, not while they're reeling) is caught this often. */
const SHIELD_CATCH = 0.5;
/** A blocked or shield-caught blade bounces back: how long the attacker reels (s), how hard it's thrown back (m/s). */
const RECOIL = { time: 0.32, push: 1.3 } as const;
/** Drawing and sheathing the sword: clip speeds, and when in the clip the hand has the hilt (share). */
const SWORD_HAND = { draw: { speed: 1.3, grip: 0.42 }, sheathe: { speed: 1.1, release: 0.62 } } as const;
/** The hero walks in from the end of the lane to here (m from the lane's centre). */
const HERO_MARK = -1.2;
/** Block: damage let through, the parry window (s), stagger lengths (s), time on the ground (s), get-up length (s). */
const GUARD = { through: 0.15, parry: 0.2, stagger: 0.45, parried: 0.9, down: 1.3, getup: 1.6 } as const;
/** The Master Stroke meter (0 … 100): what fills it. */
const METER = { hit: 6, parry: 18, hurt: 4, kill: 12 } as const;
const COMBO_WINDOW = 0.55;
export const HERO_HEALTH = 150;

export interface Fighter {
  id: number;
  side: Side;
  kind: FoeKind | "hero";
  s: number;
  vs: number;
  y: number;
  vy: number;
  facing: 1 | -1;
  health: number;
  max: number;
  state: State;
  /** Time in the current state (s). */
  t: number;
  /** The attack in progress, and whether it has landed on each target. */
  attack: Attack | null;
  landed: Set<number>;
  combo: number;
  /** Seconds before this foe may attack again. */
  rest: number;
  /** How long the current state lasts (stagger, down…), when it has a fixed length. */
  hold: number;
  /** Sword in hand (the hero walks in with hers sheathed). */
  armed: boolean;
}

export type CombatEvent =
  | { type: "swing"; who: Fighter; heavy: boolean }
  | { type: "hit"; who: Fighter; by: Fighter; heavy: boolean; killed: boolean; last: boolean }
  | { type: "block"; who: Fighter; by: Fighter; parry: boolean; broken: boolean; shield: boolean }
  | { type: "down"; who: Fighter }
  | { type: "master"; who: Fighter }
  | { type: "wave"; index: number }
  | { type: "win" }
  | { type: "lose" };

export interface CombatInput {
  move: number;
  jump: boolean;
  attack: boolean;
  block: boolean;
  master: boolean;
}

/** Clip lengths (s) the simulation times its states against (from the loaded animations). */
export type ClipLengths = (clip: string) => number;

export class Combat {
  readonly fighters: Fighter[] = [];
  readonly hero: Fighter;
  meter = 0;
  wave = -1;
  over: "win" | "lose" | null = null;
  private nextId = 0;
  private runHeld = 0;
  private lastMove = 0;
  private queued = false;
  /** The opening shot plays before the first wave walks in (s). */
  private waveDelay = 4.2;
  private readonly events: CombatEvent[] = [];

  constructor(readonly half: number, private readonly length: ClipLengths) {
    // The hero walks in from the far end of the lane, sword sheathed.
    this.hero = this.spawn("hero", -half + 0.2, 1);
    this.hero.state = "enter";
    this.hero.armed = false;
  }

  private spawn(kind: FoeKind | "hero", s: number, facing: 1 | -1): Fighter {
    const max = kind === "hero" ? HERO_HEALTH : FOES[kind].health;
    const f: Fighter = { id: this.nextId++, side: kind === "hero" ? "hero" : "foe", kind, s, vs: 0, y: 0, vy: 0, facing, health: max, max, state: kind === "hero" ? "idle" : "enter", t: 0, attack: null, landed: new Set(), combo: 0, rest: 1.5, hold: 0, armed: true };
    this.fighters.push(f);
    return f;
  }

  get foes(): Fighter[] {
    return this.fighters.filter((f) => f.side === "foe" && f.state !== "dead");
  }

  /** The foe whose turn it is: the nearest one standing. */
  get engaged(): Fighter | null {
    let best: Fighter | null = null;
    for (const f of this.foes) if (!best || Math.abs(f.s - this.hero.s) < Math.abs(best.s - this.hero.s)) best = f;
    return best;
  }

  /** Advances the fight by dt (already slowed for slow motion); returns what happened. */
  step(dt: number, input: CombatInput): CombatEvent[] {
    this.events.length = 0;
    if (this.over) {
      // The fight's over, but the hero finishes sheathing her sword.
      this.hero.t += dt;
      this.updateArmed();
      return this.events;
    }
    if (this.foes.length === 0) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        if (this.wave + 1 >= WAVES.length) {
          this.over = "win";
          // Victory: the sword goes home in its scabbard.
          this.setState(this.hero, "sheathe", this.length("hero_sheathe") / SWORD_HAND.sheathe.speed);
          this.events.push({ type: "win" });
          return this.events;
        }
        this.wave++;
        for (const w of WAVES[this.wave]) this.spawn(w.kind, w.from * (this.half + 1.2), w.from > 0 ? -1 : 1);
        this.waveDelay = 2.2;
        this.events.push({ type: "wave", index: this.wave });
        // Steel out as the enemies come on.
        if (!this.hero.armed && !this.busy(this.hero)) this.setState(this.hero, "draw", this.length("hero_draw") / SWORD_HAND.draw.speed);
      }
    }
    this.stepHero(dt, input);
    const engaged = this.engaged;
    for (const f of this.foes) this.stepFoe(f, dt, f === engaged);
    for (const f of this.fighters) this.physics(f, dt);
    this.resolveStrikes();
    this.separate();
    this.updateArmed();
    return this.events;
  }

  private setState(f: Fighter, state: State, hold = 0): void {
    f.state = state;
    f.t = 0;
    f.hold = hold;
    if (state !== "attack") f.attack = null;
  }

  private startAttack(f: Fighter, attack: Attack): void {
    this.setState(f, "attack", this.length(attack.clip) / attack.speed);
    f.attack = attack;
    f.landed.clear();
    this.events.push({ type: "swing", who: f, heavy: attack.knockdown === true });
  }

  private busy(f: Fighter): boolean {
    return ["attack", "stagger", "down", "getup", "dead", "blockhit", "power", "draw", "sheathe"].includes(f.state);
  }

  /* The sword changes hands when the hand reaches the hilt: partway into the draw, late in the sheathe. */
  private updateArmed(): void {
    const h = this.hero;
    if (h.state === "draw" && h.t / h.hold > SWORD_HAND.draw.grip) h.armed = true;
    if (h.state === "sheathe" && h.t / h.hold > SWORD_HAND.sheathe.release) h.armed = false;
  }

  private stepHero(dt: number, input: CombatInput): void {
    const h = this.hero;
    h.t += dt;
    if (h.state === "dead") return;
    // Always squared up to the nearest foe, like a fighter keeping their guard toward the threat.
    const target = this.engaged;
    if (target && !this.busy(h)) h.facing = target.s >= h.s ? 1 : -1;
    if (h.state === "enter") {
      // Walking in to her mark.
      h.vs = 1.3;
      if (h.s >= HERO_MARK) this.setState(h, "idle");
      return;
    }
    if (this.endTimed(h)) return;
    if (!h.armed && (input.attack || input.master) && !this.busy(h)) {
      this.setState(h, "draw", this.length("hero_draw") / SWORD_HAND.draw.speed);
      return;
    }
    if (input.master && this.meter >= 100 && !["dead", "down", "getup", "power", "attack"].includes(h.state)) {
      this.meter = 0;
      this.startAttack(h, MASTER_STROKE);
      this.events.push({ type: "master", who: h });
      return;
    }
    if (h.state === "attack" && h.attack) {
      // Combo: a press late in a swing chains into the next blow.
      if (input.attack) this.queued = true;
      const progress = h.t / h.hold;
      if (this.queued && progress > COMBO_WINDOW && h.attack !== MASTER_STROKE && h.combo < HERO_COMBO.length - 1) {
        this.queued = false;
        h.combo++;
        this.startAttack(h, HERO_COMBO[h.combo]);
      }
      return;
    }
    if (this.busy(h)) return;
    if (input.attack && h.y === 0) {
      this.queued = false;
      h.combo = 0;
      this.startAttack(h, HERO_COMBO[0]);
      return;
    }
    if (input.block && h.y === 0) {
      if (h.state !== "block") this.setState(h, "block");
      h.vs *= 0.8;
      return;
    }
    if (input.jump && h.y === 0) {
      h.vy = MOVE.jump;
      this.setState(h, "jump");
    }
    // Walking builds into a run when the direction is held.
    if (input.move !== 0) {
      this.runHeld = Math.sign(input.move) === this.lastMove ? this.runHeld + dt : 0;
      this.lastMove = Math.sign(input.move);
      const speed = this.runHeld > MOVE.runAfter ? MOVE.run : MOVE.walk;
      h.vs += Math.sign(input.move * speed - h.vs) * Math.min(Math.abs(input.move * speed - h.vs), MOVE.accel * dt);
      if (h.y === 0 && h.vy === 0) {
        const moving: State = this.runHeld > MOVE.runAfter ? "run" : "walk";
        if (h.state !== moving) this.setState(h, moving);
      }
    } else {
      this.runHeld = 0;
      this.lastMove = 0;
      if (h.y === 0 && h.vy === 0 && h.state !== "idle") this.setState(h, "idle");
    }
  }

  /* States with a fixed length end here; returns true while the fighter can't act (stunned, down, getting up). */
  private endTimed(f: Fighter): boolean {
    if (!["attack", "stagger", "down", "getup", "blockhit", "power", "draw", "sheathe"].includes(f.state)) return false;
    if (f.t < f.hold) return f.state !== "attack";
    if (f.state === "sheathe") return true;
    if (f.state === "down") {
      this.setState(f, f.health <= 0 ? "dead" : "getup", f.health <= 0 ? 0 : GUARD.getup);
      return true;
    }
    if (f.state === "attack" && f.side === "hero") f.combo = 0;
    this.setState(f, "idle");
    return false;
  }

  private stepFoe(f: Fighter, dt: number, engaged: boolean): void {
    f.t += dt;
    f.rest -= dt;
    const h = this.hero;
    const spec = FOES[f.kind as FoeKind];
    if (f.state === "enter") {
      // Walking in from the end of the lane.
      f.vs = f.facing * spec.walk * 1.4;
      if (Math.abs(f.s) < this.half - 0.3) this.setState(f, "idle");
      return;
    }
    if (!this.busy(f)) f.facing = h.s >= f.s ? 1 : -1;
    if (this.endTimed(f)) return;
    if (this.busy(f) || h.state === "dead") {
      if (h.state === "dead" && !this.busy(f)) f.vs = 0;
      return;
    }
    const gap = Math.abs(h.s - f.s);
    // Raising the guard against a swing it sees coming.
    if (h.state === "attack" && h.t < 0.12 && gap < 2.4 && f.state !== "block" && h.attack !== MASTER_STROKE && Math.random() < spec.guard) {
      this.setState(f, "block", 0.9);
      f.vs = 0;
      return;
    }
    if (f.state === "block") {
      if (f.t > 0.9) this.setState(f, "idle");
      return;
    }
    const want = engaged ? SPACE.engage : SPACE.waiting;
    const toward = Math.sign(h.s - f.s);
    if (gap > want + 0.25) {
      const speed = gap > want + 2.5 ? spec.run : spec.walk;
      f.vs = toward * speed;
      const moving: State = speed === spec.run ? "run" : "walk";
      if (f.state !== moving) this.setState(f, moving);
    } else if (gap < want - 0.4 && !engaged) {
      f.vs = -toward * spec.walk * 0.8;
      if (f.state !== "walk") this.setState(f, "walk");
    } else {
      f.vs = 0;
      if (f.state !== "idle") this.setState(f, "idle");
      if (engaged && f.rest <= 0 && h.state !== "down" && h.state !== "getup") {
        const options = FOE_ATTACKS[f.kind as FoeKind];
        let r = Math.random() * options.reduce((sum, o) => sum + o.weight, 0);
        const pick = options.find((o) => (r -= o.weight) <= 0) ?? options[0];
        this.startAttack(f, pick);
        f.rest = spec.rest[0] + Math.random() * (spec.rest[1] - spec.rest[0]);
      }
    }
  }

  private physics(f: Fighter, dt: number): void {
    if (f.state === "attack" && f.attack) {
      // Stepping into the blow during the wind-up, but never into the other body: the step ends once it's in reach.
      const progress = f.t / f.hold;
      const target = this.nearestAhead(f);
      const closeEnough = target !== null && target < f.attack.reach * 0.78;
      if (progress < f.attack.strike[1] && !closeEnough) f.vs = (f.facing * f.attack.lunge) / Math.max(0.1, f.hold * f.attack.strike[1]);
      else f.vs *= Math.max(0, 1 - MOVE.friction * 2 * dt);
    } else if (f.side === "hero" && !["walk", "run", "jump", "enter"].includes(f.state)) {
      f.vs *= Math.max(0, 1 - MOVE.friction * dt);
    } else if (["stagger", "down", "getup", "blockhit", "dead"].includes(f.state)) {
      f.vs *= Math.max(0, 1 - MOVE.friction * 0.6 * dt);
    }
    f.s += f.vs * dt;
    if (f.y > 0 || f.vy > 0) {
      f.vy -= MOVE.gravity * dt;
      f.y = Math.max(0, f.y + f.vy * dt);
      if (f.y === 0) {
        f.vy = 0;
        if (f.state === "jump") this.setState(f, "idle");
      }
    }
    const limit = this.half + (f.state === "enter" ? 2 : 0);
    f.s = Math.max(-limit, Math.min(limit, f.s));
  }

  /* How far (m) the nearest opponent stands in front of this fighter, if any. */
  private nearestAhead(f: Fighter): number | null {
    let best: number | null = null;
    for (const o of this.fighters) {
      if (o.side === f.side || o.state === "dead") continue;
      const ahead = (o.s - f.s) * f.facing;
      if (ahead > 0 && (best === null || ahead < best)) best = ahead;
    }
    return best;
  }

  /* Blades landing: each swing can hit each target once, inside its strike window. */
  private resolveStrikes(): void {
    for (const a of this.fighters) {
      const attack = a.attack;
      if (a.state !== "attack" || !attack) continue;
      const progress = a.t / a.hold;
      if (progress < attack.strike[0] || progress > attack.strike[1]) continue;
      const targets = this.fighters.filter((b) => b.side !== a.side && !["dead", "down", "getup"].includes(b.state) && !a.landed.has(b.id));
      for (const b of targets) {
        const ahead = (b.s - a.s) * a.facing;
        if (ahead < -0.3 || ahead > attack.reach) continue;
        if (b.y > 0.45 && !attack.sweep) continue;
        a.landed.add(b.id);
        this.land(a, b, attack);
        // One target per swing, unless it sweeps; a blade that bounced off a guard stops here.
        if (!attack.sweep || a.state !== "attack") break;
      }
    }
  }

  private land(a: Fighter, b: Fighter, attack: Attack): void {
    const facingIt = b.facing === -a.facing;
    // A knight's shield, carried up, catches blows from the front even when he isn't blocking.
    const ready = !["attack", "stagger", "blockhit", "down", "getup"].includes(b.state);
    const caught = b.kind === "knight" && facingIt && ready && !attack.sweep && !attack.guardBreak && b.state !== "block" && Math.random() < SHIELD_CATCH;
    if (caught) {
      this.setState(b, "blockhit", 0.4);
      b.vs = a.facing * 0.8;
      this.setState(a, "stagger", RECOIL.time);
      a.vs = -a.facing * RECOIL.push;
      this.events.push({ type: "block", who: b, by: a, parry: false, broken: false, shield: true });
      return;
    }
    if (b.state === "block" && facingIt && !attack.sweep) {
      const parry = b.side === "hero" && b.t < GUARD.parry;
      const broken = attack.guardBreak === true;
      if (parry) {
        this.setState(a, "stagger", GUARD.parried);
        a.vs = -a.facing * 1.2;
        this.meter = Math.min(100, this.meter + METER.parry);
      } else if (broken) {
        this.setState(b, "stagger", GUARD.stagger * 1.4);
        b.vs = a.facing * 1.6;
      } else {
        b.health = Math.max(1, b.health - attack.damage * GUARD.through);
        this.setState(b, "blockhit", 0.45);
        b.vs = a.facing * 0.9;
        // The blade bounces off the guard: the attacker is thrown back a step.
        this.setState(a, "stagger", RECOIL.time);
        a.vs = -a.facing * RECOIL.push;
      }
      this.events.push({ type: "block", who: b, by: a, parry, broken, shield: b.kind === "knight" });
      return;
    }
    b.health = Math.max(0, b.health - attack.damage);
    const killed = b.health <= 0;
    if (a.side === "hero") this.meter = Math.min(100, this.meter + METER.hit + (killed ? METER.kill : 0));
    else this.meter = Math.min(100, this.meter + METER.hurt);
    // The brute has weight: only the Master Stroke (or a killing blow) floors him, light blows don't even stagger him.
    const poise = b.kind === "brute" && attack !== MASTER_STROKE;
    if (killed || (attack.knockdown && !poise)) {
      this.setState(b, "down", killed && b.side === "foe" ? 2.6 : GUARD.down);
      b.vs = a.facing * (attack.knockdown ? 3.2 : 1.8);
      this.events.push({ type: "down", who: b });
    } else if (!poise || attack.knockdown) {
      this.setState(b, "stagger", GUARD.stagger);
      b.vs = a.facing * (poise ? 0.6 : 1.4);
    }
    const last = killed && b.side === "foe" && this.foes.length === 0 && this.wave === WAVES.length - 1;
    this.events.push({ type: "hit", who: b, by: a, heavy: attack.knockdown === true || attack === MASTER_STROKE, killed, last });
    if (killed && b.side === "hero") {
      this.over = "lose";
      this.events.push({ type: "lose" });
    }
  }

  /* Bodies don't pass through each other: overlapping fighters are pushed apart. */
  private separate(): void {
    const live = this.fighters.filter((f) => f.state !== "dead" && f.state !== "down");
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        if (a.side === b.side) continue;
        const d = b.s - a.s;
        const overlap = SPACE.body - Math.abs(d);
        if (overlap > 0 && a.y < 0.6 && b.y < 0.6) {
          const push = (overlap / 2) * Math.sign(d || 1);
          a.s -= push;
          b.s += push;
        }
      }
    }
  }
}
