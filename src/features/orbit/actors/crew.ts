import type { GameAudio } from "../engine/audio";
import { CHARACTER } from "../engine/config";
import type { InputSnapshot } from "../engine/input";
import type { Terrain } from "../engine/terrain";
import type { Car } from "./car";
import type { Explorer } from "./explorer";

export type CrewMode = "foot" | "walkToDoor" | "boarding" | "car" | "alighting";

/** Seconds to slip into the seat, and to climb back out. */
const BOARD_TIME = 0.55;
const ALIGHT_TIME = 0.45;
/** Give up walking to the door after this long and board anyway (s). */
const WALK_TIMEOUT = 3;
const IDLE = { move: 0, jumpPressed: false, jumpHeld: false };

/*
 * The explorer and the car together: walking up to the door, slipping into the seat, driving,
 * stopping and climbing out. Each stage says whether getting in or out is allowed.
 */
export class Crew {
  mode: CrewMode = "foot";
  private modeTime = 0;
  /** -1 … 1 throttle being applied (for the engine sound). */
  throttle = 0;

  constructor(
    readonly explorer: Explorer,
    readonly car: Car,
    private readonly terrain: Terrain,
    private readonly audio: GameAudio,
  ) {}

  get driving(): boolean {
    return this.mode === "car";
  }

  get nearDoor(): boolean {
    return this.mode === "foot" && Math.abs(this.explorer.body.x - this.car.door.x) < CHARACTER.doorReach && this.explorer.body.grounded;
  }

  get canAlight(): boolean {
    const v = this.car.vehicle;
    return this.mode === "car" && v.speed < 1.5 && v.grounded && this.car.wrecked === 0;
  }

  private set(mode: CrewMode): void {
    this.mode = mode;
    this.modeTime = 0;
  }

  /** Starts the stage already driving. */
  seat(): void {
    this.car.occupied = true;
    this.explorer.alpha = 0;
    this.set("car");
  }

  step(dt: number, gravity: number, input: InputSnapshot, rules: { board: boolean; alight: boolean }): void {
    this.modeTime += dt;
    const driving = this.mode === "car";
    this.throttle = driving ? input.move : 0;
    this.car.step(dt, gravity, { move: input.move, flipPressed: input.flipPressed, thrustHeld: input.jumpHeld, thrustPressed: input.jumpPressed }, !driving);

    const e = this.explorer;
    switch (this.mode) {
      case "foot":
        if (input.switchPressed) e.switchLook();
        e.step(dt, gravity, input);
        if (rules.board && input.interactPressed && this.nearDoor && this.car.vehicle.upright) this.set("walkToDoor");
        break;
      case "walkToDoor": {
        const dx = this.car.door.x - e.body.x;
        e.step(dt, gravity, { move: Math.sign(dx) * 0.4, jumpPressed: false, jumpHeld: false });
        if (Math.abs(dx) < 0.1 || this.modeTime > WALK_TIMEOUT) {
          e.body.facing = 1;
          this.set("boarding");
        }
        break;
      }
      case "boarding":
        e.step(dt, gravity, IDLE);
        e.crouch = Math.min(1, this.modeTime / BOARD_TIME);
        e.alpha = 1 - e.crouch;
        if (this.modeTime >= BOARD_TIME) {
          this.audio.door();
          this.car.occupied = true;
          e.alpha = 0;
          this.set("car");
        }
        break;
      case "car": {
        // The driver rides along (hidden), so getting out puts them back at the door.
        const seat = this.car.seat;
        e.body.place(seat.x, seat.y);
        if (rules.alight && input.interactPressed && this.canAlight) {
          const x = this.car.door.x;
          e.body.facing = 1;
          e.place(x, this.terrain.height(x));
          this.car.occupied = false;
          this.audio.door();
          this.set("alighting");
        }
        break;
      }
      case "alighting":
        e.step(dt, gravity, IDLE);
        e.crouch = 1 - Math.min(1, this.modeTime / ALIGHT_TIME);
        e.alpha = 1 - e.crouch;
        if (this.modeTime >= ALIGHT_TIME) {
          e.crouch = 0;
          e.alpha = 1;
          this.set("foot");
        }
        break;
    }
  }
}
