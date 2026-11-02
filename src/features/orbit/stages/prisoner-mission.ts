/** Deterministic state for the village prison transfer. The caller supplies only live simulation time. */
export type PrisonerMissionPhase =
  | "undiscovered"
  | "key-or-breach"
  | "transporting"
  | "intercept"
  | "escort"
  | "complete";

export type PrisonerRescueMethod = "key" | "breach";

export interface PrisonerMissionConfig {
  prisonX: number;
  keyX: number;
  transferStartSeconds: number;
  transportSpeed: number;
  interceptStopX: number;
  extractionX: number;
  interactionRange: number;
  extractionRange: number;
}

export const DEFAULT_PRISONER_MISSION: Readonly<PrisonerMissionConfig> = {
  prisonX: 85,
  keyX: 55,
  transferStartSeconds: 90,
  transportSpeed: 2.5,
  interceptStopX: 245,
  extractionX: 330,
  interactionRange: 3,
  extractionRange: 5,
};

export interface PrisonerCondition {
  alive: boolean;
  down: boolean;
  x: number;
}

export interface PrisonerMissionSnapshot {
  phase: PrisonerMissionPhase;
  discovered: boolean;
  keyAvailable: boolean;
  keyCarrierDefeated: boolean;
  keyHeld: boolean;
  keyX: number;
  cageOpen: boolean;
  cageX: number;
  secondsRemaining: number;
  objective: string;
}

export interface PrisonerMissionSave extends PrisonerMissionSnapshot {
  elapsed: number;
}

const DISCOVERY_RANGE = 18;
const CAGE_TRANSFER_START = "The Knight is being moved. Intercept the transport.";

/**
 * Owns the mission clock and the physical prison carriage position. All elapsed time comes from
 * `update(dt, ...)`; a paused game passes zero or does not call update at all.
 */
export class PrisonerMission {
  readonly config: Readonly<PrisonerMissionConfig>;
  private elapsed = 0;
  private discovered = false;
  private keyCarrierDefeated = false;
  private keyHeld = false;
  private keyX: number;
  private cageOpen = false;
  private cageX: number;
  private phase: PrisonerMissionPhase = "undiscovered";
  private prisoner: PrisonerCondition = { alive: true, down: false, x: Number.NaN };

  constructor(config: Partial<PrisonerMissionConfig> = {}) {
    this.config = { ...DEFAULT_PRISONER_MISSION, ...config };
    this.validateConfig();
    this.cageX = this.config.prisonX;
    this.keyX = this.config.keyX;
  }

  /** Update once per live fixed simulation step. Queen proximity reveals the prison naturally. */
  update(dt: number, queenX: number): PrisonerMissionSnapshot {
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (Number.isFinite(queenX) && Math.abs(queenX - this.config.prisonX) <= DISCOVERY_RANGE) {
      this.discovered = true;
    }
    if (this.phase === "complete") return this.snapshot();

    if (this.discovered && !this.cageOpen) {
      this.elapsed += safeDt;
      if (this.elapsed >= this.config.transferStartSeconds) {
        // Start moving exactly at the deadline; never teleport from the authored prison location.
        this.phase = "transporting";
        this.cageX = Math.min(
          this.config.interceptStopX,
          this.config.prisonX + (this.elapsed - this.config.transferStartSeconds) * this.config.transportSpeed,
        );
        if (this.cageX >= this.config.interceptStopX) this.phase = "intercept";
      } else {
        this.phase = "key-or-breach";
      }
    } else if (this.cageOpen) {
      this.phase = "escort";
    }

    if (this.phase === "transporting") {
      this.cageX = Math.min(
        this.config.interceptStopX,
        this.config.prisonX + (this.elapsed - this.config.transferStartSeconds) * this.config.transportSpeed,
      );
      if (this.cageX >= this.config.interceptStopX) this.phase = "intercept";
    }
    return this.snapshot();
  }

  /** The key remains available at the carrier's last position after their defeat. */
  markKeyCarrierDefeated(x?: number): void {
    if (this.keyCarrierDefeated) return;
    this.keyCarrierDefeated = true;
    if (x !== undefined && Number.isFinite(x)) this.keyX = x;
  }

  /** Pick up the dropped key; callers use this only after the carrier has been defeated. */
  pickupKey(queenX: number): boolean {
    if (!this.discovered || !this.keyCarrierDefeated || this.keyHeld || this.cageOpen) return false;
    if (Math.abs(queenX - this.keyX) > this.config.interactionRange) return false;
    this.keyHeld = true;
    return true;
  }

