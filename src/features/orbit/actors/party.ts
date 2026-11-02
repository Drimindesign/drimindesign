import type { Terrain } from "../engine/terrain";
import type { WeaponId } from "./arsenal";

/** Who can be found locked up: the five KayKit toys and a village dog. */
export type MateKind = "knight" | "barbarian" | "mage" | "ranger" | "rogue" | "dog";

export interface MateSpec {
  name: string;
  /** Standing height (m): the toys stand about knee to waist high. */
  height: number;
  /** How it fights: up close, with arrows, or with magic; its reach (m), the gap between blows (s), and how hard they land. */
  attack: "melee" | "arrow" | "magic" | "bite";
  range: number;
  every: number;
  power: number;
  /** Top speed following her (m/s). */
  speed: number;
  /** What freeing it gives her. */
  unlocks?: { weapon?: WeaponId; fire?: boolean };
  /** Its words when the cage breaks, a warning it calls when danger comes, and its last words. */
  freed: string;
  warns: string;
}

/**
 * The team: each fights its own way, and some bring something. The Barbarian brings the axe,
 * the Mage the Fire Sword; the dog smells an ambush before it comes.
 */
export const MATES: Record<MateKind, MateSpec> = {
  knight: { name: "Knight", height: 0.95, attack: "melee", range: 1.2, every: 1.4, power: 1.6, speed: 4.6, freed: "A real hero! My shield is yours, Kachujin.", warns: "Shields up! Here they come!" },
  barbarian: { name: "Barbarian", height: 1, attack: "melee", range: 1.3, every: 1.9, power: 2.6, speed: 4.4, unlocks: { weapon: "axe" }, freed: "Free! Take my spare axe. Hit them like you mean it.", warns: "More of them. Good. I was bored." },
  mage: { name: "Mage", height: 0.95, attack: "magic", range: 7, every: 3.2, power: 2.2, speed: 4.4, unlocks: { fire: true }, freed: "Your blade... let me give it fire. Press V when you need it.", warns: "I feel them in the dark. Careful." },
  ranger: { name: "Ranger", height: 0.95, attack: "arrow", range: 11, every: 1.7, power: 1.4, speed: 4.8, freed: "Thank you. I never miss. Well. Almost never.", warns: "Movement ahead. I have them in my sights." },
  rogue: { name: "Rogue", height: 0.9, attack: "melee", range: 1.1, every: 0.9, power: 1, speed: 5, freed: "I'd have picked that lock myself. Eventually. Thanks.", warns: "Shh. Something's coming." },
  dog: { name: "Dog", height: 0.62, attack: "bite", range: 1, every: 1.1, power: 1, speed: 5.2, freed: "Woof! (Thank you! I'm coming with you!)", warns: "Grrr... (Wolves. Many. That way.)" },
};

/** Hearts each mate has. */
export const MATE_HEARTS = 3;

/** A member of the team over the whole run: carried from stage to stage, alive or lost. */
export interface Member {
  kind: MateKind;
  hearts: number;
  alive: boolean;
}

/*
 * The run's team and what it has unlocked. It outlives the stages: whoever was freed comes along
 * into the next one, and whoever fell stays lost.
 */
export class Party {
  readonly members: Member[] = [];
  readonly carried: WeaponId[] = ["blade", "dagger"];
  fire = false;

  /** A freed prisoner joins (the same member its body carries, so its hearts are the team's). */
  join(member: Member): void {
    if (this.members.includes(member)) return;
    this.members.push(member);
    const unlocks = MATES[member.kind].unlocks;
    if (unlocks?.weapon && !this.carried.includes(unlocks.weapon)) this.carried.push(unlocks.weapon);
    if (unlocks?.fire) this.fire = true;
  }

  has(kind: MateKind): boolean {
    return this.members.some((m) => m.kind === kind);
  }
}

/** Following: how far behind her the first stands (m), and the gap between each after (m). */
const FOLLOW = { first: 1.4, gap: 0.95 } as const;
/** Further from her than this (m), or over a drop it can't cross, a mate catches up out of sight. */
const STRAY = 13;
/** Hurt: it flinches this long (s), and can't be hurt again for this long (s). */
const FLINCH = 0.45;
const MERCY = 1.2;

export type MateState = "caged" | "freeing" | "cheering" | "follow" | "attack" | "hurt" | "dead";

