import type { AudioEngine } from './AudioEngine';
import {
  CAVE_CROSSFADE,
  bassDegree,
  chordDegree,
  drumsAt,
  filterCutoff,
  intensityOf,
  keyForCave,
  layerGains,
  leadAccent,
  leadDegree,
  leadLength,
  leadPlays,
  loopSteps,
  midiToFreq,
  musicPhase,
  scaleNote,
  stepDuration,
  swingOffset,
  tempoFor,
  themeForCave,
  type CaveTheme,
  type IntensityInputs,
  type MusicKey,
  type Phase,
} from './musicMath';

interface VoiceOptions {
  readonly freq: number;
  readonly time: number;
  readonly duration: number;
  readonly peak: number;
  readonly type: OscillatorType;
  readonly release: number;
  /** Cents of detune, for chorusing a layer against itself. */
  readonly detune?: number;
  /** Attack in seconds; long ones let the pad swell instead of stab. */
  readonly attack?: number;
  /** -1 hard left to 1 hard right. Absent or 0 leaves the voice centred. */
  readonly pan?: number;
}

interface RetiringScore {
  readonly timeout: number;
  readonly teardown: () => void;
}

/**
 * The adaptive soundtrack.
 *
 * A lookahead scheduler queues sixteenth notes a fraction of a second ahead of
 * the audio clock, which keeps the timing sample-accurate even when the main
 * thread is busy rendering. Everything about *what* it plays comes from
 * `musicMath`: each cave has its own theme -- key, tempo, groove, motif and
 * timbres -- and that theme is then developed as the clock runs down, from
 * a sparse pad-and-bass prowl into a gently firmer groove. The melody remains
 * the only foreground line; adaptation changes weight and pulse without
 * piling a second tune or alarm layer on top of it.
 */
export class MusicDirector {
  private readonly engine: AudioEngine;

  private bus: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private air: AudioBufferSourceNode | null = null;
  private airGain: GainNode | null = null;
  private retiring: RetiringScore | null = null;

  private timer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;

  private theme: CaveTheme = themeForCave(0);
  private key: MusicKey = keyForCave(0, 20);
  private intensity = 0;
  private targetIntensity = 0;
  private phase: Phase = 0;
  private targetPhase: Phase = 0;
  private secondsLeft = 999;
  private running = false;

  /** How far ahead of the audio clock notes are queued, in seconds. */
  private static readonly LOOKAHEAD = 0.18;
  /** How often the scheduler wakes up, in milliseconds. */
  private static readonly INTERVAL = 30;
  /** Seconds of white noise shared by every percussive voice. */
  private static readonly NOISE_SECONDS = 4;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /** Begin (or restart) the soundtrack for a cave. */
  start(caveIndex: number, caveCount: number): void {
    this.engine.unlock();
    const ctx = this.engine.ctx;
    const musicBus = this.engine.musicBus;
    if (!ctx || !musicBus) return;

    // Let the previous cave leave a short tail under the new downbeat. A hard
    // disconnect here made level transitions click despite the nominal
    // crossfade constant.
    this.stop(false);

    this.theme = themeForCave(caveIndex);
    this.key = keyForCave(caveIndex, caveCount);
    this.step = 0;
    this.intensity = 0;
    this.targetIntensity = 0;
    this.phase = 0;
    this.targetPhase = 0;
    this.secondsLeft = 999;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = filterCutoff(0, 0);
    this.filter.Q.value = 0.9;

    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + CAVE_CROSSFADE);

    this.filter.connect(this.bus);
    this.bus.connect(musicBus);

    this.startAir();

