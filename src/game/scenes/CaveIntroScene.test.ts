import { describe, expect, it, vi } from 'vitest';
import { CaveIntroScene } from './CaveIntroScene';
import { centred } from './ui';

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Input: { Events: { POINTER_DOWN: 'pointerdown' } },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  },
}));
vi.mock('../audio/index', () => ({ audio: () => ({ unlock: vi.fn() }) }));
vi.mock('../levels/index', () => ({ CAVE_COUNT: 20 }));
vi.mock('./ui', () => ({
  Ink: {},
  bodyStyle: () => ({}),
  titleStyle: () => ({}),
  card: vi.fn(),
  centred: vi.fn(),
  designY: (y: number) => y,
  relayoutOnResize: vi.fn(),
}));

describe('cave briefing', () => {
  it('shows the required mechanic and waits for deliberate confirmation', () => {
    const scene = new CaveIntroScene();
    const start = vi.fn();
    const keydown = vi.fn();
    Object.assign(scene, {
      registry: {
        get: () => ({
          session: {
            caveIndex: 9,
            lives: 3,
            spec: {
              letter: 'J', name: 'Crystal Chamber', difficulty: 3,
              diamondsRequired: 18, timeLimit: 120,
              objective: 'Contain the amoeba to grow your diamond supply.',
              hint: 'Seal its escape route before it spreads.',
              mechanics: ['boulder-pushing', 'amoeba'],
            },
          },
        }),
      },
      cameras: { main: { setBackgroundColor: vi.fn() } },
      input: { keyboard: { on: keydown }, once: vi.fn() },
      events: { once: vi.fn() },
      scene: { start },
    });

    scene.create();
    const text = vi.mocked(centred).mock.calls.map((call) => call[2]);
    expect(text).toContain('CHALLENGE 3/5');
    expect(text).toContain('Contain the amoeba to grow your diamond supply.');
    expect(text).toContain('BOULDER PUSHING / AMOEBA');
    expect(start).not.toHaveBeenCalled();

    const [, handler, context] = keydown.mock.calls[0];
    handler.call(context, { code: 'ArrowRight', repeat: false, preventDefault: vi.fn() });
    expect(start).not.toHaveBeenCalled();
    handler.call(context, { code: 'Enter', repeat: false, preventDefault: vi.fn() });
    expect(start).toHaveBeenCalledOnce();
  });
});
