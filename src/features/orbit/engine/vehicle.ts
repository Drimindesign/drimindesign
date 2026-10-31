import { CAR } from "./config";
import type { Terrain } from "./terrain";

export interface VehicleInput {
  /** -1 brake / reverse … 1 full throttle. */
  throttle: number;
  thrust: boolean;
  /** Thrusters pressed this step: kicks the car off the ground. */
  thrustPressed: boolean;
  /** No driver: the parking brake holds the car. */
  parked: boolean;
  /** A tap this step, in the air: -1 queues a back-flip, 1 a front-flip. */
  flip?: number;
  /** In the air: fire a forward burst (the second press of the thrusters). */
  boost?: boolean;
}

interface Wheel {
  /** Car-space anchor at the top of the suspension. */
  ax: number;
  ay: number;
  compression: number;
  grounded: boolean;
  /** World position of the wheel centre, for drawing, and its drawn suspension length (m). */
  cx: number;
  cy: number;
  extension: number;
  /** Rolling angle (rad) and rate (rad/s). */
  spin: number;
  spinRate: number;
}

/** In the air the drawn wheels hang this much short of full extension (m): tucked in the arches. */
const AIR_TUCK = 0.1;

/* Body outline points that can touch the ground: nose, tail, underside and roof. */
const HULL: readonly [number, number][] = [
  [2.3, -0.4],
  [2.34, -0.06],
  [1.7, -0.5],
  [-1.9, -0.45],
  [-2.28, 0.1],
  [-2.28, -0.4],
  [0.15, 0.6],
  [1.2, 0.29],
  [-1.2, 0.36],
  [0, -0.52],
];

/*
 * A raycast car on a height field. Each wheel's suspension is a spring and damper along the
 * car's down axis; the tyre pushes along the ground's tangent, limited by friction against the
 * suspension load, so grip, weight transfer, wheelies and landings come out of the physics.
 * The body's own outline collides too, so nose-first landings and rollovers behave.
 */
export class Vehicle {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  angle = 0;
  spinRate = 0;
  /** A boost fired this step (for the exhaust burst and sound). */
  boosted = false;
  tank: number = CAR.thrustTank;
  /** Booster charges in hand (whole numbers). */
  boosters: number = CAR.boostersAtStart;
  /** 0 … 1: how hard the thrusters are firing this step (the driver's or the landing burn). */
  thrust = 0;
  /** Height of the floor above the ground (m). */
  altitude = 0;
  wheels: Wheel[];
  /** Previous step's pose, for interpolated drawing. */
  px: number;
  py: number;
  pangle = 0;
  private upsideDown = 0;
  /** Seconds into the lift-off burn and the boost burn, or -1 when not firing. */
  private lift = -1;
  private push = -1;
  /** Whole turns from level the car is turning to in the air (flips queued), or null: nearest upright. */
  private flipTurns: number | null = null;
  /** Flips tapped during the lift-off burn, still on the wheels: they start once airborne. */
  private queued = 0;

