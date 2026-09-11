import type { PlayerInput } from '../game/engine/simTypes';
import { Dir } from '../game/engine/tiles';

const commands: Readonly<Record<string, PlayerInput>> = {
  U: { dir: Dir.Up, grab: false },
  R: { dir: Dir.Right, grab: false },
  D: { dir: Dir.Down, grab: false },
  L: { dir: Dir.Left, grab: false },
  u: { dir: Dir.Up, grab: true },
  r: { dir: Dir.Right, grab: true },
  d: { dir: Dir.Down, grab: true },
  l: { dir: Dir.Left, grab: true },
  '.': { dir: null, grab: false },
};

function inputs(sequence: string): readonly PlayerInput[] {
  return [...sequence].filter((char) => !/\s/.test(char)).map((char) => {
    const input = commands[char];
    if (input === undefined) throw new Error(`Unknown route command: ${char}`);
    return input;
  });
}

export const referenceEarlyRoutes: Readonly<Record<string, readonly PlayerInput[]>> = {
  // Timed side releases followed by collection and escape, all on the standard seed.
  caveD: inputs(
    '............DDDRRR.rLRRRRRRRRRRRDRRDDDDDDrLUUUUURRRRRURRRRDDDRDDDDDDDD.r' +
    'LLLLLLLLLUDLULDLULDLULDLLLUUUUUUUUULULULDDRDDRRRRRRDRRRRRDDRDRDRDLLUUL' +
    'DDDRRRRRRRRRDRDRDRDLLULULURRRRURRrDrDrDrDrLUUUUUURrUUUURRrDrDrDrDrDr' +
    'DrDrDrDrDrURUUUUUUUUUUUUUUrDrDrDrDrDrDrDrDrDrDrDrDrDrDrLUUUURRDDRDDDlU' +
    'RUUUUUUUUUUUUUUULLULlDlDlDlDlDlDlRUUULLLULLULlDlDULL.RRDDDLULDDDDDDDDD' +
    'DDLDRDRURRRRRRRRRD',
  ),
  // The 77 stationary scans end on crystallisation; opening the lower rim early
  // releases the colony into the lower field instead of producing diamonds.
  caveH: inputs(
    '............RRRLLDDDD' + '.'.repeat(77) +
    'RRRRRDRRRRRUUUUUUURDRRDRDRLDLLLLDDDRRRDRRDRRDRRRDRRRDRRDR',
  ),
};
