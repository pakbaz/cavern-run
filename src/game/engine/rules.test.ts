import { describe, expect, it } from 'vitest';

import { MagicWallStatus } from './simTypes';
import { Tile, isBoulder, isCreature, isDiamond } from './tiles';
import { eventsOfType, makeSim, run } from '../../test/harness';

describe('explosions', () => {
  it('clears a 3x3 hole but leaves steel standing', () => {
    const sim = makeSim([
      'WWWWWWW',
      'W  r  W',
      'W     W',
      'W..f..W',
      'W.....W',
      'WWWWWWW',
    ]);

    run(sim, 12);

    expect(sim.cave.get(0, 3)).toBe(Tile.Steel);
    expect(sim.cave.get(2, 3)).toBe(Tile.Empty);
    expect(sim.cave.get(3, 3)).toBe(Tile.Empty);
    expect(sim.cave.countWhere(isCreature)).toBe(0);
  });

  it('turns a crushed butterfly into a field of diamonds', () => {
    const sim = makeSim([
      'WWWWWWW',
      'W  r  W',
      'W     W',
      'W..b..W',
      'W.....W',
      'WWWWWWW',
    ]);

    const events = run(sim, 12);

    expect(eventsOfType(events, 'explode')[0].intoDiamonds).toBe(true);
    expect(sim.cave.countWhere(isDiamond)).toBeGreaterThanOrEqual(6);
  });

  it('chains through a butterfly nest', () => {
    const sim = makeSim([
      'WWWWWWW',
      'W     W',
      'WPbbb W',
      'W bbb W',
      'WWWWWWW',
    ]);

    run(sim, 14);

    expect(sim.cave.countWhere(isCreature)).toBe(0);
    expect(sim.cave.countWhere(isDiamond)).toBeGreaterThanOrEqual(10);
  });
});

describe('creatures', () => {
  it('detonates a butterfly that comes within reach of the player', () => {
    const sim = makeSim(['WWWWW', 'W   W', 'WPb W', 'W   W', 'WWWWW']);

    const events = run(sim, 1);

    expect(eventsOfType(events, 'explode')).toHaveLength(1);
    expect(sim.runtime.playerAlive).toBe(false);
  });

  it('keeps a firefly circling a closed loop indefinitely', () => {
    const sim = makeSim([
      'WWWWWW',
      'W    W',
      'W ww W',
      'W ww W',
      'W f  W',
      'WWWWWW',
    ]);

    run(sim, 60);

    expect(sim.cave.countWhere(isCreature)).toBe(1);
  });

  it('turns on the spot when boxed in rather than vanishing', () => {
    const sim = makeSim(['WWW', 'WfW', 'WWW']);

    run(sim, 5);

    expect(sim.cave.countWhere(isCreature)).toBe(1);
  });

  it('is deterministic for a given seed', () => {
    const rows = ['WWWWWW', 'W    W', 'W ww W', 'W f  W', 'WWWWWW'];
    const a = makeSim(rows, { seed: 99 });
    const b = makeSim(rows, { seed: 99 });

    run(a, 40);
    run(b, 40);

    expect(Array.from(a.cave.tiles)).toEqual(Array.from(b.cave.tiles));
  });
});

describe('the magic wall', () => {
  const rows = ['WWW', 'WrW', 'W W', 'WMW', 'W W', 'WWW'];

  it('converts a falling boulder into a diamond and drops it through', () => {
    const sim = makeSim(rows);

    run(sim, 2);

    expect(sim.runtime.magicWallStatus).toBe(MagicWallStatus.Active);
    expect(isDiamond(sim.cave.get(1, 4))).toBe(true);
  });

  it('ignores a boulder that is merely resting on it', () => {
    const sim = makeSim(['WWW', 'WrW', 'WMW', 'W W', 'WWW']);

    run(sim, 5);

    expect(sim.runtime.magicWallStatus).toBe(MagicWallStatus.Dormant);
    expect(sim.cave.get(1, 1)).toBe(Tile.Boulder);
  });

  it('goes inert once its charge runs out', () => {
    const sim = makeSim(rows, { tuning: { magicWallTicks: 2 } });

    const events = run(sim, 6);

    expect(sim.runtime.magicWallStatus).toBe(MagicWallStatus.Expired);
    expect(eventsOfType(events, 'magicWallStop')).toHaveLength(1);
  });

  it('swallows the object when there is no room underneath', () => {
    const sim = makeSim(['WWW', 'WrW', 'W W', 'WMW', 'WWW']);

    run(sim, 3);

    expect(sim.cave.countWhere((tile) => tile === Tile.Boulder)).toBe(0);
    expect(sim.cave.countWhere(isDiamond)).toBe(0);
  });
});

