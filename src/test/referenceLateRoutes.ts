import type { PlayerInput } from '../game/engine/simTypes';
import { Dir } from '../game/engine/tiles';

// Uppercase walks, lowercase grabs, and dots wait for birth, gravity or a patrol.
function route(commands: string): readonly PlayerInput[] {
  return [...commands.replace(/\s/g, '')].map((key): PlayerInput => {
    if (key === '.') return { dir: null, grab: false };
    let direction: PlayerInput['dir'];
    switch (key.toUpperCase()) {
      case 'U': direction = Dir.Up; break;
      case 'R': direction = Dir.Right; break;
      case 'D': direction = Dir.Down; break;
      case 'L': direction = Dir.Left; break;
      default: throw new Error(`Invalid route command: ${key}`);
    }
    return { dir: direction, grab: key === key.toLowerCase() };
  });
}

/** Complete standard-seed witnesses; every entry includes the twelve birth scans. */
export const referenceLateRoutes: Readonly<Record<string, readonly PlayerInput[]>> = {
  // Time the moving butterfly, harvest from the side, then take the outside cross-cut.
  caveM: route(
    '............LDDDDDR......rLUrUUrURDRDRDDDDRUlRDRDDLLLLUUUU' +
    'LDDDDL' + 'D'.repeat(10) + 'R'.repeat(35),
  ),
  // Close the vent before mining the seam; reopen only after crystallisation.
  caveP: route(
    '............RRRLLLLLLDDDDRRRRRRRRRRRRRRRRRRRRRRRRRRD' +
    'LLLLLLLLLLLLLLLLLLLLLLLLLLLULLLLURUURRURRRRRRRRRUUUR' +
    'UUUUUUUDRDRRUUURUURRRRRRRRRRRRDDRDDDRDDDDRDDDRDDDDDD',
  ),
  // Sixteen contiguous feeds take 48 scans, leaving slack in the 72-scan charge.
  caveR: route(
    '............' + 'r.R'.repeat(16) + 'RRDDDDDDDLLLLLLLLLLU' +
    'URRRRRURURUR' +
    'LDLDLDLLLLLLLLLULRRDDD' + 'R'.repeat(19) + 'D',
  ),
  // The three final single-scan waits align crossings with the moving guard row.
  caveS: route(
    '............RDDDDDDRRrURDrURDrURDrURRRDRRUURRRrURDrURDrURDrURRRRDRRRDDDDRRrURDrURDrURDr' +
    'LLLLLLDLLLLLLLLURRRRRRDRRURRRRRRRRRRRDDDDDLLLLLLLRDDR' +
    'L'.repeat(21) + 'UURUULLLLLRRRRRDD LDD' +
    'RRRRRRR.RRRRRRR.RRRRRRR.RRRRRRDDD',
  ),
};
