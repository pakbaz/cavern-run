import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

export const caveK: CaveSpec = {
  ...stageDefaults(10),
  paletteId: 'amethyst',
  hint: 'The canopy is rich but unstable. Harvest sideways before entering the patrol voids.',
  objective: 'Gather seventy-five gems from the loaded canopy and its falling seams.',
  mechanics: ['gravity', 'digging', 'fireflies'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W..rrddrddrrddrddrrddrddrrddrddrrddrr..W',
    'W.Pdddddddddddddddddddddddddddddddddd..W',
    'W..rrddrrddrrddrrddrrddrrddrrddrrddrr..W',
    'W..dddddddddddddddddddddddddddddddddd..W',
    'W..rddrrddrddrrddrddrrddrddrrddrddrrr..W',
    'W..dddddddddddddddddddddddddddddddddd..W',
    'W......................................W',
    'W...wwwww...wwwww....wwwww...wwwwww....W',
    'W...w           w.rr.w            w....W',
    'W...w   f       w.dd.w      F     w....W',
    'W...w           w.rr.w            w....W',
    'W...w           w.dd.w            w....W',
    'W...w           w.rr.w            w....W',
    'W...w           w....w            w....W',
    'W...w           w.dd.w            w....W',
    'W...w                             w....W',
    'W...w           w....w            w....W',
    'W...wwwwwwwwwwwww....wwwwwwwwwwwwww....W',
    'W..rr..rr..rr..rr..rr..rr..rr..rr......W',
    'W...................................E..W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
