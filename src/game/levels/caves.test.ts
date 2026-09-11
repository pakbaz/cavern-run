import { describe, expect, it } from 'vitest';

import { CAVE_HEIGHT, CAVE_WIDTH, PALETTES } from '../../config';
import { Tile } from '../engine/tiles';
import { buildCave, parseCaveMap, validateCave } from './caveFormat';
import { CAVES, CAVE_COUNT, caveAt } from './index';

/**
 * Compare actual interior barriers, not the shared steel border or dirt fill.
 * Translation/reflection invariance prevents a shifted or mirrored template
 * from passing as a new puzzle; tile substitutions do not change occupancy.
 */
function structuralSimilarity(a: readonly string[], b: readonly string[]): number {
  const occupied = (map: readonly string[]) => map.flatMap((row, y) =>
    [...row].flatMap((tile, x) =>
      y > 0 && y < map.length - 1 && x > 0 && x < row.length - 1 && /[WwMSHVX]/.test(tile)
        ? [[x, y] as const]
        : [],
    ),
  );
  const left = occupied(a);
  const right = occupied(b);
  let overlap = 0;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const offsets = new Map<string, number>();
      for (const [ax, ay] of left) {
        for (const [bx, by] of right) {
          const offset = `${ax - bx * sx},${ay - by * sy}`;
          const count = (offsets.get(offset) ?? 0) + 1;
          offsets.set(offset, count);
          overlap = Math.max(overlap, count);
        }
      }
    }
  }
  return (2 * overlap) / (left.length + right.length);
}

