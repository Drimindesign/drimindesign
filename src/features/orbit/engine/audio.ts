/*
 * Every sound in the game, generated live with Web Audio: no sound files. The context is
 * created on the first pointer or key press (browsers block audio before a gesture).
 *
 * The mix is built to be easy on the ears: everything runs through a soft compressor and a
 * gentle high cut, with a send to a small generated room reverb so sounds bloom instead of
 * snapping. Continuous sounds follow the simulation through setTargetAtTime (they glide, never
 * click); one-shots have 10–25 ms attacks and smooth tails; tones are sines and triangles
 * tuned to one pentatonic scale, so overlapping sounds stay consonant.
 */

export interface AudioState {
  /** Someone is in the car. */
  driving: boolean;
  /** Car speed (m/s). */
  speed: number;
  /** -1 … 1. */
  throttle: number;
  /** Thruster output (0 … 1). */
  thrust: number;
  /** A fight is on (the combat music takes over). */
  combat: boolean;
}

const MASTER = 0.65;
/** Background music level: low, under the effects (it dips a little more while the thrusters fire). */
const MUSIC = 0.13;
/** "Skylines" by Alex-Productions (chosic.com), re-encoded at 96 kb/s; streamed, not decoded whole. */
const MUSIC_URL = "/audio/skylines.mp3";
/** The combat track (Pixabay licence), and how loud it plays over a fight. */
const FIGHT_URL = "/audio/fight.mp3";
const FIGHT = 0.16;
/** After the last blow the fight music holds this long (s) before the driving music returns. */
const FIGHT_HOLD = 4;
/** Recorded sounds (Pixabay licence), decoded once: the sword's slice. */
const SLICE_URL = "/audio/sword-slice.mp3";
/**
 * The electric motor, matched to a recording of the truck accelerating: two soft tones, the low
 * one from ~450 Hz and its octave, both rising gently with speed, heard only under acceleration.
 */
const MOTOR = { base: 450, perMetrePerSecond: 7, level: 0.02 } as const;
/** A major pentatonic on C (Hz): pickups, chimes and the finish all draw from it. */
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51] as const;

interface Bus {
  /** Dry path into the compressor. */
  dry: GainNode;
  /** Send into the reverb. */
  wet: GainNode;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: Bus | null = null;
  private noise: AudioBuffer | null = null;
  private thrust: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private muted = false;
  private music: { element: HTMLAudioElement; gain: GainNode } | null = null;
  private fight: { element: HTMLAudioElement; gain: GainNode } | null = null;
  private fightLeft = 0;
  private slice: AudioBuffer | null = null;
  private motor: { low: OscillatorNode; high: OscillatorNode; gain: GainNode } | null = null;
  /** Spoken lines, decoded on first use. */
  private readonly voices = new Map<string, Promise<AudioBuffer | null>>();
  private lastPickup = 0;
  private rainLoop: GainNode | null = null;
  private pickupStep = 0;

  get isMuted(): boolean {
    return this.muted;
  }

  /** Creates the audio graph; call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const ctx = new Context();
    this.ctx = ctx;

    // Master: soft compressor (glues the mix, no pumping) and a high cut that takes the edge off.
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.25;
    const air = ctx.createBiquadFilter();
    air.type = "lowpass";
    air.frequency.value = 9000;
    air.Q.value = 0.5;
    compressor.connect(air).connect(this.master).connect(ctx.destination);

    // A small dark room: a stereo impulse of decaying, low-passed noise.
    const reverb = ctx.createConvolver();
    reverb.buffer = roomImpulse(ctx, 1.8);
    const reverbLevel = ctx.createGain();
    reverbLevel.gain.value = 0.35;
    reverb.connect(reverbLevel).connect(compressor);
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    dry.connect(compressor);
    wet.connect(reverb);
    this.bus = { dry, wet };

    // Two seconds of soft (pink-ish) noise, shared by every noisy sound.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029591;
      b1 = 0.985 * b1 + white * 0.032534;
      b2 = 0.95 * b2 + white * 0.048056;
      data[i] = (b0 + b1 + b2 + white * 0.05) * 1.6;
    }
    this.noise = noise;

    this.buildThrust(ctx);
    this.buildMusic(ctx);
    this.buildMotor(ctx);
    void this.decode(SLICE_URL).then((buffer) => {
      this.slice = buffer;
    });
  }

  /** Fetches and decodes a short recorded sound (null if it fails). */
  private async decode(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const response = await fetch(url);
      return await this.ctx.decodeAudioData(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  /** Plays a decoded buffer through the mix, at a rate and level. */
  private sample(buffer: AudioBuffer, rate: number, level: number, wet = 0.2): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(gain);
    this.send(gain, wet);
    source.start();
  }

  /** A spoken line (a small recorded file under /audio/voice/), with the music dipped under it. */
  say(line: string): void {
    if (!this.ctx) return;
    let buffer = this.voices.get(line);
    if (!buffer) {
      buffer = this.decode(`/audio/voice/${line}.mp3`);
      this.voices.set(line, buffer);
    }
    void buffer.then((b) => {
      if (!b || !this.ctx) return;
      this.sample(b, 1, 0.9, 0.12);
      const now = this.ctx.currentTime;
      for (const m of [this.music, this.fight]) m?.gain.gain.setTargetAtTime(0.03, now, 0.08);
      this.duckUntil = now + b.duration;
    });
  }

  private duckUntil = 0;

  /** The tab is hidden or the game stopped: silence everything, music included. */
  suspend(): void {
    this.music?.element.pause();
    this.fight?.element.pause();
    void this.ctx?.suspend();
  }

  resume(): void {
    if (!this.ctx) return;
    void this.ctx.resume();
    void this.music?.element.play().catch(() => undefined);
    if (this.fightLeft > 0) void this.fight?.element.play().catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : MASTER, this.ctx.currentTime, 0.08);
  }

