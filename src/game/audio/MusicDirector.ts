import type { AudioEngine } from './AudioEngine';
import {
  CAVE_CROSSFADE,
  bassDegree,
  drumsAt,
  filterCutoff,
  intensityOf,
  keyForCave,
  layerGains,
  leadDegree,
  leadPlays,
  midiToFreq,
  scaleNote,
  stepDuration,
  tempoFor,
  tickerFreq,
  type IntensityInputs,
  type MusicKey,
} from './musicMath';

/**
 * The adaptive soundtrack.
 *
 * A lookahead scheduler queues sixteenth notes a fraction of a second ahead of
 * the audio clock, which keeps the timing sample-accurate even when the main
 * thread is busy rendering. Everything about *what* it plays -- key, tempo,
 * which layers are audible -- comes from `musicMath`, driven by how the cave
 * is actually going: deeper caves are lower and darker, a closing firefly
 * pushes the tempo up, and the last ten seconds add a rising ticker.
 */
export class MusicDirector {
  private readonly engine: AudioEngine;

  private bus: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;

  private timer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;

  private key: MusicKey = keyForCave(0, 20);
  private seed = 1;
  private intensity = 0;
  private targetIntensity = 0;
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

    this.stop(true);

    this.key = keyForCave(caveIndex, caveCount);
    this.seed = caveIndex + 1;
    this.step = 0;
    this.intensity = 0;
    this.targetIntensity = 0;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = filterCutoff(0);
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

    const ctx = this.engine.ctx;
    const bus = this.bus;
    const filter = this.filter;
    this.bus = null;
    this.filter = null;
    if (!ctx || !bus) return;

    if (immediate) {
      bus.disconnect();
      filter?.disconnect();
      return;
    }

    const end = ctx.currentTime + CAVE_CROSSFADE;
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(0.0001, end);
    window.setTimeout(
      () => {
        bus.disconnect();
        filter?.disconnect();
      },
      CAVE_CROSSFADE * 1000 + 120,
    );
  }

  /** Feed the current state of the cave in; called every frame. */
  setState(inputs: IntensityInputs): void {
    this.targetIntensity = intensityOf(inputs);
    this.secondsLeft = inputs.secondsLeft;
  }

  get currentIntensity(): number {
    return this.intensity;
  }

  /* ---------------------------------------------------------------- */

  private schedule(): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.running || !this.filter) return;

    // Ease toward the target so a firefly darting past does not snap the
    // tempo; the music should lean into a threat, not flinch at it.
    this.intensity += (this.targetIntensity - this.intensity) * 0.08;
    this.filter.frequency.setTargetAtTime(filterCutoff(this.intensity), ctx.currentTime, 0.12);

    const spb = stepDuration(tempoFor(this.intensity));

    while (this.nextNoteTime < ctx.currentTime + MusicDirector.LOOKAHEAD) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += spb;
      this.step += 1;
    }
  }

  private playStep(step: number, time: number): void {
    const gains = layerGains(this.intensity, this.secondsLeft);
    const beat = step % 16;

    if (gains.bass > 0) {
      const note = scaleNote(this.key, bassDegree(step)) - 12;
      this.voice(midiToFreq(note), time, 0.16, gains.bass * 0.16, 'square', 0.5);
    }

    if (gains.pad > 0 && beat === 0) {
      const chordRoot = scaleNote(this.key, bassDegree(step));
      for (const interval of [0, 2, 4]) {
        this.voice(
          midiToFreq(scaleNote(this.key, bassDegree(step) + interval)),
          time,
          2.4,
          gains.pad * 0.045,
          'triangle',
          0.9,
        );
      }
      // A shimmering octave above keeps the pad from sounding muddy.
      this.voice(midiToFreq(chordRoot + 12), time, 2.4, gains.pad * 0.02, 'sine', 1.2);
    }

    if (gains.lead > 0 && leadPlays(step, this.intensity)) {
      const note = scaleNote(this.key, leadDegree(step, this.seed)) + 12;
      this.voice(midiToFreq(note), time, 0.14, gains.lead * 0.1, 'sawtooth', 0.04);
    }

    if (gains.drums > 0) {
      const hit = drumsAt(step, this.intensity);
      if (hit.kick) this.kick(time, gains.drums);
      if (hit.snare) this.snare(time, gains.drums * 0.8);
      if (hit.hat && gains.hats > 0) this.hat(time, gains.hats);
    }

    // The countdown: one blip per beat, climbing in pitch.
    if (gains.ticker > 0 && beat % 4 === 0) {
      this.voice(tickerFreq(this.secondsLeft), time, 0.07, 0.09, 'square', 0.01);
    }
  }

  /* ---------------------------------------------------------------- *
   * Voices
   * ---------------------------------------------------------------- */

  private voice(
    freq: number,
    time: number,
    duration: number,
    peak: number,
    type: OscillatorType,
    release: number,
  ): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.filter || peak <= 0) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.01);
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

  private noiseBurst(
    time: number,
    duration: number,
    peak: number,
    filterType: BiquadFilterType,
    frequency: number,
  ): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.filter || peak <= 0) return;

    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const biquad = ctx.createBiquadFilter();
    biquad.type = filterType;
    biquad.frequency.value = frequency;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    source.connect(biquad);
    biquad.connect(gain);
    gain.connect(this.filter);
    source.start(time);
    source.onended = () => {
      source.disconnect();
      biquad.disconnect();
      gain.disconnect();
    };
  }
}
