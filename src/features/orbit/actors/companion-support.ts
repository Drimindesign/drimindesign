import { CHARACTER } from "../engine/config";
import type { RoadFeature, Terrain } from "../engine/terrain";

export interface CompanionDeck {
  x0: number;
  x1: number;
  y: number;
}

export interface CompanionLog {
  homeX: number;
  top: number;
  /** Position on the actual stage drift curve, now or at a prospective landing time. */
  center(secondsAhead: number): number;
}

export interface CompanionSupportOptions {
  features: readonly RoadFeature[];
  gravity: number;
  walks: readonly CompanionDeck[];
  logs?: readonly CompanionLog[];
  wantsCanopy?: () => boolean;
}

interface Body {
  x: number;
  y: number;
  vx: number;
  facing: number;
  readonly spec: { speed: number };
}

type Support =
  | { kind: "climb" | "walk"; deck: CompanionDeck }
  | { kind: "ride"; log: CompanionLog; center: number; water: RoadFeature }
  | { kind: "mantle"; bank: number; top: number }
  | { kind: "jump"; vx: number; vy: number; log?: CompanionLog; water?: RoadFeature; bank?: number };

// Road's logs are 2.6 m wide. Leave room for the feet on each end.
const LOG_FOOTING = 1.12;
// The vine hangs outside the walkway; the explorer climbs it at 1.5 m/s.
const VINE_OFFSET = 0.35;
const CLIMB_SPEED = 1.5;
// RoadTerrain starts its steep bank 0.4 m ahead of the authored river.
const BANK_MARGIN = 0.55;
// The hands can reach the last 0.8 m of bank; as in the character controller, step 0.45 m onto it.
const HAND_REACH = 0.8;
const MANTLE_STEP = 0.45;

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

function walk(body: Body, target: number, dt: number): void {
  const delta = clamp(target - body.x, -body.spec.speed * dt, body.spec.speed * dt);
  body.x += delta;
  body.vx = delta / dt;
  body.facing = Math.sign(delta) || body.facing;
}

/** Physical contacts on authored river logs and canopy planks, stepped by Road's fixed clock. */
export class CompanionSupport {
  private readonly contacts = new WeakMap<Body, Support>();
  private readonly rivers: readonly RoadFeature[];

  constructor(private readonly terrain: Terrain, private readonly options: CompanionSupportOptions) {
    this.rivers = options.features.filter((feature) => feature.kind === "water");
  }

  phase(body: Body): "jump" | "ride" | "climb" | "walk" | null {
    const kind = this.contacts.get(body)?.kind;
    return kind === "mantle" ? "climb" : kind ?? null;
  }

  /** An unconscious passenger keeps the platform contact without walking or jumping. */
  carryResting(body: Body): boolean {
    const contact = this.contacts.get(body);
    if (contact?.kind === "ride") {
      const center = contact.log.center(0);
      body.x += center - contact.center; contact.center = center;
      body.y = contact.log.top; body.vx = 0; return true;
    }
    if (contact?.kind === "walk") { body.y = contact.deck.y; body.vx = 0; return true; }
    return false;
  }

  reset(body: Body): void {
    this.contacts.delete(body);
  }

  private deckFor(target: number): CompanionDeck | undefined {
    if (!this.options.wantsCanopy?.()) return undefined;
    return this.options.walks.find((deck) => target >= deck.x0 - VINE_OFFSET && target <= deck.x1 + BANK_MARGIN);
  }

  /** A recruit underneath the planks must return along the ground to the actual vine. */
  approachTarget(body: Body, target: number): number {
    if (this.contacts.has(body)) return target;
    const deck = this.deckFor(target);
    return deck ? deck.x0 - VINE_OFFSET : target;
  }

  move(body: Body, dt: number, target: number): boolean {
    const contact = this.contacts.get(body);
    if (contact?.kind === "jump") return this.stepFlight(body, dt, contact);
    if (contact?.kind === "mantle") {
      body.vx = 0;
      body.y = Math.min(contact.top, body.y + CLIMB_SPEED * dt);
      if (body.y === contact.top) {
        walk(body, contact.bank, dt);
        if (body.x === contact.bank) this.reset(body);
      }
      return true;
    }
    if (contact?.kind === "ride") {
      const center = contact.log.center(0);
      body.x += center - contact.center;
      contact.center = center;
      body.y = contact.log.top;
      const localGoal = clamp(target, center - LOG_FOOTING, center + LOG_FOOTING);
      walk(body, localGoal, dt);
      if (Math.abs(target - center) > LOG_FOOTING) this.tryRiverJump(body, target, contact.water, contact.log);
      return true;
    }
    if (contact) return this.stepCanopy(body, dt, target, contact);

    const deck = this.deckFor(target);
    const vine = deck ? deck.x0 - VINE_OFFSET : 0;
    if (deck && Math.abs(body.x - vine) <= 0.08 && body.y < deck.y) {
      this.contacts.set(body, { kind: "climb", deck });
      body.vx = 0;
      return true;
    }

    const direction = Math.sign(target - body.x);
    for (const river of this.rivers) {
      const bank = direction > 0 ? river.x - BANK_MARGIN : river.x + river.size + BANK_MARGIN;
      const distance = direction * (bank - body.x);
      if (!direction || direction * (target - bank) <= 0 || distance < -0.13 || distance > 0.2) continue;
      // Wait on solid ground if every landing is out of reach this step.
      body.vx = 0;
      this.tryRiverJump(body, target, river);
      return true;
    }
    return false;
  }