  /** Called every frame with the simulation's state. */
  update(state: AudioState): void {
    const ctx = this.ctx;
    if (!ctx || !this.thrust) return;
    const now = ctx.currentTime;
    // Thrusters: a soft breath of air that swells in and fades out slowly.
    this.thrust.gain.gain.setTargetAtTime(state.thrust * 0.11, now, state.thrust > 0 ? 0.12 : 0.25);
    this.thrust.filter.frequency.setTargetAtTime(700 + state.thrust * 500, now, 0.15);
    // The motor whine: only while accelerating, rising with speed (matched to the real truck).
    if (this.motor) {
      const pitch = MOTOR.base + Math.abs(state.speed) * MOTOR.perMetrePerSecond;
      this.motor.low.frequency.setTargetAtTime(pitch, now, 0.2);
      this.motor.high.frequency.setTargetAtTime(pitch * 2.03, now, 0.2);
      const pulling = state.driving && state.throttle > 0 ? state.throttle * (0.4 + Math.min(1, Math.abs(state.speed) / 25) * 0.6) : 0;
      this.motor.gain.gain.setTargetAtTime(pulling * MOTOR.level, now, pulling > 0 ? 0.3 : 0.5);
    }
    // Music: the fight track takes over while blows are flying, then hands back; voices dip both.
    if (state.combat) this.fightLeft = FIGHT_HOLD;
    else this.fightLeft = Math.max(0, this.fightLeft - 1 / 60);
    if (this.fightLeft > 0 && !this.fight) this.buildFight(ctx);
    if (now < this.duckUntil) return;
    const fighting = this.fightLeft > 0;
    this.music?.gain.gain.setTargetAtTime(fighting ? 0 : MUSIC * (1 - state.thrust * 0.35), now, fighting ? 0.5 : 1.2);
    this.fight?.gain.gain.setTargetAtTime(fighting ? FIGHT : 0, now, fighting ? 0.5 : 1.5);
  }

  footstep(): void {
    this.whoosh({ duration: 0.08, from: 900, to: 600, q: 0.8, gain: 0.07, attack: 0.008 });
  }

  jump(): void {
    this.whoosh({ duration: 0.25, from: 400, to: 1100, q: 0.7, gain: 0.07 });
  }

  /** A soft, round touchdown. `force` 0 … 1. */
  land(force = 0.5): void {
    this.thump(85, 42, 0.18 + force * 0.25, 0.28);
    this.whoosh({ duration: 0.16, from: 700, to: 300, q: 0.6, gain: 0.04 + force * 0.06 });
  }

  door(): void {
    this.thump(180, 120, 0.08, 0.08);
    this.thump(140, 90, 0.07, 0.08, 0.1);
  }

  /** The thrusters lighting: a light, airy puff that swells in and blooms into the room. */
  ignition(): void {
    this.whoosh({ duration: 0.5, from: 600, to: 1300, q: 0.5, gain: 0.07, attack: 0.06, wet: 0.5 });
  }

  /** The blade cutting the air: the recorded slice, pitched a little each time; heavier blows lower and louder. */
  swing(heavy = false): void {
    if (this.slice) this.sample(this.slice, (heavy ? 0.85 : 1) * (0.94 + Math.random() * 0.14), heavy ? 0.55 : 0.38);
    else this.whoosh({ duration: 0.18, from: 500, to: 2000, q: 1, gain: 0.08 });
  }