describe('the campaign', () => {
  it('uses a cave-wide rock-and-diamond field for the introductory cave', () => {
    const first = CAVES[0];
    expect(first.diamondsRequired).toBe(12);
    expect(first.map.join('').split('r').length - 1).toBeGreaterThanOrEqual(75);
    expect(first.map.join('').split('d').length - 1).toBeGreaterThanOrEqual(25);
    for (const [top, bottom] of [[1, 7], [7, 14], [14, 21]]) {
      const band = first.map.slice(top, bottom).join('');
      expect(band.split('r').length - 1).toBeGreaterThanOrEqual(15);
      expect(band.split('d').length - 1).toBeGreaterThanOrEqual(5);
    }
    expect(first.mechanics).toContain('gravity');
  });

  it('ships twenty stages with stable storage keys A through T', () => {
    expect(CAVE_COUNT).toBe(20);
    expect(CAVES.map((cave) => cave.letter).join('')).toBe('ABCDEFGHIJKLMNOPQRST');
  });

  it('gives every cave a unique id and a real palette', () => {
    const ids = new Set(CAVES.map((cave) => cave.id));
    const layouts = new Set(CAVES.map((cave) => cave.map.join('\n')));
    expect(ids.size).toBe(CAVES.length);
    expect(layouts.size).toBe(CAVES.length);
    for (const cave of CAVES) {
      expect(PALETTES[cave.paletteId], `${cave.id} palette`).toBeDefined();
      expect(cave.name.length).toBeGreaterThan(0);
      expect(cave.hint.length).toBeGreaterThan(0);
      expect(cave.objective.length).toBeGreaterThan(0);
      expect(cave.mechanics.length).toBeGreaterThan(0);
    }
  });

  it('clamps out-of-range lookups instead of throwing', () => {
    expect(caveAt(-5)).toBe(CAVES[0]);
    expect(caveAt(999)).toBe(CAVES[CAVES.length - 1]);
    expect(caveAt(3)).toBe(CAVES[3]);
  });

  it.each(['BC', 'LQ', 'RS'])(
    'keeps related reference structures distinct: %s',
    (pair) => {
      const [a, b] = [...pair].map((letter) => CAVES.find((cave) => cave.letter === letter)!);
      expect(structuralSimilarity(a.map, b.map), `${pair}: aligned structural Dice similarity`)
        .toBeLessThan(0.68);
    },
  );

  it('cannot disguise a reused structure with dirt, tile swaps, shifts or reflection', () => {
    const original = ['WWWWWWW', 'W.W...W', 'W.WW..W', 'W.....W', 'WWWWWWW'];
    const disguised = ['WWWWWWW', 'W.....W', 'W...w.W', 'W..MM.W', 'WWWWWWW'];
    expect(structuralSimilarity(original, disguised)).toBe(1);
    const different = ['WWWWWWW', 'W.W...W', 'W.W...W', 'W.W...W', 'WWWWWWW'];
    expect(structuralSimilarity(original, different)).toBeLessThan(0.68);
  });

  it.each(CAVES.map((cave) => [cave.letter, cave] as const))('cave %s validates', (_letter, cave) => {
    expect(validateCave(cave)).toEqual([]);
  });

  it.each(CAVES.map((cave) => [cave.letter, cave] as const))(
    'cave %s is the right shape and builds a grid',
    (_letter, cave) => {
      const parsed = parseCaveMap(cave.map);
      expect(parsed.width).toBe(CAVE_WIDTH);
      expect(parsed.height).toBe(CAVE_HEIGHT);

      const grid = buildCave(cave);
      expect(grid.countTile(Tile.Player)).toBe(1);
      expect(grid.countTile(Tile.ExitClosed)).toBe(1);
    },
  );

  it('increases pace and average quota across the regular caves', () => {
    const regular = CAVES.filter((cave) => cave.stageKind === 'cave');
    const first = regular.slice(0, 4);
    const last = regular.slice(-4);

    const avg = (list: readonly number[]) => list.reduce((a, b) => a + b, 0) / list.length;

    expect(avg(last.map((c) => c.diamondsRequired))).toBeGreaterThan(
      avg(first.map((c) => c.diamondsRequired)),
    );
    expect(avg(last.map((c) => c.tickHz))).toBeGreaterThan(avg(first.map((c) => c.tickHz)));
  });

  it('raises simulation speed gradually without sudden difficulty spikes', () => {
    for (let i = 1; i < CAVES.length; i += 1) {
      const increase = CAVES[i].tickHz - CAVES[i - 1].tickHz;
      expect(increase, `${CAVES[i - 1].letter} -> ${CAVES[i].letter}`).toBeGreaterThanOrEqual(0);
      expect(increase, `${CAVES[i - 1].letter} -> ${CAVES[i].letter}`).toBeLessThanOrEqual(0.25);
      expect(CAVES[i].difficulty, `${CAVES[i - 1].letter} -> ${CAVES[i].letter}`).toBeGreaterThanOrEqual(
        CAVES[i - 1].difficulty,
      );
    }
  });

  it('backs every advertised special mechanic with authored cave tiles', () => {
    const chars = {
      gravity: ['r', 'd'],
      'boulder-pushing': ['r'],
      fireflies: ['f', 'F'],
      butterflies: ['b', 'B'],
      'magic-wall': ['M'],
      amoeba: ['a'],
      'expanding-wall': ['H', 'V', 'X'],
      slime: ['S'],
    } as const;

    for (const cave of CAVES) {
      const map = cave.map.join('');
      for (const mechanic of cave.mechanics) {
        if (mechanic === 'digging') continue;
        expect(
          chars[mechanic].some((char) => map.includes(char)),
          `${cave.letter}: ${mechanic}`,
        ).toBe(true);
      }
    }
  });

  it('makes required boulder-pushing gates deterministic across input methods', () => {
    for (const cave of CAVES.filter((candidate) =>
      candidate.mechanics.includes('boulder-pushing'),
    )) {
      expect(cave.pushChance, `${cave.letter}: push chance`).toBe(1);
    }
  });

  it('introduces mechanics gradually', () => {
    const usesChar = (index: number, char: string) =>
      CAVES[index].map.some((row) => row.includes(char));

    // The first three reference caves teach digging and rock handling.
    for (let i = 0; i < 3; i += 1) {
      for (const char of ['f', 'F', 'b', 'B', 'a', 'M', 'S', 'H', 'V', 'X']) {
        expect(usesChar(i, char), `cave ${CAVES[i].letter} must not use '${char}'`).toBe(false);
      }
    }

    expect(usesChar(3, 'b') || usesChar(3, 'B')).toBe(true);
    expect(usesChar(7, 'a')).toBe(true);
    expect(usesChar(8, 'M')).toBe(true);
    expect(CAVES[19].stageKind).toBe('intermission');
    expect(usesChar(19, 'M')).toBe(true);
  });
});

