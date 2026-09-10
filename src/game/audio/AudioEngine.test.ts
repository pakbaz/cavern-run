import { afterEach, describe, expect, it } from 'vitest';

import { AudioEngine } from './AudioEngine';

const audioParam = (initial = 0) => ({
  value: initial,
  setTargetAtTime(value: number) {
    this.value = value;
  },
});

type FakeParam = ReturnType<typeof audioParam>;

interface FakeCompressor {
  connect(): void;
  disconnect(): void;
  threshold: FakeParam;
  knee: FakeParam;
  ratio: FakeParam;
  attack: FakeParam;
  release: FakeParam;
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static deferResume = false;
  static deferSuspend = false;

  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = this.node();
  resumeCalls = 0;
  suspendCalls = 0;
  compressor: FakeCompressor | null = null;
  private resumeResolvers: Array<() => void> = [];
  private suspendResolvers: Array<() => void> = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  private node() {
    return {
      connect() {},
      disconnect() {},
    };
  }

  createGain() {
    return { ...this.node(), gain: audioParam() };
  }

  createDynamicsCompressor(): FakeCompressor {
    this.compressor = {
      ...this.node(),
      threshold: audioParam(),
      knee: audioParam(),
      ratio: audioParam(),
      attack: audioParam(),
      release: audioParam(),
    };
    return this.compressor;
  }

  createConvolver() {
    return { ...this.node(), buffer: null };
  }

  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      sampleRate: this.sampleRate,
      getChannelData: (channel: number) => data[channel],
    };
  }

  resume() {
    this.resumeCalls += 1;
    if (FakeAudioContext.deferResume) {
      return new Promise<void>((resolve) => {
        this.resumeResolvers.push(() => {
          this.state = 'running';
          resolve();
        });
      });
    }
    this.state = 'running';
    return Promise.resolve();
  }

  suspend() {
    this.suspendCalls += 1;
    if (FakeAudioContext.deferSuspend) {
      return new Promise<void>((resolve) => {
        this.suspendResolvers.push(() => {
          this.state = 'suspended';
          resolve();
        });
      });
    }
    this.state = 'suspended';
    return Promise.resolve();
  }

  finishResume() {
    this.resumeResolvers.shift()?.();
  }

  finishSuspend() {
    this.suspendResolvers.shift()?.();
  }

  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

afterEach(() => {
  FakeAudioContext.instances = [];
  FakeAudioContext.deferResume = false;
  FakeAudioContext.deferSuspend = false;
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('AudioEngine', () => {
  it('keeps saved mix settings through gesture unlock and reuses one context', async () => {
    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: FakeAudioContext,
    };
    const engine = new AudioEngine();
    engine.setMusicVolume(0.32);
    engine.setSfxVolume(0.46);
    engine.setMuted(true);

    engine.unlock();
    await Promise.resolve();
    engine.unlock();

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].resumeCalls).toBe(1);
    expect(engine.getMusicVolume()).toBe(0.32);
    expect(engine.getSfxVolume()).toBe(0.46);
    expect(engine.isMuted()).toBe(true);
    expect(engine.ready).toBe(true);
    expect((engine.musicBus as unknown as { gain: { value: number } }).gain.value).toBe(0.32);
    expect((engine.sfxBus as unknown as { gain: { value: number } }).gain.value).toBe(0.46);
    expect(FakeAudioContext.instances[0].compressor?.threshold.value).toBe(-18);
    expect(FakeAudioContext.instances[0].compressor?.ratio.value).toBe(4);
  });

  it('suspends and resumes the existing graph without rebuilding it', async () => {
    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: FakeAudioContext,
    };
    const engine = new AudioEngine();
    engine.unlock();
    await Promise.resolve();

    engine.suspend();
    expect(engine.ready).toBe(false);
    engine.resume();
    await Promise.resolve();

    expect(engine.ready).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0].resumeCalls).toBe(2);
  });

  it('keeps suspension as the latest intent while an earlier resume settles', async () => {
    FakeAudioContext.deferResume = true;
    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: FakeAudioContext,
    };
    const engine = new AudioEngine();
    engine.unlock();
    const context = FakeAudioContext.instances[0];

    engine.suspend();
    context.finishResume();
    await Promise.resolve();
    await Promise.resolve();

    expect(engine.ready).toBe(false);
    expect(context.suspendCalls).toBe(1);
  });

  it('resumes when that becomes the latest intent during an asynchronous suspend', async () => {
    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: FakeAudioContext,
    };
    const engine = new AudioEngine();
    engine.unlock();
    await Promise.resolve();
    await Promise.resolve();
    const context = FakeAudioContext.instances[0];
    FakeAudioContext.deferSuspend = true;

    engine.suspend();
    engine.resume();
    context.finishSuspend();
    await Promise.resolve();
    await Promise.resolve();

    expect(engine.ready).toBe(true);
    expect(context.resumeCalls).toBe(2);
  });
});
