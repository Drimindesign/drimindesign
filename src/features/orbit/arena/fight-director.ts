import type * as Three from "three";
import type { ArenaFighter, FighterKind } from "./arena-fighters";
import type { Blood } from "./blood";
import type { CameraRig } from "./camera-rig";
import { Combat, MASTER_STROKE, type CombatEvent, type CombatInput, type Fighter } from "./combat";

/*
 * Plays the fight: the simulation's fighters become the 3D bodies on the lane (position, facing,
 * the clip for every state, shaded by the light where they stand), and its events become the
 * film: a hit-stop on every clean blow, blood thrown the way the blade travelled (steel chips off
 * armour), sparks and a shield's knock on blocks, slow motion and a push-in on the Master Stroke,
 * and one cut in the whole fight: a white impact flash into the close angle on the final blow.
 */

/** Time effects: hit-stop (s, speed), Master Stroke and finishing-blow slow motion (s, speed). */
const TIME = { stop: [0.075, 0.04], heavyStop: [0.12, 0.03], master: [1.5, 0.28], finish: [1.8, 0.2] } as const;
/** Camera: how far apart the fighters are at the widest framing (m), punches (degrees) for blows. */
const FRAME = { spread: 6, punch: 3.5, heavyPunch: 7, masterPush: 10 } as const;
/** The opening shot: how long it holds (s) and how tight (field of view, degrees). */
const OPENING = { hold: 3.2, fov: 20 } as const;
/** The final blow: the impact flash, then the cut to the close angle a beat later (real s), held to the end. */
const FINALE = { flashDelay: 0.18, cutDelay: 0.26, hold: 6 } as const;
/** Fighters stand a hand-width apart in depth, so from the camera they overlap less (m across the lane). */
const DEPTH = { hero: -0.16, foe: 0.16 } as const;
/** Blood: how hard a blow throws it (0 … 1), and how often a badly hurt fighter drips (per s, below this health). */
const BLEED = { light: 0.45, heavy: 0.85, killed: 1, drip: 2.5, hurt: 0.4 } as const;
const SPARKS = { count: 160, life: 0.35 } as const;

/** A camera position: its framing range (field of view, degrees, close and wide) and how far the operator drifts (m). */
export interface Shot {
  near: number;
  far: number;
  step: number;
}

export interface FightHud {
  health(hero: number, foe: number | null): void;
  meter(share: number): void;
  banner(text: string | null): void;
  /** A full-screen flash: an impact (white), or lightning (cold, `strength` 0 … 1 this frame). */
  flash(kind: "impact" | "lightning", strength: number): void;
  end(result: "win" | "lose"): void;
}

export interface FightSound {
  swing(heavy: boolean): void;
  hit(heavy: boolean): void;
  clang(force: number): void;
  shield(): void;
  fall(): void;
  /** The bonfire's crackle, now and then. */
  crackle(level: number): void;
  thunder(strength: number): void;
  rain(level: number): void;
}

export interface DirectorSetup {
  lane: (s: number) => Three.Vector3;
  face: number;
  half: number;
  bodies: ArenaFighter[];
  rig: CameraRig;
  hud: FightHud;
  sound: FightSound;
  shots: readonly Shot[];
  cutTo: (index: number) => void;
  fire: Three.Vector3 | null;
  blood: Blood;
  /** How lit the ground is at a lane position (a multiplier for a fighter standing there). */
  shade: (s: number) => number;
  opening: string;
}

export class FightDirector {
  readonly combat: Combat;
  readonly sparks: Three.Points;
  private readonly bodies = new Map<number, ArenaFighter>();
  private readonly idle: Record<FighterKind, ArenaFighter[]>;
  private readonly heads = new Map<number, Three.Vector3>();
  private scale = 1;
  private effect: { until: number; speed: number } | null = null;
  private clock = 0;
  private bannerUntil = 0;
  private shot = 0;
  private cutUntil = 0;
  private pending: { at: number; run: () => void }[] = [];
  private readonly sparkPositions: Float32Array;
  private readonly sparkVelocities: Float32Array;
  private readonly sparkAges: Float32Array;
  private sparkNext = 0;
  private readonly v: Three.Vector3;
  private readonly across: Three.Vector3;
  private readonly dir: Three.Vector3;
  private readonly chest: Three.Vector3;

