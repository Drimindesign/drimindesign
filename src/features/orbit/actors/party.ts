import type { Boar } from "./boar";
import { formationOffset } from "./squad-formation";
import type { Terrain } from "../engine/terrain";
import type { WeaponId } from "./arsenal";
import { CompanionNavigator, type CompanionCrossing } from "./companion-navigation";

/** Who can be found locked up: the five KayKit toys, a village dog, and Gorr the giant. */
export type MateKind = "knight" | "barbarian" | "mage" | "ranger" | "rogue" | "dog" | "giant";

export interface MateSpec {
  name: string;
  /** Standing height (m): people, and Gorr towering over them. */
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
  knight: { name: "Knight", height: 1.82, health: 10, attack: "melee", range: 1.2, every: 1.4, power: 1.6, speed: 4.6, leaper: false, freed: "A real hero! My shield is yours, Kachujin.", warns: "Shields up! Here they come!" },
  barbarian: { name: "Barbarian", height: 1.86, health: 12, attack: "melee", range: 1.3, every: 1.9, power: 2.6, speed: 4.4, leaper: false, unlocks: { weapon: "axe" }, freed: "Free! Take my spare axe. Hit them like you mean it.", warns: "More of them. Good. I was bored." },
  mage: { name: "Mage", height: 1.72, health: 6, attack: "magic", range: 7, every: 3.2, power: 2.2, speed: 4.4, leaper: false, unlocks: { fire: true }, freed: "Your blade... let me give it fire. Press V when you need it.", warns: "I feel them in the dark. Careful." },
  ranger: { name: "Ranger", height: 1.7, health: 7, attack: "arrow", range: 11, every: 1.7, power: 1.4, speed: 4.8, leaper: false, freed: "Thank you. I never miss. Well. Almost never.", warns: "Movement ahead. I have them in my sights." },
  rogue: { name: "Rogue", height: 1.68, health: 6, attack: "melee", range: 1.1, every: 0.9, power: 1, speed: 5, leaper: false, freed: "I'd have picked that lock myself. Eventually. Thanks.", warns: "Shh. Something's coming." },
  dog: { name: "Dog", height: 0.62, health: 5, attack: "bite", range: 1, every: 1.1, power: 1, speed: 5.2, leaper: true, freed: "Thank you! I'm coming with you!", warns: "Wolves. Many. That way." },
  giant: { name: "Gorr", height: 2.45, health: 22, attack: "melee", range: 2.2, every: 1.5, power: 4.5, speed: 4.6, leaper: true, freed: "Gorr is free. Gorr carries you now, small queen. Press E.", warns: "Gorr smells them. Many." },
};

/** Upgrades picked after each stage (one of three), kept for the rest of the run. */
export type PerkId = "volley" | "mending" | "quake";

/**
 * Each teammate's signature skill: its name (called out when used), and how long it recharges (s).
 * The stage decides when the moment is right, or fires them all together on Call team.
 */
export const SKILLS: Record<MateKind, { name: string; every: number }> = {
  knight: { name: "Shield wall!", every: 14 },
  barbarian: { name: "Shield bash!", every: 10 },
  mage: { name: "Fire nova!", every: 15 },
  ranger: { name: "Arrow rain!", every: 12 },
  rogue: { name: "Shadow step!", every: 9 },
  dog: { name: "Woof! Woof!", every: 20 },
  giant: { name: "Gorr throws!", every: 11 },
};
export const PERK_IDS: readonly PerkId[] = ["volley", "mending", "quake"];

/** A member of the team over the whole run: carried from level to level, alive or lost. */
export interface Member {
  kind: MateKind;
  /** Health left (of its spec's `health`). */
  hearts: number;
  alive: boolean;
  /** Its place in the order freed (0 the first): each one freed after another comes in stronger. */
  rank?: number;
  /** Stages survived with her: each makes it tougher and harder-hitting (see GROWTH). */
  level?: number;
}

/** Each stage a teammate survives: +15% health and +12% power, for the rest of the run. */
export const GROWTH = { health: 0.15, power: 0.12 } as const;

