import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

/** Butterflies: open dirt and five moving pockets, with no masonry maze. */
export const caveD: CaveSpec = {
  ...stageDefaults(3),
  paletteId: 'ember',
  hint: 'Watch a butterfly turn, pull its roof support from the side, then retreat.',
  objective: 'Crush moving butterflies and collect thirty-six of their diamonds.',
  mechanics: ['digging', 'gravity', 'butterflies'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W.P......r.....r........r..............W',
    'W....r....r......................r.....W',
    'W.....r.........r...........r..........W',
    'W...................r.....r........r...W',
    'W.....   ..............................W',
    'W..... b .................   ..........W',
    'W.....   ................. B ..........W',
    'W.............r...........   ..........W',
    'W...r........r....................r....W',
    'W.................r....................W',
    'W..........r...........................W',
    'W.................    .................W',
    'W..r.............. b  ..........r......W',
    'W........r........    .................W',
    'W....r.....................r....r......W',
    'W........   ...........................W',
    'W........ B ...............   .........W',
    'W........   ............... b .........W',
    'W..r...........r...........   .........W',
    'W......r.............r...............E.W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
