import type { Boar } from "./boar";
import { formationOffset } from "./squad-formation";
import type { Terrain } from "../engine/terrain";
import type { WeaponId } from "./arsenal";

/** Who can be found locked up: the five KayKit toys, a village dog, and Gorr the giant. */
export type MateKind = "knight" | "barbarian" | "mage" | "ranger" | "rogue" | "dog" | "giant";

export interface MateSpec {
  name: string;
  /** Standing height (m): the toys stand about knee to waist high; Gorr towers over her. */
  height: number;
  /** Role skill determines endurance: recruits take ~3 ordinary hits, trained guards 5–6, Gorr 9. */
  health: number;
  /** How it fights: up close, with arrows, or with magic; its reach (m), the gap between blows (s), and how hard they land. */
  attack: "melee" | "arrow" | "magic" | "bite";
  range: number;
  every: number;
  power: number;
  /** Top speed following her (m/s). */
  speed: number;
  /** Four legs (or a giant's): leaps gaps and ledges instead of climbing. */
  leaper: boolean;
  /** What freeing it gives her. */
  unlocks?: { weapon?: WeaponId; fire?: boolean };
  /** Its words when the cage breaks, and a warning it calls when danger comes. */
  freed: string;
  warns: string;
}

/**
 * The team: each fights its own way, and some bring something. The Barbarian brings the axe, the
 * Mage the Fire Sword; the dog smells an ambush before it comes and carries a toy on its back;
 * Gorr the giant carries her.
 */
export const MATES: Record<MateKind, MateSpec> = {
  knight: { name: "Knight", height: 0.95, health: 10, attack: "melee", range: 1.2, every: 1.4, power: 1.6, speed: 4.6, leaper: false, freed: "A real hero! My shield is yours, Kachujin.", warns: "Shields up! Here they come!" },
  barbarian: { name: "Barbarian", height: 1, health: 12, attack: "melee", range: 1.3, every: 1.9, power: 2.6, speed: 4.4, leaper: false, unlocks: { weapon: "axe" }, freed: "Free! Take my spare axe. Hit them like you mean it.", warns: "More of them. Good. I was bored." },
  mage: { name: "Mage", height: 0.95, health: 6, attack: "magic", range: 7, every: 3.2, power: 2.2, speed: 4.4, leaper: false, unlocks: { fire: true }, freed: "Your blade... let me give it fire. Press V when you need it.", warns: "I feel them in the dark. Careful." },
  ranger: { name: "Ranger", height: 0.95, health: 7, attack: "arrow", range: 11, every: 1.7, power: 1.4, speed: 4.8, leaper: false, freed: "Thank you. I never miss. Well. Almost never.", warns: "Movement ahead. I have them in my sights." },
  rogue: { name: "Rogue", height: 0.9, health: 6, attack: "melee", range: 1.1, every: 0.9, power: 1, speed: 5, leaper: false, freed: "I'd have picked that lock myself. Eventually. Thanks.", warns: "Shh. Something's coming." },
  dog: { name: "Dog", height: 0.62, health: 5, attack: "bite", range: 1, every: 1.1, power: 1, speed: 5.2, leaper: true, freed: "Thank you! I'm coming with you!", warns: "Wolves. Many. That way." },
  giant: { name: "Gorr", height: 2.45, health: 18, attack: "melee", range: 1.8, every: 1.6, power: 3, speed: 4.6, leaper: true, freed: "Gorr is free. Gorr carries you now, small queen. Press E.", warns: "Gorr smells them. Many." },
};

/** A member of the team over the whole run: carried from level to level, alive or lost. */
export interface Member {
  kind: MateKind;
  /** Health left (of its spec's `health`). */
  hearts: number;
  alive: boolean;
  /** Its place in the order freed (0 the first): each one freed after another comes in stronger. */
  rank?: number;
}

/** Support damage stays below the hero’s and does not grow with recruitment. */
const SUPPORT_POWER = 0.42;
/**
 * Healing: a teammate left alone (no blow for `after` s) gets back a point of health every
 * `every` s, glowing green as it does.
 */
