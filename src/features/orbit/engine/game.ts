import { MAX_HEARTS } from "../actors/explorer";
import { Combo, POINTS, Score } from "../actors/score";
import { Painter } from "../pixel/painter";
import { Particles } from "../pixel/particles";
import type { ExplorerId } from "../pixel/explorer-sprite";
import { RoadStage } from "../stages/road";
import { CITY_RUN, FOREST_RUN, VILLAGE_RUN } from "../stages/routes";
import { STAGE_ORDER, STAGE_TITLES, type Stage, type StageContext, type StageFx, type StageId } from "../stages/types";
import { GameAudio } from "./audio";
import { ART, MAX_STEPS, SIM_HZ, VIEW_MIN } from "./config";
import { Input, type InputSnapshot } from "./input";

export type Phase = "title" | "intro" | "play" | "paused" | "complete" | "finished";
export type Command = "start" | "continue" | "again" | "resume" | "restart-stage" | "quit";

/** DOM the game writes to directly (never React state per frame). */
export interface Hud {
  root: HTMLElement;
  /** Every element marked data-hud="name" inside root (a value can show in several places). */
  fields(name: string): Iterable<HTMLElement>;
}

/**
 * Camera zoom: how close it sits when slow, the speed (km/h) where it's fully opened out, the
 * spring (1/s) that carries it, how hard a punch of strength 1 kicks it, and the closest it gets.
 */
const ZOOM = { close: 1.07, fullSpeed: 110, omega: 9, punch: 9, max: 1.25 } as const;
const STEP = 1 / SIM_HZ;
/** How long a stage card stays up before play starts on its own (s). */
const INTRO_TIME = 2.6;
/** Pause after reaching a goal before the reward card (s): let the moment land. */
const COMPLETE_DELAY = 0.9;
/** Finishing fast pays: points per second under PAR at the end of the run. */
const PAR_SECONDS = 600;
const TIME_BONUS_PER_SECOND = 5;
const BEST_TIME = "drimin:orbit-best";
const BEST_SCORE = "drimin:orbit-best-score";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function readNumber(key: string): number | null {
  try {
    const value = Number(localStorage.getItem(key));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage blocked: the record just isn't remembered.
  }
}

/*
 * Idea to Orbit: the whole journey. Owns the loop (fixed 120 Hz simulation, interpolated
 * drawing on its own rAF, paused in hidden tabs), the order of the stages (basecamp training,
 * the forest on foot, the drive into the city, the launch, the Moon), the cards between them,
 * pause and checkpoint controls, the run's timer and score, and the HUD.
 */
export class Game {
  readonly input = new Input();
  readonly audio = new GameAudio();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly painter: Painter;
  private readonly still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private readonly score = new Score();
  private readonly combo = new Combo();
  /** The current stage (read-only from outside; for QA tools). */
  get current(): Stage {
    return this.stage;
  }
  private stage: Stage;
  private stageIndex = 0;
  /** Score when the current stage began (restarting the stage rolls back to it). */
  private stageStartScore = 0;
  private look: ExplorerId = "female";
  private phase: Phase = "title";
  private phaseTime = 0;
  private runTime = 0;
  private totals = { collected: 0, available: 0, landings: 0 };
  private width: number = VIEW_MIN.width;
  private height: number = VIEW_MIN.height;
  private accumulator = 0;
  private time = 0;
  private frame = 0;
  /** Camera zoom (1 = the normal view), its spring velocity, and the sim's time scale for slow motion. */
  private zoom = 1;
  private zoomVelocity = 0;
  private timeScale = 1;
  private slowFor = 0;
  private slowScale = 1;
  private focusZoom = 0;
  /* Effects the stages ask for at big moments; reduced motion turns them off. */
  private readonly fx: StageFx = {
    punch: (strength) => {
      if (!this.still) this.zoomVelocity += strength * ZOOM.punch;
    },
    buzz: (ms) => {
      // Phones only, once the player has touched the screen: browsers refuse vibration before a tap.
      if (!this.still && this.tapped) navigator.vibrate?.(ms);
    },
    focus: (zoom) => {
      if (!this.still) this.focusZoom = Math.max(this.focusZoom, zoom);
    },
    slowmo: (seconds, scale = 0.35) => {
      if (this.still) return;
      this.slowFor = Math.max(this.slowFor, seconds);
      this.slowScale = scale;
    },
  };
  private frameDt = 1 / 60;
  private raf = 0;
  private last = 0;
  private running = false;

