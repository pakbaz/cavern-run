import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TitleScene } from './TitleScene';
import { loadHighScores } from '../state/scores';

const fakes = vi.hoisted(() => {
  const shape = (x = 0, y = 0, text = '') => {
    const handlers = new Map<string, () => void>();
    const item = {
      x, y, text, handlers,
      setDepth() { return this; }, setOrigin() { return this; },
      setInteractive() { return this; }, setVisible() { return this; },
      setColor() { return this; }, clear() { return this; },
      fillStyle() { return this; }, fillRect() { return this; },
      fillRoundedRect() { return this; }, destroy() {},
      setText(value: string) { this.text = value; return this; },
      on(event: string, handler: () => void) { handlers.set(event, handler); return this; },
    };
    return item;
  };
  return {
    shape,
    audio: {
      unlock: vi.fn(),
      engine: { setMusicVolume: vi.fn(), setSfxVolume: vi.fn() },
      sfx: { uiMove: vi.fn(), uiSelect: vi.fn() },
    },
  };
});

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Input: { Events: { POINTER_DOWN: 'pointerdown', POINTER_MOVE: 'pointermove' } },
    Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
  },
}));
vi.mock('../audio/index', () => ({ audio: () => fakes.audio }));
vi.mock('./BootScene', () => ({ POSTER_KEY: 'poster' }));
vi.mock('../render/TextureFactory', () => ({
  DIRT_VARIANTS: 8, PLAYER_IDLE_FRAMES: 8, TextureKey: {},
  cavityFrame: vi.fn(), edgeFrame: vi.fn(),
}));
vi.mock('../state/scores', () => ({ loadHighScores: vi.fn() }));
vi.mock('../state/settings', () => ({ saveSettings: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./ui', () => ({
  Ink: {}, Slab: {}, bodyStyle: () => ({}), titleStyle: () => ({}),
  card: () => fakes.shape(), centred: (_scene: unknown, y: number, text: string) => fakes.shape(320, y, text),
  designRowAt: (y: number) => y, designX: (x: number) => x + 320,
  designY: (y: number) => y, menuScale: () => 1,
  divider: () => fakes.shape(), pad: String, pulse: vi.fn(), onLayoutChanged: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fakes.audio.sfx.uiSelect.mockReset();
  vi.mocked(loadHighScores).mockResolvedValue([]);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { fullscreenEnabled: true, fullscreenElement: null }));
});
afterEach(() => vi.unstubAllGlobals());

function harness() {
  const scene = new TitleScene();
  const keyboard = { on: vi.fn(), off: vi.fn() };
  const rows: ReturnType<typeof fakes.shape>[] = [];
  const newRun = vi.fn();
  const drawScores = vi.fn();
  const drawScoresUnavailable = vi.fn();
  const life = { active: true };
  const state = {
    progress: { furthestCave: 0 },
    settings: { musicVolume: 1, sfxVolume: 1, lighting: true, reducedMotion: true },
    newRun, resumeRun: vi.fn(),
  };
  Object.assign(scene, {
    registry: { get: () => state },
    scale: { displayScale: { y: 1 } },
    sys: { isActive: () => life.active, game: { device: { input: { touch: true } } } },
    input: { keyboard, on: vi.fn(), off: vi.fn() },
    events: { once: vi.fn() },
    scene: { start: vi.fn(() => { life.active = false; }) },
    drawBackdrop: () => Object.assign(scene, { ledgeTop: 700 }),
    drawCrest: vi.fn(), drawScores, drawScoresUnavailable,
    add: {
      text: (x: number, y: number, value: string) => fakes.shape(x, y, value),
      graphics: () => fakes.shape(),
      rectangle: (x: number, y: number) => {
        const row = fakes.shape(x, y);
        rows.push(row);
        return row;
      },
    },
  });
  return { scene, state, rows, keyboard, newRun, drawScores, drawScoresUnavailable, life };
}

describe('title controls', () => {
  it('starts on the first deliberate tap, without consuming it to unlock sound', async () => {
    const h = harness();
    await h.scene.create();
    h.rows[0].handlers.get('pointerdown')!();
    expect(fakes.audio.unlock).toHaveBeenCalledOnce();
    expect(h.newRun).toHaveBeenCalledOnce();
  });

  it('uses the first Enter press but ignores activation autorepeat', async () => {
    const h = harness();
    await h.scene.create();
    const [, onKey, context] = h.keyboard.on.mock.calls[0];
    onKey.call(context, { code: 'Enter', repeat: false, preventDefault: vi.fn() });
    onKey.call(context, { code: 'Enter', repeat: true, preventDefault: vi.fn() });
    expect(h.newRun).toHaveBeenCalledOnce();
  });

  it('lets touch players cycle both volume rows through mute', async () => {
    const h = harness();
    await h.scene.create();
    h.rows[1].handlers.get('pointerdown')!();
    h.rows[2].handlers.get('pointerdown')!();
    expect(h.state.settings.musicVolume).toBe(0);
    expect(h.state.settings.sfxVolume).toBe(0);
    h.rows[1].handlers.get('pointerdown')!();
    expect(h.state.settings.musicVolume).toBe(0.2);
  });

  it('does not let a failed optional beep swallow the chosen action or its error', async () => {
    const h = harness();
    await h.scene.create();
    fakes.audio.sfx.uiSelect.mockImplementation(() => { throw new Error('Broken audio graph'); });
    expect(() => h.rows[0].handlers.get('pointerdown')!()).toThrow('Broken audio graph');
    expect(h.newRun).toHaveBeenCalledOnce();
  });

  it('does not draw a late score response into an inactive scene', async () => {
    let resolve!: (scores: []) => void;
    vi.mocked(loadHighScores).mockReturnValueOnce(new Promise<[]>((done) => { resolve = done; }));
    const h = harness();
    const loading = h.scene.create();
    h.life.active = false;
    resolve([]);
    await loading;
    expect(h.drawScores).not.toHaveBeenCalled();
  });

  it('surfaces render errors rather than labelling them as an offline leaderboard', async () => {
    const h = harness();
    h.drawScores.mockImplementation(() => { throw new Error('Broken score rendering'); });
    await expect(h.scene.create()).rejects.toThrow('Broken score rendering');
    expect(h.drawScoresUnavailable).not.toHaveBeenCalled();
  });
});