/** Full health for a member at its level. */
export function maxHealth(member: Member): number {
  return Math.round(MATES[member.kind].health * (1 + GROWTH.health * (member.level ?? 0)));
}

/** Base share of a teammate's kind power its blows carry. */
const SUPPORT_POWER = 0.75;
/**
 * Strength in numbers: each teammate beyond the first adds this much to every teammate's blows
 * and takes this much off the damage they suffer, up to the caps.
 */
const SQUAD = { power: 0.22, powerCap: 2.2, guard: 0.12, guardCap: 0.55 } as const;
/** Running to her aid: the sprint (× its speed), and how close an enemy to her counts as trouble (m). */
export const RALLY = { sprint: 1.35, trouble: 5 } as const;
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
  /** Upgrades chosen so far. */
  readonly perks = new Set<PerkId>();

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
    member.hearts = maxHealth(member);
    const i = this.taken.indexOf(member);
    if (i >= 0) this.taken.splice(i, 1);
  }

  /** A stage cleared: everyone still with her grows stronger and starts the next one healed. */
  levelUp(): void {
    for (const m of this.members) {
      if (!m.alive) continue;
      m.level = (m.level ?? 0) + 1;
      m.hearts = maxHealth(m);
    }
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
/** An enemy this close (m) is "on it": even holding a post, it fights back. */
const ON_IT = 2.6;
/** Hurt: it flinches this long (s), and can't be hurt again for this long (s). */
const FLINCH = 0.45;
const MERCY = 0.9;
/** Down at zero health: it waits this long (s) for her before it's lost; reviving takes this long (s) and brings back this share. */
export const WOUND = { wait: 10, revive: 1.2, back: 0.5 } as const;

export type MateState = "caged" | "freeing" | "cheering" | "follow" | "attack" | "hurt" | "wounded" | "dead" | "leaving";
export type MateOrder = { kind: "follow" | "hold" | "scout" | "regroup"; x?: number };

/*
 * A mate on the ground: locked up, then freed (it stands, cheers, and joins), then following her
 * in a line, turning to fight whatever comes close (up close, with arrows, or with magic). Blows
 * cost it health; at none it goes down wounded and calls for her, and if she doesn't reach it in
 * time it's lost. It climbs authored ledges, bounds where its body can, and uses the stage's
 * reserved rope crossings for ravines; distant members keep moving through the same world.
 */
export class Mate {
  readonly navigationId: object = {};
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
  hop: { x0: number; y0: number; x1: number; y1: number; t: number; climb?: boolean } | null = null;
  fall: { vx: number; vy: number } | null = null;
  traversal: CompanionCrossing | null = null;
  order: MateOrder = { kind: "follow" };
  /** Visibility for boarding, recruitment and casualties; distance never changes it. */
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
  /** Seconds until its signature skill is ready again (it starts ready). */
  skillIn = 0;
  /** Under the Knight's Shield Wall: blows don't land this long (s). */
  guarded = 0;
  /** Blows struck so far (each kind picks its next move from this, never repeating the last). */
  private swings = 0;
  /**
   * Set by the stage each step: this target is one it already started on (it chases it down, up
   * to 20 m, instead of walking away from a half-finished fight), and where the nearest threat it
   * has noticed is (it turns to face it, ready, before it comes).
   */
  committed = false;
  alertAt: number | null = null;
  /** Teammates fighting alongside right now (set by the stage each step): the bigger, the stronger. */
  squad = 1;
  readonly spec: MateSpec;

  constructor(
    readonly member: Member,
    x: number,
    private readonly terrain: Terrain,
    caged: boolean,
    private readonly navigator?: CompanionNavigator,
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
    const bonus = Math.min(SQUAD.powerCap, 1 + SQUAD.power * Math.max(0, this.squad - 1));
    return this.spec.power * SUPPORT_POWER * bonus * (1 + GROWTH.power * (this.member.level ?? 0));
  }

  /** Full health at its level. */
  get maxHealth(): number {
    return maxHealth(this.member);
  }

  /** Share of a blow it actually takes: the bigger the squad, the better they cover each other. */
  private get guard(): number {
    return 1 - Math.min(SQUAD.guardCap, SQUAD.guard * Math.max(0, this.squad - 1));
  }

  /** Healing right now (left alone a while, not at full health). */
  get healing(): boolean {
    return this.active && this.calm > REGEN.after && this.member.hearts < this.maxHealth;
  }

  /** Health left, 0 … 1 (for the bar over its head). */
  get health(): number {
    return this.member.hearts / this.maxHealth;
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
    this.member.hearts = Math.ceil(this.maxHealth * WOUND.back);
    this.mercy = 2;
    this.set("follow");
  }

  /** A blow from `fromX` costing `damage`. Returns true if this one put it down. */
  hurt(fromX: number, damage = 1): boolean {
    if (!this.open || this.guarded > 0) return false;
    this.member.hearts = Math.max(0, this.member.hearts - damage * this.guard);
    if (this.member.hearts < 0.05) this.member.hearts = 0;
    this.hitSerial++;
    this.calm = 0;
    this.mercy = MERCY;
    this.vx = Math.sign(this.x - fromX) * 2.2;
    if (this.member.hearts === 0) {
      this.navigator?.disable(this);
      this.set("wounded");
      this.vx = 0;
      return true;
    }
    this.attackTarget = null;
    this.set("hurt");
    return false;
  }

  /** Its signature skill, used now: it plays its strongest move, and the skill recharges. */
  useSkill(facing: number): void {
    this.skillIn = SKILLS[this.kind].every;
    this.facing = facing || this.facing;
    this.swings = this.kind === "barbarian" || this.kind === "giant" ? 0 : this.swings + 1;
    this.reload = Math.max(this.reload, 0.8);
    this.attackTarget = null;
    this.set("attack");
  }

  /** Stands at `x` (a rider's place on its carrier's back is set from outside). */
  place(x: number): void {
    this.navigator?.reset(this);
    this.x = x;
    this.y = this.terrain.height(x);
    this.hop = null;
  }

  /**
   * One step. `slot`: its place in the line behind her. `foe`: the nearest enemy, if any. Returns
   * the enemy struck this step (its blow lands), if any; and reports a death (left wounded too long) through `lost`.
   */
  update(dt: number, hero: { x: number; facing: number; viewHalf?: number; trouble?: boolean }, slot: number, foe: Boar | null, lost?: () => void, order: MateOrder = this.order): Boar | null {
    this.timer += dt;
    this.reload = Math.max(0, this.reload - dt);
    this.skillIn = Math.max(0, this.skillIn - dt);
    this.guarded = Math.max(0, this.guarded - dt);
    this.mercy = Math.max(0, this.mercy - dt);
    // Left alone a while, it heals: a point of health at a time.
    this.calm += dt;
    if (this.healing) {
      this.mending += dt;
      if (this.mending >= REGEN.every) {
        this.mending = 0;
        this.member.hearts = Math.min(this.maxHealth, this.member.hearts + 1);
      }
    } else {
      this.mending = 0;
    }
    this.alpha = Math.min(1, this.alpha + dt * 2);
    if (this.carrier) return null;
    if (this.hop && this.navigator) { this.navigator.move(this, dt, this.hop.x1); return null; }
    if (this.hop) {
      // A hop up a ledge or a bound over a gap: an arc between the two footings.
      this.hop.t = Math.min(1, this.hop.t + dt / HOP.time);
      const k = this.hop.t;
      this.x = this.hop.x0 + (this.hop.x1 - this.hop.x0) * k;
      this.y = this.hop.y0 + (this.hop.y1 - this.hop.y0) * k + Math.sin(k * Math.PI) * 0.9;
      if (k >= 1) this.hop = null;
      return null;
    }
    if (this.state === "wounded" || this.state === "dead") this.navigator?.rest(this, dt);
    const ground = this.terrain.height(this.x);
    switch (this.state) {
      case "caged":
        this.vx = 0;
        this.y = ground;
        return null;
      case "dead":
        // Dragged off: gone from sight in a couple of seconds.
        this.vx = 0;
        if (!this.fall && !this.navigator?.supportPhase(this)) this.y = ground;
        this.alpha = Math.max(0, 1 - this.timer / 2);
        return null;
      case "wounded":
        this.vx = 0;
        if (!this.fall && !this.navigator?.supportPhase(this)) this.y = ground;
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
        // She's in trouble: drop the formation and sprint to her, then into whoever is on her.
        const rally = hero.trouble === true && order.kind !== "hold" && order.kind !== "scout";
        const speed = spec.speed * (rally ? RALLY.sprint : 1);
        // Danger in reach: turn and fight it (closing in if it fights up close).
        // An enemy in sight: a soldier goes for it (out ahead of her if need be), then falls back in.
        const spot = spec.attack === "arrow" || spec.attack === "magic" ? SPOT.ranged : SPOT.melee;
        const target = order.kind === "hold" || order.kind === "scout"
          ? order.x ?? this.x
          : order.kind === "regroup" || rally
            ? hero.x - hero.facing * Math.min(1.8, 0.7 + slot * 0.12)
            : hero.x + formationOffset(slot, this.kind) * hero.facing;
        if (foe && (Math.abs(foe.x - this.x) < spot || rally || this.committed)) {
          // Holding or regrouping, it keeps its place, but still fights back at whatever is on it.
          if ((order.kind === "hold" || (order.kind === "regroup" && Math.abs(foe.x - hero.x) > 1.6)) && Math.abs(foe.x - this.x) > ON_IT) {
            const gap = target - this.x;
            const want = Math.abs(gap) < 0.25 ? 0 : Math.sign(gap) * Math.min(spec.speed, Math.abs(gap) * 2.4);
            this.vx = approach(this.vx, want, 12 * dt);
            if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx);
            this.move(dt, target);
            return null;
          }
          const d = foe.x - this.x;
          this.facing = Math.sign(d) || this.facing;
          if (Math.abs(d) <= spec.range && this.reload === 0) {
            this.attackTarget = foe;
            this.reload = spec.every;
            this.swings++;
            this.set("attack");
            return null;
          }
          // Holding a post, it keeps making for the post between blows (and fights from there).
          if (order.kind === "hold" || order.kind === "scout") {
            const gap = target - this.x;
            const back = Math.abs(gap) < 0.25 ? 0 : Math.sign(gap) * Math.min(spec.speed, Math.abs(gap) * 2.4);
            this.vx = approach(this.vx, back, 12 * dt);
            this.move(dt, target);
            return null;
          }
          const closing = spec.attack === "melee" || spec.attack === "bite" ? spec.range * 0.8 : spec.range * 0.9;
          const want = Math.abs(d) > closing ? Math.sign(d) * speed : 0;
          this.vx = approach(this.vx, want, 14 * dt);
          this.move(dt, want === 0 ? this.x : foe.x - Math.sign(d) * spec.range * 0.75);
          return null;
        }
        // Keep the assigned front, rear or close-guard slot while the hero advances.
        const gap = target - this.x;
        const want = Math.abs(gap) < 0.25 ? 0 : Math.sign(gap) * Math.min(speed, Math.abs(gap) * 2.4);
        this.vx = approach(this.vx, want, 12 * dt);
        if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx);
        // Standing: it watches the threat it has noticed, otherwise looks where she looks.
        else this.facing = this.alertAt !== null ? Math.sign(this.alertAt - this.x) || this.facing : hero.facing;
        this.move(dt, target);
        return null;
      }
    }
  }

  /* Walks along the ground; hops up a ledge (bounds, on four legs, up higher and over gaps); otherwise stops at what it can't take. */
  private move(dt: number, targetX = this.x + this.vx * dt): void {
    if (this.navigator) {
      this.navigator.move(this, dt, targetX);
      return;
    }
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
    const supportPhase = this.navigator?.supportPhase(this);
    return this.hop !== null || this.fall !== null || this.traversal !== null || supportPhase === "jump" || supportPhase === "climb";
  }

  /** Traversal data for stage rendering and diagnostics; the actor stays in world coordinates. */
  get navigationPose(): { kind: "ground" | "hop" | "rope" | "walk" | "climb" | "jump" | "ride"; rope: { x: number; y: number; length: number } | null } {
    const crossing = this.traversal;
    if (!crossing) {
      const supportPhase = this.navigator?.supportPhase(this);
      return { kind: supportPhase ?? (this.hop?.climb ? "climb" : this.hop || this.fall ? "hop" : "ground"), rope: null };
    }
    if (crossing.kind === "rope" && crossing.ropePhase !== "swing") return { kind: "hop", rope: null };
    return {
      kind: crossing.kind,
      rope: crossing.kind === "rope" && crossing.ropeX !== undefined
        ? { x: crossing.ropeX, y: crossing.ropeY ?? this.y + 2, length: crossing.ropeLength ?? 6.4 }
        : null,
    };
  }

  /** The motion-captured clip its body plays now, and how fast. */
  get clip(): { name: string; speed: number; once: boolean } {
    const speed = Math.abs(this.vx);
    if (this.kind === "dog") return this.dogClip(speed);
    if (this.carrier) return { name: "stand_to_sit", speed: 1, once: true };
    if (this.hop) return { name: "foe_run", speed: 1, once: false };
    switch (this.state) {
      case "caged":
        return { name: "stand_to_sit", speed: 1, once: true };
      case "freeing":
        return { name: "sit_to_stand", speed: 1, once: true };
      case "hurt":
        return { name: this.hitSerial % 2 ? "foe_hit1" : "foe_hit2", speed: 1, once: true };
      case "wounded":
      case "dead":
        return { name: "foe_death", speed: 1, once: true };
      case "leaving":
        return { name: "foe_run", speed: 1, once: false };
      case "attack":
        return this.attackClip();
      default:
        return speed > 2.6
          ? { name: "foe_run", speed: speed / (this.kind === "giant" ? 5 : 5.5), once: false }
          : speed > 0.3
            ? { name: "foe_walk", speed: speed / 1.6, once: false }
            : { name: "foe_idle", speed: 1, once: false };
    }
  }

  /*
   * Each fights in its own way, and never the same blow twice running: the Knight alternates his
   * cuts, the Barbarian and Gorr swing heavy, the Rogue mixes quick cuts with a kick, the Ranger
   * draws and looses, the Mage casts.
   */
  private attackClip(): { name: string; speed: number; once: boolean } {
    const n = this.swings;
    switch (this.kind) {
      case "ranger":
        return { name: "mate_bow", speed: 1.4, once: true };
      case "mage":
        return { name: "mate_cast", speed: 1.3, once: true };
      case "rogue":
        return { name: ["hero_slash1", "hero_slash2", "hero_kick"][n % 3], speed: 1.3, once: true };
      case "barbarian":
      case "giant":
        return { name: n % 3 === 2 ? "foe_slash2" : "foe_heavy", speed: 1.2, once: true };
      default:
        return { name: n % 2 ? "foe_slash2" : "foe_slash1", speed: 1.2, once: true };
    }
  }

  private dogClip(speed: number): { name: string; speed: number; once: boolean } {
    if (this.hop) return { name: "Gallop_Jump", speed: 1.2, once: false };
    switch (this.state) {
      case "leaving":
        return { name: "Gallop", speed: 1, once: false };
      case "caged":
      case "cheering":
        return { name: "Idle", speed: 1, once: false };
      case "freeing":
        return { name: "Walk", speed: 1, once: false };
      case "hurt":
        return { name: "Idle_HitReact1", speed: 1, once: true };
      case "wounded":
      case "dead":
        return { name: "Death", speed: 0.8, once: true };
      case "attack":
        return { name: "Attack", speed: 1.3, once: true };
      default:
        return speed > 3 ? { name: "Gallop", speed: Math.min(1.15, speed / 7), once: false } : speed > 0.3 ? { name: "Walk", speed: speed / 1.6, once: false } : { name: "Idle", speed: 1, once: false };
    }
  }
}

function approach(value: number, target: number, delta: number): number {
  return value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);
}
