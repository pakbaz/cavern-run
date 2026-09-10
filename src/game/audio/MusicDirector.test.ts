import { afterEach, describe, expect, it } from 'vitest';

import { MusicDirector } from './MusicDirector';
import { loopSteps, themeForCave } from './musicMath';

/**
 * The director is the only part of the soundtrack that talks to Web Audio, so
 * it is exercised here against a stand-in context that fails loudly on the
 * mistakes the API is silent about: a NaN frequency, a negative start time, or
 * an exponential ramp to zero (which stops a note dead instead of fading it).
 */

interface Recording {
  freqs: number[];
  gains: number[];
  nodes: number;
  disconnects: number;
  starts: number[];
}

function assertUsable(name: string, value: number, time: number): void {
  if (!Number.isFinite(value)) throw new Error(`non-finite ${name}: ${value}`);
  if (!Number.isFinite(time) || time < 0) throw new Error(`bad time on ${name}: ${time}`);
}

function fakeContext(log: Recording) {
  const param = (name: string) => ({
    value: 0,
    setValueAtTime(value: number, time: number) {
      assertUsable(name, value, time);
      if (name === 'frequency') log.freqs.push(value);
      if (name === 'gain') log.gains.push(value);
      return this;
    },
    exponentialRampToValueAtTime(value: number, time: number) {
      assertUsable(name, value, time);
      if (value === 0) throw new Error(`exponential ramp to zero on ${name}`);
      if (name === 'gain') log.gains.push(value);
      return this;
    },
    setTargetAtTime(value: number, time: number) {
      assertUsable(name, value, time);
      return this;
    },
    cancelScheduledValues() {
      return this;
    },
  });

  const node = () => {
    log.nodes += 1;
    return {
      connect() {},
      disconnect() {
        log.disconnects += 1;
      },
      start(when: number) {
        assertUsable('start', when, when);
        log.starts.push(when);
      },
      stop() {},
      frequency: param('frequency'),
      detune: param('detune'),
      delayTime: param('delayTime'),
      gain: param('gain'),
      pan: param('pan'),
      Q: param('Q'),
      type: 'sine',
      loop: false,
      buffer: null as unknown,
      onended: null,
    };
  };

  return {
    currentTime: 0,
    sampleRate: 44100,
    createOscillator: node,
    createGain: node,
    createBiquadFilter: node,
    createDelay: node,
    createBufferSource: node,
    createStereoPanner: node,
    createBuffer: (_channels: number, frames: number) => ({
      sampleRate: 44100,
      getChannelData: () => new Float32Array(frames),
    }),
  };
}

