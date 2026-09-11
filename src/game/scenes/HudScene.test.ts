import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LAYOUT, setLayout } from '../../layout';
import { HudScene } from './HudScene';

vi.mock('phaser', () => ({ default: { Scene: class {} } }));
vi.mock('../render/TextureFactory', () => ({ TextureKey: {} }));
vi.mock('./ui', () => ({
  Ink: { gold: '#gold', bright: '#bright', accent: '#accent', danger: '#danger', dim: '#dim' },
  pad: (value: number) => String(value),
}));

afterEach(() => vi.unstubAllGlobals());

describe('HUD progress', () => {
  it('scales the drawn quota bar rather than only changing its logical width', () => {
    setLayout(DEFAULT_LAYOUT);
    vi.stubGlobal('document', { fullscreenElement: null });
    const text = () => ({
      setText() { return this; },
      setColor() { return this; },
    });
    // Phaser shapes keep path geometry separate from their logical width.
    const progress = {
      width: 1,
      scaleX: 1,
      get displayWidth() { return this.scaleX; },
      set displayWidth(value: number) { this.scaleX = value; },
      setFillStyle: vi.fn(),
    };
    const hud = new HudScene();
    Object.assign(hud, {
      state: {
        session: {
          spec: { diamondsRequired: 10 },
          simulation: { runtime: { diamondsCollected: 5, caveScore: 0 }, secondsLeft: 60 },
          score: 0,
          lives: 3,
        },
      },
      progress,
      quota: text(), timer: text(), score: text(), lives: text(),
      fullscreenLabel: text(),
    });

    hud.update();
    expect(progress.displayWidth).toBe(DEFAULT_LAYOUT.width / 2);
    expect(progress.width).toBe(1);
  });
});
