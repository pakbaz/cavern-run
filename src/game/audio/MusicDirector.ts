import type { AudioEngine } from './AudioEngine';
import {
  CAVE_CROSSFADE,
  chordDegree,
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
 * a clear melody from the first bar into a gently brighter final phrase.
 * Quiet sustained chords support it without bass pulses, drums or air noise.
 */
export class MusicDirector {
  private readonly engine: AudioEngine;

  private bus: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
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

    this.nextNoteTime = ctx.currentTime + 0.08;
    this.running = true;
    this.timer = window.setInterval(() => this.schedule(), MusicDirector.INTERVAL);
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
    const filter = this.filter;
    this.bus = null;
    this.filter = null;
    if (!ctx || !bus) return;

    const teardown = () => {
      bus.disconnect();
      filter?.disconnect();
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
          type: 'sine',
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
        peak: gains.lead * 0.085 * accent,
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

}