describe('validateCave', () => {
  const good = CAVES[0];

  it('rejects a cave with no player', () => {
    const broken = { ...good, map: good.map.map((row) => row.replace('P', '.')) };
    expect(validateCave(broken).join()).toContain('expected exactly 1 player');
  });

  it('rejects a cave whose border has been breached', () => {
    const map = [...good.map];
    map[0] = `${'.'.repeat(1)}${map[0].slice(1)}`;
    expect(validateCave({ ...good, map }).join()).toContain('border must be solid steel');
  });

  it('rejects a quota the cave cannot possibly satisfy', () => {
    expect(validateCave({ ...good, diamondsRequired: 5000 }).join()).toContain('quota of 5000');
  });

  it('counts destructible butterfly footprints without crediting steel cheeks', () => {
    const grid: string[][] = Array.from({ length: CAVE_HEIGHT }, (_, y) =>
      Array.from({ length: CAVE_WIDTH }, (_, x) =>
        x === 0 || y === 0 || x === CAVE_WIDTH - 1 || y === CAVE_HEIGHT - 1 ? 'W' : '.',
      ),
    );
    grid[1][1] = 'P';
    grid[1][5] = 'E';
    grid[1][3] = 'r';
    grid[3][3] = 'b';
    for (const x of [2, 3, 4]) grid[4][x] = 'W';
    const reinforced = { ...good, map: grid.map((row) => row.join('')), diamondsRequired: 6 };
    expect(validateCave(reinforced)).toEqual([]);
    expect(validateCave({ ...reinforced, diamondsRequired: 7 }).join())
      .toContain('quota of 7 exceeds the 6 diamonds');
    for (const x of [2, 3, 4]) grid[4][x] = 'w';
    expect(validateCave({ ...reinforced, map: grid.map((row) => row.join('')), diamondsRequired: 9 }))
      .toEqual([]);
  });

  it('will not count on an amoeba with more room than it can fill', () => {
    // An amoeba only turns to diamonds once it has run out of space. Give it a
    // chamber bigger than amoebaMaxSize and it hits its ceiling and turns to
    // stone instead, so it must earn the cave no credit at all. Cave O once
    // shipped a quota that only an over-sized amoeba could have met.
    const map = [...good.map.map((row) => row.replace(/d/g, '.'))];
    map[10] = `${map[10].slice(0, 20)}a${map[10].slice(21)}`;

    const roomy = validateCave({ ...good, map, diamondsRequired: 10, amoebaMaxSize: 8 });
    expect(roomy.join()).toContain('quota of 10');

    const boxed = validateCave({ ...good, map, diamondsRequired: 10, amoebaMaxSize: 5000 });
    expect(boxed).toEqual([]);
  });

  it('rejects an unknown map character', () => {
    const map = [...good.map];
    map[5] = `W${'?'.repeat(CAVE_WIDTH - 2)}W`;
    expect(validateCave({ ...good, map }).join()).toContain("Unknown cave character '?'");
  });

  it('rejects a walled-off exit', () => {
    const map = good.map.map((row) => row.replace('E', '.'));
    map[10] = `${map[10].slice(0, 20)}E${map[10].slice(21)}`;
    // Seal the exit inside steel.
    for (const y of [9, 10, 11]) {
      const row = map[y].split('');
      for (const x of [19, 21]) row[x] = 'W';
      if (y !== 10) {
        row[20] = 'W';
      }
      map[y] = row.join('');
    }
    expect(validateCave({ ...good, map }).join()).toContain('exit cannot be reached');
  });
});
