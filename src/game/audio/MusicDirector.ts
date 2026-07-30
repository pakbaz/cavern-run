import type { AudioEngine } from './AudioEngine';
import {
  CAVE_CROSSFADE,
  arpDegree,
  arpPlays,
  bassDegree,
  chordDegree,
  drumsAt,
  filterCutoff,
  intensityOf,
  keyForCave,
  keyShift,
  layerGains,
  leadDegree,
  leadPlays,
  loopSteps,
  midiToFreq,
  musicPhase,
  scaleNote,
  stepDuration,
  swingOffset,
  tempoFor,
  themeForCave,
  tickerFreq,
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
}

/**
 * The adaptive soundtrack.
 *
 * A lookahead scheduler queues sixteenth notes a fraction of a second ahead of
 * the audio clock, which keeps the timing sample-accurate even when the main
 * thread is busy rendering. Everything about *what* it plays comes from
 * `musicMath`: each cave has its own theme -- key, tempo, groove, motif and
 * timbres -- and that theme is then developed as the clock runs down, from a
 * sparse pad-and-bass prowl through a driving middle to a panicked endgame with
 * a rising swell into every loop, a dissonant pedal and the tune dragged up a
 * semitone.
 */
export class MusicDirector {
  private readonly engine: AudioEngine;

  private bus: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private timer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;

  private theme: CaveTheme = themeForCave(0);
  private key: MusicKey = keyForCave(0, 20);
  private intensity = 0;
  private targetIntensity = 0;
  private phase: Phase = 0;
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

    this.stop(true);

