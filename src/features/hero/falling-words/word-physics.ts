import type Matter from "matter-js";
import { fallingWords } from "@/lib/motion/tokens";

type MatterModule = typeof Matter;

interface FallingBody {
  body: Matter.Body;
  ghost: HTMLElement;
  width: number;
  height: number;
}

const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 4;

let matterPromise: Promise<MatterModule> | null = null;

/** Loads matter-js once, on first need (never part of the initial bundle). */
export function loadMatter(): Promise<MatterModule> {
  matterPromise ??= import("matter-js").then((mod) => (mod.default ?? mod) as MatterModule);
  return matterPromise;
}

function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/*
 * Drops words as physical bodies. Each dropped word is replaced by a "ghost" copy in an
 * absolutely positioned layer; the engine moves the ghost by writing `transform` only.
 * Words land on the floor element's top edge and pile up between two side walls.
 * The loop stops once every body sleeps.
 */
export class WordPhysics {
  private matter: MatterModule | null = null;
  private engine: Matter.Engine | null = null;
  private bounds: Matter.Body[] = [];
  private bodies: FallingBody[] = [];
  private frame = 0;
  private lastTime = 0;
  private accumulator = 0;

  constructor(
    private readonly layer: HTMLElement,
    private readonly getFloor: () => HTMLElement | null,
    private readonly getWalls: () => HTMLElement,
    private readonly ghostClassName: string,
  ) {}

  /** Starts loading the engine early (e.g. on pointer enter), so the first drop is instant. */
  warm(): void {
    void loadMatter();
  }

  async drop(word: HTMLElement): Promise<void> {
    const matter = await this.ensureEngine();
    const layerRect = this.layer.getBoundingClientRect();
    const rect = word.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const x = rect.left - layerRect.left;
    const y = rect.top - layerRect.top;

    const ghost = document.createElement("span");
    ghost.className = this.ghostClassName;
    ghost.textContent = word.textContent;
    ghost.style.width = `${width}px`;
    ghost.style.height = `${height}px`;
    ghost.style.transform = `translate(${x}px, ${y}px)`;
    this.layer.append(ghost);

    const body = matter.Bodies.rectangle(x + width / 2, y + height / 2, width, height, {
      chamfer: { radius: Math.min(height * 0.25, 8) },
      restitution: fallingWords.restitution,
      friction: fallingWords.friction,
      frictionAir: fallingWords.frictionAir,
    });
    // A small hop and spin, as if the word was flicked off its line.
    matter.Body.setVelocity(body, {
      x: random(-1.2, 1.2),
      y: -random(0.5, 1) * fallingWords.hopVelocity,
    });
    matter.Body.setAngularVelocity(body, random(-1, 1) * fallingWords.spin);
    matter.Composite.add(this.engine!.world, body);
    this.bodies.push({ body, ghost, width, height });
    this.start();
  }

  /** Fades the ghosts away and clears the world. Resolves when they're gone. */
  async clear(animate: boolean): Promise<void> {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    const ghosts = this.bodies.map(({ ghost }) => ghost);
    if (this.engine && this.matter) {
      for (const { body } of this.bodies) this.matter.Composite.remove(this.engine.world, body);
    }
    this.bodies = [];
    if (animate) {
      await Promise.all(
        ghosts.map(
          (ghost) =>
            ghost.animate(
              [{ opacity: 1 }, { opacity: 0, translate: "0 -0.4em" }],
              { duration: 260, easing: "ease-out", fill: "forwards" },
            ).finished,
        ),
      );
    }
    for (const ghost of ghosts) ghost.remove();
  }

  destroy(): void {
    void this.clear(false);
    if (this.engine && this.matter) this.matter.Engine.clear(this.engine);
    this.engine = null;
  }

  private async ensureEngine(): Promise<MatterModule> {
    const matter = (this.matter ??= await loadMatter());
    if (!this.engine) {
      this.engine = matter.Engine.create({
        gravity: { x: 0, y: fallingWords.gravity },
        enableSleeping: true,
      });
    }
    this.placeBounds();
    return matter;
  }

  /* Floor at the floor element's top; walls at the content edges (the gutters). Rebuilt
     per drop so it follows layout changes (resizes reset the scene from the component). */
  private placeBounds(): void {
    const matter = this.matter!;
    const world = this.engine!.world;
    for (const body of this.bounds) matter.Composite.remove(world, body);

    const layerRect = this.layer.getBoundingClientRect();
    const wallsRect = this.getWalls().getBoundingClientRect();
    const floorRect = this.getFloor()?.getBoundingClientRect();
    const floorY = (floorRect ? floorRect.top : layerRect.bottom) - layerRect.top;
    // Gutters are symmetric, so the right wall mirrors the left one.
    const left = wallsRect.left - layerRect.left;
    const right = layerRect.width - left;
    const thickness = 400;
    const height = layerRect.height * 3;

    this.bounds = [
      matter.Bodies.rectangle(layerRect.width / 2, floorY + thickness / 2, layerRect.width * 2, thickness, { isStatic: true }),
      matter.Bodies.rectangle(left - thickness / 2, floorY - height / 2, thickness, height, { isStatic: true }),
      matter.Bodies.rectangle(right + thickness / 2, floorY - height / 2, thickness, height, { isStatic: true }),
    ];
    matter.Composite.add(world, this.bounds);
  }

  private start(): void {
    if (this.frame) return;
    this.lastTime = 0;
    this.accumulator = 0;
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (time: number): void => {
    const engine = this.engine;
    if (!engine || !this.matter) return;
    this.accumulator += this.lastTime ? Math.min(time - this.lastTime, STEP_MS * MAX_STEPS_PER_FRAME) : STEP_MS;
    this.lastTime = time;
    // Fixed steps keep stacking stable regardless of frame rate.
    while (this.accumulator >= STEP_MS) {
      this.matter.Engine.update(engine, STEP_MS);
      this.accumulator -= STEP_MS;
    }

    let awake = false;
    for (const { body, ghost, width, height } of this.bodies) {
      const { x, y } = body.position;
      ghost.style.transform = `translate(${(x - width / 2).toFixed(2)}px, ${(y - height / 2).toFixed(2)}px) rotate(${body.angle.toFixed(4)}rad)`;
      if (!body.isSleeping) awake = true;
    }
    this.frame = awake ? requestAnimationFrame(this.tick) : 0;
  };
}