  constructor(
    private readonly THREE: typeof Three,
    private readonly setup: DirectorSetup,
  ) {
    this.v = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.chest = new THREE.Vector3();
    const along = setup.lane(0.5).sub(setup.lane(-0.5)).setY(0).normalize();
    this.across = new THREE.Vector3(-along.z, 0, along.x);
    const hero = setup.bodies.find((b) => b.kind === "hero");
    if (!hero) throw new Error("No hero body");
    this.idle = { hero: [], knight: setup.bodies.filter((b) => b.kind === "knight"), brute: setup.bodies.filter((b) => b.kind === "brute") };
    this.combat = new Combat(setup.half, (clip) => setup.bodies.map((b) => b.length(clip)).find((l) => l > 0) ?? 1);
    this.bodies.set(this.combat.hero.id, hero);
    for (const b of setup.bodies) b.root.visible = b === hero;

    this.sparkPositions = new Float32Array(SPARKS.count * 3);
    this.sparkVelocities = new Float32Array(SPARKS.count * 3);
    this.sparkAges = new Float32Array(SPARKS.count).fill(SPARKS.life);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.sparkPositions, 3));
    this.sparks = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffd28a, size: 0.035, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.sparks.frustumCulled = false;
  }

  /** One frame: real dt in, slowed time for the fight; returns the fight's time scale (for the world's effects). */
  update(dt: number, input: CombatInput): number {
    const { hud, sound } = this.setup;
    this.clock += dt;
    if (this.effect && this.clock > this.effect.until) this.effect = null;
    this.scale = this.effect ? this.effect.speed : 1;
    const simDt = dt * this.scale;
    // The fire crackles a few times a second, irregularly (slowed with everything else).
    if (this.setup.fire && Math.random() < simDt * 7) sound.crackle(0.3 + Math.random() * 0.7);
    for (const e of this.combat.step(simDt, input)) this.react(e);
    this.pending = this.pending.filter((p) => (this.clock >= p.at ? (p.run(), false) : true));
    this.place(simDt);
    this.updateSparks(simDt);
    this.frame();
    const foe = this.combat.engaged;
    if (this.clock - dt <= 0) this.banner(this.setup.opening, 2.8);
    hud.health(this.combat.hero.health / this.combat.hero.max, foe ? foe.health / foe.max : null);
    hud.meter(this.combat.meter / 100);
    if (this.shot !== 0 && this.clock > this.cutUntil) this.cut(0, 0);
    if (this.bannerUntil && this.clock > this.bannerUntil) {
      this.bannerUntil = 0;
      hud.banner(null);
    }
    return this.scale;
  }

  private later(seconds: number, run: () => void): void {
    this.pending.push({ at: this.clock + seconds, run });
  }

  private slow(seconds: number, speed: number): void {
    // Real seconds: the effect's own clock doesn't slow down.
    if (!this.effect || this.effect.speed > speed) this.effect = { until: this.clock + seconds, speed };
  }

  /* Cuts to a camera position for a while (the wide comes back on its own). */
  private cut(index: number, seconds: number): void {
    if (index >= this.setup.shots.length) return;
    this.cutUntil = Math.max(this.cutUntil, this.clock + seconds);
    if (index === this.shot) return;
    this.shot = index;
    this.setup.cutTo(index);
  }

  private banner(text: string, seconds = 2.2): void {
    this.setup.hud.banner(text);
    this.bannerUntil = this.clock + seconds;
  }

  private react(e: CombatEvent): void {
    const { hud, sound, rig } = this.setup;
    switch (e.type) {
      case "wave":
        this.banner(e.index === 0 ? "Two knights. Hold your ground." : "The brute.");
        break;
      case "swing":
        sound.swing(e.heavy);
        break;
      case "master":
        // No cut: the camera leans in hard and time thickens around the blow.
        this.banner("Master Stroke", 1.6);
        this.slow(TIME.master[0], TIME.master[1]);
        rig.punch(FRAME.masterPush);
        hud.flash("impact", 0.25);
        break;
      case "hit": {
        sound.hit(e.heavy);
        this.wound(e.who, e.by, e.killed ? BLEED.killed : e.heavy ? BLEED.heavy : BLEED.light);
        if (e.last) {
          // The one cut of the fight: time all but stops, a white impact flash, and the close angle.
          this.slow(TIME.finish[0], TIME.finish[1]);
          rig.punch(FRAME.heavyPunch * 1.5);
          this.later(FINALE.flashDelay, () => hud.flash("impact", 0.9));
          this.later(FINALE.cutDelay, () => this.cut(1, FINALE.hold));
          this.banner("Cleared", 3);
        } else if (!this.effect || this.effect.speed > TIME.stop[1]) {
          const [s, v] = e.heavy ? TIME.heavyStop : TIME.stop;
          this.slow(s, v);
        }
        rig.punch(e.heavy ? FRAME.heavyPunch : FRAME.punch);
        if (e.by.attack === MASTER_STROKE) this.burst(e.who, 40);
        break;
      }
      case "block":
        if (e.shield) sound.shield();
        else sound.clang(e.parry ? 1 : 0.7);
        this.burst(e.who, e.parry ? 34 : e.shield ? 16 : 20);
        if (e.shield) this.setup.blood.chips(this.chestOf(e.who), this.blowDir(e.by), 0.3);
        if (e.parry) {
          this.slow(0.25, 0.15);
          this.banner("Parry", 1);
        }
        if (e.broken) this.banner("Guard broken", 1);
        break;
      case "down":
        sound.fall();
        break;
      case "win":
        this.later(2.6, () => hud.end("win"));
        break;
      case "lose":
        this.slow(1.4, 0.3);
        this.banner("You fell", 3);
        this.later(1.8, () => hud.end("lose"));
        break;
    }
  }

  private chestOf(f: Fighter): Three.Vector3 {
    const body = this.bodies.get(f.id);
    if (!body) return this.chest.set(0, -100, 0);
    return this.chest.copy(body.root.position).setY(body.root.position.y + (f.kind === "brute" ? 1.6 : 1.25));
  }

  private blowDir(by: Fighter): Three.Vector3 {
    return this.dir.copy(this.setup.lane(by.s + by.facing)).sub(this.setup.lane(by.s)).setY(0).normalize();
  }

  /* A blow on a body: blood thrown the way the blade went; plate also sheds chips of steel. */
  private wound(who: Fighter, by: Fighter, amount: number): void {
    const at = this.chestOf(who);
    const dir = this.blowDir(by);
    if (who.kind === "knight") {
      this.setup.blood.chips(at, dir, amount);
      this.burst(who, 10);
      this.setup.blood.spray(at, dir, amount * 0.45);
    } else {
      this.setup.blood.spray(at, dir, amount);
    }
  }

  /* Sparks where two blades meet: between the fighters, at sword height. */
  private burst(who: Fighter, count: number): void {
    const body = this.bodies.get(who.id);
    if (!body) return;
    const p = body.root.position;
    const toward = this.setup.lane(who.s + who.facing * 0.45).sub(this.setup.lane(who.s)).normalize();
    for (let i = 0; i < count; i++) {
      const k = this.sparkNext++ % SPARKS.count;
      this.sparkPositions.set([p.x + toward.x * 0.45, p.y + 1.25 + Math.random() * 0.2, p.z + toward.z * 0.45], k * 3);
      const a = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 4;
      this.sparkVelocities.set([Math.cos(a) * speed, 1.5 + Math.random() * 3.5, Math.sin(a) * speed], k * 3);
      this.sparkAges[k] = 0;
    }
  }

  private updateSparks(dt: number): void {
    for (let k = 0; k < SPARKS.count; k++) {
      if (this.sparkAges[k] >= SPARKS.life) {
        this.sparkPositions[k * 3 + 1] = -100;
        continue;
      }
      this.sparkAges[k] += dt;
      this.sparkVelocities[k * 3 + 1] -= 9.8 * dt;
      for (let c = 0; c < 3; c++) this.sparkPositions[k * 3 + c] += this.sparkVelocities[k * 3 + c] * dt;
    }
    (this.sparks.geometry.getAttribute("position") as Three.BufferAttribute).needsUpdate = true;
  }

  /* Bodies follow the simulation: lane position (a little apart in depth), facing, shade, and the clip for each state. */
  private place(dt: number): void {
    for (const f of this.combat.fighters) {
      let body = this.bodies.get(f.id);
      if (!body) {
        body = this.idle[f.kind].shift();
        if (!body) continue;
        this.bodies.set(f.id, body);
        body.root.visible = true;
        body.setOpacity(1);
      }
      body.root.position.copy(this.setup.lane(f.s)).addScaledVector(this.across, f.side === "hero" ? DEPTH.hero : DEPTH.foe);
      body.root.position.y += f.y;
      body.root.rotation.y = this.setup.face + (f.facing > 0 ? 0 : Math.PI);
      body.setShade(this.setup.shade(f.s));
      body.arm(f.armed);
      this.animate(f, body);
      // The fallen fade once the fight has moved on.
      if (f.state === "dead") {
        const alpha = Math.max(0, 1 - Math.max(0, f.t - 2.5) / 1.5);
        f.t += dt;
        body.setOpacity(alpha);
        if (alpha === 0) body.root.visible = false;
      }
      // A badly hurt fighter drips.
      if (f.state !== "dead" && f.health / f.max < BLEED.hurt && Math.random() < dt * BLEED.drip) {
        const at = this.chestOf(f).addScaledVector(this.across, (Math.random() - 0.5) * 0.3);
        at.y -= 0.35;
        this.setup.blood.drip(at);
      }
      const target = f.side === "hero" ? this.combat.engaged : this.combat.hero;
      const look = target ? this.heads.get(f.id) ?? new this.THREE.Vector3() : null;
      if (look && target) {
        const other = this.bodies.get(target.id);
        if (other) look.copy(other.root.position).setY(other.root.position.y + (other.kind === "brute" ? 2.05 : 1.6));
        this.heads.set(f.id, look);
      }
      body.update(dt, ["idle", "walk", "run", "block", "enter"].includes(f.state) ? look : null);
    }
  }

  private animate(f: Fighter, body: ArenaFighter): void {
    const hero = f.side === "hero";
    // Walking toward or away from where it faces: the walk plays forward or in reverse.
    const backward = Math.sign(f.vs) !== 0 && Math.sign(f.vs) !== f.facing;
    switch (f.state) {
      case "idle":
        body.play(hero ? "hero_idle" : "foe_idle");
        break;
      case "walk":
      case "enter":
        body.play(hero ? "hero_walk" : "foe_walk", { speed: backward ? -1 : 1 });
        break;
      case "draw":
        body.play("hero_draw", { speed: 1.3, fade: 0.15 });
        break;
      case "sheathe":
        body.play("hero_sheathe", { speed: 1.1, fade: 0.2 });
        break;
      case "run":
        body.play(hero ? "hero_run" : "foe_run", { speed: backward ? -1 : 1 });
        break;
      case "jump":
        body.play("hero_jump", { speed: 1.2 });
        break;
      case "attack":
        if (f.attack) body.play(f.attack.clip, { speed: f.attack.speed, restart: f.t < 0.05, fade: 0.1 });
        break;
      case "block":
        body.play(hero ? "hero_block" : "foe_block", { fade: 0.1 });
        break;
      case "blockhit":
        body.play(hero ? "hero_block" : "foe_blockhit", { restart: f.t < 0.05, fade: 0.06 });
        break;
      case "stagger":
        // Alternating reactions (by how much health is left), so repeated hits never look the same.
        body.play(`${hero ? "hero" : "foe"}_hit${Math.floor(f.health) % 2 ? 1 : 2}`, { restart: f.t < 0.05, fade: 0.06 });
        break;
      case "down":
      case "dead":
        body.play(hero ? "hero_death" : "foe_death", { fade: 0.1, speed: 1.15 });
        break;
      case "getup":
        body.play("getup", { speed: body.length("getup") / 1.6, fade: 0.2 });
        break;
      case "power":
        body.play("hero_power");
        break;
    }
  }

  /* Camera: framing the hero and the foe whose turn it is, closer as they close in. */
  private frame(): void {
    const { rig, shots, fire } = this.setup;
    const hero = this.bodies.get(this.combat.hero.id);
    if (!hero) return;
    // The opening: tight on the bonfire (or the hero), then the camera finds the fight on its own spring.
    if (this.clock < OPENING.hold) {
      if (fire) rig.target.copy(fire).setY(fire.y + 0.9);
      else rig.target.copy(hero.root.position).setY(hero.root.position.y + 1.4);
      rig.zoom(OPENING.fov);
      return;
    }
    const foe = this.combat.engaged;
    const foeBody = foe ? this.bodies.get(foe.id) : null;
    const target = this.v.copy(hero.root.position);
    let gap = 0;
    if (foeBody && foe) {
      target.lerp(foeBody.root.position, 0.5);
      gap = Math.abs(foe.s - this.combat.hero.s);
    }
    target.y += 1.15;
    rig.target.copy(target);
    const t = Math.min(1, gap / FRAME.spread);
    const shot = shots[this.shot];
    rig.zoom(shot.near + (shot.far - shot.near) * t);
  }

  dispose(): void {
    this.sparks.geometry.dispose();
    (this.sparks.material as Three.Material).dispose();
  }
}
