import { expect, it, vi } from 'vitest';
import { EffectsDirector } from './EffectsDirector';

vi.mock('phaser', () => ({ default: {} }));
vi.mock('./TextureFactory', () => ({ TextureKey: {} }));

it('drifts ambient dust slowly at normal frame times', () => {
  let y = 0;
  const mote = {
    setPosition: (_x: number, nextY: number) => { y = nextY; },
    setScale: vi.fn(), setAlpha: vi.fn(), setVisible: vi.fn(),
  };
  const effects: EffectsDirector = Object.create(EffectsDirector.prototype);
  Object.assign(effects, { reducedMotion: false, moteClock: 0, motes: [mote], moteSeeds: [0] });
  effects.update(0);
  const before = y;
  effects.update(16);
  expect(Math.abs(y - before)).toBeLessThan(1);
});
