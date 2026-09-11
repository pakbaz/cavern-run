import { describe, expect, it } from 'vitest';

import { CaveSession } from '../game/engine/CaveSession';
import { CaveOutcome } from '../game/engine/simTypes';
import { DIR_DX, DIR_DY, Tile, isButterfly, isDiamond, isFalling } from '../game/engine/tiles';
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
    A: { ticks: 206, secondsLeft: 51 },
    B: { ticks: 98, secondsLeft: 43 },
    C: { ticks: 127, secondsLeft: 54 },
    D: { ticks: 201, secondsLeft: 59 },
    E: { ticks: 233, secondsLeft: 30 },
    F: { ticks: 248, secondsLeft: 64 },
    G: { ticks: 125, secondsLeft: 30 },
    H: { ticks: 233, secondsLeft: 52 },
    I: { ticks: 244, secondsLeft: 51 },
    J: { ticks: 174, secondsLeft: 50 },
    K: { ticks: 194, secondsLeft: 43 },
    L: { ticks: 298, secondsLeft: 51 },
    M: { ticks: 260, secondsLeft: 25 },
    N: { ticks: 261, secondsLeft: 19 },
    O: { ticks: 238, secondsLeft: 54 },
    P: { ticks: 235, secondsLeft: 44 },
    Q: { ticks: 275, secondsLeft: 35 },
    R: { ticks: 220, secondsLeft: 42 },
    S: { ticks: 190, secondsLeft: 26 },
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

  it('advances a normally played campaign through every letter exactly once', () => {
    const session = new CaveSession(CAVES);
    const visited: string[] = [];
    for (let index = 0; index < CAVES.length; index += 1) {
      expect(session.caveIndex).toBe(index);
      expect(session.spec).toBe(CAVES[index]);
      visited.push(session.spec.letter);
      expect(playCave(session).outcome).toBe(CaveOutcome.Complete);
      expect(session.finishCave().caveIndex).toBe(index);
      expect(session.advanceCave()).toBe(index < CAVES.length - 1);
    }
    expect(visited.join('')).toBe('ABCDEFGHIJKLMNOPQRST');
    expect(session.spec.letter).toBe('T');
  });

  it.each(CAVES.filter((cave) => ['F', 'R'].includes(cave.letter)).flatMap((cave) =>
    cave.map.flatMap((row, y) => [...row].flatMap((tile, x) =>
      /[fF]/.test(tile) ? [[cave.letter, x, y, cave] as const] : [],
    )),
  ))('cave %s needs the individual demolition charge at %i,%i', (_letter, x, y, cave) => {
    const disabled = {
      ...cave,
      map: cave.map.map((row, rowY) =>
        rowY === y ? `${row.slice(0, x)}W${row.slice(x + 1)}` : row,
      ),
    };
    expect(playCave(new CaveSession([disabled])).outcome).not.toBe(CaveOutcome.Complete);
  });

  it('relays I through three separated terraces on one charge', () => {
    const cave = CAVES.find((spec) => spec.letter === 'I')!;
    const result = playCave(new CaveSession([cave]));
    const conversions = result.events.filter((event) => event.type === 'magicWallConvert');
    const terraceRows = [...new Set(conversions.map((event) => event.y))].sort((a, b) => a - b);
    expect(terraceRows).toHaveLength(3);
    expect(terraceRows.map((y) => conversions.filter((event) => event.y === y).length))
      .toEqual([4, 4, 4]);
    const meanX = terraceRows.map((y) =>
      conversions.filter((event) => event.y === y).reduce((sum, event) => sum + event.x, 0) / 4,
    );
    expect(meanX[1] - Math.max(meanX[0], meanX[2])).toBeGreaterThan(15);
    expect(result.eventCounts.magicWallStart).toBe(1);
    expect(result.eventCounts.magicWallStop).toBe(0);
  });

  it.each(CAVES.filter((cave) => ['M', 'Q'].includes(cave.letter)).flatMap((cave) =>
    cave.map.flatMap((row, y) => [...row].flatMap((tile, x) =>
      /[bB]/.test(tile) ? [[cave.letter, x, y, cave] as const] : [],
    )),
  ))('cave %s needs each butterfly yield, including %i,%i', (_letter, x, y, cave) => {
    const disabled = {
      ...cave,
      map: cave.map.map((row, rowY) =>
        rowY === y ? `${row.slice(0, x)}f${row.slice(x + 1)}` : row,
      ),
    };
    expect(playCave(new CaveSession([disabled])).outcome).not.toBe(CaveOutcome.Complete);
  });

  it('makes all three Q butterflies patrol their courts before the first timed rockfall', () => {
    const cave = CAVES.find((spec) => spec.letter === 'Q')!;
    const result = playCave(new CaveSession([cave]));
    const replay = new CaveSession([cave]);
    const courts = [
      { left: 4, top: 5, right: 13, bottom: 10 },
      { left: 22, top: 3, right: 35, bottom: 7 },
      { left: 16, top: 13, right: 24, bottom: 19 },
    ];
    const visited = courts.map(() => new Set<string>());
    let patrolWaits = 0;
    for (const input of result.inputs) {
      if (replay.simulation.runtime.playerBorn && input.dir === null) patrolWaits += 1;
      const update = replay.update(replay.tickMs, input);
      for (const move of replay.simulation.cave.moves) {
        if (!isButterfly(move.tile)) continue;
        courts.forEach((court, index) => {
          if (move.toX > court.left && move.toX < court.right &&
              move.toY > court.top && move.toY < court.bottom) {
            visited[index].add(`${move.toX},${move.toY}`);
          }
        });
      }
      if (update.events.some((event) => event.type === 'explode')) break;
    }
    for (const positions of visited) expect(positions.size).toBeGreaterThanOrEqual(8);
    expect(patrolWaits).toBeGreaterThan(0);
    expect(result.butterflyExplosions).toBe(3);
  });

  it.each([['J', 5, 10], ['O', 9, 13]] as const)(
    'keeps %s plugged on permanent steel while its chambers crystallise',
    (letter, x, y) => {
      const cave = CAVES.find((spec) => spec.letter === letter)!;
      const result = playCave(new CaveSession([cave]));
      const replay = new CaveSession([cave]);
      let pushes = 0;
      let supportedScans = 0;
      for (const input of result.inputs) {
        const update = replay.update(replay.tickMs, input);
        pushes += update.events.filter((event) => event.type === 'push').length;
        if (pushes >= 2) {
          expect(replay.simulation.cave.get(x, y)).toBe(Tile.Boulder);
          expect(replay.simulation.cave.get(x, y + 1)).toBe(Tile.Steel);
          if (!replay.simulation.runtime.amoebaResolved) supportedScans += 1;
        }
      }
      expect(supportedScans).toBeGreaterThan(0);
      if (letter === 'O') {
        const crystals = result.events.filter((event) => event.type === 'diamond');
        expect(crystals.some((event) => event.y === 4)).toBe(true);
        expect(crystals.some((event) => event.y === 9)).toBe(true);
      }
      expect(result.eventTicks.explode![0]).toBeGreaterThan(result.amoebaDiamondResolutionTick!);
    },
  );

  it('drains six stones per S silo without stepping beneath a descending stack', () => {
    const cave = CAVES.find((spec) => spec.letter === 'S')!;
    const result = playCave(new CaveSession([cave]));
    for (const events of [
      result.events.filter((event) => event.type === 'slime'),
      result.events.filter((event) => event.type === 'magicWallConvert'),
    ]) {
      const columns = [...new Set(events.map((event) => event.x))];
      expect(columns).toHaveLength(2);
      expect(columns.map((x) => events.filter((event) => event.x === x).length)).toEqual([6, 6]);
    }

    const replay = new CaveSession([cave]);
    let fallingStackAvoidances = 0;
    for (const input of result.inputs) {
      const { cave: grid, runtime } = replay.simulation;
      for (const dir of [1, 3] as const) {
        const x = runtime.playerX + DIR_DX[dir];
        const y = runtime.playerY + DIR_DY[dir];
        if (isDiamond(grid.get(x, y)) && isFalling(grid.get(x, y - 1))) {
          expect(input.dir !== dir || input.grab).toBe(true);
          fallingStackAvoidances += 1;
        }
      }
      replay.update(replay.tickMs, input);
    }
    expect(fallingStackAvoidances).toBeGreaterThan(0);
    expect(replay.outcome).toBe(CaveOutcome.Complete);
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
