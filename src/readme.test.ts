import { describe, expect, it } from 'vitest';
import readme from '../README.md?raw';
import { CAVES } from './game/levels';
import { stageLabel } from './game/levels/caveFormat';

function documentedStages() {
  return readme.split('\n').flatMap((line) => {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length !== 8 || !/^\d+$/.test(cells[1])) return [];
    return [{
      screen: Number(cells[1]), name: cells[2],
      gems: Number(cells[3]), time: Number(cells[4]),
      value: Number(cells[5]), bonus: Number(cells[6]),
    }];
  });
}

describe('the README stage table', () => {
  const rows = documentedStages();
  it('lists every screen in its own reference order', () => {
    expect(rows.map((row) => row.screen)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it.each(CAVES.map((cave, index) => [index + 1, cave] as const))(
    'documents screen %i and all its numeric settings',
    (screen, cave) => {
      expect(rows.find((row) => row.screen === screen)).toEqual({
        screen,
        name: cave.stageKind === 'intermission' ? cave.name : `${stageLabel(cave, true)}: ${cave.name}`,
        gems: cave.diamondsRequired,
        time: cave.timeLimit,
        value: cave.diamondValue,
        bonus: cave.extraDiamondValue,
      });
    },
  );
});
