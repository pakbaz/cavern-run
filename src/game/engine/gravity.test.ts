import { describe, expect, it } from 'vitest';

import { Dir, Tile } from './tiles';
import { eventsOfType, input, makeSim, run } from '../../test/harness';

describe('gravity', () => {
  it('drops a boulder one cell per scan', () => {
    const sim = makeSim(['WWW', 'WrW', 'W W', 'W W', 'WWW']);

    run(sim, 1);
    expect(sim.cave.get(1, 2)).toBe(Tile.BoulderFalling);

    run(sim, 1);
    expect(sim.cave.get(1, 3)).toBe(Tile.BoulderFalling);
  });

  it('settles a boulder that lands on solid ground', () => {
    const sim = makeSim(['WWW', 'WrW', 'W W', 'WWW']);

    const events = run(sim, 2);

    expect(sim.cave.get(1, 2)).toBe(Tile.Boulder);
    expect(eventsOfType(events, 'land')).toHaveLength(1);
  });

  it('keeps a falling stack together', () => {
    const sim = makeSim(['WWWWW', 'W r W', 'W r W', 'W   W', 'W   W', 'WWWWW']);

    run(sim, 1);

    expect(sim.cave.get(1, 2)).toBe(Tile.Empty);
    expect(sim.cave.get(2, 2)).toBe(Tile.BoulderFalling);
    expect(sim.cave.get(2, 3)).toBe(Tile.BoulderFalling);
  });

  it('rolls off a rounded surface, preferring left', () => {
    const sim = makeSim(['WWWWW', 'W r W', 'W r W', 'WWWWW']);

    run(sim, 1);

    expect(sim.cave.get(1, 1)).toBe(Tile.BoulderFalling);
    expect(sim.cave.get(2, 1)).toBe(Tile.Empty);
  });

  it('rolls right when the left side is blocked', () => {
    const sim = makeSim(['WWWWW', 'Wwr W', 'W r W', 'WWWWW']);

    run(sim, 1);

    expect(sim.cave.get(3, 1)).toBe(Tile.BoulderFalling);
  });

  it('does not roll off a flat surface such as steel or dirt', () => {
    const sim = makeSim(['WWWWW', 'W r W', 'W W W', 'W   W', 'WWWWW']);

    run(sim, 3);

    expect(sim.cave.get(2, 1)).toBe(Tile.Boulder);
  });

  it('does not roll when the landing cell below the side is occupied', () => {
    const sim = makeSim(['WWWWW', 'W r W', 'WrrrW', 'WrrrW', 'WWWWW']);

    run(sim, 2);

    expect(sim.cave.get(2, 1)).toBe(Tile.Boulder);
  });
});

describe('gravity and the player', () => {
  it('kills the player with a falling boulder', () => {
    const sim = makeSim(['WWWWW', 'W r W', 'W   W', 'W P W', 'WWWWW']);

    const events = run(sim, 3);

    expect(sim.runtime.playerAlive).toBe(false);
    expect(eventsOfType(events, 'playerDied')).toHaveLength(1);
  });

  it('leaves the player safe beneath a boulder that is only resting', () => {
    const sim = makeSim(['WWWWW', 'W r W', 'W P W', 'WWWWW']);

    run(sim, 20);

    expect(sim.runtime.playerAlive).toBe(true);
    expect(sim.cave.get(2, 1)).toBe(Tile.Boulder);
  });

  it('starts the boulder falling as soon as the player steps aside', () => {
    const sim = makeSim(['WWWWW', 'W r W', 'W P W', 'W   W', 'WWWWW']);

    // The player acts before gravity within a scan, so the boulder drops into
    // the cell they just vacated in that same scan.
    run(sim, 1, input(Dir.Left));

    expect(sim.runtime.playerX).toBe(1);
    expect(sim.cave.get(2, 2)).toBe(Tile.BoulderFalling);

    run(sim, 1);
    expect(sim.cave.get(2, 3)).toBe(Tile.BoulderFalling);
  });
});