  constructor(x: number, private readonly terrain: Terrain) {
    this.x = x;
    this.y = terrain.height(x) + 0.75;
    this.px = this.x;
    this.py = this.y;
    this.wheels = CAR.wheels.map((w) => ({
      ax: w.x,
      ay: w.y,
      compression: 0,
      grounded: false,
      cx: x + w.x,
      cy: this.y + w.y - CAR.restLength,
      extension: CAR.restLength - AIR_TUCK,
      spin: 0,
      spinRate: 0,
    }));
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** Forward speed along the car's own axis (m/s). */
  get forwardSpeed(): number {
    return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
  }

  get grounded(): boolean {
    return this.wheels.some((wheel) => wheel.grounded);
  }

  get upright(): boolean {
    return Math.cos(this.angle) > 0.5;
  }

  /** Car space to world space. */
  toWorld(lx: number, ly: number): { x: number; y: number } {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return { x: this.x + lx * c - ly * s, y: this.y + lx * s + ly * c };
  }

  step(dt: number, gravity: number, input: VehicleInput): void {
    this.px = this.x;
    this.py = this.y;
    this.pangle = this.angle;

    const { mass, inertia } = CAR;
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    const upX = -s;
    const upY = c;
    let fx = 0;
    let fy = -mass * gravity;
    let torque = 0;

    const apply = (px: number, py: number, forceX: number, forceY: number): void => {
      fx += forceX;
      fy += forceY;
      torque += (px - this.x) * forceY - (py - this.y) * forceX;
    };
    const pointVelocity = (px: number, py: number): [number, number] => [
      this.vx - this.spinRate * (py - this.y),
      this.vy + this.spinRate * (px - this.x),
    ];

    const reach = CAR.restLength + CAR.wheelRadius;
    for (const wheel of this.wheels) {
      const anchor = this.toWorld(wheel.ax, wheel.ay);
      // Ray down the car's axis: where does it meet the ground?
      const above = (t: number): number => anchor.y - upY * t - this.terrain.height(anchor.x - upX * t);
      const previous = wheel.compression;
      if (above(reach) > 0 || above(0) < -reach) {
        wheel.grounded = false;
        wheel.compression = 0;
      } else {
        let lo = 0;
        let hi = reach;
        if (above(0) <= 0) hi = 0;
        for (let i = 0; i < 14 && hi > 0; i++) {
          const mid = (lo + hi) / 2;
          if (above(mid) > 0) lo = mid;
          else hi = mid;
        }
        const length = hi - CAR.wheelRadius;
        wheel.grounded = true;
        wheel.compression = Math.max(0, CAR.restLength - length);
        const rate = (wheel.compression - previous) / dt;
        // Bump stop: past full travel the spring stiffens sharply.
        const overTravel = Math.max(0, wheel.compression - CAR.restLength * 0.92);
        const load = Math.max(0, CAR.spring * wheel.compression + CAR.damper * rate + overTravel * 400000);
        apply(anchor.x, anchor.y, upX * load, upY * load);

        // Tyre force along the ground at the contact point.
        const hitX = anchor.x - upX * hi;
        const hitY = anchor.y - upY * hi;
        const n = this.terrain.normal(hitX);
        const tx = n.y;
        const ty = -n.x;
        const [cvx, cvy] = pointVelocity(hitX, hitY);
        const along = cvx * tx + cvy * ty;
        const forward = along * Math.sign(c || 1);
        let force = -along * CAR.rolling;
        if (input.parked) {
          force = -along * mass * 6;
        } else if (input.throttle > 0) {
          force += input.throttle * CAR.drive * Math.max(0, 1 - forward / CAR.topSpeed) * 0.5;
        } else if (input.throttle < 0) {
          force += forward > 0.6
            ? -Math.sign(along) * CAR.brake * -input.throttle * 0.5
            : input.throttle * CAR.drive * 0.35 * Math.max(0, 1 + forward / CAR.reverseSpeed);
        }
        // Mud: the tyres slip and the wheels sink and drag.
        const grip = this.terrain.grip(hitX);
        // Sinking drag grows with speed: ~2.5 m/s² at 60 km/h in deep mud, like a real car.
        if (grip < 1) force -= along * mass * 0.12 * (1 - grip);
        const limit = CAR.grip * grip * load;
        force = Math.max(-limit, Math.min(limit, force));
        apply(hitX, hitY, tx * force, ty * force);
        wheel.spinRate = along / CAR.wheelRadius;
      }
      if (!wheel.grounded) {
        // Free wheels: the throttle spins them up, they slow on their own.
        wheel.spinRate += (input.throttle * 60 - wheel.spinRate * 0.8) * dt;
      }
      wheel.spin -= wheel.spinRate * dt;
      // Where the wheel is drawn: on the ground, where the spring puts it; in the air it droops
      // only a little past ride height and eases there, so the tyres stay tucked in the arches.
      const target = wheel.grounded ? CAR.restLength - wheel.compression : CAR.restLength - AIR_TUCK;
      wheel.extension += (target - wheel.extension) * Math.min(1, (wheel.grounded ? 40 : 10) * dt);
      wheel.cx = anchor.x - upX * wheel.extension;
      wheel.cy = anchor.y - upY * wheel.extension;
    }

    // The body itself against the ground.
    for (const [lx, ly] of HULL) {
      const p = this.toWorld(lx, ly);
      const depth = this.terrain.height(p.x) - p.y;
      if (depth <= 0) continue;
      const n = this.terrain.normal(p.x);
      const [pvx, pvy] = pointVelocity(p.x, p.y);
      const vn = pvx * n.x + pvy * n.y;
      const push = Math.max(0, depth * CAR.hullSpring - vn * CAR.hullDamper);
      const tx = n.y;
      const ty = -n.x;
      const slide = pvx * tx + pvy * ty;
      const friction = Math.max(-0.6 * push, Math.min(0.6 * push, -slide * mass * 8));
      apply(p.x, p.y, n.x * push + tx * friction, n.y * push + ty * friction);
    }

    // Thrusters under the floor fire along the car's up axis: held by the driver, or on their
    // own as a braking burn when the car is sinking fast close to the ground.
    const floor = this.toWorld(0, -0.5);
    this.altitude = floor.y - this.terrain.height(floor.x);
    const burn = CAR.landingBurn;
    const allowed = burn.floor + Math.max(0, this.altitude) * burn.perMetre;
    const flare = !this.grounded && this.altitude < burn.height ? Math.min(1, Math.max(0, (-this.vy - allowed) / 3)) : 0;
    // Held thrust eases off as the climb nears its limit: a hover, not a rocket.
    const hold = input.thrust ? Math.min(1, Math.max(0.35, (CAR.maxClimb - this.vy) / 2)) : 0;
    this.thrust = input.parked || this.tank <= 0 ? 0 : Math.max(hold, flare);
    if (input.thrustPressed && this.grounded && this.tank > 0.3 && !input.parked) {
      this.lift = 0;
      this.tank -= CAR.liftCost;
    }
    // The lift-off and boost burns: a push that swells and fades (sine), integrating to its kick.
    if (this.lift >= 0) {
      const a = ((CAR.liftKick * Math.PI) / (2 * CAR.liftTime)) * Math.sin((Math.PI * this.lift) / CAR.liftTime);
      fx += upX * mass * a;
      fy += upY * mass * a;
      this.thrust = Math.max(this.thrust, Math.sin((Math.PI * this.lift) / CAR.liftTime));
      this.lift += dt;
      if (this.lift >= CAR.liftTime) this.lift = -1;
    }
    if (this.push >= 0) {
      const shape = (Math.PI / (2 * CAR.boostTime)) * Math.sin((Math.PI * this.push) / CAR.boostTime);
      fx += mass * c * CAR.boost * shape;
      fy += mass * (s * CAR.boost + CAR.boostLift) * shape;
      this.push += dt;
      if (this.push >= CAR.boostTime) this.push = -1;
    }
    if (this.thrust > 0 && this.lift < 0) {
      const force = mass * CAR.thrust * this.thrust;
      apply(floor.x, floor.y, upX * force, upY * force);
      this.tank = Math.max(0, this.tank - dt * this.thrust);
    } else if (this.grounded) {
      this.tank = Math.min(CAR.thrustTank, this.tank + CAR.thrustRefill * dt);
    }

    // In the air the car holds itself level to the slope below (the thrusters trim it), and
    // each tap of ← → queues one full turn: it spins round at the flip rate, then springs to
    // upright. Thrust never turns the car; only the driver's taps do.
    if (this.grounded) {
      this.flipTurns = null;
      if (this.lift >= 0) this.queued += input.flip ?? 0;
      else this.queued = 0;
    } else if (!input.parked) {
      const level = Math.atan(this.terrain.slope(this.x));
      const nearest = Math.round((this.angle - level) / (Math.PI * 2));
      const flip = (input.flip ?? 0) + this.queued;
      this.queued = 0;
      // A front flip turns nose-down (clockwise, the angle falling).
      if (flip !== 0) this.flipTurns = (this.flipTurns ?? nearest) - flip;
      const error = this.angle - level - (this.flipTurns ?? nearest) * Math.PI * 2;
      if (Math.abs(error) > 0.6) {
        const target = -Math.sign(error) * CAR.flipRate;
        const step = CAR.flipAccel * dt;
        this.spinRate += Math.max(-step, Math.min(step, target - this.spinRate));
      } else {
        this.spinRate += (-CAR.settleSpring * error - CAR.settleDamp * this.spinRate) * dt;
      }
    }
    // The boost: a burst along the nose, with a little lift so it carries you over a gap.
    this.boosted = false;
    if (input.boost && !this.grounded && !input.parked && this.boosters >= 1 && this.push < 0) {
      this.push = 0;
      this.boosters -= 1;
      this.boosted = true;
    }

    this.vx += (fx / mass) * dt;
    this.vy += (fy / mass) * dt;
    this.spinRate += (torque / inertia) * dt;
    this.spinRate *= 1 - 0.15 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.spinRate * dt;

    // Stuck on its roof: set it back on its wheels where it lies.
    this.upsideDown = Math.cos(this.angle) < 0 && this.speed < 1.5 ? this.upsideDown + dt : 0;
    if (this.upsideDown > CAR.flipReset) this.reset(this.x);
  }

  /** A booster charge earned (a stunt); false when already full. */
  gainBooster(): boolean {
    if (this.boosters >= CAR.boosters) return false;
    this.boosters += 1;
    return true;
  }

  /** Called down from the sky: level, at x, this high above the ground, already falling. */
  drop(x: number, height: number): void {
    this.reset(x);
    this.y += height;
    this.vy = -3;
    this.angle = 0;
    this.py = this.y;
    this.pangle = 0;
  }

  reset(x: number): void {
    this.x = x;
    this.y = this.terrain.height(x) + 0.8;
    this.angle = Math.atan(this.terrain.slope(x));
    this.vx = 0;
    this.vy = 0;
    this.spinRate = 0;
    this.upsideDown = 0;
    this.lift = -1;
    this.push = -1;
    this.flipTurns = null;
    this.queued = 0;
    this.boosters = Math.max(1, this.boosters);
    this.px = this.x;
    this.py = this.y;
    this.pangle = this.angle;
  }
}