  /** A blow landing on a body: a dull, heavy thud with a slap of cloth. */
  thwack(): void {
    this.thump(150, 70, 0.26, 0.16);
    this.whoosh({ duration: 0.09, from: 900, to: 400, q: 1.1, gain: 0.09, attack: 0.003 });
  }

  /** A blade biting into wood (crates, barricades): a dry crack and splinters. */
  crack(): void {
    this.whoosh({ duration: 0.06, from: 2600, to: 1400, q: 3, gain: 0.12, attack: 0.001 });
    this.thump(220, 120, 0.14, 0.08);
  }

  /** A blade caught on a shield: a dull wooden knock under a short iron ring. */
  shield(): void {
    this.thump(110, 60, 0.3, 0.14);
    this.bell(680 + Math.random() * 140, 0.045, 0, 0.32);
    this.whoosh({ duration: 0.07, from: 1800, to: 900, q: 1.5, gain: 0.06, attack: 0.002 });
  }

  /** Thunder: a long low rumble that rolls in and away. `strength` 0 … 1. */
  thunder(strength = 0.8): void {
    this.whoosh({ duration: 3.4, from: 170, to: 55, q: 0.4, gain: 0.24 * strength, attack: 0.3, wet: 0.6 });
    this.thump(58, 34, 0.32 * strength, 1.8, 0.08);
  }

  /** Steady rain (filtered noise, looping) at `level` 0 … 1; 0 fades it out. */
  rain(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    if (!this.rainLoop) {
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const high = ctx.createBiquadFilter();
      high.type = "highpass";
      high.frequency.value = 900;
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 6500;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(high).connect(low).connect(gain);
      this.send(gain, 0.2);
      source.start();
      this.rainLoop = gain;
    }
    this.rainLoop.gain.setTargetAtTime(level * 0.07, ctx.currentTime, 0.6);
  }

  /** A bonfire's crackle: one dry pop of sap in the wood, with a breath of hiss. `level` 0 … 1. */
  crackle(level = 0.5): void {
    const pitch = 1800 + Math.random() * 2600;
    this.whoosh({ duration: 0.012 + Math.random() * 0.02, from: pitch, to: pitch * 0.7, q: 4, gain: 0.05 * level, attack: 0.001, wet: 0.15 });
    if (Math.random() < 0.25) this.whoosh({ duration: 0.2, from: 3000, to: 1800, q: 0.5, gain: 0.012 * level, attack: 0.03, wet: 0.1 });
  }

  /** Steel on steel (a blade on a shield or a guard): a bright inharmonic ring and a scrape. `force` 0 … 1. */
  clang(force = 1): void {
    const pitch = 1700 + Math.random() * 500;
    this.bell(pitch, 0.07 * force, 0, 0.5);
    this.bell(pitch * 1.47, 0.035 * force, 0.004, 0.35);
    this.whoosh({ duration: 0.12, from: 4200, to: 2400, q: 2, gain: 0.07 * force, attack: 0.002 });
  }

  /** Picking something up: a bell note that climbs the scale when pickups come quickly. */
  pickup(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.pickupStep = ctx.currentTime - this.lastPickup < 1.2 ? Math.min(SCALE.length - 2, this.pickupStep + 1) : 0;
    this.lastPickup = ctx.currentTime;
    this.bell(SCALE[this.pickupStep], 0.09, 0, 0.7);
    this.bell(SCALE[this.pickupStep + 1] * 2, 0.025, 0.04, 0.5);
  }

  /** The boar: a short, low, rough snort. */
  grunt(): void {
    this.whoosh({ duration: 0.2, from: 320, to: 180, q: 3, gain: 0.16, attack: 0.01 });
  }

  /** Back to a checkpoint: a soft falling sweep. */
  respawn(): void {
    this.whoosh({ duration: 0.5, from: 1200, to: 200, q: 0.7, gain: 0.08, wet: 0.6 });
  }

  /** A stage done: a gentle rising pentatonic arpeggio of bells. */
  complete(): void {
    [0, 2, 4, 5, 7].forEach((step, i) => this.bell(SCALE[step], 0.08, i * 0.11, 1.2));
  }

  /** The flag going into the ground: a thud and a bright ring. */
  plant(): void {
    this.land(0.4);
    this.bell(SCALE[5], 0.07, 0.05, 1.6);
    this.bell(SCALE[7], 0.04, 0.2, 1.6);
  }

  dispose(): void {
    this.music?.element.pause();
    this.music = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  // ---------------------------------------------------------------------------

  /** Sends a voice to the mix: mostly dry, with `wet` of it into the room. */
  private send(node: AudioNode, wet = 0.25): void {
    if (!this.ctx || !this.bus) return;
    node.connect(this.bus.dry);
    const level = this.ctx.createGain();
    level.gain.value = wet;
    node.connect(level).connect(this.bus.wet);
  }

  private noiseSource(ctx: AudioContext, loop: boolean): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = loop;
    return source;
  }

