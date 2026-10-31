import type * as Three from "three";
import type { ArenaFighter, FighterKind } from "./arena-fighters";
import type { CameraRig } from "./camera-rig";
import { Combat, MASTER_STROKE, type CombatEvent, type CombatInput, type Fighter } from "./combat";

/*
 * Plays the fight: the simulation's fighters become the 3D bodies on the lane (position, facing,
 * the clip for every state), and its events become the film: a hit-stop on every clean blow
 * (the frame holds for a beat, the way a heavy impact reads), slow motion on the Master Stroke
 * and on the last blow of the fight, the camera punching in, steel sparks on blocks, and the
 * HUD (health, the Master Stroke meter, wave banners).
 */

/** Time effects: hit-stop (s, speed), Master Stroke and finishing-blow slow motion (s, speed). */
const TIME = { stop: [0.075, 0.04], heavyStop: [0.12, 0.03], master: [1.5, 0.28], finish: [1.6, 0.22] } as const;
/** Camera: how far apart the fighters are at the widest framing (m), punches (degrees) for blows. */
const FRAME = { spread: 6, punch: 3.5, heavyPunch: 7 } as const;
/** The opening shot: how long it holds on the fire (s) and how tight (field of view, degrees). */
const OPENING = { hold: 3.2, fov: 20 } as const;
/** How long (real s) a cut to the low angle holds for each moment. */
const CUTS = { master: 2.4, finish: 3.4, knockdown: 1.6 } as const;

/** A camera position: its framing range (field of view, degrees, close and wide) and how far the operator drifts (m). */
export interface Shot {
  near: number;
  far: number;
  step: number;
}
const SPARKS = { count: 160, life: 0.35 } as const;

export interface FightHud {
  health(hero: number, foe: number | null): void;
  meter(share: number): void;
  banner(text: string | null): void;
  end(result: "win" | "lose"): void;
}

export interface FightSound {
  swing(heavy: boolean): void;
  hit(heavy: boolean): void;
  clang(force: number): void;
  fall(): void;
  /** The bonfire's crackle, now and then. */
  crackle(level: number): void;
}

export class FightDirector {
  readonly combat: Combat;
  private readonly bodies = new Map<number, ArenaFighter>();
  private readonly idle: Record<FighterKind, ArenaFighter[]>;
  private readonly heads = new Map<number, Three.Vector3>();
  private scale = 1;
  private effect: { until: number; speed: number } | null = null;
  private clock = 0;
  private bannerUntil = 0;
  private shot = 0;
  private cutUntil = 0;
  private readonly sparkPositions: Float32Array;
  private readonly sparkVelocities: Float32Array;
  private readonly sparkAges: Float32Array;
  private sparkNext = 0;
  readonly sparks: Three.Points;
  private readonly v: Three.Vector3;

  constructor(
    private readonly THREE: typeof Three,
    private readonly at: (s: number) => Three.Vector3,
    private readonly face: number,
    half: number,
    bodies: ArenaFighter[],
    private readonly rig: CameraRig,
    private readonly hud: FightHud,
    private readonly sound: FightSound,
    private readonly shots: readonly Shot[],
    private readonly cutTo: (index: number) => void,
    private readonly fire: Three.Vector3 | null,
  ) {
    this.v = new THREE.Vector3();
    const hero = bodies.find((b) => b.kind === "hero");
    if (!hero) throw new Error("No hero body");
    this.idle = { hero: [], knight: bodies.filter((b) => b.kind === "knight"), brute: bodies.filter((b) => b.kind === "brute") };
    this.combat = new Combat(half, (clip) => bodies.map((b) => b.length(clip)).find((l) => l > 0) ?? 1);
    this.bodies.set(this.combat.hero.id, hero);
    for (const b of bodies) b.root.visible = b === hero;

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
    this.clock += dt;
    if (this.effect && this.clock > this.effect.until) this.effect = null;
    this.scale = this.effect ? this.effect.speed : 1;
    const simDt = dt * this.scale;
    // The fire crackles a few times a second, irregularly (slowed with everything else).
    if (this.fire && Math.random() < simDt * 7) this.sound.crackle(0.3 + Math.random() * 0.7);
    const events = this.combat.step(simDt, input);
    for (const e of events) this.react(e);
    this.place(simDt);
    this.updateSparks(simDt);
    this.frame();
    const foe = this.combat.engaged;
    if (this.clock < 0.1) this.banner("The Backyard", 2.8);
    this.hud.health(this.combat.hero.health / this.combat.hero.max, foe ? foe.health / foe.max : null);
    this.hud.meter(this.combat.meter / 100);
    if (this.shot !== 0 && this.clock > this.cutUntil) this.cut(0, 0);
    if (this.bannerUntil && this.clock > this.bannerUntil) {
      this.bannerUntil = 0;
      this.hud.banner(null);
    }
    return this.scale;
  }