  /** Open the prison using the key, or after the caller completes its physical breach action. */
  openCage(method: PrisonerRescueMethod, queenX: number): boolean {
    if (!this.discovered || this.cageOpen || Math.abs(queenX - this.cageX) > this.config.interactionRange) return false;
    if (method === "key" && !this.keyHeld) return false;
    this.cageOpen = true;
    this.phase = "escort";
    return true;
  }

  /** Keep the prisoner position/status synchronized with the existing Mate simulation. */
  updatePrisoner(condition: PrisonerCondition): void {
    this.prisoner = { ...condition };
  }

  /** Extraction only succeeds when the live, conscious prisoner is physically with the queen. */
  extract(queenX: number): boolean {
    if (!this.cageOpen || !this.prisoner.alive || this.prisoner.down) return false;
    const inExtraction = Math.abs(queenX - this.config.extractionX) <= this.config.extractionRange;
    const prisonerAtExtraction = Number.isFinite(this.prisoner.x)
      && Math.abs(this.prisoner.x - this.config.extractionX) <= this.config.extractionRange;
    if (!inExtraction || !prisonerAtExtraction) return false;
    this.phase = "complete";
    return true;
  }

  /** Snapshot suitable for HUD display and checkpoint serialization. */
  snapshot(): PrisonerMissionSnapshot {
    return {
      phase: this.phase,
      discovered: this.discovered,
      keyAvailable: this.keyCarrierDefeated && !this.keyHeld,
      keyCarrierDefeated: this.keyCarrierDefeated,
      keyHeld: this.keyHeld,
      keyX: this.keyX,
      cageOpen: this.cageOpen,
      cageX: this.cageX,
      secondsRemaining: Math.max(0, this.config.transferStartSeconds - this.elapsed),
      objective: this.objective(),
    };
  }

  checkpoint(): PrisonerMissionSave {
    return { ...this.snapshot(), elapsed: this.elapsed };
  }

  /** Restoring a checkpoint preserves the same state and world coordinate without advancing time. */
  restore(save: PrisonerMissionSave): void {
    this.elapsed = Math.max(0, save.elapsed);
    this.discovered = save.discovered;
    this.keyCarrierDefeated = save.keyCarrierDefeated;
    this.keyHeld = save.keyHeld;
    this.keyX = save.keyX;
    this.cageOpen = save.cageOpen;
    this.cageX = Math.max(this.config.prisonX, Math.min(this.config.interceptStopX, save.cageX));
    this.phase = save.phase;
    if (this.cageOpen && this.phase !== "complete") this.phase = "escort";
  }

  restart(): void {
    this.elapsed = 0;
    this.discovered = false;
    this.keyCarrierDefeated = false;
    this.keyHeld = false;
    this.keyX = this.config.keyX;
    this.cageOpen = false;
    this.cageX = this.config.prisonX;
    this.phase = "undiscovered";
    this.prisoner = { alive: true, down: false, x: Number.NaN };
  }

  private objective(): string {
    if (this.phase === "undiscovered") return "MISSION · Find the prison and free the Knight.";
    if (this.phase === "key-or-breach") {
      return this.keyHeld
        ? "MISSION · Reach the prison and unlock the Knight's cage."
        : this.keyCarrierDefeated
          ? "MISSION · Recover the key or breach the cage."
          : "MISSION · Defeat the key carrier and recover the key, or breach the cage.";
    }
    if (this.phase === "transporting") return CAGE_TRANSFER_START;
    if (this.phase === "intercept") return "MISSION · Transport stopped ahead. Intercept it and free the Knight.";
    if (this.phase === "escort") {
      if (!this.prisoner.alive) return "MISSION · Knight lost. Restart from the checkpoint to recover the mission.";
      if (this.prisoner.down) return "MISSION · Knight down. Help them up, then escort to extraction.";
      return "MISSION · Escort the Knight to extraction.";
    }
    return "MISSION · Knight extracted safely.";
  }

  private validateConfig(): void {
    const values = Object.values(this.config);
    if (values.some((value) => !Number.isFinite(value))) throw new Error("Prisoner mission coordinates and timings must be finite.");
    if (this.config.transferStartSeconds < 0 || this.config.transportSpeed < 0 || this.config.interactionRange < 0 || this.config.extractionRange < 0) {
      throw new Error("Prisoner mission durations, speeds, and ranges cannot be negative.");
    }
    if (this.config.interceptStopX < this.config.prisonX) throw new Error("The transport stop must be at or beyond the prison.");
  }
}
