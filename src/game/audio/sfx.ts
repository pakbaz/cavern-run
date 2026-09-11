import { Tile, type TileId } from '../engine/tiles';
import type { SimEvent } from '../engine/simTypes';
import type { AudioEngine } from './AudioEngine';

/**
 * Every sound effect in the game, synthesized on demand.
 *
 * These are deliberately short and percussive: the cave is a noisy place and a
 * scan can fire a dozen events at once, so each voice is cheap, disconnects
 * itself when it finishes, and is rate-limited per frame.
 */
export class Sfx {
  private readonly engine: AudioEngine;

  /** Voices started during the current scan, to stop an avalanche clipping. */
  private budget: number | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /** Call once per simulation scan before handing over events. */
  beginFrame(): void {
    this.budget = 10;
  }

  /** Play the sounds for one scan's worth of simulation events. */
  handle(events: readonly SimEvent[]): void {
    if (!this.engine.ready) return;
    this.beginFrame();

    try {
      for (const event of events) {
        switch (event.type) {
          case 'dig':
            this.dig();
            break;
          case 'push':
            this.push();
            break;
          case 'land':
            this.land(event.tile);
            break;
          case 'diamond':
            this.diamond(event.collected);
            break;
          case 'explode':
            this.explosion();
            break;
          case 'magicWallStart':
          case 'magicWallConvert':
            this.magicChime();
            break;
          case 'magicWallStop':
            this.magicStop();
            break;
          case 'amoebaGrow':
            this.amoeba();
            break;
          case 'amoebaResolved':
            this.crystallise();
            break;
          case 'slime':
            this.slime();
            break;
          case 'expand':
            this.push();
            break;
          case 'exitOpen':
            this.exitOpen();
            break;
          case 'playerBorn':
            this.born();
            break;
          case 'playerDied':
            this.died();
            break;
          case 'caveComplete':
            this.caveComplete();
            break;
          default:
            break;
        }
      }
    } finally {
      // Menu and one-off scene sounds are not part of a simulation scan and
      // should remain playable before or after this frame budget.
      this.budget = null;
    }
  }

  /* ---------------------------------------------------------------- *
   * Individual voices
   * ---------------------------------------------------------------- */

  dig(): void {
    this.noise(0.09, 0.16, { type: 'bandpass', frequency: 1400, q: 1.2, sweepTo: 700 });
  }

  push(): void {
    this.noise(0.18, 0.2, { type: 'lowpass', frequency: 900, q: 0.8, sweepTo: 300 });
  }

  land(tile: TileId): void {
    if (tile === Tile.Diamond || tile === Tile.DiamondFalling) {
      this.tone(1180, 0.07, 0.1, 'triangle', 1560);
      return;
    }
    this.noise(0.16, 0.28, { type: 'lowpass', frequency: 620, q: 1, sweepTo: 140 });
    this.tone(88, 0.12, 0.22, 'sine', 46);
  }

  /** Pitch climbs with the count, so a run of gems sounds like a run. */
  diamond(collected: number): void {
    const phrase = [0, 2, 5, 7, 9, 12];
    const slot = Math.max(0, collected - 1) % phrase.length;
    const base = 659.25 * Math.pow(2, phrase[slot] / 12);
    this.tone(base, 0.16, 0.12, 'triangle', base * 1.015);
    this.tone(base * 2, 0.23, 0.045, 'sine', undefined, 0.018);
    if (slot === phrase.length - 1) {
      this.tone(base * 1.5, 0.3, 0.055, 'sine', undefined, 0.045);
    }
  }

  explosion(): void {
    this.noise(0.55, 0.5, { type: 'lowpass', frequency: 1600, q: 0.7, sweepTo: 90 });
    this.tone(120, 0.4, 0.4, 'sawtooth', 28);
  }

  magicChime(): void {
    this.tone(523.25, 0.24, 0.075, 'triangle', 784.88);
    this.tone(783.99, 0.28, 0.065, 'sine', 1046.5, 0.035);
    this.tone(1174.66, 0.32, 0.04, 'sine', undefined, 0.07);
  }

  magicStop(): void {
    this.tone(520, 0.5, 0.16, 'sine', 130);
  }

