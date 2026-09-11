import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

/** Guards: sparse earth surrounds small, differently shaped patrol posts. */
export const caveF: CaveSpec = {
  ...stageDefaults(5),
  paletteId: 'ember',
  hint: 'A guard follows its left-hand wall. Take a diamond without opening its escape.',
  objective: 'Approach four guarded diamonds from safe dirt and leave the patrols alive.',
  mechanics: ['digging', 'fireflies'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W.P....................................W',
    'W......................................W',
    'W.............................r........W',
    'W.....d..............d.................W',
    'W....www............ww.................W',
    'W....  f ...........  F ...............W',
    'W....    ........... w  .......d.......W',
    'W.............................ww.......W',
    'W............................ F .......W',
    'W...........r................   .......W',
    'W......................................W',
    'W.........d............................W',
    'W........ww..........d.................W',
    'W.......  f .........www...............W',
    'W....... w  .........   f .............W',
    'W...................     .......d......W',
    'W..............................www.....W',
    'W.............................. F .....W',
    'W......................................W',
    'W....................................E.W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