const REGEN = { after: 10, every: 3 } as const;

/*
 * The run's team and what it has unlocked. It outlives the levels: whoever was freed comes along
 * into the next one, and whoever fell stays lost.
 */
export class Party {
  readonly members: Member[] = [];
  readonly carried: WeaponId[] = ["blade", "dagger"];
  fire = false;
  /** Teammates Grey's men dragged off (not dead): each turns up in a cage on a later level. */
  readonly taken: Member[] = [];
  /** Spark Hearts in hand (each brings one taken teammate straight back), the Mage's revive recharging (s). */
  hearts = 0;
  reviveRecharge = 0;

  /** A freed prisoner joins (the same member its body carries, so its health is the team's). */
  join(member: Member): void {
    if (this.members.includes(member)) return;
    member.rank = this.members.length;
    this.members.push(member);
    const unlocks = MATES[member.kind].unlocks;
    if (unlocks?.weapon && !this.carried.includes(unlocks.weapon)) this.carried.push(unlocks.weapon);
    if (unlocks?.fire) this.fire = true;
  }

  has(kind: MateKind): boolean {
    return this.members.some((m) => m.kind === kind);
  }

  /** A teammate down too long is dragged off by Grey's men: alive, held somewhere ahead. */
  take(member: Member): void {
    member.alive = false;
    if (!this.taken.includes(member)) this.taken.push(member);
  }

  /** A taken teammate back with her, at full strength. */
  restore(member: Member): void {
    member.alive = true;
    member.hearts = MATES[member.kind].health;
    const i = this.taken.indexOf(member);
    if (i >= 0) this.taken.splice(i, 1);
  }

  /** A new member, at full health. */
  static member(kind: MateKind): Member {
    return { kind, hearts: MATES[kind].health, alive: true };
  }
}

/**
 * The escort: alternate places ahead of her and behind (m from her, growing by `gap` each pair),
 * so they surround her like a guard instead of trailing in a queue; and how far out they spot an
 * enemy and go for it (m: further for archers and mages).
 */
/** Companions engage locally and only relocate when well outside the visible play area (m). */
const SPOT = { melee: 7, ranged: 10 } as const;

/** A step up it hops (m); a leaper bounds up this much, and across a gap this wide (m). */
const HOP = { climb: 2.3, leap: 2.6, gap: 7, time: 0.5 } as const;
/** Hurt: it flinches this long (s), and can't be hurt again for this long (s). */
const FLINCH = 0.45;
const MERCY = 0.9;
/** Down at zero health: it waits this long (s) for her before it's lost; reviving takes this long (s) and brings back this share. */
export const WOUND = { wait: 10, revive: 1.2, back: 0.5 } as const;

export type MateState = "caged" | "freeing" | "cheering" | "follow" | "attack" | "hurt" | "wounded" | "dead" | "leaving";

/*
 * A mate on the ground: locked up, then freed (it stands, cheers, and joins), then following her
 * in a line, turning to fight whatever comes close (up close, with arrows, or with magic). Blows
 * cost it health; at none it goes down wounded and calls for her, and if she doesn't reach it in
 * time it's lost. It hops up ledges after her (four legs bound up them, and over gaps); what it
 * can't follow (a rope across a ravine) it finds its own way round and catches up out of sight.
 */
export class Mate {
  x: number;
  y: number;
  vx = 0;
  facing = 1;
  state: MateState;
  /** Time in the current state (s), until the next blow (s), and for how long it can't be hurt (s). */
  private timer = 0;
  private reload = 0;
  /** A swing belongs to the foe it started against, even if another crosses in front. */
  private attackTarget: Boar | null = null;
  private mercy = 0;
  /** A hop or bound under way: from where to where, and how far through (0 … 1). */
  private hop: { x0: number; y0: number; x1: number; y1: number; t: number } | null = null;
  /** Faded out (catching up out of sight) and back in. */
  alpha = 1;
  /** Hits taken (the 3D body's flinch reads it); time since the last (s), and the healing under way. */
  hitSerial = 0;
  private calm = 0;
  private mending = 0;
  /** A villager (one of her team's kind already with her): freed, it thanks her and goes home instead of joining. */
  visitor = false;
  /** Riding on another's back (a toy on the dog), or null. */
  rider: Mate | null = null;
  carrier: Mate | null = null;
  readonly spec: MateSpec;