  amoeba(): void {
    if (Math.random() > 0.22) return;
    this.noise(0.2, 0.05, { type: 'bandpass', frequency: 320, q: 3, sweepTo: 220 });
  }

  crystallise(): void {
    for (let i = 0; i < 5; i += 1) {
      this.tone(660 * Math.pow(2, i / 6), 0.4, 0.09, 'triangle', 1320, i * 0.05);
    }
  }

  slime(): void {
    this.tone(300, 0.16, 0.09, 'sine', 90);
    this.noise(0.12, 0.06, { type: 'bandpass', frequency: 500, q: 4, sweepTo: 200 });
  }

  exitOpen(): void {
    for (let i = 0; i < 4; i += 1) {
      this.tone(
        440 * Math.pow(2, [0, 4, 7, 12][i] / 12),
        0.46,
        0.12,
        'triangle',
        undefined,
        i * 0.075,
      );
    }
  }

  born(): void {
    this.tone(220, 0.35, 0.16, 'square', 880);
    this.noise(0.3, 0.12, { type: 'highpass', frequency: 400, q: 1, sweepTo: 2600 });
  }

  died(): void {
    this.tone(330, 0.7, 0.3, 'sawtooth', 46);
    this.noise(0.6, 0.3, { type: 'lowpass', frequency: 900, q: 0.9, sweepTo: 70 });
  }

  caveComplete(): void {
    const arp = [0, 4, 7, 12, 16, 19];
    arp.forEach((semi, i) => {
      this.tone(330 * Math.pow(2, semi / 12), 0.35, 0.13, 'square', undefined, i * 0.075);
    });
  }

  /** Menu blip. Not driven by simulation events. */
  uiMove(): void {
    this.tone(620, 0.07, 0.08, 'square');
  }

  uiSelect(): void {
    this.tone(880, 0.12, 0.11, 'square', 1320);
  }

  extraLife(): void {
    [0, 5, 9, 12].forEach((semi, i) => {
      this.tone(523 * Math.pow(2, semi / 12), 0.3, 0.14, 'triangle', undefined, i * 0.09);
    });
  }

  /** One beat of the end-of-cave time-bonus tally. */
  bonusTick(index: number): void {
    this.tone(740 + (index % 8) * 40, 0.05, 0.09, 'square');
  }

  gameOver(): void {
    [0, -3, -7, -12].forEach((semi, i) => {
      this.tone(392 * Math.pow(2, semi / 12), 0.55, 0.16, 'sawtooth', undefined, i * 0.16);
    });
  }

  /* ---------------------------------------------------------------- *
   * Primitives
   * ---------------------------------------------------------------- */

  private tone(
    freq: number,
    duration: number,
    peak: number,
    type: OscillatorType,
    sweepTo?: number,
    delay = 0,
  ): void {
    const ctx = this.engine.ctx;
    const bus = this.engine.sfxBus;
    if (!ctx || !bus || !this.claimVoice()) return;

    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), start + duration);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(bus);
    osc.start(start);
    osc.stop(start + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  private noise(
    duration: number,
    peak: number,
    filter: { type: BiquadFilterType; frequency: number; q: number; sweepTo?: number },
  ): void {
    const ctx = this.engine.ctx;
    const bus = this.engine.sfxBus;
    if (!ctx || !bus || !this.claimVoice()) return;

    const start = ctx.currentTime;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const biquad = ctx.createBiquadFilter();
    biquad.type = filter.type;
    biquad.Q.value = filter.q;
    biquad.frequency.setValueAtTime(filter.frequency, start);
    if (filter.sweepTo !== undefined) {
      biquad.frequency.exponentialRampToValueAtTime(Math.max(20, filter.sweepTo), start + duration);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(biquad);
    biquad.connect(gain);
    gain.connect(bus);
    const room = Math.max(0, 1 - frames / ctx.sampleRate);
    source.start(start, Math.random() * room, duration);
    source.onended = () => {
      source.disconnect();
      biquad.disconnect();
      gain.disconnect();
    };
  }

  private claimVoice(): boolean {
    if (this.budget === null) return true;
    if (this.budget <= 0) return false;
    this.budget -= 1;
    return true;
  }
}
