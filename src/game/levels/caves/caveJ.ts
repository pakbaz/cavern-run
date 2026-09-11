import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

export const caveJ: CaveSpec = {
  ...stageDefaults(9),
  paletteId: 'glacier',
  hint: 'Take each diagonal seam from the side before dropping to the next step.',
  objective: 'Collect sixteen gems along the sloping rock-and-diamond staircase.',
  mechanics: ['digging', 'gravity'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWW.................W',
    'WWPr.r...............W.................W',
    'WW.dddd..............W.................W',
    'WW.wwwr.r............W.................W',
    'WW....dddd...........W.................W',
    'WW....wwwr.r.........W.................W',
    'WW.......dddd........W.................W',
    'WW.......wwwr.r......W.................W',
    'WW..........dddd.....W.................W',
    'WW..........wwww.....W.................W',
    'WW.................E.W.................W',
    'WW...................W.................W',
    'WWWWWWWWWWWWWWWWWWWWWW.................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'W......................................W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
