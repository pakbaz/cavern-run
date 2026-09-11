import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameOverScene } from './GameOverScene';
import { TitleScene } from './TitleScene';

const display = vi.hoisted(() => ({
  text: [] as string[],
  shape: () => ({
    setOrigin() { return this; },
    setDepth() { return this; },
  }),
}));

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Input: { Events: { POINTER_DOWN: 'pointerdown' } },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  },
}));
vi.mock('../audio/index', () => ({ audio: vi.fn() }));
vi.mock('./BootScene', () => ({ POSTER_KEY: 'poster' }));
vi.mock('../render/TextureFactory', () => ({
  DIRT_VARIANTS: 8, PLAYER_IDLE_FRAMES: 8, TextureKey: {},
  cavityFrame: vi.fn(), edgeFrame: vi.fn(),
}));
vi.mock('../state/scores', () => ({
  loadHighScores: async () => [1, 5, 20].map((caveReached) => ({
    name: 'AAA', score: 100, caveReached, caveLetter: 'A', date: '2026-09-10',
  })),
  qualifies: () => false,
  normalizeInitials: vi.fn(),
  submitScore: vi.fn(),
}));
vi.mock('./ui', () => ({
  Ink: {}, Slab: {},
  bodyStyle: () => ({}), titleStyle: () => ({}),
  card: () => display.shape(), divider: () => display.shape(),
  centred: (_scene: unknown, _y: number, text: string) => {
    display.text.push(text);
    return display.shape();
  },
  designRowAt: (y: number) => y, designX: (x: number) => x,
  designY: (y: number) => y, menuScale: () => 1,
  pad: String, pulse: vi.fn(), onLayoutChanged: vi.fn(), relayoutOnResize: vi.fn(),
}));

beforeEach(() => {
  display.text = [];
  vi.stubGlobal('document', new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

describe('leaderboard stage labels', () => {
  it.each([['title', TitleScene], ['game over', GameOverScene]] as const)(
    '%s displays one-based API stages unchanged', async (_name, Scene) => {
    const scene = new Scene();
    Object.assign(scene, {
      registry: {
        get: () => ({
          session: { score: 0, spec: { letter: 'A', displayLabel: 'CAVE A' } },
          settings: { reducedMotion: true },
        }),
      },
      sys: { isActive: () => true },
      cameras: { main: { setBackgroundColor: vi.fn() } },
      input: { on: vi.fn(), keyboard: { on: vi.fn() } },
      events: { once: vi.fn() },
      unlocked: true, menuBottom: 0, ledgeTop: 700,
      drawBackdrop: vi.fn(), drawCrest: vi.fn(), buildMenu: vi.fn(),
      add: {
        text: (_x: number, _y: number, text: string) => {
          display.text.push(text);
          return display.shape();
        },
      },
    });
    await scene.create();
    expect(display.text.filter((text) => text.includes('STAGE '))
      .map((text) => Number(text.match(/STAGE (\d+)/)?.[1]))).toEqual([1, 5, 20]);
    },
  );
});
