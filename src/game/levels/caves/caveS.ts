import type { CaveSpec } from '../caveFormat';
import { stageDefaults } from '../stageProfiles';

export const caveS: CaveSpec = {
  ...stageDefaults(18),
  paletteId: 'ember',
  hint: 'Three offset boxes share one charge. Release their roofs before returning for the gems.',
  objective: 'Operate the staggered magic chambers, then avoid the moving guard row on the way out.',
  mechanics: ['gravity', 'magic-wall', 'fireflies'],
  map: [
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'W.r....r...r...r....r...r...r....r...r.W',
    'W.P.r....r...r...r....r...r...r....r...W',
    'W.r...r....r...wwwwwwwwww...r...r....r.W',
    'W...r...r....r.w........w.r...r...r....W',
    'W.r.wwwwwwwww..w.rrrr...w...r...r...r..W',
    'W...w.......w.................r...r....W',
    'W...w.rrrr..w.rwMMMMMMMMw..wwwwwwwwwr..W',
    'W..............w        wr.w.......w...W',
    'W...wMMMMMMMw.rw        w..w.rrrr..wr..W',
    'W..rw       w..w        w..............W',
    'W...w       w.rw        ...wMMMMMMMw...W',
    'W..rw       w..wwwwwwww.w..w       w.r.W',
    'W...w       .r....r...r...rw       w...W',
    'W.r.wwwwwww.w..r....r...r..w       w.r.W',
    'W...r....r...r...r....r...rw       ....W',
    'W.r...r....r...r...r....r..www.wwwww.r.W',
    'W......................................W',
    'W..   f      f      f      f      f  ..W',
    'W..                                  ..W',
    'W....................................E.W',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
};
