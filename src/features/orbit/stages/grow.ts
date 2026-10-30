import { Car } from "../actors/car";
import { Crew } from "../actors/crew";
import { Explorer } from "../actors/explorer";
import { POINTS } from "../actors/score";
import { FollowCamera, projector } from "../engine/camera";
import { CAR } from "../engine/config";
import type { InputSnapshot } from "../engine/input";
import { MoonTerrain } from "../engine/terrain";
import type { ExplorerId } from "../pixel/explorer-sprite";
import { MoonScene } from "../pixel/moon";
import { blit, CELL, drawFlag, FLAG_POLE, glow } from "../pixel/props";
import { scoreCarEvents } from "./road";
import { Pickups, type Stage, type StageContext, type StageHud, type View } from "./types";

/** Moon gravity (m/s²). */
const GRAVITY = 1.62;
const LENGTH = 470;
/** Where the flag goes (m). */
const FLAG_X = 448;
/** How long planting the flag takes (s). */
const PLANT_TIME = 1.4;

/*
 * Stage 4, Grow: the Moon. Low gravity turns every crater rim into a jump; the thrusters carry
 * the car a long way. Collect the cells, stop near the summit, get out, and plant the flag:
 * the idea has grown into something that stands on its own.
 */
export class Grow implements Stage {
  readonly id = "grow" as const;
  private readonly terrain = new MoonTerrain(23, LENGTH);
  private readonly scene = new MoonScene(this.terrain);
  private readonly camera = new FollowCamera(480, 270);
  private readonly crew: Crew;
  private readonly cells: Pickups;
  private readonly sprites = { cell: CELL(), pole: FLAG_POLE() };
  private planting = -1;
  private wreck = false;
  private width = 480;
  private height = 270;
  fade = 0;

  constructor(private readonly context: StageContext, look: ExplorerId) {
    const explorer = new Explorer(4, this.terrain, look, context.audio, context.particles);
    const car = new Car(6, this.terrain, context.audio, context.particles);
    this.crew = new Crew(explorer, car, this.terrain, context.audio);
    this.crew.seat();
    const points: [number, number][] = [];
    for (let x = 30; x < FLAG_X - 10; x += 26) points.push([x, this.terrain.height(x) + (x % 52 === 4 ? 6 : 1.4)]);
    this.cells = new Pickups(points);
    this.camera.snap(6, this.terrain.height(6), this.terrain.height(6));
  }

  get collected(): number {
    return this.cells.taken;
  }

  get available(): number {
    return this.cells.items.length;
  }

  get cleanLandings(): number {
    return this.crew.car.cleanLandings;
  }

  get complete(): boolean {
    return this.planting >= PLANT_TIME;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.setView(width, height);
    this.scene.resize(width, height);
  }

  private get nearFlag(): boolean {
    return this.crew.mode === "foot" && Math.abs(this.crew.explorer.body.x - FLAG_X) < 1.4;
  }

  step(dt: number, input: InputSnapshot): void {
    this.fade = Math.max(0, this.fade - dt * 1.6);
    if (this.planting >= 0) {
      this.planting += dt;
      this.crew.step(dt, GRAVITY, { ...input, move: 0, jumpPressed: false, jumpHeld: false, interactPressed: false }, { board: false, alight: false });
      return;
    }
    if (this.nearFlag && input.interactPressed) {
      this.planting = 0;
      this.context.audio.plant();
      return;
    }
    this.crew.step(dt, GRAVITY, input, { board: true, alight: true });
    this.context.particles.update(dt, this.terrain, GRAVITY);
    const car = this.crew.car.vehicle;
    // The car can't go past the summit.
    if (car.x > LENGTH - 8) {
      car.x = LENGTH - 8;
      car.vx = Math.min(0, car.vx);
    }
    const centre = this.crew.mode === "car" ? { x: car.x, y: car.y } : this.crew.explorer.centre;
    const got = this.cells.collect(centre.x, centre.y, this.crew.mode === "car" ? 1.6 : 0.9);
    if (got > 0) {
      this.context.audio.pickup();
      this.context.score.add(POINTS.cell * got, "Cell", centre.x, centre.y + 1.5);
      car.tank = Math.min(CAR.thrustTank, car.tank + CAR.thrustTank / 3);
    }
    this.context.combo.update(dt, car.grounded);
    scoreCarEvents(this.crew.car.drainEvents(), this.crew.car, this.context);
    // After a wreck, the car is set back on its wheels where it lies.
    if (this.crew.car.wrecked > 0) this.wreck = true;
    else if (this.wreck) {
      this.wreck = false;
      this.crew.car.reset(car.x);
    }
  }