  constructor(
    readonly member: Member,
    x: number,
    private readonly terrain: Terrain,
    caged: boolean,
  ) {
    this.spec = MATES[member.kind];
    this.x = x;
    this.y = terrain.height(x);
    this.state = caged ? "caged" : "follow";
  }

  get kind(): MateKind {
    return this.member.kind;
  }

  get alive(): boolean {
    return this.state !== "dead";
  }

  /** In the fight: can be hurt, and fights back. */
  get active(): boolean {
    return this.state === "follow" || this.state === "attack" || this.state === "hurt";
  }

  /** A blow would land now (not blinking from the last one, not carried). */
  get open(): boolean {
    return this.active && this.mercy === 0 && this.carrier === null;
  }

  /** How hard its blows land: its kind’s power scaled for a supporting role. */
  get power(): number {
    return this.spec.power * SUPPORT_POWER;
  }

  /** Healing right now (left alone a while, not at full health). */
  get healing(): boolean {
    return this.active && this.calm > REGEN.after && this.member.hearts < this.spec.health;
  }

  /** Health left, 0 … 1 (for the bar over its head). */
  get health(): number {
    return this.member.hearts / this.spec.health;
  }

  /** Down and waiting for her: seconds left before it's lost (0 when not down). */
  get bleeding(): number {
    return this.state === "wounded" ? Math.max(0, WOUND.wait - this.timer) : 0;
  }

  /** The cage broken: it gets up, cheers, and joins. */
  free(): void {
    this.state = "freeing";
    this.timer = 0;
  }

  /** She reached it in time: back on its feet with half its health. */
  revive(): void {
    if (this.state !== "wounded") return;
    this.member.hearts = Math.ceil(this.spec.health * WOUND.back);
    this.mercy = 2;
    this.set("follow");
  }

  /** A blow from `fromX` costing `damage`. Returns true if this one put it down. */
  hurt(fromX: number, damage = 1): boolean {
    if (!this.open) return false;
    this.member.hearts = Math.max(0, this.member.hearts - damage);
    this.hitSerial++;
    this.calm = 0;
    this.mercy = MERCY;
    this.vx = Math.sign(this.x - fromX) * 2.2;
    if (this.member.hearts === 0) {
      this.set("wounded");
      this.vx = 0;
      return true;
    }
    this.attackTarget = null;
    this.set("hurt");
    return false;
  }

  /** Stands at `x` (a rider's place on its carrier's back is set from outside). */
  place(x: number): void {
    this.x = x;
    this.y = this.terrain.height(x);
    this.hop = null;
  }

