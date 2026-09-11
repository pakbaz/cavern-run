import { describe, expect, it } from 'vitest';

import { Sfx } from './sfx';

interface Recording {
  oscillators: number;
  buffers: number;
  frequencies: number[];
}

function fakeContext(log: Recording) {
  const param = (frequency = false) => ({
    value: 0,
    setValueAtTime(value: number) {
      if (frequency) log.frequencies.push(value);
    },
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({
    connect() {},
    disconnect() {},
    start() {},
    stop() {},
    frequency: param(true),
    gain: param(),
    Q: param(),
    type: 'sine',
    buffer: null,
    onended: null,
  });

  return {
    currentTime: 0,
    sampleRate: 44100,
    createOscillator() {
      log.oscillators += 1;
      return node();
    },
    createGain: node,
    createBiquadFilter: node,
    createBufferSource: node,
    createBuffer: (_channels: number, frames: number) => {
      log.buffers += 1;
      return {
        sampleRate: 44100,
        getChannelData: () => new Float32Array(frames),
      };
    },
  };
}

describe('Sfx', () => {
  it('plays direct UI sounds before any simulation frame has run', () => {
    const log: Recording = { oscillators: 0, buffers: 0, frequencies: [] };
    const engine = {
      ctx: fakeContext(log),
      sfxBus: { connect() {}, disconnect() {} },
      ready: true,
    };
    const sfx = new Sfx(engine as never);

    sfx.uiMove();

    expect(log.oscillators).toBe(1);
  });

  it('turns collected diamonds into an ascending, resolving phrase', () => {
    const log: Recording = { oscillators: 0, buffers: 0, frequencies: [] };
    const engine = {
      ctx: fakeContext(log),
      sfxBus: { connect() {}, disconnect() {} },
      ready: true,
    };
    const sfx = new Sfx(engine as never);

    sfx.diamond(1);
    const first = log.frequencies[0];
    sfx.diamond(6);

    expect(log.frequencies[2]).toBeGreaterThan(first);
    expect(log.oscillators).toBe(5);
  });

  it('caps event storms but restores one-off sounds after the scan', () => {
    const log: Recording = { oscillators: 0, buffers: 0, frequencies: [] };
    const engine = {
      ctx: fakeContext(log),
      sfxBus: { connect() {}, disconnect() {} },
      ready: true,
    };
    const sfx = new Sfx(engine as never);
    const events = Array.from({ length: 12 }, (_, collected) => ({
      type: 'diamond',
      collected: collected + 1,
    }));

    sfx.handle(events as never);
    expect(log.oscillators).toBe(10);

    sfx.uiMove();
    expect(log.oscillators).toBe(11);
  });

  it('reuses one noise buffer across repeated cave impacts', () => {
    const log: Recording = { oscillators: 0, buffers: 0, frequencies: [] };
    const engine = {
      ctx: fakeContext(log),
      sfxBus: { connect() {}, disconnect() {} },
      ready: true,
    };
    const sfx = new Sfx(engine as never);

    sfx.dig();
    sfx.push();

    expect(log.buffers).toBe(1);
  });
});