  /** Called after every drawn frame (the GPU glow pass hooks in here). */
  onFrame: (() => void) | null = null;
  /**
   * Hosts the 3D arena (the page sets it): called with how to finish; returns false to decline,
   * in which case the fight stays in 2D. While it's open the game is paused.
   */
  onArena: ((finish: (won: boolean) => void) => boolean) | null = null;
  private arenaOpen = false;
  /** Phones and tablets: prompts name the on-screen pads instead of keys. */
  private readonly touch = matchMedia("(pointer: coarse)").matches;
  private tapped = false;
  private readonly onTap = (event: PointerEvent): void => {
    if (event.pointerType === "touch") this.tapped = true;
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hud: Hud,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    this.painter = new Painter(ctx);
    this.stage = this.makeStage("village");
    this.writeBest();
  }

  // ---- lifecycle ------------------------------------------------------------

  start(): void {
    this.input.attach();
    document.addEventListener("visibilitychange", this.onVisibility);
    if (this.touch) window.addEventListener("pointerdown", this.onTap, { passive: true });
    this.setPhase("title");
    this.resume();
  }

  stop(): void {
    this.pause();
    this.input.detach();
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pointerdown", this.onTap);
    this.stage.dispose?.();
    this.audio.dispose();
  }

  /** CSS size of the container and the device pixel ratio. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const devW = cssWidth * dpr;
    const devH = cssHeight * dpr;
    // Keep the framing of the classic whole-number scale (device pixels per art pixel), then split
    // it into ART fine pixels per art pixel, rounding to the nearest whole screen-pixel scale.
    const framing = Math.max(1, Math.floor(Math.min(devW / VIEW_MIN.width, devH / VIEW_MIN.height)));
    const scale = Math.max(1, Math.round(framing / ART));
    const pixelsW = Math.ceil(devW / scale);
    const pixelsH = Math.ceil(devH / scale);
    this.width = pixelsW / ART;
    this.height = pixelsH / ART;
    this.canvas.width = pixelsW;
    this.canvas.height = pixelsH;
    this.canvas.style.width = `${(pixelsW * scale) / dpr}px`;
    this.canvas.style.height = `${(pixelsH * scale) / dpr}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.stage.resize(this.width, this.height);
    this.draw(1);
  }

  /** From the overlay buttons; the keyboard does the same through `flow`. */
  command(command: Command): void {
    this.audio.unlock();
    switch (command) {
      case "start":
        if (this.phase === "title") this.beginStage(0);
        break;
      case "continue":
        if (this.phase === "complete") this.next();
        else if (this.phase === "intro") this.setPhase("play");
        break;
      case "again":
        if (this.phase === "finished") this.restartRun();
        break;
      case "resume":
        if (this.phase === "paused") this.setPhase("play");
        break;
      case "restart-stage":
        if (this.phase === "paused") {
          this.score.total = this.stageStartScore;
          this.stage = this.makeStage(this.stage.id);
          this.setPhase("intro");
        }
        break;
      case "quit":
        this.runTime = 0;
        this.score.total = 0;
        this.totals = { collected: 0, available: 0, landings: 0 };
        this.stage = this.makeStage("village");
        this.setPhase("title");
        break;
    }
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === "hidden") {
      this.pause();
      if (this.phase === "play") this.setPhase("paused");
    } else if (!this.arenaOpen) {
      this.resume();
    }
  };

  /* A stage hands a fight to the 3D arena: the game holds still until the arena reports back. */
  private requestArena(done: (won: boolean) => void): boolean {
    if (!this.onArena || this.arenaOpen) return false;
    const accepted = this.onArena((won) => {
      this.holdForArena(false);
      done(won);
    });
    if (accepted) this.holdForArena(true);
    return accepted;
  }

  /** The 3D arena is over the game: hold everything, and stop listening to keys, until it closes. */
  holdForArena(open: boolean): void {
    if (open === this.arenaOpen) return;
    this.arenaOpen = open;
    if (open) {
      this.pause();
      this.input.detach();
    } else {
      this.input.attach();
      this.resume();
    }
  }

  private resume(): void {
    if (this.running) return;
    this.running = true;
    this.audio.resume();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.audio.suspend();
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const elapsed = Math.min((now - this.last) / 1000, MAX_STEPS * STEP);
    this.last = now;
    // Slow motion: the simulation runs on scaled time, easing back to full speed afterwards.
    if (this.slowFor > 0) {
      this.slowFor = Math.max(0, this.slowFor - elapsed);
      this.timeScale = this.slowScale;
    } else {
      this.timeScale += (1 - this.timeScale) * Math.min(1, elapsed * 5);
    }
    this.accumulator += elapsed * this.timeScale;
    let input = this.input.read();
    this.flow(input, elapsed);
    let steps = 0;
    while (this.accumulator >= STEP && steps < MAX_STEPS) {
      if (this.phase === "play" || this.phase === "complete") {
        this.stage.step(STEP, input);
        this.score.update(STEP);
      }
      // Presses go to the first step only; held state applies to every step.
      input = { ...input, flipPressed: 0, jumpPressed: false, interactPressed: false, switchPressed: false, planetPressed: false, attackPressed: false, resetPressed: false, pausePressed: false };
      this.accumulator -= STEP;
      steps++;
    }
    this.time += elapsed;
    this.frameDt = Math.max(1 / 240, elapsed);
    this.frame++;
    this.draw(this.accumulator / STEP);
    this.onFrame?.();
    // The HUD at ~20 Hz: each write restyles the overlay, which phones feel; bars ease between writes in CSS.
    if (this.frame % 3 === 0 || this.phase !== "play") this.writeHud();
    const hud = this.stage.hud();
    const playing = this.phase === "play";
    this.audio.update({ driving: playing && hud.speed !== null, speed: (hud.speed ?? 0) / 3.6, throttle: input.move, thrust: input.jumpHeld && hud.speed !== null && playing ? 1 : 0, combat: playing && hud.combat === true });
    this.raf = requestAnimationFrame(this.tick);
  };

  // ---- the journey ------------------------------------------------------------

  private makeStage(id: StageId): Stage {
    // The stage being replaced lets go of anything outside the canvas (the 3D stage's WebGL context).
    (this.stage as Stage | undefined)?.dispose?.();
    this.combo.break();
    const context: StageContext = { audio: this.audio, particles: new Particles(), still: this.still, score: this.score, combo: this.combo, fx: this.fx, arena: { request: (done) => this.requestArena(done) } };
    const route = id === "village" ? VILLAGE_RUN : id === "city" ? CITY_RUN : FOREST_RUN;
    const stage = new RoadStage(context, this.look, route);
    stage.resize(this.width, this.height);
    return stage;
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
    const root = this.hud.root;
    root.dataset.phase = phase;
    root.dataset.stage = this.stage.id;
    if (phase !== "complete") delete root.dataset.reward;
    const title = STAGE_TITLES[this.stage.id];
    this.text("stage-number", title.number);
    this.text("stage-title", title.title);
    this.text("stage-goal", title.goal);
    if (phase === "complete") {
      this.score.total += POINTS.stageClear;
      this.text("stage-found", `${this.stage.collected} / ${this.stage.available}`);
      this.text("stage-bonus", `+${POINTS.stageClear}`);
    }
    if (phase === "finished") this.finish();
  }

  private beginStage(index: number): void {
    this.stageIndex = index;
    const id = STAGE_ORDER[index];
    // The title screen already shows a fresh first stage: keep it rather than rebuild it.
    if (this.stage.id !== id || this.stage.complete || index > 0) this.stage = this.makeStage(id);
    this.stageStartScore = this.score.total;
    this.setPhase("intro");
  }

  private next(): void {
    const stage = this.stage;
    this.totals.collected += stage.collected;
    this.totals.available += stage.available;
    this.totals.landings += stage.cleanLandings;
    if (this.stageIndex + 1 < STAGE_ORDER.length) this.beginStage(this.stageIndex + 1);
    else this.setPhase("finished");
  }

  private restartRun(): void {
    this.totals = { collected: 0, available: 0, landings: 0 };
    this.runTime = 0;
    this.score.total = 0;
    this.stage = this.makeStage("village");
    this.beginStage(0);
  }

  /** Phase changes driven by time and by the keyboard outside of play. */
  private flow(input: InputSnapshot, dt: number): void {
    this.phaseTime += dt;
    const advance = input.jumpPressed || input.interactPressed;
    switch (this.phase) {
      case "title":
        if (advance) this.command("start");
        break;
      case "intro":
        if (this.phaseTime > INTRO_TIME || (advance && this.phaseTime > 0.3)) this.setPhase("play");
        break;
      case "play":
        this.runTime += dt;
        if (input.pausePressed) this.setPhase("paused");
        else if (input.resetPressed) this.stage.respawn();
        else if (this.stage.complete) this.setPhase("complete");
        break;
      case "paused":
        if (input.pausePressed || (advance && this.phaseTime > 0.2)) this.setPhase("play");
        break;
      case "complete":
        if (this.phaseTime > COMPLETE_DELAY) this.hud.root.dataset.reward = this.stage.id;
        if (advance && this.phaseTime > COMPLETE_DELAY + 0.3) this.next();
        break;
      case "finished":
        if (input.interactPressed && this.phaseTime > 1) this.command("again");
        break;
    }
  }

  private finish(): void {
    const timeBonus = Math.max(0, Math.round((PAR_SECONDS - this.runTime) * TIME_BONUS_PER_SECOND));
    this.score.total += timeBonus;
    const bestTime = readNumber(BEST_TIME);
    const bestScore = readNumber(BEST_SCORE);
    const newBest = bestScore === null || this.score.total > bestScore;
    if (bestTime === null || this.runTime < bestTime) writeNumber(BEST_TIME, this.runTime);
    if (newBest) writeNumber(BEST_SCORE, this.score.total);
    this.text("total-time", formatTime(this.runTime));
    this.text("total-score", this.score.total.toLocaleString("en"));
    this.text("time-bonus", `+${timeBonus.toLocaleString("en")}`);
    this.text("total-found", `${this.totals.collected} / ${this.totals.available}`);
    this.text("total-landings", String(this.totals.landings));
    this.hud.root.dataset.newBest = newBest ? "true" : "false";
    this.audio.complete();
    this.writeBest();
  }

  private writeBest(): void {
    const time = readNumber(BEST_TIME);
    const score = readNumber(BEST_SCORE);
    this.text("best", time === null ? "—" : formatTime(time));
    this.text("best-score", score === null ? "—" : score.toLocaleString("en"));
  }

  // ---- drawing and HUD ---------------------------------------------------------

  private draw(alpha: number): void {
    const ctx = this.ctx;
    // Zoom: a little closer when slow, opening out with speed and in the air; punches spring in
    // and settle (critically damped). Scaled about a point just below the middle, never under 1×.
    const hud = this.stage.hud();
    const fast = Math.min(1, (hud.speed ?? 0) / ZOOM.fullSpeed);
    const travel = this.phase === "play" && hud.landIn === null ? ZOOM.close - (ZOOM.close - 1) * fast : 1;
    // A fight on foot pulls the camera in close.
    const target = Math.max(travel, this.focusZoom);
    this.focusZoom = 0;
    const dt = Math.min(this.frameDt, 1 / 20);
    this.zoomVelocity += (ZOOM.omega * ZOOM.omega * (target - this.zoom) - 2 * ZOOM.omega * this.zoomVelocity) * dt;
    this.zoom = Math.max(1, Math.min(ZOOM.max, this.zoom + this.zoomVelocity * dt));
    const z = this.zoom;
    const cx = this.width / 2;
    const cy = this.height * 0.56;
    ctx.setTransform(ART * z, 0, 0, ART * z, ART * cx * (1 - z), ART * cy * (1 - z));
    ctx.imageSmoothingEnabled = false;
    this.stage.draw({ ctx, painter: this.painter, width: this.width, height: this.height, time: this.time, frame: this.frame, dt: this.frameDt }, alpha);
    ctx.setTransform(ART, 0, 0, ART, 0, 0);
    if (this.stage.fade > 0) {
      ctx.fillStyle = `rgba(4, 4, 10, ${this.stage.fade})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private text(name: string, value: string): void {
    for (const el of this.hud.fields(name)) if (el.textContent !== value) el.textContent = value;
  }

  private set(name: string, value: string): void {
    if (this.hud.root.dataset[name] !== value) this.hud.root.dataset[name] = value;
  }

  private writeHud(): void {
    const hud = this.stage.hud();
    const root = this.hud.root;
    this.text("prompt", this.phase === "play" ? (this.touch ? touchPrompt(hud.prompt) : hud.prompt) : "");
    // The subtitle: the speaker's name and their line, while it's being said.
    this.set("line", hud.line ? "on" : "off");
    this.text("line-who", hud.line?.who ?? "");
    this.text("line-text", hud.line?.text ?? "");
    this.text("time", formatTime(this.runTime));
    this.text("score", this.score.total.toLocaleString("en"));
    this.set("vehicle", hud.speed === null ? "none" : hud.altitude !== null ? "flight" : "car");
    if (hud.speed !== null) this.text("speed", String(Math.round(hud.speed)));
    if (hud.altitude !== null) {
      this.text("altitude", String(Math.round(hud.altitude)));
      this.text("alt-label", hud.altitudeLabel ?? "ALT");
    }
    root.style.setProperty("--tank", (hud.tank ?? 1).toFixed(3));
    this.set("hearts", hud.hearts === null ? "none" : String(hud.hearts));
    if (hud.hearts !== null) this.text("hearts", "♥".repeat(hud.hearts) + "♡".repeat(Math.max(0, MAX_HEARTS - hud.hearts)));
    if (hud.fuel !== null) this.text("fuel", `${hud.fuel.toFixed(1)}s`);
    this.set("airborne", hud.landIn === null ? "false" : "true");
    this.set("actions", hud.actions ? "true" : "false");
    root.style.setProperty("--hull", (1 - (hud.damage ?? 0)).toFixed(3));
    this.set("hull", (hud.damage ?? 0) > 0.6 ? "low" : "ok");
    // Booster charges as pips: filled for each in hand.
    if (hud.boosters) this.text("boosters", "◆".repeat(hud.boosters.have) + "◇".repeat(Math.max(0, hud.boosters.max - hud.boosters.have)));
    this.set("boosters", hud.boosters ? String(hud.boosters.have) : "none");
    if (hud.landIn !== null) this.text("land-in", `${hud.landIn.toFixed(1)}s`);
    // The combo: multiplier and its drain bar.
    this.set("combo", this.combo.chain > 0 ? "on" : "off");
    this.text("combo", `×${this.combo.multiplier}`);
    root.style.setProperty("--combo", this.combo.remaining.toFixed(3));
  }
}

/** Stage prompts are written for keys; on touch they name the pads (▲ thrusters, ◀ ▶, E, ⚔ sword). */
function touchPrompt(prompt: string): string {
  return prompt.replace(/Space/g, "▲").replace(/← →/g, "◀ ▶").replace(/→/g, "▶").replace(/F ·/g, "⚔ ·");
}