    this.theme = themeForCave(caveIndex);
    this.key = keyForCave(caveIndex, caveCount);
    this.step = 0;
    this.intensity = 0;
    this.targetIntensity = 0;
    this.phase = 0;
    this.secondsLeft = 999;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = filterCutoff(0, 0);
    this.filter.Q.value = 0.9;

    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + CAVE_CROSSFADE);

    // A tempo-synced echo. Three sixteenths is long enough that the repeats
    // land off the melody rather than smearing it, so the cave answers itself.
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.3;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.3;
    const delaySend = ctx.createGain();
    delaySend.gain.value = 0.26;

    this.filter.connect(this.bus);
    this.filter.connect(delaySend);
    delaySend.connect(this.delay);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.bus);
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

    const ctx = this.engine.ctx;
    const bus = this.bus;
    const nodes = [this.filter, this.delay, this.delayFeedback];
    this.bus = null;
    this.filter = null;
    this.delay = null;
    this.delayFeedback = null;
    if (!ctx || !bus) return;

    const teardown = () => {
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
    window.setTimeout(teardown, CAVE_CROSSFADE * 1000 + 120);
  }

  /** Feed the current state of the cave in; called every frame. */
  setState(inputs: IntensityInputs): void {
    this.targetIntensity = intensityOf(inputs);
    this.secondsLeft = inputs.secondsLeft;
    this.phase = musicPhase(inputs.secondsLeft, inputs.timeLimit);
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
    this.intensity += (this.targetIntensity - this.intensity) * 0.08;
    this.filter.frequency.setTargetAtTime(
      filterCutoff(this.intensity, this.phase),
      ctx.currentTime,
      0.12,
    );

    const spb = stepDuration(tempoFor(this.intensity, this.theme));
    this.delay?.delayTime.setTargetAtTime(spb * 3, ctx.currentTime, 0.25);

    while (this.nextNoteTime < ctx.currentTime + MusicDirector.LOOKAHEAD) {
      const time = this.nextNoteTime + swingOffset(this.step, this.theme, spb);
      this.playStep(this.step, time, spb);
      this.nextNoteTime += spb;
      this.step += 1;
    }
  }

  private playStep(step: number, time: number, spb: number): void {
    const theme = this.theme;
    const phase = this.phase;
    const gains = layerGains(this.intensity, this.secondsLeft, phase);
    const beat = step % 16;
    const loop = loopSteps(theme);
    const position = ((step % loop) + loop) % loop;

    if (gains.bass > 0) {
      const degree = bassDegree(step, theme, phase);
      this.voice({
        freq: this.freqOf(degree - 7),
        time,
        duration: spb * 0.85,
        peak: gains.bass * 0.15,
        type: theme.bassWave,
        release: 0.06,
      });
      // A sine doubling the bass at its own pitch once the cave means it:
      // square and sawtooth waves are thin down here, and an octave lower
      // would be below hearing.
      if (phase >= 2 && beat % 4 === 0) {
        this.voice({
          freq: this.freqOf(degree - 7),
          time,
          duration: spb * 1.8,
          peak: gains.bass * 0.12,
          type: 'sine',
          release: 0.08,
        });
      }
    }

    if (gains.pad > 0 && beat === 0) {
      const chord = chordDegree(step, theme, phase);
      // The seventh only joins for the back half, which sours the harmony
      // exactly when the cave starts to feel like it is closing in.
      const intervals = phase >= 2 ? [0, 2, 4, 6] : [0, 2, 4];
      for (const interval of intervals) {
        for (const detune of [-7, 7]) {
          this.voice({
            freq: this.freqOf(chord + interval),
            time,
            duration: spb * 15,
            peak: gains.pad * 0.028,
            type: theme.padWave,
            release: 0.9,
            detune,
            attack: 0.35,
          });
        }
      }
      // A shimmering octave above keeps the pad from sounding muddy.
      this.voice({
        freq: this.freqOf(chord + 7),
        time,
        duration: spb * 15,
        peak: gains.pad * 0.022,
        type: 'sine',
        release: 1.2,
        attack: 0.5,
      });
    }

    if (gains.lead > 0 && leadPlays(step, this.intensity, theme)) {
      const degree = leadDegree(step, theme, phase);
      for (const detune of [-4, 4]) {
        this.voice({
          freq: this.freqOf(degree),
          time,
          duration: spb * 2.25,
          peak: gains.lead * 0.065,
          type: theme.leadWave,
          release: 0.16,
          detune,
          attack: 0.03,
        });
      }
    }

    if (gains.arp > 0 && arpPlays(step, phase)) {
      this.voice({
        freq: this.freqOf(arpDegree(step, theme, phase)),
        time,
        duration: spb * 0.5,
        peak: gains.arp * 0.05,
        type: 'triangle',
        release: 0.05,
      });
    }

    if (gains.drums > 0) {
      const hit = drumsAt(step, this.intensity, theme, phase);
      if (hit.kick) this.kick(time, gains.drums);
      if (hit.snare) this.snare(time, gains.drums * (hit.fill ? 0.6 : 0.8));
      if (hit.hat && gains.hats > 0) this.hat(time, gains.hats);
    }

    // Two bars out from the top of the loop, start winding the spring.
    if (gains.riser > 0 && position === loop - 32) {
      this.riser(time, spb * 32, gains.riser);
    }

    if (position === 0) {
      if (gains.riser > 0) this.impact(time, gains.riser);
      if (gains.drone > 0) this.drone(time, spb * loop, gains.drone);
    }

    // The countdown: one blip per beat, climbing in pitch.
    if (gains.ticker > 0 && beat % 4 === 0) {
      this.voice({
        freq: tickerFreq(this.secondsLeft),
        time,
        duration: 0.07,
        peak: 0.09,
        type: 'square',
        release: 0.01,
      });
    }
  }

  /** Frequency of a scale degree in the current key, including any late lift. */
  private freqOf(degree: number): number {
    return midiToFreq(scaleNote(this.key, degree) + keyShift(this.phase));
  }

  /* ---------------------------------------------------------------- *
   * Voices
   * ---------------------------------------------------------------- */

  private voice(options: VoiceOptions): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.filter || options.peak <= 0) return;

    const { freq, time, duration, peak, type, release } = options;
    const attack = options.attack ?? 0.01;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (options.detune) osc.detune.setValueAtTime(options.detune, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + release);

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(time);
    osc.stop(time + duration + release + 0.05);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  private kick(time: number, level: number): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.filter) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);

    gain.gain.setValueAtTime(level * 0.32, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(time);
    osc.stop(time + 0.22);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  private snare(time: number, level: number): void {
    this.noiseBurst(time, 0.13, level * 0.16, 'highpass', 1400);
  }

  private hat(time: number, level: number): void {
    this.noiseBurst(time, 0.045, level * 0.1, 'highpass', 6500);
  }

  /** The crash that lands on the downbeat a riser has been climbing toward. */
  private impact(time: number, level: number): void {
    this.noiseBurst(time, 0.7, level * 0.12, 'highpass', 2600);
  }

  /**
   * A swell into the next loop: noise climbing through a bandpass while a
   * detuned pair of saws slides up underneath it. Nothing says "you are running
   * out of time" quite so bluntly.
   */
  private riser(time: number, duration: number, level: number): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.filter || level <= 0) return;

    const source = this.noiseSource(Math.min(duration, MusicDirector.NOISE_SECONDS));
    if (!source) return;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 3.5;
    band.frequency.setValueAtTime(240, time);
    band.frequency.exponentialRampToValueAtTime(4200, time + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level * 0.07, time + duration);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.25);

    source.connect(band);
    band.connect(gain);
    gain.connect(this.filter);
    source.start(time, 0, Math.min(duration, MusicDirector.NOISE_SECONDS));
    source.onended = () => {
      source.disconnect();
      band.disconnect();
      gain.disconnect();
    };

    const base = this.freqOf(0) / 2;
    for (const detune of [-9, 9]) {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.detune.setValueAtTime(detune, time);
      osc.frequency.setValueAtTime(base, time);
      osc.frequency.exponentialRampToValueAtTime(base * 2, time + duration);

      oscGain.gain.setValueAtTime(0.0001, time);
      oscGain.gain.exponentialRampToValueAtTime(level * 0.045, time + duration);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.2);

      osc.connect(oscGain);
      oscGain.connect(this.filter);
      osc.start(time);
      osc.stop(time + duration + 0.3);
      osc.onended = () => {
        osc.disconnect();
        oscGain.disconnect();
      };
    }
  }

  /**
   * The endgame pedal: the tonic with a tritone leaning on it, held under the
   * whole loop. It never resolves, which is the point.
   */
  private drone(time: number, duration: number, level: number): void {
    for (const [degree, weight] of [
      [-7, 1],
      [-4, 0.55],
    ] as const) {
      this.voice({
        freq: this.freqOf(degree),
        time,
        duration,
        peak: level * 0.05 * weight,
        type: 'sawtooth',
        release: 0.6,
        detune: degree === -4 ? 12 : -12,
        attack: 0.6,
      });
    }
  }

  private noiseBurst(
    time: number,
    duration: number,
    peak: number,
    filterType: BiquadFilterType,
    frequency: number,
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

    source.connect(biquad);
    biquad.connect(gain);
    gain.connect(this.filter);
    source.start(time, this.noiseOffset(duration), duration);
    source.onended = () => {
      source.disconnect();
      biquad.disconnect();
      gain.disconnect();
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
