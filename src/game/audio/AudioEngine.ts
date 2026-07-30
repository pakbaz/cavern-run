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
 *     music  -> musicGain  -\
 *                             >-> masterGain -> destination
 *     sfx    -> sfxGain    -/         ^
 *                  \-> reverb -> reverbGain
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;

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
    this.reverb.buffer = makeCaveImpulse(ctx, 1.9, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.28;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    // A share of the dry sfx bus feeds the tail, so the cave sounds big.
    this.sfx.connect(this.reverb);
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
  }
}

/**
 * A synthetic impulse response: exponentially decaying noise, slightly
 * different per channel so the tail is wide, and low-passed by biasing the
 * noise toward its running average so it sounds like rock rather than static.
 */
function makeCaveImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let smoothed = 0;
    for (let i = 0; i < length; i += 1) {
      const noise = Math.random() * 2 - 1;
      smoothed = smoothed * 0.62 + noise * 0.38;
      const envelope = Math.pow(1 - i / length, decay);
      data[i] = smoothed * envelope;
    }
  }

  return buffer;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