  private stepCanopy(body: Body, dt: number, target: number, contact: Extract<Support, { deck: CompanionDeck }>): boolean {
    const { deck } = contact;
    if (contact.kind === "climb") {
      body.vx = 0;
      body.y = Math.min(deck.y, body.y + CLIMB_SPEED * dt);
      if (body.y === deck.y) {
        // Hand over hand onto the first plank, retaining support until both feet are on it.
        walk(body, deck.x0, dt);
        if (body.x === deck.x0) this.contacts.set(body, { kind: "walk", deck });
      }
      return true;
    }
    body.y = deck.y;
    const groundRequested = !this.options.wantsCanopy?.();
    const exit = Math.abs(body.x - deck.x0) < Math.abs(deck.x1 - body.x) ? deck.x0 : deck.x1;
    const goal = groundRequested && target >= deck.x0 && target <= deck.x1 ? exit : target;
    walk(body, clamp(goal, deck.x0, deck.x1), dt);
    const steppingOff = (body.x === deck.x0 && (goal < deck.x0 || groundRequested)) ||
      (body.x === deck.x1 && (goal > deck.x1 || groundRequested));
    if (steppingOff) {
      const vx = (body.x === deck.x0 ? -1 : 1) * body.spec.speed;
      this.contacts.set(body, { kind: "jump", vx, vy: 0 });
    }
    return true;
  }

  private tryRiverJump(body: Body, target: number, water: RoadFeature, riding?: CompanionLog): void {
    const direction = Math.sign(target - body.x);
    const bank = direction > 0 ? water.x + water.size + BANK_MARGIN : water.x - BANK_MARGIN;
    let bestDistance = 0;
    let best: Support | undefined;

    const consider = (y: number, landingX: (time: number) => number, log?: CompanionLog, lip?: number): boolean => {
      const g = this.options.gravity;
      const vy = CHARACTER.jumpSpeed;
      const squared = vy * vy - 2 * g * (y - body.y);
      if (squared <= 0) return false;
      // Descending root of the ballistic equation at the height of the destination.
      const time = (vy + Math.sqrt(squared)) / g;
      const x = landingX(time);
      const distance = direction * (x - body.x);
      if (distance <= bestDistance || distance > body.spec.speed * time + 1e-8) return false;
      bestDistance = distance;
      best = { kind: "jump", vx: (x - body.x) / time, vy, log, water, bank: lip };
      return true;
    };

    if (direction * (target - bank) >= -BANK_MARGIN) {
      const bankTop = this.terrain.height(bank);
      if (!consider(bankTop, () => bank)) {
        consider(bankTop - HAND_REACH, () => bank - direction * MANTLE_STEP, undefined, bank);
      }
    }
    for (const log of this.options.logs ?? []) {
      if (log === riding || log.homeX < water.x || log.homeX > water.x + water.size) continue;
      consider(log.top, (time) => {
        const center = log.center(time);
        // Prefer the center. If only the near end is reachable, land securely there.
        const reach = body.x + direction * body.spec.speed * time;
        const aim = direction > 0 ? Math.min(center, reach, target) : Math.max(center, reach, target);
        return clamp(aim, center - LOG_FOOTING, center + LOG_FOOTING);
      }, log);
    }
    if (best) this.contacts.set(body, best);
  }

  private stepFlight(body: Body, dt: number, flight: Extract<Support, { kind: "jump" }>): boolean {
    const previousY = body.y;
    body.x += flight.vx * dt;
    body.y += flight.vy * dt - 0.5 * this.options.gravity * dt * dt;
    flight.vy -= this.options.gravity * dt;
    body.vx = flight.vx;
    body.facing = Math.sign(flight.vx) || body.facing;
    if (flight.vy > 0) return true;
    if (flight.bank !== undefined && Math.abs(body.x - flight.bank) <= MANTLE_STEP &&
      this.terrain.height(flight.bank) - body.y <= HAND_REACH + Math.abs(flight.vy * dt)) {
      this.contacts.set(body, { kind: "mantle", bank: flight.bank, top: this.terrain.height(flight.bank) });
      return true;
    }
    const log = flight.log;
    if (log && flight.water && previousY >= log.top && body.y <= log.top &&
      Math.abs(body.x - log.center(0)) <= 1.3) {
      body.y = log.top;
      this.contacts.set(body, { kind: "ride", log, center: log.center(0), water: flight.water });
    } else if (body.y <= this.terrain.height(body.x)) {
      body.y = this.terrain.height(body.x);
      this.reset(body);
    }
    return true;
  }
}