  private slow(seconds: number, speed: number): void {
    // Real seconds: the effect's own clock doesn't slow down.
    if (!this.effect || this.effect.speed > speed) this.effect = { until: this.clock + seconds, speed };
  }

  /* Cuts to a camera position for a while (the wide comes back on its own). */
  private cut(index: number, seconds: number): void {
    if (index >= this.shots.length) return;
    this.cutUntil = Math.max(this.cutUntil, this.clock + seconds);
    if (index === this.shot) return;
    this.shot = index;
    this.cutTo(index);
  }

  private banner(text: string, seconds = 2.2): void {
    this.hud.banner(text);
    this.bannerUntil = this.clock + seconds;
  }

  private react(e: CombatEvent): void {
    switch (e.type) {
      case "wave":
        this.banner(e.index === 0 ? "Two knights. Hold the yard." : "The brute.");
        break;
      case "swing":
        this.sound.swing(e.heavy);
        break;
      case "master":
        this.banner("Master Stroke", 1.6);
        this.cut(1, CUTS.master);
        this.slow(TIME.master[0], TIME.master[1]);
        this.rig.punch(FRAME.heavyPunch * 1.3);
        break;
      case "hit": {
        const heavy = e.heavy;
        this.sound.hit(heavy);
        if (e.last) {
          this.slow(TIME.finish[0], TIME.finish[1]);
          this.rig.punch(FRAME.heavyPunch * 1.5);
          this.banner("Yard cleared", 3);
          this.cut(1, CUTS.finish);
        } else if (!this.effect || this.effect.speed > TIME.stop[1]) {
          const [s, v] = heavy ? TIME.heavyStop : TIME.stop;
          this.slow(s, v);
        }
        this.rig.punch(heavy ? FRAME.heavyPunch : FRAME.punch);
        if (e.by.attack === MASTER_STROKE) this.burst(e.who, 40);
        break;
      }
      case "block":
        this.sound.clang(e.parry ? 1 : 0.7);
        this.burst(e.who, e.parry ? 34 : 20);
        if (e.parry) {
          this.slow(0.25, 0.15);
          this.banner("Parry", 1);
        }
        if (e.broken) this.banner("Guard broken", 1);
        break;
      case "down":
        this.sound.fall();
        // A big fall gets its close-up now and then, never so often the cutting gets busy.
        if (this.shot === 0 && Math.random() < 0.4) this.cut(1, CUTS.knockdown);
        break;
      case "win":
        this.cut(1, 4);
        window.setTimeout(() => this.hud.end("win"), 2600);
        break;
      case "lose":
        this.slow(1.4, 0.3);
        this.banner("You fell", 3);
        window.setTimeout(() => this.hud.end("lose"), 1800);
        break;
    }
  }

  /* Sparks where two blades meet: between the fighters, at sword height. */
  private burst(who: Fighter, count: number): void {
    const body = this.bodies.get(who.id);
    if (!body) return;
    const p = body.root.position;
    const toward = this.at(who.s - who.facing * -0.45).sub(this.at(who.s)).normalize();
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

  /* Bodies follow the simulation: lane position, facing, and the clip for each state. */
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
      body.root.position.copy(this.at(f.s));
      body.root.position.y += f.y;
      body.root.rotation.y = this.face + (f.facing > 0 ? 0 : Math.PI);
      this.animate(f, body);
      // The fallen fade once the fight has moved on.
      if (f.state === "dead") {
        const alpha = Math.max(0, 1 - Math.max(0, f.t - 1.5) / 1.2);
        f.t += dt;
        body.setOpacity(alpha);
        if (alpha === 0) body.root.visible = false;
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
    const hero = this.bodies.get(this.combat.hero.id);
    if (!hero) return;
    // The opening: tight on the bonfire, then the camera finds the fight on its own spring.
    if (this.fire && this.clock < OPENING.hold) {
      this.rig.target.copy(this.fire).setY(this.fire.y + 0.9);
      this.rig.zoom(OPENING.fov);
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
    this.rig.target.copy(target);
    const t = Math.min(1, gap / FRAME.spread);
    const shot = this.shots[this.shot];
    this.rig.zoom(shot.near + (shot.far - shot.near) * t);
  }

  dispose(): void {
    this.sparks.geometry.dispose();
    (this.sparks.material as Three.Material).dispose();
  }
}
