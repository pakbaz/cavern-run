import { describe, expect, it } from 'vitest';

import { CaveSession } from '../game/engine/CaveSession';
import { CaveOutcome } from '../game/engine/simTypes';
import { Tile } from '../game/engine/tiles';
import { CAVES } from '../game/levels/index';
import { canReach, playCave, replayCave, type BotRun } from './bot';

/**
 * End-to-end proof that every cave can actually be won by playing it.
 *
 * Every other test drives one rule in isolation. These drive the whole stack
 * the way a player does -- birth, movement, digging, collection, the exit
 * opening, walking out -- through the same `update(dt, input)` the keyboard
 * feeds, with no forced outcomes and no writing to the grid.
 *
 * Cave seeds are derived from the cave id, so a win here is the same win a
 * player gets: the campaign is provably completable, cave by cave, and no
 * retuning can quietly ship a quota that cannot be met in the time allowed.
 */

describe('playing the caves', () => {
  const expectedWitness: Readonly<
    Record<string, Readonly<{ ticks: number; secondsLeft: number }>>
  > = {
    A: { ticks: 142, secondsLeft: 60 },
    B: { ticks: 98, secondsLeft: 43 },
    C: { ticks: 127, secondsLeft: 54 },
    D: { ticks: 201, secondsLeft: 59 },
    E: { ticks: 233, secondsLeft: 30 },
    F: { ticks: 266, secondsLeft: 62 },
    G: { ticks: 125, secondsLeft: 30 },
    H: { ticks: 233, secondsLeft: 52 },
    I: { ticks: 234, secondsLeft: 52 },
    J: { ticks: 182, secondsLeft: 49 },
    K: { ticks: 194, secondsLeft: 43 },
    L: { ticks: 298, secondsLeft: 51 },
    M: { ticks: 130, secondsLeft: 41 },
    N: { ticks: 261, secondsLeft: 19 },
    O: { ticks: 252, secondsLeft: 52 },
    P: { ticks: 235, secondsLeft: 44 },
    Q: { ticks: 215, secondsLeft: 42 },
    R: { ticks: 278, secondsLeft: 36 },
    S: { ticks: 244, secondsLeft: 30 },
    T: { ticks: 638, secondsLeft: 63 },
  };

  const amoebaCaves = CAVES.filter((cave) => cave.mechanics.includes('amoeba'));
  const utilizationBands: Readonly<Record<number, readonly [minimum: number, maximum: number]>> = {
    1: [0.18, 0.45],
    2: [0.2, 0.5],
    3: [0.22, 0.55],
    4: [0.25, 0.62],
    5: [0.4, 0.68],
  };

  const requiredMechanics: Readonly<
    Record<string, ReadonlyArray<readonly [label: string, count: (run: BotRun) => number, min: number]>>
  > = {
    A: [['digging', (run) => run.eventCounts.dig, 8]],
    B: [['rockfalls', (run) => run.eventCounts.land, 4]],
    C: [['boulder pushes', (run) => run.eventCounts.push, 1]],
    D: [['boulder pushes', (run) => run.eventCounts.push, 3]],
    E: [['firefly detonations', (run) => run.fireflyExplosions, 1]],
    F: [['firefly detonations', (run) => run.fireflyExplosions, 2]],
    G: [['butterfly diamond blasts', (run) => run.butterflyExplosions, 1]],
    H: [['magic-wall conversions', (run) => run.eventCounts.magicWallConvert, 7]],
    I: [['magic-wall conversions', (run) => run.eventCounts.magicWallConvert, 12]],
    J: [
      ['containment pushes', (run) => run.eventCounts.push, 2],
      ['amoeba crystallisations', (run) => run.amoebaDiamondResolutions, 1],
      ['harvest-door blasts', (run) => run.fireflyExplosions, 1],
    ],
    K: [['expanding-wall growth', (run) => run.eventCounts.expand, 6]],
    L: [
      ['expanding-wall growth', (run) => run.eventCounts.expand, 6],
      ['containment pushes', (run) => run.eventCounts.push, 2],
      ['amoeba crystallisations', (run) => run.amoebaDiamondResolutions, 1],
      ['harvest-door blasts', (run) => run.fireflyExplosions, 1],
    ],
    M: [
      ['slime passages', (run) => run.eventCounts.slime, 4],
      ['butterfly diamond blasts', (run) => run.butterflyExplosions, 4],
    ],
    N: [
      ['firefly detonations', (run) => run.fireflyExplosions, 1],
      ['butterfly diamond blasts', (run) => run.butterflyExplosions, 2],
    ],
    O: [
      ['containment pushes', (run) => run.eventCounts.push, 2],
      ['amoeba crystallisations', (run) => run.amoebaDiamondResolutions, 1],
      ['harvest-door blasts', (run) => run.fireflyExplosions, 1],
    ],
    P: [
      ['magic-wall conversions', (run) => run.eventCounts.magicWallConvert, 8],
      ['butterfly diamond blasts', (run) => run.butterflyExplosions, 1],
    ],
    Q: [['butterfly diamond blasts', (run) => run.butterflyExplosions, 3]],
    R: [['firefly detonations', (run) => run.fireflyExplosions, 2]],
    S: [
      ['slime passages', (run) => run.eventCounts.slime, 12],
      ['magic-wall conversions', (run) => run.eventCounts.magicWallConvert, 12],
    ],
    T: [
      ['slime passages', (run) => run.eventCounts.slime, 6],
      ['magic-wall conversions', (run) => run.eventCounts.magicWallConvert, 6],
      ['containment pushes', (run) => run.eventCounts.push, 2],
      ['butterfly diamond blasts', (run) => run.butterflyExplosions, 1],
      ['firefly detonations', (run) => run.fireflyExplosions, 1],
      ['amoeba crystallisations', (run) => run.amoebaDiamondResolutions, 1],
    ],
  };

  for (const spec of CAVES) {
    it(`cave ${spec.letter} can be played from birth to the exit`, () => {
      const run = new CaveSession([spec], 0, 3);

      const result = playCave(run);
      expect(
        { ticks: result.ticks, secondsLeft: result.secondsLeft },
        `${spec.letter}: seeded route metrics`,
      ).toEqual(expectedWitness[spec.letter]);

      expect(`${spec.letter}: ${result.outcome} ${result.diamonds}/${spec.diamondsRequired}`).toBe(
        `${spec.letter}: ${CaveOutcome.Complete} ${result.diamonds}/${spec.diamondsRequired}`,
      );
      expect(result.diamonds).toBeGreaterThanOrEqual(spec.diamondsRequired);
      expect(run.simulation.runtime.exitOpen).toBe(true);
      const elapsed = spec.timeLimit - result.secondsLeft;
      const utilization = elapsed / spec.timeLimit;
      const [minimumUtilization, maximumUtilization] = utilizationBands[spec.difficulty];
      expect(utilization, `${spec.letter}: clock must exert meaningful pressure`).toBeGreaterThanOrEqual(
        minimumUtilization,
      );
      expect(utilization, `${spec.letter}: clock must preserve a fair safety margin`).toBeLessThanOrEqual(
        maximumUtilization,
      );

      for (const [label, count, minimum] of requiredMechanics[spec.letter]) {
        expect(count(result), `${spec.letter}: ${label}`).toBeGreaterThanOrEqual(minimum);
      }

      if (spec.mechanics.includes('amoeba')) {
        const firstPush = result.eventTicks.push?.[0] ?? Number.POSITIVE_INFINITY;
        const resolution = result.amoebaDiamondResolutionTick ?? Number.NEGATIVE_INFINITY;
        expect(firstPush, `${spec.letter}: containment action`).toBeLessThan(resolution);
      }

      const replay = replayCave(new CaveSession([spec], 0, 3), result.inputs);
      expect(
        `${spec.letter}: ${replay.outcome} ${replay.diamonds} ${replay.ticks}`,
        `${spec.letter}: deterministic route witness`,
      ).toBe(`${spec.letter}: ${result.outcome} ${result.diamonds} ${result.ticks}`);
    });
  }

  it.each(amoebaCaves.map((cave) => [cave.letter, cave] as const))(
    'cave %s still has a live amoeba when the player is born',
    (_letter, spec) => {
      const run = new CaveSession([spec], 0, 3);
      while (!run.simulation.runtime.playerBorn) run.update(run.tickMs);

      expect(run.simulation.runtime.amoebaResolved).toBe(false);
      expect(run.simulation.cave.countTile(Tile.Amoeba)).toBeGreaterThan(0);
    },
  );

  it.each(amoebaCaves.map((cave) => [cave.letter, cave] as const))(
    'cave %s cannot crystallise without player containment',
    (_letter, spec) => {
      const run = new CaveSession([spec], 0, 3);
      const events = [];
      const scans = Math.ceil(spec.timeLimit * spec.tickHz);
      for (let i = 0; i < scans; i += 1) events.push(...run.update(run.tickMs).events);

      expect(
        events.some((event) => event.type === 'amoebaResolved' && event.into === Tile.Diamond),
      ).toBe(false);
    },
  );

  it('requires generated diamonds in every production cave', () => {
    for (const letter of ['G', 'H', 'I', 'J', 'L', 'M', 'N', 'O', 'P', 'Q', 'S', 'T']) {
      const spec = CAVES.find((cave) => cave.letter === letter);
      expect(spec).toBeDefined();
      const looseDiamonds = spec?.map.join('').split('d').length ?? 1;
      expect(looseDiamonds - 1, `${letter}: loose diamonds`).toBeLessThan(
        spec?.diamondsRequired ?? 0,
      );
    }
  });

  it.each([
    ['fireflies', /[fF]/g],
    ['butterflies', /[bB]/g],
    ['magic walls', /M/g],
    ['slime', /S/g],
    ['amoeba', /a/g],
  ] as const)('makes the finale impossible without its %s', (_mechanic, tiles) => {
    const finale = CAVES[CAVES.length - 1];
    const ablated = {
      ...finale,
      map: finale.map.map((row) => row.replace(tiles, 'W')),
    };

    const result = playCave(new CaveSession([ablated], 0, 3));
    expect(result.outcome).not.toBe(CaveOutcome.Complete);
  });

  const disabledMechanics = [
    ['fireflies', (row: string) => row.replace(/[fF]/g, 'W')],
    ['butterflies', (row: string) => row.replaceAll('b', 'f').replaceAll('B', 'F')],
    ['magic-wall', (row: string) => row.replaceAll('M', 'W')],
    ['slime', (row: string) => row.replaceAll('S', 'W')],
    ['amoeba', (row: string) => row.replaceAll('a', 'r')],
  ] as const;

  it.each(CAVES.flatMap((cave) => disabledMechanics
    .filter(([mechanic]) => cave.mechanics.includes(mechanic))
    .map(([mechanic, disable]) => [cave.letter, mechanic, cave, disable] as const)))(
    'cave %s needs its advertised %s production or access mechanic',
    (_letter, _mechanic, cave, disable) => {
      const disabled = { ...cave, map: cave.map.map(disable) };
      expect(playCave(new CaveSession([disabled])).outcome).not.toBe(CaveOutcome.Complete);
    },
  );

  it('banks a score and a time bonus for a cave that was really played', () => {
    const run = new CaveSession([CAVES[0]], 0, 3);

    playCave(run);
    const result = run.finishCave();

    expect(result.caveScore).toBeGreaterThan(0);
    expect(result.timeBonus).toBeGreaterThan(0);
    expect(result.totalScore).toBe(result.caveScore + result.timeBonus);
    expect(run.score).toBe(result.totalScore);
  });

  it('runs the whole campaign without a cave sealing its own exit', () => {
    // Left alone, no cave may close off its exit: expanding walls, the amoeba
    // and settling boulders all reshape the map, and a cave whose exit becomes
    // unreachable before the player gets there is unwinnable.
    for (const spec of CAVES) {
      const run = new CaveSession([spec], 0, 3);
      const scans = Math.ceil(spec.timeLimit * spec.tickHz);
      for (let i = 0; i < scans; i += 1) run.update(run.tickMs);

      const exitStandingOpen = canReach(
        run.simulation,
        (tile) => tile === Tile.ExitClosed || tile === Tile.ExitOpen,
      );
      expect(`${spec.letter}: ${exitStandingOpen}`).toBe(`${spec.letter}: true`);
    }
  });
});
