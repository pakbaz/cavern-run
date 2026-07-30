import { describe, expect, it } from 'vitest';

import { CAVE_HEIGHT, CAVE_WIDTH, PALETTES } from '../../config';
import { Tile } from '../engine/tiles';
import { buildCave, parseCaveMap, validateCave } from './caveFormat';
import { CAVES, CAVE_COUNT, caveAt } from './index';

describe('the campaign', () => {
  it('ships exactly twenty caves, lettered A through T', () => {
    expect(CAVE_COUNT).toBe(20);
    expect(CAVES.map((cave) => cave.letter).join('')).toBe('ABCDEFGHIJKLMNOPQRST');
  });

  it('gives every cave a unique id and a real palette', () => {
    const ids = new Set(CAVES.map((cave) => cave.id));
    expect(ids.size).toBe(CAVES.length);
    for (const cave of CAVES) {
      expect(PALETTES[cave.paletteId], `${cave.id} palette`).toBeDefined();
      expect(cave.name.length).toBeGreaterThan(0);
      expect(cave.hint.length).toBeGreaterThan(0);
    }
  });

  it('clamps out-of-range lookups instead of throwing', () => {
    expect(caveAt(-5)).toBe(CAVES[0]);
    expect(caveAt(999)).toBe(CAVES[CAVES.length - 1]);
    expect(caveAt(3)).toBe(CAVES[3]);
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

  it('ramps difficulty: later caves are faster and want more diamonds', () => {
    const first = CAVES.slice(0, 5);
    const last = CAVES.slice(-5);

    const avg = (list: readonly number[]) => list.reduce((a, b) => a + b, 0) / list.length;

    expect(avg(last.map((c) => c.diamondsRequired))).toBeGreaterThan(
      avg(first.map((c) => c.diamondsRequired)),
    );
    expect(avg(last.map((c) => c.tickHz))).toBeGreaterThan(avg(first.map((c) => c.tickHz)));
    expect(avg(last.map((c) => c.diamondValue))).toBeGreaterThan(
      avg(first.map((c) => c.diamondValue)),
    );
  });

  it('introduces mechanics gradually', () => {
    const usesChar = (index: number, char: string) =>
      CAVES[index].map.some((row) => row.includes(char));

    // No creatures, growth or trickery in the opening caves.
    for (let i = 0; i < 4; i += 1) {
      for (const char of ['f', 'F', 'b', 'B', 'a', 'M', 'S', 'H', 'V', 'X']) {
        expect(usesChar(i, char), `cave ${CAVES[i].letter} must not use '${char}'`).toBe(false);
      }
    }

    // ...and the finale pulls everything together.
    const finale = CAVES[CAVES.length - 1];
    for (const char of ['a', 'M', 'S', 'b', 'f']) {
      expect(finale.map.some((row) => row.includes(char)), `finale uses '${char}'`).toBe(true);
    }
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