  /** Righted where you are: the car back on its wheels, or the explorer back on their feet. */
  respawn(): void {
    this.context.audio.respawn();
    this.fade = 1;
    if (this.crew.mode === "car") this.crew.car.reset(this.crew.car.vehicle.x);
    else this.crew.explorer.place(this.crew.explorer.body.x);
  }

  draw(view: View, alpha: number): void {
    const { ctx, painter, time, dt } = view;
    const crew = this.crew;
    const target = crew.mode === "car" ? crew.car.vehicle : crew.explorer.body;
    // Follow the target where it's drawn (between physics steps), or it shudders against the scene.
    const tx = target.px + (target.x - target.px) * alpha;
    const ty = target.py + (target.y - target.py) * alpha;
    this.camera.follow(tx, ty, target.vx, this.terrain.height(tx), Math.min(dt, 1 / 20));
    const camera = this.camera.snapped();
    const toScreen = projector(camera, this.width, this.height);

    this.scene.drawBack(ctx, camera);
    this.scene.drawGround(ctx, camera);
    // The flag: a bare pole site until planted, then the Drimin orange unfurling.
    const [fx, fy] = toScreen(FLAG_X, this.terrain.height(FLAG_X));
    if (this.planting >= 0) {
      const rise = Math.min(1, this.planting / (PLANT_TIME * 0.5));
      blit(ctx, this.sprites.pole, fx, fy + Math.round((1 - rise) * 36));
      drawFlag(painter, fx + 2, fy - 41 + Math.round((1 - rise) * 36), Math.max(0, (this.planting - PLANT_TIME * 0.4) / (PLANT_TIME * 0.6)), time);
    } else {
      painter.rect(fx - 3, fy - 1, 7, 1, "#e7e4dc");
      if (Math.sin(time * 4) > 0) glow(ctx, fx, fy - 4, 12, "250, 46, 0", 0.5);
    }
    for (const cell of this.cells.items) {
      if (cell.taken) continue;
      const [x, y] = toScreen(cell.x, cell.y + Math.sin(time * 2.2 + cell.phase) * 0.1);
      glow(ctx, x, y, 11, "103, 211, 255", 0.45);
      blit(ctx, this.sprites.cell, x, y);
    }
    crew.car.draw(ctx, painter, toScreen, alpha, true);
    crew.explorer.draw(ctx, painter, toScreen, alpha, dt, GRAVITY);
    this.context.particles.draw(painter, toScreen, view.frame);
    this.context.score.draw(ctx, toScreen);
  }

  hud(): StageHud {
    const car = this.crew.car.vehicle;
    const driving = this.crew.mode === "car";
    let prompt = "";
    if (this.planting >= 0) prompt = "";
    else if (this.nearFlag) prompt = "E · Plant the flag";
    else if (driving && car.x < 20) prompt = "Low gravity: easy on the thrusters";
    else if (driving && car.x > FLAG_X - 25) prompt = this.crew.canAlight ? "E · Get out and walk to the flag" : "Stop near the flag";
    else if (this.crew.nearDoor) prompt = "E · Get in";
    return {
      prompt,
      speed: driving ? car.speed * 3.6 : null,
      tank: driving ? car.tank / CAR.thrustTank : null,
      altitude: null,
      hearts: null,
      fuel: driving ? this.crew.car.fuelSeconds : null,
      landIn: driving ? this.crew.car.landIn : null,
    };
  }
}