  /** Filtered noise swept from one frequency to another, with a smooth swell and tail. */
  private whoosh(o: { duration: number; from: number; to: number; q: number; gain: number; attack?: number; wet?: number }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const attack = o.attack ?? 0.015;
    const source = this.noiseSource(ctx, false);
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = "bandpass";
    filter.Q.value = o.q;
    filter.frequency.setValueAtTime(o.from, now);
    filter.frequency.exponentialRampToValueAtTime(o.to, now + o.duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(o.gain, now + attack);
    gain.gain.setTargetAtTime(0, now + attack, (o.duration - attack) / 3);
    source.connect(filter).connect(gain);
    this.send(gain, o.wet);
    source.start(now, Math.random() * 1.5);
    source.stop(now + o.duration * 1.6 + 0.05);
  }

  /** A sine body hit: pitch falling from `from` to `to` Hz. */
  private thump(from: number, to: number, level: number, duration: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const tone = ctx.createOscillator();
    const gain = ctx.createGain();
    tone.type = "sine";
    tone.frequency.setValueAtTime(from, now);
    tone.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.012);
    gain.gain.setTargetAtTime(0, now + 0.012, duration / 3);
    tone.connect(gain);
    this.send(gain, 0.15);
    tone.start(now);
    tone.stop(now + duration * 1.6 + 0.05);
  }

  /** A soft bell: a sine with a quiet inharmonic partial, long smooth decay into the room. */
  private bell(frequency: number, level: number, delay: number, decay: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.01);
    gain.gain.setTargetAtTime(0, now + 0.01, decay / 4);
    for (const [ratio, amount] of [[1, 1], [2.76, 0.12]] as const) {
      const tone = ctx.createOscillator();
      const partial = ctx.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency * ratio;
      partial.gain.value = amount;
      tone.connect(partial).connect(gain);
      tone.start(now);
      tone.stop(now + decay + 0.1);
    }
    this.send(gain, 0.45);
  }

  /*
   * Thrusters: looped soft noise, band-limited to the airy middle (no rumble below, no hiss
   * above), so a long hover is a gentle breath of air rather than a roar.
   */
  private buildThrust(ctx: AudioContext): void {
    const source = this.noiseSource(ctx, true);
    const body = ctx.createBiquadFilter();
    body.type = "highpass";
    body.frequency.value = 280;
    body.Q.value = 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 0.3;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(body).connect(filter).connect(gain);
    this.send(gain, 0.3);
    source.start();
    this.thrust = { gain, filter };
  }

  /* The fight track, started the first time a fight breaks out (streamed, looping, silent until faded in). */
  private buildFight(ctx: AudioContext): void {
    if (!this.master) return;
    const element = new Audio(FIGHT_URL);
    element.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(element).connect(gain).connect(this.master);
    void element.play().catch(() => undefined);
    this.fight = { element, gain };
  }

  /* The motor: two soft sine tones an octave apart through a gentle band, silent until the truck pulls. */
  private buildMotor(ctx: AudioContext): void {
    const low = ctx.createOscillator();
    const high = ctx.createOscillator();
    low.frequency.value = MOTOR.base;
    high.frequency.value = MOTOR.base * 2.03;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 900;
    band.Q.value = 0.5;
    const highLevel = ctx.createGain();
    highLevel.gain.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    low.connect(band);
    high.connect(highLevel).connect(band);
    band.connect(gain);
    this.send(gain, 0.1);
    low.start();
    high.start();
    this.motor = { low, high, gain };
  }

  /*
   * Background music: streamed from a media element (decoding three minutes up front would
   * cost ~65 MB on a phone), looping, fading in over two seconds. It joins after the
   * compressor so the effects never pump it.
   */
  private buildMusic(ctx: AudioContext): void {
    if (!this.master) return;
    const element = new Audio(MUSIC_URL);
    element.loop = true;
    element.preload = "auto";
    const gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(element).connect(gain).connect(this.master);
    gain.gain.setTargetAtTime(MUSIC, ctx.currentTime + 0.3, 0.7);
    void element.play().catch(() => undefined);
    this.music = { element, gain };
  }
}

/** A stereo room impulse: noise decaying over `seconds`, darker as it fades. */
function roomImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // One-pole low-pass whose cutoff falls with time: the tail loses its highs first.
      const k = 0.5 - t * 0.42;
      smooth += (Math.random() * 2 - 1 - smooth) * k;
      data[i] = smooth * Math.pow(1 - t, 3);
    }
  }
  return buffer;
}