/*
 * A mate on the ground: locked up, then freed (it stands, cheers, and joins), then following her
 * in a line, turning to fight whatever comes close (up close, with arrows, or with magic), hurt by
 * blows like she is, and lost if its hearts run out. No climbing or ropes: when she crosses
 * something it can't, it finds its own way round and catches up out of sight.
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
  private mercy = 0;
  /** Faded out (catching up out of sight) and back in. */
  alpha = 1;
  /** Hits taken (the 3D body's flinch reads it). */
  hitSerial = 0;
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

  /** A blow would land now (not blinking from the last one). */
  get open(): boolean {
    return this.active && this.mercy === 0;
  }

  /** The cage broken: it gets up, cheers, and joins. */
  free(): void {
    this.state = "freeing";
    this.timer = 0;
  }

  /** A blow from `fromX`. Returns true if this one killed it. */
  hurt(fromX: number): boolean {
    if (!this.active || this.mercy > 0) return false;
    this.member.hearts = Math.max(0, this.member.hearts - 1);
    this.hitSerial++;
    this.mercy = MERCY;
    this.vx = Math.sign(this.x - fromX) * 2.2;
    if (this.member.hearts === 0) {
      this.member.alive = false;
      this.state = "dead";
      this.timer = 0;
      return true;
    }
    this.state = "hurt";
    this.timer = 0;
    return false;
  }

  /**
   * One step. `slot`: its place in the line behind her. `foe`: the nearest enemy, if any. Returns
   * the enemy struck this step (its blow lands), if any.
   */
  update<T extends { x: number; y: number }>(dt: number, hero: { x: number; facing: number }, slot: number, foe: T | null): T | null {
    this.timer += dt;
    this.reload = Math.max(0, this.reload - dt);
    this.mercy = Math.max(0, this.mercy - dt);
    this.alpha = Math.min(1, this.alpha + dt * 2);
    const ground = this.terrain.height(this.x);
    switch (this.state) {
      case "caged":
      case "dead":
        this.vx = 0;
        this.y = ground;
        return null;
      case "freeing":
        if (this.timer > 1.15) this.set("cheering");
        return null;
      case "cheering":
        if (this.timer > 1.5) this.set("follow");
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
        if (this.timer >= 0.35 && this.timer - dt < 0.35 && foe) return foe;
        if (this.timer > 0.75) this.set("follow");
        return null;
      case "follow": {
        const spec = this.spec;
        // Danger in reach: turn and fight it (closing in if it fights up close).
        if (foe && Math.abs(foe.x - this.x) < Math.max(spec.range + 3, 5)) {
          const d = foe.x - this.x;
          this.facing = Math.sign(d) || this.facing;
          if (Math.abs(d) <= spec.range && this.reload === 0) {
            this.reload = spec.every;
            this.set("attack");
            return null;
          }
          const want = Math.abs(d) > spec.range * 0.8 && (spec.attack === "melee" || spec.attack === "bite") ? Math.sign(d) * spec.speed : 0;
          this.vx = approach(this.vx, want, 14 * dt);
          this.move(dt);
          return null;
        }
        // Otherwise in line behind her.
        const target = hero.x - hero.facing * (FOLLOW.first + slot * FOLLOW.gap);
        const gap = target - this.x;
        // Too far behind, or standing over a drop it can't cross: it catches up out of sight.
        if (Math.abs(hero.x - this.x) > STRAY || this.terrain.height(target) - ground > 1.4 || ground < -3) {
          this.x = target;
          this.y = this.terrain.height(target);
          this.alpha = 0;
          this.vx = 0;
          return null;
        }
        const want = Math.abs(gap) < 0.25 ? 0 : Math.sign(gap) * Math.min(spec.speed, Math.abs(gap) * 2.4);
        this.vx = approach(this.vx, want, 12 * dt);
        if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx);
        else this.facing = hero.facing;
        this.move(dt);
        return null;
      }
    }
  }

  /* Walks along the ground, never into a drop it can't take. */
  private move(dt: number): void {
    const next = this.x + this.vx * dt;
    const step = this.terrain.height(next) - this.terrain.height(this.x);
    if (step > 1.4 || this.terrain.height(next) < -3) {
      this.vx = 0;
    } else {
      this.x = next;
    }
    this.y = this.terrain.height(this.x);
  }

  private set(state: MateState): void {
    this.state = state;
    this.timer = 0;
  }

  /** The motion-captured clip its body plays now, and how fast. */
  get clip(): { name: string; speed: number; once: boolean } {
    const dog = this.kind === "dog";
    const speed = Math.abs(this.vx);
    switch (this.state) {
      case "caged":
        return dog ? { name: "Idle", speed: 0.6, once: false } : { name: "Sit_Floor_Idle", speed: 1, once: false };
      case "freeing":
        return dog ? { name: "Walk", speed: 1, once: false } : { name: "Sit_Floor_StandUp", speed: 1, once: true };
      case "cheering":
        return dog ? { name: "Idle", speed: 1.4, once: false } : { name: "Cheering", speed: 1, once: true };
      case "hurt":
        return dog ? { name: "Idle_HitReact1", speed: 1, once: true } : { name: "Hit_A", speed: 1, once: true };
      case "dead":
        return dog ? { name: "Death", speed: 1, once: true } : { name: "Death_A", speed: 1, once: true };
      case "attack": {
        const name = dog ? "Attack" : { knight: "Melee_1H_Attack_Chop", barbarian: "Melee_2H_Attack_Chop", mage: "Ranged_Magic_Shoot", ranger: "Ranged_Bow_Release", rogue: "Melee_1H_Attack_Chop", dog: "Attack" }[this.kind];
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
