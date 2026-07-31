/**
 * The Web Audio plumbing.
 *
 * Cavern Run ships no audio files: every sound is synthesized at runtime, so
 * this is the only place that talks to the `AudioContext`. Browsers refuse to
 * start one before a user gesture, so the engine is created suspended and
 * resumed the first time the player touches anything.
 *
 * Signal flow:
 *
 *     music -> musicGain -\
 *                          >-> masterGain -> destination
 *     sfx   -> sfxGain   -/         ^
 *        \        \-> sfxSend  -\    |
 *         \                      >-> reverb -> reverbGain
 *          \-> musicSend -------/
 *
 * The two buses feed the tail at different depths: sound effects want to
 * sound like they happened in a big rock chamber, music only wants enough
 * tail to stop the synths sounding like they were recorded in a cupboard.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private musicSend: GainNode | null = null;
  private sfxSend: GainNode | null = null;

  private musicVolume = 0.55;
  private sfxVolume = 0.7;
  private muted = false;

  /** True once the context exists and is actually running. */
  get ready(): boolean {
    return this.context !== null && this.context.state === 'running';
  }

  get ctx(): AudioContext | null {
    return this.context;
  }

  get musicBus(): GainNode | null {
    return this.music;
  }

  get sfxBus(): GainNode | null {
    return this.sfx;
  }

  get now(): number {
    return this.context?.currentTime ?? 0;
  }

  /**
   * Build the graph and start the clock. Safe to call on every input event:
   * it only does work the first time, and resumes a context the browser has
   * since suspended.
   */
  unlock(): void {
    if (!this.context) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;

      try {
        this.context = new Ctor();
      } catch {
        // Audio is a nicety; a cave without a soundtrack still plays fine.
        this.context = null;
        return;
      }
      this.build(this.context);
    }

    if (this.context.state === 'suspended') void this.context.resume();
  }

  private build(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);

    this.music = ctx.createGain();
    this.music.gain.value = this.musicVolume;
    this.music.connect(this.master);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVolume;
    this.sfx.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeCaveImpulse(ctx, 3.1, 2.9);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.32;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    // A share of the dry sfx bus feeds the tail, so the cave sounds big.
    this.sfxSend = ctx.createGain();
    this.sfxSend.gain.value = 1;
    this.sfx.connect(this.sfxSend);
    this.sfxSend.connect(this.reverb);

    // The music gets a shallower send: enough room to sit the synths in the
    // same space as the sound effects, not so much that the groove smears.
    this.musicSend = ctx.createGain();
    this.musicSend.gain.value = 0.34;
    this.music.connect(this.musicSend);
    this.musicSend.connect(this.reverb);
  }

  setMusicVolume(value: number): void {
    this.musicVolume = clamp01(value);
    if (this.music && this.context) {
      this.music.gain.setTargetAtTime(this.musicVolume, this.context.currentTime, 0.05);
    }
  }

  setSfxVolume(value: number): void {
    this.sfxVolume = clamp01(value);
    if (this.sfx && this.context) {
      this.sfx.gain.setTargetAtTime(this.sfxVolume, this.context.currentTime, 0.05);
    }
  }

  getMusicVolume(): number {
    return this.musicVolume;
  }

  getSfxVolume(): number {
    return this.sfxVolume;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.04);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Pause the whole graph, e.g. when the tab loses focus. */
  suspend(): void {
    if (this.context && this.context.state === 'running') void this.context.suspend();
  }

  resume(): void {
    if (this.context && this.context.state === 'suspended') void this.context.resume();
  }

  destroy(): void {
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.music = null;
    this.sfx = null;
    this.reverb = null;
    this.reverbGain = null;
    this.musicSend = null;
    this.sfxSend = null;
  }
}

/**
 * A synthetic impulse response for a rock chamber.
 *
 * Three parts, summed: a short pre-delay of silence so the dry hit reads
 * first; a handful of discrete early reflections, which is what actually
 * tells the ear "stone walls, this far apart"; and an exponentially decaying
 * diffuse tail. The noise is biased toward its running average so the tail
 * sounds like rock rather than static, and the two channels use different
 * reflection times so the space is wide rather than a mono blur.
 */
function makeCaveImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  const preDelay = Math.floor(rate * 0.017);

  // Seconds out from the dry hit, and how loud each bounce comes back.
  const reflections: readonly (readonly [number, number])[] = [
    [0.021, 0.62],
    [0.037, 0.48],
    [0.058, 0.4],
    [0.083, 0.31],
    [0.119, 0.24],
    [0.166, 0.18],
  ];

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    // Nudging one channel's geometry keeps the tail from collapsing to mono.
    const skew = channel === 0 ? 1 : 1.13;
    let smoothed = 0;

    for (let i = preDelay; i < length; i += 1) {
      const life = (i - preDelay) / (length - preDelay);
      const noise = Math.random() * 2 - 1;
      smoothed = smoothed * 0.66 + noise * 0.34;
      data[i] = smoothed * Math.pow(1 - life, decay) * 0.7;
    }

    for (const [offset, level] of reflections) {
      const at = preDelay + Math.floor(rate * offset * skew);
      if (at >= length) continue;
      const sign = Math.random() < 0.5 ? -1 : 1;
      // Smear each bounce over a few samples so it reads as a surface
      // rather than a click.
      for (let i = 0; i < 4 && at + i < length; i += 1) {
        data[at + i] += sign * level * (1 - i / 4);
      }
    }
  }

  return buffer;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
