import { describe, expect, it, vi } from 'vitest';
import { CaveOutcome, NO_INPUT } from '../engine/simTypes';
import { GameScene } from './GameScene';

const sound = vi.hoisted(() => {
  const caveComplete = vi.fn();
  return {
    engine: {},
    music: { setState: vi.fn(), stop: vi.fn() },
    sfx: {
      caveComplete,
      beginFrame: vi.fn(),
      extraLife: vi.fn(),
      handle: (events: readonly { type: string }[]) => {
        for (const event of events) {
          if (event.type === 'caveComplete') caveComplete();
        }
      },
    },
  };
});

vi.mock('phaser', () => ({ default: { Scene: class {} } }));
vi.mock('../audio/index', () => ({ audio: () => sound }));
vi.mock('../render/index', () => ({ RenderLayer: class {} }));
vi.mock('../levels/index', () => ({ CAVE_COUNT: 20 }));
vi.mock('../state/profile', () => ({
  recordCaveBest: vi.fn().mockResolvedValue(undefined),
  saveProgress: vi.fn().mockResolvedValue({}),
}));
vi.mock('./ui', () => ({ onLayoutChanged: vi.fn() }));

describe('cave completion audio', () => {
  it('plays the completion fanfare once via the simulation event', async () => {
    const scene = new GameScene();
    const start = vi.fn();
    Object.assign(scene, {
      state: {
        session: {
          caveIndex: 0, lives: 3, tickAlpha: 0,
          spec: { diamondsRequired: 5, timeLimit: 100 },
          simulation: {
            cave: {},
            runtime: { diamondsCollected: 5 },
            secondsLeft: 60,
            nearestThreatDistance: () => Infinity,
          },
          update: () => ({ ticks: 1, events: [{ type: 'caveComplete' }], outcome: CaveOutcome.Complete }),
          finishCave: () => ({
            caveIndex: 0, caveScore: 50, timeBonus: 60, totalScore: 110,
            secondsLeft: 60, diamonds: 5, extraLives: 0,
          }),
        },
      },
      controls: { sample: () => NO_INPUT, consumePause: () => false, consumeRestart: () => false, consumeTick: vi.fn() },
      render: { update: vi.fn() },
      scene: { start },
    });

    scene.update(0, 16);
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    expect(sound.sfx.caveComplete).toHaveBeenCalledOnce();
  });
});
