import { describe, expect, it } from 'vitest';

import readme from '../README.md?raw';
import { CAVES } from './game/levels';

/**
 * The README documents every cave's quota and clock. Those numbers get retuned
 * far more often than anyone remembers to edit prose, so the table is checked
 * against the actual specs rather than trusted.
 */

interface Row {
  readonly letter: string;
  readonly name: string;
  readonly gems: number;
  readonly time: number;
}

/**
 * Pulls the cave rows out of the README's two-column markdown table. Each row
 * holds two caves, so a single line yields two entries.
 */
function documentedCaves(): Row[] {
  const rows: Row[] = [];
  for (const line of readme.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    // A table row splits into a leading and trailing empty cell either side of
    // the eight real ones.
    if (cells.length !== 10) continue;
    for (const [letter, name, gems, time] of [cells.slice(1, 5), cells.slice(5, 9)]) {
      if (!/^[A-T]$/.test(letter)) continue;
      rows.push({ letter, name, gems: Number(gems), time: Number(time) });
    }
  }
  return rows;
}

describe('the README', () => {
  const documented = documentedCaves();

  it('lists every cave in the campaign', () => {
    expect(documented.map((row) => row.letter).sort().join('')).toBe(
      CAVES.map((cave) => cave.letter).join(''),
    );
  });

  it.each(CAVES.map((cave) => [cave.letter, cave] as const))(
    'quotes cave %s correctly',
    (letter, cave) => {
      const row = documented.find((candidate) => candidate.letter === letter);
      expect(row, `cave ${letter} is missing from the README table`).toBeDefined();
      expect(row?.name).toBe(cave.name);
      expect(row?.gems).toBe(cave.diamondsRequired);
      expect(row?.time).toBe(cave.timeLimit);
    },
  );
});