describe('slime', () => {
  it('lets objects seep through when permeable', () => {
    const sim = makeSim(['WWW', 'WrW', 'WSW', 'W W', 'WWW'], {
      tuning: { slimePermeability: 1 },
    });

    const events = run(sim, 2);

    expect(sim.cave.get(1, 3)).toBe(Tile.Boulder);
    expect(eventsOfType(events, 'slime')).toHaveLength(1);
  });

  it('holds objects up when impermeable', () => {
    const sim = makeSim(['WWW', 'WrW', 'WSW', 'W W', 'WWW'], {
      tuning: { slimePermeability: 0 },
    });

    run(sim, 10);

    expect(sim.cave.get(1, 1)).toBe(Tile.Boulder);
    expect(sim.cave.get(1, 3)).toBe(Tile.Empty);
  });
});

describe('expanding walls', () => {
  it('creeps sideways one cell per scan', () => {
    const sim = makeSim(['WWWWWWW', 'W  H  W', 'WWWWWWW']);

    run(sim, 1);
    expect(sim.cave.get(2, 1)).toBe(Tile.ExpandingWallH);
    expect(sim.cave.get(4, 1)).toBe(Tile.ExpandingWallH);
    expect(sim.cave.get(1, 1)).toBe(Tile.Empty);

    run(sim, 1);
    expect(sim.cave.get(1, 1)).toBe(Tile.ExpandingWallH);
  });

  it('does not creep vertically when it is a horizontal wall', () => {
    const sim = makeSim(['WWW', 'W W', 'WHW', 'W W', 'WWW']);

    run(sim, 4);

    expect(sim.cave.get(1, 1)).toBe(Tile.Empty);
    expect(sim.cave.get(1, 3)).toBe(Tile.Empty);
  });

  it('creeps in all four directions for the omnidirectional variant', () => {
    const sim = makeSim(['WWWWW', 'W   W', 'W X W', 'W   W', 'WWWWW']);

    run(sim, 1);

    expect(sim.cave.get(1, 2)).toBe(Tile.ExpandingWallAny);
    expect(sim.cave.get(3, 2)).toBe(Tile.ExpandingWallAny);
    expect(sim.cave.get(2, 1)).toBe(Tile.ExpandingWallAny);
    expect(sim.cave.get(2, 3)).toBe(Tile.ExpandingWallAny);
  });
});

describe('the amoeba', () => {
  it('crystallises into diamonds when it is completely walled in', () => {
    const sim = makeSim(['WWW', 'WaW', 'WWW']);

    const events = run(sim, 1);

    expect(sim.cave.get(1, 1)).toBe(Tile.Diamond);
    expect(eventsOfType(events, 'amoebaResolved')[0].into).toBe(Tile.Diamond);
    expect(sim.runtime.amoebaResolved).toBe(true);
  });

  it('collapses into boulders once it outgrows its cap', () => {
    const sim = makeSim([
      'WWWWWWWW',
      'W......W',
      'W..a...W',
      'W......W',
      'W......W',
      'WWWWWWWW',
    ], { tuning: { amoebaMaxSize: 6, amoebaSlowGrowthTicks: 0, amoebaGrowthChance: 1 } });

    const events = run(sim, 30);

    expect(eventsOfType(events, 'amoebaResolved')[0].into).toBe(Tile.Boulder);
    expect(sim.cave.countTile(Tile.Amoeba)).toBe(0);
    expect(sim.cave.countWhere(isBoulder)).toBeGreaterThanOrEqual(6);
  });

  it('cannot breach steel, and crystallises once it has filled its pocket', () => {
    const sim = makeSim(['WWWWW', 'W...W', 'W.a.W', 'W...W', 'WWWWW'], {
      tuning: {
        amoebaSlowGrowthTicks: 0,
        amoebaGrowthChance: 1,
        amoebaMaxSize: 999,
      },
    });

    run(sim, 40);

    expect(sim.cave.countTile(Tile.Amoeba)).toBe(0);
    expect(sim.cave.countWhere(isDiamond)).toBe(9);
    expect(sim.cave.countTile(Tile.Steel)).toBe(16);
  });

  it('creeps slowly during the slow-growth window', () => {
    const rows = ['WWWWWWWW', 'W......W', 'W..a...W', 'W......W', 'WWWWWWWW'];
    const slow = makeSim(rows, {
      tuning: { amoebaSlowGrowthTicks: 1000, amoebaSlowGrowthChance: 0, amoebaMaxSize: 999 },
    });

    run(slow, 20);

    expect(slow.cave.countTile(Tile.Amoeba)).toBe(1);
  });
});