  /**
   * One step. `slot`: its place in the line behind her. `foe`: the nearest enemy, if any. Returns
   * the enemy struck this step (its blow lands), if any; and reports a death (left wounded too long) through `lost`.
   */
  update(dt: number, hero: { x: number; facing: number; viewHalf?: number }, slot: number, foe: Boar | null, lost?: () => void): Boar | null {
    this.timer += dt;
    this.reload = Math.max(0, this.reload - dt);
    this.mercy = Math.max(0, this.mercy - dt);
    // Left alone a while, it heals: a point of health at a time.
    this.calm += dt;
    if (this.healing) {
      this.mending += dt;
      if (this.mending >= REGEN.every) {
        this.mending = 0;
        this.member.hearts = Math.min(this.spec.health, this.member.hearts + 1);
      }
    } else {
      this.mending = 0;
    }
    this.alpha = Math.min(1, this.alpha + dt * 2);
    if (this.carrier) return null;
    if (this.hop) {
      // A hop up a ledge or a bound over a gap: an arc between the two footings.
      this.hop.t = Math.min(1, this.hop.t + dt / HOP.time);
      const k = this.hop.t;
      this.x = this.hop.x0 + (this.hop.x1 - this.hop.x0) * k;
      this.y = this.hop.y0 + (this.hop.y1 - this.hop.y0) * k + Math.sin(k * Math.PI) * 0.9;
      if (k >= 1) this.hop = null;
      return null;
    }
    const ground = this.terrain.height(this.x);
    switch (this.state) {
      case "caged":
        this.vx = 0;
        this.y = ground;
        return null;
      case "dead":
        // Dragged off: gone from sight in a couple of seconds.
        this.vx = 0;
        this.y = ground;
        this.alpha = Math.max(0, 1 - this.timer / 2);
        return null;
      case "wounded":
        this.vx = 0;
        this.y = ground;
        if (this.timer > WOUND.wait) {
          this.member.alive = false;
          this.set("dead");
          lost?.();
        }
        return null;
      case "freeing":
        if (this.timer > 1.15) this.set("cheering");
        return null;
      case "cheering":
        if (this.timer > 1.5) this.set(this.visitor ? "leaving" : "follow");
        return null;
      case "leaving":
        // Off home, away from her, fading into the dark.
        this.facing = Math.sign(this.x - hero.x) || -1;
        this.vx = this.facing * this.spec.speed * 0.8;
        this.move(dt);
        this.alpha = Math.max(0, 1 - this.timer / 2.2);
        return null;
      case "hurt":
        this.vx *= Math.exp(-6 * dt);
        this.move(dt);
        if (this.timer > FLINCH) this.set("follow");
        return null;
      case "attack":
        this.vx = 0;
        this.move(dt);
        // The blow lands partway through the swing (an arrow loosed, a spell cast).
        if (this.timer >= 0.35 && this.timer - dt < 0.35) {
          const target = this.attackTarget;
          if (target?.active && Math.abs(target.x - this.x) <= this.spec.range + 0.3 && Math.abs(target.y - this.y) < 1.6) return target;
        }
        if (this.timer > 0.75) { this.attackTarget = null; this.set("follow"); }
        return null;
      case "follow": {
        const spec = this.spec;
        // Danger in reach: turn and fight it (closing in if it fights up close).
        // An enemy in sight: a soldier goes for it (out ahead of her if need be), then falls back in.
        const spot = spec.attack === "arrow" || spec.attack === "magic" ? SPOT.ranged : SPOT.melee;
        const target = hero.x + formationOffset(slot, this.kind) * hero.facing;
        if (foe && Math.abs(foe.x - this.x) < spot) {
          const d = foe.x - this.x;
          this.facing = Math.sign(d) || this.facing;
          if (Math.abs(d) <= spec.range && this.reload === 0) {
            this.attackTarget = foe;
            this.reload = spec.every;
            this.set("attack");
            return null;
          }
          const want = Math.abs(d) > spec.range * 0.8 && (spec.attack === "melee" || spec.attack === "bite") ? Math.sign(d) * spec.speed : 0;
          this.vx = approach(this.vx, want, 14 * dt);
          this.move(dt);
          return null;
        }
        // Keep the assigned front, rear or close-guard slot while the hero advances.
        const gap = target - this.x;
        const want = Math.abs(gap) < 0.25 ? 0 : Math.sign(gap) * Math.min(spec.speed, Math.abs(gap) * 2.4);
        this.vx = approach(this.vx, want, 12 * dt);
        if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx);
        else this.facing = hero.facing;
        this.move(dt);
        return null;
      }
    }
  }

  /* Walks along the ground; hops up a ledge (bounds, on four legs, up higher and over gaps); otherwise stops at what it can't take. */
  private move(dt: number): void {
    const next = this.x + this.vx * dt;
    const here = this.terrain.height(this.x);
    const there = this.terrain.height(next);
    const dir = Math.sign(this.vx);
    if (there - here > 0.4 || there < here - 3) {
      // A wall or a drop just ahead: find the footing beyond it.
      let land = -1;
      const reach = this.spec.leaper ? HOP.gap : 1.2;
      for (let d = 0.4; d <= reach; d += 0.2) {
        const h = this.terrain.height(this.x + dir * d);
        if (h > here - 3 && h - here <= (this.spec.leaper ? HOP.leap : HOP.climb) && Math.abs(this.terrain.slope(this.x + dir * d)) < 1.5) {
          land = d;
          break;
        }
      }
      if (dir !== 0 && land > 0) {
        const x1 = this.x + dir * (land + 0.3);
        this.hop = { x0: this.x, y0: here, x1, y1: this.terrain.height(x1), t: 0 };
        return;
      }
      this.vx = 0;
      return;
    }
    this.x = next;
    this.y = there;
  }

  private set(state: MateState): void {
    this.state = state;
    this.timer = 0;
  }

  /** In the air (hopping or bounding). */
  get airborne(): boolean {
    return this.hop !== null;
  }

  /** The motion-captured clip its body plays now, and how fast. */
  get clip(): { name: string; speed: number; once: boolean } {
    const dog = this.kind === "dog";
    const giant = this.kind === "giant";
    const speed = Math.abs(this.vx);
    if (this.carrier) return { name: "Sit_Floor_Idle", speed: 1, once: false };
    if (this.hop) return dog ? { name: "Gallop_Jump", speed: 1.2, once: false } : giant ? { name: "foe_run", speed: 1, once: false } : { name: "Jump_Full_Short", speed: 1.3, once: true };
    if (giant) {
      switch (this.state) {
        case "caged":
          return { name: "stand_to_sit", speed: 1, once: true };
        case "freeing":
          return { name: "sit_to_stand", speed: 1, once: true };
        case "hurt":
          return { name: "foe_hit1", speed: 1, once: true };
        case "wounded":
        case "dead":
          return { name: "foe_death", speed: 1, once: true };
        case "attack":
          return { name: "foe_heavy", speed: 1.4, once: true };
        default:
          return speed > 2.6 ? { name: "foe_run", speed: speed / 5, once: false } : speed > 0.3 ? { name: "foe_walk", speed: speed / 1.6, once: false } : { name: "foe_idle", speed: 1, once: false };
      }
    }
    switch (this.state) {
      case "leaving":
        return dog ? { name: "Gallop", speed: 1, once: false } : { name: "Running_A", speed: 1, once: false };
      case "caged":
        return dog ? { name: "Idle", speed: 0.6, once: false } : { name: "Sit_Floor_Idle", speed: 1, once: false };
      case "freeing":
        return dog ? { name: "Walk", speed: 1, once: false } : { name: "Sit_Floor_StandUp", speed: 1, once: true };
      case "cheering":
        return dog ? { name: "Idle", speed: 1.4, once: false } : { name: "Cheering", speed: 1, once: true };
      case "hurt":
        return dog ? { name: "Idle_HitReact1", speed: 1, once: true } : { name: "Hit_A", speed: 1, once: true };
      case "wounded":
        return dog ? { name: "Death", speed: 0.6, once: true } : { name: "Lie_Idle", speed: 1, once: false };
      case "dead":
        return dog ? { name: "Death", speed: 1, once: true } : { name: "Death_A", speed: 1, once: true };
      case "attack": {
        const name = dog ? "Attack" : { knight: "Melee_1H_Attack_Chop", barbarian: "Melee_2H_Attack_Chop", mage: "Ranged_Magic_Shoot", ranger: "Ranged_Bow_Release", rogue: "Melee_1H_Attack_Chop", dog: "Attack", giant: "foe_heavy" }[this.kind];
        return { name, speed: 1.3, once: true };
      }
      default:
        if (dog) return speed > 3 ? { name: "Gallop", speed: speed / 6, once: false } : speed > 0.3 ? { name: "Walk", speed: speed / 1.6, once: false } : { name: "Idle", speed: 1, once: false };
        return speed > 2.6 ? { name: "Running_A", speed: speed / 4.5, once: false } : speed > 0.3 ? { name: "Walking_A", speed: speed / 1.6, once: false } : { name: "Idle_A", speed: 1, once: false };
    }
  }
}

function approach(value: number, target: number, delta: number): number {
  return value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);
}