    this.nextNoteTime = ctx.currentTime + 0.08;
    this.running = true;
    this.timer = window.setInterval(() => this.schedule(), MusicDirector.INTERVAL);
  }

  /**
   * The cave itself: a slow band of filtered noise under the music, wide and
   * barely there. It is what stops the gaps between phrases sounding like the
   * soundtrack simply stopped.
   */
  private startAir(): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.bus || this.theme.airMix <= 0) return;

    const source = this.noiseSource(MusicDirector.NOISE_SECONDS);
    if (!source) return;
    source.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 320;
    band.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(this.theme.airMix * 0.035, ctx.currentTime, 1.4);

    source.connect(band);
    band.connect(gain);
    gain.connect(this.bus);
    source.start(ctx.currentTime);

    this.air = source;
    this.airGain = gain;
  }

  /**
   * Fade out and tear down.
   * @param immediate skip the fade, for a hard cut between caves
   */
  stop(immediate = false): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.disposeRetiring();

    const ctx = this.engine.ctx;
    const bus = this.bus;
    const nodes = [this.filter, this.airGain];
    const air = this.air;
    this.bus = null;
    this.filter = null;
    this.air = null;
    this.airGain = null;
    if (!ctx || !bus) return;

    const teardown = () => {
      try {
        air?.stop();
      } catch {
        // Already stopped; the browser throws rather than shrugging.
      }
      air?.disconnect();
      bus.disconnect();
      for (const node of nodes) node?.disconnect();
    };

    if (immediate) {
      teardown();
      return;
    }

    const end = ctx.currentTime + CAVE_CROSSFADE;
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(0.0001, end);
    const retiring = {
      timeout: 0,
      teardown,
    };
    retiring.timeout = window.setTimeout(() => {
      if (this.retiring !== retiring) return;
      this.retiring = null;
      teardown();
    }, CAVE_CROSSFADE * 1000 + 120);
    this.retiring = retiring;
  }

  private disposeRetiring(): void {
    if (!this.retiring) return;
    const retiring = this.retiring;
    this.retiring = null;
    window.clearTimeout(retiring.timeout);
    retiring.teardown();
  }

  /** Feed the current state of the cave in; called every frame. */
  setState(inputs: IntensityInputs): void {
    this.targetIntensity = intensityOf(inputs);
    this.secondsLeft = inputs.secondsLeft;
    this.targetPhase = musicPhase(inputs.secondsLeft, inputs.timeLimit);
  }

  get currentIntensity(): number {
    return this.intensity;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  /* ---------------------------------------------------------------- */

  private schedule(): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.running || !this.filter) return;

    // Ease toward the target so a firefly darting past does not snap the
    // tempo; the music should lean into a threat, not flinch at it.
    const smoothing = this.targetIntensity > this.intensity ? 0.045 : 0.025;
    this.intensity += (this.targetIntensity - this.intensity) * smoothing;
    this.filter.frequency.setTargetAtTime(
      filterCutoff(this.intensity, this.phase),
      ctx.currentTime,
      0.12,
    );

    const spb = stepDuration(tempoFor(this.intensity, this.theme));

    while (this.nextNoteTime < ctx.currentTime + MusicDirector.LOOKAHEAD) {
      const time = this.nextNoteTime + swingOffset(this.step, this.theme, spb);
      this.playStep(this.step, time, spb);
      this.nextNoteTime += spb;
      this.step += 1;
    }
  }

  private playStep(step: number, time: number, spb: number): void {
    const theme = this.theme;
    // Phase bookkeeping waits for a bar line, keeping any adaptive changes
    // aligned to the phrase rather than reacting halfway through a bar.
    if (step % 16 === 0) this.phase = this.targetPhase;
    const phase = this.phase;
    const gains = layerGains(this.intensity, this.secondsLeft, phase);
    const beat = step % 16;
    const loop = loopSteps(theme);
    const position = ((step % loop) + loop) % loop;

    if (gains.bass > 0 && beat % 4 === 0) {
      const degree = bassDegree(step, theme, phase);
      this.voice({
        freq: this.freqOf(degree - 7),
        time,
        duration: spb * 2.2,
        peak: gains.bass * 0.12,
        type: theme.bassWave,
        release: 0.06,
      });
      // A sine an octave down, felt more than heard, on the bar's strong
      // beats. Square and sawtooth waves are thin this low, and the pitch is
      // floored so a deep cave never drops the sub below hearing.
      if (beat === 0 && theme.subMix > 0) {
        this.voice({
          freq: Math.max(34, this.freqOf(degree - 14)),
          time,
          duration: spb * 3,
          peak: gains.bass * 0.075 * theme.subMix,
          type: 'sine',
          release: 0.12,
          attack: 0.02,
        });
      }
    }

    if (gains.pad > 0 && beat === 0) {
      const chord = chordDegree(step, theme, phase);
      const intervals = [0, 2, 4];
      for (let index = 0; index < intervals.length; index += 1) {
        const interval = intervals[index];
        this.voice({
          freq: this.freqOf(chord + interval),
          time,
          duration: spb * 15,
          peak: gains.pad * 0.032,
          type: theme.padWave,
          release: 0.9,
          detune: index % 2 === 0 ? -5 : 5,
          attack: 0.35,
          pan: index % 2 === 0 ? -0.42 : 0.42,
        });
      }
      // A shimmering octave above keeps the pad from sounding muddy.
      this.voice({
        freq: this.freqOf(chord + 7),
        time,
        duration: spb * 15,
        peak: gains.pad * 0.016,
        type: 'sine',
        release: 1.2,
        attack: 0.5,
      });
    }

    if (gains.lead > 0 && leadPlays(step, this.intensity, theme)) {
      const degree = leadDegree(step, theme, phase);
      const accent = leadAccent(step, theme);
      this.voice({
        freq: this.freqOf(degree),
        time,
        duration: spb * leadLength(step, theme),
        peak: gains.lead * 0.072 * accent,
        type: theme.leadWave,
        release: 0.18,
        detune: step % 32 < 16 ? -3 : 3,
        attack: 0.025,
        pan: step % 32 < 16 ? -0.16 : 0.16,
      });
      // A single cadence shimmer once per whole loop punctuates the tune
      // without becoming a second melodic line.
      const cadence = loop - 16 + theme.rhythm[theme.rhythm.length - 1];
      if (theme.bellMix > 0 && position === cadence) {
        this.bell(this.freqOf(degree + 7), time, spb * 3.2, gains.lead * 0.032 * theme.bellMix);
      }
    }

    if (gains.drums > 0) {
      const hit = drumsAt(step, this.intensity, theme, phase);
      if (hit.kick) this.kick(time, gains.drums);
      if (hit.snare) this.snare(time, gains.drums * (hit.fill ? 0.6 : 0.8));
      if (hit.hat && gains.hats > 0) this.hat(time, gains.hats);
    }
  }

  /** Frequency of a scale degree in the current cave key. */
  private freqOf(degree: number): number {
    return midiToFreq(scaleNote(this.key, degree));
  }

  /* ---------------------------------------------------------------- *
   * Voices
   * ---------------------------------------------------------------- */

  private voice(options: VoiceOptions): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.filter || options.peak <= 0) return;

    const { freq, time, duration, peak, type, release } = options;
    const attack = options.attack ?? 0.01;
    const end = time + duration + release;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (options.detune) osc.detune.setValueAtTime(options.detune, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    const pan = this.panner(options.pan ?? 0);
    osc.connect(gain);
    if (pan) {
      gain.connect(pan);
      pan.connect(this.filter);
    } else {
      gain.connect(this.filter);
    }

    osc.start(time);
    osc.stop(end + 0.05);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      pan?.disconnect();
    };
  }

  /**
   * Stereo placement, where the browser offers it. Everything routes through
   * whatever this returns, so a context without a panner simply plays the
   * voice centred instead of failing.
   */
  private panner(pan: number): StereoPannerNode | null {
    const ctx = this.engine.ctx;
    if (!ctx || pan === 0 || typeof ctx.createStereoPanner !== 'function') return null;
    const node = ctx.createStereoPanner();
    node.pan.value = pan < -1 ? -1 : pan > 1 ? 1 : pan;
    return node;
  }

  /**
   * A struck bell: a sine carrier whose pitch is shaken by a second
   * oscillator at an inharmonic ratio, with the shake dying away much faster
   * than the note. That is the whole trick behind an FM bell -- a bright
   * clang that settles into a pure tone.
   */
  private bell(freq: number, time: number, duration: number, level: number): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.filter || level <= 0) return;

    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const index = ctx.createGain();
    const gain = ctx.createGain();

    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, time);
    modulator.type = 'sine';
    // 2.76 is far enough off a whole number that the partials never line up
    // into a chord, which is what makes metal sound like metal.
    modulator.frequency.value = freq * 2.76;
    index.gain.value = freq * 1.4;
    index.gain.setTargetAtTime(0, time, duration * 0.16);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    modulator.connect(index);
    index.connect(carrier.frequency);
    carrier.connect(gain);

    const pan = this.panner(0.35);
    if (pan) {
      gain.connect(pan);
      pan.connect(this.filter);
    } else {
      gain.connect(this.filter);
    }

    carrier.start(time);
    modulator.start(time);
    carrier.stop(time + duration + 0.05);
    modulator.stop(time + duration + 0.05);
    carrier.onended = () => {
      carrier.disconnect();
      modulator.disconnect();
      index.disconnect();
      gain.disconnect();
      pan?.disconnect();
    };
  }

  private kick(time: number, level: number): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.filter) return;

    // A felt beater is low and slow, a gated one snaps down hard and loud.
    const [top, bottom, sweep, decay, weight] =
      this.theme.kit === 'soft'
        ? [124, 44, 0.15, 0.22, 0.28]
        : this.theme.kit === 'tight'
          ? [160, 42, 0.1, 0.17, 0.33]
          : [210, 38, 0.07, 0.26, 0.38];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(top, time);
    osc.frequency.exponentialRampToValueAtTime(bottom, time + sweep);

    gain.gain.setValueAtTime(level * weight, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(time);
    osc.stop(time + decay + 0.04);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    // The click that makes a kick audible on small speakers, where none of
    // the fundamental survives.
    if (this.theme.kit !== 'soft') {
      this.noiseBurst(time, 0.014, level * 0.09, 'highpass', 2200);
    }
  }

  /**
   * Noise for the wires, a short tuned tone for the body. Without the tone a
   * synthesized snare is just a puff of air.
   */
  private snare(time: number, level: number): void {
    const [length, cut, body] =
      this.theme.kit === 'soft'
        ? [0.17, 1100, 0.5]
        : this.theme.kit === 'tight'
          ? [0.12, 1600, 0.8]
          : [0.24, 1900, 1];

    this.noiseBurst(time, length, level * 0.16, 'highpass', cut, this.theme.kit === 'hard' ? 0.3 : 0);

    const ctx = this.engine.ctx;
    if (!ctx || !this.filter || body <= 0) return;

    for (const freq of [188, 262]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(level * 0.07 * body, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + length * 0.6);
      osc.connect(gain);
      gain.connect(this.filter);
      osc.start(time);
      osc.stop(time + length);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    }
  }

  private hat(time: number, level: number): void {
    const length = this.theme.kit === 'hard' ? 0.032 : this.theme.kit === 'tight' ? 0.042 : 0.058;
    this.noiseBurst(time, length, level * 0.1, 'highpass', 6500, 0.55);
  }

  private noiseBurst(
    time: number,
    duration: number,
    peak: number,
    filterType: BiquadFilterType,
    frequency: number,
    pan = 0,
  ): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.filter || peak <= 0) return;

    const source = this.noiseSource(duration);
    if (!source) return;

    const biquad = ctx.createBiquadFilter();
    biquad.type = filterType;
    biquad.frequency.value = frequency;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    // Hats and the snare's noise half sit slightly off centre, which is
    // where a real kit puts them.
    const panner = this.panner(pan);
    source.connect(biquad);
    biquad.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(this.filter);
    } else {
      gain.connect(this.filter);
    }
    source.start(time, this.noiseOffset(duration), duration);
    source.onended = () => {
      source.disconnect();
      biquad.disconnect();
      gain.disconnect();
      panner?.disconnect();
    };
  }

  /**
   * Every percussive voice reads from one shared noise buffer. Generating a
   * fresh one per hi-hat was allocating hundreds of buffers a minute.
   */
  private noiseSource(duration: number): AudioBufferSourceNode | null {
    const ctx = this.engine.ctx;
    if (!ctx || duration <= 0) return null;

    if (!this.noise || this.noise.sampleRate !== ctx.sampleRate) {
      const frames = Math.max(1, Math.floor(ctx.sampleRate * MusicDirector.NOISE_SECONDS));
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }

    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    return source;
  }

  /** A random window into the shared buffer, so repeats do not sound identical. */
  private noiseOffset(duration: number): number {
    const room = Math.max(0, MusicDirector.NOISE_SECONDS - duration);
    return Math.random() * room;
  }
}
