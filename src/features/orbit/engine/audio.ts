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
}

const MASTER = 0.65;
/** Background music level: low, under the effects (it dips a little more while the thrusters fire). */
const MUSIC = 0.13;
/** "Skylines" by Alex-Productions (chosic.com), re-encoded at 96 kb/s; streamed, not decoded whole. */
const MUSIC_URL = "/audio/skylines.mp3";
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
  private lastPickup = 0;
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
  }

  /** The tab is hidden or the game stopped: silence everything, music included. */
  suspend(): void {
    this.music?.element.pause();
    void this.ctx?.suspend();
  }

  resume(): void {
    if (!this.ctx) return;
    void this.ctx.resume();
    void this.music?.element.play().catch(() => undefined);
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
    this.music?.gain.gain.setTargetAtTime(MUSIC * (1 - state.thrust * 0.35), now, 0.4);
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

  /** The staff cutting the air: a quick rising whoosh. */
  swing(): void {
    this.whoosh({ duration: 0.18, from: 500, to: 2000, q: 1, gain: 0.08 });
  }

  /** The staff landing on something solid: a dull knock. */
  thwack(): void {
    this.thump(160, 90, 0.2, 0.12);
    this.whoosh({ duration: 0.08, from: 800, to: 500, q: 1.2, gain: 0.08, attack: 0.004 });
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
