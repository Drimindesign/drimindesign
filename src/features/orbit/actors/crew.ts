import type { GameAudio } from "../engine/audio";
import { CHARACTER } from "../engine/config";
import type { InputSnapshot } from "../engine/input";
import type { Terrain } from "../engine/terrain";
import type { Car } from "./car";
import type { Explorer } from "./explorer";

export type CrewMode = "foot" | "walkToDoor" | "boarding" | "car" | "alighting";

/**
 * Getting in and out, as real as a door allows (s): the door swings open over DOOR_SWING, the
 * driver sits down into (or rises out of) the seat, steps clear, and the door swings shut.
 */
const BOARD_TIME = 1;
const ALIGHT_TIME = 1.1;
const DOOR_SWING = 0.25;
/** How far the driver steps back from the door on the way out (m). */
const STEP_CLEAR = 0.9;
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
      case "boarding": {
        // Door opens, the driver sits down into the seat, the door shuts.
        const t = this.modeTime;
        e.step(dt, gravity, IDLE);
        e.transition = { kind: "in", progress: Math.min(1, t / BOARD_TIME) };
        e.alpha = 1 - smooth01((t - BOARD_TIME * 0.55) / (BOARD_TIME * 0.35));
        this.car.doorOpen = door(t, BOARD_TIME);
        if (t >= BOARD_TIME) {
          this.audio.door();
          this.car.occupied = true;
          this.car.doorOpen = 0;
          e.alpha = 0;
          e.transition = null;
          this.set("car");
        }
        break;
      }
      case "car": {
        // The driver rides along (hidden), so getting out puts them back at the door.
        const seat = this.car.seat;
        e.body.place(seat.x, seat.y);
        if (rules.alight && input.interactPressed && this.canAlight) {
          const x = this.car.door.x;
          e.body.facing = -1;
          e.place(x, this.terrain.height(x));
          this.car.occupied = false;
          this.audio.door();
          this.set("alighting");
        }
        break;
      }
      case "alighting": {
        // Door opens, the driver rises out of the seat and steps clear, the door shuts behind.
        const t = this.modeTime;
        const out = Math.min(1, t / ALIGHT_TIME);
        e.step(dt, gravity, IDLE);
        e.transition = { kind: "out", progress: out };
        e.alpha = smooth01((t - DOOR_SWING * 0.6) / 0.25);
        const x = this.car.door.x - STEP_CLEAR * smooth01((t - ALIGHT_TIME * 0.45) / (ALIGHT_TIME * 0.4));
        e.body.place(x, this.terrain.height(x));
        this.car.doorOpen = door(t, ALIGHT_TIME);
        if (t >= ALIGHT_TIME) {
          e.alpha = 1;
          e.transition = null;
          this.car.doorOpen = 0;
          this.audio.door();
          this.set("foot");
        }
        break;
      }
    }
  }
}

function smooth01(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
}

/* The door over a get-in or get-out of `total` seconds: swings open, stays, swings shut at the end. */
function door(t: number, total: number): number {
  return Math.min(smooth01(t / DOOR_SWING), smooth01((total - t) / DOOR_SWING));
}