/** The director schedules through `window`; node has no such thing. */
function stubWindow(timeouts: Array<() => void> = []): void {
  (globalThis as unknown as { window: unknown }).window = {
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (callback: () => void) => {
      timeouts.push(callback);
      return 1;
    },
  };
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('MusicDirector', () => {
  it('plays every cave from first movement to last without a bad value', () => {
    stubWindow();
    const log: Recording = { freqs: [], gains: [], nodes: 0, disconnects: 0, starts: [] };
    const ctx = fakeContext(log);
    const engine = { ctx, musicBus: { connect() {}, disconnect() {} }, unlock() {} };

    for (let cave = 0; cave < 20; cave += 1) {
      const director = new MusicDirector(engine as never);
      director.start(cave, 20);

      const timeLimit = 150;
      const steps = loopSteps(themeForCave(cave)) * 6;

      for (let i = 0; i < steps; i += 1) {
        director.setState({
          difficulty: cave / 19,
          secondsLeft: timeLimit * (1 - i / steps),
          timeLimit,
          diamondsCollected: Math.floor(i / 10),
          diamondsRequired: 15,
          threatDistance: i % 40,
        });
        ctx.currentTime += 0.05;
        (director as unknown as { schedule: () => void }).schedule();
      }

      expect(director.currentPhase).toBe(3);
      expect(director.currentIntensity).toBeGreaterThan(0.5);
      director.stop(true);
    }

    expect(log.nodes).toBeGreaterThan(1000);
    for (const freq of log.freqs) {
      // Everything the score plays has to be inside hearing, and nothing
      // should be shrill enough to hurt.
      expect(freq).toBeGreaterThan(25);
      expect(freq).toBeLessThan(8000);
    }
    for (const gain of log.gains) {
      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeLessThanOrEqual(1);
    }
  });

  it('does nothing at all when the browser gave us no audio', () => {
    stubWindow();
    const silent = { ctx: null, musicBus: null, unlock() {} };
    const director = new MusicDirector(silent as never);

    expect(() => {
      director.start(3, 20);
      director.setState({
        difficulty: 0.5,
        secondsLeft: 20,
        timeLimit: 150,
        diamondsCollected: 1,
        diamondsRequired: 10,
        threatDistance: 2,
      });
      director.stop();
    }).not.toThrow();
  });

  it('crossfades a restarted cave instead of disconnecting the old score', () => {
    const timeouts: Array<() => void> = [];
    stubWindow(timeouts);
    const log: Recording = { freqs: [], gains: [], nodes: 0, disconnects: 0, starts: [] };
    const ctx = fakeContext(log);
    const engine = { ctx, musicBus: { connect() {}, disconnect() {} }, unlock() {} };
    const director = new MusicDirector(engine as never);

    director.start(0, 20);
    director.start(1, 20);

    expect(log.disconnects).toBe(0);
    expect(timeouts).toHaveLength(1);

    timeouts[0]();
    expect(log.disconnects).toBeGreaterThan(0);
  });

  it('waits for a bar line before changing musical phase', () => {
    stubWindow();
    const log: Recording = { freqs: [], gains: [], nodes: 0, disconnects: 0, starts: [] };
    const ctx = fakeContext(log);
    const engine = { ctx, musicBus: { connect() {}, disconnect() {} }, unlock() {} };
    const director = new MusicDirector(engine as never);
    director.start(0, 20);
    director.setState({
      difficulty: 0,
      secondsLeft: 150,
      timeLimit: 150,
      diamondsCollected: 0,
      diamondsRequired: 10,
      threatDistance: Number.POSITIVE_INFINITY,
    });
    (director as unknown as { schedule: () => void }).schedule();

    director.setState({
      difficulty: 1,
      secondsLeft: 5,
      timeLimit: 150,
      diamondsCollected: 0,
      diamondsRequired: 10,
      threatDistance: 1,
    });
    ctx.currentTime = 0.15;
    (director as unknown as { schedule: () => void }).schedule();
    expect(director.currentPhase).toBe(0);

    ctx.currentTime = 3;
    (director as unknown as { schedule: () => void }).schedule();
    expect(director.currentPhase).toBe(3);
  });

  it('renders a complete phrase with headroom and open sixteenth-note space', () => {
    stubWindow();
    const log: Recording = { freqs: [], gains: [], nodes: 0, disconnects: 0, starts: [] };
    const ctx = fakeContext(log);
    const engine = { ctx, musicBus: { connect() {}, disconnect() {} }, unlock() {} };
    const director = new MusicDirector(engine as never);
    const theme = themeForCave(0);
    const stepSeconds = 0.14;
    director.start(0, 20);

    log.gains = [];
    log.starts = [];
    (director as unknown as { intensity: number }).intensity = 0.5;
    for (let step = 0; step < loopSteps(theme); step += 1) {
      (director as unknown as {
        playStep: (step: number, time: number, stepSeconds: number) => void;
      }).playStep(step, 1 + step * stepSeconds, stepSeconds);
    }

    const startsPerStep = Array.from({ length: loopSteps(theme) }, (_, step) => {
      const at = 1 + step * stepSeconds;
      return log.starts.filter((time) => Math.abs(time - at) < 0.00001).length;
    });

    expect(startsPerStep.filter((count) => count === 0).length).toBeGreaterThanOrEqual(16);
    expect(Math.max(...startsPerStep)).toBeLessThanOrEqual(12);
    expect(Math.max(...log.gains)).toBeLessThanOrEqual(0.5);
  });
});
